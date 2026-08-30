/**
 * Firebase initialization — PRD §65.
 *
 * Config comes from Vite environment variables (see .env.example). Firebase
 * *web* config values are not secrets (they identify the project and are
 * visible in any client bundle); access control is enforced by the Firestore
 * and Storage security rules in firestore.rules / storage.rules (PRD §39, §67).
 *
 * Genuine secrets (AI/vision API keys, service accounts) never appear here —
 * they live in the Cloudflare Worker environment and are used only server-side
 * (PRD §14, §64).
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
  GoogleAuthProvider,
  type Auth
} from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

const env = import.meta.env

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined
}

/** True when enough config is present to actually talk to Firebase. */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain
)

let app: FirebaseApp | null = null
let authInstance: Auth | null = null
let dbInstance: Firestore | null = null
let storageInstance: FirebaseStorage | null = null

function ensureApp(): FirebaseApp | null {
  if (!isFirebaseConfigured) return null
  if (app) return app
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig as Required<typeof firebaseConfig>)
  return app
}

export function getFirebaseAuth(): Auth | null {
  const a = ensureApp()
  if (!a) return null
  if (!authInstance) {
    authInstance = getAuth(a)
    // Persistent sessions across reloads (PRD §4 "Persistent sessions").
    setPersistence(authInstance, browserLocalPersistence).catch(() => {
      /* falls back to in-memory persistence; login still works */
    })
  }
  return authInstance
}

export function getDb(): Firestore | null {
  const a = ensureApp()
  if (!a) return null
  if (!dbInstance) dbInstance = getFirestore(a)
  return dbInstance
}

export function getStorageInstance(): FirebaseStorage | null {
  const a = ensureApp()
  if (!a) return null
  if (!storageInstance) storageInstance = getStorage(a)
  return storageInstance
}

export function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  return provider
}
