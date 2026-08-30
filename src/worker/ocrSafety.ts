/**
 * OCR RESPONSE SANITISER — the enforcement point for PRD §13 (OCR safety rule).
 *
 * Extracted from the request handler so it can be unit tested without a live
 * vision provider. Given whatever JSON the model returned, it decides what the
 * application is allowed to treat as "read from the receipt".
 *
 * THE RULE
 *   If the amount is missing, unparseable, non-positive, or reported with
 *   UNKNOWN confidence, the result is `amount: null` — never 0, never an
 *   estimate, never stray numeric text from the page. Same for date and
 *   merchant. Downstream, the review UI leaves such fields blank and blocks
 *   saving until a human supplies the value.
 */

export const OCR_CATEGORIES = [
  'Rent', 'Food', 'Groceries', 'Transport', 'Utilities', 'Health',
  'Education', 'Mobile', 'Entertainment', 'Clothing', 'Shopping', 'Other'
] as const

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'

export interface OcrResponse {
  /** Integer paisa, or null when not confidently read. */
  amount: number | null
  /** "YYYY-MM-DD" or null. */
  date: string | null
  merchant: string | null
  category: string | null
  confidence: { amount: ConfidenceLevel; date: ConfidenceLevel; shop: ConfidenceLevel }
  rawText: string
  provider: string
  warnings: string[]
}

export function unknownResult(provider: string, warnings: string[], rawText = ''): OcrResponse {
  return {
    amount: null,
    date: null,
    merchant: null,
    category: null,
    confidence: { amount: 'UNKNOWN', date: 'UNKNOWN', shop: 'UNKNOWN' },
    rawText,
    provider,
    warnings
  }
}

export function normalizeConfidence(v: unknown): ConfidenceLevel {
  const s = typeof v === 'string' ? v.toUpperCase().trim() : ''
  return s === 'HIGH' || s === 'MEDIUM' || s === 'LOW' ? s : 'UNKNOWN'
}

export function isRealDate(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return false
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  if (mo < 1 || mo > 12) return false
  const dim = new Date(y, mo, 0).getDate()
  return d >= 1 && d <= dim && y >= 1970 && y <= 2100
}

export function stripCodeFence(s: string): string {
  const trimmed = s.trim()
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
  }
  return trimmed
}

/**
 * Convert a raw model payload into a sanitised OcrResponse.
 * Pure function — no I/O, fully testable.
 */
export function buildOcrResponse(
  parsed: Record<string, unknown>,
  incomingWarnings: string[] = []
): OcrResponse {
  const warnings = [...incomingWarnings]
  const conf = (parsed.confidence ?? {}) as Record<string, unknown>
  const amountConfidence = normalizeConfidence(conf.amount)
  const dateConfidence = normalizeConfidence(conf.date)
  const shopConfidence = normalizeConfidence(conf.shop)

  // ── amount ───────────────────────────────────────────────────────────────
  let amount: number | null = null
  const rawAmount = parsed.amount_bdt
  const amountNumber =
    typeof rawAmount === 'number'
      ? rawAmount
      : typeof rawAmount === 'string' && rawAmount.trim() !== ''
        ? Number(rawAmount.replace(/[৳,\s]/g, ''))
        : NaN

  if (Number.isFinite(amountNumber) && amountNumber > 0 && amountConfidence !== 'UNKNOWN') {
    // Scale to integer paisa with half-up rounding.
    amount = Math.round(amountNumber * 100)
  } else {
    warnings.push("We couldn't confidently read the amount. Please verify it manually.")
  }

  // ── date ─────────────────────────────────────────────────────────────────
  let date: string | null = null
  const rawDate = typeof parsed.date === 'string' ? parsed.date.trim() : ''
  if (rawDate && dateConfidence !== 'UNKNOWN' && isRealDate(rawDate)) {
    date = rawDate
  } else if (rawDate) {
    warnings.push("The date on the receipt wasn't clear. Please confirm it.")
  }

  // ── merchant ─────────────────────────────────────────────────────────────
  let merchant: string | null = null
  const rawMerchant = typeof parsed.merchant === 'string' ? parsed.merchant.trim() : ''
  if (rawMerchant && rawMerchant.length <= 120 && shopConfidence !== 'UNKNOWN') {
    merchant = rawMerchant
  } else if (!rawMerchant) {
    warnings.push("The merchant name wasn't readable. Please add it if you can.")
  }

  const rawCategory = typeof parsed.category === 'string' ? parsed.category.trim() : ''
  const category =
    (OCR_CATEGORIES as readonly string[]).find((c) => c.toLowerCase() === rawCategory.toLowerCase()) ??
    null

  const notes = typeof parsed.notes === 'string' ? parsed.notes.trim() : ''
  if (notes) warnings.push(notes)

  return {
    amount,
    date,
    merchant,
    category,
    confidence: {
      // A field we refused to accept can never be reported as confident.
      amount: amount === null ? (amountConfidence === 'UNKNOWN' ? 'UNKNOWN' : 'LOW') : amountConfidence,
      date: date === null ? 'UNKNOWN' : dateConfidence,
      shop: merchant === null ? 'UNKNOWN' : shopConfidence
    },
    rawText: typeof parsed.raw_text === 'string' ? parsed.raw_text.slice(0, 4000) : '',
    provider: 'openai-vision',
    warnings: [...new Set(warnings)]
  }
}
