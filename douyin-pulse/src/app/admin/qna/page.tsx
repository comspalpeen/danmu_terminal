'use client';

import { useState, useEffect } from 'react';

interface QnA {
    id?: string;
    question: string;
    answer: string;
    order: number;
    is_visible: boolean;
}

export default function AdminQnaPage() {
    const [list, setList] = useState<QnA[]>([]);
    const [loading, setLoading] = useState(false);
    
    // 表单状态
    const [form, setForm] = useState<QnA>({ question: '', answer: '', order: 0, is_visible: true });
    // 为 null 时表示创建模式。
    const [editingId, setEditingId] = useState<string | null>(null);

    const fetchList = async () => {
        try {
            const res = await fetch('/api/qna?visible_only=false');
            if (res.ok) {
                setList(await res.json());
            }
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => { fetchList(); }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // 构造提交数据：如果是编辑模式，必须带上 id
            const payload = editingId ? { ...form, id: editingId } : form;

            const res = await fetch('/api/qna', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                resetForm(); // 提交成功清空表单
                fetchList(); // 刷新列表
            } else {
                alert("保存失败，请重试");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if(!confirm('确定删除这条问答吗?')) return;
        await fetch(`/api/qna/${id}`, { method: 'DELETE' });
        fetchList();
    };

    const handleEdit = (item: QnA) => {
        if (!item.id) return;
        // 填充表单
        setForm({
            question: item.question,
            answer: item.answer,
            order: item.order,
            is_visible: item.is_visible
        });
        setEditingId(item.id); // 标记正在编辑的 ID
        
        // 滚动到顶部方便编辑
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const resetForm = () => {
        setForm({ question: '', answer: '', order: 0, is_visible: true });
        setEditingId(null);
    };

    return (
        <div className="min-h-screen bg-background p-6 md:p-12 text-foreground">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-foreground">Q&A 内容管理</h1>
                    <button onClick={fetchList} className="text-primary hover:underline">刷新列表</button>
                </div>
                <div className={`p-6 rounded-xl shadow-sm border mb-8 transition-colors ${editingId ? 'bg-primary/5 border-primary/30' : 'bg-card border-border'}`}>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-foreground">
                            {editingId ? '✏️ 编辑模式' : '➕ 添加新问答'}
                        </h2>
                        {editingId && (
                            <button onClick={resetForm} className="text-sm text-muted-foreground hover:text-foreground underline">
                                取消编辑
                            </button>
                        )}
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-bold text-muted-foreground mb-1">问题 (Question)</label>
                            <input 
                                type="text" 
                                required
                                data-slot="input"
                                className="w-full bg-background text-foreground p-3 focus:outline-none" 
                                placeholder="输入用户常问的问题..."
                                value={form.question}
                                onChange={e => setForm({...form, question: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-muted-foreground mb-1">回答 (Answer)</label>
                            <textarea 
                                required
                                data-slot="input"
                                className="w-full bg-background text-foreground p-3 h-32 focus:outline-none custom-scrollbar"
                                placeholder="输入详细解答..."
                                value={form.answer}
                                onChange={e => setForm({...form, answer: e.target.value})}
                            />
                        </div>

                        <div className="flex flex-col md:flex-row gap-6">
                            <div>
                                <label className="block text-sm font-bold text-muted-foreground mb-1">排序权重</label>
                                <input 
                                    type="number" 
                                    data-slot="input"
                                    className="bg-background text-foreground p-2 w-32 focus:outline-none"
                                    value={form.order}
                                    onChange={e => setForm({...form, order: parseInt(e.target.value) || 0})}
                                />
                                <p className="text-xs text-muted-foreground mt-1">数字越大越靠前</p>
                            </div>
                            <div className="flex items-center pt-6">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input 
                                        type="checkbox" 
                                        className="w-5 h-5 text-primary rounded ring-offset-background focus:ring-primary accent-primary"
                                        checked={form.is_visible}
                                        onChange={e => setForm({...form, is_visible: e.target.checked})}
                                    />
                                    <span className="text-foreground font-medium">在前台显示</span>
                                </label>
                            </div>
                        </div>
                        <div className="pt-2 flex gap-3">
                            <button 
                                type="submit" 
                                disabled={loading}
                                data-slot="button"
                                className={`px-8 py-2.5 text-primary-foreground font-bold shadow-md transition-all ${
                                    editingId 
                                    ? 'bg-accent hover:opacity-90' 
                                    : 'bg-primary hover:opacity-90'
                                } disabled:opacity-50`}
                            >
                                {loading ? '提交中...' : (editingId ? '保存修改' : '立即发布')}
                            </button>
                            
                            {editingId && (
                                <button 
                                    type="button" 
                                    onClick={resetForm} 
                                    data-slot="button"
                                    className="px-6 py-2.5 border border-border bg-card text-foreground hover:bg-muted font-medium"
                                >
                                    放弃
                                </button>
                            )}
                        </div>
                    </form>
                </div>
                <div className="space-y-4">
                    <h3 className="text-lg font-bold text-foreground pl-1">已发布列表 ({list.length})</h3>
                    
                    {list.length === 0 && (
                        <div className="text-center py-10 text-muted-foreground bg-card rounded-[var(--radius)] border border-border border-dashed">暂无数据</div>
                    )}

                    {list.map(item => (
                        <div 
                            key={item.id} 
                            className={`bg-card p-5 rounded-[var(--radius)] shadow-sm border border-border flex flex-col md:flex-row gap-4 justify-between group transition-all hover:border-primary/50 ${editingId === item.id ? 'ring-2 ring-primary/50' : ''}`}
                        >
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="bg-muted text-muted-foreground text-xs font-bold px-2 py-1 rounded">
                                        #{item.order}
                                    </span>
                                    {!item.is_visible && (
                                        <span className="bg-destructive/10 text-destructive text-xs font-bold px-2 py-1 rounded">
                                            已隐藏
                                        </span>
                                    )}
                                    <h4 className="font-bold text-lg text-foreground">{item.question}</h4>
                                </div>
                                <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap pl-1">
                                    {item.answer}
                                </p>
                            </div>
                            <div className="flex md:flex-col gap-2 items-end justify-start min-w-[80px]">
                                <button 
                                    onClick={() => handleEdit(item)} 
                                    className="text-sm font-medium text-primary hover:text-primary-foreground hover:bg-primary px-3 py-1.5 rounded transition-colors w-full border border-transparent hover:border-primary border-primary/20 bg-primary/10"
                                >
                                    编辑
                                </button>
                                <button 
                                    onClick={() => item.id && handleDelete(item.id)} 
                                    className="text-sm font-medium text-destructive hover:text-destructive-foreground hover:bg-destructive px-3 py-1.5 rounded transition-colors w-full border border-transparent hover:border-destructive border-destructive/20 bg-destructive/10"
                                >
                                    删除
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
