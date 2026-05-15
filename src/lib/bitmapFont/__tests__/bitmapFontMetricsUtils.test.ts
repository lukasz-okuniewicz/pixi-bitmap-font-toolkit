import { describe, expect, it } from 'vitest'

import {
  applyXAdvanceFixes,
  findSuspiciousXAdvanceChars,
  formatXAdvanceChange,
  getSuggestedXAdvanceFix,
} from '../bitmapFontMetricsUtils'
import type { BitmapFontChar, BitmapFontModel } from '../types'
import { effectiveCharXAdvance, globalXAdvanceValue } from '../types'

function makeModel(chars: BitmapFontChar[], globalXAdvance?: number): BitmapFontModel {
  return {
    info: { face: 'test', size: 16 },
    common: {
      lineHeight: 16,
      scaleW: 256,
      scaleH: 256,
      pages: 1,
      ...(globalXAdvance !== undefined ? { globalXAdvance } : {}),
    },
    pages: [{ id: 0, file: 'atlas.png' }],
    chars,
    kernings: [{ first: 65, second: 66, amount: -1 }],
  }
}

describe('getSuggestedXAdvanceFix', () => {
  it('returns null for a normal glyph', () => {
    const c: BitmapFontChar = {
      id: 65,
      x: 0,
      y: 0,
      width: 10,
      height: 12,
      xoffset: 0,
      yoffset: 0,
      xadvance: 12,
    }
    expect(getSuggestedXAdvanceFix(c, 0)).toBeNull()
  })

  it('detects huge local xadvance when global is 0', () => {
    const c: BitmapFontChar = {
      id: 65,
      x: 0,
      y: 0,
      width: 10,
      height: 12,
      xoffset: 0,
      yoffset: 0,
      xadvance: 48,
    }
    const fix = getSuggestedXAdvanceFix(c, 0)
    expect(fix).not.toBeNull()
    expect(fix!.suggestedEffectiveXAdvance).toBe(14)
    expect(fix!.suggestedLocalXAdvance).toBe(14)
  })

  it('detects using effective advance when globalXAdvance is set', () => {
    const c: BitmapFontChar = {
      id: 65,
      x: 0,
      y: 0,
      width: 10,
      height: 12,
      xoffset: 0,
      yoffset: 0,
      xadvance: 38,
    }
    const global = 10
    const fix = getSuggestedXAdvanceFix(c, global)
    expect(fix).not.toBeNull()
    expect(fix!.suggestedEffectiveXAdvance).toBe(14)
    expect(fix!.suggestedLocalXAdvance).toBe(4)
    expect(effectiveCharXAdvance({ ...c, xadvance: fix!.suggestedLocalXAdvance }, global)).toBe(14)
  })

  it('detects narrow punctuation with absolute threshold', () => {
    const c: BitmapFontChar = {
      id: 46,
      x: 0,
      y: 0,
      width: 4,
      height: 8,
      xoffset: 0,
      yoffset: 0,
      xadvance: 20,
    }
    expect(getSuggestedXAdvanceFix(c, 0)).not.toBeNull()
  })

  it('returns null after round when local would not change', () => {
    const c: BitmapFontChar = {
      id: 65,
      x: 0,
      y: 0,
      width: 10,
      height: 12,
      xoffset: 0,
      yoffset: 0,
      xadvance: 12,
    }
    expect(getSuggestedXAdvanceFix(c, 0, { padding: 2, absoluteThreshold: 0, tolerance: 0 })).toBeNull()
  })

  it('handles negative xoffset and clamps suggested effective to visibleRight', () => {
    const c: BitmapFontChar = {
      id: 65,
      x: 0,
      y: 0,
      width: 10,
      height: 12,
      xoffset: -2,
      yoffset: 0,
      xadvance: 40,
    }
    const fix = getSuggestedXAdvanceFix(c, 0)
    expect(fix).not.toBeNull()
    expect(fix!.visibleRight).toBe(8)
    expect(fix!.suggestedEffectiveXAdvance).toBeGreaterThanOrEqual(8)
    expect(fix!.suggestedEffectiveXAdvance).toBeGreaterThanOrEqual(1)
  })
})

describe('findSuspiciousXAdvanceChars', () => {
  it('ignores space by default', () => {
    const m = makeModel([
      { id: 32, x: 0, y: 0, width: 1, height: 1, xoffset: 0, yoffset: 0, xadvance: 80 },
    ])
    expect(findSuspiciousXAdvanceChars(m)).toHaveLength(0)
  })

  it('includes space when includeSpaces is true', () => {
    const m = makeModel([
      { id: 32, x: 0, y: 0, width: 1, height: 1, xoffset: 0, yoffset: 0, xadvance: 80 },
    ])
    expect(findSuspiciousXAdvanceChars(m, { includeSpaces: true }).length).toBeGreaterThan(0)
  })

  it('does not mutate the input model', () => {
    const m = makeModel([
      { id: 65, x: 0, y: 0, width: 10, height: 12, xoffset: 0, yoffset: 0, xadvance: 48 },
    ])
    const snap = JSON.stringify(m)
    findSuspiciousXAdvanceChars(m)
    expect(JSON.stringify(m)).toBe(snap)
  })
})

describe('applyXAdvanceFixes', () => {
  it('patches only xadvance on targeted chars', () => {
    const m = makeModel([
      { id: 65, x: 0, y: 0, width: 10, height: 12, xoffset: 0, yoffset: 0, xadvance: 48 },
      { id: 66, x: 10, y: 0, width: 10, height: 12, xoffset: 0, yoffset: 0, xadvance: 10 },
    ])
    const kerningsBefore = JSON.stringify(m.kernings)
    const next = applyXAdvanceFixes(m, [{ charId: 65, suggestedLocalXAdvance: 12 }])
    expect(next).not.toBe(m)
    expect(next.chars.find((c) => c.id === 65)?.xadvance).toBe(12)
    expect(next.chars.find((c) => c.id === 66)?.xadvance).toBe(10)
    expect(next.chars.find((c) => c.id === 65)?.width).toBe(10)
    expect(JSON.stringify(next.kernings)).toBe(kerningsBefore)
  })

  it('does not mutate the input model', () => {
    const m = makeModel([
      { id: 65, x: 0, y: 0, width: 10, height: 12, xoffset: 0, yoffset: 0, xadvance: 48 },
    ])
    const snap = JSON.stringify(m)
    applyXAdvanceFixes(m, [{ charId: 65, suggestedLocalXAdvance: 12 }])
    expect(JSON.stringify(m)).toBe(snap)
  })

  it('skips fixes where rounded local equals old local and returns same reference', () => {
    const m = makeModel([
      { id: 65, x: 0, y: 0, width: 10, height: 12, xoffset: 0, yoffset: 0, xadvance: 12 },
    ])
    const next = applyXAdvanceFixes(m, [{ charId: 65, suggestedLocalXAdvance: 12 }])
    expect(next).toBe(m)
  })

  it('returns same model reference when all fixes are filtered out', () => {
    const m = makeModel([
      { id: 65, x: 0, y: 0, width: 10, height: 12, xoffset: 0, yoffset: 0, xadvance: 12 },
    ])
    const next = applyXAdvanceFixes(m, [
      { charId: 65, suggestedLocalXAdvance: 12 },
      { charId: 999, suggestedLocalXAdvance: 5 },
    ])
    expect(next).toBe(m)
  })

  it('leaves globalXAdvance unchanged', () => {
    const m = makeModel(
      [{ id: 65, x: 0, y: 0, width: 10, height: 12, xoffset: 0, yoffset: 0, xadvance: 38 }],
      10
    )
    const next = applyXAdvanceFixes(m, [{ charId: 65, suggestedLocalXAdvance: 4 }])
    expect(globalXAdvanceValue(next.common)).toBe(10)
    const c = next.chars.find((ch) => ch.id === 65)!
    expect(effectiveCharXAdvance(c, 10)).toBe(14)
  })
})

describe('formatXAdvanceChange', () => {
  it('formats negative delta', () => {
    expect(formatXAdvanceChange(48, 14)).toBe('48 → 14 (-34)')
  })

  it('formats positive delta', () => {
    expect(formatXAdvanceChange(10, 12)).toBe('10 → 12 (+2)')
  })
})
