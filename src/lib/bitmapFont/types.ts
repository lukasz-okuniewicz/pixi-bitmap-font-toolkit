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
