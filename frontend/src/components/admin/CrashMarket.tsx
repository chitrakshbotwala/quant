import { useState } from 'react';

type Severity = 'mild' | 'moderate' | 'severe';

export default function CrashMarket({
  rounds,
  onCrash
}: {
  rounds: Array<{ id: number; name: string }>;
  onCrash: (payload: { roundId: number; severity: Severity }) => Promise<void>;
}) {
  const [roundId, setRoundId] = useState(1);
  const [severity, setSeverity] = useState<Severity>('moderate');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const trigger = async () => {
    const confirmed = window.confirm('This will inject 5 consecutive sharp down candles. Participants will see an immediate market drop. Are you sure?');
    if (!confirmed) return;

    setError('');
    try {
      setPending(true);
      await onCrash({ roundId, severity });
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="panel p-4 space-y-3 border-red/30">
      <h3 className="font-semibold text-red">Crash Market</h3>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-zinc-400">Round</span>
          <select className="bg-black/30 border border-border rounded px-2 py-1" value={roundId} onChange={(e) => setRoundId(Number(e.target.value))}>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-zinc-400">Severity</span>
          <select className="bg-black/30 border border-border rounded px-2 py-1" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
            <option value="mild">Mild (-5%)</option>
            <option value="moderate">Moderate (-15%)</option>
            <option value="severe">Severe (-30%)</option>
          </select>
        </label>
      </div>

      <button disabled={pending} onClick={trigger} className="rounded border border-red text-red px-3 py-1 bg-red/10 hover:bg-red/20 disabled:opacity-50">
        Crash Market
      </button>
      {error && <div className="text-red text-xs break-all">{error}</div>}
    </div>
  );
}