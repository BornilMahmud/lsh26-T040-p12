/**
 * Core domain types for Personal Ledger Manager.
 *
 * MONEY CONVENTION (PRD §6, §60):
 * All monetary values in this application are stored and computed as
 * INTEGER PAISA (1 BDT = 100 paisa). Floating point is never used for
 * money arithmetic. Formatting to "৳1,234.56" happens only at the display
 * boundary via lib/money.ts.
 */

export type Paisa = number

/** PRD §7 — default categories. Extensible: add to this tuple only. */
export const CATEGORIES = [
  'Rent',
  'Food',
  'Groceries',
  'Transport',
  'Utilities',
  'Health',
  'Education',
  'Mobile',
  'Entertainment',
  'Clothing',
  'Shopping',
  'Other'
] as const

export type Category = (typeof CATEGORIES)[number]

export function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v)
}

/** Coerce an arbitrary imported category string onto a known category. */
export function coerceCategory(v: unknown): Category {
  if (isCategory(v)) return v
  if (typeof v === 'string') {
    const hit = CATEGORIES.find((c) => c.toLowerCase() === v.trim().toLowerCase())
    if (hit) return hit
  }
  return 'Other'
}

export type ExpenseSource = 'manual' | 'receipt' | 'import'

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'

export interface OcrConfidence {
  amount: ConfidenceLevel
  date: ConfidenceLevel
  shop: ConfidenceLevel
}

export interface Expense {
  id: string
  userId: string
  /** Integer paisa. Always > 0. */
  amount: Paisa
  /** ISO date, local calendar day: "YYYY-MM-DD". No timezone ambiguity. */
  date: string
  category: Category
  shop: string
  notes: string
  receiptUrl?: string | null
  receiptId?: string | null
  source: ExpenseSource
  ocrConfidence?: OcrConfidence | null
  /** Set by the recurring engine (derived), persisted for audit/UI. */
  recurring: boolean
  recurringReason?: string | null
  createdAt: number
  updatedAt: number
}

export type ExpenseDraft = Omit<
  Expense,
  'id' | 'userId' | 'createdAt' | 'updatedAt' | 'recurring' | 'recurringReason'
> & { recurring?: boolean; recurringReason?: string | null }

export interface Pocket {
  id: string
  userId: string
  name: string
  item: string
  /** Integer paisa */
  target: Paisa
  /** Integer paisa, requested monthly contribution */
  monthlyContribution: Paisa
  /** Integer paisa, already saved */
  currentBalance: Paisa
  createdAt: number
  updatedAt: number
}

export type PocketDraft = Omit<Pocket, 'id' | 'userId' | 'createdAt' | 'updatedAt'>

export type TrackingStyle = 'manual' | 'receipts' | 'both'

export interface UserSettings {
  /** Integer paisa */
  monthlySalary: Paisa
  /** Annual percent, e.g. 8 means 8.00% — "illustrative DPS comparison rate" */
  dpsAnnualRatePercent: number
  currency: 'BDT'
  trackingStyle: TrackingStyle
  onboardingComplete: boolean
  displayName?: string
  email?: string
  photoURL?: string
  updatedAt?: number
}

export const DEFAULT_SETTINGS: UserSettings = {
  monthlySalary: 0,
  dpsAnnualRatePercent: 8,
  currency: 'BDT',
  trackingStyle: 'both',
  onboardingComplete: false
}

export interface ReceiptRecord {
  id: string
  userId: string
  storagePath: string | null
  downloadUrl: string | null
  createdAt: number
  ocr: {
    amount: Paisa | null
    date: string | null
    merchant: string | null
    confidence: OcrConfidence
    rawText: string
    provider: string
    warnings: string[]
  }
}

/** Result contract of the ReceiptParser abstraction (PRD §14). */
export interface ReceiptExtraction {
  /** null when not confidently read — NEVER substitute 0 or a guess (PRD §13). */
  amount: Paisa | null
  /** "YYYY-MM-DD" or null */
  date: string | null
  merchant: string | null
  category?: Category | null
  confidence: OcrConfidence
  rawText: string
  provider: string
  warnings: string[]
}
