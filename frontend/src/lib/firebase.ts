import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'dev',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'dev',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'dev',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

export async function signInWithGoogle() {
  if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEV_AUTH_BYPASS === 'true') {
    return { idToken: 'dev@kiit.ac.in', uid: 'dev-user', email: 'dev@kiit.ac.in', displayName: 'Dev User', photoURL: null };
  }

  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'dev') {
    throw new Error('Firebase is not configured. Set VITE_FIREBASE_* environment variables.');
  }

  const result = await signInWithPopup(auth, provider);
  const idToken = await result.user.getIdToken();
  return {
    idToken,
    uid: result.user.uid,
    email: result.user.email,
    displayName: result.user.displayName,
    photoURL: result.user.photoURL
  };
}
