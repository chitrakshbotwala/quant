export default function RankedTable({ rows }: { rows: any[] }) {
  const startIndex = rows.length >= 3 ? 3 : 0;
  const bodyRows = rows.slice(startIndex);

  return (
    <div className="panel p-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-zinc-400">
          <tr>
            <th className="text-left">Rank</th>
            <th className="text-left">Name</th>
            <th className="text-left">Team</th>
            <th className="text-left">Score</th>
            <th className="text-left">Run Count</th>
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((r, i) => (
            <tr key={r.id || r.userId || i} className="border-t border-border">
              <td>{i + startIndex + 1}</td>
              <td>{r.user?.name || r.name || r.user?.email || r.email}</td>
              <td>{r.user?.teamId || r.teamId || '-'}</td>
              <td className="font-mono">{Number(r.bookedPnl || r.score || 0).toFixed(2)}</td>
              <td>{r.runCount || '-'}</td>
            </tr>
          ))}
          {bodyRows.length === 0 && (
            <tr>
              <td colSpan={5} className="pt-3 text-zinc-500">No leaderboard entries yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
