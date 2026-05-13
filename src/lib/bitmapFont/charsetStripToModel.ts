import { alphaBBoxInRect, columnMaxAlpha, padBBox, rowHasInk } from './alphaImage'
import type { AlphaBBox } from './alphaImage'
import type { BitmapFontChar, BitmapFontModel } from './types'
import { defaultBitmapFontModel } from './types'

export type CharsetStripOptions = {
  alphaThreshold: number
  /** Minimum width in pixels of “empty” columns between glyph blobs on one row. */
  minGapPx: number
  /** Rows separated by more than this many blank rows start a new band. */
  minRowGapPx: number
  trimPadPx: number
  /** BMFont page texture file name (usually matches exported PNG). */
  pageFile: string
  face: string
  /** Horizontal advance for synthetic U+0020 when space is in charset but not drawn. */
  spaceAdvancePx: number
  /** 1×1 transparent pixel used for synthetic space UV (default bottom-right). */
  spaceAnchor?: { x: number; y: number }
  /**
   * When charset expects U+002E (.) or U+002C (,), infer the glyph from ink shape and
   * swap ids if the strip visually matches the other punctuation (common locale mix-ups).
   */
  swapDotCommaByShape?: boolean
}

export type CharsetStripSuccess = {
  ok: true
  model: BitmapFontModel
  warnings: string[]
}

export type CharsetStripFailure = {
  ok: false
  error: string
  warnings: string[]
}

export type CharsetStripResult = CharsetStripSuccess | CharsetStripFailure

const SPACE = 0x20
const COMMA = 0x2c
const PERIOD = 0x2e

/** Exported for tests — comma-shaped ink usually has positive (meanY − medianY) / height (descender tail). */
export function classifyCommaOrPeriodInk(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  alphaThreshold: number
): 'comma' | 'period' | 'ambiguous' {
  const ys: number[] = []
  let sumY = 0
  let minX = Infinity
  let maxX = -1
  let minY = Infinity
  let maxY = -1
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (data[(y * w + x) * 4 + 3] <= alphaThreshold) continue
      sumY += y
      ys.push(y)
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  const n = ys.length
  if (n < 8 || minY > maxY || minX > maxX) return 'ambiguous'

  ys.sort((a, b) => a - b)
  const medianY = ys[Math.floor(n * 0.5)]!
  const meanY = sumY / n
  const bh = maxY - minY + 1
  const bw = maxX - minX + 1
  if (bh < 3 || bw < 2) return 'ambiguous'

  const skewNorm = (meanY - medianY) / bh
  const centroidNorm = (meanY - minY) / bh
  const aspect = bh / Math.max(1, bw)

  const commaLike = skewNorm >= 0.055 || centroidNorm >= 0.58 || (skewNorm >= 0.03 && aspect >= 1.18)
  const periodLike = skewNorm <= 0.028 && aspect <= 1.22 && centroidNorm <= 0.54

  if (commaLike && !periodLike) return 'comma'
  if (periodLike && !commaLike) return 'period'
  if (commaLike && periodLike) return skewNorm >= 0.04 ? 'comma' : 'period'
  return 'ambiguous'
}

function resolveDotCommaId(
  declaredId: number,
  data: Uint8ClampedArray,
  w: number,
  h: number,
  b: Blob,
  alphaThreshold: number,
  warnings: string[]
): number {
  if (declaredId !== COMMA && declaredId !== PERIOD) return declaredId
  const guess = classifyCommaOrPeriodInk(data, w, h, b.x0, b.y0, b.x1, b.y1, alphaThreshold)
  if (guess === 'ambiguous') return declaredId

  const visualComma = guess === 'comma'
  const wantComma = declaredId === COMMA
  if (visualComma === wantComma) return declaredId

  const resolved = wantComma ? PERIOD : COMMA
  const from = wantComma ? 'U+002C (comma)' : 'U+002E (period)'
  const to = visualComma ? 'U+002C (comma)' : 'U+002E (period)'
  warnings.push(`Glyph shape suggests ${to} but charset had ${from} — using ${to}.`)
  return resolved
}

function codepoints(charset: string): { chars: string[]; ids: number[] } {
  const chars = [...charset]
  const ids = chars.map((ch) => ch.codePointAt(0)!)
  return { chars, ids }
}

type Blob = { x0: number; x1: number; y0: number; y1: number }

function findRowBands(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  alphaThreshold: number,
  minRowGapPx: number
): { y0: number; y1: number }[] {
  const inkRows: number[] = []
  for (let y = 0; y < h; y++) {
    if (rowHasInk(data, w, h, y, alphaThreshold)) inkRows.push(y)
  }
  if (inkRows.length === 0) return []
  const bands: { y0: number; y1: number }[] = []
  let start = inkRows[0]!
  let prev = inkRows[0]!
  for (let i = 1; i < inkRows.length; i++) {
    const y = inkRows[i]!
    if (y - prev > minRowGapPx) {
      bands.push({ y0: start, y1: prev })
      start = y
    }
    prev = y
  }
  bands.push({ y0: start, y1: prev })
  return bands
}

function columnRunsInBand(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  bandY0: number,
  bandY1: number,
  alphaThreshold: number,
  minGapPx: number
): { x0: number; x1: number }[] {
  const colInk: boolean[] = []
  for (let x = 0; x < w; x++) {
    colInk.push(columnMaxAlpha(data, w, h, x, bandY0, bandY1) > alphaThreshold)
  }
  const runs: { x0: number; x1: number }[] = []
  let runStart: number | null = null
  let gapStart: number | null = null

  const flushRun = (endX: number) => {
    if (runStart !== null) {
      runs.push({ x0: runStart, x1: endX })
      runStart = null
    }
    gapStart = null
  }

  for (let x = 0; x < w; x++) {
    const ink = colInk[x]!
    if (ink) {
      if (runStart === null) {
        runStart = x
        gapStart = null
      } else if (gapStart !== null) {
        const gapLen = x - gapStart
        if (gapLen >= minGapPx) {
          flushRun(x - gapLen - 1)
          runStart = x
        }
        gapStart = null
      }
    } else if (runStart !== null) {
      if (gapStart === null) gapStart = x
    }
  }
  if (runStart !== null) {
    runs.push({ x0: runStart, x1: w - 1 })
  }
  return runs
}

function blobTightBBox(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  run: { x0: number; x1: number },
  bandY0: number,
  bandY1: number,
  alphaThreshold: number,
  trimPadPx: number
): AlphaBBox | null {
  const inner = alphaBBoxInRect(data, w, h, run.x0, bandY0, run.x1, bandY1, alphaThreshold)
  if (!inner) return null
  return padBBox(inner, trimPadPx, w, h)
}

/**
 * Build a BMFont model from a styled charset image (e.g. Photoshop export): one or more rows
 * of characters, left-to-right within each row, rows top-to-bottom matching charset order.
 */
export function charsetStripToModel(imageData: ImageData, charset: string, opts: CharsetStripOptions): CharsetStripResult {
  const warnings: string[] = []
  const w = imageData.width
  const h = imageData.height
  const data = imageData.data

  if (!charset.trim()) {
    return { ok: false, error: 'Charset is empty.', warnings }
  }

  const { chars: charStrings, ids: charIds } = codepoints(charset)
  const bands = findRowBands(data, w, h, opts.alphaThreshold, opts.minRowGapPx)
  if (bands.length === 0) {
    return { ok: false, error: 'No opaque pixels found — check alpha threshold or use a PNG with transparency.', warnings }
  }

  const blobs: Blob[] = []
  for (const band of bands) {
    const runs = columnRunsInBand(data, w, h, band.y0, band.y1, opts.alphaThreshold, opts.minGapPx)
    for (const run of runs) {
      const tight = blobTightBBox(data, w, h, run, band.y0, band.y1, opts.alphaThreshold, opts.trimPadPx)
      if (!tight || tight.width < 1 || tight.height < 1) continue
      blobs.push({ x0: tight.x, x1: tight.x + tight.width - 1, y0: tight.y, y1: tight.y + tight.height - 1 })
    }
  }

  blobs.sort((a, b) => {
    const cy = (a.y0 + a.y1) * 0.5
    const dy = (b.y0 + b.y1) * 0.5
    if (Math.abs(cy - dy) > 1) return cy - dy
    return a.x0 - b.x0
  })

  const spaceAnchor = opts.spaceAnchor ?? { x: Math.max(0, w - 1), y: Math.max(0, h - 1) }
  const swapDotComma = opts.swapDotCommaByShape !== false

  const charsOut: BitmapFontChar[] = []
  let bi = 0
  for (let i = 0; i < charStrings.length; i++) {
    const ch = charStrings[i]!
    const id = charIds[i]!
    if (id === SPACE) {
      charsOut.push({
        id: SPACE,
        x: spaceAnchor.x,
        y: spaceAnchor.y,
        width: 1,
        height: 1,
        xoffset: 0,
        yoffset: 0,
        xadvance: Math.max(1, Math.round(opts.spaceAdvancePx)),
      })
      continue
    }
    if (bi >= blobs.length) {
      return {
        ok: false,
        error: `Ran out of detected glyph regions (${blobs.length}) before end of charset (${charStrings.length} code points). Missing ink for "${ch}" (U+${id.toString(16)}).`,
        warnings,
      }
    }
    const b = blobs[bi]!
    bi++
    const width = b.x1 - b.x0 + 1
    const height = b.y1 - b.y0 + 1
    const resolvedId = swapDotComma ? resolveDotCommaId(id, data, w, h, b, opts.alphaThreshold, warnings) : id
    charsOut.push({
      id: resolvedId,
      x: b.x0,
      y: b.y0,
      width,
      height,
      xoffset: 0,
      yoffset: 0,
      xadvance: width,
    })
  }

  if (bi < blobs.length) {
    return {
      ok: false,
      error: `More glyph regions detected (${blobs.length}) than characters in charset (${charStrings.length}). Remove extras from the image or extend the charset string.`,
      warnings,
    }
  }

  let maxH = 0
  for (const c of charsOut) {
    if (c.id !== SPACE && c.height > maxH) maxH = c.height
  }
  if (maxH <= 0) maxH = 1
  const lineHeight = Math.ceil(maxH * 1.2)

  const base = defaultBitmapFontModel()
  const model: BitmapFontModel = {
    ...base,
    info: { face: opts.face, size: lineHeight },
    common: {
      ...base.common,
      lineHeight,
      scaleW: w,
      scaleH: h,
      pages: 1,
    },
    pages: [{ id: 0, file: opts.pageFile }],
    chars: charsOut,
    kernings: [],
  }

  if (charStrings.some((c) => c.codePointAt(0) === SPACE)) {
    warnings.push('Space (U+0020) uses a 1×1 atlas anchor and xadvance only — it is not sliced from ink.')
  }

  return { ok: true, model, warnings }
}
