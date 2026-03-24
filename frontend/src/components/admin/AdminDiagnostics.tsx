type AdminEvent = {
  id: number;
  at: string;
  type: string;
  roundId?: number;
  details?: Record<string, unknown>;
};

type RoundDiagnostics = {
  id: number;
  name: string;
  isActive: boolean;
  dataMode: 'LIVE_DATA' | 'SYNTHETIC_DATA';
  splitIndex: number;
  currentCandleIndex: number;
  originalCandleCount: number;
  totalCandles: number;
  syntheticCandles: number;
  portfolioCount: number;
  activePortfolios: number;
  openTrades: number;
  closedTrades: number;
  lastCandle: { index: number; timestamp: string; close: number } | null;
  runtime: {
    redisCurrentIndex: number;
    redisActive: boolean;
    redisSpeed: number;
  };
};

type DiagnosticsPayload = {
  generatedAt: string;
  wsConnections: number;
  rounds: RoundDiagnostics[];
  recentEvents: AdminEvent[];
};

function fmtTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

export default function AdminDiagnostics({ data }: { data: DiagnosticsPayload | null }) {
  if (!data) {
    return (
      <div className="panel p-4 text-sm text-zinc-400">
        Diagnostics unavailable.
      </div>
    );
  }

  return (
    <div className="panel p-4 space-y-4 text-sm font-mono">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold font-sans">Admin Diagnostics</h3>
        <div className="text-xs text-zinc-400">Updated {fmtTime(data.generatedAt)}</div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {data.rounds.map((r) => (
          <div key={r.id} className="border border-border rounded p-3 space-y-1 bg-black/20">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{r.name}</div>
              <div className={r.isActive ? 'text-green' : 'text-zinc-400'}>{r.isActive ? 'ACTIVE' : 'PAUSED'}</div>
            </div>
            <div>Data Mode: <span className={r.dataMode === 'SYNTHETIC_DATA' ? 'text-amber' : 'text-green'}>{r.dataMode}</span></div>
            <div>Cursor: {r.currentCandleIndex} / Split {r.splitIndex}</div>
            <div>Candles: total {r.totalCandles}, baseline {r.originalCandleCount}, synthetic {r.syntheticCandles}</div>
            <div>Portfolios: {r.activePortfolios} active / {r.portfolioCount} total</div>
            <div>Trades: {r.openTrades} open / {r.closedTrades} closed</div>
            <div>Last Candle: {r.lastCandle ? `#${r.lastCandle.index} close=${r.lastCandle.close.toFixed(2)}` : '-'}</div>
            <div>Runtime: active={String(r.runtime.redisActive)} speed={r.runtime.redisSpeed} idx={r.runtime.redisCurrentIndex}</div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="font-semibold font-sans">Recent Admin Events</div>
        <div className="max-h-48 overflow-auto space-y-1">
          {data.recentEvents.length === 0 && <div className="text-zinc-500">No admin events logged yet.</div>}
          {data.recentEvents.map((evt) => (
            <div key={evt.id} className="text-xs text-zinc-300 border-b border-border/40 pb-1">
              <span className="text-zinc-500">[{fmtTime(evt.at)}]</span> {evt.type}
              {typeof evt.roundId === 'number' ? ` [round:${evt.roundId}]` : ''}
              {evt.details ? ` ${JSON.stringify(evt.details)}` : ''}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
