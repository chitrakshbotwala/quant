import { db } from './db';

function isTruthy(value: string | undefined): boolean {
  return (value || '').toLowerCase() === 'true';
}

export function isDevMode(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function isDevBypassAuthEnabled(): boolean {
  return isDevMode() && isTruthy(process.env.DEV_BYPASS_AUTH);
}

export function getDevUserEmail(): string {
  const fromEnv = (process.env.DEV_USER_EMAIL || '').trim().toLowerCase();
  if (fromEnv) {
    return fromEnv;
  }

  const firstAdmin = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .find(Boolean);

  return firstAdmin || 'dev@kiit.ac.in';
}

export async function ensureDevUser() {
  const email = getDevUserEmail();
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase());
  const role = adminEmails.includes(email) ? 'admin' : 'participant';

  return db.user.upsert({
    where: { email },
    create: {
      email,
      name: 'Dev User',
      role,
      isActive: true
    },
    update: {
      role,
      isActive: true
    }
  });
}
