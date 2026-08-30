/**
 * localStorage implementation of DataRepository — powers Demo Mode (PRD §54)
 * and keeps the app fully functional when Firebase is not configured.
 *
 * It implements the SAME contract as FirestoreRepository, so every downstream
 * feature (dashboard, forecast, insights, pockets, what-if, recurring) runs the
 * identical code path against identical data shapes. Demo data therefore
 * "behaves exactly like normal data" as the PRD requires — nothing is faked or
 * special-cased for the demo.
 */

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

type Listener<T> = (value: T) => void

interface Store {
  expenses: Expense[]
  pockets: Pocket[]
  settings: UserSettings | null
  receipts: Record<string, ReceiptRecord>
}

const emptyStore = (): Store => ({ expenses: [], pockets: [], settings: null, receipts: {} })

export class LocalRepository implements DataRepository {
  readonly kind = 'local' as const
  private key: string
  private store: Store
  private expenseListeners = new Set<Listener<Expense[]>>()
  private pocketListeners = new Set<Listener<Pocket[]>>()
  private settingsListeners = new Set<Listener<UserSettings | null>>()

  constructor(private uid: string, namespace = 'plm') {
    this.key = `${namespace}:${uid}`
    this.store = this.read()
  }

  private read(): Store {
    try {
      const raw = localStorage.getItem(this.key)
      if (!raw) return emptyStore()
      const parsed = JSON.parse(raw) as Partial<Store>
      return {
        expenses: (parsed.expenses ?? []).map((e) => this.normalizeExpense(e)),
        pockets: (parsed.pockets ?? []).map((p) => this.normalizePocket(p)),
        settings: parsed.settings ?? null,
        receipts: parsed.receipts ?? {}
      }
    } catch {
      return emptyStore()
    }
  }

  private persist() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.store))
    } catch {
      /* quota exceeded — in-memory state still correct for this session */
    }
  }

  private normalizeExpense(e: Partial<Expense>): Expense {
    return {
      id: e.id ?? newId('exp'),
      userId: this.uid,
      amount: Math.max(0, Math.round(Number(e.amount) || 0)),
      date: e.date ?? '1970-01-01',
      category: coerceCategory(e.category),
      shop: e.shop ?? '',
      notes: e.notes ?? '',
      receiptUrl: e.receiptUrl ?? null,
      receiptId: e.receiptId ?? null,
      source: e.source ?? 'manual',
      ocrConfidence: e.ocrConfidence ?? null,
      recurring: Boolean(e.recurring),
      recurringReason: e.recurringReason ?? null,
      createdAt: e.createdAt ?? Date.now(),
      updatedAt: e.updatedAt ?? Date.now()
    }
  }

  private normalizePocket(p: Partial<Pocket>): Pocket {
    return {
      id: p.id ?? newId('pkt'),
      userId: this.uid,
      name: p.name ?? 'Pocket',
      item: p.item ?? '',
      target: Math.max(0, Math.round(Number(p.target) || 0)),
      monthlyContribution: Math.max(0, Math.round(Number(p.monthlyContribution) || 0)),
      currentBalance: Math.max(0, Math.round(Number(p.currentBalance) || 0)),
      createdAt: p.createdAt ?? Date.now(),
      updatedAt: p.updatedAt ?? Date.now()
    }
  }

  private emitExpenses() {
    const sorted = [...this.store.expenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    for (const l of this.expenseListeners) l(sorted)
  }
  private emitPockets() {
    const sorted = [...this.store.pockets].sort((a, b) => a.createdAt - b.createdAt)
    for (const l of this.pocketListeners) l(sorted)
  }
  private emitSettings() {
    for (const l of this.settingsListeners) l(this.store.settings)
  }

  subscribeExpenses(cb: (expenses: Expense[]) => void) {
    this.expenseListeners.add(cb)
    // Fire immediately (mirrors onSnapshot's initial callback)
    cb([...this.store.expenses].sort((a, b) => (a.date < b.date ? 1 : -1)))
    return () => this.expenseListeners.delete(cb)
  }

  subscribePockets(cb: (pockets: Pocket[]) => void) {
    this.pocketListeners.add(cb)
    cb([...this.store.pockets].sort((a, b) => a.createdAt - b.createdAt))
    return () => this.pocketListeners.delete(cb)
  }

  subscribeSettings(cb: (s: UserSettings | null) => void) {
    this.settingsListeners.add(cb)
    cb(this.store.settings)
    return () => this.settingsListeners.delete(cb)
  }

  async addExpense(draft: ExpenseDraft, id?: string): Promise<string> {
    const expenseId = id ?? newId('exp')
    // Idempotent on retry: an existing id is replaced, not duplicated.
    this.store.expenses = this.store.expenses.filter((e) => e.id !== expenseId)
    this.store.expenses.push(
      this.normalizeExpense({ ...draft, id: expenseId, createdAt: Date.now(), updatedAt: Date.now() })
    )
    this.persist()
    this.emitExpenses()
    return expenseId
  }

  async updateExpense(id: string, patch: Partial<ExpenseDraft>): Promise<void> {
    this.store.expenses = this.store.expenses.map((e) =>
      e.id === id ? this.normalizeExpense({ ...e, ...patch, updatedAt: Date.now() }) : e
    )
    this.persist()
    this.emitExpenses()
  }

  async deleteExpense(id: string): Promise<void> {
    this.store.expenses = this.store.expenses.filter((e) => e.id !== id)
    this.persist()
    this.emitExpenses()
  }

  async replaceAllExpenses(drafts: ExpenseDraft[]): Promise<void> {
    this.store.expenses = drafts.map((d) => this.normalizeExpense({ ...d, id: newId('exp') }))
    this.persist()
    this.emitExpenses()
  }

  async addPocket(draft: PocketDraft, id?: string): Promise<string> {
    const pocketId = id ?? newId('pkt')
    this.store.pockets = this.store.pockets.filter((p) => p.id !== pocketId)
    this.store.pockets.push(this.normalizePocket({ ...draft, id: pocketId, createdAt: Date.now() }))
    this.persist()
    this.emitPockets()
    return pocketId
  }

  async updatePocket(id: string, patch: Partial<PocketDraft>): Promise<void> {
    this.store.pockets = this.store.pockets.map((p) =>
      p.id === id ? this.normalizePocket({ ...p, ...patch, updatedAt: Date.now() }) : p
    )
    this.persist()
    this.emitPockets()
  }

  async deletePocket(id: string): Promise<void> {
    this.store.pockets = this.store.pockets.filter((p) => p.id !== id)
    this.persist()
    this.emitPockets()
  }

  async replaceAllPockets(drafts: PocketDraft[]): Promise<void> {
    this.store.pockets = drafts.map((d) => this.normalizePocket({ ...d, id: newId('pkt') }))
    this.persist()
    this.emitPockets()
  }

  async saveSettings(patch: Partial<UserSettings>): Promise<void> {
    this.store.settings = {
      ...DEFAULT_SETTINGS,
      ...(this.store.settings ?? {}),
      ...patch,
      currency: 'BDT',
      updatedAt: Date.now()
    }
    this.persist()
    this.emitSettings()
  }

  async saveReceipt(record: Omit<ReceiptRecord, 'userId'>): Promise<void> {
    this.store.receipts[record.id] = { ...record, userId: this.uid } as ReceiptRecord
    this.persist()
  }

  async getReceipt(id: string): Promise<ReceiptRecord | null> {
    return this.store.receipts[id] ?? null
  }

  async clearAll(): Promise<void> {
    const settings = this.store.settings
    this.store = { ...emptyStore(), settings }
    this.persist()
    this.emitExpenses()
    this.emitPockets()
  }
}
