import { Prisma } from '@prisma/client';
import { db } from '../core/db';

export async function upsertLeaderboard(userId: string, roundId: number, bookedPnl: Prisma.Decimal, isFinal = false) {
  const existing = await db.leaderboardEntry.findMany({ where: { userId, roundId }, orderBy: { recordedAt: 'asc' } });
  const runCount = existing.length + 1;

  await db.leaderboardEntry.upsert({
    where: { userId_roundId_isFinal: { userId, roundId, isFinal } },
    create: { userId, roundId, bookedPnl, runCount, isFinal },
    update: { bookedPnl, runCount }
  });
}

export async function getRoundLeaderboard(roundId: number) {
  const users = await db.user.findMany({
    where: {
      portfolios: {
        some: { roundId }
      }
    },
    include: {
      portfolios: {
        where: { roundId },
        orderBy: [{ runId: 'desc' }]
      }
    }
  });

  const rows = users.map((u) => {
    const runs = u.portfolios;
    const latestRun = runs[0];
    return {
      id: `${u.id}-${roundId}`,
      userId: u.id,
      roundId,
      bookedPnl: latestRun?.bookedPnl || new Prisma.Decimal(0),
      runCount: runs.length,
      isFinal: roundId === 2 ? Boolean(runs.find((r) => r.isSessionLocked)) : false,
      recordedAt: latestRun?.deployedAt || new Date(0),
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        teamId: u.teamId,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt
      }
    };
  });

  return rows.sort((a, b) => Number(b.bookedPnl) - Number(a.bookedPnl));
}

export async function getCombinedLeaderboard() {
  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      teamId: true,
      portfolios: {
        select: {
          roundId: true,
          runId: true,
          bookedPnl: true
        },
        orderBy: [{ roundId: 'asc' }, { runId: 'desc' }]
      }
    }
  });

  const rows = users.map((u) => {
    const latestByRound = new Map<number, number>();
    for (const p of u.portfolios) {
      if (!latestByRound.has(p.roundId)) {
        latestByRound.set(p.roundId, Number(p.bookedPnl));
      }
    }

    const score = Array.from(latestByRound.values()).reduce((sum, v) => sum + v, 0);

    return {
      userId: u.id,
      name: u.name,
      email: u.email,
      teamId: u.teamId,
      score
    };
  });

  rows.sort((a, b) => b.score - a.score);
  return rows;
}
