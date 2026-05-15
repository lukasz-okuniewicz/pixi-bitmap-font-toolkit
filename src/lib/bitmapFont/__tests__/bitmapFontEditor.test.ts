import { describe, expect, it } from 'vitest'

import {
  addChar,
  defaultCharForId,
  removeCharAt,
  removeCharById,
  removeCharsAt,
} from '../BitmapFontEditor'
import { parseCodePointInput } from '../parseCodePointInput'
import type { BitmapFontModel } from '../types'

function makeModel(): BitmapFontModel {
  return {
    info: { face: 'test', size: 16 },
    common: { lineHeight: 16, scaleW: 256, scaleH: 256, pages: 1 },
    pages: [{ id: 0, file: 'atlas.png' }],
    chars: [
      { id: 65, x: 0, y: 0, width: 10, height: 12, xoffset: 0, yoffset: 0, xadvance: 10 },
      { id: 66, x: 10, y: 0, width: 10, height: 12, xoffset: 0, yoffset: 0, xadvance: 10 },
      { id: 67, x: 20, y: 0, width: 10, height: 12, xoffset: 0, yoffset: 0, xadvance: 10 },
    ],
    kernings: [
      { first: 65, second: 66, amount: -1 },
      { first: 66, second: 67, amount: -2 },
      { first: 65, second: 67, amount: -1 },
    ],
  }
}

describe('defaultCharForId', () => {
  it('returns a zeroed char with the given id', () => {
    const c = defaultCharForId(8364)
    expect(c.id).toBe(8364)
    expect(c.x).toBe(0)
    expect(c.width).toBe(0)
    expect(c.xadvance).toBe(0)
  })
})

describe('addChar', () => {
  it('appends a new glyph', () => {
    const m = addChar(makeModel(), defaultCharForId(68))
    expect(m.chars).toHaveLength(4)
    expect(m.chars[3]?.id).toBe(68)
  })

  it('is a no-op when the id already exists', () => {
    const orig = makeModel()
    const m = addChar(orig, defaultCharForId(65))
    expect(m).toBe(orig)
    expect(m.chars).toHaveLength(3)
  })
})

describe('removeCharAt', () => {
  it('removes the glyph at the given index', () => {
    const m = removeCharAt(makeModel(), 1)
    expect(m.chars).toHaveLength(2)
    expect(m.chars.find((c) => c.id === 66)).toBeUndefined()
  })

  it('removes kerning pairs that reference the removed id', () => {
    const m = removeCharAt(makeModel(), 1) // removes id 66
    expect(m.kernings).toHaveLength(1)
    expect(m.kernings[0]).toEqual({ first: 65, second: 67, amount: -1 })
  })

  it('returns the model unchanged for out-of-range index', () => {
    const orig = makeModel()
    expect(removeCharAt(orig, -1)).toBe(orig)
    expect(removeCharAt(orig, 99)).toBe(orig)
  })
})

describe('removeCharById', () => {
  it('removes by code point', () => {
    const m = removeCharById(makeModel(), 65)
    expect(m.chars).toHaveLength(2)
    expect(m.chars.find((c) => c.id === 65)).toBeUndefined()
  })

  it('is a no-op for unknown id', () => {
    const orig = makeModel()
    expect(removeCharById(orig, 9999)).toBe(orig)
  })
})

describe('removeCharsAt', () => {
  it('removes multiple glyphs in one pass', () => {
    const m = removeCharsAt(makeModel(), [0, 2])
    expect(m.chars).toHaveLength(1)
    expect(m.chars[0]?.id).toBe(66)
  })

  it('removes all related kernings', () => {
    const m = removeCharsAt(makeModel(), [0, 1]) // removes 65 and 66
    expect(m.kernings).toHaveLength(0)
  })

  it('handles duplicate indices gracefully', () => {
    const m = removeCharsAt(makeModel(), [0, 0, 0])
    expect(m.chars).toHaveLength(2)
  })
})

describe('parseCodePointInput', () => {
  it('parses a decimal integer', () => {
    expect(parseCodePointInput('65')).toBe(65)
    expect(parseCodePointInput('8364')).toBe(8364)
  })

  it('parses U+ hex notation', () => {
    expect(parseCodePointInput('U+41')).toBe(65)
    expect(parseCodePointInput('u+20ac')).toBe(8364)
  })

  it('parses 0x hex notation', () => {
    expect(parseCodePointInput('0x41')).toBe(65)
    expect(parseCodePointInput('0X20AC')).toBe(8364)
  })

  it('parses a single character', () => {
    expect(parseCodePointInput('A')).toBe(65)
    expect(parseCodePointInput('€')).toBe(8364)
  })

  it('returns null for empty input', () => {
    expect(parseCodePointInput('')).toBeNull()
    expect(parseCodePointInput('  ')).toBeNull()
  })

  it('returns null for multiple characters', () => {
    expect(parseCodePointInput('AB')).toBeNull()
  })

  it('returns null for invalid text', () => {
    expect(parseCodePointInput('xyz')).toBeNull()
  })

  it('returns null for negative numbers', () => {
    expect(parseCodePointInput('-1')).toBeNull()
  })

  it('returns null for code points above U+10FFFF', () => {
    expect(parseCodePointInput('2000000')).toBeNull()
  })
})
