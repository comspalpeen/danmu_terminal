"use client";
import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Lock, Unlock, RefreshCw, Plus, Edit, Trash2, ShieldAlert } from "lucide-react";

const formatDate = (dateStr: string) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('zh-CN', { hour12: false });
};

export default function CookieManagerPage() {
  const [authorized, setAuthorized] = useState(false);
  const [password, setPassword] = useState('');
  const [cookieList, setCookieList] = useState<any[]>([]); 
  const [inputNote, setInputNote] = useState('');
  const [inputCookie, setInputCookie] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);

  useEffect(() => {
    const savedPwd = localStorage.getItem('admin_pwd');
    if (savedPwd) {
      setPassword(savedPwd);
      handleLogin(savedPwd);
    }
  }, []);

  const handleLogin = (pwdInput = password) => {
    if (pwdInput) {
      fetchCookies(pwdInput).then(ok => {
        if (ok) {
            setAuthorized(true);
            localStorage.setItem('admin_pwd', pwdInput);
        }
      });
    }
  };

  const fetchCookies = async (pwd: string) => {
    try {
      const res = await fetch('/api/admin/cookies', {
        headers: { 'x-admin-token': pwd }
      });
      if (res.ok) {
        const data = await res.json();
        setCookieList(data);
        return true;
      } else if (res.status === 403) {
        if (authorized) alert("鉴权失败，请重新登录");
        setAuthorized(false);
        localStorage.removeItem('admin_pwd');
      }
    } catch (err) {
      console.error(err);
    }
    return false;
  };

  const handleSubmit = async () => {
    if (!inputNote) {
        alert("请填写账号备注！");
        return;
    }
    if (!inputCookie.trim()) {
        alert("请填写 Cookie 内容！");
        return;
    }
    
    setLoading(true);
    const res = await fetch('/api/admin/cookies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': password },
      body: JSON.stringify({
        note: inputNote,
        cookie: inputCookie,
        original_cookie_hash: editingItem?.cookie_hash ?? null,
      })
    });
    
    if (res.ok) {
        resetForm();
        fetchCookies(password);
    } else {
        alert("操作失败");
    }
    setLoading(false);
  };

  const handleDelete = async (item: any) => {
    if (!confirm(`确定删除账号 [${item.note || '无备注'}] 吗？\n这是彻底删除，无法恢复！`)) return;
    
    await fetch('/api/admin/cookies', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': password },
      body: JSON.stringify({ note: item.note, cookie: item.cookie })
    });
    fetchCookies(password);
  };

  const handleEdit = (item: any) => {
    setInputNote(item.note || '');
    setInputCookie(item.cookie || '');
    setEditingItem(item);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setInputNote('');
    setInputCookie('');
    setEditingItem(null);
  };

  // 1. 鉴权页面 UI (基于全局变量)
  if (!authorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 animate-in fade-in duration-500">
        <Card className="w-full max-w-md shadow-2xl bg-card/50 backdrop-blur-sm border-border">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-2">
                <Lock className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-black tracking-tight text-foreground">账号池鉴权</CardTitle>
            <CardDescription className="text-muted-foreground font-medium">请输入后端 API 密钥以管理账号</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input 
              type="password" 
              placeholder="API 密钥"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="h-12 bg-background border-input"
            />
            {/* 使用默认 variant="default"，自动应用 --primary 和 --primary-foreground */}
            <Button onClick={() => handleLogin()} className="w-full h-12 font-bold text-base shadow-lg transition-all hover:scale-[1.02]">
              验证并管理
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 2. 主页面 UI (基于全局变量)
  return (
    <div className="p-6 md:p-10 animate-in fade-in duration-300">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-6">
            <div>
                <h1 className="text-3xl font-black text-foreground tracking-tight flex items-center gap-2">
                    🍪 账号池管理
                </h1>
                <p className="text-muted-foreground text-sm mt-2 font-medium">管理用于爬虫的抖音 Cookie 池</p>
            </div>
            <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => fetchCookies(password)} className="shadow-sm">
                    <RefreshCw className="w-4 h-4 mr-2 text-primary" />
                    刷新列表
                </Button>
                <Button variant="secondary" onClick={() => {setAuthorized(false); localStorage.removeItem('admin_pwd')}} className="shadow-sm">
                    <Unlock className="w-4 h-4 mr-2 text-foreground" />
                    锁定/退出
                </Button>
            </div>
        </div>
        <Card className={`shadow-xl transition-all duration-300 border ${editingItem ? 'bg-primary/5 border-primary/30' : 'bg-card border-border'}`}>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                {editingItem ? (
                    <><Edit className="w-5 h-5 text-primary"/> 正在编辑: {editingItem.note}</>
                ) : (
                    <><Plus className="w-5 h-5 text-primary"/> 添加 / 更新账号</>
                )}
                </CardTitle>
                {editingItem && (
                    <Button variant="ghost" size="sm" onClick={resetForm} className="text-muted-foreground hover:text-foreground h-8">
                        取消编辑
                    </Button>
                )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
                <div className="flex flex-col md:flex-row gap-6">
                <div className="md:w-1/3 space-y-2 shrink-0">
                    <label className="text-sm font-bold text-foreground ml-1">账号备注 (唯一标识)</label>
                    <Input 
                        placeholder="例如: 抖音小号01" 
                        value={inputNote}
                        disabled={!!editingItem}
                        onChange={e => setInputNote(e.target.value)}
                        className={`h-11 shadow-sm ${editingItem ? 'bg-muted text-muted-foreground opacity-70 cursor-not-allowed' : 'bg-background'}`}
                    />
                    {editingItem && <p className="text-xs text-destructive mt-1 font-bold ml-1 flex items-center gap-1"><ShieldAlert className="w-3 h-3"/> 编辑模式下不可修改备注名</p>}
                </div>
                <div className="md:w-2/3 space-y-2 flex-1 min-w-0">
                    <label className="text-sm font-bold text-foreground ml-1">Cookie 内容</label>
                    <Input 
                        placeholder="粘贴完整的 Cookie 字符串..." 
                        value={inputCookie}
                        onChange={e => setInputCookie(e.target.value)}
                        className="h-11 shadow-sm font-mono text-xs bg-background"
                    />
                </div>
            </div>
            <div className="flex justify-end pt-2">
                {/* 默认状态使用 default (Primary)，编辑状态使用 secondary 或继续用 default 加以强调 */}
                <Button 
                    variant={editingItem ? "secondary" : "default"}
                    onClick={handleSubmit} 
                    disabled={loading}
                    className="h-11 px-8 font-bold shadow-md transition-transform active:scale-95"
                >
                    {loading ? '提交中...' : (editingItem ? '确认修改 (覆盖旧值)' : '保存新账号')}
                </Button>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-xl bg-card border-border overflow-hidden w-full">
            {/* 加入 overflow-x-auto 兜底，防止极端小屏幕下的布局崩塌 */}
            <div className="overflow-x-auto w-full">
                <Table className="w-full">
                    <TableHeader className="bg-muted/50">
                    <TableRow className="hover:bg-transparent border-border">
                        <TableHead className="w-[80px] md:w-[100px] text-center font-bold text-foreground">状态</TableHead>
                        <TableHead className="w-[120px] md:w-[200px] font-bold text-foreground">账号备注</TableHead>
                        <TableHead className="max-w-[200px] md:max-w-[400px] lg:max-w-[500px] font-bold text-foreground">Cookie 摘要</TableHead>
                        <TableHead className="w-[120px] md:w-[150px] text-center font-bold text-foreground">操作</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {cookieList.map((item, idx) => {
                        const isExpired = !item.cookie;
                        const isEditing = editingItem?.cookie_hash === item.cookie_hash;
                        return (
                        <TableRow key={item.cookie_hash || `${item.note || 'cookie'}-${idx}`} className={`border-border ${isExpired ? 'bg-destructive/5' : ''} ${isEditing ? 'bg-primary/5' : ''}`}>
                            <TableCell className="text-center font-medium">
                            {isExpired ? (
                                <Badge variant="destructive" className="font-bold px-2 py-0.5 shadow-sm whitespace-nowrap">失效</Badge>
                            ) : (
                                <Badge variant="default" className="font-bold px-2 py-0.5 shadow-sm whitespace-nowrap">正常</Badge>
                            )}
                            </TableCell>
                            <TableCell>
                                <div className="font-bold text-foreground text-sm md:text-base flex items-center gap-2 truncate">
                                    {item.note || <span className="text-muted-foreground italic font-normal">无备注</span>}
                                </div>
                                <div className="text-[10px] md:text-xs text-muted-foreground mt-1 font-medium whitespace-nowrap">更新于: {formatDate(item.updated_at)}</div>
                            </TableCell>
                            <TableCell className="max-w-[200px] md:max-w-[400px] lg:max-w-[500px]">
                                <div className="font-mono text-[10px] md:text-xs text-muted-foreground break-all line-clamp-2 bg-muted/50 p-2 rounded-md border border-border overflow-hidden text-ellipsis">
                                    {isExpired ? (
                                        <span className="text-destructive font-bold flex items-center gap-1"><ShieldAlert className="w-3 h-3 shrink-0"/> Cookie 已清除，请点击修复</span>
                                    ) : (
                                        item.cookie
                                    )}
                                </div>
                            </TableCell>
                            <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-2">
                                    <Button 
                                        variant={isExpired ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => handleEdit(item)}
                                        className={`font-bold h-8 px-3 ${!isExpired && 'text-primary border-primary/20 hover:bg-primary/10'}`}
                                    >
                                        {isExpired ? '修复' : '编辑'}
                                    </Button>
                                    <Button 
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDelete(item)}
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-2"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                        );
                    })}
                    {cookieList.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={4} className="h-32 text-center text-muted-foreground font-medium border-border">
                                暂无数据，请在上方添加
                            </TableCell>
                        </TableRow>
                    )}
                    </TableBody>
                </Table>
            </div>
        </Card>
      </div>
    </div>
  );
}