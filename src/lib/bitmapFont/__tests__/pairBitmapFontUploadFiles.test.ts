import { describe, expect, it } from 'vitest'

import { parseBitmapFont } from '../BitmapFontParser'
import { detectIndentFromXml, serializeBitmapFontXml } from '../BitmapFontSerializer'
import {
  pairBitmapFontUploadBundles,
  parseBitmapFontDescriptor,
  uploadBasename,
  uploadStem,
} from '../pairBitmapFontUploadFiles'
import type { ParsedBitmapFontDescriptor } from '../pairBitmapFontUploadFiles'

function descriptorFromXml(fileName: string, xml: string): ParsedBitmapFontDescriptor {
  const model = parseBitmapFont(xml)
  const indent = detectIndentFromXml(xml)
  return {
    descriptorName: fileName,
    model,
    indent,
    exportFileName: fileName,
    lastSavedXml: serializeBitmapFontXml(model, { indent }),
    xmlFileName: fileName,
  }
}

const minimalXml = (face: string, pageFile: string) => `<?xml version="1.0" encoding="UTF-8"?>
<font>
	<info face="${face}" size="24" />
	<common lineHeight="28" scaleW="256" scaleH="128" pages="1" />
	<pages>
		<page id="0" file="${pageFile}" />
	</pages>
	<chars count="1">
		<char id="65" x="0" y="0" width="10" height="12" xoffset="0" yoffset="2" xadvance="10" />
	</chars>
</font>`

const twoPageXml = `<?xml version="1.0" encoding="UTF-8"?>
<font>
	<info face="multi" size="24" />
	<common lineHeight="28" scaleW="512" scaleH="256" pages="2" />
	<pages>
		<page id="0" file="sheet_a.png" />
		<page id="1" file="sheet_b.png" />
	</pages>
	<chars count="1">
		<char id="65" x="0" y="0" width="10" height="12" xoffset="0" yoffset="2" xadvance="10" />
	</chars>
</font>`

describe('parseBitmapFontDescriptor', () => {
  it('parses BMFont XML from buffer', () => {
    const xml = minimalXml('a', 'a.png')
    const buf = new TextEncoder().encode(xml).buffer
    const d = parseBitmapFontDescriptor('a.xml', buf)
    expect(d?.model.info.face).toBe('a')
    expect(d?.xmlFileName).toBe('a.xml')
  })
})

describe('pairBitmapFontUploadBundles', () => {
  it('pairs three fonts by stem without cross-assignment', () => {
    const descriptors = [
      descriptorFromXml('foo.xml', minimalXml('foo', 'atlas.png')),
      descriptorFromXml('bar.xml', minimalXml('bar', 'atlas.png')),
      descriptorFromXml('baz.xml', minimalXml('baz', 'atlas.png')),
    ]
    const images = [{ name: 'foo.png' }, { name: 'bar.png' }, { name: 'baz.png' }]
    const { bundles, warnings } = pairBitmapFontUploadBundles(descriptors, images)
    expect(bundles).toHaveLength(3)
    expect(warnings).toEqual([])
    expect(bundles[0]!.atlasImageNameByPageId.get(0)).toBe('foo.png')
    expect(bundles[1]!.atlasImageNameByPageId.get(0)).toBe('bar.png')
    expect(bundles[2]!.atlasImageNameByPageId.get(0)).toBe('baz.png')
  })

  it('pairs one multi-page font by page file names', () => {
    const descriptors = [descriptorFromXml('game.xml', twoPageXml)]
    const images = [{ name: 'sheet_a.png' }, { name: 'sheet_b.png' }]
    const { bundles, warnings } = pairBitmapFontUploadBundles(descriptors, images)
    expect(bundles).toHaveLength(1)
    expect(warnings).toEqual([])
    expect(bundles[0]!.atlasImageNameByPageId.get(0)).toBe('sheet_a.png')
    expect(bundles[0]!.atlasImageNameByPageId.get(1)).toBe('sheet_b.png')
  })

  it('uses index fallback for single-font multi-page when page names missing', () => {
    const xml = twoPageXml.replace('sheet_a.png', '').replace('sheet_b.png', '')
    const descriptors = [descriptorFromXml('game.xml', xml)]
    const images = [{ name: 'p0.png' }, { name: 'p1.png' }]
    const { bundles } = pairBitmapFontUploadBundles(descriptors, images)
    expect(bundles[0]!.atlasImageNameByPageId.get(0)).toBe('p0.png')
    expect(bundles[0]!.atlasImageNameByPageId.get(1)).toBe('p1.png')
  })

  it('warns on unmatched images in a multi-font batch', () => {
    const descriptors = [descriptorFromXml('only.xml', minimalXml('only', 'x.png'))]
    const images = [{ name: 'only.png' }, { name: 'extra.png' }]
    const { warnings } = pairBitmapFontUploadBundles(descriptors, images)
    expect(warnings.some((w) => w.includes('extra.png'))).toBe(true)
  })
})

describe('uploadBasename / uploadStem', () => {
  it('strips path and extension', () => {
    expect(uploadBasename('dir/foo.xml')).toBe('foo.xml')
    expect(uploadStem('dir/foo.xml')).toBe('foo')
  })
})
