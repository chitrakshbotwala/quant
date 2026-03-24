import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { db } from '../core/db';
import { getOrCreatePortfolio, closeAllOpenTrades } from '../services/portfolioService';
import { upsertLeaderboard } from '../services/leaderboardService';
import { getStrategySubmission } from '../services/strategyRuntime';
import { syncUserProfileSnapshot } from '../services/profileSyncService';

const router = Router();

router.post('/deploy', async (req, res) => {
  const userId = req.user!.userId;
  const role = req.user!.role;
  const { roundId } = req.body as { roundId: number };

  const submission = getStrategySubmission(userId, roundId);
  if (!submission) {
    return res.status(400).json({ error: 'NO_VALIDATED_STRATEGY' });
  }

  const latest = await db.portfolio.findFirst({ where: { userId, roundId }, orderBy: { runId: 'desc' } });
  if (roundId === 2 && latest && role !== 'admin') {
    if (latest.isSessionLocked) {
      return res.status(409).json({ error: 'SESSION_LOCKED' });
    }
    return res.status(409).json({ error: 'ALREADY_DEPLOYED' });
  }

  const hadActiveRun = Boolean(latest?.isActive);
  const previousRunId = latest?.runId || 0;

  const portfolio = await getOrCreatePortfolio(userId, roundId);
  const createdNewRun = !hadActiveRun && portfolio.runId > previousRunId;
  const reusedActiveRun = hadActiveRun;

  return res.json({
    portfolio,
    deployment: {
      createdNewRun,
      reusedActiveRun,
      runId: portfolio.runId
    }
  });
});

router.post('/stop', async (req, res) => {
  const userId = req.user!.userId;
  const { roundId } = req.body as { roundId: number };

  const portfolio = await db.portfolio.findFirst({ where: { userId, roundId, isActive: true }, orderBy: { runId: 'desc' } });
  if (!portfolio) return res.status(404).json({ error: 'NO_ACTIVE_PORTFOLIO' });

  const round = await db.round.findUnique({ where: { id: roundId } });
  const markIndex = Math.max((round?.currentCandleIndex || 0) - 1, 0);
  let candle = await db.marketData.findFirst({
    where: { roundId, candleIndex: { lte: markIndex } },
    orderBy: { candleIndex: 'desc' }
  });
  if (!candle) {
    candle = await db.marketData.findFirst({ where: { roundId }, orderBy: { candleIndex: 'desc' } });
  }
  if (candle) {
    await closeAllOpenTrades(portfolio.id, candle.close, candle.candleIndex, 'STOP');
  }

  const updated = await db.portfolio.update({ where: { id: portfolio.id }, data: { isActive: false, stoppedAt: new Date() } });
  await upsertLeaderboard(userId, roundId, updated.bookedPnl, false);
  await syncUserProfileSnapshot(userId);
  return res.json({ ok: true });
});

router.post('/book-all', async (req, res) => {
  const userId = req.user!.userId;
  const { roundId } = req.body as { roundId: number };

  const portfolio = await db.portfolio.findFirst({ where: { userId, roundId, isActive: true }, orderBy: { runId: 'desc' } });
  if (!portfolio) return res.status(404).json({ error: 'NO_ACTIVE_PORTFOLIO' });

  const round = await db.round.findUnique({ where: { id: roundId } });
  if (!round) return res.status(404).json({ error: 'ROUND_NOT_FOUND' });

  const markIndex = Math.max(round.currentCandleIndex - 1, 0);
  let candle = await db.marketData.findFirst({
    where: { roundId, candleIndex: { lte: markIndex } },
    orderBy: { candleIndex: 'desc' }
  });
  if (!candle) {
    candle = await db.marketData.findFirst({ where: { roundId }, orderBy: { candleIndex: 'desc' } });
  }
  if (!candle) return res.status(400).json({ error: 'NO_CURRENT_CANDLE' });

  const delta = await closeAllOpenTrades(portfolio.id, candle.close, candle.candleIndex, 'BOOK_ALL');
  const updated = await db.portfolio.findUnique({ where: { id: portfolio.id } });
  await upsertLeaderboard(userId, roundId, updated?.bookedPnl || new Prisma.Decimal(0), false);
  await syncUserProfileSnapshot(userId);

  const capitalRemaining = Number(updated?.capital || 0);
  const bookedPnl = Number(updated?.bookedPnl || 0);
  const totalPortfolioValue = capitalRemaining;

  return res.json({
    bookedPnlDelta: Number(delta),
    bookedPnl,
    portfolio: {
      capitalRemaining,
      bookedPnl,
      unrealizedPnl: 0,
      openPositions: 0,
      totalPortfolioValue
    }
  });
});

router.post('/stop-trading', async (req, res) => {
  const userId = req.user!.userId;
  const { roundId } = req.body as { roundId: number };
  if (roundId !== 2) return res.status(400).json({ error: 'ONLY_ROUND_2' });

  const portfolio = await db.portfolio.findFirst({ where: { userId, roundId, isActive: true }, orderBy: { runId: 'desc' } });
  if (!portfolio) return res.status(404).json({ error: 'NO_ACTIVE_PORTFOLIO' });

  const round = await db.round.findUnique({ where: { id: roundId } });
  const markIndex = Math.max((round?.currentCandleIndex || 0) - 1, 0);
  let candle = await db.marketData.findFirst({
    where: { roundId, candleIndex: { lte: markIndex } },
    orderBy: { candleIndex: 'desc' }
  });
  if (!candle) {
    candle = await db.marketData.findFirst({ where: { roundId }, orderBy: { candleIndex: 'desc' } });
  }

  if (candle) {
    await closeAllOpenTrades(portfolio.id, candle.close, candle.candleIndex, 'STOP_TRADING');
  }

  const updated = await db.portfolio.update({
    where: { id: portfolio.id },
    data: {
      isActive: false,
      isSessionLocked: true,
      stoppedAt: new Date()
    }
  });

  await upsertLeaderboard(userId, roundId, updated.bookedPnl, true);
  await syncUserProfileSnapshot(userId);
  return res.json({ ok: true, bookedPnl: Number(updated.bookedPnl) });
});

router.get('/portfolio', async (req, res) => {
  const userId = req.user!.userId;
  const roundId = Number(req.query.roundId || 1);
  const portfolio = await db.portfolio.findFirst({ where: { userId, roundId }, orderBy: { runId: 'desc' } });
  return res.json(portfolio);
});

router.get('/positions', async (req, res) => {
  const userId = req.user!.userId;
  const roundId = Number(req.query.roundId || 1);
  const portfolio = await db.portfolio.findFirst({ where: { userId, roundId }, orderBy: { runId: 'desc' } });
  if (!portfolio) return res.json([]);

  const openTrades = await db.trade.findMany({
    where: { portfolioId: portfolio.id, status: 'OPEN' },
    orderBy: { openedAt: 'desc' }
  });
  if (openTrades.length === 0) return res.json([]);

  const round = await db.round.findUnique({ where: { id: roundId } });
  const markIndex = Math.max((round?.currentCandleIndex || 0) - 1, 0);
  let markCandle = await db.marketData.findFirst({
    where: { roundId, candleIndex: { lte: markIndex } },
    orderBy: { candleIndex: 'desc' }
  });
  if (!markCandle) {
    markCandle = await db.marketData.findFirst({ where: { roundId }, orderBy: { candleIndex: 'desc' } });
  }

  const markPrice = markCandle?.close || null;

  return res.json(
    openTrades.map((t) => {
      const entry = t.entryPrice;
      const current = markPrice || t.entryPrice;
      const sign = t.direction === 'LONG' ? 1 : -1;
      const unrealized = current.minus(entry).mul(sign).mul(t.sizeUsd).div(entry);
      return {
        id: t.id,
        direction: t.direction,
        entryPrice: Number(entry),
        currentPrice: Number(current),
        sizeUsd: Number(t.sizeUsd),
        unrealizedPnl: Number(unrealized),
        entryCandle: t.entryCandle,
        status: t.status
      };
    })
  );
});

router.get('/trades', async (req, res) => {
  const userId = req.user!.userId;
  const hasRound = req.query.roundId !== undefined;

  const portfolios = await db.portfolio.findMany({
    where: hasRound ? { userId, roundId: Number(req.query.roundId) } : { userId },
    select: { id: true, roundId: true }
  });

  const roundMap = new Map(portfolios.map((p) => [p.id, p.roundId]));

  const trades = await db.trade.findMany({
    where: { portfolioId: { in: portfolios.map((p) => p.id) } },
    orderBy: { openedAt: 'desc' }
  });

  return res.json(
    trades.map((t) => ({
      ...t,
      roundId: roundMap.get(t.portfolioId) || null
    }))
  );
});

export default router;
