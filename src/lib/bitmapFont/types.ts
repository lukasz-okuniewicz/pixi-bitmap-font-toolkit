/** AngelCode BMFont `<info>` fields beyond face + size. */
export type BitmapFontInfo = {
  face: string
  size: number
  bold?: number
  italic?: number
  /** Quoted string in .fnt; may be empty. */
  charset?: string
  unicode?: number
  stretchH?: number
  smooth?: number
  aa?: number
  /** Comma-separated padding, e.g. "0,0,0,0". */
  padding?: string
  /** Comma-separated horizontal,vertical spacing, e.g. "1,1". */
  spacing?: string
  outline?: number
  /** Unknown XML attributes preserved on `<info>` (round-trip). */
  extraAttrs?: Record<string, string>
}

export type BitmapFontCommon = {
  lineHeight: number
  scaleW: number
  scaleH: number
  pages: number
  base?: number
  packed?: number
  alphaChnl?: number
  redChnl?: number
  greenChnl?: number
  blueChnl?: number
  /**
   * Pixels added to every glyph’s exported `xadvance` (editor decomposition; Shoebox-style global spacing).
   * In-memory `BitmapFontChar.xadvance` is the per-glyph addition; serializers write `globalXAdvance + xadvance` per char.
   */
  globalXAdvance?: number
  /** Unknown XML attributes preserved on `<common>`. */
  extraAttrs?: Record<string, string>
}

export type BitmapFontPage = { id: number; file: string; extraAttrs?: Record<string, string> }

export type BitmapFontChar = {
  id: number
  x: number
  y: number
  width: number
  height: number
  xoffset: number
  yoffset: number
  /** Per-glyph horizontal advance added on top of `common.globalXAdvance`; serialized `xadvance` is the sum. */
  xadvance: number
  /** Atlas page index; omit or 0 for single-page fonts. */
  page?: number
  chnl?: number
  /** Unknown XML attributes preserved on `<char>`. */
  extraAttrs?: Record<string, string>
}

export type BitmapFontKerning = {
  first: number
  second: number
  amount: number
  /** Unknown XML attributes preserved on `<kerning>`. */
  extraAttrs?: Record<string, string>
}

export type BitmapFontModel = {
  info: BitmapFontInfo
  common: BitmapFontCommon
  pages: BitmapFontPage[]
  chars: BitmapFontChar[]
  kernings: BitmapFontKerning[]
}

export const defaultBitmapFontModel = (): BitmapFontModel => ({
  info: { face: 'unnamed', size: 16 },
  common: { lineHeight: 16, scaleW: 256, scaleH: 256, pages: 1 },
  pages: [{ id: 0, file: '' }],
  chars: [],
  kernings: [],
})

/** Effective atlas page for a glyph (BMFont default is 0). */
export function charAtlasPage(c: BitmapFontChar): number {
  return c.page ?? 0
}

export function globalXAdvanceValue(common: BitmapFontCommon): number {
  const g = common.globalXAdvance
  return g === undefined || !Number.isFinite(g) ? 0 : g
}

/** BMFont / Pixi `xadvance` = global spacing + per-glyph local advance. */
export function effectiveCharXAdvance(c: BitmapFontChar, global: number): number {
  const g = Number.isFinite(global) ? global : 0
  return g + c.xadvance
}

/** After reading combined `xadvance` from a file, subtract `common.globalXAdvance` so each char stores local advance only. */
export function decomposeGlobalXAdvanceFromChars(model: BitmapFontModel): void {
  const g = globalXAdvanceValue(model.common)
  if (g === 0) return
  for (const c of model.chars) c.xadvance -= g
}
