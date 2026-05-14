import type { BitmapFontChar, BitmapFontModel } from './types'
import { charAtlasPage, effectiveCharXAdvance, globalXAdvanceValue } from './types'

export type SerializeOptions = {
  /** '\t' or '    ' */
  indent: string
}

const defaultOptions: SerializeOptions = { indent: '\t' }

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

function escAttr(s: string): string {
  return esc(s)
}

function pushExtraXmlParts(parts: string[], extra?: Record<string, string>): void {
  if (!extra) return
  for (const k of Object.keys(extra).sort()) {
    parts.push(`${k}="${escAttr(extra[k]!)}"`)
  }
}

function infoAttrsXml(info: BitmapFontModel['info']): string {
  const parts: string[] = [`face="${escAttr(info.face)}"`, `size="${info.size}"`]
  if (info.bold !== undefined) parts.push(`bold="${info.bold}"`)
  if (info.italic !== undefined) parts.push(`italic="${info.italic}"`)
  if (info.charset !== undefined) parts.push(`charset="${escAttr(info.charset)}"`)
  if (info.unicode !== undefined) parts.push(`unicode="${info.unicode}"`)
  if (info.stretchH !== undefined) parts.push(`stretchH="${info.stretchH}"`)
  if (info.smooth !== undefined) parts.push(`smooth="${info.smooth}"`)
  if (info.aa !== undefined) parts.push(`aa="${info.aa}"`)
  if (info.padding !== undefined) parts.push(`padding="${escAttr(info.padding)}"`)
  if (info.spacing !== undefined) parts.push(`spacing="${escAttr(info.spacing)}"`)
  if (info.outline !== undefined) parts.push(`outline="${info.outline}"`)
  pushExtraXmlParts(parts, info.extraAttrs)
  return parts.join(' ')
}

function commonAttrsXml(common: BitmapFontModel['common']): string {
  const parts: string[] = [
    `lineHeight="${common.lineHeight}"`,
    `scaleW="${common.scaleW}"`,
    `scaleH="${common.scaleH}"`,
    `pages="${common.pages}"`,
  ]
  if (common.base !== undefined) parts.push(`base="${common.base}"`)
  if (common.packed !== undefined) parts.push(`packed="${common.packed}"`)
  if (common.alphaChnl !== undefined) parts.push(`alphaChnl="${common.alphaChnl}"`)
  if (common.redChnl !== undefined) parts.push(`redChnl="${common.redChnl}"`)
  if (common.greenChnl !== undefined) parts.push(`greenChnl="${common.greenChnl}"`)
  if (common.blueChnl !== undefined) parts.push(`blueChnl="${common.blueChnl}"`)
  const gx = globalXAdvanceValue(common)
  if (gx !== 0) parts.push(`globalXAdvance="${gx}"`)
  pushExtraXmlParts(parts, common.extraAttrs)
  return parts.join(' ')
}

function charAttrsXml(c: BitmapFontChar, multiPage: boolean, globalAdvance: number): string {
  const parts: string[] = [
    `id="${c.id}"`,
    `x="${c.x}"`,
    `y="${c.y}"`,
    `width="${c.width}"`,
    `height="${c.height}"`,
    `xoffset="${c.xoffset}"`,
    `yoffset="${c.yoffset}"`,
    `xadvance="${effectiveCharXAdvance(c, globalAdvance)}"`,
  ]
  const p = charAtlasPage(c)
  if (multiPage || p !== 0 || c.page !== undefined) parts.push(`page="${p}"`)
  if (c.chnl !== undefined) parts.push(`chnl="${c.chnl}"`)
  pushExtraXmlParts(parts, c.extraAttrs)
  return parts.join(' ')
}

/** Detect indent style from original XML (first significant line after <?). */
export function detectIndentFromXml(original: string): string {
  const lines = original.split(/\r?\n/)
  for (const line of lines) {
    if (!line.trim()) continue
    const m = line.match(/^(\s+)/)
    if (m && line.includes('<font')) continue
    if (m && /^\s+<[a-z]/i.test(line)) {
      const s = m[1]
      if (s.includes('\t')) return '\t'
      if (s.length >= 4) return '    '
      return s
    }
  }
  return '\t'
}

export function serializeBitmapFontXml(model: BitmapFontModel, options: Partial<SerializeOptions> = {}): string {
  const indent = options.indent ?? defaultOptions.indent
  const i1 = indent
  const i2 = indent + indent

  const multiPage = model.pages.length > 1
  const gAdv = globalXAdvanceValue(model.common)

  const lines: string[] = []
  lines.push('<font>')
  lines.push(`${i1}<info ${infoAttrsXml(model.info)} />`)
  lines.push(`${i1}<common ${commonAttrsXml(model.common)} />`)
  lines.push(`${i1}<pages>`)
  for (const p of model.pages) {
    const pp: string[] = [`id="${p.id}"`, `file="${esc(p.file)}"`]
    pushExtraXmlParts(pp, p.extraAttrs)
    lines.push(`${i2}<page ${pp.join(' ')} />`)
  }
  lines.push(`${i1}</pages>`)
  lines.push(`${i1}<chars count="${model.chars.length}">`)
  for (const c of model.chars) {
    lines.push(`${i2}<char ${charAttrsXml(c, multiPage, gAdv)} />`)
  }
  lines.push(`${i1}</chars>`)
  lines.push(`${i1}<kernings count="${model.kernings.length}">`)
  for (const k of model.kernings) {
    const kp: string[] = [`first="${k.first}"`, `second="${k.second}"`, `amount="${k.amount}"`]
    pushExtraXmlParts(kp, k.extraAttrs)
    lines.push(`${i2}<kerning ${kp.join(' ')} />`)
  }
  lines.push(`${i1}</kernings>`)
  lines.push('</font>')
  return lines.join('\n')
}
