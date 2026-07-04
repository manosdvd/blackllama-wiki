import { existsSync, readFileSync } from 'fs';
import path from 'path';
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import type { Auth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function serviceAccountFromJson(json: string): ServiceAccount {
  const parsed = JSON.parse(json) as ServiceAccount;
  if (typeof parsed.privateKey === 'string') {
    parsed.privateKey = parsed.privateKey.replace(/\\n/g, '\n');
  }
  return parsed;
}

function localServiceAccount(): ServiceAccount | null {
  const localPath = path.join(process.cwd(), 'camp-lawton-staff-hub-firebase-adminsdk-fbsvc-439f443121.json');
  if (!existsSync(localPath)) return null;
  return serviceAccountFromJson(readFileSync(localPath, 'utf8'));
}

export function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (serviceAccountJson) {
    return initializeApp({
      credential: cert(serviceAccountFromJson(serviceAccountJson)),
      projectId,
    });
  }

  if (clientEmail && privateKey && projectId) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
      projectId,
    });
  }

  const localAccount = localServiceAccount();
  if (localAccount) {
    return initializeApp({
      credential: cert(localAccount),
      projectId,
    });
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return initializeApp({
      credential: applicationDefault(),
      projectId,
    });
  }

  return initializeApp(projectId ? { projectId } : {});
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

export async function getAdminAuth(): Promise<Auth> {
  const { getAuth } = await import('firebase-admin/auth');
  return getAuth(getAdminApp());
}
