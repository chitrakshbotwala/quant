import fs from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { Prisma } from '@prisma/client';
import { db } from '../core/db';

type CsvRow = {
  timestamp: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};

function getRoundCsvFile(roundId: number): string | null {
  if (roundId === 1) return 'nasdaq_ohlcv.csv';
  if (roundId === 2) return 'aapl_ohlcv.csv';
  return null;
}

export async function resetRoundToBaseline(roundId: number): Promise<{ reset: boolean; count: number }> {
  const fileName = getRoundCsvFile(roundId);
  if (!fileName) {
    return { reset: false, count: 0 };
  }

  const filePath = path.join(process.cwd(), fileName);
  let csvText: string;
  try {
    csvText = await fs.readFile(filePath, 'utf8');
  } catch {
    return { reset: false, count: 0 };
  }

  const rows = parse(csvText, { columns: true, skip_empty_lines: true }) as CsvRow[];
  const candles = rows.slice(0, 500).map((r, idx) => ({
    roundId,
    candleIndex: idx,
    timestamp: new Date(r.timestamp),
    open: new Prisma.Decimal(r.open),
    high: new Prisma.Decimal(r.high),
    low: new Prisma.Decimal(r.low),
    close: new Prisma.Decimal(r.close),
    volume: BigInt(Math.max(1, Math.trunc(Number(r.volume))))
  }));

  await db.marketData.deleteMany({ where: { roundId } });
  if (candles.length > 0) {
    await db.marketData.createMany({ data: candles });
  }

  await db.round.update({
    where: { id: roundId },
    data: {
      originalCandleCount: candles.length,
      currentCandleIndex: 0
    }
  });

  return { reset: true, count: candles.length };
}
