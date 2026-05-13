import type { BitmapFontChar } from './types'
import { computeUniformFitScale, PREVIEW_SCALE_MAX, PREVIEW_SCALE_MIN } from './previewFitRect'

export type TextureViewOptions = {
  imageUrl: string
  chars: BitmapFontChar[]
  selectedCharId: number | null
  scaleW: number
  scaleH: number
  /** When false, hide glyph rectangles */
  showOutlines?: boolean
  onRectDragEnd?: (charId: number, rect: Pick<BitmapFontChar, 'x' | 'y' | 'width' | 'height'>) => void
}

/**
 * Canvas: atlas image + glyph boxes; wheel zoom, drag pan; optional drag to move glyph rect.
 */
export class BitmapFontTextureView {
  private wrap: HTMLElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private img: HTMLImageElement | null = null
  private scale = 1
  private panX = 0
  private panY = 0
  private opts: TextureViewOptions
  private dragging: {
    charId: number
    startMx: number
    startMy: number
    origX: number
    origY: number
  } | null = null
  /** Visual-only position while dragging (does not mutate model until mouseup). */
  private dragPos: { charId: number; x: number; y: number } | null = null
  private panning: { sx: number; sy: number; px: number; py: number } | null = null
  private imgSize = { w: 1, h: 1 }
  private logicalW = 400
  private logicalH = 300
  private deviceW = 0
  private deviceH = 0
  /** After wheel zoom or pan, do not auto-fit on resize / reload until a new atlas `imageUrl` loads. */
  private userAdjustedTextureTransform = false
  /** URL of the last successfully loaded atlas image (for detecting atlas changes). */
  private lastImageUrl: string | null = null

  constructor(container: HTMLElement, initial: TextureViewOptions) {
    this.opts = initial
    this.wrap = document.createElement('div')
    this.wrap.style.position = 'relative'
    this.wrap.style.width = '100%'
    this.wrap.style.height = '100%'
    this.wrap.style.overflow = 'hidden'
    this.wrap.style.cursor = 'grab'

    this.canvas = document.createElement('canvas')
    this.canvas.style.display = 'block'
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    this.wrap.appendChild(this.canvas)
    container.appendChild(this.wrap)

    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('2d context')
    this.ctx = ctx

    this.loadImage(initial.imageUrl)
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false })
    this.canvas.addEventListener('mousedown', this.onDown)
    window.addEventListener('mousemove', this.onMove)
    window.addEventListener('mouseup', this.onUp)
  }

  setOptions(partial: Partial<TextureViewOptions>) {
    this.opts = { ...this.opts, ...partial }
    if (partial.imageUrl != null) this.loadImage(partial.imageUrl)
    else this.redraw()
  }

  resize(width: number, height: number) {
    const nextW = Math.max(1, Math.round(width))
    const nextH = Math.max(1, Math.round(height))
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
    const nextDeviceW = Math.floor(nextW * dpr)
    const nextDeviceH = Math.floor(nextH * dpr)

    const changed =
      nextW !== Math.round(this.logicalW) ||
      nextH !== Math.round(this.logicalH) ||
      nextDeviceW !== this.deviceW ||
      nextDeviceH !== this.deviceH

    this.logicalW = nextW
    this.logicalH = nextH
    if (!changed) return

    this.deviceW = nextDeviceW
    this.deviceH = nextDeviceH
    this.canvas.width = nextDeviceW
    this.canvas.height = nextDeviceH
    if (!this.userAdjustedTextureTransform) {
      this.applyTextureAutoFit()
    }
    this.redraw()
  }

  destroy() {
    this.canvas.removeEventListener('wheel', this.onWheel)
    this.canvas.removeEventListener('mousedown', this.onDown)
    window.removeEventListener('mousemove', this.onMove)
    window.removeEventListener('mouseup', this.onUp)
    this.wrap.remove()
    this.img = null
    this.userAdjustedTextureTransform = false
    this.lastImageUrl = null
  }

  private loadImage(url: string) {
    if (this.lastImageUrl != null && this.lastImageUrl !== url) {
      this.userAdjustedTextureTransform = false
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      this.img = img
      this.imgSize = { w: img.naturalWidth, h: img.naturalHeight }
      this.lastImageUrl = url
      this.applyTextureAutoFit()
      this.redraw()
    }
    img.onerror = () => {
      this.img = null
      this.redraw()
    }
    img.src = url
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const { x: lx, y: ly } = this.clientToLogical(e.clientX, e.clientY)
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const oldScale = this.scale
    const newScale = Math.min(PREVIEW_SCALE_MAX, Math.max(PREVIEW_SCALE_MIN, oldScale * factor))
    if (newScale === oldScale) return

    this.userAdjustedTextureTransform = true
    const lw = this.logicalW
    const lh = this.logicalH
    const iw = this.imgSize.w
    const ih = this.imgSize.h
    const ax = (lx - lw / 2 - this.panX) / oldScale + iw / 2
    const ay = (ly - lh / 2 - this.panY) / oldScale + ih / 2
    this.scale = newScale
    this.panX = lx - lw / 2 - (ax - iw / 2) * newScale
    this.panY = ly - lh / 2 - (ay - ih / 2) * newScale
    this.redraw()
  }

  private clientToLogical(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect()
    return { x: clientX - r.left, y: clientY - r.top }
  }

  /** Atlas coords from logical canvas coords */
  private logicalToAtlas(lx: number, ly: number): { ax: number; ay: number } {
    const lw = this.logicalW
    const lh = this.logicalH
    const iw = this.imgSize.w
    const ih = this.imgSize.h
    const ax = (lx - lw / 2 - this.panX) / this.scale + iw / 2
    const ay = (ly - lh / 2 - this.panY) / this.scale + ih / 2
    return { ax, ay }
  }

  private onDown = (e: MouseEvent) => {
    const { x: lx, y: ly } = this.clientToLogical(e.clientX, e.clientY)
    const { ax, ay } = this.logicalToAtlas(lx, ly)

    if (e.button === 0 && this.opts.onRectDragEnd) {
      const hit = this.hitTest(ax, ay)
      if (hit != null) {
        const ch = this.opts.chars.find((c) => c.id === hit)
        if (ch && ch.width > 0 && ch.height > 0) {
          this.dragging = { charId: hit, startMx: e.clientX, startMy: e.clientY, origX: ch.x, origY: ch.y }
          return
        }
      }
    }
    this.panning = { sx: e.clientX, sy: e.clientY, px: this.panX, py: this.panY }
    this.wrap.style.cursor = 'grabbing'
  }

  private onMove = (e: MouseEvent) => {
    if (this.dragging && this.opts.onRectDragEnd) {
      const dx = (e.clientX - this.dragging.startMx) / this.scale
      const dy = (e.clientY - this.dragging.startMy) / this.scale
      this.dragPos = {
        charId: this.dragging.charId,
        x: Math.round(this.dragging.origX + dx),
        y: Math.round(this.dragging.origY + dy),
      }
      this.redraw()
      return
    }
    if (this.panning) {
      const nx = this.panning.px + (e.clientX - this.panning.sx)
      const ny = this.panning.py + (e.clientY - this.panning.sy)
      if (nx !== this.panning.px || ny !== this.panning.py) {
        this.userAdjustedTextureTransform = true
      }
      this.panX = nx
      this.panY = ny
      this.redraw()
    }
  }

  private onUp = () => {
    const dragging = this.dragging
    if (dragging && this.dragPos && this.opts.onRectDragEnd) {
      const ch = this.opts.chars.find((c) => c.id === dragging.charId)
      if (ch) {
        this.opts.onRectDragEnd(dragging.charId, {
          x: this.dragPos.x,
          y: this.dragPos.y,
          width: ch.width,
          height: ch.height,
        })
      }
    }
    this.dragging = null
    this.dragPos = null
    this.panning = null
    this.wrap.style.cursor = 'grab'
  }

  private hitTest(ax: number, ay: number): number | null {
    for (let i = this.opts.chars.length - 1; i >= 0; i--) {
      const c = this.opts.chars[i]!
      if (c.width <= 0 || c.height <= 0) continue
      if (ax >= c.x && ay >= c.y && ax <= c.x + c.width && ay <= c.y + c.height) return c.id
    }
    return null
  }

  /** Center atlas in the logical viewport with uniform scale so it fits (unless user zoomed/panned). */
  private applyTextureAutoFit(): void {
    if (this.userAdjustedTextureTransform || !this.img) return
    const iw = this.imgSize.w
    const ih = this.imgSize.h
    if (iw < 1 || ih < 1) return
    const lw = this.logicalW
    const lh = this.logicalH
    if (lw < 1 || lh < 1) return
    const pad = 16
    const s = computeUniformFitScale(iw, ih, lw, lh, pad, PREVIEW_SCALE_MIN, PREVIEW_SCALE_MAX)
    if (s == null) return
    this.scale = s
    this.panX = 0
    this.panY = 0
  }

  private redraw() {
    const ctx = this.ctx
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
    const lw = this.logicalW
    const lh = this.logicalH

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.scale(dpr, dpr)

    ctx.fillStyle = '#111827'
    ctx.fillRect(0, 0, lw, lh)

    const iw = this.imgSize.w
    const ih = this.imgSize.h

    ctx.save()
    ctx.translate(lw / 2 + this.panX, lh / 2 + this.panY)
    ctx.scale(this.scale, this.scale)
    ctx.translate(-iw / 2, -ih / 2)

    if (this.img) {
      ctx.drawImage(this.img, 0, 0)
    }

    const show = this.opts.showOutlines !== false
    if (show) {
      for (const c of this.opts.chars) {
        if (c.width <= 0 || c.height <= 0) continue
        const ox = this.dragPos?.charId === c.id ? this.dragPos.x : c.x
        const oy = this.dragPos?.charId === c.id ? this.dragPos.y : c.y
        const sel = this.opts.selectedCharId === c.id
        ctx.strokeStyle = sel ? '#22c55e' : 'rgba(129, 140, 248, 0.85)'
        ctx.lineWidth = (sel ? 2 : 1) / this.scale
        ctx.strokeRect(ox + 0.5 / this.scale, oy + 0.5 / this.scale, c.width, c.height)
      }
    }

    ctx.restore()
  }
}
