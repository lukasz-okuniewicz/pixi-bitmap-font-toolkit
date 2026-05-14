import type { BitmapFontModel } from './types'
import type { BitmapFontSessionRecordV2, WorkspaceSnapshotV2 } from './bitmapFontWorkspaceTypes'
import { slotLabelFromMeta } from './bitmapFontWorkspaceTypes'
import { serializeBitmapFontXml } from './BitmapFontSerializer'

const DB_NAME = 'pixi-bitmap-font-toolkit'
const STORE = 'session'
const DB_VERSION = 2
/** Legacy single-font payload key (v1). */
const LEGACY_KEY = 'v1'
/** Current session key (v2 multi-slot). */
const SESSION_KEY = 'session'

export type BitmapFontSessionRecordV1 = {
  version: 1
  savedAt: number
  model: BitmapFontModel
  indent: string
  exportFileName: string
  xmlFileName: string | null
  pngFileName: string | null
  /** Single-atlas PNG/WebP/JPEG bytes (page 0). */
  atlasBuffer: ArrayBuffer | null
}

export { type BitmapFontSessionRecordV2, type WorkspaceSnapshotV2 } from './bitmapFontWorkspaceTypes'

export function migrateV1ToV2(v1: BitmapFontSessionRecordV1): BitmapFontSessionRecordV2 {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `slot-${v1.savedAt}`
  const page0Id = v1.model.pages[0]?.id ?? 0
  const atlasPages: WorkspaceSnapshotV2['atlasPages'] =
    v1.atlasBuffer && v1.atlasBuffer.byteLength > 0 ? [{ pageId: page0Id, buffer: v1.atlasBuffer.slice(0) }] : []
  const modelClone = structuredClone(v1.model)
  const snapshot: WorkspaceSnapshotV2 = {
    id,
    label: slotLabelFromMeta(v1.xmlFileName, v1.exportFileName, v1.model),
    histState: {
      model: modelClone,
      past: [],
      future: [],
    },
    baselineModel: structuredClone(v1.model),
    indent: v1.indent,
    exportFileName: v1.exportFileName,
    xmlFileName: v1.xmlFileName,
    pngFileName: v1.pngFileName,
    lastSavedXml: serializeBitmapFontXml(modelClone, { indent: v1.indent }),
    activeAtlasPageId: page0Id,
    atlasPages,
  }
  return {
    version: 2,
    savedAt: v1.savedAt,
    activeSlotId: id,
    slots: [snapshot],
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
}

export async function saveBitmapFontSession(rec: BitmapFontSessionRecordV2): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error ?? new Error('IndexedDB write failed'))
    }
    const store = tx.objectStore(STORE)
    store.put(rec, SESSION_KEY)
    store.delete(LEGACY_KEY)
  })
}

function isV2Record(v: unknown): v is BitmapFontSessionRecordV2 {
  if (!v || typeof v !== 'object') return false
  const o = v as { version?: unknown; slots?: unknown; activeSlotId?: unknown }
  return o.version === 2 && Array.isArray(o.slots) && o.slots.length > 0 && typeof o.activeSlotId === 'string'
}

export async function loadBitmapFontSession(): Promise<BitmapFontSessionRecordV2 | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)

    const reqSession = store.get(SESSION_KEY)
    reqSession.onsuccess = () => {
      const sessionVal = reqSession.result
      if (isV2Record(sessionVal)) {
        db.close()
        resolve(sessionVal)
        return
      }
      const reqLegacy = store.get(LEGACY_KEY)
      reqLegacy.onsuccess = () => {
        const v1 = reqLegacy.result as BitmapFontSessionRecordV1 | undefined
        if (v1 && v1.version === 1) {
          db.close()
          resolve(migrateV1ToV2(v1))
          return
        }
        db.close()
        resolve(null)
      }
      reqLegacy.onerror = () => {
        db.close()
        reject(reqLegacy.error ?? new Error('IndexedDB read failed'))
      }
    }
    reqSession.onerror = () => {
      db.close()
      reject(reqSession.error ?? new Error('IndexedDB read failed'))
    }
  })
}

export async function clearBitmapFontSession(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error ?? new Error('IndexedDB clear failed'))
    }
    const store = tx.objectStore(STORE)
    store.delete(SESSION_KEY)
    store.delete(LEGACY_KEY)
  })
}
