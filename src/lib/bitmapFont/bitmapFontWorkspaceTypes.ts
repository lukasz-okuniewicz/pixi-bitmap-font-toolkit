import type { BitmapFontModel } from './types'
import type { ModelHistoryState } from './modelHistoryReducer'

/** One atlas image for a BMFont `<page id="…">` (persisted in IndexedDB). */
export type AtlasPageBufferV2 = {
  pageId: number
  buffer: ArrayBuffer
}

/** One open font tab: full undo stack, baseline, metadata, atlas bytes per page. */
export type WorkspaceSnapshotV2 = {
  id: string
  label: string
  histState: ModelHistoryState
  baselineModel: BitmapFontModel
  indent: string
  exportFileName: string
  xmlFileName: string | null
  pngFileName: string | null
  lastSavedXml: string | null
  activeAtlasPageId: number
  atlasPages: AtlasPageBufferV2[]
}

export type BitmapFontSessionRecordV2 = {
  version: 2
  savedAt: number
  activeSlotId: string
  slots: WorkspaceSnapshotV2[]
}

export function slotLabelFromMeta(
  xmlFileName: string | null,
  exportFileName: string,
  model: BitmapFontModel
): string {
  const fromXml = xmlFileName?.trim()
  if (fromXml) return fromXml.replace(/^.*[/\\]/, '')
  const fromExport = exportFileName?.trim()
  if (fromExport) return fromExport.replace(/^.*[/\\]/, '')
  const face = model.info.face?.trim()
  if (face) return face
  return 'Font'
}
