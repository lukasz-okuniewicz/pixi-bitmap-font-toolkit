import { describe, expect, it } from 'vitest'

import {
  detectHorizontalStripLayout,
  isPowerOfTwo,
  isSquarePowerOfTwoAtlas,
  nextPowerOfTwo,
  planSquarePo2Pack,
  shouldDefaultEnableAtlasRepack,
} from '../atlasRepackUtils'
import { bitmapFontDiagnostics } from '../bitmapFontDiagnostics'
import { repackBitmapFontAtlasToPowerOfTwoSquare } from '../bitmapFontAtlasRepack'
import type { BitmapFontChar, BitmapFontModel } from '../types'
import { defaultBitmapFontModel } from '../types'

function char(
  id: number,
  x: number,
  y: number,
  w: number,
  h: number,
  page = 0
): BitmapFontChar {
  return { id, x, y, width: w, height: h, xoffset: 0, yoffset: 0, xadvance: w, page }
}

function stripModel(): BitmapFontModel {
  const m = defaultBitmapFontModel()
  m.common = { lineHeight: 32, scaleW: 512, scaleH: 64, pages: 1 }
  m.pages = [{ id: 0, file: 'strip.png' }]
  m.chars = [
    char(65, 8, 12, 24, 28),
    char(66, 40, 12, 24, 28),
    char(67, 72, 12, 24, 28),
    char(68, 104, 12, 24, 28),
  ]
  return m
}

function squarePo2GridModel(): BitmapFontModel {
  const m = defaultBitmapFontModel()
  m.common = { lineHeight: 32, scaleW: 256, scaleH: 256, pages: 1 }
  m.pages = [{ id: 0, file: 'grid.png' }]
  m.chars = [
    char(65, 8, 8, 24, 24),
    char(66, 40, 8, 24, 24),
    char(67, 8, 40, 24, 24),
    char(68, 40, 40, 24, 24),
  ]
  return m
}

describe('isPowerOfTwo', () => {
  it('returns true for powers of two', () => {
    expect(isPowerOfTwo(1)).toBe(true)
    expect(isPowerOfTwo(256)).toBe(true)
  })

  it('returns false for non-powers and invalid values', () => {
    expect(isPowerOfTwo(0)).toBe(false)
    expect(isPowerOfTwo(257)).toBe(false)
    expect(isPowerOfTwo(512)).toBe(true)
  })
})

describe('nextPowerOfTwo', () => {
  it('returns smallest power of two >= value', () => {
    expect(nextPowerOfTwo(1)).toBe(1)
    expect(nextPowerOfTwo(257)).toBe(512)
    expect(nextPowerOfTwo(256)).toBe(256)
  })
})

describe('shouldDefaultEnableAtlasRepack', () => {
  it('returns true for horizontal non-power-of-two strip', () => {
    expect(shouldDefaultEnableAtlasRepack(stripModel())).toBe(true)
    expect(detectHorizontalStripLayout(stripModel())).toBe(true)
  })

  it('returns false for square power-of-two grid atlas', () => {
    expect(shouldDefaultEnableAtlasRepack(squarePo2GridModel())).toBe(false)
    expect(isSquarePowerOfTwoAtlas(256, 256)).toBe(true)
  })
})

describe('planSquarePo2Pack', () => {
  it('produces a square power-of-two side', () => {
    const plan = planSquarePo2Pack(stripModel().chars, 2)
    expect(isPowerOfTwo(plan.side)).toBe(true)
    expect(plan.side).toBeGreaterThanOrEqual(Math.max(plan.packedWidth, plan.packedHeight))
  })
})

function canvasHas2d(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const ctx = document.createElement('canvas').getContext('2d')
    return !!ctx && typeof ctx.drawImage === 'function' && typeof ctx.fillRect === 'function'
  } catch {
    return false
  }
}

function makeAtlasCanvas(
  w: number,
  h: number,
  rects: { x: number; y: number; gw: number; gh: number; fill: string }[]
): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, w, h)
  for (const r of rects) {
    ctx.fillStyle = r.fill
    ctx.fillRect(r.x, r.y, r.gw, r.gh)
  }
  return c
}

describe('repackBitmapFontAtlasToPowerOfTwoSquare', () => {
  it('preserves glyph metrics and updates atlas rects', async () => {
    if (!canvasHas2d()) return

    const model = stripModel()
    const atlas = makeAtlasCanvas(512, 64, [
      { x: 8, y: 12, gw: 24, gh: 28, fill: 'rgba(255,255,255,1)' },
      { x: 40, y: 12, gw: 24, gh: 28, fill: 'rgba(255,255,255,1)' },
      { x: 72, y: 12, gw: 24, gh: 28, fill: 'rgba(255,255,255,1)' },
      { x: 104, y: 12, gw: 24, gh: 28, fill: 'rgba(255,255,255,1)' },
    ])

    const result = await repackBitmapFontAtlasToPowerOfTwoSquare(model, [
      { pageId: 0, image: atlas, width: 512, height: 64 },
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.model.chars).toHaveLength(model.chars.length)
    expect(result.model.common.scaleW).toBe(result.model.common.scaleH)
    expect(isSquarePowerOfTwoAtlas(result.model.common.scaleW, result.model.common.scaleH)).toBe(true)
    expect(result.model.kernings).toEqual(model.kernings)

    for (const orig of model.chars) {
      const next = result.model.chars.find((c) => c.id === orig.id)!
      expect(next.xoffset).toBe(orig.xoffset)
      expect(next.yoffset).toBe(orig.yoffset)
      expect(next.xadvance).toBe(orig.xadvance)
      expect(next.width).toBe(orig.width)
      expect(next.height).toBe(orig.height)
      expect(next.x).not.toBe(orig.x)
    }

    const diags = bitmapFontDiagnostics(result.model)
    expect(diags.some((d) => d.code === 'glyph_outside_atlas')).toBe(false)

    const sw = result.model.common.scaleW
    const sh = result.model.common.scaleH
    for (const c of result.model.chars) {
      if (c.width <= 0 || c.height <= 0) continue
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.x + c.width).toBeLessThanOrEqual(sw)
      expect(c.y + c.height).toBeLessThanOrEqual(sh)
    }

    const png = result.pngBytesByPageId.get(0)
    expect(png).toBeDefined()
    expect(png!.length).toBeGreaterThan(0)
  })

  it('exports multi-page fonts at a shared square size', async () => {
    if (!canvasHas2d()) return

    const m = defaultBitmapFontModel()
    m.common = { lineHeight: 16, scaleW: 64, scaleH: 64, pages: 2 }
    m.pages = [
      { id: 0, file: 'p0.png' },
      { id: 1, file: 'p1.png' },
    ]
    m.chars = [char(65, 4, 4, 8, 8, 0), char(66, 4, 4, 8, 8, 1)]

    const page0 = makeAtlasCanvas(64, 64, [{ x: 4, y: 4, gw: 8, gh: 8, fill: '#fff' }])
    const page1 = makeAtlasCanvas(64, 64, [{ x: 4, y: 4, gw: 8, gh: 8, fill: '#fff' }])

    const result = await repackBitmapFontAtlasToPowerOfTwoSquare(m, [
      { pageId: 0, image: page0, width: 64, height: 64 },
      { pageId: 1, image: page1, width: 64, height: 64 },
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const b0 = result.pngBytesByPageId.get(0)
    const b1 = result.pngBytesByPageId.get(1)
    expect(b0).toBeDefined()
    expect(b1).toBeDefined()
    expect(result.model.common.scaleW).toBe(result.model.common.scaleH)

    const img0 = await pngDimensions(b0!)
    const img1 = await pngDimensions(b1!)
    expect(img0.width).toBe(result.model.common.scaleW)
    expect(img0.height).toBe(result.model.common.scaleH)
    expect(img1.width).toBe(result.model.common.scaleW)
    expect(img1.height).toBe(result.model.common.scaleH)
  })
})

function pngDimensions(bytes: Uint8Array): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(img.src)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => reject(new Error('Failed to decode PNG'))
    img.src = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
  })
}
