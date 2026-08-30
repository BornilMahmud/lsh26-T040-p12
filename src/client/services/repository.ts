/**
 * DATA REPOSITORY ABSTRACTION
 *
 * The app talks to this interface only, never to Firestore directly. Two
 * implementations exist:
 *
 *   FirestoreRepository — real persistence, user-scoped collections
 *                         users/{uid}/expenses|pockets|receipts|settings
 *                         (PRD §6), protected by firestore.rules (PRD §39).
 *
 *   LocalRepository     — demo mode. Same contract, backed by localStorage.
 *                         PRD §54 requires demo data to "behave exactly like
 *                         normal data": because both implementations satisfy
 *                         this identical interface and every calculation lives
 *                         in the pure engines, the dashboard/forecast/insights/
 *                         pockets/what-if code paths are literally the same.
 */

import type { Expense, ExpenseDraft, Pocket, PocketDraft, ReceiptRecord, UserSettings } from '@/types'

export interface DataRepository {
  readonly kind: 'firestore' | 'local'
  /** Subscribe to expenses; returns an unsubscribe fn. Fires immediately. */
  subscribeExpenses(cb: (expenses: Expense[]) => void, onError: (e: unknown) => void): () => void
  subscribePockets(cb: (pockets: Pocket[]) => void, onError: (e: unknown) => void): () => void
  subscribeSettings(cb: (settings: UserSettings | null) => void, onError: (e: unknown) => void): () => void

  addExpense(draft: ExpenseDraft, id?: string): Promise<string>
  updateExpense(id: string, patch: Partial<ExpenseDraft>): Promise<void>
  deleteExpense(id: string): Promise<void>
  /** Bulk insert used by the test-data importer / demo seeding. */
  replaceAllExpenses(drafts: ExpenseDraft[]): Promise<void>

  addPocket(draft: PocketDraft, id?: string): Promise<string>
  updatePocket(id: string, patch: Partial<PocketDraft>): Promise<void>
  deletePocket(id: string): Promise<void>
  replaceAllPockets(drafts: PocketDraft[]): Promise<void>

  saveSettings(patch: Partial<UserSettings>): Promise<void>
  saveReceipt(record: Omit<ReceiptRecord, 'userId'>): Promise<void>
  getReceipt(id: string): Promise<ReceiptRecord | null>

  /** Wipe all user data (used by "reset demo" / importer). */
  clearAll(): Promise<void>
}

/** Stable ID generator — used for deterministic retry-safe writes (PRD §68). */
export function newId(prefix = 'id'): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 12) + Date.now().toString(36)
  return `${prefix}_${rand}`
}
