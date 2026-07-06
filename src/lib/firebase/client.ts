import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";

import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const isConfigValid = typeof firebaseConfig.apiKey === 'string' && firebaseConfig.apiKey.trim().length > 0;

let app: FirebaseApp;

let db: Firestore;

function createFirestore(firebaseApp: FirebaseApp): Firestore {
  if (typeof window === "undefined") return getFirestore(firebaseApp);

  try {
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (err) {
    if (err instanceof Error && !err.message.includes("already been called")) {
      console.warn("Firestore persistent cache unavailable; falling back to default cache.", err);
    }
    return getFirestore(firebaseApp);
  }
}

if (isConfigValid) {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

  db = createFirestore(app);
} else {
  // Mock fallback to allow Next.js static build to succeed without API keys in CI envs
  app = { name: "[MockApp]" } as unknown as FirebaseApp;

  db = {} as unknown as Firestore;
}

export { app, db };
