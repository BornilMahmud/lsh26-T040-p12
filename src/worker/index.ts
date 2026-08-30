/**
 * Cloudflare Pages Function (Hono) — server-side receipt OCR.
 *
 * WHY A SERVER ROUTE (PRD §14, §64):
 * The vision model API key must never reach the browser. The client uploads the
 * image bytes to this edge endpoint, which calls the vision model using a key
 * held in the Worker environment and returns only the extracted fields.
 *
 * SAFETY CONTRACT (PRD §12, §13, §56):
 * This endpoint returns `amount: null` whenever it cannot read the amount
 * confidently. It NEVER substitutes 0, an estimate, or random numeric text.
 * The same applies to date and merchant. Confidence is reported per field so
 * the UI can block saving until a human confirms the uncertain ones.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
  buildOcrResponse,
  OCR_CATEGORIES as CATEGORIES,
  stripCodeFence,
  unknownResult as UNKNOWN_RESULT,
  type OcrResponse
} from './ocrSafety'

type Bindings = {
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
  OCR_MODEL?: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())

/** Does the deployment have a vision provider configured? */
app.get('/api/ocr/status', (c) => {
  const configured = Boolean(c.env.OPENAI_API_KEY)
  return c.json({
    configured,
    provider: configured ? 'openai-vision' : 'none',
    message: configured
      ? 'Receipt scanning is available.'
      : 'No vision provider is configured. Receipt images can still be attached and the fields entered manually.'
  })
})

const SYSTEM_PROMPT = `You are a precise receipt-extraction engine for a Bangladeshi personal finance app.

Extract ONLY what is genuinely legible in the image. Return STRICT JSON, no markdown:
{
  "amount_bdt": number | null,     // the FINAL TOTAL paid, in BDT (not subtotal, not per-item, not change)
  "date": "YYYY-MM-DD" | null,     // the transaction date printed on the receipt
  "merchant": string | null,       // the shop/merchant/biller name as printed
  "category": string | null,       // one of: ${CATEGORIES.join(', ')}
  "confidence": { "amount": "HIGH|MEDIUM|LOW|UNKNOWN", "date": "...", "shop": "..." },
  "raw_text": string,              // all text you can read, newline separated
  "notes": string                  // brief note on anything ambiguous
}

CRITICAL RULES — these matter more than completeness:
1. If you cannot read a value confidently, set it to null and its confidence to "UNKNOWN" or "LOW".
2. NEVER guess, estimate, average, or invent an amount. Do NOT return 0 as a placeholder for an unreadable amount.
3. Prefer the labelled grand total ("Total", "Grand Total", "Net Payable", "মোট"). If several totals are visible and you cannot tell which is final, report the most likely one with confidence "LOW".
4. Only report a date that is actually printed. Never use today's date as a fallback.
5. If the image is not a receipt/bill/payment screenshot at all, set all fields null with confidence "UNKNOWN" and explain in notes.
6. Amounts are Bangladeshi Taka. Ignore currency symbols (৳, Tk, BDT) when reporting the number.`

app.post('/api/ocr', async (c) => {
  const apiKey = c.env.OPENAI_API_KEY
  const baseUrl = (c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = c.env.OCR_MODEL || 'gpt-5-mini'

  if (!apiKey) {
    // Graceful fallback: the app stays fully functional (PRD §14, §56).
    return c.json(
      UNKNOWN_RESULT('none', [
        'No vision provider is configured on the server, so automatic extraction is unavailable. Please enter the values manually.'
      ])
    )
  }

  let body: { imageBase64?: string; mimeType?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request body.' }, 400)
  }

  const imageBase64 = body.imageBase64
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return c.json({ error: 'imageBase64 is required.' }, 400)
  }
  // ~8MB base64 ceiling to protect the Worker CPU/memory budget.
  if (imageBase64.length > 8_000_000) {
    return c.json(
      UNKNOWN_RESULT('openai-vision', [
        'The image is too large to process. Please use a smaller photo, or enter the values manually.'
      ]),
      200
    )
  }
  const mimeType = typeof body.mimeType === 'string' && body.mimeType.startsWith('image/')
    ? body.mimeType
    : 'image/jpeg'
  const dataUrl = `data:${mimeType};base64,${imageBase64}`

  // Timeout + a single retry, then fall back (PRD §68).
  const attempt = async (): Promise<Response> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 45_000)
    try {
      return await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Extract the receipt fields as strict JSON.' },
                { type: 'image_url', image_url: { url: dataUrl } }
              ]
            }
          ],
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }
  }

  let raw: string | null = null
  const warnings: string[] = []
  for (let tryNo = 1; tryNo <= 2; tryNo++) {
    try {
      const res = await attempt()
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        if (tryNo === 2) {
          warnings.push('The receipt reader could not be reached. Please enter the values manually.')
          console.error('OCR provider error', res.status, text.slice(0, 300))
        }
        continue
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[]
      }
      raw = json.choices?.[0]?.message?.content ?? null
      if (raw) break
      if (tryNo === 2) warnings.push('The receipt reader returned an empty response. Please enter the values manually.')
    } catch (err) {
      if (tryNo === 2) {
        warnings.push('Receipt processing timed out. Please enter the values manually.')
        console.error('OCR request failed', err)
      }
    }
  }

  if (!raw) return c.json(UNKNOWN_RESULT('openai-vision', warnings))

  // Parse the model output defensively — a bad payload must never produce a
  // fabricated number.
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(stripCodeFence(raw)) as Record<string, unknown>
  } catch {
    return c.json(
      UNKNOWN_RESULT('openai-vision', [
        'The extracted data could not be interpreted. Please enter the values manually.'
      ], typeof raw === 'string' ? raw.slice(0, 2000) : '')
    )
  }

  return c.json(buildOcrResponse(parsed, warnings))
})

// SPA fallback: any non-API route serves the built index.html so client-side
// routing works on hard refresh / deep links.
app.get('*', async (c, next) => {
  if (c.req.path.startsWith('/api/')) return next()
  return next()
})

export default app
