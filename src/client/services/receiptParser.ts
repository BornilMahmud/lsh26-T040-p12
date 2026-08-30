/**
 * ReceiptParser abstraction — PRD §14.
 *
 *   extractReceipt(image) -> { amount, date, merchant, confidence, rawText }
 *
 * The OCR implementation is isolated behind this interface so another
 * OCR/vision provider can be plugged in by adding a new class here; nothing in
 * the UI needs to change. The default implementation calls our own server-side
 * /api/ocr endpoint, so the provider API key stays on the server (PRD §64).
 *
 * SAFETY: this layer preserves nulls. If the server could not read the amount,
 * `amount` stays null all the way to the review screen, which then refuses to
 * save until a human supplies it (PRD §12, §13).
 */

import type { ConfidenceLevel, ReceiptExtraction } from '@/types'
import { coerceCategory } from '@/types'

export interface ReceiptParser {
  readonly name: string
  isAvailable(): Promise<boolean>
  extractReceipt(file: File): Promise<ReceiptExtraction>
}

const UNKNOWN_CONFIDENCE = { amount: 'UNKNOWN', date: 'UNKNOWN', shop: 'UNKNOWN' } as const

export function manualFallbackExtraction(reason: string): ReceiptExtraction {
  return {
    amount: null,
    date: null,
    merchant: null,
    category: null,
    confidence: { ...UNKNOWN_CONFIDENCE },
    rawText: '',
    provider: 'manual',
    warnings: [reason]
  }
}

/** Read a File into raw base64 (no data-URL prefix). */
export async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return { base64: btoa(binary), mimeType: file.type || 'image/jpeg' }
}

/**
 * Downscale a large photo before upload: mobile cameras produce 4–12MB images
 * which would blow the request budget and slow extraction (PRD §70).
 */
export async function compressImage(file: File, maxDimension = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/heic') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    if (scale >= 1 && file.size < 1_200_000) return file
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
    )
    bitmap.close?.()
    if (!blob) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file // compression is an optimization, never a hard requirement
  }
}

/** Default parser: our own edge endpoint, which holds the provider key. */
export class ServerVisionReceiptParser implements ReceiptParser {
  readonly name = 'Server vision OCR'
  private availability: Promise<boolean> | null = null

  async isAvailable(): Promise<boolean> {
    if (!this.availability) {
      this.availability = fetch('/api/ocr/status')
        .then((r) => (r.ok ? (r.json() as Promise<{ configured?: boolean }>) : { configured: false }))
        .then((j) => Boolean(j.configured))
        .catch(() => false)
    }
    return this.availability
  }

  async extractReceipt(file: File): Promise<ReceiptExtraction> {
    const prepared = await compressImage(file)
    const { base64, mimeType } = await fileToBase64(prepared)

    const res = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mimeType })
    })

    if (!res.ok) {
      return manualFallbackExtraction(
        'Receipt processing failed. You can enter the expense manually.'
      )
    }

    const json = (await res.json()) as Partial<ReceiptExtraction> & { category?: string | null }

    // Defensive re-validation on the client too: never let a non-positive or
    // non-finite amount through as if it were read from the receipt.
    const amount =
      typeof json.amount === 'number' && Number.isFinite(json.amount) && json.amount > 0
        ? Math.round(json.amount)
        : null

    const date =
      typeof json.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(json.date) ? json.date : null

    const merchant =
      typeof json.merchant === 'string' && json.merchant.trim().length > 0
        ? json.merchant.trim().slice(0, 120)
        : null

    return {
      amount,
      date,
      merchant,
      category: json.category ? coerceCategory(json.category) : null,
      confidence: {
        amount: level(json.confidence?.amount, amount !== null),
        date: level(json.confidence?.date, date !== null),
        shop: level(json.confidence?.shop, merchant !== null)
      },
      rawText: typeof json.rawText === 'string' ? json.rawText : '',
      provider: typeof json.provider === 'string' ? json.provider : 'unknown',
      warnings: Array.isArray(json.warnings) ? json.warnings.filter((w) => typeof w === 'string') : []
    }
  }
}

function level(v: unknown, hasValue: boolean): ConfidenceLevel {
  const s = typeof v === 'string' ? v.toUpperCase() : ''
  if (s === 'HIGH' || s === 'MEDIUM' || s === 'LOW') return hasValue ? (s as ConfidenceLevel) : 'UNKNOWN'
  return hasValue ? 'LOW' : 'UNKNOWN'
}

export const receiptParser: ReceiptParser = new ServerVisionReceiptParser()

/** Confidence display metadata, shared by the review UI. */
export const CONFIDENCE_META: Record<
  ConfidenceLevel,
  { label: string; tone: 'good' | 'warn' | 'bad'; icon: string; needsReview: boolean }
> = {
  HIGH: { label: 'High confidence', tone: 'good', icon: '✓', needsReview: false },
  MEDIUM: { label: 'Medium confidence', tone: 'warn', icon: '~', needsReview: true },
  LOW: { label: 'Low confidence', tone: 'bad', icon: '⚠', needsReview: true },
  UNKNOWN: { label: 'Could not read', tone: 'bad', icon: '⚠', needsReview: true }
}
