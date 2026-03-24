type Params = {
  fastMaPeriod: number;
  slowMaPeriod: number;
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
  positionSizePct: number;
  maxOpenPositions: number;
  stopLossPct: number;
  takeProfitPct: number;
  cooldownCandles: number;
};

export default function ParameterForm({ params, onChange, readOnly }: { params: Params; onChange: (next: Params) => void; readOnly?: boolean }) {
  return (
    <div className="panel p-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
      {Object.entries(params).map(([k, v]) => (
        <label key={k} className="flex flex-col gap-1">
          <span className="text-zinc-400">{k}</span>
          <input
            className="bg-black/30 border border-border rounded px-2 py-1"
            type="number"
            value={v}
            disabled={readOnly}
            onChange={(e) => onChange({ ...params, [k]: Number(e.target.value) })}
          />
        </label>
      ))}
    </div>
  );
}
