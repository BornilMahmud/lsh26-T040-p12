/**
 * Decimal-safe money utilities. PRD §6, §60.
 *
 * Everything internal is integer paisa. These helpers are the ONLY place where
 * conversion between human decimal strings and paisa happens.
 */

import type { Paisa } from '@/types'

/** Round half-up (away from zero for .5), deterministic — PRD §31/§60. */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) return 0
  return value < 0 ? -Math.floor(-value + 0.5) : Math.floor(value + 0.5)
}

/**
 * Parse a human BDT string/number into integer paisa.
 * Accepts "1,234.56", "৳1234", " 1234.5 ", 1234.56.
 * Returns null for unparseable / negative input.
 */
export function parseBdtToPaisa(input: string | number | null | undefined): Paisa | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return null
    return roundHalfUp(input * 100)
  }
  const cleaned = input.replace(/[৳,\s]/g, '').replace(/[^\d.\-]/g, '')
  if (cleaned === '' || cleaned === '.' || cleaned === '-') return null
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return null
  // Use string-based scaling to dodge float artifacts (e.g. 1.005 * 100)
  const [whole, frac = ''] = cleaned.split('.')
  if (frac.length > 0) {
    const f2 = (frac + '00').slice(0, 2)
    const third = frac.length > 2 ? Number(frac[2]) : 0
    let paisa = Number(whole || '0') * 100 + Number(f2)
    if (third >= 5) paisa += 1
    return paisa
  }
  return Number(whole) * 100
}

export function paisaToBdtNumber(p: Paisa): number {
  return p / 100
}

const grouper = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})
const grouperWhole = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
})

/**
 * Format paisa as BDT.
 *  - whole amounts  -> "৳1,234"
 *  - fractional     -> "৳1,234.56"
 * PRD §60.
 */
export function formatBdt(p: Paisa | null | undefined, opts?: { sign?: boolean; symbol?: boolean }): string {
  const symbol = opts?.symbol !== false
  if (p === null || p === undefined || !Number.isFinite(p)) return symbol ? '৳—' : '—'
  const neg = p < 0
  const abs = Math.abs(Math.round(p))
  const body = abs % 100 === 0 ? grouperWhole.format(abs / 100) : grouper.format(abs / 100)
  const sign = neg ? '-' : opts?.sign ? '+' : ''
  return `${sign}${symbol ? '৳' : ''}${body}`
}

/** Compact display for chart axes: ৳12.5k / ৳1.2L */
export function formatBdtCompact(p: Paisa): string {
  const v = Math.abs(p) / 100
  const sign = p < 0 ? '-' : ''
  if (v >= 100000) return `${sign}৳${(v / 100000).toFixed(v >= 1000000 ? 0 : 1)}L`
  if (v >= 1000) return `${sign}৳${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}k`
  return `${sign}৳${Math.round(v)}`
}

/** Percent with one decimal, safe against division by zero. */
export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—'
  return `${value >= 0 ? '' : '-'}${Math.abs(value).toFixed(digits)}%`
}

/**
 * Safe percentage change. Returns null when the base is 0 (undefined change)
 * so the UI can say "no comparable data" instead of Infinity. PRD §18.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / previous) * 100
}

export function sum(values: number[]): number {
  let t = 0
  for (const v of values) t += v
  return t
}

export function clampPaisa(p: number): Paisa {
  return Math.max(0, roundHalfUp(p))
}
