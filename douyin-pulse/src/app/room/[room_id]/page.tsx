'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useRoomUI } from '@/hooks/useRoomUI';
import { useRoomData } from '@/hooks/useRoomData';
import StatsModal from '@/components/StatsModal';
import RoomHeader from '@/components/room/RoomHeader';
import MobileRoomView from '@/components/room/MobileRoomView';
import DesktopRoomView from '@/components/room/DesktopRoomView';
import { useEffect } from 'react';
import { openDouyinUser } from '@/lib/douyin-links';

export default function RoomDetailPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const room_id = params.room_id as string;
    const jumpTime = searchParams.get('jump_time');
    const highlightUid = searchParams.get('highlight_uid');

    const ui = useRoomUI();

    const data = useRoomData(room_id, jumpTime, {
        appliedSearch: ui.searchState.appliedSearch,
        searchTarget: ui.searchState.searchTarget,
        minPrice: ui.searchState.minPriceInput,
        enableMinPrice: ui.searchState.enableMinPrice,
        filterGender: ui.searchState.filterGender,
        filterMinPayGrade: ui.searchState.filterMinPayGrade,
        filterMinFansLevel: ui.searchState.filterMinFansLevel,
        filterStartTime: ui.searchState.debouncedFilterStartTime,
        filterEndTime: ui.searchState.debouncedFilterEndTime,
        searchTrigger: ui.searchState.searchTrigger,
    });

    useEffect(() => {
        if ((ui.tabState.desktopTab === 'pk' || ui.tabState.mobileTab === 'pk') && !data.pkInitialized) {
            data.loadPks();
        }
    }, [ui.tabState.desktopTab, ui.tabState.mobileTab, data.pkInitialized, data]);

    const goToProfile = (e: React.MouseEvent, sec_uid?: string) => {
        e.stopPropagation();
        openDouyinUser(sec_uid);
    };
    
    const formatTime = (t?: string) => {
        if (!t) return '';
        let dateStr = t;
        if (typeof dateStr === 'string' && dateStr.endsWith('Z')) {
            dateStr = dateStr.slice(0, -1); 
        }
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleTimeString('zh-CN', { hour12: false });
    };

    const handleReturnToLatest = () => router.push(`/room/${room_id}`);

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col h-screen overflow-hidden selection:bg-primary selection:text-primary-foreground transition-colors duration-500">
            <StatsModal room={data.roomInfo || null} isOpen={ui.modalState.isStatsOpen} onClose={() => ui.modalState.setIsStatsOpen(false)} />
            <RoomHeader roomInfo={data.roomInfo} searchState={ui.searchState} actions={ui.actions} onOpenStats={() => ui.modalState.setIsStatsOpen(true)} />
            <MobileRoomView data={data} tab={ui.tabState.mobileTab} setTab={ui.tabState.setMobileTab} jumpTime={jumpTime} highlightUid={highlightUid} goToProfile={goToProfile} formatTime={formatTime} onReturnToLatest={handleReturnToLatest} />
            <DesktopRoomView data={data} tab={ui.tabState.desktopTab} setTab={ui.tabState.setDesktopTab} jumpTime={jumpTime} highlightUid={highlightUid} goToProfile={goToProfile} formatTime={formatTime} onReturnToLatest={handleReturnToLatest} />
        </div>
    );
}
