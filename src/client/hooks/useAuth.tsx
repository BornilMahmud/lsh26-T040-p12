/**
 * Authentication context — PRD §5.
 *
 * Supports:
 *  - Google Sign-In via Firebase Auth (popup, with redirect fallback)
 *  - Persistent sessions (browserLocalPersistence, set in firebase/config)
 *  - Logout
 *  - Protected routes (see components/ProtectedRoute)
 *  - Demo mode: a local-only session so judges can explore the full product
 *    without credentials. Demo sessions are clearly labelled in the UI and
 *    write only to localStorage.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  type User
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getFirebaseAuth, getDb, googleProvider, isFirebaseConfigured } from '@/firebase/config'

export interface AppUser {
  uid: string
  displayName: string
  email: string
  photoURL: string | null
  isDemo: boolean
}

interface AuthContextValue {
  user: AppUser | null
  loading: boolean
  error: string | null
  isFirebaseConfigured: boolean
  signInWithGoogle: () => Promise<void>
  startDemo: () => void
  logout: () => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const DEMO_SESSION_KEY = 'plm:demo-session'
const DEMO_USER: AppUser = {
  uid: 'demo-user',
  displayName: 'Demo User',
  email: 'demo@personalledger.app',
  photoURL: null,
  isDemo: true
}

function friendlyAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled. Please try again.'
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup. Please allow popups and try again.'
    case 'auth/network-request-failed':
      return 'Network problem while signing in. Check your connection and try again.'
    case 'auth/unauthorized-domain':
      return 'This domain is not yet authorised in Firebase Authentication. Add it under Authentication → Settings → Authorized domains, or use Demo Mode.'
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled for this Firebase project. Enable it in the Firebase console, or use Demo Mode.'
    default:
      // Never surface a raw Firebase error to the user (PRD §40).
      console.error('Auth error', err)
      return 'We could not sign you in. Please try again, or explore Demo Mode.'
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Restore a demo session immediately (synchronously available on next tick).
  useEffect(() => {
    let cancelled = false
    const auth = getFirebaseAuth()

    if (localStorage.getItem(DEMO_SESSION_KEY) === '1') {
      setUser(DEMO_USER)
      setLoading(false)
      return
    }

    if (!auth) {
      // Firebase not configured: the app still runs in demo mode.
      setLoading(false)
      return
    }

    // Handle a redirect-based sign-in returning to the app.
    getRedirectResult(auth).catch((err) => {
      if (!cancelled) setError(friendlyAuthError(err))
    })

    const unsub = onAuthStateChanged(
      auth,
      async (fbUser: User | null) => {
        if (cancelled) return
        if (!fbUser) {
          setUser(null)
          setLoading(false)
          return
        }
        const appUser: AppUser = {
          uid: fbUser.uid,
          displayName: fbUser.displayName ?? 'User',
          email: fbUser.email ?? '',
          photoURL: fbUser.photoURL ?? null,
          isDemo: false
        }
        setUser(appUser)
        setLoading(false)
        // Create/find users/{uid} (PRD §5). Non-fatal on failure.
        void ensureUserDocument(appUser)
      },
      (err) => {
        if (cancelled) return
        setError(friendlyAuthError(err))
        setLoading(false)
      }
    )

    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    setError(null)
    const auth = getFirebaseAuth()
    if (!auth) {
      setError(
        'Firebase is not configured for this deployment, so Google sign-in is unavailable. You can explore the full app in Demo Mode.'
      )
      return
    }
    try {
      await signInWithPopup(auth, googleProvider())
    } catch (err) {
      const code = (err as { code?: string })?.code ?? ''
      // Popups are unreliable on some mobile browsers — fall back to redirect.
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        try {
          await signInWithRedirect(auth, googleProvider())
          return
        } catch (redirectErr) {
          setError(friendlyAuthError(redirectErr))
          return
        }
      }
      setError(friendlyAuthError(err))
    }
  }, [])

  const startDemo = useCallback(() => {
    localStorage.setItem(DEMO_SESSION_KEY, '1')
    setError(null)
    setUser(DEMO_USER)
    setLoading(false)
  }, [])

  const logout = useCallback(async () => {
    const wasDemo = user?.isDemo
    localStorage.removeItem(DEMO_SESSION_KEY)
    setUser(null)
    if (!wasDemo) {
      const auth = getFirebaseAuth()
      if (auth) {
        try {
          await signOut(auth)
        } catch (err) {
          console.error('Sign-out failed', err)
        }
      }
    }
  }, [user])

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      isFirebaseConfigured,
      signInWithGoogle,
      startDemo,
      logout,
      clearError: () => setError(null)
    }),
    [user, loading, error, signInWithGoogle, startDemo, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** users/{uid} — created on first login, refreshed on subsequent logins. */
async function ensureUserDocument(user: AppUser) {
  const db = getDb()
  if (!db) return
  try {
    const ref = doc(db, 'users', user.uid)
    const snap = await getDoc(ref)
    const base = {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
      updatedAt: Date.now(),
      serverUpdatedAt: serverTimestamp()
    }
    if (snap.exists()) {
      await setDoc(ref, base, { merge: true })
    } else {
      await setDoc(ref, { ...base, createdAt: Date.now() }, { merge: true })
    }
  } catch (err) {
    console.error('Could not write user profile document', err)
  }
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
