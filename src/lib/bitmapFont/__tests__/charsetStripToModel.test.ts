import { describe, expect, it } from 'vitest'

import { alphaBBoxInRect } from '../alphaImage'
import { charsetStripToModel, classifyCommaOrPeriodInk } from '../charsetStripToModel'

function rgbaImage(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4)
  return { width: w, height: h, data, colorSpace: 'srgb' } as ImageData
}

function fillRect(data: ImageData, x0: number, y0: number, x1: number, y1: number, a = 255) {
  const { width, height, data: d } = data
  const xa = Math.max(0, x0)
  const ya = Math.max(0, y0)
  const xb = Math.min(width - 1, x1)
  const yb = Math.min(height - 1, y1)
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const i = (y * width + x) * 4
      d[i] = 255
      d[i + 1] = 255
      d[i + 2] = 255
      d[i + 3] = a
    }
  }
}

describe('alphaBBoxInRect', () => {
  it('finds a single opaque block', () => {
    const img = rgbaImage(32, 32)
    fillRect(img, 5, 10, 12, 22)
    const b = alphaBBoxInRect(img.data, 32, 32, 0, 0, 31, 31, 1)
    expect(b).toEqual({ x: 5, y: 10, width: 8, height: 13 })
  })
})

describe('charsetStripToModel', () => {
  it('keeps left-to-right strip order when glyph vertical centers differ by more than 1px', () => {
    const img = rgbaImage(88, 32)
    // Left “A”: ink lower on the canvas (larger cy). Right “B”: ink higher (smaller cy).
    // Old cy-based global sort would reorder these blobs and pair the wrong textures to A/B.
    fillRect(img, 4, 14, 20, 28)
    fillRect(img, 52, 4, 68, 14)
    const r = charsetStripToModel(img, 'AB', {
      alphaThreshold: 1,
      minGapPx: 2,
      minRowGapPx: 3,
      trimPadPx: 0,
      pageFile: 'strip.png',
      face: 'StripCy',
      spaceAdvancePx: 8,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.chars).toHaveLength(2)
    expect(r.model.chars[0]!.id).toBe(65)
    expect(r.model.chars[1]!.id).toBe(66)
    expect(r.model.chars[0]!.x).toBeLessThan(r.model.chars[1]!.x)
  })

  it('segments two horizontal glyphs and assigns code points', () => {
    const img = rgbaImage(80, 32)
    fillRect(img, 4, 8, 14, 24)
    fillRect(img, 44, 8, 54, 24)
    const r = charsetStripToModel(img, 'AB', {
      alphaThreshold: 1,
      minGapPx: 2,
      minRowGapPx: 3,
      trimPadPx: 0,
      pageFile: 'strip.png',
      face: 'StripTest',
      spaceAdvancePx: 8,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.chars).toHaveLength(2)
    expect(r.model.chars[0]!.id).toBe(65)
    expect(r.model.chars[1]!.id).toBe(66)
    expect(r.model.chars[0]!.x).toBeLessThan(r.model.chars[1]!.x)
    expect(r.model.common.scaleW).toBe(80)
    expect(r.model.common.scaleH).toBe(32)
    expect(r.model.pages[0]!.file).toBe('strip.png')
  })

  it('supports synthetic space between two ink glyphs', () => {
    const img = rgbaImage(80, 24)
    fillRect(img, 4, 4, 14, 20)
    fillRect(img, 50, 4, 60, 20)
    const r = charsetStripToModel(img, 'A B', {
      alphaThreshold: 1,
      minGapPx: 2,
      minRowGapPx: 3,
      trimPadPx: 0,
      pageFile: 's.png',
      face: 'S',
      spaceAdvancePx: 10,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.chars).toHaveLength(3)
    expect(r.model.chars[1]!.id).toBe(32)
    expect(r.model.chars[1]!.xadvance).toBe(10)
  })

  it('fails when blob count does not match charset', () => {
    const img = rgbaImage(40, 24)
    fillRect(img, 4, 4, 14, 20)
    const r = charsetStripToModel(img, 'AB', {
      alphaThreshold: 1,
      minGapPx: 2,
      minRowGapPx: 3,
      trimPadPx: 0,
      pageFile: 's.png',
      face: 'S',
      spaceAdvancePx: 8,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/More glyph regions|Ran out of detected/)
  })

  it('swaps period/comma ids when ink shape disagrees with charset', () => {
    const img = rgbaImage(96, 32)
    // Comma-like: wide head + narrow descending tail (positive mean−median skew in Y)
    fillRect(img, 4, 6, 12, 10)
    fillRect(img, 10, 11, 12, 24)
    // Period-like: compact block
    fillRect(img, 52, 12, 60, 20)
    const r = charsetStripToModel(img, '.,', {
      alphaThreshold: 1,
      minGapPx: 2,
      minRowGapPx: 3,
      trimPadPx: 0,
      pageFile: 'p.png',
      face: 'Punct',
      spaceAdvancePx: 8,
      swapDotCommaByShape: true,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.chars[0]!.id).toBe(0x2c)
    expect(r.model.chars[1]!.id).toBe(0x2e)
    expect(r.warnings.length).toBeGreaterThanOrEqual(2)
    expect(r.warnings.some((w) => w.includes('U+002C'))).toBe(true)
  })

  it('does not swap when charset order matches comma then period shapes', () => {
    const img = rgbaImage(96, 32)
    fillRect(img, 4, 6, 12, 10)
    fillRect(img, 10, 11, 12, 24)
    fillRect(img, 52, 12, 60, 20)
    const r = charsetStripToModel(img, ',.', {
      alphaThreshold: 1,
      minGapPx: 2,
      minRowGapPx: 3,
      trimPadPx: 0,
      pageFile: 'p.png',
      face: 'Punct',
      spaceAdvancePx: 8,
      swapDotCommaByShape: true,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.chars[0]!.id).toBe(0x2c)
    expect(r.model.chars[1]!.id).toBe(0x2e)
    expect(r.warnings.filter((w) => w.includes('U+002C') || w.includes('U+002E'))).toHaveLength(0)
  })

  it('honors swapDotCommaByShape: false (charset ids kept literally)', () => {
    const img = rgbaImage(96, 32)
    fillRect(img, 4, 6, 12, 10)
    fillRect(img, 10, 11, 12, 24)
    fillRect(img, 52, 12, 60, 20)
    const r = charsetStripToModel(img, '.,', {
      alphaThreshold: 1,
      minGapPx: 2,
      minRowGapPx: 3,
      trimPadPx: 0,
      pageFile: 'p.png',
      face: 'Punct',
      spaceAdvancePx: 8,
      swapDotCommaByShape: false,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.chars[0]!.id).toBe(0x2e)
    expect(r.model.chars[1]!.id).toBe(0x2c)
  })
})

describe('classifyCommaOrPeriodInk', () => {
  it('labels compact blob as period', () => {
    const img = rgbaImage(24, 24)
    fillRect(img, 4, 4, 14, 14)
    expect(classifyCommaOrPeriodInk(img.data, 24, 24, 0, 0, 23, 23, 1)).toBe('period')
  })

  it('labels head+tail blob as comma', () => {
    const img = rgbaImage(24, 28)
    fillRect(img, 4, 4, 12, 8)
    fillRect(img, 10, 9, 12, 22)
    expect(classifyCommaOrPeriodInk(img.data, 24, 28, 0, 0, 23, 27, 1)).toBe('comma')
  })
})
