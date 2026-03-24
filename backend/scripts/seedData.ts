import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { Prisma } from '@prisma/client';
import { db } from '../src/core/db';

type CsvRow = {
  timestamp: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};

async function loadCsv(fileName: string) {
  const text = await fs.readFile(path.join(process.cwd(), fileName), 'utf8');
  return parse(text, { columns: true, skip_empty_lines: true }) as CsvRow[];
}

async function seedRound(roundId: number, name: string) {
  await db.round.upsert({
    where: { id: roundId },
    create: { id: roundId, name },
    update: { name }
  });
}

async function seedCandles(roundId: number, fileName: string) {
  const rows = await loadCsv(fileName);
  const data = rows.slice(0, 500).map((r, idx) => ({
    roundId,
    candleIndex: idx,
    timestamp: new Date(r.timestamp),
    open: new Prisma.Decimal(r.open),
    high: new Prisma.Decimal(r.high),
    low: new Prisma.Decimal(r.low),
    close: new Prisma.Decimal(r.close),
    volume: BigInt(Math.trunc(Number(r.volume)))
  }));

  await db.marketData.deleteMany({ where: { roundId } });
  if (data.length > 0) {
    await db.marketData.createMany({ data });
  }

  await db.round.update({
    where: { id: roundId },
    data: {
      originalCandleCount: data.length,
      currentCandleIndex: 0
    }
  });
}

async function main() {
  await seedRound(1, 'Optimization Sprint');
  await seedRound(2, 'The Delphi Protocol');

  try {
    await seedCandles(1, 'nasdaq_ohlcv.csv');
    await seedCandles(2, 'aapl_ohlcv.csv');
  } catch {
    console.log('CSV files missing. Run npm run fetch:data first.');
  }

  console.log('seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
