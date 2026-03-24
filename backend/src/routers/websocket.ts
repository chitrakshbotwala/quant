import { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyToken } from '../core/jwt';
import { db } from '../core/db';
import { redisSub } from '../core/redis';
import { ensureDevUser, isDevBypassAuthEnabled } from '../core/devAuth';

const wsClients = new Map<number, Set<WebSocket>>();
const userSockets = new Map<string, WebSocket>();

function serializeCandle(c: {
  candleIndex: number;
  timestamp: Date;
  open: unknown;
  high: unknown;
  low: unknown;
  close: unknown;
  volume: bigint;
}) {
  return {
    index: c.candleIndex,
    timestamp: c.timestamp.toISOString(),
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    volume: Number(c.volume)
  };
}

function safeSend(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export async function bootstrapRedisSubscriber() {
  await redisSub.subscribe('round:1:ticks', 'round:2:ticks');
  redisSub.on('message', (channel, message) => {
    const roundId = Number(channel.split(':')[1]);
    const clients = wsClients.get(roundId);
    if (!clients) {
      return;
    }
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  });
}

export function createWebSocketServer(server: any) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (request: IncomingMessage, socket: any, head: any) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    if (!url.pathname.startsWith('/ws/round/')) {
      socket.destroy();
      return;
    }

    const roundId = Number(url.pathname.split('/').pop());
    const token = url.searchParams.get('token');
    const bypassAuth = isDevBypassAuthEnabled();

    if ((!token && !bypassAuth) || Number.isNaN(roundId)) {
      socket.destroy();
      return;
    }

    let user: { userId: string; email: string; role: string };
    if (token) {
      try {
        user = verifyToken(token);
      } catch {
        if (!bypassAuth) {
          socket.destroy();
          return;
        }
        const devUser = await ensureDevUser();
        user = { userId: devUser.id, email: devUser.email, role: devUser.role };
      }
    } else {
      const devUser = await ensureDevUser();
      user = { userId: devUser.id, email: devUser.email, role: devUser.role };
    }

    wss.handleUpgrade(request, socket, head, async (ws) => {
      if (!wsClients.has(roundId)) wsClients.set(roundId, new Set());
      wsClients.get(roundId)?.add(ws);
      userSockets.set(user.userId, ws);

      const round = await db.round.findUnique({ where: { id: roundId } });
      const status = !round ? 'ENDED' : round.isActive ? 'ACTIVE' : 'PAUSED';
      const splitIndex = round?.splitIndex || 250;
      const currentCandleIndex = round?.currentCandleIndex || 0;

      const historicalCandles = await db.marketData.findMany({
        where: { roundId, candleIndex: { lt: Math.min(splitIndex, currentCandleIndex) } },
        orderBy: { candleIndex: 'asc' }
      });

      const catchupCandles = currentCandleIndex > splitIndex
        ? await db.marketData.findMany({
            where: {
              roundId,
              candleIndex: {
                gte: splitIndex,
                lt: currentCandleIndex
              }
            },
            orderBy: { candleIndex: 'asc' }
          })
        : [];

      const portfolio = await db.portfolio.findFirst({
        where: { userId: user.userId, roundId },
        orderBy: { runId: 'desc' }
      });
      const openPositions = portfolio
        ? await db.trade.findMany({ where: { portfolioId: portfolio.id, status: 'OPEN' }, orderBy: { openedAt: 'asc' } })
        : [];

      const markCandle = await db.marketData.findFirst({
        where: {
          roundId,
          candleIndex: { lte: Math.max(currentCandleIndex - 1, 0) }
        },
        orderBy: { candleIndex: 'desc' }
      });
      const currentPrice = markCandle ? Number(markCandle.close) : null;

      const enrichedOpenPositions = openPositions.map((p) => {
        const entryPrice = Number(p.entryPrice);
        const sizeUsd = Number(p.sizeUsd);
        const hasMark = currentPrice !== null;
        const sign = p.direction === 'LONG' ? 1 : -1;
        const unrealizedPnl = hasMark
          ? ((currentPrice - entryPrice) * sign * sizeUsd) / entryPrice
          : 0;

        return {
          id: p.id,
          direction: p.direction,
          entryPrice,
          currentPrice: hasMark ? currentPrice : entryPrice,
          sizeUsd,
          entryCandle: p.entryCandle,
          unrealizedPnl
        };
      });

      const totalUnrealized = enrichedOpenPositions.reduce((acc, p) => acc + p.unrealizedPnl, 0);
      const openNotional = enrichedOpenPositions.reduce((acc, p) => acc + p.sizeUsd, 0);

      safeSend(ws, {
        type: 'ROUND_STATUS',
        round: roundId,
        status,
        currentCandleIndex,
        totalCandles: await db.marketData.count({ where: { roundId } })
      });

      safeSend(ws, {
        type: 'HISTORICAL_CANDLES',
        round: roundId,
        candles: historicalCandles.map((c) => serializeCandle(c))
      });

      if (catchupCandles.length > 0 || portfolio) {
        safeSend(ws, {
          type: 'CATCHUP',
          candles: catchupCandles.map((c) => serializeCandle(c)),
          currentPortfolio: portfolio
            ? {
                id: portfolio.id,
                capital: Number(portfolio.capital),
                bookedPnl: Number(portfolio.bookedPnl),
                unrealizedPnl: totalUnrealized,
                totalPortfolioValue: Number(portfolio.capital) + openNotional + totalUnrealized,
                isActive: portfolio.isActive,
                runId: portfolio.runId,
                openPositions: enrichedOpenPositions
              }
            : null
        });
      }

      ws.on('close', () => {
        wsClients.get(roundId)?.delete(ws);
        userSockets.delete(user.userId);
      });
    });
  });

  return wss;
}

export function sendPortfolioUpdate(userId: string, payload: unknown) {
  const ws = userSockets.get(userId);
  if (ws) safeSend(ws, payload);
}

export function sendUserEvent(userId: string, payload: unknown) {
  const ws = userSockets.get(userId);
  if (ws) safeSend(ws, payload);
}

export function broadcastRoundStatus(roundId: number, status: 'ACTIVE' | 'PAUSED' | 'ENDED', currentCandleIndex: number, totalCandles: number) {
  const clients = wsClients.get(roundId);
  if (!clients) return;
  const msg = {
    type: 'ROUND_STATUS',
    round: roundId,
    status,
    currentCandleIndex,
    totalCandles
  };

  for (const ws of clients) {
    safeSend(ws, msg);
  }
}

export function getWsConnectionCount() {
  let total = 0;
  for (const set of wsClients.values()) {
    total += set.size;
  }
  return total;
}
