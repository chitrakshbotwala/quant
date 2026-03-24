export default function DrawdownMeter({ drawdownPct }: { drawdownPct: number }) {
  const color = drawdownPct < 5 ? 'bg-green' : drawdownPct < 12 ? 'bg-amber' : 'bg-red';
  const width = Math.min(100, Math.max(0, drawdownPct * 2));

  return (
    <div className="panel p-4 space-y-2">
      <div className="text-xs text-zinc-400">Drawdown Meter</div>
      <div className="h-3 bg-black/30 rounded overflow-hidden">
        <div className={`${color} h-full`} style={{ width: `${width}%` }} />
      </div>
      <div className="text-sm font-mono">{drawdownPct.toFixed(2)}%</div>
    </div>
  );
}
