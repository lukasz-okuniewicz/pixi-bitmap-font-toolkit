import { alphaBBoxInRect } from './alphaImage'
import type { BitmapFontChar, BitmapFontModel } from './types'
import { defaultBitmapFontModel } from './types'

export type RasterizeFontOptions = {
  sizePx: number
  charset: string
  fillStyle: string
  paddingPx: number
  atlasMaxWidth: number
  face: string
  pageFile: string
  /** Extra horizontal advance after measured width (per glyph). */
  letterSpacingPx?: number
}

export type RasterizeFontSuccess = {
  ok: true
  model: BitmapFontModel
  pngBlob: Blob
  warnings: string[]
  /** Call `document.fonts.delete(face)` when done if registered. */
  fontFace: FontFace
}

export type RasterizeFontFailure = {
  ok: false
  error: string
  warnings: string[]
}

export type RasterizeFontResult = RasterizeFontSuccess | RasterizeFontFailure

type GlyphWork = {
  id: number
  ch: string
  sw: number
  sh: number
  /** Left bearing within scratch (pixels). */
  sx: number
  sy: number
  xadvance: number
  canvas: HTMLCanvasElement
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    throw new Error('rasterizeFontToModel requires a browser DOM (document).')
  }
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w))
  c.height = Math.max(1, Math.ceil(h))
  return c
}

function uniqueFontFamily(): string {
  const r = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`
  return `PixiShoeboxGen_${r}`
}

function uniqueCodepointsInOrder(charset: string): { chars: string[]; droppedDuplicates: number } {
  const seen = new Set<number>()
  const chars: string[] = []
  for (const ch of [...charset]) {
    const id = ch.codePointAt(0)!
    if (seen.has(id)) continue
    seen.add(id)
    chars.push(ch)
  }
  const dropped = [...charset].length - chars.length
  return { chars, droppedDuplicates: dropped }
}

/**
 * Rasterize each code point in `charset` using a loaded webfont (`FontFace`), pack into a PNG atlas,
 * and build a `BitmapFontModel` (kernings empty).
 */
export async function rasterizeFontToModel(
  fontBuffer: ArrayBuffer,
  _sourceFileName: string,
  opts: RasterizeFontOptions
): Promise<RasterizeFontResult> {
  const warnings: string[] = []
  if (typeof FontFace === 'undefined') {
    return { ok: false, error: 'FontFace API is not available in this environment.', warnings }
  }
  if (!opts.charset.trim()) {
    return { ok: false, error: 'Charset is empty.', warnings }
  }

  const { chars: codepoints, droppedDuplicates } = uniqueCodepointsInOrder(opts.charset)
  if (droppedDuplicates > 0) {
    warnings.push(`Removed ${droppedDuplicates} duplicate code point(s); each glyph id appears once in the atlas.`)
  }

  const family = uniqueFontFamily()
  const fontFace = new FontFace(family, fontBuffer)
  try {
    await fontFace.load()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `Failed to load font: ${msg}`, warnings }
  }
  document.fonts.add(fontFace)
  await document.fonts.ready

  const pad = Math.max(0, opts.paddingPx)
  const letterExtra = Math.max(0, opts.letterSpacingPx ?? 0)
  const size = Math.max(1, Math.round(opts.sizePx))
  const maxW = Math.max(32, Math.round(opts.atlasMaxWidth))

  const works: GlyphWork[] = []

  let maxAsc = 0
  let maxDesc = 0

  for (const ch of codepoints) {
    const id = ch.codePointAt(0)!
    const scratch = makeCanvas(size * 3, size * 3)
    const ctx = scratch.getContext('2d')
    if (!ctx) {
      document.fonts.delete(fontFace)
      return { ok: false, error: 'Canvas 2D context unavailable.', warnings }
    }
    ctx.clearRect(0, 0, scratch.width, scratch.height)
    ctx.font = `${size}px "${family}"`
    ctx.fillStyle = opts.fillStyle
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    const m = ctx.measureText(ch)
    const asc = m.actualBoundingBoxAscent ?? size * 0.72
    const desc = m.actualBoundingBoxDescent ?? size * 0.22
    const left = m.actualBoundingBoxLeft ?? 0
    const right = m.actualBoundingBoxRight ?? Math.max(m.width, left + 1)
    const gw = Math.max(1, Math.ceil(right - left) + pad * 2)
    const gh = Math.max(1, Math.ceil(asc + desc) + pad * 2)
    const ox = pad - left
    const oy = pad + asc
    scratch.width = gw
    scratch.height = gh
    ctx.font = `${size}px "${family}"`
    ctx.fillStyle = opts.fillStyle
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    ctx.clearRect(0, 0, gw, gh)
    ctx.fillText(ch, ox, oy)

    const img = ctx.getImageData(0, 0, gw, gh)
    const bbox = alphaBBoxInRect(img.data, gw, gh, 0, 0, gw - 1, gh - 1, 1)
    let sx = 0
    let sy = 0
    let sw = 1
    let sh = 1
    if (!bbox || bbox.width < 1 || bbox.height < 1) {
      warnings.push(`No ink for "${ch}" (U+${id.toString(16)}) — using 1×1 placeholder.`)
      sx = 0
      sy = 0
      sw = 1
      sh = 1
    } else {
      sx = bbox.x
      sy = bbox.y
      sw = bbox.width
      sh = bbox.height
    }

    const adv = Math.max(1, Math.ceil(m.width) + letterExtra)

    const slice = makeCanvas(sw, sh)
    const sctx = slice.getContext('2d')!
    if (bbox && bbox.width >= 1 && bbox.height >= 1) {
      sctx.drawImage(scratch, sx, sy, sw, sh, 0, 0, sw, sh)
    } else {
      sctx.clearRect(0, 0, sw, sh)
    }

    works.push({
      id,
      ch,
      sw,
      sh,
      sx: 0,
      sy: 0,
      xadvance: id === 0x20 ? Math.max(adv, Math.ceil(m.width) || 4) : adv,
      canvas: slice,
    })

    if (asc > maxAsc) maxAsc = asc
    if (desc > maxDesc) maxDesc = desc
  }

  const lineHeight = Math.ceil((maxAsc + maxDesc) * 1.15 + pad * 2)

  let atlasW = pad * 2
  let atlasH = pad * 2

  type Placed = GlyphWork & { dx: number; dy: number }
  const placed: Placed[] = []

  type FreeRect = { x: number; y: number; w: number; h: number }
  const innerW = Math.max(16, maxW - pad * 2)
  let freeList: FreeRect[] = [{ x: pad, y: pad, w: innerW, h: 500000 }]
  const sortedWorks = [...works].sort((a, b) => Math.max(b.sw, b.sh) - Math.max(a.sw, a.sh))

  for (const w of sortedWorks) {
    const needW = w.sw + pad
    const needH = w.sh + pad
    let done = false
    let guard = 0
    while (!done && guard < 8000) {
      guard++
      freeList.sort((a, b) => a.y - b.y || a.x - b.x)
      const fi = freeList.findIndex((f) => f.w >= needW && f.h >= needH)
      if (fi >= 0) {
        const f = freeList[fi]!
        freeList = freeList.filter((_, i) => i !== fi)
        placed.push({ ...w, dx: f.x, dy: f.y })
        const right: FreeRect = { x: f.x + needW, y: f.y, w: f.w - needW, h: f.h }
        const bottom: FreeRect = { x: f.x, y: f.y + needH, w: needW, h: f.h - needH }
        if (right.w > 1 && right.h > 1) freeList.push(right)
        if (bottom.w > 1 && bottom.h > 1) freeList.push(bottom)
        done = true
      } else {
        const maxBottom = placed.length === 0 ? pad : Math.max(...placed.map((p) => p.dy + p.sh + pad))
        freeList.push({ x: pad, y: maxBottom, w: innerW, h: 500000 })
      }
    }
  }

  for (const p of placed) {
    atlasW = Math.max(atlasW, p.dx + p.sw + pad)
    atlasH = Math.max(atlasH, p.dy + p.sh + pad)
  }

  const atlas = makeCanvas(atlasW, atlasH)
  const actx = atlas.getContext('2d')!
  actx.clearRect(0, 0, atlasW, atlasH)

  const chars: BitmapFontChar[] = []
  for (const p of placed) {
    actx.drawImage(p.canvas, p.dx, p.dy)
    chars.push({
      id: p.id,
      x: p.dx,
      y: p.dy,
      width: p.sw,
      height: p.sh,
      xoffset: 0,
      yoffset: 0,
      xadvance: p.xadvance,
    })
  }

  const pngBlob: Blob = await new Promise((resolve, reject) => {
    atlas.toBlob(
      (b) => {
        if (b) resolve(b)
        else reject(new Error('toBlob failed'))
      },
      'image/png',
      1
    )
  })

  const base = defaultBitmapFontModel()
  const model: BitmapFontModel = {
    ...base,
    info: { face: opts.face, size },
    common: {
      ...base.common,
      lineHeight,
      scaleW: atlasW,
      scaleH: atlasH,
      pages: 1,
    },
    pages: [{ id: 0, file: opts.pageFile }],
    chars,
    kernings: [],
  }

  return { ok: true, model, pngBlob, warnings, fontFace }
}
