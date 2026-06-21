'use client';

import { useState, useEffect, useMemo } from 'react';

// 类型定义
interface ReportItem {
    date: string;
    uid: string;
    sec_uid: string;
    nickname: string;
    avatar_url?: string;
    pay_grade_icon?: string;
    pay_grade_level?: number;
    follower_count: number;
    follower_diff: number;
    active_fans_count: number;
    today_new_fans: number;
    total_fans_club: number;
    task_1_completed: number;
}

interface DailyGroup {
    date: string;
    items: ReportItem[];
}

interface DailyReportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function DailyReportModal({ isOpen, onClose }: DailyReportModalProps) {
    const [data, setData] = useState<DailyGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string>('');

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            fetch('/api/reports/daily?days=7')
                .then(res => res.json())
                .then(res => {
                    if (Array.isArray(res) && res.length > 0) {
                        setData(res);
                        setSelectedDate(res[0].date);
                    } else {
                        setData([]);
                    }
                })
                .catch(err => console.error(err))
                .finally(() => setLoading(false));
        }
    }, [isOpen]);

    const currentList = useMemo(() => {
        const group = data.find(g => g.date === selectedDate);
        if (!group) return [];
        let items = [...group.items];
        
        items.sort((a, b) => {
            const lampDiff = b.task_1_completed - a.task_1_completed;
            if (lampDiff !== 0) return lampDiff;
            return b.follower_count - a.follower_count;
        });

        return items;
    }, [data, selectedDate]);

    const cleanName = (name: string) => name.replace(/[\(（][^\)）]*[\)）]/g, '').trim();

    const formatNum = (num: number, showPlus = false) => {
        if (num === 0) return '0';
        const prefix = showPlus && num > 0 ? '+' : '';
        if (Math.abs(num) >= 10000) return prefix + (num / 10000).toFixed(1) + '万';
        return prefix + num.toLocaleString();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200 transition-colors" onClick={onClose}>
            <div 
                className="relative bg-card text-card-foreground w-full max-w-5xl rounded-[var(--radius)] border border-border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden transition-colors duration-500"
                onClick={e => e.stopPropagation()}
            >
                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary/40 pointer-events-none opacity-100 [.theme-pink_&]:opacity-0 transition-opacity z-30"></div>
                <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-primary/40 pointer-events-none opacity-100 [.theme-pink_&]:opacity-0 transition-opacity z-30"></div>
                <div className="p-3 md:p-4 border-b border-border flex justify-between items-center bg-card shrink-0 z-20 transition-colors duration-500">
                    <div className="flex items-center gap-2 md:gap-4">
                        <h3 className="font-black text-lg md:text-xl flex items-center gap-2 text-foreground tracking-widest uppercase transition-colors">
                            <span className="text-primary"></span> 
                            <span className="hidden md:inline">日报</span>
                        </h3>
                        
                        <div className="relative">
                            <select 
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="appearance-none bg-background border border-border hover:border-primary/50 text-foreground font-bold font-mono py-1.5 pl-3 pr-8 rounded-[calc(var(--radius)-4px)] outline-none cursor-pointer transition-colors text-xs md:text-sm shadow-sm"
                            >
                                {data.map(g => (
                                    <option key={g.date} value={g.date}>{g.date}</option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-primary/50">
                                <svg className="h-3 w-3 md:h-4 md:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                        </div>
                    </div>
                    
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-[var(--radius)] hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors">
                        <span className="text-xl">&times;</span>
                    </button>
                </div>
                <div className="flex-1 overflow-auto bg-background/50 relative transition-colors duration-500 custom-scrollbar">
                    {loading ? (
                        <div className="py-20 text-center font-mono font-bold tracking-widest text-primary animate-pulse transition-colors">SYNCING_DATA...</div>
                    ) : currentList.length === 0 ? (
                        <div className="py-20 text-center text-muted-foreground flex flex-col items-center font-mono">
                            <span className="text-4xl mb-2 opacity-50">📭</span>
                            NULL_RECORD
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left border-collapse">
                            <thead className="text-xs text-muted-foreground uppercase tracking-widest bg-muted/50 border-b border-border sticky top-0 z-10 backdrop-blur-md transition-colors duration-500">
                                <tr>
                                    <th className="hidden md:table-cell px-4 py-3 font-bold w-16 text-center">RANK</th>
                                    <th className="px-2 md:px-4 py-3 font-bold text-left">TARGET</th>
                                    <th className="hidden md:table-cell px-4 py-3 font-bold text-right">FOLLOWERS</th>
                                    <th className="px-1 md:px-4 pl-3 md:pl-6 py-3 font-bold text-right">
                                        <span className="hidden md:inline">涨粉</span>
                                        <span className="md:hidden">涨粉</span>
                                    </th>
                                    <th className="hidden md:table-cell px-4 py-3 font-bold text-right">粉团总量</th>
                                    <th className="px-1 md:px-4 py-3 font-bold text-right text-emerald-500">
                                        <span className="hidden md:inline">新进粉团</span>
                                        <span className="md:hidden">新进</span>
                                    </th>
                                    <th className="px-1 md:px-4 py-3 font-bold text-right text-accent">
                                        <span className="hidden md:inline">点亮中</span>
                                        <span className="md:hidden">点亮中</span>
                                    </th>
                                    <th className="px-1 md:px-4 pr-4 md:pr-6 py-3 font-black text-right text-primary">
                                        <span className="hidden md:inline">灯牌</span>
                                        <span className="md:hidden">灯牌</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border bg-transparent">
                                {currentList.map((item, index) => (
                                    <tr key={`${item.uid}-${index}`} className="hover:bg-primary/5 transition-colors duration-300 group text-xs md:text-sm">
                                        <td className="hidden md:table-cell px-4 py-3 text-center">
                                            <span className={`font-black font-mono italic ${index < 3 ? 'text-primary text-base drop-shadow-[0_0_5px_rgba(var(--color-primary),0.5)]' : 'text-muted-foreground'}`}>
                                                {index + 1}
                                            </span>
                                        </td>
                                        <td className="px-2 md:px-4 py-2 md:py-3">
                                            <div className="flex items-center gap-1.5 md:gap-3">
                                                <div className="relative w-8 h-8 md:w-9 md:h-9 shrink-0">
                                                    <img 
                                                        src={item.avatar_url || '/default-avatar.png'} 
                                                        alt="avatar" 
                                                        className="w-full h-full rounded-[calc(var(--radius)-4px)] object-cover border border-border group-hover:border-primary/50 transition-colors"
                                                    />
                                                </div>
                                                <div className="flex flex-col min-w-0 justify-center">
                                                    <div className="flex items-center gap-1">
                                                        {/* 粉红模式下取消全大写 */}
                                                        <span className="font-bold text-foreground truncate max-w-[70px] md:max-w-[120px] uppercase [.theme-pink_&]:normal-case transition-colors" title={item.nickname}>
                                                            {cleanName(item.nickname)}
                                                        </span>
                                                        {item.pay_grade_icon && (
                                                            <img src={item.pay_grade_icon} alt="lv" className="h-4 w-auto object-contain opacity-90 hidden md:block" />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="hidden md:table-cell px-4 py-3 text-right font-mono font-bold text-muted-foreground transition-colors">
                                            {formatNum(item.follower_count)}
                                        </td>
                                        <td className="px-1 md:px-4 pl-3 md:pl-6 py-2 md:py-3 text-right font-mono">
                                            {item.follower_diff !== 0 ? (
                                                <span className={`font-bold transition-colors ${item.follower_diff > 0 ? 'text-destructive' : 'text-emerald-500'}`}>
                                                    {formatNum(item.follower_diff, true)}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground opacity-50">-</span>
                                            )}
                                        </td>
                                        <td className="hidden md:table-cell px-4 py-3 text-right font-mono font-bold text-muted-foreground transition-colors">
                                            {formatNum(item.total_fans_club)}
                                        </td>
                                        <td className="px-1 md:px-4 py-2 md:py-3 text-right font-mono font-bold text-emerald-500 transition-colors">
                                            {item.today_new_fans > 0 ? `+${formatNum(item.today_new_fans)}` : '-'}
                                        </td>
                                        <td className="px-1 md:px-4 py-2 md:py-3 text-right font-mono font-bold text-accent transition-colors">
                                            {formatNum(item.active_fans_count)}
                                        </td>
                                        <td className="px-1 md:px-4 pr-4 md:pr-6 py-2 md:py-3 text-right font-mono font-black text-primary bg-primary/5 transition-colors duration-500">
                                            {formatNum(item.task_1_completed)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}