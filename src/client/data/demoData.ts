/**
 * DEMO DATA — PRD §54.
 *
 * Generated RELATIVE TO TODAY so the demo always lands mid-month with a live
 * forecast, a populated previous month for comparison, and genuine recurring
 * patterns (landlord rent, GP recharge, internet bill) that the recurring
 * engine discovers on its own.
 *
 * Nothing here is a pre-computed result: only raw expenses/pockets/salary are
 * defined. Every number the UI shows is derived by the real engines from this
 * data, exactly as it would be for a real user (PRD §54, §56).
 */

import type { ExpenseDraft, Category, PocketDraft } from '@/types'
import { parseBdtToPaisa } from '@/lib/money'
import { daysInMonthOf, pad2, previousMonthKey, monthKeyOf, toDayKey } from '@/lib/dates'

const bdt = (n: number) => parseBdtToPaisa(n)!

interface Seed {
  day: number
  amount: number
  category: Category
  shop: string
  notes?: string
}

/** Previous month: a complete, realistic month. */
const PREVIOUS_MONTH: Seed[] = [
  { day: 2, amount: 16000, category: 'Rent', shop: 'Landlord' },
  { day: 3, amount: 1150, category: 'Utilities', shop: 'DESCO' },
  { day: 4, amount: 2400, category: 'Groceries', shop: 'Shwapno' },
  { day: 5, amount: 620, category: 'Food', shop: 'Madchef' },
  { day: 6, amount: 240, category: 'Transport', shop: 'Uber' },
  { day: 8, amount: 1200, category: 'Internet' as Category, shop: 'Link3' },
  { day: 9, amount: 3200, category: 'Education', shop: 'Coaching Center' },
  { day: 11, amount: 500, category: 'Mobile', shop: 'GP Recharge' },
  { day: 12, amount: 1850, category: 'Groceries', shop: 'Meena Bazar' },
  { day: 14, amount: 780, category: 'Food', shop: 'Sultan Dine' },
  { day: 15, amount: 320, category: 'Transport', shop: 'Pathao' },
  { day: 17, amount: 2600, category: 'Health', shop: 'Lazz Pharma' },
  { day: 18, amount: 1400, category: 'Entertainment', shop: 'Star Cineplex' },
  { day: 20, amount: 2150, category: 'Groceries', shop: 'Shwapno' },
  { day: 21, amount: 540, category: 'Food', shop: 'Chillox' },
  { day: 22, amount: 3200, category: 'Education', shop: 'Coaching Center' },
  { day: 24, amount: 280, category: 'Transport', shop: 'Uber' },
  { day: 25, amount: 3400, category: 'Clothing', shop: 'Aarong' },
  { day: 26, amount: 920, category: 'Food', shop: 'Takeout Express' },
  { day: 27, amount: 1750, category: 'Groceries', shop: 'Meena Bazar' },
  { day: 28, amount: 460, category: 'Transport', shop: 'Pathao' }
]

/**
 * Current month up to "today". Rent is deliberately UNPAID so the hybrid
 * forecast has to add the pending recurring obligation — the behaviour the PRD
 * calls out in §20. Education is deliberately up sharply so the insight engine
 * produces a real category-increase finding.
 */
const CURRENT_MONTH: Seed[] = [
  { day: 1, amount: 1210, category: 'Utilities', shop: 'DESCO' },
  { day: 2, amount: 2650, category: 'Groceries', shop: 'Shwapno' },
  { day: 3, amount: 735, category: 'Food', shop: 'Madchef' },
  { day: 4, amount: 300, category: 'Transport', shop: 'Uber' },
  { day: 5, amount: 1200, category: 'Internet' as Category, shop: 'Link3' },
  { day: 6, amount: 4100, category: 'Education', shop: 'Coaching Center' },
  { day: 7, amount: 535.5, category: 'Mobile', shop: 'GP recharge' },
  { day: 8, amount: 1980, category: 'Groceries', shop: 'Meena Bazar' },
  { day: 9, amount: 890, category: 'Food', shop: 'Sultan Dine' },
  { day: 10, amount: 410, category: 'Transport', shop: 'Pathao' },
  { day: 11, amount: 4247, category: 'Education', shop: 'Coaching Center' },
  { day: 12, amount: 1650, category: 'Entertainment', shop: 'Star Cineplex' },
  { day: 13, amount: 2250, category: 'Groceries', shop: 'Shwapno' },
  { day: 14, amount: 1120, category: 'Food', shop: 'Chillox' },
  { day: 15, amount: 380, category: 'Transport', shop: 'Uber' },
  { day: 16, amount: 3100, category: 'Health', shop: 'Popular Diagnostic' },
  { day: 17, amount: 690, category: 'Food', shop: 'Takeout Express' },
  { day: 18, amount: 5600, category: 'Shopping', shop: 'Gadget Bazaar' },
  { day: 19, amount: 320, category: 'Transport', shop: 'Pathao' },
  { day: 20, amount: 1890, category: 'Groceries', shop: 'Meena Bazar' },
  { day: 21, amount: 760, category: 'Food', shop: 'Madchef' },
  { day: 22, amount: 2400, category: 'Clothing', shop: 'Aarong' },
  { day: 23, amount: 450, category: 'Transport', shop: 'Uber' },
  { day: 24, amount: 980, category: 'Food', shop: 'Sultan Dine' },
  { day: 25, amount: 1600, category: 'Entertainment', shop: 'Netflix & Spotify' },
  { day: 26, amount: 2100, category: 'Groceries', shop: 'Shwapno' },
  { day: 27, amount: 540, category: 'Food', shop: 'Chillox' },
  { day: 28, amount: 300, category: 'Transport', shop: 'Pathao' }
]

/** Rent from two months back too, so the recurring pattern has real evidence. */
const RENT_HISTORY_DAY = 2
const RENT_AMOUNT = 16000

export const DEMO_SALARY = bdt(52000)
export const DEMO_DPS_RATE = 8

export function buildDemoExpenses(today = new Date()): ExpenseDraft[] {
  const thisMonth = monthKeyOf(toDayKey(today))
  const lastMonth = previousMonthKey(thisMonth)
  const twoMonthsAgo = previousMonthKey(lastMonth)
  const todayDay = today.getDate()
  const out: ExpenseDraft[] = []

  const push = (monthKey: string, seed: Seed) => {
    const [y, m] = monthKey.split('-').map(Number)
    const dim = daysInMonthOf(y, m)
    const day = Math.min(seed.day, dim)
    out.push({
      amount: bdt(seed.amount),
      date: `${monthKey}-${pad2(day)}`,
      // 'Internet' is not a default category; coerce to Utilities so demo data
      // never depends on a non-existent category.
      category: (seed.category as string) === 'Internet' ? 'Utilities' : seed.category,
      shop: seed.shop,
      notes: seed.notes ?? '',
      source: 'import',
      receiptUrl: null,
      receiptId: null,
      ocrConfidence: null
    })
  }

  // Rent two months back + last month => a recurring pattern the engine finds,
  // and (because this month's rent is absent) a pending obligation this month.
  push(twoMonthsAgo, { day: RENT_HISTORY_DAY, amount: RENT_AMOUNT, category: 'Rent', shop: 'Landlord' })
  push(twoMonthsAgo, { day: 11, amount: 480, category: 'Mobile', shop: 'GP Recharge' })
  push(twoMonthsAgo, { day: 8, amount: 1200, category: 'Utilities', shop: 'Link3' })

  for (const seed of PREVIOUS_MONTH) push(lastMonth, seed)

  // Only seed the current month up to today — never post-dated (PRD §53).
  for (const seed of CURRENT_MONTH) {
    if (seed.day <= todayDay) push(thisMonth, seed)
  }

  return out
}

export function buildDemoPockets(): PocketDraft[] {
  return [
    {
      name: 'Laptop',
      item: 'MacBook Air M4 (13-inch, 16GB)',
      target: bdt(145000),
      monthlyContribution: bdt(12000),
      currentBalance: bdt(28000)
    },
    {
      name: 'Emergency Fund',
      item: 'Three months of living costs',
      target: bdt(150000),
      monthlyContribution: bdt(6000),
      currentBalance: bdt(42000)
    },
    {
      name: 'Wedding',
      item: 'Venue booking and photography',
      target: bdt(400000),
      monthlyContribution: bdt(8000),
      currentBalance: bdt(35000)
    }
  ]
}
