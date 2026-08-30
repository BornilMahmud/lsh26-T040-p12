/**
 * FIREBASE ERROR TRANSLATION — PRD §40 (never show a raw stack trace),
 * but ALSO never hide a diagnosable cause behind a useless generic message.
 *
 * The previous behaviour replaced every Firestore failure with
 * "Please try again", which made a permission-denied (undeployed security
 * rules) indistinguishable from an offline network blip. This module maps the
 * documented Firestore/Storage error codes to a short, actionable sentence.
 */

export interface FirebaseErrorLike {
  code?: string
  message?: string
  name?: string
}

/** Pull the `code` off a Firebase error safely, e.g. "permission-denied". */
export function firebaseErrorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null
  const raw = (err as FirebaseErrorLike).code
  if (typeof raw !== 'string' || raw.length === 0) return null
  // Firestore codes arrive bare ("permission-denied"); Auth/Storage codes are
  // namespaced ("auth/network-request-failed"). Normalise to the bare code.
  const slash = raw.indexOf('/')
  return slash >= 0 ? raw.slice(slash + 1) : raw
}

/**
 * Turn a Firestore/Storage failure into a message a non-technical user can act
 * on. `action` is a short verb phrase describing what was being attempted,
 * e.g. "save your settings".
 */
export function describeFirebaseError(err: unknown, action: string): string {
  const code = firebaseErrorCode(err)

  switch (code) {
    case 'permission-denied':
    case 'unauthorized':
      return (
        `Firestore blocked this write (permission-denied), so we couldn't ${action}. ` +
        'Your Firebase security rules have not been published yet. Open Firebase Console → ' +
        'Firestore Database → Rules, paste the rules from firestore.rules, and press Publish. ' +
        'You can keep working right now by choosing Demo mode.'
      )

    case 'unavailable':
    case 'network-request-failed':
    case 'retry-limit-exceeded':
      return (
        `Couldn't reach Firebase, so we couldn't ${action}. ` +
        'Check your internet connection and try again — nothing was lost.'
      )

    case 'failed-precondition':
      return (
        `Firestore rejected the request (failed-precondition), so we couldn't ${action}. ` +
        'This usually means the Firestore database has not been created yet in the Firebase ' +
        'Console, or a required index is missing. Open Firebase Console → Firestore Database → ' +
        'Create database, then reload.'
      )

    case 'not-found':
      return (
        `Firebase reported "not-found", so we couldn't ${action}. ` +
        'Confirm the Firestore database exists for this project and that VITE_FIREBASE_PROJECT_ID ' +
        'matches it.'
      )

    case 'unauthenticated':
      return (
        `Your session expired, so we couldn't ${action}. Please sign out and sign in again.`
      )

    case 'resource-exhausted':
      return (
        `Your Firebase project has hit its usage quota, so we couldn't ${action}. ` +
        'Check the Firebase Console usage tab.'
      )

    case 'invalid-argument':
      return (
        `Firestore rejected the data (invalid-argument), so we couldn't ${action}. ` +
        'This is a data-shape problem — check the browser console for the field it named.'
      )

    case 'deadline-exceeded':
    case 'aborted':
    case 'cancelled':
      return `The request to Firebase timed out, so we couldn't ${action}. Please try again.`

    default:
      break
  }

  // No recognised code: surface the raw message tail so the cause is at least
  // visible, but keep it short.
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const tail = raw && raw.length < 160 ? ` (${raw})` : ''
  return `Couldn't ${action}. Please try again.${tail}`
}
