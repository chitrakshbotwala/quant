import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import PodiumDisplay from './PodiumDisplay';
import RankedTable from './RankedTable';

export default function Leaderboard() {
  const [tab, setTab] = useState<'1' | '2' | 'combined'>('1');
  const rows = useLeaderboard(tab === 'combined' ? 'combined' : Number(tab));

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-mono">Leaderboard</h1>
        <Link to="/" className="text-zinc-300">Back</Link>
      </div>
      <div className="flex gap-2">
        <button className={`px-3 py-1 rounded ${tab === '1' ? 'bg-cyan/20 border border-cyan' : 'bg-panel border border-border'}`} onClick={() => setTab('1')}>Round I</button>
        <button className={`px-3 py-1 rounded ${tab === '2' ? 'bg-cyan/20 border border-cyan' : 'bg-panel border border-border'}`} onClick={() => setTab('2')}>Round II</button>
        <button className={`px-3 py-1 rounded ${tab === 'combined' ? 'bg-cyan/20 border border-cyan' : 'bg-panel border border-border'}`} onClick={() => setTab('combined')}>Combined</button>
      </div>
      <PodiumDisplay rows={rows} />
      <RankedTable rows={rows} />
    </div>
  );
}
