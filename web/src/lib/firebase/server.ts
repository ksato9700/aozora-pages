import 'server-only';
import { initializeApp, getApps, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK
// In Cloud Run, it will automatically use the default service account.
// Locally, you generally need to provide credentials or rely on ADC (Application Default Credentials).

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'aozora-search'; // Replace with actual project ID if known, or env var

if (getApps().length === 0) {
    initializeApp({
        projectId: PROJECT_ID,
    });
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
