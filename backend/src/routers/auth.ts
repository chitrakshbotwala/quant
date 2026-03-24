import { Router } from 'express';
import { verifyFirebaseIdToken } from '../core/firebase';
import { db } from '../core/db';
import { signToken } from '../core/jwt';
import { requireAuth } from '../core/auth';
import { getDevUserEmail, isDevBypassAuthEnabled } from '../core/devAuth';
import { syncUserProfileSnapshot } from '../services/profileSyncService';

const router = Router();

router.post('/verify', async (req, res) => {
  const { idToken } = req.body as { idToken?: string };
  const bypassAuth = isDevBypassAuthEnabled();

  if (!idToken && !bypassAuth) return res.status(400).json({ error: 'MISSING_ID_TOKEN' });

  try {
    const decoded = idToken ? await verifyFirebaseIdToken(idToken) : null;
    const firebaseUid = decoded?.uid || null;
    const email = (decoded?.email || getDevUserEmail()).toLowerCase();
    if (!email) return res.status(400).json({ error: 'NO_EMAIL' });

    const allowlist = await db.allowlist.findUnique({ where: { email } });

    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase());
    const role = adminEmails.includes(email) ? 'admin' : 'participant';

    const user = await db.user.upsert({
      where: { email },
      create: {
        firebaseUid,
        email,
        name: allowlist?.name || decoded?.name || 'Dev User',
        teamId: allowlist?.teamId || null,
        role
      },
      update: {
        firebaseUid,
        name: allowlist?.name || decoded?.name || 'Dev User',
        teamId: allowlist?.teamId || null,
        role
      }
    });

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    await syncUserProfileSnapshot(user.id).catch((err) => {
      console.warn(`[firestore-sync] failed during auth verify for user ${user.id}: ${String(err)}`);
    });
    return res.json({ token, user, isAdmin: user.role === 'admin' });
  } catch (error) {
    if (bypassAuth) {
      const email = getDevUserEmail();
      const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase());
      const role = adminEmails.includes(email) ? 'admin' : 'participant';

      const user = await db.user.upsert({
        where: { email },
        create: { firebaseUid: 'dev-user', email, name: 'Dev User', role, isActive: true },
        update: { firebaseUid: 'dev-user', role, isActive: true }
      });

      const token = signToken({ userId: user.id, email: user.email, role: user.role });
      await syncUserProfileSnapshot(user.id).catch((err) => {
        console.warn(`[firestore-sync] failed during auth bypass for user ${user.id}: ${String(err)}`);
      });
      return res.json({ token, user, bypass: true, isAdmin: user.role === 'admin' });
    }

    return res.status(401).json({ error: 'INVALID_FIREBASE_TOKEN', detail: String(error) });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await db.user.findUnique({ where: { id: req.user!.userId } });
  return res.json({ user, isAdmin: user?.role === 'admin' });
});

export default router;
