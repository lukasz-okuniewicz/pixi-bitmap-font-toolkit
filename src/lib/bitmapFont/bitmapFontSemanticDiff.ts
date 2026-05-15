import type { BitmapFontChar, BitmapFontKerning, BitmapFontModel } from './types'

/** BMFont fields compared for semantic drift (atlas x/y are intentionally excluded). */
export const BITMAP_FONT_SEMANTIC_CHAR_METRIC_FIELDS = [
  'xoffset',
  'yoffset',
  'xadvance',
  'width',
  'height',
] as const

export type BitmapFontSemanticCharMetricField = (typeof BITMAP_FONT_SEMANTIC_CHAR_METRIC_FIELDS)[number]

export type BitmapFontSemanticCharFieldChange = {
  field: BitmapFontSemanticCharMetricField
  reference: number
  current: number
}

export type BitmapFontSemanticCharChange = {
  id: number
  changes: BitmapFontSemanticCharFieldChange[]
}

export type BitmapFontSemanticKerningOnly = {
  first: number
  second: number
  amount: number
}

export type BitmapFontSemanticKerningAmountChange = {
  first: number
  second: number
  reference: number
  current: number
}

export type BitmapFontSemanticDiff = {
  charFieldChanges: BitmapFontSemanticCharChange[]
  charsOnlyInReference: number[]
  charsOnlyInCurrent: number[]
  kerningsOnlyInReference: BitmapFontSemanticKerningOnly[]
  kerningsOnlyInCurrent: BitmapFontSemanticKerningOnly[]
  kerningsAmountDiffer: BitmapFontSemanticKerningAmountChange[]
}

function charById(chars: BitmapFontChar[]): Map<number, BitmapFontChar> {
  const m = new Map<number, BitmapFontChar>()
  for (const c of chars) m.set(c.id, c)
  return m
}

function kerningKey(k: BitmapFontKerning): string {
  return `${k.first}\t${k.second}`
}

function kerningMap(rows: BitmapFontKerning[]): Map<string, BitmapFontKerning> {
  const m = new Map<string, BitmapFontKerning>()
  for (const k of rows) m.set(kerningKey(k), k)
  return m
}

/**
 * Structural diff of glyph metrics and kernings between `current` and `reference`
 * (e.g. live edits vs last import snapshot, or vs another open font snapshot).
 */
export function semanticDiffBitmapFont(current: BitmapFontModel, reference: BitmapFontModel): BitmapFontSemanticDiff {
  const curM = charById(current.chars)
  const refM = charById(reference.chars)

  const charFieldChanges: BitmapFontSemanticCharChange[] = []
  for (const id of [...refM.keys()].sort((a, b) => a - b)) {
    const refC = refM.get(id)
    const curC = curM.get(id)
    if (!refC || !curC) continue
    const changes: BitmapFontSemanticCharFieldChange[] = []
    for (const field of BITMAP_FONT_SEMANTIC_CHAR_METRIC_FIELDS) {
      const r = refC[field]
      const c = curC[field]
      if (r !== c) changes.push({ field, reference: r, current: c })
    }
    if (changes.length > 0) charFieldChanges.push({ id, changes })
  }

  const charsOnlyInReference: number[] = []
  const charsOnlyInCurrent: number[] = []
  const allIds = new Set<number>([...refM.keys(), ...curM.keys()])
  for (const id of [...allIds].sort((a, b) => a - b)) {
    const hasR = refM.has(id)
    const hasC = curM.has(id)
    if (hasR && !hasC) charsOnlyInReference.push(id)
    else if (!hasR && hasC) charsOnlyInCurrent.push(id)
  }

  const refK = kerningMap(reference.kernings)
  const curK = kerningMap(current.kernings)
  const kerningsOnlyInReference: BitmapFontSemanticKerningOnly[] = []
  const kerningsOnlyInCurrent: BitmapFontSemanticKerningOnly[] = []
  const kerningsAmountDiffer: BitmapFontSemanticKerningAmountChange[] = []

  for (const [key, rk] of refK) {
    const ck = curK.get(key)
    if (!ck) kerningsOnlyInReference.push({ first: rk.first, second: rk.second, amount: rk.amount })
    else if (rk.amount !== ck.amount) {
      kerningsAmountDiffer.push({
        first: rk.first,
        second: rk.second,
        reference: rk.amount,
        current: ck.amount,
      })
    }
  }
  for (const [key, ck] of curK) {
    if (!refK.has(key)) kerningsOnlyInCurrent.push({ first: ck.first, second: ck.second, amount: ck.amount })
  }

  kerningsOnlyInReference.sort((a, b) => a.first - b.first || a.second - b.second)
  kerningsOnlyInCurrent.sort((a, b) => a.first - b.first || a.second - b.second)
  kerningsAmountDiffer.sort((a, b) => a.first - b.first || a.second - b.second)

  return {
    charFieldChanges,
    charsOnlyInReference,
    charsOnlyInCurrent,
    kerningsOnlyInReference,
    kerningsOnlyInCurrent,
    kerningsAmountDiffer,
  }
}

export function semanticDiffBitmapFontHasChanges(d: BitmapFontSemanticDiff): boolean {
  return (
    d.charFieldChanges.length > 0 ||
    d.charsOnlyInReference.length > 0 ||
    d.charsOnlyInCurrent.length > 0 ||
    d.kerningsOnlyInReference.length > 0 ||
    d.kerningsOnlyInCurrent.length > 0 ||
    d.kerningsAmountDiffer.length > 0
  )
}
