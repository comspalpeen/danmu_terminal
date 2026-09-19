'use client';

import { useState, useEffect } from 'react';
import { Heart, Crosshair } from 'lucide-react';

type Theme = 'tactical' | 'pink';

const ThemeSwitcher = () => {
  const [theme, setTheme] = useState<Theme>('tactical');
  const [mounted, setMounted] = useState(false);

  // 初始化时从本地存储读取主题
  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem('app-theme') as Theme;
    if (savedTheme) {
      setTheme(savedTheme);
      applyTheme(savedTheme);
    }
  }, []);

  const applyTheme = (newTheme: Theme) => {
    const root = document.documentElement;
    if (newTheme === 'pink') {
      root.classList.add('theme-pink');
    } else {
      root.classList.remove('theme-pink');
    }
    localStorage.setItem('app-theme', newTheme);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'tactical' ? 'pink' : 'tactical';
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  // 避免服务端渲染不匹配
  if (!mounted) return null;

  const isTactical = theme === 'tactical';

  return (
    <button
      onClick={toggleTheme}
      // 根据不同主题设置不同的按钮样式
      className={`
        relative overflow-hidden h-10 px-4 transition-all duration-500 group
        flex items-center gap-2 font-bold tracking-widest
        ${isTactical 
          ? 'bg-[#00FF7F]/10 text-[#00FF7F] border border-[#00FF7F]/50 hover:bg-[#00FF7F] hover:text-black font-mono uppercase' 
          : 'bg-pink-100 text-pink-500 border-2 border-pink-300 hover:bg-pink-200 hover:border-pink-400 rounded-full shadow-[0_4px_0_rgb(249,168,212)] hover:shadow-[0_2px_0_rgb(249,168,212)] hover:translate-y-[2px]'
        }
      `}
    >
      {/* 战术风格装饰 */}
      {isTactical && (
        <>
          <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-current"></div>
          <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-current"></div>
        </>
      )}
      <div className="relative w-5 h-5">
        <Crosshair className={`absolute inset-0 w-full h-full transition-all duration-500 ${isTactical ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-50'}`} />
        <Heart className={`absolute inset-0 w-full h-full fill-current transition-all duration-500 ${!isTactical ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'}`} />
      </div>

      {/* 文字切换
      <span className="relative z-10">
        {isTactical ? '' : ''}
      </span> */}
      
      {/* 粉红风格光晕动画 */}
      {!isTactical && (
         <span className="absolute inset-0 rounded-full bg-pink-400/20 scale-0 group-hover:scale-150 transition-transform duration-500 origin-center"></span>
      )}
    </button>
  );
};

export default ThemeSwitcher;