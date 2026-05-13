import type { BitmapFontChar, BitmapFontModel } from './types'
import { charAtlasPage } from './types'

/** Quote a page file path for BMFont .fnt text lines when it contains spaces. */
function fntQuotedFile(file: string): string {
  if (/[\s"]/.test(file)) return `"${file.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  return file
}

function fntInfoLine(model: BitmapFontModel): string {
  const { info } = model
  const parts: string[] = [`face="${info.face}"`, `size=${info.size}`]
  if (info.bold !== undefined) parts.push(`bold=${info.bold}`)
  if (info.italic !== undefined) parts.push(`italic=${info.italic}`)
  const charset = (info.charset ?? '').replace(/"/g, '\\"')
  parts.push(`charset="${charset}"`)
  if (info.unicode !== undefined) parts.push(`unicode=${info.unicode}`)
  if (info.stretchH !== undefined) parts.push(`stretchH=${info.stretchH}`)
  if (info.smooth !== undefined) parts.push(`smooth=${info.smooth}`)
  if (info.aa !== undefined) parts.push(`aa=${info.aa}`)
  if (info.padding !== undefined) parts.push(`padding=${info.padding}`)
  if (info.spacing !== undefined) parts.push(`spacing=${info.spacing}`)
  if (info.outline !== undefined) parts.push(`outline=${info.outline}`)
  return `info ${parts.join(' ')}`
}

function fntCommonLine(model: BitmapFontModel): string {
  const { common } = model
  const parts: string[] = [
    `lineHeight=${common.lineHeight}`,
    `base=${common.base ?? Math.round(common.lineHeight * 0.8)}`,
    `scaleW=${common.scaleW}`,
    `scaleH=${common.scaleH}`,
    `pages=${common.pages}`,
    `packed=${common.packed ?? 0}`,
    `alphaChnl=${common.alphaChnl ?? 0}`,
    `redChnl=${common.redChnl ?? 0}`,
    `greenChnl=${common.greenChnl ?? 0}`,
    `blueChnl=${common.blueChnl ?? 0}`,
  ]
  return `common ${parts.join(' ')}`
}

function fntCharLine(c: BitmapFontChar, multiPage: boolean): string {
  const p = charAtlasPage(c)
  const parts: string[] = [
    `id=${c.id}`,
    `x=${c.x}`,
    `y=${c.y}`,
    `width=${c.width}`,
    `height=${c.height}`,
    `xoffset=${c.xoffset}`,
    `yoffset=${c.yoffset}`,
    `xadvance=${c.xadvance}`,
  ]
  if (multiPage || p !== 0 || c.page !== undefined) parts.push(`page=${p}`)
  if (c.chnl !== undefined) parts.push(`chnl=${c.chnl}`)
  return `char ${parts.join(' ')}`
}

/** Serialize model to BMFont ASCII (.fnt text) format. */
export function serializeBitmapFontText(model: BitmapFontModel): string {
  const lines: string[] = []
  lines.push(fntInfoLine(model))
  lines.push(fntCommonLine(model))
  for (const p of model.pages) {
    lines.push(`page id=${p.id} file=${fntQuotedFile(p.file)}`)
  }
  lines.push(`chars count=${model.chars.length}`)
  const multiPage = model.pages.length > 1
  for (const c of model.chars) {
    lines.push(fntCharLine(c, multiPage))
  }
  lines.push(`kernings count=${model.kernings.length}`)
  for (const k of model.kernings) {
    lines.push(`kerning first=${k.first} second=${k.second} amount=${k.amount}`)
  }
  return lines.join('\n')
}
