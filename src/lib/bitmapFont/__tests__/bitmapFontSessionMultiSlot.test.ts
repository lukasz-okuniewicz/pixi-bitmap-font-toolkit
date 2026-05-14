import { describe, expect, it } from 'vitest'

import { migrateV1ToV2 } from '../bitmapFontSessionDb'
import { defaultBitmapFontModel } from '../types'
import { initialModelHistoryState, modelHistoryReducer } from '../modelHistoryReducer'
import { setInfo } from '../BitmapFontEditor'

describe('bitmapFontSession multi-slot', () => {
  it('migrateV1ToV2 creates one slot with history, baseline, and atlas page buffer', () => {
    const m = defaultBitmapFontModel()
    const buf = new Uint8Array([1, 2, 3]).buffer
    const v1 = {
      version: 1 as const,
      savedAt: 42,
      model: m,
      indent: '\t',
      exportFileName: 'f.xml',
      xmlFileName: 'x.xml',
      pngFileName: 'p.png',
      atlasBuffer: buf,
    }
    const v2 = migrateV1ToV2(v1)
    expect(v2.version).toBe(2)
    expect(v2.savedAt).toBe(42)
    expect(v2.slots.length).toBe(1)
    expect(v2.activeSlotId).toBe(v2.slots[0]!.id)
    const slot = v2.slots[0]!
    expect(slot.histState.model.info.face).toBe(m.info.face)
    expect(slot.baselineModel.info.face).toBe(m.info.face)
    expect(slot.atlasPages.length).toBe(1)
    expect(slot.atlasPages[0]!.pageId).toBe(m.pages[0]!.id)
    expect(new Uint8Array(slot.atlasPages[0]!.buffer)).toEqual(new Uint8Array(buf))
    expect(slot.lastSavedXml).not.toBeNull()
  })

  it('modelHistoryReducer hydrate restores past and future stacks', () => {
    let state = initialModelHistoryState()
    state = modelHistoryReducer(state, {
      type: 'set',
      update: (prev) => setInfo(prev, { face: 'edited' }),
      recordHistory: true,
    })
    expect(state.past.length).toBe(1)
    const snapshot = structuredClone(state)
    const cleared = modelHistoryReducer(state, {
      type: 'set',
      update: defaultBitmapFontModel(),
      recordHistory: false,
    })
    expect(cleared.past.length).toBe(0)
    const restored = modelHistoryReducer(cleared, { type: 'hydrate', state: snapshot })
    expect(restored.model.info.face).toBe('edited')
    expect(restored.past.length).toBe(1)
  })
})
