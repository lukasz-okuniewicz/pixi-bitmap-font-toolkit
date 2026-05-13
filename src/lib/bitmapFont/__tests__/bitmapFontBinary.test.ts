import { describe, expect, it } from 'vitest'

import { isBitmapFontBinaryMagic, parseBitmapFontBinary, serializeBitmapFontBinary } from '../BitmapFontBinary'
import { parseBitmapFont } from '../BitmapFontParser'
import { defaultBitmapFontModel } from '../types'

describe('BitmapFontBinary', () => {
  it('detects BMF magic', () => {
    const u8 = new Uint8Array([0x42, 0x4d, 0x46, 3])
    expect(isBitmapFontBinaryMagic(u8)).toBe(true)
    expect(isBitmapFontBinaryMagic(new Uint8Array([1, 2, 3, 4]))).toBe(false)
  })

  it('round-trips a small font through binary', () => {
    const m = defaultBitmapFontModel()
    m.info.face = 'BinTest'
    m.info.size = 20
    m.common = { lineHeight: 22, scaleW: 128, scaleH: 64, pages: 1, base: 18 }
    m.pages = [{ id: 0, file: 'atlas.png' }]
    m.chars = [
      { id: 65, x: 0, y: 0, width: 8, height: 10, xoffset: 0, yoffset: 1, xadvance: 8 },
      { id: 66, x: 10, y: 0, width: 8, height: 10, xoffset: 0, yoffset: 1, xadvance: 8 },
    ]
    m.kernings = [{ first: 65, second: 66, amount: -1 }]
    const bin = serializeBitmapFontBinary(m)
    expect(isBitmapFontBinaryMagic(bin)).toBe(true)
    const m2 = parseBitmapFontBinary(bin)
    expect(m2.info.face).toBe(m.info.face)
    expect(m2.info.size).toBe(m.info.size)
    expect(m2.common.lineHeight).toBe(m.common.lineHeight)
    expect(m2.common.scaleW).toBe(m.common.scaleW)
    expect(m2.common.scaleH).toBe(m.common.scaleH)
    expect(m2.pages).toEqual(m.pages)
    expect(m2.chars).toEqual(m.chars)
    expect(m2.kernings).toEqual(m.kernings)
  })

  it('matches XML model after binary import of same logical font', () => {
    const xml = `<?xml version="1.0"?>
<font>
  <info face="X" size="16" />
  <common lineHeight="18" scaleW="32" scaleH="32" pages="1" />
  <pages><page id="0" file="p.png" /></pages>
  <chars count="1">
    <char id="48" x="0" y="0" width="8" height="10" xoffset="0" yoffset="0" xadvance="8" />
  </chars>
  <kernings count="0"></kernings>
</font>`
    const fromXml = parseBitmapFont(xml)
    const bin = serializeBitmapFontBinary(fromXml)
    const fromBin = parseBitmapFontBinary(bin)
    expect(fromBin.chars).toEqual(fromXml.chars)
    expect(fromBin.pages).toEqual(fromXml.pages)
  })
})
