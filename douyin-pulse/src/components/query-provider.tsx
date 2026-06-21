"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, ReactNode } from "react";

export default function QueryProvider({ children }: { children: ReactNode }) {
  // 确保 QueryClient 在组件生命周期内只创建一次
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // 全局配置：数据 5 秒后视为过时，自动刷新
        staleTime: 5000, 
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}