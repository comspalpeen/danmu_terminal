'use client';

import { useState, useMemo, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ToolsHeader from '@/components/tools/ToolsHeader';
import FilterSidebar from '@/components/tools/FilterSidebar';
import GiftPanel from '@/components/tools/GiftPanel';
import SpenderPanel from '@/components/tools/SpenderPanel';
import RadarPanel from '@/components/tools/RadarPanel';
import { useRadarScan } from '@/hooks/useRadarScan';

import { ToolTab, CommonFilterPayload, AuthorSuggestion, RoomOption } from '@/types/tools';
import { formatLocalInput } from '@/lib/tools-utils';

export default function ToolsPage() {
  const [activeTab, setActiveTab] = useState<ToolTab>('gift');
  
  // === 左侧过滤状态 (全局共享) ===
  const [authorQuery, setAuthorQuery] = useState('');
  const [selectedAuthor, setSelectedAuthor] = useState<AuthorSuggestion | null>(null);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  // === 引入雷达 Hook ===
  const radarState = useRadarScan(activeTab === 'high_level');

  // 构造通用 Payload，供子面板调用
  const commonPayload: CommonFilterPayload | null = useMemo(() => {
    if (!selectedAuthor || !selectedRoomId || !startTime || !endTime) return null;
    return {
      sec_uid: selectedAuthor.sec_uid,
      room_id: selectedRoomId,
      start_time: startTime,
      end_time: endTime,
    };
  }, [selectedAuthor, selectedRoomId, startTime, endTime]);

  // 辅助函数：应用房间时间
  const applyRoomTime = (room: RoomOption | null) => {
    if (!room) {
      setStartTime('');
      setEndTime('');
      return;
    }
    setStartTime(formatLocalInput(room.created_at));
    setEndTime(formatLocalInput(room.end_time || new Date().toISOString()));
  };

  return (
    <main className="min-h-screen bg-background text-foreground p-4 md:p-8 selection:bg-primary selection:text-primary-foreground">
      <div className="mx-auto max-w-6xl space-y-6">
        
        <ToolsHeader />

        <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <FilterSidebar 
            activeTab={activeTab}
            authorQuery={authorQuery}
            setAuthorQuery={setAuthorQuery}
            selectedAuthor={selectedAuthor}
            setSelectedAuthor={setSelectedAuthor}
            rooms={rooms}
            setRooms={setRooms}
            selectedRoomId={selectedRoomId}
            setSelectedRoomId={setSelectedRoomId}
            startTime={startTime}
            setStartTime={setStartTime}
            endTime={endTime}
            setEndTime={setEndTime}
            applyRoomTime={applyRoomTime}
          />
          <div className="border-primary/15 bg-card/85 py-4 rounded-xl shadow-sm">
            <div className="px-6 space-y-2">
              <h2 className="text-xl font-black tracking-tight">操作面板</h2>
            </div>
            <div className="p-6 space-y-6">
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ToolTab)}>
                <TabsList className="h-auto w-full rounded-2xl bg-muted/70 p-1 flex flex-wrap gap-1">
                  <TabsTrigger value="gift" className="py-2 flex-1">礼物导出</TabsTrigger>
                  <TabsTrigger value="spender" className="py-2 flex-1">消费导出</TabsTrigger>
                  <TabsTrigger value="high_level" className="py-2 flex-1 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">高等级雷达</TabsTrigger>
                </TabsList>

                <TabsContent value="gift" className="mt-5 space-y-4">
                  <GiftPanel commonPayload={commonPayload} />
                </TabsContent>

                <TabsContent value="spender" className="mt-5 space-y-4">
                  <SpenderPanel commonPayload={commonPayload} />
                </TabsContent>

                <TabsContent value="high_level" className="mt-5 space-y-4">
                  <RadarPanel {...radarState} />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}