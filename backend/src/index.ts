import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import cors from 'cors';
import express from 'express';
import { Prisma } from '@prisma/client';
import { initFirebase } from './core/firebase';
import { db } from './core/db';
import { requireAdmin, requireAuth } from './core/auth';
import authRouter from './routers/auth';
import roundsRouter from './routers/rounds';
import tradingRouter from './routers/trading';
import algoRouter from './routers/algo';
import leaderboardRouter from './routers/leaderboard';
import adminRouter from './routers/admin';
import profileRouter from './routers/profile';
import { bootstrapRedisSubscriber, createWebSocketServer } from './routers/websocket';
import { redis } from './core/redis';

dotenv.config({ path: path.resolve(process.cwd(), '../.env'), override: true });
dotenv.config({ override: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/rounds', requireAuth, roundsRouter);
app.use('/api/trading', requireAuth, tradingRouter);
app.use('/api/algo', requireAuth, algoRouter);
app.use('/api/leaderboard', requireAuth, leaderboardRouter);
app.use('/api/profile', requireAuth, profileRouter);
app.use('/api/admin', requireAuth, requireAdmin, adminRouter);

const server = http.createServer(app);
createWebSocketServer(server);

function generateSyntheticCandles(roundId: number, start: Date, stepMinutes: number, basePrice: number) {
  const rows: Array<{
    roundId: number;
    candleIndex: number;
    timestamp: Date;
    open: Prisma.Decimal;
    high: Prisma.Decimal;
    low: Prisma.Decimal;
    close: Prisma.Decimal;
    volume: bigint;
  }> = [];

  let previousClose = basePrice;
  for (let i = 0; i < 500; i += 1) {
    const wave = Math.sin(i / 18) * basePrice * 0.012;
    const drift = (i / 500) * basePrice * 0.02;
    const open = previousClose;
    const close = basePrice + wave + drift;
    const high = Math.max(open, close) + basePrice * 0.004;
    const low = Math.min(open, close) - basePrice * 0.004;
    const volume = BigInt(1_000_000 + i * 1200);

    rows.push({
      roundId,
      candleIndex: i,
      timestamp: new Date(start.getTime() + i * stepMinutes * 60_000),
      open: new Prisma.Decimal(open.toFixed(4)),
      high: new Prisma.Decimal(high.toFixed(4)),
      low: new Prisma.Decimal(low.toFixed(4)),
      close: new Prisma.Decimal(close.toFixed(4)),
      volume
    });

    previousClose = close;
  }

  return rows;
}

async function ensureMarketData(roundId: number, start: Date, stepMinutes: number, basePrice: number) {
  const count = await db.marketData.count({ where: { roundId } });
  if (count > 0) {
    const round = await db.round.findUnique({ where: { id: roundId } });
    if (round && round.originalCandleCount === 0) {
      await db.round.update({ where: { id: roundId }, data: { originalCandleCount: count } });
    }
    return;
  }

  const candles = generateSyntheticCandles(roundId, start, stepMinutes, basePrice);
  await db.marketData.createMany({ data: candles });
  await db.round.update({ where: { id: roundId }, data: { originalCandleCount: candles.length } });
}

async function bootstrap() {
  initFirebase();
  await db.$connect();

  await Promise.all([
    db.round.upsert({
      where: { id: 1 },
      create: { id: 1, name: 'Optimization Sprint', gbmDrift: 0.0001, gbmVolatility: 0.002 },
      update: { name: 'Optimization Sprint', gbmDrift: 0.0001, gbmVolatility: 0.002 }
    }),
    db.round.upsert({
      where: { id: 2 },
      create: { id: 2, name: 'The Delphi Protocol', gbmDrift: 0.00005, gbmVolatility: 0.0025 },
      update: { name: 'The Delphi Protocol', gbmDrift: 0.00005, gbmVolatility: 0.0025 }
    })
  ]);

  await Promise.all([
    ensureMarketData(1, new Date('2020-01-01T00:00:00Z'), 60, 10000),
    ensureMarketData(2, new Date('2022-01-01T00:00:00Z'), 15, 150)
  ]);

  await redis.connect().catch(() => undefined);

  await Promise.all([
    redis.setnx('round:1:active', '0'),
    redis.setnx('round:2:active', '0'),
    redis.setnx('round:1:speed', '1'),
    redis.setnx('round:2:speed', '1'),
    redis.setnx('round:1:currentIndex', '0'),
    redis.setnx('round:2:currentIndex', '0')
  ]);

  await bootstrapRedisSubscriber();

  const port = Number(process.env.PORT || 4000);
  server.listen(port, () => {
    console.log(`backend listening on :${port}`);
  });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
