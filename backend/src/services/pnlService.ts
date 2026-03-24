import { Prisma } from '@prisma/client';
import { db } from '../core/db';

export async function computeUnrealizedPnl(portfolioId: string, markPrice: Prisma.Decimal) {
  const openTrades = await db.trade.findMany({ where: { portfolioId, status: 'OPEN' } });
  let unrealized = new Prisma.Decimal(0);
  for (const trade of openTrades) {
    const sign = trade.direction === 'LONG' ? 1 : -1;
    const pnl = markPrice.minus(trade.entryPrice).mul(sign).mul(trade.sizeUsd).div(trade.entryPrice);
    unrealized = unrealized.plus(pnl);
  }
  return unrealized;
}
