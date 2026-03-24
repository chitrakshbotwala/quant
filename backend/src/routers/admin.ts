import { Router } from 'express';
import { db } from '../core/db';
import { redis } from '../core/redis';
import { runMarketEngine, setRoundRuntimeState } from '../services/marketEngine';
import { resetRoundToBaseline } from '../services/roundResetService';
import { broadcastRoundStatus, getWsConnectionCount } from './websocket';

const router = Router();

type AdminEvent = {
  id: number;
  at: string;
  type: string;
  roundId?: number;
  details?: Record<string, unknown>;
};

const adminEvents: AdminEvent[] = [];
let adminEventSeq = 0;

function logAdminEvent(type: string, roundId?: number, details?: Record<string, unknown>) {
  adminEventSeq += 1;
  adminEvents.push({
    id: adminEventSeq,
    at: new Date().toISOString(),
    type,
    ...(typeof roundId === 'number' ? { roundId } : {}),
    ...(details ? { details } : {})
  });

  if (adminEvents.length > 200) {
    adminEvents.splice(0, adminEvents.length - 200);
  }
}

router.get('/rounds', async (_req, res) => {
  const rounds = await db.round.findMany({ orderBy: { id: 'asc' } });
  return res.json(
    rounds.map((r) => ({
      ...r,
      dataMode: r.currentCandleIndex >= r.originalCandleCount ? 'SYNTHETIC_DATA' : 'LIVE_DATA'
    }))
  );
});

router.patch('/rounds/:id/toggle', async (req, res) => {
  const id = Number(req.params.id);
  const { active } = req.body as { active: boolean };

  const existingRound = await db.round.findUnique({ where: { id } });
  if (!existingRound) return res.status(404).json({ error: 'ROUND_NOT_FOUND' });

  let baselineReset = { reset: false, count: 0 };

  if (active) {
    baselineReset = await resetRoundToBaseline(id);

    if (!baselineReset.reset && existingRound.originalCandleCount > 0) {
      await db.marketData.deleteMany({
        where: {
          roundId: id,
          candleIndex: { gte: existingRound.originalCandleCount }
        }
      });
    }

    await db.round.update({
      where: { id },
      data: {
        isActive: true,
        startedAt: new Date(),
        currentCandleIndex: 0
      }
    });

    setRoundRuntimeState(id, { active: true, currentIndex: 0 });
    await redis.set(`round:${id}:currentIndex`, '0');
    await redis.set(`round:${id}:active`, '1');
  } else {
    await db.round.update({
      where: { id },
      data: { isActive: false, startedAt: null }
    });

    setRoundRuntimeState(id, { active: false });
    await redis.set(`round:${id}:active`, '0');
  }

  const round = await db.round.findUnique({ where: { id } });
  const totalCandles = await db.marketData.count({ where: { roundId: id } });

  broadcastRoundStatus(id, active ? 'ACTIVE' : 'PAUSED', round?.currentCandleIndex || 0, totalCandles);

  if (active) {
    void runMarketEngine(id);
  }

  logAdminEvent('ROUND_TOGGLE', id, {
    active,
    baselineReset: baselineReset.reset,
    baselineCandleCount: baselineReset.count
  });

  return res.json({ ok: true });
});

router.patch('/rounds/:id/speed', async (req, res) => {
  const id = Number(req.params.id);
  const { speed } = req.body as { speed: number };
  await db.round.update({ where: { id }, data: { replaySpeed: speed } });
  setRoundRuntimeState(id, { speed });
  await redis.set(`round:${id}:speed`, String(speed));
  logAdminEvent('ROUND_SPEED', id, { speed });
  return res.json({ ok: true });
});

router.patch('/rounds/:id/config', async (req, res) => {
  const id = Number(req.params.id);
  const { splitIndex, gbmDrift, gbmVolatility } = req.body as { splitIndex?: number; gbmDrift?: number; gbmVolatility?: number };
  const round = await db.round.update({
    where: { id },
    data: {
      ...(typeof splitIndex === 'number' ? { splitIndex } : {}),
      ...(typeof gbmDrift === 'number' ? { gbmDrift } : {}),
      ...(typeof gbmVolatility === 'number' ? { gbmVolatility } : {})
    }
  });
  logAdminEvent('ROUND_CONFIG', id, {
    ...(typeof splitIndex === 'number' ? { splitIndex } : {}),
    ...(typeof gbmDrift === 'number' ? { gbmDrift } : {}),
    ...(typeof gbmVolatility === 'number' ? { gbmVolatility } : {})
  });
  return res.json(round);
});

router.post('/rounds/:id/inject-candle', async (req, res) => {
  const id = Number(req.params.id);
  const { open, high, low, close, volume } = req.body as {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };

  const round = await db.round.findUnique({ where: { id } });
  if (!round) return res.status(404).json({ error: 'ROUND_NOT_FOUND' });
  if (!round.isActive) return res.status(409).json({ error: 'ROUND_NOT_ACTIVE' });

  const values = [open, high, low, close, volume];
  if (values.some((v) => typeof v !== 'number' || Number.isNaN(v))) {
    return res.status(400).json({ error: 'INVALID_CANDLE_VALUES' });
  }
  if (!(high >= Math.max(open, close, low) && low <= Math.min(open, close, high))) {
    return res.status(400).json({ error: 'INVALID_OHLC_RELATION' });
  }

  // Write admin interventions to a transient synthetic segment so restart can clear them.
  const targetIndex = round.currentCandleIndex < round.originalCandleCount
    ? round.originalCandleCount + round.currentCandleIndex
    : Math.max(round.currentCandleIndex, 0);

  await db.marketData.upsert({
    where: {
      roundId_candleIndex: {
        roundId: id,
        candleIndex: targetIndex
      }
    },
    create: {
      roundId: id,
      candleIndex: targetIndex,
      timestamp: new Date(),
      open,
      high,
      low,
      close,
      volume: BigInt(Math.max(1, Math.trunc(volume)))
    },
    update: {
      timestamp: new Date(),
      open,
      high,
      low,
      close,
      volume: BigInt(Math.max(1, Math.trunc(volume)))
    }
  });

  setRoundRuntimeState(id, { currentIndex: targetIndex });
  await redis.set(`round:${id}:currentIndex`, String(targetIndex));

  logAdminEvent('INJECT_CANDLE', id, {
    candleIndex: targetIndex,
    open,
    high,
    low,
    close,
    volume
  });

  return res.json({ candleIndex: targetIndex });
});

router.post('/rounds/:id/crash', async (req, res) => {
  const id = Number(req.params.id);
  const { severity } = req.body as { severity: 'mild' | 'moderate' | 'severe' };

  const round = await db.round.findUnique({ where: { id } });
  if (!round) return res.status(404).json({ error: 'ROUND_NOT_FOUND' });
  if (!round.isActive) return res.status(409).json({ error: 'ROUND_NOT_ACTIVE' });

  const severityDrop: Record<'mild' | 'moderate' | 'severe', number> = {
    mild: 0.05,
    moderate: 0.15,
    severe: 0.3
  };

  if (!severity || !(severity in severityDrop)) {
    return res.status(400).json({ error: 'INVALID_SEVERITY' });
  }

  const baseCandle = await db.marketData.findFirst({
    where: { roundId: id, candleIndex: { lte: Math.max(round.currentCandleIndex - 1, 0) } },
    orderBy: { candleIndex: 'desc' }
  });
  if (!baseCandle) {
    return res.status(404).json({ error: 'NO_MARKET_DATA' });
  }

  const totalDrop = severityDrop[severity];
  const perStep = totalDrop / 5;
  // Keep crash candles transient (outside original data range) so they don't persist across runs.
  const startIndex = round.currentCandleIndex < round.originalCandleCount
    ? round.originalCandleCount + round.currentCandleIndex
    : Math.max(round.currentCandleIndex, 0);
  const now = Date.now();
  const startClose = Number(baseCandle.close);
  const baseVolume = Number(baseCandle.volume || 1_000_000);

  const rows = [] as Array<{
    roundId: number;
    candleIndex: number;
    timestamp: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: bigint;
  }>;

  for (let i = 0; i < 5; i += 1) {
    const prevClose = i === 0 ? startClose : rows[i - 1].close;
    const newClose = Math.max(0.01, startClose * (1 - perStep * (i + 1)));
    const open = prevClose;
    const high = Math.max(prevClose, newClose) * 1.001;
    const low = Math.min(prevClose, newClose) * 0.995;

    rows.push({
      roundId: id,
      candleIndex: startIndex + i,
      timestamp: new Date(now + i * 60_000),
      open,
      high,
      low,
      close: newClose,
      volume: BigInt(Math.max(1, Math.trunc(baseVolume * 3)))
    });
  }

  await db.$transaction(
    rows.map((row) =>
      db.marketData.upsert({
        where: {
          roundId_candleIndex: {
            roundId: row.roundId,
            candleIndex: row.candleIndex
          }
        },
        create: row,
        update: {
          timestamp: row.timestamp,
          open: row.open,
          high: row.high,
          low: row.low,
          close: row.close,
          volume: row.volume
        }
      })
    )
  );

  setRoundRuntimeState(id, { currentIndex: startIndex });
  await redis.set(`round:${id}:currentIndex`, String(startIndex));

  logAdminEvent('CRASH_MARKET', id, {
    severity,
    startIndex,
    injectedCandles: 5
  });

  return res.json({ injectedCandles: 5, startIndex });
});

router.post('/rounds/:id/params', async (req, res) => {
  const id = Number(req.params.id);
  const params = req.body;
  const round = await db.round.update({ where: { id }, data: { lockedParams: params } });
  logAdminEvent('ROUND_PARAMS_SET', id, {
    keys: Object.keys((params || {}) as Record<string, unknown>)
  });
  return res.json(round);
});

router.get('/users', async (_req, res) => {
  const users = await db.user.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      portfolios: {
        orderBy: { deployedAt: 'desc' },
        take: 1
      }
    }
  });
  return res.json(users);
});

router.patch('/users/:id/ban', async (req, res) => {
  const id = req.params.id;
  const user = await db.user.update({ where: { id }, data: { isActive: false } });
  logAdminEvent('USER_BAN', undefined, { userId: id, email: user.email });
  return res.json(user);
});

router.post('/allowlist/upload', async (req, res) => {
  const rows = req.body as Array<{ email: string; name?: string; teamId?: string }>;
  await db.$transaction([
    db.allowlist.deleteMany({}),
    db.allowlist.createMany({ data: rows.map((r) => ({ email: r.email.toLowerCase(), name: r.name, teamId: r.teamId })) })
  ]);
  logAdminEvent('ALLOWLIST_UPLOAD', undefined, { count: rows.length });
  return res.json({ ok: true, count: rows.length });
});

router.get('/diagnostics', async (_req, res) => {
  const rounds = await db.round.findMany({ orderBy: { id: 'asc' } });

  const roundStats = await Promise.all(
    rounds.map(async (r) => {
      const [
        totalCandles,
        syntheticCandles,
        portfolioCount,
        activePortfolios,
        openTrades,
        closedTrades,
        lastCandle,
        redisIndex,
        redisActive,
        redisSpeed
      ] = await Promise.all([
        db.marketData.count({ where: { roundId: r.id } }),
        db.marketData.count({ where: { roundId: r.id, candleIndex: { gte: r.originalCandleCount } } }),
        db.portfolio.count({ where: { roundId: r.id } }),
        db.portfolio.count({ where: { roundId: r.id, isActive: true } }),
        db.trade.count({ where: { status: 'OPEN', portfolio: { roundId: r.id } } }),
        db.trade.count({ where: { status: 'CLOSED', portfolio: { roundId: r.id } } }),
        db.marketData.findFirst({ where: { roundId: r.id }, orderBy: { candleIndex: 'desc' } }),
        redis.get(`round:${r.id}:currentIndex`),
        redis.get(`round:${r.id}:active`),
        redis.get(`round:${r.id}:speed`)
      ]);

      return {
        id: r.id,
        name: r.name,
        isActive: r.isActive,
        dataMode: r.currentCandleIndex >= r.originalCandleCount ? 'SYNTHETIC_DATA' : 'LIVE_DATA',
        splitIndex: r.splitIndex,
        currentCandleIndex: r.currentCandleIndex,
        originalCandleCount: r.originalCandleCount,
        totalCandles,
        syntheticCandles,
        portfolioCount,
        activePortfolios,
        openTrades,
        closedTrades,
        lastCandle: lastCandle
          ? {
              index: lastCandle.candleIndex,
              timestamp: lastCandle.timestamp.toISOString(),
              close: Number(lastCandle.close)
            }
          : null,
        runtime: {
          redisCurrentIndex: Number(redisIndex || 0),
          redisActive: redisActive === '1',
          redisSpeed: Number(redisSpeed || 1)
        }
      };
    })
  );

  return res.json({
    generatedAt: new Date().toISOString(),
    wsConnections: getWsConnectionCount(),
    rounds: roundStats,
    recentEvents: adminEvents.slice(-50).reverse()
  });
});

router.get('/health', async (_req, res) => {
  const pingStart = Date.now();
  await redis.ping();
  const redisLatencyMs = Date.now() - pingStart;

  return res.json({
    wsConnections: getWsConnectionCount(),
    redisLatencyMs,
    algoQueueDepth: 0,
    dbPoolStatus: 'ok'
  });
});

export default router;
