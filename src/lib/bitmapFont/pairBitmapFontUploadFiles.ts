import { isBitmapFontBinaryMagic, parseBitmapFontBinary } from './BitmapFontBinary'
import { parseBitmapFont } from './BitmapFontParser'
import { detectIndentFromXml, serializeBitmapFontXml } from './BitmapFontSerializer'
import { isBitmapFontXmlString } from './isBitmapFontXml'
import type { BitmapFontModel } from './types'

export function uploadBasename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i >= 0 ? p.slice(i + 1) : p
}

export function uploadStem(p: string): string {
  const base = uploadBasename(p)
  return base.replace(/\.[^.]+$/i, '') || base
}

/** Atlas image: MIME or common extension (some browsers leave type empty). */
export function isLikelyAtlasImageFileName(name: string, mimeType = ''): boolean {
  if (mimeType.startsWith('image/')) return true
  return /\.(png|webp|jpe?g)$/i.test(name)
}

export type UploadFileRef = { name: string }

export type ParsedBitmapFontDescriptor = {
  descriptorName: string
  model: BitmapFontModel
  indent: string
  exportFileName: string
  lastSavedXml: string
  xmlFileName: string
}

export type BitmapFontUploadBundle = ParsedBitmapFontDescriptor & {
  /** Atlas image file name per BMFont page id. */
  atlasImageNameByPageId: Map<number, string>
}

export type PairBitmapFontUploadResult = {
  bundles: BitmapFontUploadBundle[]
  warnings: string[]
}

export function parseBitmapFontDescriptor(
  fileName: string,
  buffer: ArrayBuffer
): ParsedBitmapFontDescriptor | null {
  const u8 = new Uint8Array(buffer)
  if (isBitmapFontBinaryMagic(u8)) {
    const model = parseBitmapFontBinary(u8)
    const indent = '\t'
    const raw = uploadBasename(fileName)
    const stem = uploadStem(raw) || 'font'
    return {
      descriptorName: fileName,
      model,
      indent,
      exportFileName: `${stem}.xml`,
      lastSavedXml: serializeBitmapFontXml(model, { indent }),
      xmlFileName: fileName,
    }
  }
  const textBody = new TextDecoder('utf-8', { fatal: false }).decode(u8)
  const detected = isBitmapFontXmlString(textBody)
  if (!detected.isBitmapFont) return null
  const model = parseBitmapFont(textBody, detected.kind)
  const indent = detected.kind === 'xml' ? detectIndentFromXml(textBody) : '\t'
  const displayName = fileName
  return {
    descriptorName: fileName,
    model,
    indent,
    exportFileName:
      displayName.endsWith('.xml') || displayName.endsWith('.fnt')
        ? displayName
        : `${displayName}.xml`,
    lastSavedXml: serializeBitmapFontXml(model, { indent }),
    xmlFileName: displayName,
  }
}

function unusedImageIndices(images: UploadFileRef[], used: Set<number>): number[] {
  const out: number[] = []
  for (let i = 0; i < images.length; i++) {
    if (!used.has(i)) out.push(i)
  }
  return out
}

function findUnusedImageByBasename(
  images: UploadFileRef[],
  used: Set<number>,
  wantBase: string
): number | null {
  const want = wantBase.toLowerCase()
  for (let i = 0; i < images.length; i++) {
    if (used.has(i)) continue
    if (uploadBasename(images[i]!.name).toLowerCase() === want) return i
  }
  return null
}

function findUnusedImageByStem(images: UploadFileRef[], used: Set<number>, wantStem: string): number | null {
  const want = wantStem.toLowerCase()
  for (let i = 0; i < images.length; i++) {
    if (used.has(i)) continue
    if (uploadStem(images[i]!.name).toLowerCase() === want) return i
  }
  return null
}

/**
 * Assign atlas images to parsed BMFont descriptors (one bundle per descriptor).
 * When multiple descriptors are present, images are never shared across fonts via index fallback.
 */
export function pairBitmapFontUploadBundles(
  descriptors: ParsedBitmapFontDescriptor[],
  images: UploadFileRef[]
): PairBitmapFontUploadResult {
  const warnings: string[] = []
  const used = new Set<number>()
  const bundles: BitmapFontUploadBundle[] = []
  const multiFontBatch = descriptors.length > 1

  for (const desc of descriptors) {
    const sortedPages = [...desc.model.pages].sort((a, b) => a.id - b.id)
    const atlasImageNameByPageId = new Map<number, string>()
    const descStem = uploadStem(desc.descriptorName)

    for (const p of sortedPages) {
      const want = uploadBasename(p.file.trim())
      if (!want) continue
      const idx = findUnusedImageByBasename(images, used, want)
      if (idx != null) {
        atlasImageNameByPageId.set(p.id, images[idx]!.name)
        used.add(idx)
      }
    }

    for (const p of sortedPages) {
      if (atlasImageNameByPageId.has(p.id)) continue
      const idx = findUnusedImageByStem(images, used, descStem)
      if (idx != null) {
        atlasImageNameByPageId.set(p.id, images[idx]!.name)
        used.add(idx)
        if (sortedPages.length === 1) break
      }
    }

    if (!multiFontBatch) {
      for (let i = 0; i < sortedPages.length; i++) {
        const p = sortedPages[i]!
        if (atlasImageNameByPageId.has(p.id)) continue
        const unused = unusedImageIndices(images, used)
        const pick = unused[i] ?? unused[0]
        if (pick == null) continue
        atlasImageNameByPageId.set(p.id, images[pick]!.name)
        used.add(pick)
      }
    } else if (sortedPages.length === 1) {
      const p = sortedPages[0]!
      if (!atlasImageNameByPageId.has(p.id)) {
        const unused = unusedImageIndices(images, used)
        if (unused.length === 1) {
          const pick = unused[0]!
          atlasImageNameByPageId.set(p.id, images[pick]!.name)
          used.add(pick)
        }
      }
    }

    if (sortedPages.length > 0 && atlasImageNameByPageId.size === 0) {
      warnings.push(`No atlas image matched for "${uploadBasename(desc.descriptorName)}".`)
    } else if (multiFontBatch && sortedPages.length > 1) {
      const missing = sortedPages.filter((p) => !atlasImageNameByPageId.has(p.id))
      if (missing.length > 0) {
        warnings.push(
          `Font "${uploadBasename(desc.descriptorName)}": missing atlas for page(s) ${missing.map((p) => p.id).join(', ')}.`
        )
      }
    }

    bundles.push({ ...desc, atlasImageNameByPageId })
  }

  const unmatched = unusedImageIndices(images, used)
  for (const idx of unmatched) {
    warnings.push(`Unmatched atlas image "${uploadBasename(images[idx]!.name)}".`)
  }

  return { bundles, warnings }
}
