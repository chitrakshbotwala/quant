import { Prisma } from '@prisma/client';
import { db } from '../core/db';

function getStartingCapital(roundId: number): Prisma.Decimal {
  if (roundId === 2) {
    return new Prisma.Decimal(200000);
  }
  return new Prisma.Decimal(1000000);
}

export async function getOrCreatePortfolio(userId: string, roundId: number) {
  const latest = await db.portfolio.findFirst({
    where: { userId, roundId },
    orderBy: { runId: 'desc' }
  });

  if (latest && latest.isActive) {
    return latest;
  }

  const runId = (latest?.runId || 0) + 1;
  const startingCapital = getStartingCapital(roundId);
  return db.portfolio.create({
    data: {
      userId,
      roundId,
      runId,
      capital: startingCapital,
      bookedPnl: new Prisma.Decimal(0),
      isActive: true,
      deployedAt: new Date()
    }
  });
}

export async function closeAllOpenTrades(portfolioId: string, closePrice: Prisma.Decimal, candleIndex: number, reason: string) {
  const trades = await db.trade.findMany({ where: { portfolioId, status: 'OPEN' } });
  let pnlDelta = new Prisma.Decimal(0);
  let releasedNotional = new Prisma.Decimal(0);

  for (const trade of trades) {
    const sign = trade.direction === 'LONG' ? 1 : -1;
    const priceDiff = closePrice.minus(trade.entryPrice);
    const pnl = priceDiff.mul(sign).mul(trade.sizeUsd).div(trade.entryPrice);
    pnlDelta = pnlDelta.plus(pnl);
    releasedNotional = releasedNotional.plus(trade.sizeUsd);

    await db.trade.update({
      where: { id: trade.id },
      data: {
        status: 'CLOSED',
        exitPrice: closePrice,
        exitCandle: candleIndex,
        pnl,
        closeReason: reason,
        closedAt: new Date()
      }
    });
  }

  if (trades.length > 0) {
    await db.portfolio.update({
      where: { id: portfolioId },
      data: {
        bookedPnl: { increment: pnlDelta },
        // Release reserved position notional and apply realized PnL.
        capital: { increment: releasedNotional.plus(pnlDelta) }
      }
    });
  }

  return pnlDelta;
}
