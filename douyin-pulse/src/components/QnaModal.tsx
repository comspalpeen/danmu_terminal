'use client';

import { useState, useEffect } from 'react';

interface QnA {
    id: string;
    question: string;
    answer: string;
}

export default function QnaModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [qnaList, setQnaList] = useState<QnA[]>([]);

    useEffect(() => {
        if (isOpen && qnaList.length === 0) {
            fetch('/api/qna')
                .then(res => res.json())
                .then(data => setQnaList(data))
                .catch(err => console.error(err));
        }
    }, [isOpen]);

    return (
        <>
            {/* 1. 悬浮入口按钮 (完全响应主题) */}
            <button 
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 left-6 z-40 bg-primary/10 hover:bg-primary border border-primary/50 text-primary hover:text-primary-foreground w-12 h-12 rounded-[var(--radius)] shadow-[0_0_15px_rgba(var(--color-primary),0.2)] hover:shadow-[0_0_20px_rgba(var(--color-primary),0.5)] flex items-center justify-center transition-all duration-500 hover:scale-110 group"
                title="常见问题"
            >
                {/* 战术装饰角 (粉红模式自动隐藏) */}
                <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-current opacity-100 [.theme-pink_&]:opacity-0 transition-opacity"></div>
                <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-current opacity-100 [.theme-pink_&]:opacity-0 transition-opacity"></div>

                <span className="text-xl font-black font-mono">?</span>
                <span className="absolute left-full ml-3 bg-card border border-border text-foreground text-xs px-2 py-1 rounded-[var(--radius)] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-sm">
                    Q&A
                </span>
            </button>

            {/* 2. 模态框 */}
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200 transition-colors" onClick={() => setIsOpen(false)}>
                    <div 
                        className="relative bg-card text-card-foreground w-full max-w-lg rounded-[var(--radius)] border border-border shadow-2xl overflow-hidden flex flex-col max-h-[80vh] transition-colors duration-500"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary/40 pointer-events-none opacity-100 [.theme-pink_&]:opacity-0 transition-opacity"></div>
                        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-primary/40 pointer-events-none opacity-100 [.theme-pink_&]:opacity-0 transition-opacity"></div>
                        <div className="p-4 border-b border-border flex justify-between items-center bg-muted/20 transition-colors duration-500">
                            <h3 className="font-black text-lg text-primary tracking-widest uppercase flex items-center gap-2">
                                <span className="w-2 h-2 bg-primary animate-pulse rounded-full"></span>
                                常见问题 Q&A
                            </h3>
                            <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground text-2xl leading-none transition-colors">&times;</button>
                        </div>
                        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 bg-background/50 transition-colors duration-500">
                            {qnaList.length === 0 ? (
                                <div className="text-center text-primary/50 py-10 font-mono animate-pulse">NO_RECORDS_FOUND</div>
                            ) : (
                                qnaList.map((item, index) => (
                                    <div key={item.id} className="group">
                                        <div className="flex items-start gap-3 mb-2">
                                            <span className="bg-primary/10 border border-primary/30 text-primary font-bold font-mono text-xs px-2 py-0.5 rounded-[calc(var(--radius)-2px)] mt-0.5 transition-colors">
                                                Q{index + 1}
                                            </span>
                                            <h4 className="font-bold text-foreground leading-relaxed transition-colors duration-500">
                                                {item.question}
                                            </h4>
                                        </div>
                                        <div className="pl-10 text-sm text-muted-foreground leading-relaxed border-l-2 border-primary/30 ml-2 py-1 transition-colors duration-500">
                                            {item.answer}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="p-4 border-t border-border text-center text-xs font-mono text-muted-foreground bg-muted/20 transition-colors duration-500 uppercase tracking-widest">
                            CONTACT_ADMIN // @kuku
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}