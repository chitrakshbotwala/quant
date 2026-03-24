import { NextFunction, Request, Response } from 'express';
import { verifyToken } from './jwt';
import { db } from './db';
import { ensureDevUser, isDevBypassAuthEnabled } from './devAuth';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        role: string;
      };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (isDevBypassAuthEnabled()) {
    const devUser = await ensureDevUser();
    req.user = {
      userId: devUser.id,
      email: devUser.email,
      role: devUser.role
    };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  try {
    const token = authHeader.slice(7);
    const user = verifyToken(token);
    const dbUser = await db.user.findUnique({ where: { id: user.userId } });
    if (!dbUser || !dbUser.isActive) {
      return res.status(403).json({ error: 'USER_DISABLED' });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: 'INVALID_TOKEN' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  return next();
}
