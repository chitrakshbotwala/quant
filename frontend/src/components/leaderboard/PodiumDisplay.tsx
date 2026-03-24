export default function PodiumDisplay({ rows }: { rows: any[] }) {
  const top = rows.slice(0, 3);
  const order = top.length >= 3 ? [top[1], top[0], top[2]] : top;

  return (
    <div className="grid grid-cols-3 gap-3">
      {order.map((row: any, idx) => (
        <div key={row.id || row.userId || idx} className={`panel p-4 text-center ${idx === 1 ? 'md:-translate-y-3' : ''}`}>
          <div className="text-xs text-zinc-400">Rank {top.length >= 3 ? (idx === 1 ? 1 : idx === 0 ? 2 : 3) : idx + 1}</div>
          <div className="font-semibold">{row.user?.name || row.name || row.user?.email || row.email}</div>
          <div className="font-mono text-green">${Number(row.bookedPnl || row.score || 0).toFixed(2)}</div>
        </div>
      ))}
    </div>
  );
}
