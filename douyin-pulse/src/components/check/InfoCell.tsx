export function InfoCell({ label, value, color = "text-foreground" }: { label: string, value: any, color?: string }) {
  // 注意：如果外部传入了写死的颜色 (如 text-emerald-400)，建议在调用处也改为 text-primary 或 text-accent
  return (
    <div className="space-y-1.5 p-3 bg-muted/50 rounded-[var(--radius)] border border-border hover:bg-muted transition-colors duration-500">
      <label className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">{label}</label>
      <div className={`text-base font-bold truncate ${color}`}>{value || '--'}</div>
    </div>
  );
}