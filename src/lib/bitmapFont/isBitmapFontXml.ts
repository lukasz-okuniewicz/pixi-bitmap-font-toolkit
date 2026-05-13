export type BitmapFontSourceKind = 'xml' | 'fnt-text' | 'unknown'

export type BitmapFontDetectResult = {
  isBitmapFont: boolean
  kind: BitmapFontSourceKind
}

/** XML local name (handles prefixed tags e.g. bmfont:font). */
function xmlLocalName(el: Element | null): string {
  if (!el) return ''
  if (el.localName) return el.localName.toLowerCase()
  const n = el.nodeName
  const i = n.indexOf(':')
  return (i >= 0 ? n.slice(i + 1) : n).toLowerCase()
}

function hasFontRoot(doc: Document): boolean {
  const root = doc.documentElement
  if (!root || xmlLocalName(root) !== 'font') return false

  let chars = root.querySelector('chars')
  if (!chars) {
    const byTag = root.getElementsByTagName('chars')
    if (byTag.length > 0) chars = byTag[0]!
  }
  if (chars) {
    const ch = chars.querySelector('char') ?? chars.getElementsByTagName('char')[0]
    return ch != null
  }
  const direct = root.querySelector('char') ?? root.getElementsByTagName('char')[0]
  return direct != null
}

/** When DOM parsing is quirky, still recognize standard BMFont XML text. */
function looksLikeBmFontXmlMarkup(s: string): boolean {
  const t = s.slice(0, 96 * 1024)
  if (!/<\s*font[\s>]/.test(t)) return false
  if (!/<\s*char[\s>]/.test(t)) return false
  if (!/<\s*info[\s>]/.test(t)) return false
  if (!/<\s*common[\s>]/.test(t)) return false
  return true
}

/** True when the string is BMFont XML (structure), not extension-based. */
export function isBitmapFontXmlString(text: string): BitmapFontDetectResult {
  if (!text || typeof text !== 'string') return { isBitmapFont: false, kind: 'unknown' }

  const trimmed = text.replace(/^\uFEFF/, '').trim()
  if (!trimmed) return { isBitmapFont: false, kind: 'unknown' }

  if (typeof DOMParser === 'undefined') {
    if (looksLikeBmFontXmlMarkup(trimmed)) return { isBitmapFont: true, kind: 'xml' }
    return tryTextFormat(trimmed)
  }

  const doc = new DOMParser().parseFromString(trimmed, 'application/xml')
  const root = doc.documentElement
  const parserErrors = root?.getElementsByTagName('parsererror') ?? []
  if (parserErrors.length > 0) {
    const tf = tryTextFormat(trimmed)
    if (tf.isBitmapFont) return tf
    if (looksLikeBmFontXmlMarkup(trimmed)) return { isBitmapFont: true, kind: 'xml' }
    return { isBitmapFont: false, kind: 'unknown' }
  }
  if (hasFontRoot(doc)) return { isBitmapFont: true, kind: 'xml' }

  const tf = tryTextFormat(trimmed)
  if (tf.isBitmapFont) return tf
  if (looksLikeBmFontXmlMarkup(trimmed)) return { isBitmapFont: true, kind: 'xml' }

  return { isBitmapFont: false, kind: 'unknown' }
}

function tryTextFormat(text: string): BitmapFontDetectResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 3) return { isBitmapFont: false, kind: 'unknown' }

  const hasInfo = lines.some((l) => l.startsWith('info '))
  const hasCommon = lines.some((l) => l.startsWith('common '))
  const hasChar = lines.some((l) => l.startsWith('char '))
  if (!hasInfo || !hasCommon || !hasChar) return { isBitmapFont: false, kind: 'unknown' }

  return { isBitmapFont: true, kind: 'fnt-text' }
}
