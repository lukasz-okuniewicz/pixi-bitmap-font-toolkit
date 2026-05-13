import type { BitmapFontModel } from './types'

const DB_NAME = 'pixi-bitmap-font-toolkit'
const STORE = 'session'
const KEY = 'v1'

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

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
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

export async function saveBitmapFontSession(rec: BitmapFontSessionRecordV1): Promise<void> {
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
    tx.objectStore(STORE).put(rec, KEY)
  })
}

export async function loadBitmapFontSession(): Promise<BitmapFontSessionRecordV1 | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(KEY)
    req.onsuccess = () => {
      db.close()
      const v = req.result as BitmapFontSessionRecordV1 | undefined
      if (!v || v.version !== 1) resolve(null)
      else resolve(v)
    }
    req.onerror = () => {
      db.close()
      reject(req.error ?? new Error('IndexedDB read failed'))
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
    tx.objectStore(STORE).delete(KEY)
  })
}
