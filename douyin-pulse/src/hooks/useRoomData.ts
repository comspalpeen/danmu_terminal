import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChatMsg, GiftMsg, PkBattle, RoomDetail, SearchTarget } from '@/types/room';

const toLocalISOString = (date: Date) => {
    const pad = (n: number) => (n < 10 ? '0' + n : n);
    const pad3 = (n: number) => (n < 10 ? '00' + n : n < 100 ? '0' + n : n);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad3(date.getMilliseconds())}Z`;
};

function uniqueData<T>(arr: T[], keyFn: (item: T) => string): T[] {
    if (!Array.isArray(arr)) return [];
    const seen = new Set();
    return arr.filter(item => {
        const key = keyFn(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

type DateValue = string | { $date?: string } | undefined;

const normalizeDateValue = (time: DateValue) => {
    if (typeof time === 'object') return time.$date;
    return time;
};

const getChatTime = (item: ChatMsg) => normalizeDateValue(item.event_time || item.created_at);
const getGiftTime = (item: GiftMsg) => normalizeDateValue(item.send_time || item.created_at);

// 按直播开播日和输入时分组装查询时间，避免浏览器时区偏移。
export const parseTimeFilter = (timeStr: string | undefined, roomStart: DateValue) => {
    if (!timeStr || !roomStart) return null;
    
    const startStr = normalizeDateValue(roomStart);
    if (!startStr) return null;

    const [inputH, inputM] = timeStr.split(':').map(Number);
    if (isNaN(inputH) || isNaN(inputM)) return null;

    // 数据库存的是以 Z 结尾的本地时间字符串，这里只读取日期和时分。
    const timePart = startStr.split('T')[1]; 
    const startH = parseInt(timePart.split(':')[0], 10);
    const startM = parseInt(timePart.split(':')[1], 10);

    const datePart = startStr.split('T')[0]; 
    const [year, month, day] = datePart.split('-').map(Number);

    // Date.UTC 只用于处理跨自然月进位，不引入本地时区换算。
    let targetEpoch = Date.UTC(year, month - 1, day, inputH, inputM, 0, 0);

    // 输入时分早于开播时分时，按次日查询。
    if (inputH * 60 + inputM < startH * 60 + startM) {
        targetEpoch += 86400000; 
    }

    // 返回与后端存储格式一致的 Z 结尾字符串。
    return new Date(targetEpoch).toISOString();
};

interface SearchParams {
    appliedSearch: string; 
    searchTarget: SearchTarget; 
    minPrice: number; 
    enableMinPrice: boolean;
    filterGender?: number | null;
    filterMinPayGrade?: number;
    filterMinFansLevel?: number;
    filterStartTime?: string; 
    filterEndTime?: string; 
    searchTrigger?: number;
}

export function useRoomData(roomId: string, jumpTime: string | null, searchParams: SearchParams) {
    const { data: roomInfo } = useQuery<RoomDetail>({
        queryKey: ['room', roomId, 'detail'],
        queryFn: async () => (await fetch(`/api/rooms/${roomId}/detail`)).json(),
        refetchInterval: (query) => {
            if (jumpTime) return false; 
            if (query.state.data?.live_status === 4) return false; 
            return 5000;
        },
    });

    const [chats, setChats] = useState<ChatMsg[]>([]);
    const [gifts, setGifts] = useState<GiftMsg[]>([]);
    const [pks, setPks] = useState<PkBattle[]>([]);
    const [loadingChats, setLoadingChats] = useState(false);
    const [loadingGifts, setLoadingGifts] = useState(false);
    const [loadingPks, setLoadingPks] = useState(false);
    const [hasMoreChats, setHasMoreChats] = useState(true);
    const [hasMoreGifts, setHasMoreGifts] = useState(true);
    const [pkInitialized, setPkInitialized] = useState(false);
    const [jumpError, setJumpError] = useState(false);

    const getCommonParams = (limit: number, type: 'chat' | 'gift') => {
        let p = `limit=${limit}`;
        if (searchParams.appliedSearch) {
            if (searchParams.searchTarget === 'all' || searchParams.searchTarget === type) {
                p += `&keyword=${encodeURIComponent(searchParams.appliedSearch)}`;
            }
        }
        if (type === 'gift' && searchParams.enableMinPrice && searchParams.minPrice >= 0) {
            p += `&min_price=${searchParams.minPrice + 1}`;
        }
        if (searchParams.filterGender !== null && searchParams.filterGender !== undefined) p += `&gender=${searchParams.filterGender}`;
        if (searchParams.filterMinPayGrade && searchParams.filterMinPayGrade > 0) p += `&min_pay_grade=${searchParams.filterMinPayGrade}`;
        if (searchParams.filterMinFansLevel && searchParams.filterMinFansLevel > 0) p += `&min_fans_club_level=${searchParams.filterMinFansLevel}`;
        return p;
    };

    const loadOldData = useCallback(async (type: 'chat' | 'gift', isInitial = false) => {
        const isChat = type === 'chat';
        const setLoading = isChat ? setLoadingChats : setLoadingGifts;
        const setHasMore = isChat ? setHasMoreChats : setHasMoreGifts;
        const currentData = isChat ? chats : gifts;
        const hasMore = isChat ? hasMoreChats : hasMoreGifts;

        if (loadingChats && isChat) return;
        if (loadingGifts && !isChat) return;
        if (!isInitial && !hasMore) return;

        setLoading(true);
        try {
            const limit = (isInitial && jumpTime) ? 50 : 50;
            let url = `/api/rooms/${roomId}/${type}s?${getCommonParams(limit, type)}`;
            if (searchParams.filterStartTime && roomInfo?.created_at) {
                const st = parseTimeFilter(searchParams.filterStartTime, roomInfo.created_at);
                if (st) url += `&start_time=${encodeURIComponent(st)}`;
            }
            if (searchParams.filterEndTime && roomInfo?.created_at) {
                const et = parseTimeFilter(searchParams.filterEndTime, roomInfo.created_at);
                if (et) url += `&end_time=${encodeURIComponent(et)}`;
            }

            if (isInitial && jumpTime) {
                const targetDate = new Date(jumpTime);
                targetDate.setSeconds(targetDate.getSeconds() + 20); 
                url += `&before_time=${encodeURIComponent(toLocalISOString(targetDate))}`;
            } else if (!isInitial && currentData.length > 0) {
                const sorted = isChat
                    ? [...chats].sort((a, b) => new Date(getChatTime(b) || 0).getTime() - new Date(getChatTime(a) || 0).getTime())
                    : [...gifts].sort((a, b) => new Date(getGiftTime(b) || 0).getTime() - new Date(getGiftTime(a) || 0).getTime());
                const oldest = sorted[sorted.length - 1];
                const time = isChat ? getChatTime(oldest as ChatMsg) : getGiftTime(oldest as GiftMsg);
                if (time) url += `&before_time=${encodeURIComponent(time)}`;
            }

            const res = await fetch(url);
            if (!res.ok) { setLoading(false); return; }
            const newData = await res.json();
            if (!Array.isArray(newData)) { setLoading(false); return; }

            if (isInitial && jumpTime && newData.length === 0) {
                if (isChat) setJumpError(true);
                return;
            }

            if (newData.length < limit) setHasMore(false);
            if (isChat) {
                setChats(prev => {
                    const combined = isInitial ? (newData as ChatMsg[]) : [...prev, ...(newData as ChatMsg[])];
                    return uniqueData(combined, item => `${getChatTime(item)}-${item.user_name}-${item.content}`);
                });
            } else {
                setGifts(prev => {
                    const combined = isInitial ? (newData as GiftMsg[]) : [...prev, ...(newData as GiftMsg[])];
                    return uniqueData(combined, item => `${getGiftTime(item)}-${item.user_name}-${item.gift_name}-${item.combo_count}`);
                });
            }
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }, [roomId, jumpTime, searchParams, chats, gifts, hasMoreChats, hasMoreGifts, loadingChats, loadingGifts, roomInfo?.created_at]);

    const loadPks = useCallback(async () => {
        if (loadingPks || pkInitialized) return;
        setLoadingPks(true);
        try {
            const res = await fetch(`/api/rooms/${roomId}/pks?limit=50`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    setPks(prev => uniqueData([...data, ...prev], p => p.battle_id));
                    setPkInitialized(true);
                }
            }
        } catch (e) { console.error(e); } finally { setLoadingPks(false); }
    }, [roomId, loadingPks, pkInitialized]);
    const reloadPks = useCallback(async () => {
        if (loadingPks) return; // 只防并发，不防已初始化
        // 此处可以选择不设 setLoadingPks(true)，实现"无感静默刷新"
        try {
            const res = await fetch(`/api/rooms/${roomId}/pks?limit=50`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    // 把最新的数据放在前面，通过 uniqueData 自动去重和覆盖旧数据
                    setPks(prev => uniqueData([...data, ...prev], p => p.battle_id));
                    setPkInitialized(true);
                }
            }
        } catch (e) { console.error(e); }
    }, [roomId, loadingPks]);
    useEffect(() => {
        if (jumpTime) return;
        if (roomInfo && roomInfo.live_status !== 1) return;
        if (
            searchParams.filterGender !== null || 
            (searchParams.filterMinPayGrade && searchParams.filterMinPayGrade > 0) || 
            (searchParams.filterMinFansLevel && searchParams.filterMinFansLevel > 0) ||
            searchParams.filterStartTime ||
            searchParams.filterEndTime
        ) return;

        const interval = setInterval(async () => {
            try {
                const [resChats, resGifts] = await Promise.all([
                    fetch(`/api/rooms/${roomId}/chats?${getCommonParams(20, 'chat')}`),
                    fetch(`/api/rooms/${roomId}/gifts?${getCommonParams(20, 'gift')}`)
                ]);

                if (resChats.ok) {
                    const newChats = await resChats.json();
                    if (Array.isArray(newChats) && newChats.length > 0) {
                        setChats(p => uniqueData([...(newChats as ChatMsg[]), ...p], i => `${getChatTime(i)}-${i.user_name}-${i.content}`).slice(0, 1000));
                    }
                }
                
                if (resGifts.ok) {
                    const newGifts = await resGifts.json();
                    if (Array.isArray(newGifts) && newGifts.length > 0) {
                        setGifts(p => uniqueData([...(newGifts as GiftMsg[]), ...p], i => `${getGiftTime(i)}-${i.user_name}-${i.gift_name}-${i.combo_count}`).slice(0, 1000));
                    }
                }
            } catch (e) { console.error(e); }
        }, 3000);
        return () => clearInterval(interval);
    }, [roomId, jumpTime, roomInfo, searchParams]);
    const effectiveMinPrice = searchParams.enableMinPrice ? searchParams.minPrice : null;
    useEffect(() => {
        setChats([]); setGifts([]); setHasMoreChats(true); setHasMoreGifts(true); setPkInitialized(false); setPks([]);
        loadOldData('chat', true);
        loadOldData('gift', true);
    }, [
        roomId, jumpTime, 
        searchParams.appliedSearch, 
        searchParams.searchTarget,
        searchParams.searchTrigger,
        searchParams.enableMinPrice, 
        effectiveMinPrice,             // 使用衍生出来的值
        searchParams.filterGender, searchParams.filterMinPayGrade, searchParams.filterMinFansLevel,
        searchParams.filterStartTime, searchParams.filterEndTime 
    ]);

    return {
        roomId,
        roomInfo, chats, gifts, pks,
        loadingChats, loadingGifts, loadingPks,
        loadOldChats: () => loadOldData('chat'),
        loadOldGifts: () => loadOldData('gift'),
        loadPks, 
        reloadPks, // 将强制刷新方法暴露给外层组件
        jumpError, pkInitialized 
    };
}
