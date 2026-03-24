import { useState } from 'react';

type Payload = {
  roundId: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export default function MarketInjection({
  rounds,
  onInject
}: {
  rounds: Array<{ id: number; name: string }>;
  onInject: (payload: Payload) => Promise<void>;
}) {
  const [form, setForm] = useState<Payload>({ roundId: 1, open: 100, high: 101, low: 99, close: 100, volume: 1000000 });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setError('');

    const { open, high, low, close } = form;
    const valid = high >= Math.max(open, close, low) && low <= Math.min(open, close, high);
    if (!valid) {
      setError('Invalid OHLC: high must be max and low must be min.');
      return;
    }

    try {
      setPending(true);
      await onInject(form);
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="panel p-4 space-y-3">
      <h3 className="font-semibold">Market Injection</h3>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="flex flex-col gap-1 col-span-2">
          <span className="text-zinc-400">Round</span>
          <select
            className="bg-black/30 border border-border rounded px-2 py-1"
            value={form.roundId}
            onChange={(e) => setForm((prev) => ({ ...prev, roundId: Number(e.target.value) }))}
          >
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        {(['open', 'high', 'low', 'close', 'volume'] as const).map((field) => (
          <label key={field} className="flex flex-col gap-1">
            <span className="text-zinc-400 capitalize">{field}</span>
            <input
              className="bg-black/30 border border-border rounded px-2 py-1"
              type="number"
              value={form[field]}
              onChange={(e) => setForm((prev) => ({ ...prev, [field]: Number(e.target.value) }))}
            />
          </label>
        ))}
      </div>
      <button disabled={pending} onClick={submit} className="rounded border border-cyan text-cyan px-3 py-1 disabled:opacity-50">
        Inject Candle
      </button>
      {error && <div className="text-red text-xs break-all">{error}</div>}
    </div>
  );
}