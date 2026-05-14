import { describe, expect, it } from 'vitest'

import { isBitmapFontXmlString } from '../isBitmapFontXml'
import { parseBitmapFont } from '../BitmapFontParser'
import { detectIndentFromXml, serializeBitmapFontXml } from '../BitmapFontSerializer'
import { serializeBitmapFontText } from '../BitmapFontTextSerializer'

const minimalXml = `<?xml version="1.0" encoding="UTF-8"?>
<font>
	<info face="test-face" size="24" />
	<common lineHeight="28" scaleW="256" scaleH="128" pages="1" />
	<pages>
		<page id="0" file="atlas.png" />
	</pages>
	<chars count="2">
		<char id="65" x="0" y="0" width="10" height="12" xoffset="0" yoffset="2" xadvance="10" />
		<char id="8364" x="20" y="0" width="12" height="12" xoffset="0" yoffset="2" xadvance="12" />
	</chars>
	<kernings count="1">
		<kerning first="65" second="65" amount="-1" />
	</kernings>
</font>
`

const minimalFntText = `info face="txt-face" size=32 bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=1,1 outline=0
common lineHeight=32 base=26 scaleW=512 scaleH=256 pages=1 packed=0 alphaChnl=1 redChnl=0 greenChnl=0 blueChnl=0
page id=0 file="sheet.png"
chars count=1
char id=32   x=0    y=0    width=1    height=1    xoffset=0     yoffset=0     xadvance=8    page=0  chnl=15
kernings count=0
`

describe('isBitmapFontXmlString', () => {
  it('detects BMFont XML', () => {
    expect(isBitmapFontXmlString(minimalXml)).toEqual({ isBitmapFont: true, kind: 'xml' })
  })

  it('rejects random XML', () => {
    expect(isBitmapFontXmlString('<root><item/></root>').isBitmapFont).toBe(false)
  })

  it('detects ASCII .fnt text', () => {
    expect(isBitmapFontXmlString(minimalFntText)).toEqual({ isBitmapFont: true, kind: 'fnt-text' })
  })
})

describe('parse + serialize round-trip', () => {
  it('minimal XML preserves chars and kernings', () => {
    const model = parseBitmapFont(minimalXml)
    expect(model.info.face).toBe('test-face')
    expect(model.info.size).toBe(24)
    expect(model.chars.length).toBe(2)
    expect(model.kernings.length).toBe(1)
    const euro = model.chars.find((c) => c.id === 8364)
    expect(euro).toMatchObject({ x: 20, y: 0, width: 12, height: 12 })

    const indent = detectIndentFromXml(minimalXml)
    expect(indent).toBe('\t')
    const out = serializeBitmapFontXml(model, { indent })
    const again = parseBitmapFont(out)
    expect(again.chars.length).toBe(model.chars.length)
    expect(again.kernings.length).toBe(model.kernings.length)
    expect(again.chars[0]).toEqual(model.chars[0])
  })

  it('ASCII .fnt text parses', () => {
    const model = parseBitmapFont(minimalFntText)
    expect(model.info.face).toBe('txt-face')
    expect(model.chars.some((c) => c.id === 32)).toBe(true)
  })

  it('ASCII .fnt round-trips through text serializer', () => {
    const a = parseBitmapFont(minimalFntText)
    expect(a.common.base).toBe(26)
    expect(a.info.bold).toBe(0)
    expect(a.chars[0]?.page).toBe(0)
    expect(a.chars[0]?.chnl).toBe(15)
    const text = serializeBitmapFontText(a)
    const b = parseBitmapFont(text)
    expect(b.info).toEqual(a.info)
    expect(b.common).toEqual(a.common)
    expect(b.pages).toEqual(a.pages)
    expect(b.chars).toEqual(a.chars)
    expect(b.kernings).toEqual(a.kernings)
  })

  it('XML preserves extended info/common/char attrs round-trip', () => {
    const xml = `<?xml version="1.0"?>
<font>
  <info face="F" size="10" bold="1" italic="0" charset="ASCII" unicode="1" stretchH="100" smooth="1" aa="2" padding="1,2,3,4" spacing="2,3" outline="1" />
  <common lineHeight="12" base="10" scaleW="64" scaleH="64" pages="1" packed="1" alphaChnl="2" redChnl="3" greenChnl="4" blueChnl="5" />
  <pages><page id="0" file="a.png" /></pages>
  <chars count="1">
    <char id="65" x="1" y="2" width="3" height="4" xoffset="0" yoffset="0" xadvance="5" page="0" chnl="15" />
  </chars>
  <kernings count="0"></kernings>
</font>`
    const m = parseBitmapFont(xml)
    expect(m.info.bold).toBe(1)
    expect(m.info.padding).toBe('1,2,3,4')
    expect(m.common.base).toBe(10)
    expect(m.common.packed).toBe(1)
    expect(m.chars[0]?.chnl).toBe(15)
    const out = serializeBitmapFontXml(m, { indent: '  ' })
    const again = parseBitmapFont(out)
    expect(again.info).toEqual(m.info)
    expect(again.common).toEqual(m.common)
    expect(again.chars[0]).toEqual(m.chars[0])
  })

  it('XML preserves unknown attributes on info, common, page, char, kerning', () => {
    const xml = `<?xml version="1.0"?>
<font>
  <info face="F" size="10" dataapp="v2" />
  <common lineHeight="12" scaleW="64" scaleH="64" pages="1" extracommon="yes" />
  <pages><page id="0" file="a.png" datafilehint="x" /></pages>
  <chars count="1">
    <char id="65" x="1" y="2" width="3" height="4" xoffset="0" yoffset="0" xadvance="5" letter="A" />
  </chars>
  <kernings count="1">
    <kerning first="65" second="66" amount="0" legacy="1" />
  </kernings>
</font>`
    const m = parseBitmapFont(xml)
    expect(m.info.extraAttrs).toEqual({ dataapp: 'v2' })
    expect(m.common.extraAttrs).toEqual({ extracommon: 'yes' })
    expect(m.pages[0]?.extraAttrs).toEqual({ datafilehint: 'x' })
    expect(m.chars[0]?.extraAttrs).toEqual({ letter: 'A' })
    expect(m.kernings[0]?.extraAttrs).toEqual({ legacy: '1' })
    const out = serializeBitmapFontXml(m, { indent: '  ' })
    const again = parseBitmapFont(out)
    expect(again.info.extraAttrs).toEqual(m.info.extraAttrs)
    expect(again.common.extraAttrs).toEqual(m.common.extraAttrs)
    expect(again.pages[0]?.extraAttrs).toEqual(m.pages[0]?.extraAttrs)
    expect(again.chars[0]?.extraAttrs).toEqual(m.chars[0]?.extraAttrs)
    expect(again.kernings[0]?.extraAttrs).toEqual(m.kernings[0]?.extraAttrs)
  })

  it('XML globalXAdvance decomposes char xadvance on parse and restores on serialize', () => {
    const xml = `<?xml version="1.0"?>
<font>
  <info face="G" size="12" />
  <common lineHeight="16" scaleW="64" scaleH="64" pages="1" globalXAdvance="3" />
  <pages><page id="0" file="a.png" /></pages>
  <chars count="2">
    <char id="65" x="0" y="0" width="10" height="10" xoffset="0" yoffset="0" xadvance="13" />
    <char id="66" x="10" y="0" width="8" height="10" xoffset="0" yoffset="0" xadvance="11" />
  </chars>
  <kernings count="0"></kernings>
</font>`
    const m = parseBitmapFont(xml)
    expect(m.common.globalXAdvance).toBe(3)
    expect(m.chars.find((c) => c.id === 65)?.xadvance).toBe(10)
    expect(m.chars.find((c) => c.id === 66)?.xadvance).toBe(8)
    const out = serializeBitmapFontXml(m, { indent: '  ' })
    expect(out).toContain('globalXAdvance="3"')
    expect(out).toMatch(/xadvance="13"/)
    expect(out).toMatch(/xadvance="11"/)
    const again = parseBitmapFont(out)
    expect(again.common.globalXAdvance).toBe(3)
    expect(again.chars).toEqual(m.chars)
  })

  it('.fnt text globalXAdvance round-trips', () => {
    const text = `info face="F" size=12 bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=1,1 outline=0
common lineHeight=16 base=13 scaleW=64 scaleH=64 pages=1 packed=0 alphaChnl=0 redChnl=0 greenChnl=0 blueChnl=0 globalXAdvance=2
page id=0 file=a.png
chars count=1
char id=65 x=0 y=0 width=5 height=8 xoffset=0 yoffset=0 xadvance=9 page=0 chnl=15
kernings count=0
`
    const m = parseBitmapFont(text)
    expect(m.common.globalXAdvance).toBe(2)
    expect(m.chars[0]?.xadvance).toBe(7)
    const serialized = serializeBitmapFontText(m)
    const b = parseBitmapFont(serialized)
    expect(b.common.globalXAdvance).toBe(2)
    expect(b.chars).toEqual(m.chars)
  })
})
