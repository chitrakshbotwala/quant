import { Router } from 'express';
import { db } from '../core/db';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const userId = req.user!.userId;

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });

    const round1Runs = await db.portfolio.findMany({
      where: { userId, roundId: 1 },
      orderBy: [{ bookedPnl: 'desc' }, { runId: 'asc' }]
    });
    const round2Latest = await db.portfolio.findFirst({
      where: { userId, roundId: 2 },
      orderBy: { runId: 'desc' }
    });

    const bestRound1 = round1Runs[0] || null;
    const round1BestPnl = Number(bestRound1?.bookedPnl || 0);
    const round1RunCount = round1Runs.length;
    const round1BestRunNumber = bestRound1?.runId || null;

    const round2FinalPnl = round2Latest?.isSessionLocked ? Number(round2Latest.bookedPnl) : null;
    const round2SessionLocked = Boolean(round2Latest?.isSessionLocked);
    const combinedScore = round1BestPnl + (round2FinalPnl || 0);

    const trades = await db.trade.findMany({
      where: { status: 'CLOSED', portfolio: { userId } },
      include: { portfolio: { select: { roundId: true } } },
      orderBy: { closedAt: 'asc' }
    });

    let cumulative = 0;
    const curve = trades
      .filter((t) => t.closedAt)
      .map((t) => {
        cumulative += Number(t.pnl || 0);
        return {
          time: t.closedAt!.toISOString(),
          cumulativeBookedPnl: cumulative
        };
      });

    return res.json({
      user: {
        id: user.id,
        firebaseUid: user.firebaseUid,
        name: user.name,
        email: user.email,
        teamId: user.teamId,
        role: user.role
      },
      round1: {
        bestBookedPnl: round1BestPnl,
        runCount: round1RunCount,
        bestRunNumber: round1BestRunNumber
      },
      round2: {
        finalBookedPnl: round2FinalPnl,
        sessionLocked: round2SessionLocked
      },
      combinedScore,
      trades: trades.map((t) => ({
        id: t.id,
        roundId: t.portfolio.roundId,
        direction: t.direction,
        entryPrice: Number(t.entryPrice),
        exitPrice: t.exitPrice ? Number(t.exitPrice) : null,
        sizeUsd: Number(t.sizeUsd),
        pnl: Number(t.pnl || 0),
        closeReason: t.closeReason || '-',
        closedAt: t.closedAt?.toISOString() || null
      })),
      pnlCurve: curve
    });
  } catch (error) {
    console.error('profile route failed', error);
    return res.status(500).json({ error: 'PROFILE_FETCH_FAILED' });
  }
});

export default router;