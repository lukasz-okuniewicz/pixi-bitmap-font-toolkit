import { describe, expect, it } from 'vitest'

import { bitmapFontDiagnostics } from '../bitmapFontDiagnostics'
import { parseBitmapFontXml } from '../BitmapFontParser'
import { defaultBitmapFontModel } from '../types'

describe('bitmapFontDiagnostics', () => {
  it('flags duplicate char ids', () => {
    const m = defaultBitmapFontModel()
    m.chars = [
      { id: 65, x: 0, y: 0, width: 1, height: 1, xoffset: 0, yoffset: 0, xadvance: 1 },
      { id: 65, x: 2, y: 0, width: 1, height: 1, xoffset: 0, yoffset: 0, xadvance: 1 },
    ]
    const d = bitmapFontDiagnostics(m)
    expect(d.some((x) => x.code === 'dup_char_id')).toBe(true)
  })

  it('flags kerning with unknown glyph', () => {
    const m = defaultBitmapFontModel()
    m.chars = [{ id: 32, x: 0, y: 0, width: 1, height: 1, xoffset: 0, yoffset: 0, xadvance: 4 }]
    m.kernings = [{ first: 32, second: 999, amount: -1 }]
    const d = bitmapFontDiagnostics(m)
    expect(d.some((x) => x.code === 'kerning_unknown_second')).toBe(true)
  })

  it('includes info when no suspicious xadvance', () => {
    const m = defaultBitmapFontModel()
    m.chars = [{ id: 65, x: 0, y: 0, width: 10, height: 12, xoffset: 0, yoffset: 0, xadvance: 14 }]
    const d = bitmapFontDiagnostics(m)
    expect(d.some((x) => x.code === 'xadvance_none_suspicious')).toBe(true)
    expect(d.find((x) => x.code === 'xadvance_none_suspicious')?.message).toBe(
      'No suspicious xAdvance values found.'
    )
  })

  it('includes summary and per-glyph warnings for suspicious xadvance', () => {
    const m = defaultBitmapFontModel()
    m.chars = [{ id: 65, x: 0, y: 0, width: 10, height: 12, xoffset: 0, yoffset: 0, xadvance: 48 }]
    const d = bitmapFontDiagnostics(m)
    expect(d.some((x) => x.code === 'xadvance_suspicious_summary')).toBe(true)
    expect(d.find((x) => x.code === 'xadvance_suspicious_summary')?.message).toContain(
      '1 glyph(s) with suspicious xadvance (effective = global + local)'
    )
    expect(d.some((x) => x.code === 'xadvance_suspicious' && x.target?.kind === 'char')).toBe(true)
  })
})

describe('parseBitmapFontXml errors', () => {
  it('throws on malformed XML', () => {
    expect(() => parseBitmapFontXml('<font><info face="x" size="1"/>')).toThrow(/Invalid bitmap font XML/)
  })
})
