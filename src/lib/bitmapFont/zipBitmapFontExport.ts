import { strToU8, zipSync } from 'fflate'

export type ZipBitmapFontFile = {
  /** Path inside the archive, e.g. `font.xml` or `atlas0.png` */
  path: string
  /** File contents */
  data: Uint8Array
}

/** Build a ZIP archive (PKZIP) from named files. */
export function zipBitmapFontFiles(files: ZipBitmapFontFile[]): Uint8Array {
  const map: Record<string, Uint8Array> = {}
  for (const f of files) {
    const path = f.path.replace(/^\/+/, '').replace(/\\/g, '/')
    if (!path) continue
    map[path] = f.data
  }
  return zipSync(map, { level: 6 })
}

/** UTF-8 encode a string for binary ZIP entry bodies. */
export function utf8ToUint8(s: string): Uint8Array {
  return strToU8(s)
}
