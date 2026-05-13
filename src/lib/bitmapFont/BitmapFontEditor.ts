import type { BitmapFontChar, BitmapFontCommon, BitmapFontInfo, BitmapFontKerning, BitmapFontModel } from './types'

export function patchChar(model: BitmapFontModel, index: number, patch: Partial<BitmapFontChar>): BitmapFontModel {
  if (index < 0 || index >= model.chars.length) return model
  const next = { ...model, chars: [...model.chars] }
  next.chars[index] = { ...next.chars[index], ...patch }
  return next
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
