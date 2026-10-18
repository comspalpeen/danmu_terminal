# message_handler.py
import time
import logging
import orjson
from protobuf import douyin_pb2
from src.db.redis_client import get_redis
from src.utils.fetcher_utils import get_safe_url
from src.utils.fetcher_utils import extract_user_info
import re
import asyncio
from src.utils.feishu_notifier import FeishuNotifier
from config import TARGET_ANCHOR_ID
logger = logging.getLogger("MsgHandler")
GUARD_PRICE_MONTH = 1280
GUARD_PRICE_YEAR = 15360
STAR_GUARD_ICON = "https://p3-webcast.douyinpic.com/img/webcast/4e545aebe35e35808b91cc2d93587967.png~tplv-obj.image"

class MessageHandler:
    def __init__(self, room_id, db, gift_processor, anchor_id=None):
        self.room_id = room_id
        self.db = db
        self.gift_processor = gift_processor
        self.notifier = FeishuNotifier()  # 初始化一次复用
        self.last_seq_state = None
        self.last_seq_time = 0
        
        # ====== 核心主键配置 ======
        self.anchor_id = str(anchor_id or "")
        self.target_anchor_id = TARGET_ANCHOR_ID
        # ==========================
        
        self.vip_users_cache = {}

        # PK runtime state
        self.left_team_id = None
        self.right_team_id = None
        self.current_battle_id = None
        
    async def _reset_pk_state(self):
        """清理运行时的 PK 状态，并在 Redis 中销毁开始锁"""
        self.left_team_id = None
        self.right_team_id = None
        self.current_battle_id = None
        self.pk_start_info = None
        
        try:
            redis_client = get_redis()
            await redis_client.delete(f"pk:start:info:{self.room_id}")
            await redis_client.delete(f"pk:live:{self.room_id}")
        except Exception as e:
            logger.warning(f"[PK] 清除 Redis 状态失败: {e}")

    def _normalize_battle_id(self, battle_id, channel_id):
        battle_id = str(battle_id or "")
        channel_id = str(channel_id or "")
        return battle_id or channel_id

    def _order_two_teams(self, teams):
        if len(teams) != 2:
            return teams

        if self.left_team_id is None:
            self.left_team_id = teams[0]["team_id"]
            self.right_team_id = teams[1]["team_id"]
            return teams

        team_map = {team["team_id"]: team for team in teams}
        left_team = team_map.get(self.left_team_id)
        right_team = team_map.get(self.right_team_id)
        if left_team and right_team:
            return [left_team, right_team]

        logger.warning(
            f"[PK] 阵营锁与当前包不一致，重新锁定 room={self.room_id} battle_id={self.current_battle_id}"
        )
        self.left_team_id = teams[0]["team_id"]
        self.right_team_id = teams[1]["team_id"]
        return teams

    async def handle(self, method, payload):
        if method in ("WebcastSocialMessage",
                      "WebcastRoomMessage",
                      "WebcastEmojiChatMessage"):
            # 只有专属主播直播间，才处理上述类型的进房/互动消息
            if self.anchor_id != self.target_anchor_id:
                return False
        try:
            if method == "WebcastChatMessage":
                await self._parse_chat(payload)
            elif method == "WebcastGiftMessage":
                await self._parse_gift(payload)
            elif method == "WebcastRoomUserSeqMessage":
                await self._parse_user_seq(payload)
            elif method == "WebcastLikeMessage":
                await self._parse_like(payload)
            elif method == "WebcastControlMessage":
                return await self._parse_control(payload)
            elif method == "WebcastScreenChatMessage":
                await self._parse_screen_chat(payload)
            elif method == "WebcastPrivilegeScreenChatMessage":
                await self._parse_privilege_screen_chat(payload)
            elif method == "WebcastMemberMessage":
                await self._parse_member(payload)
            elif method == "WebcastFansclubMessage":
                await self._parse_fansclub(payload)
            elif method == "WebcastSocialMessage":
                await self._parse_social(payload)
            elif method == "WebcastRoomMessage":
                await self._parse_room_message(payload)
            elif method == "WebcastEmojiChatMessage":
                await self._parse_emojichat(payload)
            elif method == "WebcastLinkMicMethod":
                await self._parse_pk_process(payload)
            elif method == "WebcastLinkMicBattleFinishMethod":
                await self._parse_pk_finish(payload)
            elif method == 'WebcastLinkMicBattleMethod':
                await self._parse_pk_start(payload) 
            
        except Exception as e:
            logger.error(f"消息分发解析异常 [{method}]: {e}", exc_info=True)
        return False

    async def _parse_control(self, payload):
        try:
            message = douyin_pb2.ControlMessage()
            message.ParseFromString(payload)
            if message.status == 3:
                logger.info(f"[Control] 收到下播信号 room={self.room_id}")
                if self.db and self.room_id:
                    await self.db.set_room_ended(self.room_id)
                return True
        except Exception as e:
            logger.error(f"解析 Control 异常: {e}", exc_info=True)
        return False

    async def _parse_chat(self, payload):
        try:
            message = douyin_pb2.ChatMessage()
            message.ParseFromString(payload)
    
            user_info = extract_user_info(message.user, self.anchor_id)
            event_ts = message.eventTime
            event_time_val = event_ts if event_ts > 0 else time.time()
    
            chat_data = {
                "anchor_id": self.anchor_id, # 核心主键
                "room_id": self.room_id,
                "content": message.content,
                "event_time": event_time_val,
                "created_at": time.time(),
                "_msg_type": "chat"  
            }
            chat_data.update(user_info)
    
            # ✅ 核心拦截：只把被脱敏的匿名/神秘人弹幕扔入解析器走缓存
            if chat_data.get('is_mystery') and chat_data.get('user_id') == '111111':
                if self.gift_processor and hasattr(self.gift_processor, 'mystery_resolver'):
                    await self.gift_processor.mystery_resolver.add_task(chat_data)
                    return
    
            # 常规用户或资料完整的普通神秘人，直接入库
            if self.db:
                await self.db.insert_chat(chat_data)
        except Exception as e:
            logger.error(f"解析弹幕异常: {e}", exc_info=True)

    async def _parse_gift(self, payload):
        try:
            message = douyin_pb2.GiftMessage()
            message.ParseFromString(payload)
            gift = message.gift

            user_info = extract_user_info(message.user, self.anchor_id)

            # 默认取表层属性 (底座外壳)
            gift_name = gift.name
            gift_icon_url = get_safe_url(gift.icon)

            if message.HasField("common") and message.common.HasField("displayText"):
                extracted_name = ""
                extracted_icon = ""
                
                for piece in message.common.displayText.piecesList:
                    if piece.type == 1 and piece.stringValue:
                        val = piece.stringValue.strip()
                        if val and not val.startswith("x") and not val.startswith("X"):
                            extracted_name = val
                    
                    elif piece.type == 15 and piece.HasField("imageValue"):
                        extracted_icon = get_safe_url(piece.imageValue.image)
                
                if extracted_name and extracted_name != gift_name:
                    logger.debug(f"[GiftSkin] 触发脱壳: {gift_name} -> {extracted_name}")
                    gift_name = extracted_name
                    if extracted_icon:
                        gift_icon_url = extracted_icon

            repeat_count = message.repeatCount
            combo_count = message.comboCount
            group_count = message.groupCount
            diamond_count = gift.diamondCount
            
            if repeat_count > 0:
                combo_count = repeat_count
                group_count = 1

            send_time_ms = message.sendTime if message.sendTime > 0 else int(time.time() * 1000)
            to_user_id = str(self.anchor_id)
    
            if message.HasField("toUser") and message.toUser.id:
                to_user_id = str(message.toUser.id)

            target_uid = self.target_anchor_id
            if to_user_id == target_uid and str(self.anchor_id) != target_uid:
                asyncio.create_task(
                    self.notifier.check_guest_mic_and_notify(
                        target_uid=target_uid, 
                        current_room_id=self.room_id,
                        target_name="目标主播"
                    )
                )
            gift_data = {
                "anchor_id": self.anchor_id,
                "room_id": self.room_id,
                "to_user_id": to_user_id,
                "gift_icon_url": gift_icon_url,  
                "gift_id": str(gift.id),
                "gift_name": gift_name,          
                "diamond_count": diamond_count,
                "combo_count": combo_count,
                "group_count": group_count,
                "repeat_count": repeat_count,
                "group_id": str(message.groupId),
                "repeat_end": message.repeatEnd,
                "trace_id": message.traceId,
                "send_time": send_time_ms / 1000.0,
                "created_at": time.time(),
            }
            gift_data.update(user_info)

            if self.gift_processor:
                await self.gift_processor.process_gift(gift_data)
        except Exception as e:
            logger.error(f"解析礼物异常: {e}", exc_info=True)

    async def _parse_screen_chat(self, payload):
        try:
            msg = douyin_pb2.ScreenChatMessage()
            msg.ParseFromString(payload)
            if not msg.HasField("user") or not msg.content:
                return

            user_info = extract_user_info(msg.user, self.anchor_id)
            chat_data = {
                "anchor_id": self.anchor_id,
                "room_id": str(self.room_id),
                "content": f"[房管飘屏] {msg.content}",
                "event_time": time.time(),
                "created_at": time.time(),
            }
            chat_data.update(user_info)

            if self.db:
                await self.db.insert_chat(chat_data)
        except Exception as e:
            logger.error(f"解析房管飘屏异常: {e}", exc_info=True)

    async def _parse_privilege_screen_chat(self, payload):
        try:
            msg = douyin_pb2.WebcastPrivilegeScreenChatMessage()
            msg.ParseFromString(payload)
            if not msg.HasField("user") or not msg.content:
                return

            user_info = extract_user_info(msg.user, self.anchor_id)
            chat_data = {
                "anchor_id": self.anchor_id,
                "room_id": str(self.room_id),
                "content": f"[特权飘屏] {msg.content}",
                "event_time": time.time(),
                "created_at": time.time(),
            }
            chat_data.update(user_info)

            if self.db:
                await self.db.insert_chat(chat_data)
        except Exception as e:
            logger.error(f"解析特权飘屏异常: {e}", exc_info=True)

    async def _parse_user_seq(self, payload):
        now = time.time()
        time_diff = now - self.last_seq_time if self.last_seq_time > 0 else 0
        self.last_seq_time = now

        try:
            message = douyin_pb2.RoomUserSeqMessage()
            message.ParseFromString(payload)
            stats = {"user_count": message.total, "total_user": message.totalUser}
            inc_data = {}
            if self.last_seq_state:
                last_online = self.last_seq_state['online']
                current_online = message.total
                avg_online = (last_online + current_online) / 2
                inc_data = {"total_watch_time_sec": avg_online * time_diff}
            self.last_seq_state = {"online": message.total, "total": message.totalUser, "time": now}

            if self.db and self.room_id:
                await self.db.update_room_stats(self.room_id, stats)
                if inc_data:
                    await self.db.increment_room_stats(self.room_id, inc_data)
        except Exception as e:
            logger.error(f"解析 UserSeq 异常: {e}", exc_info=True)
            
    async def _parse_like(self, payload):
        try:
            message = douyin_pb2.LikeMessage()
            message.ParseFromString(payload)

            if message.HasField("user"):
                user_info = extract_user_info(message.user, self.anchor_id)
                await self._check_and_save_vip(user_info)

            if self.db and self.room_id:
                await self.db.update_room_stats(self.room_id, {"like_count": message.total})
        except Exception as e:
            logger.error(f"解析点赞异常: {e}", exc_info=True)

    async def _parse_pk_process(self, payload):
        try:
            message = douyin_pb2.LinkMicMethod()
            message.ParseFromString(payload)
            if not message.user_scores:
                return

            battle_id = self._normalize_battle_id(
                getattr(message, "battle_id", 0),
                getattr(message, "channel_id", 0),
            )
            channel_id = str(getattr(message, "channel_id", 0) or "")
            if not battle_id:
                return
            redis_client = get_redis()
            raw_start_info = await redis_client.get(f"pk:start:info:{self.room_id}")
            
            if not raw_start_info:
                return
            
            self.pk_start_info = orjson.loads(raw_start_info)

            if self.current_battle_id != battle_id:
                self.current_battle_id = battle_id

            team_map = {}
            team_order = []

            for s in message.user_scores:
                uid = str(s.user_id)
                team_rank = int(getattr(s, "multi_pk_team_rank", 0) or 0)
                team_id = str(team_rank) if team_rank > 0 else uid
                member_score = int(getattr(s, "score", 0) or 0)
                team_score_from_msg = int(getattr(s, "multi_pk_team_score", 0) or 0)

                if team_id not in team_map:
                    team_map[team_id] = {
                        "team_id": team_id,
                        "team_score": 0, 
                        "anchors": [],
                    }
                    team_order.append(team_id)

                if team_rank > 0:
                    team_map[team_id]["team_score"] = max(team_map[team_id]["team_score"], team_score_from_msg)
                else:
                    team_map[team_id]["team_score"] += member_score
                raw_cached = await redis_client.hget("pk:anchor:cache", uid)
                if raw_cached:
                    cached_info = orjson.loads(raw_cached)
                    nickname = cached_info.get("nickname")
                    avatar = cached_info.get("avatar")
                else:
                    nickname = f"用户_{uid[-4:]}"
                    avatar = ""

                team_map[team_id]["anchors"].append({
                    "user_id": uid,
                    "nickname": nickname,
                    "avatar": avatar,
                    "score": member_score
                })

            teams = [team_map[tid] for tid in team_order]
            teams = self._order_two_teams(teams)

            await self._broadcast_snapshot(battle_id, channel_id, teams)
        except Exception as e:
            logger.error(f"❌ [PK 解析错误] 过程包异常: {e}", exc_info=True)

    async def _parse_pk_finish(self, payload):
        try:
            message = douyin_pb2.LinkMicBattleFinishMethod()
            message.ParseFromString(payload)

            await self._reset_pk_state()

            try:
                await get_redis().delete(f"pk:live:{self.room_id}")
            except Exception as redis_e:
                logger.warning(f"[PK] 清理 Redis 实时状态失败 room={self.room_id}: {redis_e}")

            status = int(getattr(message.info, "status", 0) or 0)
            if status != 2:
                return

            battle_id = str(getattr(message.info, "battle_id", 0) or "")
            channel_id = str(getattr(message.info, "channel_id", 0) or "")
            duration = int(getattr(message.info, "duration", 0) or 0)
            start_time_ms = int(getattr(message.info, "start_time_ms", 0) or 0)
            start_time_val = start_time_ms / 1000.0 if start_time_ms > 0 else time.time()

            scores_map = {}
            has_valid_win_status = False
            
            for score_item in message.scores:
                uid = str(score_item.user_id)
                win_status = int(getattr(score_item, "win_status", 0) or 0)
                
                if win_status in [1, 2]: 
                    has_valid_win_status = True
                    
                scores_map[uid] = {
                    "score": int(getattr(score_item, "score", 0) or 0),
                    "rank": int(getattr(score_item, "rank", 0) or 0),
                    "win_status": win_status,
                }

            contrib_map = {}
            for c_group in message.contributors:
                anchor_id = str(c_group.anchor_id_str or c_group.anchor_id)
                top_list = []
                for item in c_group.list[:3]:
                    top_list.append({
                        "user_id": str(item.id),
                        "nickname": item.nickname,
                        "avatar": get_safe_url(item.avatar),
                        "score": int(getattr(item, "score", 0) or 0),
                        "rank": int(getattr(item, "rank", 0) or 0),
                    })
                contrib_map[anchor_id] = top_list

            total_anchors = sum(len(army.list) for army in message.anchors)

            mode_type = "team_battle" if (has_valid_win_status or total_anchors == 2) else "free_for_all"

            teams_map = {}
            for army in message.anchors:
                for anchor_item in army.list:
                    try:
                        if not anchor_item.HasField('user'): continue
                        uid = str(anchor_item.user.id)
                        if not uid or uid == "0": continue
                    except Exception:
                        continue

                    score_info = scores_map.get(uid, {})
                    
                    anchor_data = {
                        "user_id": uid,
                        "nickname": anchor_item.user.nickname,
                        "avatar": get_safe_url(anchor_item.user.avatar_thumb),
                        "score": score_info.get("score", 0),
                        "rank": score_info.get("rank", 0),
                        "contributors": contrib_map.get(uid, [])
                    }
                    team_id = str(score_info.get("win_status", 0)) if has_valid_win_status else uid

                    if team_id not in teams_map:
                        teams_map[team_id] = {
                            "team_id": team_id, 
                            "win_status": score_info.get("win_status", 0), 
                            "anchors": []
                        }
                    
                    teams_map[team_id]["anchors"].append(anchor_data)

            final_teams = list(teams_map.values())
            
            if mode_type == "free_for_all":
                final_teams.sort(key=lambda t: t["anchors"][0]["rank"] if t["anchors"] else 999)

            pk_result = {
                "battle_id": battle_id,
                "room_id": self.room_id,
                "channel_id": channel_id,
                "start_time": start_time_val,
                "duration": duration,
                "mode": mode_type,
                "status": status,
                "created_at": time.time(),
                "teams": final_teams,
            }

            if self.db:
                await self.db.save_pk_result(pk_result)
            try:
                final_snapshot = {
                    "battle_id": battle_id,
                    "channel_id": channel_id,
                    "room_id": str(self.room_id),
                    "mode": mode_type,
                    "status": 2, 
                    "teams": final_teams,
                    "start_info": getattr(self, "pk_start_info", None), 
                    "updated_at": int(time.time() * 1000),
                }
                redis_client = get_redis()
                await redis_client.publish("pk:live:updates", orjson.dumps(final_snapshot).decode("utf-8"))
            except Exception as broadcast_e:
                logger.error(f"发送 PK 结束谢幕包失败: {broadcast_e}")

            await self._reset_pk_state()
            try:
                await get_redis().delete(f"pk:live:{self.room_id}")
            except Exception as redis_e:
                pass
        except Exception as e:
            logger.error(f"解析 PK 结算包异常: {e}", exc_info=True)
            
    async def _check_and_save_vip(self, user_info):
        if self.anchor_id != self.target_anchor_id:
            return
        fans_level = user_info.get("fans_club_level", 0)
        if fans_level >= 1:
            uid = user_info.get("user_id")
            now = time.time()
            last_record_time = self.vip_users_cache.get(uid, 0)
            if now - last_record_time > 300:
                self.vip_users_cache[uid] = now
                if self.db:
                    await self.db.upsert_vip_user(user_info, self.anchor_id)

    async def _parse_member(self, payload):
        try:
            message = douyin_pb2.MemberMessage()
            message.ParseFromString(payload)
            
            if message.HasField("user"):
                user_obj = message.user
                
                is_mystery = getattr(user_obj, "mystery_man", 0) == 2
                is_target_anchor = (self.anchor_id == self.target_anchor_id)
                
                if not is_mystery and not is_target_anchor:
                    return
                
                if is_mystery:
                    real_uid = str(user_obj.id)
                    real_sec_uid = getattr(user_obj, "secUid", "")
                    real_display_id = getattr(user_obj, "displayId", "")
                    
                    is_dou_user = False
                    if user_obj.id == 111111:
                        is_dou_user = bool(re.match(r'^dou\d{7}$', user_obj.nickName, re.IGNORECASE))
                        
                        try:
                            if message.HasField("enterEffectConfig") and message.enterEffectConfig.HasField("text"):
                                for piece in message.enterEffectConfig.text.piecesList:
                                    if piece.HasField("userValue") and piece.userValue.HasField("user"):
                                        real_user = piece.userValue.user
                                        if real_user.id and real_user.id != 111111:
                                            real_uid = str(real_user.id)
                                            real_sec_uid = getattr(real_user, "secUid", "")
                                            real_display_id = getattr(real_user, "displayId", "")
                                            
                                            user_obj.id = real_user.id
                                            user_obj.secUid = real_sec_uid
                                            user_obj.displayId = real_display_id
                                            break
                        except Exception as e:
                            logger.warning(f"[Member] 尝试还原双开隐身用户真实ID失败: {e}")
    
                    if real_uid and real_uid != "111111":
                        webcast_uid = getattr(user_obj, "webcastUid", "")
                        
                        temp_info = extract_user_info(user_obj, self.anchor_id)
                        user_name = temp_info.get('user_name', '')
                        pay_grade = temp_info.get('pay_grade', 0)
    
                        resolved_info = {
                            'id': real_uid,
                            'sec_uid': real_sec_uid,
                            'display_id': real_display_id
                        }
                        
                        redis_client = get_redis()
                        pipe = redis_client.pipeline()
                        
                        if webcast_uid:
                            pipe.setex(f"mystery:uid:{webcast_uid}", 21600, orjson.dumps(resolved_info))
                            
                        if is_dou_user and pay_grade > 0:
                            combo_key = f"mystery:combo:{user_name}:{pay_grade}"
                            pipe.setex(combo_key, 86400 * 5, orjson.dumps(resolved_info))
                            
                        await pipe.execute()
    
                if is_target_anchor:
                    final_user_info = extract_user_info(user_obj, self.anchor_id)
                    await self._check_and_save_vip(final_user_info)
                
        except Exception as e:
            logger.error(f"解析 MemberMessage 异常: {e}", exc_info=True)
            
    async def _parse_fansclub(self, payload):
        try:
            message = douyin_pb2.FansclubMessage()
            message.ParseFromString(payload)
            
            action = int(getattr(message, "action", 0) or 0)
            is_target_anchor = (self.anchor_id == self.target_anchor_id)
            
            if not is_target_anchor and action != 7:
                return
                
            if not message.HasField("user"):
                return
                
            user_info = None

            if is_target_anchor:
                user_info = extract_user_info(message.user, self.anchor_id)
                await self._check_and_save_vip(user_info)
            
            if action == 7:
                uid = str(message.user.id)
                
                try:
                    fans_data = message.user.FansClub.data
                    anchor_id = str(getattr(fans_data, "anchorId", getattr(message, "anchorId", "0")))
                    guard_expired_time = int(getattr(fans_data, "guardExpiredTime", getattr(message, "guardExpiredTime", 0)))
                except Exception:
                    anchor_id, guard_expired_time = "0", 0

                if anchor_id and anchor_id != "0" and guard_expired_time > 0:
                    is_valid, gift_name, diamond_count, icon_url = await self._resolve_star_guard(
                        uid, anchor_id, guard_expired_time
                    )
                    
                    if is_valid and self.gift_processor:
                        if user_info is None:
                            user_info = extract_user_info(message.user, self.anchor_id)
                            
                        gift_data = {
                            "anchor_id": self.anchor_id,
                            "room_id": self.room_id,
                            "to_user_id": self.anchor_id,
                            "gift_icon_url": icon_url,
                            "gift_id": "star_guard_action", 
                            "gift_name": gift_name,
                            "diamond_count": diamond_count,
                            "combo_count": 1,
                            "group_count": 1,
                            "repeat_count": 0,
                            "group_id": f"guard_{uid}_{guard_expired_time}",
                            "repeat_end": 1, 
                            "trace_id": f"guard_{uid}_{guard_expired_time}",
                            "send_time": time.time(),
                            "created_at": time.time(),
                        }
                        gift_data.update(user_info)
                        
                        await self.gift_processor.process_gift(gift_data)

        except Exception as e:
            logger.error(f"解析 FansclubMessage 异常: {e}", exc_info=True)

    async def _parse_social(self, payload):
        try:
            message = douyin_pb2.SocialMessage()
            message.ParseFromString(payload)
            if message.HasField("user"):
                user_info = extract_user_info(message.user, self.anchor_id)
                await self._check_and_save_vip(user_info)
        except Exception:
            pass
            
    async def _parse_room_message(self, payload):
        try:
            message = douyin_pb2.RoomMessage()
            message.ParseFromString(payload)
            if message.HasField("common") and message.common.HasField("displayText"):
                for piece in message.common.displayText.piecesList:
                    if piece.HasField("userValue") and piece.userValue.HasField("user"):
                        user_info = extract_user_info(piece.userValue.user, self.anchor_id)
                        await self._check_and_save_vip(user_info)

        except Exception as e:
            logger.error(f"解析 RoomMessage 异常: {e}", exc_info=True)
            
    async def _parse_emojichat(self, payload):
        try:
            message = douyin_pb2.EmojiChatMessage()
            message.ParseFromString(payload)
            if message.HasField("user"):
                user_info = extract_user_info(message.user, self.anchor_id)
                await self._check_and_save_vip(user_info)
        except Exception:
            pass
            
    async def _parse_pk_start(self, payload):
        try:
            message = douyin_pb2.LinkMicBattle()
            message.ParseFromString(payload)
            info = message.info
            redis_client = get_redis()
            
            start_data = {
                "start_time_ms": info.start_time_ms,
                "duration": info.duration,
                "battle_id": str(info.battle_id)
            }
            state_key = f"pk:start:info:{self.room_id}"
            await redis_client.set(state_key, orjson.dumps(start_data), ex=info.duration + 60)

            anchor_data = {}
            for army in message.anchors:
                for anchor_item in army.list:
                    if anchor_item.HasField('user'):
                        uid = str(anchor_item.user.id)
                        data = {
                            "nickname": anchor_item.user.nickname,
                            "avatar": get_safe_url(anchor_item.user.avatar_thumb)
                        }
                        anchor_data[uid] = orjson.dumps(data).decode('utf-8')

            if anchor_data:
                await redis_client.hset("pk:anchor:cache", mapping=anchor_data)
                await redis_client.expire("pk:anchor:cache", 86400)

            channel_id = str(getattr(message, "channel_id", getattr(info, "channel_id", "")))
            self.pk_start_info = start_data 
            await self._broadcast_snapshot(info.battle_id, channel_id, [])

        except Exception as e:
            logger.error(f"解析开始包异常: {e}", exc_info=True)
            
    async def _broadcast_snapshot(self, battle_id, channel_id, teams):
        try:
            mode_type = "free_for_all" if len(teams) > 2 else "team_battle"

            left_score = next((t["team_score"] for t in teams if t["team_id"] == self.left_team_id), 0) if self.left_team_id else 0
            right_score = next((t["team_score"] for t in teams if t["team_id"] == self.right_team_id), 0) if self.right_team_id else 0

            snapshot = {
                "battle_id": str(battle_id),
                "channel_id": str(channel_id),
                "room_id": str(self.room_id),
                "mode": mode_type,
                "start_info": getattr(self, "pk_start_info", None), 
                "left_team_id": self.left_team_id,
                "right_team_id": self.right_team_id,
                "left_team_score": left_score,
                "right_team_score": right_score,
                "teams": teams,
                "status": 1,
                "updated_at": int(time.time() * 1000),
            }

            redis_client = get_redis()
            payload_str = orjson.dumps(snapshot).decode("utf-8")
            
            await redis_client.set(f"pk:live:{self.room_id}", payload_str, ex=300)
            await redis_client.publish("pk:live:updates", payload_str)
            
        except Exception as e:
            logger.error(f"❌ [PK 广播错误]: {e}", exc_info=True)
            
    async def _resolve_star_guard(self, user_id: str, anchor_id: str, new_expired_sec: int):
        now_sec = int(time.time())
        if new_expired_sec <= now_sec:
            return False, "", 0, ""

        redis_client = get_redis()
        redis_key = f"star_guard:{anchor_id}:{user_id}"
        
        try:
            old_expired_str = await redis_client.get(redis_key)
            old_expired_sec = int(old_expired_str) if old_expired_str else 0
        except Exception:
            old_expired_sec = 0

        gift_name = ""
        diamond_count = 0

        if old_expired_sec > now_sec:
            delta_days = round((new_expired_sec - old_expired_sec) / 86400.0)
            
            if delta_days <= 0:
                return False, "", 0, ""
                
            if 359 <= delta_days <= 373:
                gift_name, diamond_count = "星守护(12个月)", GUARD_PRICE_YEAR
            else:
                gift_name, diamond_count = "星守护(1个月)", GUARD_PRICE_MONTH

        else:
            today_zero = now_sec - ((now_sec + 8 * 3600) % 86400)
            total_days = round((new_expired_sec - today_zero) / 86400.0)
            
            if total_days <= 0 or total_days > 465:
                return False, "", 0, ""
                
            if 359 <= total_days <= 373:
                gift_name, diamond_count = "星守护(12个月)", GUARD_PRICE_YEAR
            else:
                gift_name, diamond_count = "星守护(1个月)", GUARD_PRICE_MONTH

        ttl = max((new_expired_sec - now_sec) + 7 * 86400, 86400)
        try:
            await redis_client.set(redis_key, str(new_expired_sec), ex=ttl)
        except Exception as e:
            logger.error(f"[StarGuard] Redis 游标写入失败: {e}")

        return True, gift_name, diamond_count, STAR_GUARD_ICON
        
    async def _check_guest_mic_and_notify(self, target_uid, current_room_id):
        try:
            redis_client = get_redis()
            if not redis_client:
                return
    
            own_state_key = f"feishu:state:{target_uid}"
            own_state = await redis_client.get(own_state_key)
            if own_state and own_state.decode('utf-8') == "1":
                return
    
            lock_key = f"feishu:guest_lock:{target_uid}:{current_room_id}"
            is_first_time = await redis_client.set(lock_key, "1", nx=True, ex=14400)
            
            if not is_first_time:
                return
    
            msg = f"🎙️ 发现 陈泽 正在其他直播间连麦！\n当前所在房间 Room ID: {current_room_id}"
            await self.notifier._send_simple_text(msg)
            
            logger.info(f"✅ [连麦雷达] 成功触发跨房连麦通知 (所在房间: {current_room_id})")
    
        except Exception as e:
            logger.error(f"❌ 检测连麦状态异常: {e}")