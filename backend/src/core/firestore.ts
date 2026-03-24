import admin from 'firebase-admin';

export function getFirestore() {
  if (!admin.apps.length) {
    return null;
  }
  return admin.firestore();
}

export function toFirestoreTimestamp(date: Date) {
  return admin.firestore.Timestamp.fromDate(date);
}