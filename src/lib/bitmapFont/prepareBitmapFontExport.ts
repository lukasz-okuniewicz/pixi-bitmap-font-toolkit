import { repackBitmapFontAtlasToPowerOfTwoSquare } from './bitmapFontAtlasRepack'
import type { AtlasPageSource } from './bitmapFontAtlasRepack'
import { serializeBitmapFontBinary } from './BitmapFontBinary'
import { serializeBitmapFontXml } from './BitmapFontSerializer'
import type { SerializeOptions } from './BitmapFontSerializer'
import { serializeBitmapFontText } from './BitmapFontTextSerializer'
import type { BitmapFontModel } from './types'
import { utf8ToUint8 } from './zipBitmapFontExport'

export type PrepareBitmapFontExportInput = {
  model: BitmapFontModel
  repackEnabled: boolean
  pageAtlasUrls: Record<number, string>
  fallbackTextureUrl: string
  exportFileName: string
  serializeOptions: SerializeOptions
}

export type PrepareBitmapFontExportSuccess = {
  ok: true
  exportModel: BitmapFontModel
  xml: string
  fntText: string
  binary: Uint8Array
  zipEntries: { path: string; data: Uint8Array }[]
}

export type PrepareBitmapFontExportFailure = {
  ok: false
  error: string
}

export type PrepareBitmapFontExportOutcome =
  | PrepareBitmapFontExportSuccess
  | PrepareBitmapFontExportFailure

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load atlas image.'))
    img.src = url
  })
}

async function loadAtlasPageSources(
  model: BitmapFontModel,
  pageAtlasUrls: Record<number, string>,
  fallbackTextureUrl: string
): Promise<AtlasPageSource[] | PrepareBitmapFontExportFailure> {
  const sorted = [...model.pages].sort((a, b) => a.id - b.id)
  const sources: AtlasPageSource[] = []

  for (const p of sorted) {
    const url = pageAtlasUrls[p.id] || fallbackTextureUrl
    if (!url) {
      return {
        ok: false,
        error: `Missing atlas image for page id ${p.id}. Load atlas image(s) before exporting.`,
      }
    }
    try {
      const img = await loadImageFromUrl(url)
      sources.push({
        pageId: p.id,
        image: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
      })
    } catch {
      return { ok: false, error: `Failed to load atlas image for page id ${p.id}.` }
    }
  }

  return sources
}

async function buildZipEntries(
  exportModel: BitmapFontModel,
  xml: string,
  exportFileName: string,
  pngBytesByPageId: Map<number, Uint8Array> | null,
  pageAtlasUrls: Record<number, string>,
  fallbackTextureUrl: string
): Promise<{ path: string; data: Uint8Array }[]> {
  const xmlName = exportFileName.replace(/^.*\//, '') || 'font.xml'
  const entries: { path: string; data: Uint8Array }[] = [{ path: xmlName, data: utf8ToUint8(xml) }]
  const sorted = [...exportModel.pages].sort((a, b) => a.id - b.id)

  if (pngBytesByPageId) {
    for (const p of sorted) {
      const bytes = pngBytesByPageId.get(p.id)
      if (!bytes) continue
      const fname = (p.file || `page_${p.id}.png`).replace(/^.*[/\\]/, '') || `page_${p.id}.png`
      entries.push({ path: fname, data: bytes })
    }
    return entries
  }

  for (const p of sorted) {
    const u = pageAtlasUrls[p.id] || fallbackTextureUrl
    if (!u) continue
    const fname = (p.file || `page_${p.id}.png`).replace(/^.*[/\\]/, '') || `page_${p.id}.png`
    try {
      const res = await fetch(u)
      const buf = new Uint8Array(await res.arrayBuffer())
      entries.push({ path: fname, data: buf })
    } catch {
      /* skip missing page image */
    }
  }
  return entries
}

export async function prepareBitmapFontExport(
  input: PrepareBitmapFontExportInput
): Promise<PrepareBitmapFontExportOutcome> {
  const { model, repackEnabled, pageAtlasUrls, fallbackTextureUrl, exportFileName, serializeOptions } = input

  if (!repackEnabled) {
    const exportModel = model
    const xml = serializeBitmapFontXml(exportModel, serializeOptions)
    const fntText = serializeBitmapFontText(exportModel)
    const binary = serializeBitmapFontBinary(exportModel)
    const zipEntries = await buildZipEntries(
      exportModel,
      xml,
      exportFileName,
      null,
      pageAtlasUrls,
      fallbackTextureUrl
    )
    return { ok: true, exportModel, xml, fntText, binary, zipEntries }
  }

  const loaded = await loadAtlasPageSources(model, pageAtlasUrls, fallbackTextureUrl)
  if (!Array.isArray(loaded)) {
    return loaded
  }

  const repacked = await repackBitmapFontAtlasToPowerOfTwoSquare(model, loaded)
  if (!repacked.ok) {
    return { ok: false, error: repacked.error }
  }

  const exportModel = repacked.model
  const xml = serializeBitmapFontXml(exportModel, serializeOptions)
  const fntText = serializeBitmapFontText(exportModel)
  const binary = serializeBitmapFontBinary(exportModel)
  const zipEntries = await buildZipEntries(
    exportModel,
    xml,
    exportFileName,
    repacked.pngBytesByPageId,
    pageAtlasUrls,
    fallbackTextureUrl
  )

  return { ok: true, exportModel, xml, fntText, binary, zipEntries }
}
