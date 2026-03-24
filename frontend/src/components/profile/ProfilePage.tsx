import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createChart, ColorType, type IChartApi } from 'lightweight-charts';
import { apiGet } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

type ProfileResponse = {
  user: {
    name?: string | null;
    email: string;
    teamId?: string | null;
  };
  round1: {
    bestBookedPnl: number;
    runCount: number;
    bestRunNumber: number | null;
  };
  round2: {
    finalBookedPnl: number | null;
    sessionLocked: boolean;
  };
  combinedScore: number;
  trades: Array<{
    id: string;
    roundId: number;
    direction: string;
    entryPrice: number;
    exitPrice: number | null;
    sizeUsd: number;
    pnl: number;
    closeReason: string;
    closedAt: string | null;
  }>;
  pnlCurve: Array<{
    time: string;
    cumulativeBookedPnl: number;
  }>;
};

export default function ProfilePage() {
  const { user } = useAuth();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    apiGet<ProfileResponse>('/profile')
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const container = chartRef.current;
    if (!container) return;

    if (chartApiRef.current) {
      try {
        chartApiRef.current.remove();
      } catch {
        // Ignore disposal races in StrictMode/dev re-mount cycles.
      }
      chartApiRef.current = null;
    }

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 240,
      layout: { background: { type: ColorType.Solid, color: '#07121f' }, textColor: '#d4d4d8' },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.06)' },
        horzLines: { color: 'rgba(255,255,255,0.06)' }
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.15)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.15)' }
    });

    const bySecond = new Map<number, number>();
    for (const point of data?.pnlCurve || []) {
      const sec = Math.floor(new Date(point.time).getTime() / 1000);
      if (!Number.isFinite(sec)) continue;
      // Keep last value for duplicate timestamps to satisfy strict ascending-time requirement.
      bySecond.set(sec, point.cumulativeBookedPnl);
    }

    const seriesData = Array.from(bySecond.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, value]) => ({ time: time as any, value }));

    const line = chart.addLineSeries({ color: '#00d6ff', lineWidth: 2 });
    line.setData(seriesData);
    chart.timeScale().fitContent();

    const onResize = () => chart.applyOptions({ width: container.clientWidth });
    window.addEventListener('resize', onResize);
    chartApiRef.current = chart;

    return () => {
      window.removeEventListener('resize', onResize);
      try {
        chart.remove();
      } catch {
        // Ignore if chart was already disposed by an earlier cleanup.
      }
      if (chartApiRef.current === chart) {
        chartApiRef.current = null;
      }
    };
  }, [data]);

  const sortedTrades = useMemo(
    () => [...(data?.trades || [])].sort((a, b) => new Date(b.closedAt || 0).getTime() - new Date(a.closedAt || 0).getTime()),
    [data]
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-mono">Profile</h1>
        <Link to="/dashboard" className="text-zinc-300">Back</Link>
      </div>

      {loading && <div className="panel p-3 text-zinc-300 text-sm">Loading profile...</div>}
      {error && <div className="panel p-3 text-red text-sm">{error}</div>}

      <div className="panel p-4 flex items-center gap-4">
        <img
          src={user?.photoURL || 'https://placehold.co/80x80/0b1220/ffffff?text=U'}
          alt="avatar"
          className="w-16 h-16 rounded-full border border-border object-cover"
        />
        <div>
          <div className="text-lg font-semibold">{data?.user?.name || user?.name || 'Participant'}</div>
          <div className="text-sm text-zinc-300">{data?.user?.email || user?.email}</div>
          <div className="text-xs text-zinc-500">Team ID: {data?.user?.teamId || '-'}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 text-sm font-mono">
        <div className="panel p-4 space-y-1">
          <div className="text-zinc-400">Round I Best</div>
          <div>${Number(data?.round1.bestBookedPnl || 0).toFixed(2)}</div>
          <div className="text-zinc-500">Runs: {data?.round1.runCount || 0}</div>
          <div className="text-zinc-500">Best Run #: {data?.round1.bestRunNumber ?? '-'}</div>
        </div>
        <div className="panel p-4 space-y-1">
          <div className="text-zinc-400">Round II Final</div>
          <div>{data?.round2.finalBookedPnl == null ? 'Not yet played' : `$${Number(data.round2.finalBookedPnl).toFixed(2)}`}</div>
          <div className="text-zinc-500">Session Locked: {data?.round2.sessionLocked ? 'Yes' : 'No'}</div>
        </div>
        <div className="panel p-4 space-y-1">
          <div className="text-zinc-400">Combined Score</div>
          <div>${Number(data?.combinedScore || 0).toFixed(2)}</div>
        </div>
      </div>

      <div className="panel p-4">
        <div className="text-sm text-zinc-400 mb-2">P&L Curve (Cumulative Booked PnL)</div>
        <div ref={chartRef} className="w-full" />
      </div>

      <div className="panel p-4 overflow-x-auto">
        <div className="text-sm text-zinc-400 mb-3">Closed Trades</div>
        <table className="w-full text-sm">
          <thead className="text-zinc-400">
            <tr>
              <th className="text-left">Round</th>
              <th className="text-left">Direction</th>
              <th className="text-left">Entry</th>
              <th className="text-left">Exit</th>
              <th className="text-left">Size</th>
              <th className="text-left">P&L</th>
              <th className="text-left">Reason</th>
              <th className="text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {sortedTrades.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td>{t.roundId}</td>
                <td>{t.direction}</td>
                <td>{Number(t.entryPrice).toFixed(2)}</td>
                <td>{t.exitPrice == null ? '-' : Number(t.exitPrice).toFixed(2)}</td>
                <td>{Number(t.sizeUsd).toFixed(2)}</td>
                <td className={Number(t.pnl) >= 0 ? 'text-green' : 'text-red'}>{Number(t.pnl).toFixed(2)}</td>
                <td>{t.closeReason || '-'}</td>
                <td>{t.closedAt ? new Date(t.closedAt).toLocaleString() : '-'}</td>
              </tr>
            ))}
            {sortedTrades.length === 0 && (
              <tr>
                <td colSpan={8} className="pt-3 text-zinc-500">No closed trades yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}