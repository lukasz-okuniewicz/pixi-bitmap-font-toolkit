import type { BitmapFontKerning } from './types'

export type EstimateKerningOptions = {
  sizePx: number
  /** Unique code points to pair (order preserved). */
  charset: string
  /** Max ordered pairs to evaluate (capped for UI responsiveness). */
  maxPairs?: number
}

function uniqueCodepoints(charset: string): number[] {
  const out: number[] = []
  const seen = new Set<number>()
  for (const ch of [...charset]) {
    const id = ch.codePointAt(0)!
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function uniqueFontFamily(): string {
  const r =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`
  return `PixiKernGen_${r}`
}

/**
 * Heuristic kerning via Canvas measureText width differences (Latin-style fonts).
 * Not a substitute for real OT kerning tables; ignore near-zero noise.
 */
export async function estimateKerningsFromFontBuffer(
  fontBuffer: ArrayBuffer,
  opts: EstimateKerningOptions
): Promise<{ ok: true; kernings: BitmapFontKerning[]; warnings: string[] } | { ok: false; error: string }> {
  if (typeof FontFace === 'undefined') {
    return { ok: false, error: 'FontFace API is not available.' }
  }
  const ids = uniqueCodepoints(opts.charset)
  if (ids.length < 2) {
    return { ok: false, error: 'Charset needs at least two distinct characters to estimate kerning.' }
  }
  const maxPairs = Math.max(100, Math.min(opts.maxPairs ?? 6000, 25000))
  const family = uniqueFontFamily()
  const fontFace = new FontFace(family, fontBuffer)
  try {
    await fontFace.load()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `Failed to load font: ${msg}` }
  }
  document.fonts.add(fontFace)
  await document.fonts.ready

  const size = Math.max(8, Math.round(opts.sizePx))
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    document.fonts.delete(fontFace)
    return { ok: false, error: 'Canvas 2D unavailable.' }
  }
  ctx.font = `${size}px "${family}"`
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  const warnings: string[] = []
  const kernings: BitmapFontKerning[] = []
  const seen = new Set<string>()
  let evaluated = 0

  for (let i = 0; i < ids.length; i++) {
    for (let j = 0; j < ids.length; j++) {
      if (evaluated >= maxPairs) break
      if (i === j) continue
      const first = ids[i]!
      const second = ids[j]!
      const a = String.fromCodePoint(first)
      const b = String.fromCodePoint(second)
      const key = `${first},${second}`
      if (seen.has(key)) continue
      seen.add(key)
      evaluated++
      const wab = ctx.measureText(a + b).width
      const wa = ctx.measureText(a).width
      const wb = ctx.measureText(b).width
      const raw = wab - wa - wb
      const amount = Math.round(raw)
      if (amount !== 0 && Math.abs(raw) > 0.25) {
        kernings.push({ first, second, amount })
      }
    }
    if (evaluated >= maxPairs) break
  }

  document.fonts.delete(fontFace)
  if (kernings.length === 0) {
    warnings.push('No non-zero kerning pairs were detected (common for monospace or at small sizes).')
  } else {
    warnings.push(`Estimated ${kernings.length} kerning pair(s); values are heuristic — review in the kerning table.`)
  }
  return { ok: true, kernings, warnings }
}
