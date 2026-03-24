import { Link } from 'react-router-dom';
import { Round } from '../../types';

type Props = { round: Round };

export default function RoundCard({ round }: Props) {
  const status = round.isActive ? 'ACTIVE' : round.currentCandleIndex > 0 ? 'ENDED' : 'LOCKED';

  return (
    <div className="panel p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">{round.name}</h3>
        <span className={`text-xs px-2 py-1 rounded ${status === 'ACTIVE' ? 'bg-green/20 text-green animate-pulse' : 'bg-zinc-700 text-zinc-300'}`}>
          {status === 'ACTIVE' ? 'LIVE' : status}
        </span>
      </div>
      <p className="text-zinc-400 text-sm">Candle: {round.currentCandleIndex}</p>
      <Link to={`/trade/${round.id}`} className="inline-block rounded-lg border border-border bg-black/20 px-4 py-2 hover:border-cyan">
        Open Round
      </Link>
    </div>
  );
}
