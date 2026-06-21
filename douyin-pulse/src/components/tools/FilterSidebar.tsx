'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, Database } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AuthorSuggestion, RoomOption, ToolTab } from '@/types/tools';
import { formatDisplayTime } from '@/lib/tools-utils';

interface FilterSidebarProps {
  activeTab: ToolTab;
  authorQuery: string;
  setAuthorQuery: (val: string) => void;
  selectedAuthor: AuthorSuggestion | null;
  setSelectedAuthor: (author: AuthorSuggestion | null) => void;
  rooms: RoomOption[];
  setRooms: (rooms: RoomOption[]) => void;
  selectedRoomId: string;
  setSelectedRoomId: (id: string) => void;
  startTime: string;
  setStartTime: (time: string) => void;
  endTime: string;
  setEndTime: (time: string) => void;
  applyRoomTime: (room: RoomOption | null) => void;
}

export default function FilterSidebar(props: FilterSidebarProps) {
  const {
    activeTab, authorQuery, setAuthorQuery, selectedAuthor, setSelectedAuthor,
    rooms, setRooms, selectedRoomId, setSelectedRoomId,
    startTime, setStartTime, endTime, setEndTime, applyRoomTime
  } = props;

  const suggestionRef = useRef<HTMLDivElement | null>(null);
  const [authorSuggestions, setAuthorSuggestions] = useState<AuthorSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingAuthors, setSearchingAuthors] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.room_id === selectedRoomId) || null,
    [rooms, selectedRoomId]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = authorQuery.trim();
    if (!trimmed || (selectedAuthor && trimmed === selectedAuthor.nickname)) {
      setAuthorSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingAuthors(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}&limit=8`);
        if (!response.ok) throw new Error('主播搜索失败');
        const data = await response.json();
        setAuthorSuggestions(data);
        setShowSuggestions(true);
      } catch (error) {
        console.error(error);
        setAuthorSuggestions([]);
      } finally {
        setSearchingAuthors(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [authorQuery, selectedAuthor]);

  const loadRooms = async (author: AuthorSuggestion) => {
    setLoadingRooms(true);
    setRooms([]);
    setSelectedRoomId('');
    applyRoomTime(null);
    setErrorMessage('');

    try {
      const response = await fetch(`/api/authors/${author.sec_uid}/rooms?limit=0`);
      if (!response.ok) throw new Error('获取场次失败');
      const data = await response.json();
      setRooms(data);
      if (data.length > 0) {
        setSelectedRoomId(data[0].room_id);
        applyRoomTime(data[0]);
      }
    } catch (error) {
      console.error(error);
      setErrorMessage('场次加载失败，请稍后再试。');
    } finally {
      setLoadingRooms(false);
    }
  };

  const handleSelectAuthor = async (author: AuthorSuggestion) => {
    setSelectedAuthor(author);
    setAuthorQuery(author.nickname);
    setShowSuggestions(false);
    await loadRooms(author);
  };

  const handleAuthorInput = (value: string) => {
    setAuthorQuery(value);
    if (selectedAuthor && value !== selectedAuthor.nickname) {
      setSelectedAuthor(null);
      setRooms([]);
      setSelectedRoomId('');
      applyRoomTime(null);
    }
  };

  const handleRoomChange = (roomId: string) => {
    setSelectedRoomId(roomId);
    const room = rooms.find((item) => item.room_id === roomId) || null;
    applyRoomTime(room);
  };

  return (
    <Card className="border-primary/15 bg-card/85 py-4 h-fit">
      <CardHeader className="space-y-2">
        <CardTitle className="text-xl font-black tracking-tight">筛选条件</CardTitle>
        <CardDescription>
          {activeTab === 'high_level' ? '雷达模式基于数据库底层检索，无需选择主播场次。' : '锁定直播场次后，在右侧进行导出操作。'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {activeTab === 'high_level' ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center rounded-2xl border border-dashed border-primary/20 bg-primary/5">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Database className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-bold text-lg mb-2 text-foreground">底层数据库直连</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">
              当前为全局数据脱水模式。您可以直接操作右侧的雷达控制台，调取任意日期的纯新增名单。
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2" ref={suggestionRef}>
              <label className="text-sm font-semibold text-foreground">主播</label>
              <div className="relative">
                <Input
                  value={authorQuery}
                  onChange={(event) => handleAuthorInput(event.target.value)}
                  placeholder="输入主播昵称关键词"
                  className="pr-10"
                />
                {searchingAuthors ? (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                ) : (
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                )}
                {showSuggestions && authorSuggestions.length > 0 && (
                  <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-border bg-card p-2 shadow-2xl">
                    {authorSuggestions.map((author) => (
                      <button
                        key={author.sec_uid}
                        type="button"
                        onClick={() => void handleSelectAuthor(author)}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-muted/60"
                      >
                        <span className="font-semibold text-foreground">{author.nickname}</span>
                        <span className="ml-4 text-xs text-muted-foreground">{author.sec_uid.slice(0, 10)}...</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">场次</label>
              <select
                value={selectedRoomId}
                onChange={(event) => handleRoomChange(event.target.value)}
                disabled={!selectedAuthor || loadingRooms}
                className="flex h-11 w-full rounded-2xl border border-primary/20 bg-background/70 px-4 text-sm outline-none transition focus:border-primary"
              >
                <option value="">{loadingRooms ? '场次加载中...' : '请选择场次'}</option>
                {rooms.map((room) => (
                  <option key={room.room_id} value={room.room_id}>
                    {formatDisplayTime(room.created_at)} · {room.title || '未命名场次'}
                  </option>
                ))}
              </select>
              {selectedRoom && (
                <p className="text-xs leading-6 text-muted-foreground mt-1">
                  默认时间：{formatDisplayTime(selectedRoom.created_at)} - {formatDisplayTime(selectedRoom.end_time || selectedRoom.created_at)}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">开始时间</label>
                <Input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">结束时间</label>
                <Input type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
              </div>
            </div>

            {errorMessage && <div className="text-sm text-destructive mt-2">{errorMessage}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}