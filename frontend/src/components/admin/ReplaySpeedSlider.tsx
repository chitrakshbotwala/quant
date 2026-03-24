import { useState } from 'react';

export default function ReplaySpeedSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [local, setLocal] = useState(value);

  return (
    <div className="panel p-4 space-y-2">
      <h3 className="font-semibold">Replay Speed</h3>
      <input
        type="range"
        min={0.5}
        max={10}
        step={0.5}
        value={local}
        onChange={(e) => setLocal(Number(e.target.value))}
        onMouseUp={() => onChange(local)}
        onTouchEnd={() => onChange(local)}
        className="w-full"
      />
      <div className="text-sm font-mono">{local.toFixed(1)}x</div>
    </div>
  );
}
