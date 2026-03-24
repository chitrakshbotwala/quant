import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';

export function useLeaderboard(roundId: number | 'combined') {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    const load = () => {
      const path = roundId === 'combined' ? '/leaderboard/combined' : `/leaderboard/round/${roundId}`;
      apiGet<any[]>(path).then(setRows).catch(() => setRows([]));
    };

    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [roundId]);

  return rows;
}
