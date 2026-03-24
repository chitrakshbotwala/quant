import { Prisma } from '@prisma/client';
import { db } from '../core/db';
import { redis } from '../core/redis';
import { ema, rsi } from './indicators';
import { closeAllOpenTrades } from './portfolioService';
import { computeUnrealizedPnl } from './pnlService';
import { upsertLeaderboard } from './leaderboardService';
import { sendPortfolioUpdate, broadcastRoundStatus, sendUserEvent } from '../routers/websocket';
import { executeStrategy, getStrategySubmission } from './strategyRuntime';
import { generateNextCandle } from './candleGenerator';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const runningRounds = new Map<number, boolean>();
const lastEma = new Map<number, { fast: number; slow: number }>();
const roundRuntime = new Map<number, {
  active: boolean;
  speed: number;
  currentIndex: number;
  lastRedisSyncIndex: number;
}>();

const REDIS_INDEX_SYNC_INTERVAL = 5;

const defaultParams = {
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

function getStartingCapital(roundId: number): number {
  return roundId === 2 ? 200000 : 1000000;
}

async function getRoundParams(roundId: number) {
  const round = await db.round.findUnique({ where: { id: roundId } });
  if (round?.lockedParams) {
    return { ...defaultParams, ...(round.lockedParams as Record<string, number>) };
  }
  return defaultParams;
}

async function closeTradeAtPrice(trade: {
  id: string;
  portfolioId: string;
  direction: string;
  entryPrice: Prisma.Decimal;
  sizeUsd: Prisma.Decimal;
}, closePrice: Prisma.Decimal, candleIndex: number, reason: string) {
  const sign = trade.direction === 'LONG' ? 1 : -1;
  const pnl = closePrice.minus(trade.entryPrice).mul(sign).mul(trade.sizeUsd).div(trade.entryPrice);

  await db.$transaction([
    db.trade.update({
      where: { id: trade.id },
      data: {
        status: 'CLOSED',
        exitPrice: closePrice,
        exitCandle: candleIndex,
        pnl,
        closeReason: reason,
        closedAt: new Date()
      }
    }),
    db.portfolio.update({
      where: { id: trade.portfolioId },
      data: {
        bookedPnl: { increment: pnl },
        // Release reserved notional and apply realized PnL.
        capital: { increment: trade.sizeUsd.plus(pnl) }
      }
    })
  ]);
}

async function evaluateSignals(roundId: number, closePrice: Prisma.Decimal, candleIndex: number, indicators: { emaFast: number; emaSlow: number; rsi: number }, candleTimestamp: string) {
  const portfolios = await db.portfolio.findMany({ where: { roundId, isActive: true }, include: { user: true } });

  for (const portfolio of portfolios) {
    const submission = getStrategySubmission(portfolio.userId, roundId);
    if (!submission) {
      continue;
    }

    const params = submission.parameters;
    const openTrades = await db.trade.findMany({ where: { portfolioId: portfolio.id, status: 'OPEN' }, orderBy: { openedAt: 'asc' } });

    // Apply per-candle risk exits from PARAMETERS.
    for (const trade of openTrades) {
      const entry = Number(trade.entryPrice);
      const close = Number(closePrice);

      let pnlPct = 0;
      if (trade.direction === 'LONG') {
        pnlPct = (close - entry) / entry;
      } else {
        pnlPct = (entry - close) / entry;
      }

      if (pnlPct <= -params.stopLossPct) {
        await closeTradeAtPrice(trade, closePrice, candleIndex, 'STOP_LOSS');
        sendUserEvent(portfolio.userId, {
          type: 'ALGO_LOG',
          level: 'warning',
          candleIndex,
          message: `Position closed by STOP_LOSS (${(pnlPct * 100).toFixed(2)}%).`
        });
      } else if (pnlPct >= params.takeProfitPct) {
        await closeTradeAtPrice(trade, closePrice, candleIndex, 'TAKE_PROFIT');
        sendUserEvent(portfolio.userId, {
          type: 'ALGO_LOG',
          level: 'info',
          candleIndex,
          message: `Position closed by TAKE_PROFIT (+${(pnlPct * 100).toFixed(2)}%).`
        });
      }
    }

    const freshPortfolio = await db.portfolio.findUnique({ where: { id: portfolio.id } });
    if (!freshPortfolio) continue;
    const trades = await db.trade.findMany({ where: { portfolioId: portfolio.id, status: 'OPEN' }, orderBy: { openedAt: 'asc' } });
    const openPositions = trades.length;

    try {
      const signal = await executeStrategy(submission.code, {
        candleIndex,
        timestamp: candleTimestamp,
        close: Number(closePrice),
        indicators,
        portfolio: {
          capital: Number(freshPortfolio.capital),
          bookedPnl: Number(freshPortfolio.bookedPnl),
          openPositions
        }
      });

      const latestEntry = await db.trade.findFirst({
        where: { portfolioId: portfolio.id },
        orderBy: { entryCandle: 'desc' }
      });
      const inCooldown = latestEntry ? candleIndex - latestEntry.entryCandle < params.cooldownCandles : false;

      if (signal.action === 'BUY' && openPositions < params.maxOpenPositions) {
        const size = new Prisma.Decimal(freshPortfolio.capital).mul(params.positionSizePct);
        const canAfford = size.greaterThan(0) && size.lte(freshPortfolio.capital);
        if (canAfford && !inCooldown) {
          await db.$transaction([
            db.trade.create({
              data: {
                portfolioId: portfolio.id,
                direction: 'LONG',
                entryPrice: closePrice,
                sizeUsd: size,
                entryCandle: candleIndex
              }
            }),
            db.portfolio.update({
              where: { id: portfolio.id },
              data: { capital: { decrement: size } }
            })
          ]);

          sendUserEvent(portfolio.userId, {
            type: 'TRADE_MARKER',
            marker: { index: candleIndex, timestamp: candleTimestamp, side: 'BUY' }
          });
        }
      } else if (signal.action === 'SELL' && openPositions < params.maxOpenPositions) {
        const size = new Prisma.Decimal(freshPortfolio.capital).mul(params.positionSizePct);
        const canAfford = size.greaterThan(0) && size.lte(freshPortfolio.capital);
        if (canAfford && !inCooldown) {
          await db.$transaction([
            db.trade.create({
              data: {
                portfolioId: portfolio.id,
                direction: 'SHORT',
                entryPrice: closePrice,
                sizeUsd: size,
                entryCandle: candleIndex
              }
            }),
            db.portfolio.update({
              where: { id: portfolio.id },
              data: { capital: { decrement: size } }
            })
          ]);

          sendUserEvent(portfolio.userId, {
            type: 'TRADE_MARKER',
            marker: { index: candleIndex, timestamp: candleTimestamp, side: 'SELL' }
          });
        }
      }
    } catch (err) {
      const errorMessage = String(err);
      const isTimeout = errorMessage.toLowerCase().includes('timed out') || errorMessage.toLowerCase().includes('timeout');
      sendUserEvent(portfolio.userId, {
        type: 'ALGO_LOG',
        level: isTimeout ? 'warning' : 'error',
        candleIndex,
        message: isTimeout
          ? 'Strategy execution timed out (>2s). Candle skipped.'
          : `Runtime error: ${errorMessage}`
      });
    }

    const refreshedTrades = await db.trade.findMany({ where: { portfolioId: portfolio.id, status: 'OPEN' }, orderBy: { openedAt: 'asc' } });
    const unrealized = await computeUnrealizedPnl(portfolio.id, closePrice);
    const refreshedPortfolio = await db.portfolio.findUnique({ where: { id: portfolio.id } });
    if (!refreshedPortfolio) continue;

    const openNotional = refreshedTrades.reduce((acc, t) => acc.plus(t.sizeUsd), new Prisma.Decimal(0));
    const total = new Prisma.Decimal(refreshedPortfolio.capital).plus(openNotional).plus(unrealized);
    const startingCapital = getStartingCapital(roundId);
    const peakCapital = Math.max(startingCapital, Number(total));
    const drawdownPct = ((peakCapital - Number(total)) / peakCapital) * 100;

    const previousRun = await db.portfolio.findFirst({
      where: {
        userId: portfolio.userId,
        roundId,
        runId: { lt: refreshedPortfolio.runId }
      },
      orderBy: { runId: 'desc' }
    });

    const openPositionRows = refreshedTrades.map((t) => {
      const sign = t.direction === 'LONG' ? 1 : -1;
      const unrealizedPos = closePrice.minus(t.entryPrice).mul(sign).mul(t.sizeUsd).div(t.entryPrice);
      return {
        id: t.id,
        direction: t.direction,
        entryPrice: Number(t.entryPrice),
        currentPrice: Number(closePrice),
        sizeUsd: Number(t.sizeUsd),
        unrealizedPnl: Number(unrealizedPos)
      };
    });

    sendPortfolioUpdate(portfolio.userId, {
      type: 'PORTFOLIO_UPDATE',
      capitalRemaining: Number(refreshedPortfolio.capital),
      openPositions: openPositionRows,
      unrealizedPnl: Number(unrealized),
      bookedPnl: Number(refreshedPortfolio.bookedPnl),
      totalPortfolioValue: Number(total),
      previousRunBookedPnl: Number(previousRun?.bookedPnl || 0),
      peakCapital,
      drawdownPct
    });
  }

  lastEma.set(roundId, { fast: indicators.emaFast, slow: indicators.emaSlow });
}

export async function runMarketEngine(roundId: number) {
  if (runningRounds.get(roundId)) {
    return;
  }

  if (!roundRuntime.has(roundId)) {
    const active = (await redis.get(`round:${roundId}:active`)) === '1';
    const speed = parseFloat((await redis.get(`round:${roundId}:speed`)) || '1');
    const idx = parseInt((await redis.get(`round:${roundId}:currentIndex`)) || '0', 10);
    roundRuntime.set(roundId, {
      active,
      speed: Number.isFinite(speed) ? Math.max(speed, 0.5) : 1,
      currentIndex: Number.isFinite(idx) ? Math.max(0, idx) : 0,
      lastRedisSyncIndex: Number.isFinite(idx) ? Math.max(0, idx) : 0
    });
  }

  runningRounds.set(roundId, true);

  while (runningRounds.get(roundId)) {
    try {
      const state = roundRuntime.get(roundId);
      if (!state || !state.active) {
        await sleep(500);
        continue;
      }

      const idx = state.currentIndex;
      let candle = await db.marketData.findFirst({ where: { roundId, candleIndex: idx } });

      if (!candle) {
        const roundCfg = await db.round.findUnique({ where: { id: roundId } });
        const prevCandle =
          (await db.marketData.findFirst({ where: { roundId, candleIndex: idx - 1 } })) ||
          (await db.marketData.findFirst({ where: { roundId }, orderBy: { candleIndex: 'desc' } }));

        if (!prevCandle || !roundCfg) {
          await sleep(500);
          continue;
        }

        const synthetic = generateNextCandle(Number(prevCandle.close), {
          drift: roundCfg.gbmDrift,
          volatility: roundCfg.gbmVolatility
        });

        const ts = new Date(prevCandle.timestamp.getTime() + 60_000);
        candle = await db.marketData.create({
          data: {
            roundId,
            candleIndex: idx,
            timestamp: ts,
            open: new Prisma.Decimal(synthetic.open),
            high: new Prisma.Decimal(synthetic.high),
            low: new Prisma.Decimal(synthetic.low),
            close: new Prisma.Decimal(synthetic.close),
            volume: BigInt(Math.max(1, Math.trunc(synthetic.volume)))
          }
        });
      }

      const history = await db.marketData.findMany({
        where: { roundId, candleIndex: { lte: idx } },
        orderBy: { candleIndex: 'asc' }
      });

      const closes = history.map((h) => Number(h.close));
      const params = await getRoundParams(roundId);
      const indicators = {
        emaFast: ema(closes, params.fastMaPeriod),
        emaSlow: ema(closes, params.slowMaPeriod),
        rsi: rsi(closes, params.rsiPeriod)
      };

      const tick = {
        type: 'TICK',
        round: roundId,
        candle: {
          index: candle.candleIndex,
          timestamp: candle.timestamp.toISOString(),
          open: Number(candle.open),
          high: Number(candle.high),
          low: Number(candle.low),
          close: Number(candle.close),
          volume: Number(candle.volume)
        },
        indicators
      };

      await redis.publish(`round:${roundId}:ticks`, JSON.stringify(tick));

      state.currentIndex = idx + 1;
      await db.round.update({ where: { id: roundId }, data: { currentCandleIndex: state.currentIndex } });

      if (state.currentIndex - state.lastRedisSyncIndex >= REDIS_INDEX_SYNC_INTERVAL) {
        await redis.set(`round:${roundId}:currentIndex`, state.currentIndex);
        state.lastRedisSyncIndex = state.currentIndex;
      }

      await evaluateSignals(roundId, candle.close, idx, indicators, candle.timestamp.toISOString());

      await sleep(1000 / Math.max(state.speed, 0.5));
    } catch (error) {
      console.error(`market engine iteration failed for round ${roundId}`, error);
      await sleep(500);
    }
  }
}

export function stopMarketEngine(roundId: number) {
  runningRounds.set(roundId, false);
}

export function setRoundRuntimeState(
  roundId: number,
  patch: Partial<{ active: boolean; speed: number; currentIndex: number }>
) {
  const current = roundRuntime.get(roundId) || {
    active: false,
    speed: 1,
    currentIndex: 0,
    lastRedisSyncIndex: 0
  };

  const next = {
    ...current,
    ...(typeof patch.active === 'boolean' ? { active: patch.active } : {}),
    ...(typeof patch.speed === 'number' ? { speed: Math.max(patch.speed, 0.5) } : {}),
    ...(typeof patch.currentIndex === 'number'
      ? { currentIndex: Math.max(0, patch.currentIndex), lastRedisSyncIndex: Math.max(0, patch.currentIndex) }
      : {})
  };

  roundRuntime.set(roundId, next);
}
