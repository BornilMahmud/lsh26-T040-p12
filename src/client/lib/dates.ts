/**
 * Calendar helpers. All dates are handled as *local calendar days* encoded as
 * "YYYY-MM-DD" strings, and month keys as "YYYY-MM". This avoids timezone
 * drift that would otherwise move an expense between months.
 */

export type MonthKey = string // "YYYY-MM"
export type DayKey = string // "YYYY-MM-DD"

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function toDayKey(d: Date): DayKey {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function monthKeyOf(day: DayKey): MonthKey {
  return day.slice(0, 7)
}

export function parseDayKey(day: DayKey): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  if (mo < 1 || mo > 12) return null
  if (d < 1 || d > daysInMonthOf(y, mo)) return null
  return { y, m: mo, d }
}

export function isValidDayKey(day: string): boolean {
  return parseDayKey(day) !== null
}

/** Local Date at midnight for a day key. */
export function dayKeyToDate(day: DayKey): Date {
  const p = parseDayKey(day)
  if (!p) return new Date(NaN)
  return new Date(p.y, p.m - 1, p.d)
}

export function daysInMonthOf(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate()
}

export function daysInMonthKey(key: MonthKey): number {
  const [y, m] = key.split('-').map(Number)
  return daysInMonthOf(y, m)
}

export function previousMonthKey(key: MonthKey): MonthKey {
  const [y, m] = key.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`
}

export function nextMonthKey(key: MonthKey): MonthKey {
  const [y, m] = key.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${pad2(m + 1)}`
}

export function addMonthsToKey(key: MonthKey, n: number): MonthKey {
  const [y, m] = key.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12 + 12) % 12
  return `${ny}-${pad2(nm + 1)}`
}

export function formatMonthKey(key: MonthKey, short = false): string {
  const [y, m] = key.split('-').map(Number)
  if (!y || !m) return key
  const names = short ? MONTH_SHORT : MONTH_NAMES
  return `${names[m - 1]} ${y}`
}

export function formatDayKey(day: DayKey, opts?: { withYear?: boolean }): string {
  const p = parseDayKey(day)
  if (!p) return day
  return `${p.d} ${MONTH_SHORT[p.m - 1]}${opts?.withYear === false ? '' : ` ${p.y}`}`
}

/** Last day of a month as a day key. */
export function lastDayOfMonth(key: MonthKey): DayKey {
  return `${key}-${pad2(daysInMonthKey(key))}`
}

/**
 * Elapsed / remaining days for a month relative to "today".
 *  - If today is inside the month: elapsed = day-of-month (day 1 counts as 1
 *    elapsed day, so a same-day rate is computable and never divides by zero).
 *  - If the month is fully in the past: elapsed = full month, remaining = 0.
 *  - If the month is in the future: elapsed = 0, remaining = full month.
 */
export function monthProgress(key: MonthKey, today: Date): {
  daysInMonth: number
  elapsedDays: number
  remainingDays: number
  isCurrentMonth: boolean
  isPast: boolean
  isFuture: boolean
} {
  const daysInMonth = daysInMonthKey(key)
  const todayKey = monthKeyOf(toDayKey(today))
  const isCurrentMonth = todayKey === key
  const isPast = key < todayKey
  const isFuture = key > todayKey
  if (isCurrentMonth) {
    const elapsedDays = Math.min(today.getDate(), daysInMonth)
    return {
      daysInMonth,
      elapsedDays,
      remainingDays: daysInMonth - elapsedDays,
      isCurrentMonth,
      isPast: false,
      isFuture: false
    }
  }
  if (isPast) {
    return { daysInMonth, elapsedDays: daysInMonth, remainingDays: 0, isCurrentMonth, isPast, isFuture }
  }
  return { daysInMonth, elapsedDays: 0, remainingDays: daysInMonth, isCurrentMonth, isPast, isFuture }
}

/** Are two month keys consecutive (b is the month right after a)? */
export function areConsecutiveMonths(a: MonthKey, b: MonthKey): boolean {
  return nextMonthKey(a) === b
}

export function monthKeyDiff(from: MonthKey, to: MonthKey): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty * 12 + tm) - (fy * 12 + fm)
}
