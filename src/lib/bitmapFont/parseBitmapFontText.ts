import { numAttr, parseKeyValueLine } from './parseAttrs'
import type { BitmapFontChar, BitmapFontModel } from './types'
import { decomposeGlobalXAdvanceFromChars, defaultBitmapFontModel } from './types'

/** Parse BMFont ASCII/text (.fnt) format. */
export function parseBitmapFontText(text: string): BitmapFontModel {
  const lines = text.split(/\r?\n/)
  const model = defaultBitmapFontModel()
  model.chars = []
  model.kernings = []
  model.pages = []

  for (const lineRaw of lines) {
    const line = lineRaw.trim()
    if (!line) continue

    if (line.startsWith('info ')) {
      const kv = parseKeyValueLine(line)
      if (kv.face != null) model.info.face = kv.face
      const sz = kv.size != null ? numAttr(kv.size, model.info.size) : model.info.size
      model.info.size = sz
      if (kv.bold != null && kv.bold !== '') model.info.bold = numAttr(kv.bold, 0)
      if (kv.italic != null && kv.italic !== '') model.info.italic = numAttr(kv.italic, 0)
      if (kv.charset !== undefined) model.info.charset = kv.charset
      if (kv.unicode != null && kv.unicode !== '') model.info.unicode = numAttr(kv.unicode, 0)
      if (kv.stretchH != null && kv.stretchH !== '') model.info.stretchH = numAttr(kv.stretchH, 100)
      if (kv.smooth != null && kv.smooth !== '') model.info.smooth = numAttr(kv.smooth, 0)
      if (kv.aa != null && kv.aa !== '') model.info.aa = numAttr(kv.aa, 0)
      if (kv.padding !== undefined) model.info.padding = kv.padding
      if (kv.spacing !== undefined) model.info.spacing = kv.spacing
      if (kv.outline != null && kv.outline !== '') model.info.outline = numAttr(kv.outline, 0)
    } else if (line.startsWith('common ')) {
      const kv = parseKeyValueLine(line)
      model.common.lineHeight = numAttr(kv.lineHeight, model.common.lineHeight)
      model.common.scaleW = numAttr(kv.scaleW, model.common.scaleW)
      model.common.scaleH = numAttr(kv.scaleH, model.common.scaleH)
      model.common.pages = numAttr(kv.pages, model.common.pages)
      if (kv.base != null && kv.base !== '') model.common.base = numAttr(kv.base, 0)
      if (kv.packed != null && kv.packed !== '') model.common.packed = numAttr(kv.packed, 0)
      if (kv.alphaChnl != null && kv.alphaChnl !== '') model.common.alphaChnl = numAttr(kv.alphaChnl, 0)
      if (kv.redChnl != null && kv.redChnl !== '') model.common.redChnl = numAttr(kv.redChnl, 0)
      if (kv.greenChnl != null && kv.greenChnl !== '') model.common.greenChnl = numAttr(kv.greenChnl, 0)
      if (kv.blueChnl != null && kv.blueChnl !== '') model.common.blueChnl = numAttr(kv.blueChnl, 0)
      if (kv.globalXAdvance != null && kv.globalXAdvance !== '') model.common.globalXAdvance = numAttr(kv.globalXAdvance, 0)
      else delete model.common.globalXAdvance
    } else if (line.startsWith('page ')) {
      const kv = parseKeyValueLine(line)
      model.pages.push({
        id: numAttr(kv.id, model.pages.length),
        file: (kv.file ?? '').trim(),
      })
    } else if (line.startsWith('chars ')) {
      // count is informational
    } else if (line.startsWith('char ')) {
      const kv = parseKeyValueLine(line)
      const ch: BitmapFontChar = {
        id: numAttr(kv.id, 0),
        x: numAttr(kv.x, 0),
        y: numAttr(kv.y, 0),
        width: numAttr(kv.width, 0),
        height: numAttr(kv.height, 0),
        xoffset: numAttr(kv.xoffset, 0),
        yoffset: numAttr(kv.yoffset, 0),
        xadvance: numAttr(kv.xadvance, 0),
      }
      if (kv.page != null && kv.page !== '') ch.page = numAttr(kv.page, 0)
      if (kv.chnl != null && kv.chnl !== '') ch.chnl = numAttr(kv.chnl, 0)
      model.chars.push(ch)
    } else if (line.startsWith('kernings ')) {
      // ignore count
    } else if (line.startsWith('kerning ')) {
      const kv = parseKeyValueLine(line)
      model.kernings.push({
        first: numAttr(kv.first, 0),
        second: numAttr(kv.second, 0),
        amount: numAttr(kv.amount, 0),
      })
    }
  }

  if (model.pages.length === 0) {
    model.pages = [{ id: 0, file: '' }]
    model.common.pages = Math.max(1, model.common.pages)
  }

  decomposeGlobalXAdvanceFromChars(model)

  return model
}
