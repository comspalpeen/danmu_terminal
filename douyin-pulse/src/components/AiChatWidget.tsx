'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Sparkles, Terminal, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export default function AiChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 150);
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    const quickCommands = [
        "陈泽本月直播数据",
        "陈泽本月尾数pk胜率？",
        "泽神本月哪天灯牌数量最多？"
    ];

    const sendMessage = async (text: string) => {
        if (!text.trim()) return;

        const newMessages = [...messages, { role: 'user' as const, content: text }];
        setMessages(newMessages);
        setInput('');
        setIsLoading(true);

        try {
           const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    messages: newMessages.filter(m => m.role !== 'system') 
                })
            });

            if (!res.ok) throw new Error('网络请求失败');
            const data = await res.json();
            
            setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
        } catch (error) {
            console.error('AI Error:', error);
            setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ 核心数据链路断开，请稍后再试。' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenChat = () => {
        setIsOpen(true);
        if (messages.length === 0) {
            setMessages([
                { role: 'assistant', content: '我是AI小助手，基于GLM-4.6V模型，目前仅对**本月数据**进行分析，AI立场与作者本人无关，回答较慢耐心等待。' }
            ]);
        }
    };
    const clearHistory = () => {
        if (window.confirm('确定要清除所有分析记录吗？')) {
            setMessages([]);
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-50">
            {isOpen && (
                <div className="mb-4 w-[90vw] md:w-[450px] h-[600px] bg-background/95 backdrop-blur-md border border-primary/50 shadow-[0_0_30px_rgba(var(--color-primary),0.2)] flex flex-col rounded-[var(--radius)] overflow-hidden transition-all duration-300 animate-in slide-in-from-bottom-5">
                    <div className="h-14 border-b border-primary/30 bg-primary/10 flex items-center justify-between px-4">
                        <div className="flex items-center gap-2 text-primary font-mono font-bold tracking-widest">
                            <Terminal className="w-5 h-5" />
                            <span>AI小助手</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <button onClick={clearHistory} className="text-primary/50 hover:text-destructive transition-colors" title="清除记忆">
                                <Trash2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => setIsOpen(false)} className="text-primary/70 hover:text-primary transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        {messages.map((msg, index) => (
                            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-3 rounded-lg text-sm ${
                                    msg.role === 'user' 
                                    ? 'bg-primary text-primary-foreground rounded-tr-none' 
                                    : 'bg-primary/10 border border-primary/20 text-foreground rounded-tl-none'
                                }`}>
                                    {msg.role === 'assistant' ? (
                                        <div className="prose prose-sm prose-invert max-w-none text-foreground/90 markdown-body">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                                        </div>
                                    ) : (
                                        msg.content
                                    )}
                                </div>
                            </div>
                        ))}
                        
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-primary/10 border border-primary/20 p-3 rounded-lg rounded-tl-none flex items-center gap-2 text-primary">
                                    <Sparkles className="w-4 h-4 animate-spin" />
                                    <span className="font-mono text-xs animate-pulse">ANALYZING_DATA...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                    {messages.length === 1 && (
                        <div className="px-4 pb-2 flex flex-wrap gap-2">
                            {quickCommands.map((cmd, i) => (
                                <button key={i} onClick={() => sendMessage(cmd)} className="text-xs border border-primary/30 text-primary/80 bg-background hover:bg-primary hover:text-primary-foreground px-2 py-1 rounded transition-colors">
                                    {cmd}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="p-4 border-t border-primary/30 bg-background">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && sendMessage(input)}
                                placeholder="输入对话内容..."
                                className="flex-1 bg-primary/5 border border-primary/30 rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                                disabled={isLoading}
                            />
                            <button onClick={() => sendMessage(input)} disabled={isLoading || !input.trim()} className="bg-primary text-primary-foreground px-4 rounded flex items-center justify-center hover:opacity-80 transition-opacity disabled:opacity-50">
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {!isOpen && (
                <button onClick={handleOpenChat} className="w-14 h-14 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(var(--color-primary),0.5)] hover:scale-110 transition-transform duration-300 relative group">
                    <Bot className="w-6 h-6" />
                </button>
            )}
        </div>
    );
}