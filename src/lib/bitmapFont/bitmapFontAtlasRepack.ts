import { planSquarePo2Pack } from './atlasRepackUtils'
import { bitmapFontDiagnostics } from './bitmapFontDiagnostics'
import { charAtlasPage } from './types'
import type { BitmapFontChar, BitmapFontModel } from './types'

export type AtlasPageSource = {
  pageId: number
  image: CanvasImageSource
  width: number
  height: number
}

export type RepackAtlasOptions = {
  paddingPx?: number
}

export type RepackAtlasResult = {
  model: BitmapFontModel
  pngBytesByPageId: Map<number, Uint8Array>
}

export type RepackAtlasFailure = {
  ok: false
  error: string
}

export type RepackAtlasSuccess = {
  ok: true
} & RepackAtlasResult

export type RepackAtlasOutcome = RepackAtlasSuccess | RepackAtlasFailure

const MAX_CANVAS_SIDE = 4096

function cloneModel(model: BitmapFontModel): BitmapFontModel {
  return {
    info: { ...model.info, extraAttrs: model.info.extraAttrs ? { ...model.info.extraAttrs } : undefined },
    common: { ...model.common, extraAttrs: model.common.extraAttrs ? { ...model.common.extraAttrs } : undefined },
    pages: model.pages.map((p) => ({ ...p, extraAttrs: p.extraAttrs ? { ...p.extraAttrs } : undefined })),
    chars: model.chars.map((c) => ({ ...c, extraAttrs: c.extraAttrs ? { ...c.extraAttrs } : undefined })),
    kernings: model.kernings.map((k) => ({ ...k, extraAttrs: k.extraAttrs ? { ...k.extraAttrs } : undefined })),
  }
}

function makeCanvas(side: number): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    throw new Error('repackBitmapFontAtlasToPowerOfTwoSquare requires a browser DOM.')
  }
  const c = document.createElement('canvas')
  c.width = side
  c.height = side
  return c
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b)
        else reject(new Error('Failed to encode repacked atlas as PNG.'))
      },
      'image/png',
      1
    )
  })
  return new Uint8Array(await blob.arrayBuffer())
}

function patchCharAtlasRect(c: BitmapFontChar, x: number, y: number): BitmapFontChar {
  return { ...c, x, y }
}

/**
 * Repack atlas page(s) into square power-of-two PNG(s). Does not mutate the input model.
 * Multi-page fonts: each page is repacked independently; all output PNGs use sharedSide × sharedSide
 * (smaller packs are exported as transparent square canvases at the shared size).
 */
export async function repackBitmapFontAtlasToPowerOfTwoSquare(
  model: BitmapFontModel,
  atlasImages: AtlasPageSource[],
  options?: RepackAtlasOptions
): Promise<RepackAtlasOutcome> {
  if (typeof document === 'undefined') {
    return { ok: false, error: 'Atlas repack is only available in the browser.' }
  }

  const paddingPx = options?.paddingPx ?? 2
  const sw = model.common.scaleW
  const sh = model.common.scaleH

  if (model.pages.length === 0) {
    return { ok: false, error: 'Font has no atlas pages to repack.' }
  }

  const imageByPage = new Map<number, AtlasPageSource>()
  for (const src of atlasImages) {
    imageByPage.set(src.pageId, src)
  }

  for (const p of model.pages) {
    const src = imageByPage.get(p.id)
    if (!src) {
      return { ok: false, error: `Missing atlas image for page id ${p.id}.` }
    }
    if (src.width !== sw || src.height !== sh) {
      return {
        ok: false,
        error: `Atlas page ${p.id} is ${src.width}×${src.height} but <common> expects ${sw}×${sh}. Fix atlas dimensions before repacking.`,
      }
    }
  }

  const pageIds = [...model.pages].sort((a, b) => a.id - b.id).map((p) => p.id)
  const perPagePlans = new Map<number, ReturnType<typeof planSquarePo2Pack>>()

  for (const pageId of pageIds) {
    const pageChars = model.chars.filter((c) => charAtlasPage(c) === pageId)
    perPagePlans.set(pageId, planSquarePo2Pack(pageChars, paddingPx))
  }

  let sharedSide = 1
  for (const plan of perPagePlans.values()) {
    sharedSide = Math.max(sharedSide, plan.side)
  }

  if (sharedSide > MAX_CANVAS_SIDE) {
    return {
      ok: false,
      error: `Repacked atlas would be ${sharedSide}×${sharedSide}, which exceeds the browser limit (${MAX_CANVAS_SIDE}px). Reduce glyph count or size.`,
    }
  }

  const testCtx = makeCanvas(1).getContext('2d')
  if (!testCtx || typeof testCtx.drawImage !== 'function') {
    return { ok: false, error: 'Canvas 2D is not available for atlas repack.' }
  }

  const pngBytesByPageId = new Map<number, Uint8Array>()
  const charPatches = new Map<number, { x: number; y: number }>()

  for (const pageId of pageIds) {
    const src = imageByPage.get(pageId)!
    const plan = perPagePlans.get(pageId)!
    const canvas = makeCanvas(sharedSide)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return { ok: false, error: 'Canvas 2D context unavailable.' }
    }
    ctx.clearRect(0, 0, sharedSide, sharedSide)

    for (const { char: c, x, y } of plan.placements) {
      if (c.width > 0 && c.height > 0) {
        ctx.drawImage(src.image, c.x, c.y, c.width, c.height, x, y, c.width, c.height)
      }
      charPatches.set(c.id, { x, y })
    }

    try {
      pngBytesByPageId.set(pageId, await canvasToPngBytes(canvas))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, error: msg || 'Failed to encode repacked atlas PNG.' }
    }
  }

  const exportModel = cloneModel(model)
  exportModel.common = {
    ...exportModel.common,
    scaleW: sharedSide,
    scaleH: sharedSide,
  }

  exportModel.chars = exportModel.chars.map((c) => {
    const patch = charPatches.get(c.id)
    if (!patch) return c
    return patchCharAtlasRect(c, patch.x, patch.y)
  })

  const diags = bitmapFontDiagnostics(exportModel)
  const bad = diags.filter((d) => d.code === 'glyph_outside_atlas' || d.code === 'char_page_missing')
  if (bad.length > 0) {
    return {
      ok: false,
      error: `Repacked font failed validation: ${bad[0]!.message}`,
    }
  }

  return { ok: true, model: exportModel, pngBytesByPageId }
}
