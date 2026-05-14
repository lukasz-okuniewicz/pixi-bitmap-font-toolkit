import type { BitmapFontModel } from './types'
import type { AtlasPageBufferV2 } from './bitmapFontWorkspaceTypes'

/** Fetch atlas bytes for each BMFont page (for IndexedDB / inactive slot storage). */
export async function collectAtlasPageBuffers(params: {
  model: BitmapFontModel
  pageAtlasUrls: Record<number, string>
  atlasImageFile: File | null
}): Promise<AtlasPageBufferV2[]> {
  const sorted = [...params.model.pages].sort((a, b) => a.id - b.id)
  const out: AtlasPageBufferV2[] = []
  for (const p of sorted) {
    const pid = p.id
    const url = params.pageAtlasUrls[pid]
    if (url) {
      try {
        const res = await fetch(url)
        const buffer = await res.arrayBuffer()
        out.push({ pageId: pid, buffer })
      } catch {
        /* skip broken url */
      }
      continue
    }
    if (params.atlasImageFile && sorted.length === 1 && pid === (sorted[0]?.id ?? 0)) {
      try {
        const buffer = await params.atlasImageFile.arrayBuffer()
        out.push({ pageId: pid, buffer: buffer.slice(0) })
      } catch {
        /* skip */
      }
    }
  }
  return out
}

export function atlasBuffersToObjectUrls(atlasPages: AtlasPageBufferV2[]): Record<number, string> {
  const next: Record<number, string> = {}
  for (const { pageId, buffer } of atlasPages) {
    if (buffer.byteLength === 0) continue
    next[pageId] = URL.createObjectURL(new Blob([buffer]))
  }
  return next
}

export function revokeObjectUrlRecord(urls: Record<number, string>): void {
  for (const u of Object.values(urls)) {
    try {
      URL.revokeObjectURL(u)
    } catch {
      /* ignore */
    }
  }
}
