import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPatch, apiPost } from '../../lib/api';
import RoundToggle from './RoundToggle';
import UserManagement from './UserManagement';
import CSVUpload from './CSVUpload';
import SystemHealth from './SystemHealth';
import ReplaySpeedSlider from './ReplaySpeedSlider';
import MarketInjection from './MarketInjection';
import CrashMarket from './CrashMarket';
import AdminDiagnostics from './AdminDiagnostics';

export default function AdminPanel() {
  const [rounds, setRounds] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [adminLogs, setAdminLogs] = useState<Array<{ at: string; level: 'info' | 'error'; message: string }>>([]);
  const [error, setError] = useState('');
  const [pendingRoundId, setPendingRoundId] = useState<number | null>(null);

  const pushAdminLog = (level: 'info' | 'error', message: string) => {
    setAdminLogs((prev) => [{ at: new Date().toISOString(), level, message }, ...prev].slice(0, 60));
  };

  const load = () => {
    apiGet<any[]>('/admin/rounds').then(setRounds).catch((e) => {
      setError(`Failed to load rounds: ${String(e)}`);
      setRounds([]);
    });
    apiGet<any[]>('/admin/users').then(setUsers).catch((e) => {
      setError(`Failed to load users: ${String(e)}`);
      setUsers([]);
    });
    apiGet<any>('/admin/health').then(setHealth).catch((e) => {
      setError(`Failed to load health: ${String(e)}`);
      setHealth(null);
    });
    apiGet<any>('/admin/diagnostics').then(setDiagnostics).catch((e) => {
      setError(`Failed to load diagnostics: ${String(e)}`);
      setDiagnostics(null);
    });
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  const toggleRound = async (id: number, active: boolean) => {
    setError('');
    setPendingRoundId(id);
    try {
      await apiPatch(`/admin/rounds/${id}/toggle`, { active });
      pushAdminLog('info', `Round ${id} ${active ? 'started' : 'stopped'}.`);
      load();
    } catch (e) {
      setError(`Toggle failed for round ${id}: ${String(e)}`);
      pushAdminLog('error', `Round ${id} toggle failed.`);
    } finally {
      setPendingRoundId(null);
    }
  };

  const updateSpeed = async (id: number, speed: number) => {
    setError('');
    try {
      await apiPatch(`/admin/rounds/${id}/speed`, { speed });
      pushAdminLog('info', `Round ${id} speed set to ${speed}x.`);
      load();
    } catch (e) {
      setError(`Speed update failed for round ${id}: ${String(e)}`);
      pushAdminLog('error', `Round ${id} speed update failed.`);
    }
  };

  const ban = async (id: string) => {
    setError('');
    try {
      await apiPatch(`/admin/users/${id}/ban`, {});
      pushAdminLog('info', `User ${id} banned.`);
      load();
    } catch (e) {
      setError(`Ban failed: ${String(e)}`);
      pushAdminLog('error', `Ban failed for user ${id}.`);
    }
  };

  const upload = async (rows: Array<{ email: string; name?: string; teamId?: string }>) => {
    setError('');
    try {
      await apiPost('/admin/allowlist/upload', rows);
      pushAdminLog('info', `Allowlist uploaded (${rows.length} rows).`);
      load();
    } catch (e) {
      setError(`Allowlist upload failed: ${String(e)}`);
      pushAdminLog('error', 'Allowlist upload failed.');
    }
  };

  const injectCandle = async (payload: { roundId: number; open: number; high: number; low: number; close: number; volume: number }) => {
    const out = await apiPost<any>(`/admin/rounds/${payload.roundId}/inject-candle`, {
      open: payload.open,
      high: payload.high,
      low: payload.low,
      close: payload.close,
      volume: payload.volume
    });
    pushAdminLog('info', `Injected candle in round ${payload.roundId} at index ${out?.candleIndex ?? '-'} close=${payload.close}.`);
    load();
  };

  const crashMarket = async (payload: { roundId: number; severity: 'mild' | 'moderate' | 'severe' }) => {
    const out = await apiPost<any>(`/admin/rounds/${payload.roundId}/crash`, { severity: payload.severity });
    pushAdminLog('info', `Crash injected in round ${payload.roundId}: ${payload.severity}, start index ${out?.startIndex ?? '-'}.`);
    load();
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-mono">Admin Panel</h1>
        <Link to="/" className="text-zinc-300">Back</Link>
      </div>

      {error && <div className="panel p-3 text-sm text-red">{error}</div>}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          {rounds.map((r) => (
            <div key={r.id} className="space-y-2">
              <RoundToggle
                round={r}
                onStart={() => toggleRound(r.id, true)}
                onStop={() => toggleRound(r.id, false)}
                disabled={pendingRoundId === r.id}
              />
              <ReplaySpeedSlider value={r.replaySpeed || 1} onChange={(speed) => updateSpeed(r.id, speed)} />
            </div>
          ))}
          {rounds.length === 0 && (
            <div className="panel p-4 text-sm text-zinc-300">No round data available. Check backend logs and refresh.</div>
          )}
          <MarketInjection rounds={rounds} onInject={injectCandle} />
          <CrashMarket rounds={rounds} onCrash={crashMarket} />
          <CSVUpload onSubmit={upload} />
        </div>
        <div className="space-y-4">
          <SystemHealth health={health} />
          <AdminDiagnostics data={diagnostics} />
          <div className="panel p-4 space-y-2 text-sm font-mono">
            <h3 className="font-semibold font-sans">Session Action Log</h3>
            <div className="max-h-40 overflow-auto space-y-1">
              {adminLogs.length === 0 && <div className="text-zinc-500">No actions logged in this session.</div>}
              {adminLogs.map((row, idx) => (
                <div key={`${row.at}-${idx}`} className={row.level === 'error' ? 'text-red text-xs' : 'text-zinc-300 text-xs'}>
                  [{new Date(row.at).toLocaleTimeString()}] {row.message}
                </div>
              ))}
            </div>
          </div>
          <UserManagement users={users} onBan={ban} />
        </div>
      </div>
    </div>
  );
}
