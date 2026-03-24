import admin from 'firebase-admin';

let initialized = false;

export function isFirebaseInitialized() {
  return initialized;
}

export function initFirebase() {
  if (initialized) {
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey
      })
    });
    initialized = true;
    console.log('[firebase] admin sdk initialized');
  } else {
    const missing: string[] = [];
    if (!projectId) missing.push('FIREBASE_PROJECT_ID');
    if (!clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
    if (!privateKey) missing.push('FIREBASE_PRIVATE_KEY');
    console.warn(`[firebase] admin sdk disabled, missing env: ${missing.join(', ')}`);
  }
}

export async function verifyFirebaseIdToken(idToken: string) {
  if (!initialized) {
    // Local fallback for development/testing without Admin SDK private key.
    // Accepts either a raw email string or a JWT-like token and extracts email claim.
    let fallbackEmail = idToken;
    const parts = idToken.split('.');
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { email?: string; name?: string; sub?: string; user_id?: string };
        if (payload.email) {
          fallbackEmail = payload.email;
        }
        return {
          uid: payload.sub || payload.user_id || 'dev-user',
          email: fallbackEmail,
          name: payload.name || 'Dev User'
        };
      } catch {
        // Ignore parse errors and use raw token fallback below.
      }
    }

    return {
      uid: 'dev-user',
      email: fallbackEmail,
      name: 'Dev User'
    };
  }
  return admin.auth().verifyIdToken(idToken);
}
