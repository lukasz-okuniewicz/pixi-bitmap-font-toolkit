import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { bitmapFontDiagnostics } from '../bitmapFontDiagnostics'
import { detectIndentFromXml, serializeBitmapFontXml } from '../BitmapFontSerializer'
import { parseBitmapFontXml } from '../BitmapFontParser'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readFixture(name: string): string {
  return readFileSync(join(__dirname, 'fixtures', name), 'utf-8')
}

describe('bitmap font fixtures', () => {
  it('parses tab-indented fixture and detects indent', () => {
    const xml = readFixture('font_tabs_indent.xml')
    expect(detectIndentFromXml(xml)).toBe('\t')
    const m = parseBitmapFontXml(xml)
    expect(m.info.face).toBe('FixtureTabs')
    const out = serializeBitmapFontXml(m, { indent: '\t' })
    expect(parseBitmapFontXml(out).chars).toEqual(m.chars)
  })

  it('parses space-indented fixture', () => {
    const xml = readFixture('font_spaces_indent.xml')
    const ind = detectIndentFromXml(xml)
    expect(ind === '    ' || ind.startsWith(' ')).toBe(true)
    const m = parseBitmapFontXml(xml)
    expect(m.info.face).toBe('FixtureSpaces')
  })

  it('fixture with pages mismatch produces diagnostics', () => {
    const m = parseBitmapFontXml(readFixture('font_pages_mismatch.xml'))
    const d = bitmapFontDiagnostics(m)
    expect(d.some((x) => x.code === 'pages_count_mismatch')).toBe(true)
  })
})
