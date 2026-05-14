import { describe, expect, it } from 'vitest'

import { verifyBitmapFontXmlRoundTrip } from '../bitmapFontRoundTrip'
import { defaultBitmapFontModel } from '../types'
import { serializeBitmapFontXml } from '../BitmapFontSerializer'

describe('verifyBitmapFontXmlRoundTrip', () => {
  it('passes for a simple serialized font', () => {
    const m = defaultBitmapFontModel()
    m.info.face = 'TestFace'
    m.info.size = 24
    m.common = { lineHeight: 24, scaleW: 128, scaleH: 128, pages: 1 }
    m.pages = [{ id: 0, file: 'a.png' }]
    m.chars = [{ id: 65, x: 0, y: 0, width: 10, height: 12, xoffset: 0, yoffset: 0, xadvance: 10 }]
    m.kernings = [{ first: 65, second: 66, amount: -1 }]
    const xml = serializeBitmapFontXml(m, { indent: '\t' })
    const r = verifyBitmapFontXmlRoundTrip(xml, '\t')
    expect(r.ok).toBe(true)
    expect(r.messages).toHaveLength(0)
  })

  it('passes when common.globalXAdvance splits xadvance', () => {
    const m = defaultBitmapFontModel()
    m.info.face = 'TestFace'
    m.info.size = 24
    m.common = { lineHeight: 24, scaleW: 128, scaleH: 128, pages: 1, globalXAdvance: 4 }
    m.pages = [{ id: 0, file: 'a.png' }]
    m.chars = [{ id: 65, x: 0, y: 0, width: 10, height: 12, xoffset: 0, yoffset: 0, xadvance: 6 }]
    m.kernings = []
    const xml = serializeBitmapFontXml(m, { indent: '\t' })
    const r = verifyBitmapFontXmlRoundTrip(xml, '\t')
    expect(r.ok).toBe(true)
    expect(r.messages).toHaveLength(0)
  })

  it('fails on invalid XML', () => {
    const r = verifyBitmapFontXmlRoundTrip('not xml', '\t')
    expect(r.ok).toBe(false)
    expect(r.messages[0]).toMatch(/parse/i)
  })
})
