import { patchChar } from './BitmapFontEditor'
import type { BitmapFontChar, BitmapFontModel } from './types'
import { effectiveCharXAdvance, globalXAdvanceValue } from './types'

export const DEFAULT_XADVANCE_FIX_OPTIONS: Required<XAdvanceFixOptions> = {
  padding: 4,
  tolerance: 0,
  absoluteThreshold: 6,
  relativeThreshold: 0.2,
  includeSpaces: false,
  narrowGlyphMaxWidth: 8,
}

export type XAdvanceFixOptions = {
  padding?: number
  tolerance?: number
  absoluteThreshold?: number
  relativeThreshold?: number
  includeSpaces?: boolean
  narrowGlyphMaxWidth?: number
}

export type XAdvanceFixSuggestion = {
  charId: number
  oldLocalXAdvance: number
  oldEffectiveXAdvance: number
  suggestedLocalXAdvance: number
  suggestedEffectiveXAdvance: number
  expectedEffectiveAdvance: number
  visibleRight: number
  reason: string
}

export type XAdvanceFixApplyEntry = {
  charId: number
  suggestedLocalXAdvance: number
}

function resolveOptions(options?: XAdvanceFixOptions): Required<XAdvanceFixOptions> {
  return { ...DEFAULT_XADVANCE_FIX_OPTIONS, ...options }
}

function excessThreshold(width: number, opts: Required<XAdvanceFixOptions>): number {
  if (width <= opts.narrowGlyphMaxWidth) return opts.absoluteThreshold
  return Math.max(opts.absoluteThreshold, width * opts.relativeThreshold)
}

export type SuggestedXAdvanceFix = {
  suggestedLocalXAdvance: number
  suggestedEffectiveXAdvance: number
  expectedEffectiveAdvance: number
  visibleRight: number
  reason: string
}

/**
 * Evaluate whether a glyph's effective xadvance is suspiciously large vs visible width.
 * Returns null when not suspicious or when the rounded fix would equal the current local advance.
 */
export function getSuggestedXAdvanceFix(
  c: BitmapFontChar,
  globalXAdvance: number,
  options?: XAdvanceFixOptions
): SuggestedXAdvanceFix | null {
  const opts = resolveOptions(options)
  const effectiveAdvance = effectiveCharXAdvance(c, globalXAdvance)
  const visibleRight = c.xoffset + c.width
  const expectedEffectiveAdvance = Math.ceil(visibleRight + opts.padding)
  const extraAdvance = effectiveAdvance - expectedEffectiveAdvance
  const threshold = excessThreshold(c.width, opts)

  if (
    effectiveAdvance <= expectedEffectiveAdvance + opts.tolerance ||
    extraAdvance <= threshold
  ) {
    return null
  }

  const suggestedEffectiveXAdvance = Math.round(
    Math.max(1, Math.max(visibleRight, expectedEffectiveAdvance))
  )
  const suggestedLocalXAdvance = Math.round(suggestedEffectiveXAdvance - globalXAdvance)

  if (suggestedLocalXAdvance === c.xadvance) return null

  const reason =
    `effective xadvance ${effectiveAdvance} > expected ${expectedEffectiveAdvance} ` +
    `(visibleRight ${visibleRight} + padding ${opts.padding}); ` +
    `excess ${extraAdvance}px (threshold ${Math.round(threshold)}px)`

  return {
    suggestedLocalXAdvance,
    suggestedEffectiveXAdvance,
    expectedEffectiveAdvance,
    visibleRight,
    reason,
  }
}

/** Find glyphs whose effective xadvance is suspiciously large compared to visible width. */
export function findSuspiciousXAdvanceChars(
  model: BitmapFontModel,
  options?: XAdvanceFixOptions
): XAdvanceFixSuggestion[] {
  const opts = resolveOptions(options)
  const globalXAdvance = globalXAdvanceValue(model.common)
  const out: XAdvanceFixSuggestion[] = []

  for (const c of model.chars) {
    if (!opts.includeSpaces && c.id === 32) continue
    if (c.width <= 0 && c.height <= 0) continue

    const fix = getSuggestedXAdvanceFix(c, globalXAdvance, opts)
    if (!fix) continue

    const oldEffectiveXAdvance = effectiveCharXAdvance(c, globalXAdvance)
    out.push({
      charId: c.id,
      oldLocalXAdvance: c.xadvance,
      oldEffectiveXAdvance,
      suggestedLocalXAdvance: fix.suggestedLocalXAdvance,
      suggestedEffectiveXAdvance: fix.suggestedEffectiveXAdvance,
      expectedEffectiveAdvance: fix.expectedEffectiveAdvance,
      visibleRight: fix.visibleRight,
      reason: fix.reason,
    })
  }

  out.sort((a, b) => a.charId - b.charId)
  return out
}

/** Format old → new with signed delta for report UI. */
export function formatXAdvanceChange(oldValue: number, newValue: number): string {
  const delta = newValue - oldValue
  const sign = delta >= 0 ? '+' : ''
  return `${oldValue} → ${newValue} (${sign}${delta})`
}

/** Apply local xadvance fixes only; skips no-ops and returns original model when nothing changes. */
export function applyXAdvanceFixes(
  model: BitmapFontModel,
  fixes: XAdvanceFixApplyEntry[]
): BitmapFontModel {
  const pending: { index: number; rounded: number }[] = []

  for (const fix of fixes) {
    const index = model.chars.findIndex((c) => c.id === fix.charId)
    if (index < 0) continue
    const c = model.chars[index]!
    const rounded = Math.round(fix.suggestedLocalXAdvance)
    if (rounded === c.xadvance) continue
    pending.push({ index, rounded })
  }

  if (pending.length === 0) return model

  let next = model
  for (const { index, rounded } of pending) {
    next = patchChar(next, index, { xadvance: rounded })
  }
  return next
}
