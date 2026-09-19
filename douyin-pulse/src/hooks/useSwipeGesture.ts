import { useRef } from 'react';

type TabType = 'chat' | 'gift' | 'pk';

export function useSwipeGesture(
    currentTab: TabType,
    setTab: (tab: TabType) => void
) {
    const touchStartRef = useRef<{ x: number, y: number } | null>(null);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartRef.current === null) return;
        const diffX = touchStartRef.current.x - e.changedTouches[0].clientX;
        const diffY = touchStartRef.current.y - e.changedTouches[0].clientY;
        const threshold = 80;

        // 垂直滚动优先判定，忽略水平切换
        if (Math.abs(diffY) > Math.abs(diffX)) {
            touchStartRef.current = null;
            return;
        }

        if (Math.abs(diffX) > threshold) {
            const tabs: TabType[] = ['chat', 'gift', 'pk'];
            const currentIndex = tabs.indexOf(currentTab);
            
            if (diffX > 0 && currentIndex < tabs.length - 1) {
                // 左滑 -> 下一个 Tab
                setTab(tabs[currentIndex + 1]);
            } else if (diffX < 0 && currentIndex > 0) {
                // 右滑 -> 上一个 Tab
                setTab(tabs[currentIndex - 1]);
            }
        }
        touchStartRef.current = null;
    };

    return { handleTouchStart, handleTouchEnd };
}