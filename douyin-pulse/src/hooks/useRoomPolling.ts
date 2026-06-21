import { useQuery } from '@tanstack/react-query';
import { RoomDetail } from '@/types/room';
export function useRoomDetail(roomId: string, isHistoryMode: boolean = false) {
    return useQuery<RoomDetail>({
        queryKey: ['room', roomId, 'detail'],
        queryFn: async () => {
            const res = await fetch(`/api/rooms/${roomId}/detail`);
            if (!res.ok) throw new Error('Failed to fetch room info');
            return res.json();
        },
        // 核心修复：智能轮询策略
        refetchInterval: (query) => {
            // 1. 如果是历史回放模式，绝对不轮询
            if (isHistoryMode) return false;
            
            // 2. 如果数据已加载，且 live_status 不为 1 (直播中)，则停止轮询
            // (例如：live_status = 4 表示直播结束)
            const data = query.state.data;
            if (data && data.live_status !== 1) return false; 
            
            // 3. 否则保持 5秒/次 的轮询
            return 5000;
        },
        staleTime: 2000,
    });
}