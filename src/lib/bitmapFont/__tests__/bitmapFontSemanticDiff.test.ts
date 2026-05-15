import { describe, expect, it } from 'vitest'
import { defaultBitmapFontModel } from '../types'
import { semanticDiffBitmapFont, semanticDiffBitmapFontHasChanges } from '../bitmapFontSemanticDiff'

function baseModel() {
  const m = defaultBitmapFontModel()
  m.chars = [
    { id: 65, x: 0, y: 0, width: 10, height: 12, xoffset: 0, yoffset: 0, xadvance: 10 },
    { id: 66, x: 10, y: 0, width: 10, height: 12, xoffset: 0, yoffset: 0, xadvance: 10 },
  ]
  m.kernings = [
    { first: 65, second: 66, amount: -1 },
    { first: 66, second: 65, amount: 0 },
  ]
  return m
}

describe('semanticDiffBitmapFont', () => {
  it('returns empty diff for identical models', () => {
    const m = baseModel()
    const d = semanticDiffBitmapFont(m, structuredClone(m))
    expect(semanticDiffBitmapFontHasChanges(d)).toBe(false)
    expect(d.charFieldChanges).toEqual([])
    expect(d.charsOnlyInReference).toEqual([])
    expect(d.charsOnlyInCurrent).toEqual([])
    expect(d.kerningsOnlyInReference).toEqual([])
    expect(d.kerningsOnlyInCurrent).toEqual([])
    expect(d.kerningsAmountDiffer).toEqual([])
  })

  it('detects char metric drift', () => {
    const cur = baseModel()
    const ref = structuredClone(cur)
    ref.chars[0]!.xoffset = 2
    ref.chars[1]!.height = 20
    const d = semanticDiffBitmapFont(cur, ref)
    expect(d.charFieldChanges).toEqual([
      { id: 65, changes: [{ field: 'xoffset', reference: 2, current: 0 }] },
      { id: 66, changes: [{ field: 'height', reference: 20, current: 12 }] },
    ])
  })

  it('detects glyphs only on one side', () => {
    const cur = baseModel()
    const ref = structuredClone(cur)
    ref.chars.push({ id: 67, x: 0, y: 0, width: 5, height: 5, xoffset: 0, yoffset: 0, xadvance: 5 })
    cur.chars.push({ id: 68, x: 0, y: 0, width: 5, height: 5, xoffset: 0, yoffset: 0, xadvance: 5 })
    const d = semanticDiffBitmapFont(cur, ref)
    expect(d.charsOnlyInReference).toEqual([67])
    expect(d.charsOnlyInCurrent).toEqual([68])
  })

  it('detects kerning presence and amount changes', () => {
    const cur = baseModel()
    const ref = structuredClone(cur)
    ref.kernings.push({ first: 65, second: 67, amount: -2 })
    cur.kernings.push({ first: 66, second: 66, amount: 1 })
    ref.kernings[0]!.amount = -3
    const d = semanticDiffBitmapFont(cur, ref)
    expect(d.kerningsOnlyInReference).toEqual([{ first: 65, second: 67, amount: -2 }])
    expect(d.kerningsOnlyInCurrent).toEqual([{ first: 66, second: 66, amount: 1 }])
    expect(d.kerningsAmountDiffer).toEqual([{ first: 65, second: 66, reference: -3, current: -1 }])
  })
})
