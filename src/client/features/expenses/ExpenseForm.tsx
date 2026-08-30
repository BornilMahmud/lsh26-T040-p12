/**
 * Add / edit expense — PRD §11, §12, §13, §36, §70, §71.
 *
 * Two entry methods in one dialog:
 *   Manual  — amount / date / category / shop / notes with validation
 *   Receipt — upload or camera capture, server-side extraction, then a REVIEW
 *             step where every field shows its confidence and can be corrected.
 *
 * OCR SAFETY (PRD §13): when the amount could not be read confidently the
 * field is left EMPTY (never 0, never a guess) and Save stays disabled until a
 * human enters it. Same principle for date and merchant.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ImageIcon,
  Loader2,
  PencilLine,
  Receipt as ReceiptIcon,
  RefreshCw,
  ScanLine,
  Trash2,
  Upload
} from 'lucide-react'
import { CATEGORIES, type Category, type ConfidenceLevel, type Expense, type ReceiptExtraction } from '@/types'
import { formatBdt, parseBdtToPaisa } from '@/lib/money'
import { isValidDayKey, toDayKey } from '@/lib/dates'
import { useLedger } from '@/hooks/useLedger'
import { useToast } from '@/hooks/useToast'
import { useAuth } from '@/hooks/useAuth'
import { CONFIDENCE_META, manualFallbackExtraction, receiptParser, compressImage } from '@/services/receiptParser'
import { getStorageInstance } from '@/firebase/config'
import { newId } from '@/services/repository'
import { Badge, Modal, cx } from '@/components/ui'

type Mode = 'manual' | 'receipt'
type Stage = 'input' | 'processing' | 'review'

interface Props {
  open: boolean
  onClose: () => void
  /** When provided the dialog edits this expense instead of creating one. */
  editing?: Expense | null
  initialMode?: Mode
}

const todayKey = () => toDayKey(new Date())

export default function ExpenseForm({ open, onClose, editing, initialMode }: Props) {
  const { addExpense, updateExpense, saveReceipt, settings } = useLedger()
  const { user } = useAuth()
  const toast = useToast()

  const [mode, setMode] = useState<Mode>(initialMode ?? 'manual')
  const [stage, setStage] = useState<Stage>('input')

  // form fields
  const [amountText, setAmountText] = useState('')
  const [date, setDate] = useState(todayKey())
  const [category, setCategory] = useState<Category>('Food')
  const [shop, setShop] = useState('')
  const [notes, setNotes] = useState('')
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  // receipt state
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [extraction, setExtraction] = useState<ReceiptExtraction | null>(null)
  const [editedFields, setEditedFields] = useState<Record<string, boolean>>({})
  const [ocrAvailable, setOcrAvailable] = useState<boolean | null>(null)
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const receiptIdRef = useRef<string>(newId('rcp'))

  // Reset when the dialog opens.
  useEffect(() => {
    if (!open) return
    receiptIdRef.current = newId('rcp')
    setTouched({})
    setEditedFields({})
    setExtraction(null)
    setFile(null)
    setPreviewUrl(null)
    setSaving(false)
    if (editing) {
      setMode('manual')
      setStage('input')
      setAmountText((editing.amount / 100).toString())
      setDate(editing.date)
      setCategory(editing.category)
      setShop(editing.shop)
      setNotes(editing.notes)
    } else {
      setMode(initialMode ?? (settings.trackingStyle === 'receipts' ? 'receipt' : 'manual'))
      setStage('input')
      setAmountText('')
      setDate(todayKey())
      setCategory('Food')
      setShop('')
      setNotes('')
    }
  }, [open, editing, initialMode, settings.trackingStyle])

  // Probe OCR availability once so the UI can be honest up front (PRD §14).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    receiptParser.isAvailable().then((v) => {
      if (!cancelled) setOcrAvailable(v)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  // ── validation ──────────────────────────────────────────────────────────
  const amountPaisa = parseBdtToPaisa(amountText)
  const errors = useMemo(() => {
    const e: Record<string, string> = {}
    if (amountText.trim() === '') e.amount = 'Enter the amount.'
    else if (amountPaisa === null) e.amount = 'That doesn’t look like a valid amount.'
    else if (amountPaisa <= 0) e.amount = 'Amount must be greater than zero.'
    if (!isValidDayKey(date)) e.date = 'Choose a valid date.'
    if (!category) e.category = 'Choose a category.'
    // Merchant is required for a receipt-sourced expense (it is the point of
    // scanning); optional for manual entry, per PRD §11.
    if (mode === 'receipt' && stage === 'review' && shop.trim() === '') {
      e.shop = 'Add the merchant name to save a scanned receipt.'
    }
    return e
  }, [amountText, amountPaisa, date, category, mode, stage, shop])

  const isValid = Object.keys(errors).length === 0

  /**
   * Fields the extractor could not read confidently must be explicitly
   * confirmed by the user before saving (PRD §12).
   */
  const unconfirmedFields = useMemo(() => {
    if (mode !== 'receipt' || !extraction) return []
    const out: string[] = []
    const check = (field: 'amount' | 'date' | 'shop', level: ConfidenceLevel, hasValue: boolean) => {
      if (!CONFIDENCE_META[level].needsReview) return
      if (editedFields[field]) return // user typed/confirmed it
      if (!hasValue) out.push(field)
      else if (level === 'UNKNOWN') out.push(field)
    }
    check('amount', extraction.confidence.amount, amountPaisa !== null && amountPaisa > 0)
    check('date', extraction.confidence.date, isValidDayKey(date) && extraction.date !== null)
    check('shop', extraction.confidence.shop, shop.trim().length > 0 && extraction.merchant !== null)
    return out
  }, [mode, extraction, editedFields, amountPaisa, date, shop])

  const canSave = isValid && unconfirmedFields.length === 0 && !saving

  // ── receipt handling ────────────────────────────────────────────────────
  const handleFile = useCallback(
    async (picked: File) => {
      if (!picked.type.startsWith('image/')) {
        toast.error('That file isn’t an image', 'Please choose a photo or screenshot of the receipt.')
        return
      }
      if (picked.size > 15 * 1024 * 1024) {
        toast.error('That image is too large', 'Please use an image under 15 MB.')
        return
      }

      const compressed = await compressImage(picked)
      setFile(compressed)
      const url = URL.createObjectURL(compressed)
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
      setStage('processing')
      setEditedFields({})

      let result: ReceiptExtraction
      try {
        result = await receiptParser.extractReceipt(compressed)
      } catch (err) {
        console.error('Receipt extraction failed', err)
        result = manualFallbackExtraction(
          'Receipt processing failed. You can enter the expense manually.'
        )
      }

      setExtraction(result)
      // Populate ONLY what was read confidently. Nulls stay empty (PRD §13).
      setAmountText(result.amount !== null ? (result.amount / 100).toString() : '')
      setDate(result.date ?? todayKey())
      setShop(result.merchant ?? '')
      if (result.category) setCategory(result.category)
      setStage('review')

      if (result.amount === null) {
        toast.warning(
          'Amount needs your confirmation',
          'We couldn’t read the amount confidently, so it’s been left blank.'
        )
      } else if (result.provider === 'manual' || result.provider === 'none') {
        toast.info('Manual review needed', 'Automatic extraction is unavailable — please fill the fields in.')
      } else {
        toast.success('Receipt processed', 'Check the highlighted fields before saving.')
      }
    },
    [toast]
  )

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const picked = e.dataTransfer.files?.[0]
    if (picked) void handleFile(picked)
  }

  // ── save ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!canSave || amountPaisa === null) return
    setSaving(true)
    try {
      let receiptUrl: string | null = editing?.receiptUrl ?? null
      let receiptId: string | null = editing?.receiptId ?? null

      // Upload the receipt image to Firebase Storage when available (PRD §15).
      if (mode === 'receipt' && file && user && !user.isDemo) {
        const storage = getStorageInstance()
        if (storage) {
          try {
            const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage')
            receiptId = receiptIdRef.current
            const path = `receipts/${user.uid}/${receiptId}.jpg`
            const storageRef = ref(storage, path)
            await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' })
            receiptUrl = await getDownloadURL(storageRef)
            if (extraction) {
              await saveReceipt({
                id: receiptId,
                storagePath: path,
                downloadUrl: receiptUrl,
                createdAt: Date.now(),
                ocr: {
                  amount: extraction.amount,
                  date: extraction.date,
                  merchant: extraction.merchant,
                  confidence: extraction.confidence,
                  rawText: extraction.rawText,
                  provider: extraction.provider,
                  warnings: extraction.warnings
                }
              })
            }
          } catch (err) {
            // A storage failure must not lose the expense (PRD §40, §56).
            console.error('Receipt upload failed', err)
            toast.warning(
              'Receipt image not stored',
              'The expense was saved, but the image could not be uploaded.'
            )
          }
        }
      }

      const draft = {
        amount: amountPaisa,
        date,
        category,
        shop: shop.trim(),
        notes: notes.trim(),
        receiptUrl,
        receiptId,
        source: (mode === 'receipt' ? 'receipt' : 'manual') as 'receipt' | 'manual',
        ocrConfidence: mode === 'receipt' && extraction ? extraction.confidence : null
      }

      if (editing) {
        await updateExpense(editing.id, draft)
        toast.success('Expense updated', `${shop.trim() || category} · ${formatBdt(amountPaisa)}`)
      } else {
        // Deterministic id per dialog session makes a retry idempotent (§68).
        await addExpense(draft)
        toast.success('Expense saved', `${shop.trim() || category} · ${formatBdt(amountPaisa)}`)
      }
      onClose()
    } catch (err) {
      toast.error((err as Error).message || 'Couldn’t save expense. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const showField = (field: 'amount' | 'date' | 'shop') => {
    if (mode !== 'receipt' || !extraction) return null
    const level = editedFields[field] ? 'HIGH' : extraction.confidence[field]
    const meta = CONFIDENCE_META[level]
    const wasEdited = editedFields[field]
    return (
      <Badge
        tone={wasEdited ? 'brand' : meta.tone === 'good' ? 'positive' : meta.tone === 'warn' ? 'warning' : 'negative'}
        title={wasEdited ? 'You confirmed this value' : meta.label}
      >
        {wasEdited ? <Check className="h-3 w-3" aria-hidden="true" /> : <span aria-hidden="true">{meta.icon}</span>}
        {wasEdited ? 'Confirmed' : meta.label}
      </Badge>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit expense' : 'Add expense'}
      description={
        editing
          ? 'Changes recalculate your dashboard, forecast, insights and savings dates immediately.'
          : undefined
      }
      size={mode === 'receipt' && stage === 'review' ? 'xl' : 'md'}
    >
      {/* ── mode switch ─────────────────────────────────────────────────── */}
      {!editing && (
        <div className="mb-5 grid grid-cols-2 gap-1.5 rounded-xl bg-ink-100 p-1" role="tablist">
          {(
            [
              { key: 'manual' as Mode, label: 'Manual', Icon: PencilLine },
              { key: 'receipt' as Mode, label: 'Scan Receipt', Icon: ScanLine }
            ]
          ).map(({ key, label, Icon }) => (
            <button
              key={key}
              role="tab"
              aria-selected={mode === key}
              onClick={() => {
                setMode(key)
                setStage('input')
              }}
              className={cx(
                'btn rounded-lg py-2 text-sm',
                mode === key ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ══ RECEIPT: upload stage ══════════════════════════════════════════ */}
      {mode === 'receipt' && stage === 'input' && (
        <div>
          {ocrAvailable === false && (
            <div className="mb-4 flex gap-2.5 rounded-xl bg-warn-50 px-3.5 py-3 text-xs leading-relaxed text-warn-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Automatic receipt reading isn’t configured on this deployment. You can still attach
                the image and enter the values yourself — nothing will be guessed for you.
              </span>
            </div>
          )}

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cx(
              'rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
              dragging ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-ink-50/50'
            )}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
              <ReceiptIcon className="h-5 w-5 text-ink-400" aria-hidden="true" />
            </div>
            <p className="mt-3.5 text-sm font-medium text-ink-900">Add a receipt or bill</p>
            <p className="mt-1 text-xs text-ink-500">
              Drag an image here, or choose an option below
            </p>

            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              <button onClick={() => cameraInputRef.current?.click()} className="btn-primary">
                <Camera className="h-4 w-4" aria-hidden="true" />
                Take Photo
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="btn-secondary">
                <ImageIcon className="h-4 w-4" aria-hidden="true" />
                Choose from Gallery
              </button>
            </div>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
                e.target.value = ''
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
                e.target.value = ''
              }}
            />
          </div>

          <p className="mt-3 text-center text-xs text-ink-400">
            You’ll review every extracted value before anything is saved.
          </p>
        </div>
      )}

      {/* ══ RECEIPT: processing stage (PRD §57) ════════════════════════════ */}
      {mode === 'receipt' && stage === 'processing' && (
        <div className="py-6">
          <div className="relative mx-auto max-w-xs overflow-hidden rounded-2xl border border-ink-200 scanline">
            {previewUrl && (
              <img src={previewUrl} alt="Receipt being processed" className="w-full object-contain" />
            )}
          </div>
          <div className="mt-6 flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-ink-900">
              <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-hidden="true" />
              Reading your receipt…
            </div>
            <p className="text-xs text-ink-500">Looking for the total, date and merchant name.</p>
          </div>
        </div>
      )}

      {/* ══ REVIEW / MANUAL FORM ═══════════════════════════════════════════ */}
      {(mode === 'manual' || (mode === 'receipt' && stage === 'review')) && (
        <div
          className={cx(
            mode === 'receipt' && stage === 'review' && 'grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]'
          )}
        >
          {/* LEFT: receipt image (desktop two-panel design, PRD §71) */}
          {mode === 'receipt' && stage === 'review' && (
            <div>
              <p className="label">Receipt</p>
              <div className="overflow-hidden rounded-xl border border-ink-200 bg-ink-50">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Uploaded receipt"
                    className="max-h-[420px] w-full object-contain"
                  />
                ) : (
                  <div className="flex h-48 items-center justify-center text-xs text-ink-400">
                    No preview available
                  </div>
                )}
              </div>
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={() => {
                    setStage('input')
                    setExtraction(null)
                    setFile(null)
                  }}
                  className="btn-secondary btn-sm flex-1"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Different image
                </button>
                {file && (
                  <button onClick={() => void handleFile(file)} className="btn-secondary btn-sm flex-1">
                    <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />
                    Scan again
                  </button>
                )}
              </div>

              {extraction && extraction.rawText && (
                <details className="mt-3 rounded-xl border border-[var(--border-soft)] bg-ink-50/60 px-3.5 py-2.5">
                  <summary className="cursor-pointer text-xs font-medium text-ink-600">
                    Raw text read from the image
                  </summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-ink-500">
                    {extraction.rawText}
                  </pre>
                </details>
              )}
            </div>
          )}

          {/* RIGHT: fields */}
          <div>
            {mode === 'receipt' && stage === 'review' && (
              <>
                <h3 className="text-sm font-semibold text-ink-900">Review extracted expense</h3>
                <p className="mt-0.5 text-xs text-ink-500">
                  Nothing is saved until you confirm. Every field is editable.
                </p>

                {extraction && extraction.warnings.length > 0 && (
                  <div className="mt-3.5 space-y-1.5">
                    {extraction.warnings.map((w, i) => (
                      <div
                        key={i}
                        className="flex gap-2 rounded-lg bg-warn-50 px-3 py-2 text-[11px] leading-relaxed text-warn-700"
                      >
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <div className={cx('space-y-4', mode === 'receipt' && stage === 'review' && 'mt-5')}>
              {/* Amount */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="exp-amount" className="label mb-0">
                    Amount <span className="text-negative-600">*</span>
                  </label>
                  {showField('amount')}
                </div>
                <div className="relative mt-1.5">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-ink-400">
                    ৳
                  </span>
                  <input
                    id="exp-amount"
                    className={cx(
                      'input pl-8 text-base font-semibold tnum',
                      touched.amount && errors.amount && 'input-error'
                    )}
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amountText}
                    onChange={(e) => {
                      setAmountText(e.target.value)
                      setEditedFields((p) => ({ ...p, amount: true }))
                    }}
                    onBlur={() => setTouched((p) => ({ ...p, amount: true }))}
                    aria-invalid={Boolean(touched.amount && errors.amount)}
                    aria-describedby="exp-amount-help"
                    autoFocus={mode === 'manual'}
                  />
                </div>
                <p
                  id="exp-amount-help"
                  className={cx(
                    'mt-1.5 text-xs',
                    touched.amount && errors.amount ? 'text-negative-600' : 'text-ink-400'
                  )}
                >
                  {touched.amount && errors.amount
                    ? errors.amount
                    : mode === 'receipt' && extraction?.amount === null
                      ? 'Amount could not be read confidently. Please enter the amount.'
                      : amountPaisa !== null && amountPaisa > 0
                        ? `Saving as ${formatBdt(amountPaisa)}`
                        : 'Enter the total paid.'}
                </p>
              </div>

              {/* Date + Category */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="exp-date" className="label mb-0">
                      Date <span className="text-negative-600">*</span>
                    </label>
                    {showField('date')}
                  </div>
                  <input
                    id="exp-date"
                    type="date"
                    className={cx('input mt-1.5 tnum', touched.date && errors.date && 'input-error')}
                    value={date}
                    max="2100-12-31"
                    onChange={(e) => {
                      setDate(e.target.value)
                      setEditedFields((p) => ({ ...p, date: true }))
                    }}
                    onBlur={() => setTouched((p) => ({ ...p, date: true }))}
                    aria-invalid={Boolean(touched.date && errors.date)}
                  />
                  {mode === 'receipt' && extraction?.date === null && (
                    <p className="mt-1.5 text-xs text-warn-700">
                      No date was read from the receipt — please confirm it.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="exp-category" className="label">
                    Category <span className="text-negative-600">*</span>
                  </label>
                  <select
                    id="exp-category"
                    className="input"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Category)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Shop */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="exp-shop" className="label mb-0">
                    Shop / merchant{' '}
                    {mode === 'receipt' ? (
                      <span className="text-negative-600">*</span>
                    ) : (
                      <span className="font-normal text-ink-400">(optional)</span>
                    )}
                  </label>
                  {showField('shop')}
                </div>
                <input
                  id="exp-shop"
                  className={cx('input mt-1.5', touched.shop && errors.shop && 'input-error')}
                  placeholder="e.g. Shwapno, Landlord, Uber"
                  value={shop}
                  onChange={(e) => {
                    setShop(e.target.value)
                    setEditedFields((p) => ({ ...p, shop: true }))
                  }}
                  onBlur={() => setTouched((p) => ({ ...p, shop: true }))}
                  aria-describedby="exp-shop-help"
                />
                <p
                  id="exp-shop-help"
                  className={cx('mt-1.5 text-xs', touched.shop && errors.shop ? 'text-negative-600' : 'text-ink-400')}
                >
                  {touched.shop && errors.shop
                    ? errors.shop
                    : 'Used to detect recurring bills across months.'}
                </p>
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="exp-notes" className="label">
                  Notes <span className="font-normal text-ink-400">(optional)</span>
                </label>
                <textarea
                  id="exp-notes"
                  className="input resize-none"
                  rows={2}
                  placeholder="Anything worth remembering"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            {/* Blocking notice (PRD §12) */}
            {unconfirmedFields.length > 0 && (
              <div
                role="status"
                className="mt-4 flex gap-2.5 rounded-xl border border-warn-500/30 bg-warn-50 px-3.5 py-3 text-xs leading-relaxed text-warn-700"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Please confirm{' '}
                  <strong>
                    {unconfirmedFields
                      .map((f) => (f === 'shop' ? 'merchant' : f))
                      .join(' and ')}
                  </strong>{' '}
                  before saving. We won’t save a value we couldn’t read.
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="btn-secondary" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button className="btn-accent" onClick={handleSave} disabled={!canSave}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Saving…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    {editing ? 'Save changes' : 'Save expense'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
