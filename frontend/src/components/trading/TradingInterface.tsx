import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../../lib/api';
import { useWebSocket } from '../../hooks/useWebSocket';
import CandlestickChart from './CandlestickChart';
import PnLDashboard from './PnLDashboard';
import PositionsTable from './PositionsTable';
import DrawdownMeter from './DrawdownMeter';
import BookAllButton from './BookAllButton';
import AlgoEditor, { TEMPLATE } from '../algo/AlgoEditor';
import ParameterForm from '../algo/ParameterForm';
import DeployButton from '../algo/DeployButton';
import { Candle } from '../../types';

type AlgoParams = {
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

type Marker = { line: number; column?: number; message: string } | null;
type LogRow = { level: 'info' | 'warning' | 'error'; candleIndex?: number; message: string };
type PortfolioState = {
  capitalRemaining: number;
  bookedPnl: number;
  unrealizedPnl: number;
  openPositions: number;
  drawdownPct: number;
  totalPortfolioValue?: number;
  previousRunBookedPnl?: number;
};

const defaultParams: AlgoParams = {
  fastMaPeriod: 10,
  slowMaPeriod: 30,
  rsiPeriod: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  positionSizePct: 0.1,
  maxOpenPositions: 3,
  stopLossPct: 0.02,
  takeProfitPct: 0.05,
  cooldownCandles: 2
};

function normalizeCandles(input: Candle[]): Candle[] {
  const byIndex = new Map<number, Candle>();
  for (const c of input) {
    if (typeof c?.index !== 'number') continue;
    byIndex.set(c.index, c);
  }

  return Array.from(byIndex.values()).sort((a, b) => {
    if (a.index !== b.index) return a.index - b.index;
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });
}

export default function TradingInterface() {
  const { roundId: roundIdRaw } = useParams();
  const roundId = Number(roundIdRaw || '1');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [status, setStatus] = useState('PAUSED');
  const [editorValue, setEditorValue] = useState(TEMPLATE);
  const [params, setParams] = useState<AlgoParams>(defaultParams);
  const [validationMarker, setValidationMarker] = useState<Marker>(null);
  const [validationMessage, setValidationMessage] = useState('');
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [tradeMarkers, setTradeMarkers] = useState<Array<{ timestamp: string; side: 'BUY' | 'SELL' }>>([]);
  const [pendingDeploy, setPendingDeploy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [hasRound2Run, setHasRound2Run] = useState(false);
  const [portfolio, setPortfolio] = useState<PortfolioState>({ capitalRemaining: 1000000, bookedPnl: 0, unrealizedPnl: 0, openPositions: 0, drawdownPct: 0, totalPortfolioValue: 1000000, previousRunBookedPnl: 0 });
  const [locked, setLocked] = useState(false);
  const syncingFromFormRef = useRef(false);
  const syncingFromCodeRef = useRef(false);
  const navigate = useNavigate();

  const parseErrorPayload = (err: unknown): any => {
    try {
      return JSON.parse(String((err as Error)?.message || err));
    } catch {
      return { error: String((err as Error)?.message || err) };
    }
  };

  const serializeParams = (next: AlgoParams) => {
    const entries = Object.entries(next).map(([k, v]) => `  ${k}: ${v},`).join('\n');
    return `const PARAMETERS = {\n${entries}\n};`;
  };

  const extractParamsFromCode = (code: string): AlgoParams | null => {
    const match = code.match(/const\s+PARAMETERS\s*=\s*\{[\s\S]*?\};/m);
    if (!match) return null;

    try {
      const objLiteral = match[0]
        .replace(/^const\s+PARAMETERS\s*=\s*/m, '')
        .replace(/;\s*$/, '');
      const parsed = Function(`return (${objLiteral});`)() as Partial<AlgoParams>;
      if (!parsed || typeof parsed !== 'object') return null;

      return {
        fastMaPeriod: Number(parsed.fastMaPeriod ?? defaultParams.fastMaPeriod),
        slowMaPeriod: Number(parsed.slowMaPeriod ?? defaultParams.slowMaPeriod),
        rsiPeriod: Number(parsed.rsiPeriod ?? defaultParams.rsiPeriod),
        rsiOverbought: Number(parsed.rsiOverbought ?? defaultParams.rsiOverbought),
        rsiOversold: Number(parsed.rsiOversold ?? defaultParams.rsiOversold),
        positionSizePct: Number(parsed.positionSizePct ?? defaultParams.positionSizePct),
        maxOpenPositions: Number(parsed.maxOpenPositions ?? defaultParams.maxOpenPositions),
        stopLossPct: Number(parsed.stopLossPct ?? defaultParams.stopLossPct),
        takeProfitPct: Number(parsed.takeProfitPct ?? defaultParams.takeProfitPct),
        cooldownCandles: Number(parsed.cooldownCandles ?? defaultParams.cooldownCandles)
      };
    } catch {
      return null;
    }
  };

  const mergeParamsIntoCode = (code: string, next: AlgoParams): string => {
    const serialized = serializeParams(next);
    if (/const\s+PARAMETERS\s*=\s*\{[\s\S]*?\};/m.test(code)) {
      return code.replace(/const\s+PARAMETERS\s*=\s*\{[\s\S]*?\};/m, serialized);
    }
    return `${serialized}\n\n${code}`;
  };

  const onMessage = useCallback((data: any) => {
    if (data.type === 'HISTORICAL_CANDLES') setCandles(normalizeCandles(data.candles || []));
    if (data.type === 'TICK') {
      setCandles((prev) => normalizeCandles([...prev, data.candle]));
    }
    if (data.type === 'CATCHUP') {
      setCandles((prev) => normalizeCandles([...prev, ...(data.candles || [])]));
      if (data.currentPortfolio) {
        setPortfolio((prev) => ({
          ...prev,
          capitalRemaining: Number(data.currentPortfolio.capital || prev.capitalRemaining),
          bookedPnl: Number(data.currentPortfolio.bookedPnl || prev.bookedPnl),
          unrealizedPnl: Number(data.currentPortfolio.unrealizedPnl || prev.unrealizedPnl),
          totalPortfolioValue: Number(data.currentPortfolio.totalPortfolioValue || prev.totalPortfolioValue || 0),
          openPositions: Array.isArray(data.currentPortfolio.openPositions) ? data.currentPortfolio.openPositions.length : prev.openPositions
        }));
        setPositions(Array.isArray(data.currentPortfolio.openPositions) ? data.currentPortfolio.openPositions : []);
      }
    }
    if (data.type === 'ROUND_STATUS') setStatus(data.status);
    if (data.type === 'ALGO_LOG') {
      setLogs((prev) => [...prev, { level: data.level || 'info', candleIndex: data.candleIndex, message: data.message || '' }].slice(-120));
    }
    if (data.type === 'TRADE_MARKER' && data.marker?.timestamp && (data.marker?.side === 'BUY' || data.marker?.side === 'SELL')) {
      setTradeMarkers((prev) => [...prev, { timestamp: data.marker.timestamp, side: data.marker.side }]);
    }
    if (data.type === 'PORTFOLIO_UPDATE') {
      setPortfolio({
        capitalRemaining: Number(data.capitalRemaining || 0),
        bookedPnl: Number(data.bookedPnl || 0),
        unrealizedPnl: Number(data.unrealizedPnl || 0),
        openPositions: Array.isArray(data.openPositions) ? data.openPositions.length : Number(data.openPositions || 0),
        drawdownPct: Number(data.drawdownPct || 0),
        totalPortfolioValue: Number(data.totalPortfolioValue || 0),
        previousRunBookedPnl: Number(data.previousRunBookedPnl || 0)
      });
      if (Array.isArray(data.openPositions)) {
        setPositions(data.openPositions);
      }
      if (data.capitalDepleted) setLocked(true);
    }
  }, []);

  useWebSocket(roundId, onMessage);

  useEffect(() => {
    setLogs([]);
    setTradeMarkers([]);
    setValidationMarker(null);
    setValidationMessage('');
    setActionError('');
    setHasRound2Run(false);
    setLocked(false);

    apiGet<any[]>(`/trading/positions?roundId=${roundId}`).then(setPositions).catch(() => setPositions([]));
    apiGet<any>(`/algo/parameters/${roundId}`)
      .then((p) => {
        if (!p) return;
        const next = { ...defaultParams, ...p } as AlgoParams;
        setParams(next);
        syncingFromFormRef.current = true;
        setEditorValue((current) => mergeParamsIntoCode(current || TEMPLATE, next));
      })
      .catch(() => undefined);

    apiGet<any>(`/trading/portfolio?roundId=${roundId}`)
      .then((p) => {
        if (!p) return;
        if (roundId === 2) {
          setHasRound2Run(true);
          if (p.isSessionLocked) setLocked(true);
        }
      })
      .catch(() => undefined);
  }, [roundId]);

  useEffect(() => {
    if (syncingFromCodeRef.current) {
      syncingFromCodeRef.current = false;
      return;
    }

    const merged = mergeParamsIntoCode(editorValue || TEMPLATE, params);
    if (merged !== editorValue) {
      syncingFromFormRef.current = true;
      setEditorValue(merged);
    }
  }, [params]);

  useEffect(() => {
    if (syncingFromFormRef.current) {
      syncingFromFormRef.current = false;
      return;
    }

    const parsed = extractParamsFromCode(editorValue);
    if (parsed) {
      syncingFromCodeRef.current = true;
      setParams(parsed);
    }
  }, [editorValue]);

  useEffect(() => {
    const id = window.setTimeout(async () => {
      try {
        const out = await apiPost<any>('/algo/validate', { code: editorValue });
        setValidationMarker(null);
        setValidationMessage('Code validated');
        if (out?.parameters) {
          syncingFromCodeRef.current = true;
          setParams({ ...defaultParams, ...out.parameters });
        }
      } catch (err) {
        const payload = parseErrorPayload(err);
        setValidationMessage(payload.error || payload.detail || 'Invalid strategy code');
        if (payload.line) {
          setValidationMarker({
            line: Number(payload.line),
            column: Number(payload.column || 1),
            message: String(payload.error || payload.detail || 'Invalid strategy code')
          });
        } else {
          setValidationMarker(null);
        }
      }
    }, 400);

    return () => window.clearTimeout(id);
  }, [editorValue]);

  const readOnly = useMemo(() => status === 'ENDED' || locked || (roundId === 2 && hasRound2Run), [roundId, status, locked, hasRound2Run]);

  const deploy = async () => {
    try {
      setActionError('');
      setPendingDeploy(true);

      const validation = await apiPost<any>('/algo/validate', { code: editorValue });
      setValidationMarker(null);
      if (validation?.parameters) {
        setParams({ ...defaultParams, ...validation.parameters });
      }

      await apiPost('/algo/submit', { roundId, code: editorValue });
      const deployResult = await apiPost<any>('/trading/deploy', { roundId });
      if (roundId === 2) setHasRound2Run(true);
      const deployment = deployResult?.deployment;
      if (deployment?.createdNewRun) {
        setLogs((prev) => [...prev, { level: 'info', message: `Run started (run #${deployment.runId}). Strategy deployed.` }]);
      } else if (deployment?.reusedActiveRun) {
        setLogs((prev) => [...prev, { level: 'info', message: `Strategy redeployed to active run #${deployment.runId}. Positions/capital were NOT reset.` }]);
      } else {
        setLogs((prev) => [...prev, { level: 'info', message: 'Strategy deployed successfully.' }]);
      }
    } catch (err) {
      const payload = parseErrorPayload(err);
      setActionError(payload.error || payload.detail || 'Deploy failed');
      if (payload.line) {
        setValidationMarker({
          line: Number(payload.line),
          column: Number(payload.column || 1),
          message: String(payload.error || payload.detail || 'Invalid strategy code')
        });
      }
    } finally {
      setPendingDeploy(false);
    }
  };

  const stop = async () => {
    try {
      setActionError('');
      if (roundId === 2) {
        if (!window.confirm('Round II is single-use. Stopping will permanently lock this round. Continue?')) return;
        await apiPost('/trading/stop-trading', { roundId });
        setLocked(true);
      } else {
        await apiPost('/trading/stop', { roundId });
      }
    } catch (err) {
      const payload = parseErrorPayload(err);
      setActionError(payload.error || 'Stop failed');
    }
  };

  const bookAll = async () => {
    if (!window.confirm('Close all open positions at current candle close?')) return;
    try {
      setActionError('');
      const out = await apiPost<any>('/trading/book-all', { roundId });
      setPositions([]);

      if (out?.portfolio) {
        setPortfolio((prev) => ({
          ...prev,
          capitalRemaining: Number(out.portfolio.capitalRemaining || 0),
          bookedPnl: Number(out.portfolio.bookedPnl || 0),
          unrealizedPnl: Number(out.portfolio.unrealizedPnl || 0),
          openPositions: Number(out.portfolio.openPositions || 0),
          totalPortfolioValue: Number(out.portfolio.totalPortfolioValue || 0)
        }));
      }

      // Best-effort consistency refresh in case server state changed between close and response.
      void apiGet<any[]>(`/trading/positions?roundId=${roundId}`).then(setPositions).catch(() => undefined);

      setLogs((prev) => [...prev, { level: 'info', message: `Book All executed. Closed PnL delta: ${Number(out?.bookedPnlDelta || 0).toFixed(2)}.` }]);
    } catch (err) {
      const payload = parseErrorPayload(err);
      setActionError(payload.error || 'Book all failed');
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-mono">Round {roundId} Trading</h1>
        <button className="text-zinc-300" onClick={() => navigate('/')}>Back</button>
      </div>

      {status === 'PAUSED' && <div className="panel p-3 text-amber text-sm">Round Paused</div>}
      {locked && <div className="panel p-3 text-red text-sm">Session Complete</div>}
      {actionError && <div className="panel p-3 text-red text-sm">{actionError}</div>}

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <CandlestickChart candles={candles} markers={tradeMarkers} />
          <DrawdownMeter drawdownPct={portfolio.drawdownPct} />
        </div>
        <div className="lg:col-span-3 space-y-4">
          <AlgoEditor value={editorValue} onChange={setEditorValue} readOnly={readOnly} marker={validationMarker} />
          <div className={`text-xs font-mono ${validationMarker ? 'text-red' : 'text-green'}`}>{validationMessage}</div>
          <ParameterForm params={params} onChange={(next) => setParams(next as AlgoParams)} readOnly={readOnly} />
          <PnLDashboard {...portfolio} />
          <div className="flex flex-wrap gap-2">
            <DeployButton onClick={deploy} disabled={readOnly || pendingDeploy} label={roundId === 2 ? 'Run (Single Use)' : 'Run'} />
            <button onClick={stop} className="rounded-lg border border-red px-4 py-2 text-red">{roundId === 2 ? 'Stop Trading' : 'Stop'}</button>
            {roundId === 1 && <BookAllButton onClick={bookAll} />}
          </div>
          <div className="panel p-3 max-h-48 overflow-auto text-xs font-mono space-y-1">
            {logs.length === 0 && <div className="text-zinc-500">Runtime logs will appear here.</div>}
            {logs.map((row, idx) => (
              <div key={`${idx}-${row.candleIndex || 0}`} className={row.level === 'error' ? 'text-red' : row.level === 'warning' ? 'text-amber' : 'text-zinc-300'}>
                [{row.level.toUpperCase()}]{typeof row.candleIndex === 'number' ? ` [candle:${row.candleIndex}]` : ''} {row.message}
              </div>
            ))}
          </div>
          <PositionsTable positions={positions} />
        </div>
      </div>
    </div>
  );
}
