export default function PositionsTable({ positions }: { positions: any[] }) {
  return (
    <div className="panel p-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-zinc-400">
          <tr>
            <th className="text-left">Direction</th>
            <th className="text-left">Entry</th>
            <th className="text-left">Current</th>
            <th className="text-left">Size</th>
            <th className="text-left">Unrealized</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.id} className="border-t border-border">
              <td>{p.direction}</td>
              <td>{Number(p.entryPrice).toFixed(2)}</td>
              <td>{Number(p.currentPrice ?? p.entryPrice).toFixed(2)}</td>
              <td>{Number(p.sizeUsd || 0).toFixed(2)}</td>
              <td className={Number(p.unrealizedPnl || 0) >= 0 ? 'text-green' : 'text-red'}>{Number(p.unrealizedPnl || 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
