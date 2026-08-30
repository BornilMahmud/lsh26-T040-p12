/**
 * Expense history — PRD §35, §36, §37.
 * Full table with filters (month, category, shop, amount range, source), sort,
 * and edit / delete / view-receipt actions. Deleting or editing immediately
 * recalculates everything because all metrics derive from the central store.
 */

import { useMemo, useState } from 'react'
import {
  Eye,
  Filter,
  Pencil,
  Receipt as ReceiptIcon,
  Repeat,
  Search,
  Trash2,
  X
} from 'lucide-react'
import { useLedger } from '@/hooks/useLedger'
import { useToast } from '@/hooks/useToast'
import { CATEGORIES, type Category, type Expense, type ExpenseSource } from '@/types'
import { formatBdt, parseBdtToPaisa } from '@/lib/money'
import { formatDayKey, formatMonthKey, monthKeyOf } from '@/lib/dates'
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  Modal,
  Money,
  SkeletonRows,
  cx
} from '@/components/ui'
import { PageHeading } from './Dashboard'
import ExpenseForm from '@/features/expenses/ExpenseForm'

type SortKey = 'newest' | 'oldest' | 'highest' | 'lowest'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'highest', label: 'Highest amount' },
  { key: 'lowest', label: 'Lowest amount' }
]

const SOURCE_LABELS: Record<ExpenseSource, string> = {
  manual: 'Manual',
  receipt: 'Receipt',
  import: 'Imported'
}

export default function Expenses({ onAddExpense }: { onAddExpense: () => void }) {
  const { expenses, months, deleteExpense, loading } = useLedger()
  const toast = useToast()

  const [monthFilter, setMonthFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [shopQuery, setShopQuery] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [showFilters, setShowFilters] = useState(false)

  const [editing, setEditing] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState<Expense | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [receiptView, setReceiptView] = useState<Expense | null>(null)

  const filtered = useMemo(() => {
    const min = parseBdtToPaisa(minAmount)
    const max = parseBdtToPaisa(maxAmount)
    const q = shopQuery.trim().toLowerCase()

    const list = expenses.filter((e) => {
      if (monthFilter !== 'all' && monthKeyOf(e.date) !== monthFilter) return false
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false
      if (sourceFilter !== 'all' && e.source !== sourceFilter) return false
      if (q && !(e.shop.toLowerCase().includes(q) || e.notes.toLowerCase().includes(q))) return false
      if (min !== null && e.amount < min) return false
      if (max !== null && e.amount > max) return false
      return true
    })

    return list.sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return a.date < b.date ? -1 : a.date > b.date ? 1 : 0
        case 'highest':
          return b.amount - a.amount
        case 'lowest':
          return a.amount - b.amount
        default:
          return a.date > b.date ? -1 : a.date < b.date ? 1 : b.createdAt - a.createdAt
      }
    })
  }, [expenses, monthFilter, categoryFilter, sourceFilter, shopQuery, minAmount, maxAmount, sort])

  const filteredTotal = useMemo(() => filtered.reduce((t, e) => t + e.amount, 0), [filtered])

  const activeFilterCount =
    (monthFilter !== 'all' ? 1 : 0) +
    (categoryFilter !== 'all' ? 1 : 0) +
    (sourceFilter !== 'all' ? 1 : 0) +
    (shopQuery.trim() ? 1 : 0) +
    (minAmount.trim() ? 1 : 0) +
    (maxAmount.trim() ? 1 : 0)

  const resetFilters = () => {
    setMonthFilter('all')
    setCategoryFilter('all')
    setSourceFilter('all')
    setShopQuery('')
    setMinAmount('')
    setMaxAmount('')
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await deleteExpense(deleting.id)
      toast.success('Expense deleted', 'Your dashboard, forecast and savings dates have been updated.')
      setDeleting(null)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeading
        title="Expenses"
        subtitle={`${expenses.length} expense${expenses.length === 1 ? '' : 's'} recorded in total`}
        action={
          <button onClick={onAddExpense} className="btn-accent">
            <ReceiptIcon className="h-4 w-4" aria-hidden="true" />
            Add expense
          </button>
        }
      />

      {/* ── Search + filter bar ─────────────────────────────────────────── */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[180px] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400"
              aria-hidden="true"
            />
            <input
              className="input pl-9"
              placeholder="Search shop or notes…"
              value={shopQuery}
              onChange={(e) => setShopQuery(e.target.value)}
              aria-label="Search expenses by shop or notes"
            />
          </div>

          <select
            className="input w-auto min-w-[120px]"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort expenses"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowFilters((v) => !v)}
            className={cx('btn-secondary', activeFilterCount > 0 && 'border-brand-500 text-brand-700')}
            aria-expanded={showFilters}
          >
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            Filters
            {activeFilterCount > 0 && (
              <span className="tnum ml-0.5 rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="animate-in mt-4 grid gap-3 border-t border-[var(--border-soft)] pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="f-month" className="label">
                Month
              </label>
              <select
                id="f-month"
                className="input"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
              >
                <option value="all">All months</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthKey(m)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="f-category" className="label">
                Category
              </label>
              <select
                id="f-category"
                className="input"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="f-source" className="label">
                Source
              </label>
              <select
                id="f-source"
                className="input"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                <option value="all">All sources</option>
                <option value="manual">Manual</option>
                <option value="receipt">Receipt</option>
                <option value="import">Imported</option>
              </select>
            </div>

            <div>
              <label className="label" htmlFor="f-min">
                Amount range (৳)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id="f-min"
                  className="input tnum"
                  inputMode="decimal"
                  placeholder="Min"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  aria-label="Minimum amount"
                />
                <span className="text-ink-300" aria-hidden="true">
                  –
                </span>
                <input
                  className="input tnum"
                  inputMode="decimal"
                  placeholder="Max"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  aria-label="Maximum amount"
                />
              </div>
            </div>

            {activeFilterCount > 0 && (
              <div className="sm:col-span-2 lg:col-span-4">
                <button onClick={resetFilters} className="btn-ghost btn-sm">
                  <X className="h-3 w-3" aria-hidden="true" />
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Result summary ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-ink-500">
        <span>
          Showing <strong className="text-ink-900">{filtered.length}</strong> of {expenses.length}{' '}
          expenses
        </span>
        <span className="tnum">
          Filtered total: <strong className="text-ink-900">{formatBdt(filteredTotal)}</strong>
        </span>
      </div>

      {/* ── Table (desktop) / cards (mobile) ───────────────────────────── */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-4">
            <SkeletonRows rows={6} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ReceiptIcon className="h-6 w-6" />}
            title={expenses.length === 0 ? 'You haven’t recorded any expenses yet.' : 'No expenses match these filters'}
            message={
              expenses.length === 0
                ? 'Add your first expense manually or by scanning a receipt.'
                : 'Try widening the date range, category or amount filters.'
            }
            action={
              expenses.length === 0 ? (
                <button onClick={onAddExpense} className="btn-accent">
                  Add your first expense
                </button>
              ) : (
                <button onClick={resetFilters} className="btn-secondary">
                  Clear filters
                </button>
              )
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Expense history</caption>
                <thead>
                  <tr className="border-b border-[var(--border-soft)] bg-ink-50/60 text-left text-xs font-medium uppercase tracking-wider text-ink-500">
                    <th scope="col" className="px-4 py-3">Date</th>
                    <th scope="col" className="px-4 py-3">Shop</th>
                    <th scope="col" className="px-4 py-3">Category</th>
                    <th scope="col" className="px-4 py-3 text-right">Amount</th>
                    <th scope="col" className="px-4 py-3">Source</th>
                    <th scope="col" className="px-4 py-3">Recurring</th>
                    <th scope="col" className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-[var(--border-soft)] last:border-0 transition-colors hover:bg-ink-50/60"
                    >
                      <td className="tnum whitespace-nowrap px-4 py-3 text-ink-600">
                        {formatDayKey(e.date)}
                      </td>
                      <td className="max-w-[200px] px-4 py-3">
                        <p className="truncate font-medium text-ink-900">{e.shop || '—'}</p>
                        {e.notes && <p className="truncate text-xs text-ink-400">{e.notes}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="neutral">{e.category}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Money value={e.amount} className="font-semibold text-ink-900" />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-ink-500">{SOURCE_LABELS[e.source]}</span>
                      </td>
                      <td className="px-4 py-3">
                        {e.recurring ? (
                          <Badge tone="brand" title={e.recurringReason ?? undefined}>
                            <Repeat className="h-3 w-3" aria-hidden="true" />
                            Yes
                          </Badge>
                        ) : (
                          <span className="text-xs text-ink-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {e.receiptUrl && (
                            <button
                              onClick={() => setReceiptView(e)}
                              className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
                              aria-label={`View receipt for ${e.shop || e.category}`}
                              title="View receipt"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setEditing(e)}
                            className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
                            aria-label={`Edit ${e.shop || e.category} expense`}
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleting(e)}
                            className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-negative-50 hover:text-negative-600"
                            aria-label={`Delete ${e.shop || e.category} expense`}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-[var(--border-soft)] lg:hidden">
              {filtered.map((e) => (
                <li key={e.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">{e.shop || e.category}</p>
                      <p className="tnum mt-0.5 text-xs text-ink-400">
                        {formatDayKey(e.date)} · {e.category} · {SOURCE_LABELS[e.source]}
                      </p>
                      {e.recurring && (
                        <Badge tone="brand" className="mt-1.5" title={e.recurringReason ?? undefined}>
                          <Repeat className="h-3 w-3" aria-hidden="true" />
                          Recurring
                        </Badge>
                      )}
                    </div>
                    <Money value={e.amount} className="shrink-0 text-sm font-semibold text-ink-900" />
                  </div>
                  <div className="mt-3 flex gap-1.5">
                    {e.receiptUrl && (
                      <button onClick={() => setReceiptView(e)} className="btn-secondary btn-sm flex-1">
                        <Eye className="h-3 w-3" aria-hidden="true" />
                        Receipt
                      </button>
                    )}
                    <button onClick={() => setEditing(e)} className="btn-secondary btn-sm flex-1">
                      <Pencil className="h-3 w-3" aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleting(e)}
                      className="btn btn-sm flex-1 border border-negative-500/30 text-negative-600 hover:bg-negative-50"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* ── Dialogs ────────────────────────────────────────────────────── */}
      <ExpenseForm open={editing !== null} editing={editing} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this expense?"
        message={
          deleting ? (
            <>
              <p>
                <strong>{deleting.shop || deleting.category}</strong> ·{' '}
                <span className="tnum">{formatBdt(deleting.amount)}</span> on{' '}
                {formatDayKey(deleting.date)} will be permanently removed.
              </p>
              <p className="mt-2 text-xs text-ink-400">
                Your dashboard, forecast, insights and savings completion dates will recalculate
                immediately.
              </p>
            </>
          ) : null
        }
        confirmLabel="Delete expense"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />

      <Modal
        open={receiptView !== null}
        onClose={() => setReceiptView(null)}
        title="Receipt"
        description={
          receiptView
            ? `${receiptView.shop || receiptView.category} · ${formatBdt(receiptView.amount)}`
            : undefined
        }
        size="lg"
      >
        {receiptView?.receiptUrl && (
          <>
            <img
              src={receiptView.receiptUrl}
              alt={`Receipt for ${receiptView.shop || receiptView.category}`}
              className="mx-auto max-h-[60vh] rounded-xl border border-ink-200 object-contain"
            />
            {receiptView.ocrConfidence && (
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                {(['amount', 'date', 'shop'] as const).map((f) => (
                  <div key={f} className="rounded-xl bg-ink-50 px-3 py-2.5">
                    <p className="font-medium capitalize text-ink-600">
                      {f === 'shop' ? 'Merchant' : f}
                    </p>
                    <p className="mt-0.5 text-ink-400">{receiptView.ocrConfidence![f]}</p>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-center text-xs text-ink-400">
              Extraction confidence recorded when this receipt was scanned.
            </p>
          </>
        )}
      </Modal>
    </div>
  )
}
