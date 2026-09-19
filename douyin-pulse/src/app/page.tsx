'use client';

import { useState, useEffect, useCallback } from 'react';
import AuthorCard from '../components/AuthorCard';
import { Author } from '../types/author';
import QnaModal from '@/components/QnaModal';
import DailyReportModal from '@/components/DailyReportModal';
import { useRouter } from 'next/navigation';
import { Search, MessageSquare, FileText } from "lucide-react";
import ThemeSwitcher from '@/components/ThemeSwitcher';

export default function Home() {
    const [authors, setAuthors] = useState<Author[]>([]);
    const [loading, setLoading] = useState(true);
    const [isReportOpen, setIsReportOpen] = useState(false);

    const router = useRouter();

    const fetchAuthors = useCallback(async () => {
        try {
            const res = await fetch('/api/authors');
            const data = await res.json();
            setAuthors(data);
        } catch (error) {
            console.error('API Error:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAuthors();
        const interval = setInterval(fetchAuthors, 30000);
        return () => clearInterval(interval);
    }, [fetchAuthors]);

    const activeCount = authors.filter(a => a.live_status === 1 || a.live_status === 2).length;

    return (
        <main className="min-h-screen bg-background text-foreground p-4 md:p-8 uppercase tracking-widest selection:bg-primary selection:text-primary-foreground transition-colors duration-500">
            <div className="max-w-7xl mx-auto space-y-6">
                
                <header className="flex flex-col md:flex-row md:justify-between items-start md:items-end gap-6 border-b border-primary/30 pb-4 transition-colors duration-500">
                    <div>
                        <div className="font-mono text-[10px] text-primary/50 mb-1 flex items-center gap-2 transition-colors duration-500">
                            <span className="w-2 h-2 bg-primary animate-pulse rounded-full"></span>
                            SYSTEM_ONLINE // V 1.0.0
                        </div>
                        <h1 className="text-3xl font-black text-primary tracking-tighter drop-shadow-[0_0_10px_rgba(var(--color-primary),0.5)] transition-all duration-500">
                            TERMINAL_1103
                        </h1>
                    </div>
                    
                    <div className="flex flex-wrap w-full md:w-auto gap-3 items-center">
                        <ThemeSwitcher />

                        <button 
                            onClick={() => setIsReportOpen(true)}
                            className="relative border border-primary/50 bg-primary/10 text-primary px-6 h-10 font-bold hover:bg-primary hover:text-primary-foreground transition-all group rounded-[var(--radius)] flex items-center gap-2"
                        >
                            <div className="absolute top-0 left-0 w-1 h-1 border-t border-l border-current opacity-100 [.theme-pink_&]:opacity-0 transition-opacity"></div>
                            <div className="absolute bottom-0 right-0 w-1 h-1 border-b border-r border-current opacity-100 [.theme-pink_&]:opacity-0 transition-opacity"></div>
                            <FileText className="w-4 h-4" />
                            <span>日报</span>
                        </button>

                        <button 
                            onClick={() => router.push('/search')}
                            className="relative border border-primary/50 bg-primary/10 text-primary px-6 h-10 font-bold hover:bg-primary hover:text-primary-foreground transition-all group rounded-[var(--radius)] flex items-center gap-2"
                        >
                            <div className="absolute top-0 left-0 w-1 h-1 border-t border-l border-current opacity-100 [.theme-pink_&]:opacity-0 transition-opacity"></div>
                            <div className="absolute bottom-0 right-0 w-1 h-1 border-b border-r border-current opacity-100 [.theme-pink_&]:opacity-0 transition-opacity"></div>
                            <Search className="w-4 h-4" />
                            <span>搜索</span>
                        </button>
                        <button 
                            onClick={() => router.push('/tieba')}
                            className="relative border border-primary/50 bg-primary/10 text-primary px-6 h-10 font-bold hover:bg-primary hover:text-primary-foreground transition-all group rounded-[var(--radius)] flex items-center gap-2"
                        >
                            <div className="absolute top-0 left-0 w-1 h-1 border-t border-l border-current opacity-100 [.theme-pink_&]:opacity-0 transition-opacity"></div>
                            <div className="absolute bottom-0 right-0 w-1 h-1 border-b border-r border-current opacity-100 [.theme-pink_&]:opacity-0 transition-opacity"></div>
                            <MessageSquare className="w-4 h-4" />
                            <span>贴吧</span>
                        </button>
                    </div>
                </header>

                <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="relative border-l-4 border-primary bg-primary/5 p-4 border-y border-r border-primary/20 rounded-r-[var(--radius)] transition-colors duration-500">
                        <div className="font-mono text-primary/50 text-[10px] mb-1">MONITORED_TARGETS</div>
                        <div className="font-mono text-3xl font-black text-primary transition-colors duration-500">{authors.length}</div>
                    </div>
                    <div className="relative border-l-4 border-destructive bg-destructive/5 p-4 border-y border-r border-destructive/20 rounded-r-[var(--radius)] transition-colors duration-500">
                        <div className="font-mono text-destructive/50 text-[10px] mb-1">ACTIVE_ENGAGEMENTS</div>
                        <div className="font-mono text-3xl font-black text-destructive animate-pulse transition-colors duration-500">{activeCount}</div>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-20 font-mono text-primary animate-pulse transition-colors duration-500">SCANNING_NETWORK...</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {authors.map((author) => (
                            <AuthorCard key={author.sec_uid} author={author} />
                        ))}
                    </div>
                )}
            </div>  
            <QnaModal />
            <DailyReportModal isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} />
        </main>
    );
}