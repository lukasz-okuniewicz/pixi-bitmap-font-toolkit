import type { BitmapFontChar, BitmapFontModel } from './types'

export function isPowerOfTwo(value: number): boolean {
  if (!Number.isFinite(value) || value <= 0) return false
  const n = Math.floor(value)
  return n === value && (n & (n - 1)) === 0
}

export function nextPowerOfTwo(value: number): number {
  let n = Math.max(1, Math.ceil(value))
  if (isPowerOfTwo(n)) return n
  n--
  n |= n >> 1
  n |= n >> 2
  n |= n >> 4
  n |= n >> 8
  n |= n >> 16
  return n + 1
}

export function isSquarePowerOfTwoAtlas(width: number, height: number): boolean {
  return width === height && isPowerOfTwo(width) && isPowerOfTwo(height)
}

export type AtlasSize = { width: number; height: number }

export type GlyphPlacement = {
  char: BitmapFontChar
  x: number
  y: number
}

export type SquarePo2PackPlan = {
  placements: GlyphPlacement[]
  packedWidth: number
  packedHeight: number
  side: number
}

/** Shelf-pack glyphs into rows; `side` is the smallest square power-of-two that fits the tight bounds. */
export function planSquarePo2Pack(chars: BitmapFontChar[], paddingPx: number): SquarePo2PackPlan {
  const pad = Math.max(0, paddingPx)
  const drawable = chars.filter((c) => c.width > 0 && c.height > 0)
  const zeroSize = chars.filter((c) => c.width <= 0 || c.height <= 0)

  if (drawable.length === 0) {
    const side = nextPowerOfTwo(1)
    return {
      placements: zeroSize.map((c) => ({ char: c, x: 0, y: 0 })),
      packedWidth: 0,
      packedHeight: 0,
      side,
    }
  }

  const sorted = [...drawable].sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height))
  let totalArea = 0
  let maxGlyphW = 0
  for (const c of sorted) {
    totalArea += (c.width + pad) * (c.height + pad)
    maxGlyphW = Math.max(maxGlyphW, c.width + pad)
  }

  const rowTarget = Math.max(maxGlyphW, Math.ceil(Math.sqrt(totalArea)))

  const placements: GlyphPlacement[] = []
  let x = 0
  let y = 0
  let rowH = 0
  let packedW = 0
  let packedH = 0

  for (const c of sorted) {
    const needW = c.width + pad
    const needH = c.height + pad
    if (x > 0 && x + needW > rowTarget) {
      y += rowH
      x = 0
      rowH = 0
    }
    placements.push({ char: c, x, y })
    x += needW
    rowH = Math.max(rowH, needH)
    packedW = Math.max(packedW, x)
    packedH = Math.max(packedH, y + needH)
  }

  for (const c of zeroSize) {
    placements.push({ char: c, x: 0, y: 0 })
  }

  const side = nextPowerOfTwo(Math.max(packedW, packedH, 1))
  return { placements, packedWidth: packedW, packedHeight: packedH, side }
}

export function detectHorizontalStripLayout(model: BitmapFontModel): boolean {
  const sw = model.common.scaleW
  const sh = model.common.scaleH
  if (sw <= 0 || sh <= 0) return false

  const glyphs = model.chars.filter((c) => c.width > 0 && c.height > 0)
  if (glyphs.length < 2) return false

  const heights = glyphs.map((c) => c.height).sort((a, b) => a - b)
  const medianH = heights[Math.floor(heights.length / 2)] ?? 1
  const yTolerance = Math.max(2, Math.round(medianH * 0.25))

  const yBuckets = new Map<number, number>()
  for (const c of glyphs) {
    const key = Math.round(c.y / yTolerance) * yTolerance
    yBuckets.set(key, (yBuckets.get(key) ?? 0) + 1)
  }
  let dominantCount = 0
  for (const count of yBuckets.values()) {
    if (count > dominantCount) dominantCount = count
  }
  const dominantRow = dominantCount / glyphs.length >= 0.7
  if (!dominantRow) return false

  const minX = Math.min(...glyphs.map((c) => c.x))
  const maxRight = Math.max(...glyphs.map((c) => c.x + c.width))
  const xSpan = maxRight - minX
  const wideAtlas = sw > sh * 1.25
  const spanCoversAtlas = sw > 0 && xSpan / sw >= 0.6

  return wideAtlas || spanCoversAtlas
}

export function shouldDefaultEnableAtlasRepack(
  model: BitmapFontModel,
  _atlasSizes?: AtlasSize[]
): boolean {
  const sw = model.common.scaleW
  const sh = model.common.scaleH
  if (!isSquarePowerOfTwoAtlas(sw, sh)) return true
  if (detectHorizontalStripLayout(model)) return true
  return false
}
