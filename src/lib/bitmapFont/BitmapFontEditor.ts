import type { BitmapFontChar, BitmapFontCommon, BitmapFontInfo, BitmapFontKerning, BitmapFontModel } from './types'

export function patchChar(model: BitmapFontModel, index: number, patch: Partial<BitmapFontChar>): BitmapFontModel {
  if (index < 0 || index >= model.chars.length) return model
  const cur = model.chars[index]!
  for (const k of Object.keys(patch) as (keyof BitmapFontChar)[]) {
    if (patch[k] !== cur[k]) {
      const next = { ...model, chars: [...model.chars] }
      next.chars[index] = { ...cur, ...patch }
      return next
    }
  }
  return model
}

export function patchKerning(model: BitmapFontModel, index: number, patch: Partial<BitmapFontKerning>): BitmapFontModel {
  if (index < 0 || index >= model.kernings.length) return model
  const next = { ...model, kernings: [...model.kernings] }
  next.kernings[index] = { ...next.kernings[index], ...patch }
  return next
}

export function removeKerningAt(model: BitmapFontModel, index: number): BitmapFontModel {
  if (index < 0 || index >= model.kernings.length) return model
  return {
    ...model,
    kernings: model.kernings.filter((_, i) => i !== index),
  }
}

export function addKerning(model: BitmapFontModel, row: BitmapFontKerning): BitmapFontModel {
  return { ...model, kernings: [...model.kernings, row] }
}

export function setInfo(model: BitmapFontModel, patch: Partial<BitmapFontInfo>): BitmapFontModel {
  return { ...model, info: { ...model.info, ...patch } }
}

export function setCommon(model: BitmapFontModel, patch: Partial<BitmapFontCommon>): BitmapFontModel {
  return { ...model, common: { ...model.common, ...patch } }
}

export function setPages(model: BitmapFontModel, pages: BitmapFontModel['pages']): BitmapFontModel {
  return {
    ...model,
    pages: [...pages],
    common: { ...model.common, pages: Math.max(1, pages.length) },
  }
}

/** Placeholder glyph metrics for a newly added code point (user sets atlas rect afterward). */
export function defaultCharForId(id: number): BitmapFontChar {
  return { id, x: 0, y: 0, width: 0, height: 0, xoffset: 0, yoffset: 0, xadvance: 0, page: 0 }
}

export function addChar(model: BitmapFontModel, char: BitmapFontChar): BitmapFontModel {
  if (model.chars.some((c) => c.id === char.id)) return model
  return { ...model, chars: [...model.chars, char] }
}

export function removeCharAt(model: BitmapFontModel, index: number): BitmapFontModel {
  if (index < 0 || index >= model.chars.length) return model
  const removedId = model.chars[index]!.id
  return {
    ...model,
    chars: model.chars.filter((_, i) => i !== index),
    kernings: model.kernings.filter((k) => k.first !== removedId && k.second !== removedId),
  }
}

export function removeCharById(model: BitmapFontModel, id: number): BitmapFontModel {
  const index = model.chars.findIndex((c) => c.id === id)
  if (index < 0) return model
  return removeCharAt(model, index)
}

/** Remove multiple glyphs (and related kernings) in one pass; indices may be in any order. */
export function removeCharsAt(model: BitmapFontModel, indices: number[]): BitmapFontModel {
  const unique = [...new Set(indices)].filter((i) => i >= 0 && i < model.chars.length).sort((a, b) => b - a)
  let next = model
  for (const i of unique) next = removeCharAt(next, i)
  return next
}

/** Update char rect from texture editor (by char code id). */
export function patchCharById(
  model: BitmapFontModel,
  charId: number,
  patch: Partial<Pick<BitmapFontChar, 'x' | 'y' | 'width' | 'height'>>
): BitmapFontModel {
  const index = model.chars.findIndex((c) => c.id === charId)
  if (index < 0) return model
  return patchChar(model, index, patch)
}
