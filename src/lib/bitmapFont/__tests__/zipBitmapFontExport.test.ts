import { describe, expect, it } from 'vitest'

import { utf8ToUint8, zipBitmapFontFiles } from '../zipBitmapFontExport'

describe('zipBitmapFontFiles', () => {
  it('produces a non-empty PKZIP buffer', () => {
    const zipped = zipBitmapFontFiles([
      { path: 'font.xml', data: utf8ToUint8('<?xml version="1.0"?><font></font>') },
      { path: 'page0.png', data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
      { path: 'subdir/page1.png', data: new Uint8Array([1, 2, 3]) },
    ])
    expect(zipped.length).toBeGreaterThan(80)
    expect(zipped[0]).toBe(0x50)
    expect(zipped[1]).toBe(0x4b)
  })
})
