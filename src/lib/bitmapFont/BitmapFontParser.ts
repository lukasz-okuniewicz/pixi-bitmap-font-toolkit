import { numAttr } from './parseAttrs'
import { parseBitmapFontText } from './parseBitmapFontText'
import type { BitmapFontChar, BitmapFontKerning, BitmapFontModel, BitmapFontPage } from './types'
import { defaultBitmapFontModel } from './types'
import type { BitmapFontSourceKind } from './isBitmapFontXml'
import { isBitmapFontXmlString } from './isBitmapFontXml'

function readPages(root: Element): BitmapFontPage[] {
  const pagesEl = root.querySelector('pages')
  const list: BitmapFontPage[] = []
  if (pagesEl) {
    pagesEl.querySelectorAll('page').forEach((el) => {
      list.push({
        id: numAttr(el.getAttribute('id'), list.length),
        file: el.getAttribute('file')?.trim() || '',
        extraAttrs: collectExtraAttrs(el, PAGE_ATTRS),
      })
    })
  }
  if (list.length === 0) {
    root.querySelectorAll(':scope > page').forEach((el) => {
      list.push({
        id: numAttr(el.getAttribute('id'), list.length),
        file: el.getAttribute('file')?.trim() || '',
        extraAttrs: collectExtraAttrs(el, PAGE_ATTRS),
      })
    })
  }
  return list
}

function readAttrString(el: Element, name: string): string | undefined {
  const raw = el.getAttribute(name)
  if (raw == null) return undefined
  const t = raw.trim()
  return t === '' ? undefined : t
}

function collectExtraAttrs(el: Element, known: ReadonlySet<string>): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i]!
    if (a.name.startsWith('xmlns') || known.has(a.name)) continue
    out[a.name] = a.value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

const INFO_ATTRS = new Set([
  'face',
  'size',
  'bold',
  'italic',
  'charset',
  'unicode',
  'stretchH',
  'smooth',
  'aa',
  'padding',
  'spacing',
  'outline',
])

const COMMON_ATTRS = new Set([
  'lineHeight',
  'scaleW',
  'scaleH',
  'pages',
  'base',
  'packed',
  'alphaChnl',
  'redChnl',
  'greenChnl',
  'blueChnl',
])

const PAGE_ATTRS = new Set(['id', 'file'])

const CHAR_ATTRS = new Set(['id', 'x', 'y', 'width', 'height', 'xoffset', 'yoffset', 'xadvance', 'page', 'chnl'])

const KERN_ATTRS = new Set(['first', 'second', 'amount'])

function readInfoFromXml(info: Element, model: BitmapFontModel): void {
  model.info.face = readAttrString(info, 'face') ?? model.info.face
  model.info.size = numAttr(info.getAttribute('size'), model.info.size)
  const bold = info.getAttribute('bold')
  if (bold != null && bold !== '') model.info.bold = numAttr(bold, 0)
  const italic = info.getAttribute('italic')
  if (italic != null && italic !== '') model.info.italic = numAttr(italic, 0)
  if (info.hasAttribute('charset')) model.info.charset = info.getAttribute('charset') ?? ''
  const unicode = info.getAttribute('unicode')
  if (unicode != null && unicode !== '') model.info.unicode = numAttr(unicode, 0)
  const stretchH = info.getAttribute('stretchH')
  if (stretchH != null && stretchH !== '') model.info.stretchH = numAttr(stretchH, 100)
  const smooth = info.getAttribute('smooth')
  if (smooth != null && smooth !== '') model.info.smooth = numAttr(smooth, 0)
  const aa = info.getAttribute('aa')
  if (aa != null && aa !== '') model.info.aa = numAttr(aa, 0)
  const padding = readAttrString(info, 'padding')
  if (padding !== undefined) model.info.padding = padding
  const spacing = readAttrString(info, 'spacing')
  if (spacing !== undefined) model.info.spacing = spacing
  const outline = info.getAttribute('outline')
  if (outline != null && outline !== '') model.info.outline = numAttr(outline, 0)
  const ex = collectExtraAttrs(info, INFO_ATTRS)
  if (ex) model.info.extraAttrs = ex
  else delete model.info.extraAttrs
}

function readCommonFromXml(common: Element, model: BitmapFontModel): void {
  model.common.lineHeight = numAttr(common.getAttribute('lineHeight'), model.common.lineHeight)
  model.common.scaleW = numAttr(common.getAttribute('scaleW'), model.common.scaleW)
  model.common.scaleH = numAttr(common.getAttribute('scaleH'), model.common.scaleH)
  model.common.pages = numAttr(common.getAttribute('pages'), model.common.pages)
  const base = common.getAttribute('base')
  if (base != null && base !== '') model.common.base = numAttr(base, 0)
  const packed = common.getAttribute('packed')
  if (packed != null && packed !== '') model.common.packed = numAttr(packed, 0)
  const alphaChnl = common.getAttribute('alphaChnl')
  if (alphaChnl != null && alphaChnl !== '') model.common.alphaChnl = numAttr(alphaChnl, 0)
  const redChnl = common.getAttribute('redChnl')
  if (redChnl != null && redChnl !== '') model.common.redChnl = numAttr(redChnl, 0)
  const greenChnl = common.getAttribute('greenChnl')
  if (greenChnl != null && greenChnl !== '') model.common.greenChnl = numAttr(greenChnl, 0)
  const blueChnl = common.getAttribute('blueChnl')
  if (blueChnl != null && blueChnl !== '') model.common.blueChnl = numAttr(blueChnl, 0)
  const ex = collectExtraAttrs(common, COMMON_ATTRS)
  if (ex) model.common.extraAttrs = ex
  else delete model.common.extraAttrs
}

function readChars(charsRoot: Element | null): BitmapFontChar[] {
  if (!charsRoot) return []
  const out: BitmapFontChar[] = []
  charsRoot.querySelectorAll('char').forEach((el) => {
    const ch: BitmapFontChar = {
      id: numAttr(el.getAttribute('id'), 0),
      x: numAttr(el.getAttribute('x'), 0),
      y: numAttr(el.getAttribute('y'), 0),
      width: numAttr(el.getAttribute('width'), 0),
      height: numAttr(el.getAttribute('height'), 0),
      xoffset: numAttr(el.getAttribute('xoffset'), 0),
      yoffset: numAttr(el.getAttribute('yoffset'), 0),
      xadvance: numAttr(el.getAttribute('xadvance'), 0),
    }
    const pageRaw = el.getAttribute('page')
    if (pageRaw != null && pageRaw !== '') ch.page = numAttr(pageRaw, 0)
    const chnlRaw = el.getAttribute('chnl')
    if (chnlRaw != null && chnlRaw !== '') ch.chnl = numAttr(chnlRaw, 0)
    const ex = collectExtraAttrs(el, CHAR_ATTRS)
    if (ex) ch.extraAttrs = ex
    out.push(ch)
  })
  return out
}

function readKernings(root: Element): BitmapFontKerning[] {
  const kernRoot = root.querySelector('kernings')
  if (!kernRoot) return []
  const out: BitmapFontKerning[] = []
  kernRoot.querySelectorAll('kerning').forEach((el) => {
    const row: BitmapFontKerning = {
      first: numAttr(el.getAttribute('first'), 0),
      second: numAttr(el.getAttribute('second'), 0),
      amount: numAttr(el.getAttribute('amount'), 0),
    }
    const ex = collectExtraAttrs(el, KERN_ATTRS)
    if (ex) row.extraAttrs = ex
    out.push(row)
  })
  return out
}

function xmlParseErrorMessage(doc: Document): string | null {
  const root = doc.documentElement
  if (root?.nodeName === 'parsererror') {
    return root.textContent?.trim().split(/\n/)[0] ?? 'XML parse error'
  }
  const pe = doc.getElementsByTagName('parsererror')[0]
  if (pe) return pe.textContent?.trim().split(/\n/)[0] ?? 'XML parse error'
  return null
}

export function parseBitmapFontXml(xml: string): BitmapFontModel {
  if (typeof DOMParser === 'undefined') throw new Error('DOMParser required')
  const doc = new DOMParser().parseFromString(xml.trim(), 'application/xml')
  const parseErr = xmlParseErrorMessage(doc)
  if (parseErr) {
    throw new Error(`Invalid bitmap font XML: ${parseErr}`)
  }
  const root = doc.documentElement
  if (!root || root.nodeName.toLowerCase() !== 'font') {
    throw new Error('Invalid bitmap font XML: root must be <font>')
  }

  const model = defaultBitmapFontModel()

  const info = root.querySelector('info')
  if (info) readInfoFromXml(info, model)

  const common = root.querySelector('common')
  if (common) readCommonFromXml(common, model)

  model.pages = readPages(root)
  if (model.pages.length === 0) {
    model.pages = [{ id: 0, file: '' }]
    model.common.pages = Math.max(1, model.common.pages)
  }

  const charsEl = root.querySelector('chars')
  model.chars = readChars(charsEl)

  model.kernings = readKernings(root)

  return model
}

export function parseBitmapFont(text: string, kind?: BitmapFontSourceKind): BitmapFontModel {
  if (kind === 'fnt-text') return parseBitmapFontText(text)
  if (kind === 'xml') return parseBitmapFontXml(text)

  const det = isBitmapFontXmlString(text)
  if (!det.isBitmapFont) throw new Error('Not a bitmap font')
  if (det.kind === 'fnt-text') return parseBitmapFontText(text)
  return parseBitmapFontXml(text)
}
