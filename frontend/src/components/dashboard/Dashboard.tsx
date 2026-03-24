import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../lib/api';
import RoundCard from './RoundCard';
import { Round } from '../../types';
import { useAuth } from '../../context/AuthContext';

export default function Dashboard() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    apiGet<Round[]>('/rounds').then(setRounds).catch(() => setRounds([]));
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-mono">KRONOSPHERE Dashboard</h1>
        <div className="space-x-3 text-sm">
          <Link to="/leaderboard" className="text-cyan">Leaderboard</Link>
          <Link to="/profile" className="text-zinc-300">Profile</Link>
          {user?.isAdmin && <Link to="/admin" className="text-amber">Admin</Link>}
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {rounds.map((r) => <RoundCard key={r.id} round={r} />)}
        {rounds.length === 0 && (
          <div className="panel p-6 text-sm text-zinc-300 md:col-span-2">
            No rounds available yet. Ensure backend is running and refresh this page.
          </div>
        )}
      </div>
    </div>
  );
}
