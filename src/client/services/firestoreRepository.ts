/**
 * Firestore implementation of DataRepository — PRD §6, §39, §66.
 *
 * Collection layout (user-scoped, never a global expenses collection):
 *   users/{uid}
 *   users/{uid}/expenses/{expenseId}
 *   users/{uid}/pockets/{pocketId}
 *   users/{uid}/receipts/{receiptId}
 *   users/{uid}/settings/profile
 *
 * The uid is taken from the authenticated Firebase user object, and the
 * security rules independently verify request.auth.uid == userId, so a
 * client-supplied uid can never widen access (PRD §5).
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  getDocs,
  type Firestore
} from 'firebase/firestore'
import type {
  Expense,
  ExpenseDraft,
  Pocket,
  PocketDraft,
  ReceiptRecord,
  UserSettings
} from '@/types'
import { DEFAULT_SETTINGS, coerceCategory } from '@/types'
import { newId, type DataRepository } from './repository'

export class FirestoreRepository implements DataRepository {
  readonly kind = 'firestore' as const

  constructor(private db: Firestore, private uid: string) {}

  private expensesCol() {
    return collection(this.db, 'users', this.uid, 'expenses')
  }
  private pocketsCol() {
    return collection(this.db, 'users', this.uid, 'pockets')
  }
  private receiptsCol() {
    return collection(this.db, 'users', this.uid, 'receipts')
  }
  private settingsDoc() {
    return doc(this.db, 'users', this.uid, 'settings', 'profile')
  }

  subscribeExpenses(cb: (expenses: Expense[]) => void, onError: (e: unknown) => void) {
    // Ordered by date desc — index declared in firestore.indexes.json (PRD §66)
    const q = query(this.expensesCol(), orderBy('date', 'desc'))
    return onSnapshot(
      q,
      (snap) => {
        const out: Expense[] = []
        snap.forEach((d) => {
          const raw = d.data() as Record<string, unknown>
          out.push(normalizeExpense(d.id, this.uid, raw))
        })
        cb(out)
      },
      onError
    )
  }

  subscribePockets(cb: (pockets: Pocket[]) => void, onError: (e: unknown) => void) {
    return onSnapshot(
      this.pocketsCol(),
      (snap) => {
        const out: Pocket[] = []
        snap.forEach((d) => {
          const raw = d.data() as Record<string, unknown>
          out.push(normalizePocket(d.id, this.uid, raw))
        })
        out.sort((a, b) => a.createdAt - b.createdAt)
        cb(out)
      },
      onError
    )
  }

  subscribeSettings(cb: (s: UserSettings | null) => void, onError: (e: unknown) => void) {
    return onSnapshot(
      this.settingsDoc(),
      (snap) => {
        if (!snap.exists()) {
          cb(null)
          return
        }
        const raw = snap.data() as Record<string, unknown>
        cb({
          ...DEFAULT_SETTINGS,
          ...raw,
          monthlySalary: num(raw.monthlySalary, 0),
          dpsAnnualRatePercent: num(raw.dpsAnnualRatePercent, DEFAULT_SETTINGS.dpsAnnualRatePercent),
          currency: 'BDT',
          onboardingComplete: Boolean(raw.onboardingComplete)
        } as UserSettings)
      },
      onError
    )
  }

  async addExpense(draft: ExpenseDraft, id?: string): Promise<string> {
    const expenseId = id ?? newId('exp')
    const now = Date.now()
    // setDoc with an explicit id makes a retry idempotent (PRD §68).
    await setDoc(doc(this.expensesCol(), expenseId), {
      ...stripUndefined(draft),
      userId: this.uid,
      recurring: draft.recurring ?? false,
      recurringReason: draft.recurringReason ?? null,
      createdAt: now,
      updatedAt: now,
      serverUpdatedAt: serverTimestamp()
    })
    return expenseId
  }

  async updateExpense(id: string, patch: Partial<ExpenseDraft>): Promise<void> {
    await updateDoc(doc(this.expensesCol(), id), {
      ...stripUndefined(patch),
      updatedAt: Date.now(),
      serverUpdatedAt: serverTimestamp()
    })
  }

  async deleteExpense(id: string): Promise<void> {
    await deleteDoc(doc(this.expensesCol(), id))
  }

  async replaceAllExpenses(drafts: ExpenseDraft[]): Promise<void> {
    await this.deleteCollection(this.expensesCol())
    await this.batchWrite(this.expensesCol(), drafts, (d) => ({
      ...stripUndefined(d),
      userId: this.uid,
      recurring: d.recurring ?? false,
      recurringReason: d.recurringReason ?? null
    }))
  }

  async addPocket(draft: PocketDraft, id?: string): Promise<string> {
    const pocketId = id ?? newId('pkt')
    const now = Date.now()
    await setDoc(doc(this.pocketsCol(), pocketId), {
      ...stripUndefined(draft),
      userId: this.uid,
      createdAt: now,
      updatedAt: now
    })
    return pocketId
  }

  async updatePocket(id: string, patch: Partial<PocketDraft>): Promise<void> {
    await updateDoc(doc(this.pocketsCol(), id), {
      ...stripUndefined(patch),
      updatedAt: Date.now()
    })
  }

  async deletePocket(id: string): Promise<void> {
    await deleteDoc(doc(this.pocketsCol(), id))
  }

  async replaceAllPockets(drafts: PocketDraft[]): Promise<void> {
    await this.deleteCollection(this.pocketsCol())
    await this.batchWrite(this.pocketsCol(), drafts, (d) => ({
      ...stripUndefined(d),
      userId: this.uid
    }))
  }

  async saveSettings(patch: Partial<UserSettings>): Promise<void> {
    await setDoc(
      this.settingsDoc(),
      { ...stripUndefined(patch), currency: 'BDT', updatedAt: Date.now() },
      { merge: true }
    )
    // Keep the user profile doc fresh (PRD §5).
    await setDoc(
      doc(this.db, 'users', this.uid),
      { uid: this.uid, updatedAt: Date.now() },
      { merge: true }
    )
  }

  async saveReceipt(record: Omit<ReceiptRecord, 'userId'>): Promise<void> {
    await setDoc(doc(this.receiptsCol(), record.id), {
      ...stripUndefined(record),
      userId: this.uid
    })
  }

  async getReceipt(id: string): Promise<ReceiptRecord | null> {
    const snap = await getDoc(doc(this.receiptsCol(), id))
    if (!snap.exists()) return null
    return { ...(snap.data() as ReceiptRecord), id: snap.id, userId: this.uid }
  }

  async clearAll(): Promise<void> {
    await this.deleteCollection(this.expensesCol())
    await this.deleteCollection(this.pocketsCol())
    await this.deleteCollection(this.receiptsCol())
  }

  private async deleteCollection(col: ReturnType<typeof collection>) {
    const snap = await getDocs(col)
    const ids = snap.docs.map((d) => d.id)
    for (let i = 0; i < ids.length; i += 400) {
      const batch = writeBatch(this.db)
      for (const id of ids.slice(i, i + 400)) batch.delete(doc(col, id))
      await batch.commit()
    }
  }

  private async batchWrite<T>(
    col: ReturnType<typeof collection>,
    items: T[],
    map: (item: T) => Record<string, unknown>
  ) {
    const now = Date.now()
    for (let i = 0; i < items.length; i += 400) {
      const batch = writeBatch(this.db)
      for (const item of items.slice(i, i + 400)) {
        batch.set(doc(col, newId('imp')), { ...map(item), createdAt: now, updatedAt: now })
      }
      await batch.commit()
    }
  }
}

/** Ensure Firestore documents always yield well-formed domain objects. */
function normalizeExpense(id: string, uid: string, raw: Record<string, unknown>): Expense {
  return {
    id,
    userId: uid,
    amount: Math.max(0, Math.round(num(raw.amount, 0))),
    date: typeof raw.date === 'string' ? raw.date : '1970-01-01',
    category: coerceCategory(raw.category),
    shop: typeof raw.shop === 'string' ? raw.shop : '',
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    receiptUrl: (raw.receiptUrl as string | null) ?? null,
    receiptId: (raw.receiptId as string | null) ?? null,
    source: raw.source === 'receipt' ? 'receipt' : raw.source === 'import' ? 'import' : 'manual',
    ocrConfidence: (raw.ocrConfidence as Expense['ocrConfidence']) ?? null,
    recurring: Boolean(raw.recurring),
    recurringReason: (raw.recurringReason as string | null) ?? null,
    createdAt: num(raw.createdAt, 0),
    updatedAt: num(raw.updatedAt, 0)
  }
}

function normalizePocket(id: string, uid: string, raw: Record<string, unknown>): Pocket {
  return {
    id,
    userId: uid,
    name: typeof raw.name === 'string' ? raw.name : 'Pocket',
    item: typeof raw.item === 'string' ? raw.item : '',
    target: Math.max(0, Math.round(num(raw.target, 0))),
    monthlyContribution: Math.max(0, Math.round(num(raw.monthlyContribution, 0))),
    currentBalance: Math.max(0, Math.round(num(raw.currentBalance, 0))),
    createdAt: num(raw.createdAt, 0),
    updatedAt: num(raw.updatedAt, 0)
  }
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}

/** Firestore rejects undefined values; strip them. */
function stripUndefined<T extends object>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v
  return out
}
