import 'server-only';
import { initializeApp, getApps, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK
// In Cloud Run, it will automatically use the default service account.
// Locally, you generally need to provide credentials or rely on ADC (Application Default Credentials).

if (getApps().length === 0) {
    initializeApp();
} else {
    getApp();
}

export const db = getFirestore();

// Helper types for converter
const converter = <T extends FirebaseFirestore.DocumentData>() => ({
    toFirestore: (data: T) => data,
    fromFirestore: (snap: FirebaseFirestore.QueryDocumentSnapshot) =>
        snap.data() as T,
});

export const dataPoint = <T extends FirebaseFirestore.DocumentData>(collectionPath: string) =>
    db.collection(collectionPath).withConverter(converter<T>());
