export function FansBadge({ url, level }: { url?: string, level: number }) {
  if (!url) return <div className="h-5 w-8" />; 
  
  return (
    <div className="relative flex flex-col items-center justify-center">
      <img 
        src={url} 
        alt="Badge" 
        // 使用 var(--color-primary) 让光晕在战术模式下是主色，在粉红模式下是粉色
        className={`h-5 w-auto object-contain transition-all duration-500 ${
          level > 0 ? "drop-shadow-[0_0_5px_var(--color-primary)] scale-110" : "grayscale opacity-30"
        }`} 
      />
      <div className={`text-[9px] font-black leading-none mt-0.5 transition-colors duration-500 ${level > 0 ? "text-foreground" : "text-muted-foreground"}`}>
        Lv.{level}
      </div>
    </div>
  );
}