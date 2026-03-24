import { db } from '../core/db';
import { getFirestore, toFirestoreTimestamp } from '../core/firestore';

let warnedFirestoreUnavailable = false;

export async function syncUserProfileSnapshot(userId: string) {
  const firestore = getFirestore();
  if (!firestore) {
    if (!warnedFirestoreUnavailable) {
      warnedFirestoreUnavailable = true;
      console.warn('[firestore-sync] skipped because Firebase Admin SDK is not initialized');
    }
    return;
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const round1Runs = await db.portfolio.findMany({
    where: { userId, roundId: 1 },
    orderBy: [{ bookedPnl: 'desc' }, { runId: 'asc' }]
  });
  const round2Latest = await db.portfolio.findFirst({ where: { userId, roundId: 2 }, orderBy: { runId: 'desc' } });

  const round1BestPnl = Number(round1Runs[0]?.bookedPnl || 0);
  const round1RunCount = round1Runs.length;
  const round2FinalPnl = round2Latest?.isSessionLocked ? Number(round2Latest.bookedPnl) : null;
  const combinedScore = round1BestPnl + (round2FinalPnl || 0);

  const docId = user.firebaseUid || user.id;
  const profileRef = firestore.collection('userProfiles').doc(docId);

  await profileRef.set(
    {
      displayName: user.name || 'Participant',
      email: user.email,
      teamId: user.teamId || '',
      round1BestPnl,
      round1RunCount,
      round2FinalPnl,
      combinedScore,
      lastUpdated: toFirestoreTimestamp(new Date())
    },
    { merge: true }
  );

  const closedTrades = await db.trade.findMany({
    where: {
      status: 'CLOSED',
      portfolio: { userId }
    },
    include: {
      portfolio: {
        select: { roundId: true }
      }
    }
  });

  for (const trade of closedTrades) {
    const closedAt = trade.closedAt || new Date();
    await profileRef.collection('trades').doc(trade.id).set(
      {
        roundId: trade.portfolio.roundId,
        direction: trade.direction,
        entryPrice: Number(trade.entryPrice),
        exitPrice: trade.exitPrice ? Number(trade.exitPrice) : null,
        sizeUsd: Number(trade.sizeUsd),
        pnl: Number(trade.pnl || 0),
        closeReason: trade.closeReason || '-',
        closedAt: toFirestoreTimestamp(closedAt)
      },
      { merge: true }
    );
  }
}