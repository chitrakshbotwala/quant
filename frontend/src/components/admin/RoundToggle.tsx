export default function RoundToggle({
  round,
  onStart,
  onStop,
  disabled
}: {
  round: any;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="panel p-4 flex items-center justify-between">
      <div>
        <div className="font-semibold">{round.name}</div>
        <div className="text-xs text-zinc-400">Candle {round.currentCandleIndex}</div>
        <div className={`text-[10px] mt-1 inline-block px-2 py-0.5 rounded border ${round.dataMode === 'SYNTHETIC_DATA' ? 'text-amber border-amber/40' : 'text-green border-green/40'}`}>
          {round.dataMode === 'SYNTHETIC_DATA' ? 'SYNTHETIC DATA' : 'LIVE DATA'}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          disabled={disabled || round.isActive}
          onClick={onStart}
          className="px-3 py-1 rounded border border-green text-green disabled:opacity-50"
        >
          Start
        </button>
        <button
          disabled={disabled || !round.isActive}
          onClick={onStop}
          className="px-3 py-1 rounded border border-red text-red disabled:opacity-50"
        >
          Stop
        </button>
      </div>
    </div>
  );
}
