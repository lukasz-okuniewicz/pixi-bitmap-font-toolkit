import type { BitmapFontModel } from './types'
import { serializeBitmapFontXml } from './BitmapFontSerializer'
import { computeUniformFitScale, PREVIEW_SCALE_MAX, PREVIEW_SCALE_MIN } from './previewFitRect'

type PixiNs = typeof import('pixi.js-legacy')
type PixiTexture = InstanceType<PixiNs['Texture']>

export type BitmapFontPreviewOptions = {
  width: number
  height: number
  /** RGB hex e.g. 0x1f2937; omit for transparent */
  background?: number
}

/**
 * Bitmap font preview: reinstall font from serialized XML whenever the model changes.
 */
type PreviewContentRoot = {
  x: number
  y: number
  scale: { x: number; y: number; set: (v: number) => void }
  addChild: (c: unknown) => void
  removeChild: (c: unknown) => void
  getLocalBounds: () => { x: number; y: number; width: number; height: number }
}

export class BitmapFontPreview {
  private container: HTMLElement
  private opts: BitmapFontPreviewOptions
  private pixi: PixiNs | null = null
  private app: {
    stage: { addChild: (c: unknown) => void; removeChild: (c: unknown) => void }
    renderer: {
      resize: (w: number, h: number) => void
      render: (s: unknown) => void
      /** Backing-store / canvas buffer size (logical × resolution). */
      width: number
      height: number
      /** Logical stage size — matches DisplayObject global / `toLocal` space. */
      screen: { width: number; height: number }
    }
    view: HTMLCanvasElement
    destroy: (removeView?: boolean, opts?: { children?: boolean; texture?: boolean }) => void
  } | null = null
  /** Pan + zoom target for preview text (guides stay on stage). */
  private contentRoot: PreviewContentRoot | null = null
  private previewEventsBound = false
  private dragging: { startX: number; startY: number; origX: number; origY: number } | null = null
  private touchPanId: number | null = null
  private readonly hostCaptureOpts: AddEventListenerOptions = { passive: false, capture: true }
  private readonly touchMoveOpts: AddEventListenerOptions = { passive: false }
  private bitmapText: { x: number; y: number; anchor: { x: number; y: number }; destroy: (o?: boolean) => void } | null =
    null
  private guideGraphics: { clear: () => void; lineStyle: (w: number, c: number, a: number) => void; moveTo: (x: number, y: number) => void; lineTo: (x: number, y: number) => void; destroy: () => void } | null = null
  private showBaseline = false
  /** Horizontal line at BitmapText.y — matches anchor.y = 0.5 (vertical center of the text object). */
  private showAnchorCenterY = false
  private installedFace: string | null = null
  private destroyed = false
  private lineHeightRef = 16
  /** Latest-wins guard so overlapping async `sync()` calls cannot apply an older model after a newer one. */
  private syncGeneration = 0
  /** After wheel zoom or pan, do not auto-fit on sync/resize until a new font `face` is loaded. */
  private userAdjustedPreviewTransform = false

  constructor(container: HTMLElement, opts: BitmapFontPreviewOptions) {
    this.container = container
    this.opts = opts
  }

  setShowBaseline(on: boolean) {
    this.showBaseline = on
    this.drawGuides()
    this.renderOnce()
  }

  setShowAnchorCenterY(on: boolean) {
    this.showAnchorCenterY = on
    this.drawGuides()
    this.renderOnce()
  }

  /** Clear pan/zoom gesture state and fit preview text centered in the viewport (same as after font sync). */
  resetPreviewView(): void {
    if (this.destroyed || !this.app || !this.contentRoot || !this.bitmapText) return
    this.dragging = null
    this.touchPanId = null
    if (this.previewEventsBound) {
      this.container.style.cursor = 'grab'
    }
    this.userAdjustedPreviewTransform = false
    this.syncRendererSizeToHost()
    this.layoutPreviewText(this.bitmapText)
    this.applyAutoFitToViewport()
    this.drawGuides()
    this.renderOnce()
  }

  /**
   * Delta in font pixel units (BMFont `yoffset`) to add to every glyph so the preview string’s
   * axis-aligned bounds are vertically centered on this node’s origin (Anchor Y: `BitmapText.y`
   * with `anchor.y = 0.5`). `null` if nothing to adjust or already centered.
   */
  getUniformYoffsetDeltaForVisualCenter(): number | null {
    const PIXI = this.pixi
    const face = this.installedFace
    const root = this.contentRoot as unknown as { scale: { y: number } } | null
    if (!PIXI || !this.app || !this.bitmapText || !face || !root) return null
    const font = PIXI.BitmapFont.available[face]
    if (!font || font.size <= 0) return null
    this.renderOnce()
    const bt = this.bitmapText as unknown as {
      fontSize: number
      getBounds: () => { y: number; height: number }
      getGlobalPosition: (p: { x: number; y: number }, skipUpdate?: boolean) => { x: number; y: number }
    }
    const b = bt.getBounds()
    if (!b || b.height <= 0 || !Number.isFinite(b.y)) return null
    const centerGlobalY = b.y + b.height * 0.5
    const p = new PIXI.Point()
    bt.getGlobalPosition(p)
    const pixelShift = p.y - centerGlobalY
    const fontToLocal = bt.fontSize / font.size
    if (!Number.isFinite(fontToLocal) || fontToLocal <= 0) return null
    const zoomY = Number.isFinite(root.scale.y) ? Math.abs(root.scale.y) : 1
    const denom = fontToLocal * zoomY
    if (!Number.isFinite(denom) || denom <= 0) return null
    if (Math.abs(pixelShift) < denom * 0.5) return null
    const d = Math.round(pixelShift / denom)
    return d === 0 ? null : d
  }

  async init(): Promise<void> {
    if (this.app) return
    try {
      const mod = await import('pixi.js-legacy')
      if (this.destroyed) return
      const PIXI = (mod as { default?: PixiNs }).default ?? (mod as PixiNs)
      this.pixi = PIXI

      const canvas = document.createElement('canvas')
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      canvas.style.display = 'block'
      this.container.innerHTML = ''
      this.container.appendChild(canvas)

      const Application = PIXI.Application as unknown as new (opts: Record<string, unknown>) => {
        stage: unknown
        renderer: {
          resize: (w: number, h: number) => void
          render: (s: unknown) => void
          width: number
          height: number
        }
        view: HTMLCanvasElement
        destroy: (removeView?: boolean, opts?: { children?: boolean; texture?: boolean }) => void
      }

      const app = new Application({
        width: this.opts.width,
        height: this.opts.height,
        view: canvas,
        backgroundAlpha: this.opts.background != null ? 1 : 0,
        backgroundColor: this.opts.background,
        resolution: Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1),
        antialias: true,
        autoStart: false,
      })
      if (this.destroyed) {
        try {
          app.destroy(true, { children: true, texture: true })
        } catch {
          try {
            app.destroy(false)
          } catch {
            /* ignore */
          }
        }
        this.pixi = null
        this.container.innerHTML = ''
        return
      }
      this.app = app as BitmapFontPreview['app']
      const Container = PIXI.Container as unknown as new () => PreviewContentRoot
      const root = new Container()
      this.contentRoot = root
      ;(app.stage as { addChild: (c: unknown) => void }).addChild(root)
      this.bindPreviewInteractionEvents()
      this.syncRendererSizeToHost()
    } catch (e) {
      if (!this.destroyed) {
        console.error('[BitmapFontPreview] init failed', e)
      }
    }
  }

  resize(width: number, height: number) {
    this.opts.width = width
    this.opts.height = height
    if (!this.app) return
    try {
      this.app.renderer.resize(width, height)
    } catch {
      /* ignore */
    }
    if (this.bitmapText) {
      this.layoutPreviewText(this.bitmapText)
    }
    this.applyAutoFitToViewport()
    this.drawGuides()
    this.renderOnce()
  }

  /** ResizeObserver may run before Pixi `init()` finishes; keep renderer in sync with the host box. */
  private syncRendererSizeToHost() {
    if (!this.app) return
    try {
      const b = this.container.getBoundingClientRect()
      if (b.width < 1 || b.height < 1) return
      const w = Math.max(80, Math.round(b.width))
      const h = Math.max(80, Math.round(b.height))
      if (w === this.app.renderer.screen.width && h === this.app.renderer.screen.height) return
      this.app.renderer.resize(w, h)
      this.opts.width = w
      this.opts.height = h
      if (this.bitmapText) this.layoutPreviewText(this.bitmapText)
      this.applyAutoFitToViewport()
    } catch {
      /* ignore */
    }
  }

  /**
   * Drop installed font + preview text when the atlas no longer matches the BMFont XML (e.g. new image
   * uploaded before rebuilding metrics).
   */
  clearFontDisplay(): void {
    const root = this.contentRoot
    if (this.bitmapText && root) {
      try {
        root.removeChild(this.bitmapText)
      } catch {
        /* ignore */
      }
      try {
        this.bitmapText.destroy(true)
      } catch {
        /* ignore */
      }
      this.bitmapText = null
    }
    this.uninstallFont()
    this.drawGuides()
    this.renderOnce()
  }

  destroy() {
    this.destroyed = true
    this.userAdjustedPreviewTransform = false
    this.dragging = null
    this.touchPanId = null
    this.unbindPreviewCanvasEvents()
    this.uninstallFont()
    if (this.app) {
      try {
        this.app.destroy(true, { children: true, texture: true })
      } catch {
        try {
          this.app.destroy(false)
        } catch {
          /* ignore */
        }
      }
      this.app = null
    }
    this.contentRoot = null
    this.bitmapText = null
    this.guideGraphics = null
    this.pixi = null
    this.container.innerHTML = ''
  }

  private uninstallFont() {
    if (!this.pixi || !this.installedFace) return
    try {
      this.pixi.BitmapFont.uninstall(this.installedFace)
    } catch {
      /* ignore */
    }
    this.installedFace = null
  }

  async sync(model: BitmapFontModel, textureUrls: string[], previewText: string, xmlOverride?: string): Promise<void> {
    if (this.destroyed) return
    const gen = ++this.syncGeneration
    try {
      await this.init()
      if (this.destroyed || gen !== this.syncGeneration) return
      const PIXI = this.pixi
      const app = this.app
      if (!PIXI || !app) return

      if (textureUrls.length === 0) return
      const textures = await this.loadTexturesFromUrls(PIXI, textureUrls)
      if (!textures || this.destroyed || gen !== this.syncGeneration) return
      this.runSync(model, textures, previewText, xmlOverride, PIXI, app)
    } catch (e) {
      if (!this.destroyed) {
        console.error('[BitmapFontPreview] sync failed', e)
      }
    }
  }

  /**
   * Load via HTMLImageElement then Texture.from(image). Pixi's Texture.from(url) uses loaders that can
   * reject with DOM error events → "Uncaught (in promise) Event" spam; awaiting Image.onload avoids that.
   */
  private async loadTexturesFromUrls(PIXI: PixiNs, urls: string[]): Promise<PixiTexture[]> {
    const out = await Promise.all(urls.map((url) => this.loadTextureFromUrl(PIXI, url)))
    return out
  }

  private async loadTextureFromUrl(PIXI: PixiNs, url: string): Promise<PixiTexture> {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error(`Bitmap font page image failed to load: ${url}`))
      img.src = url
    })
    return PIXI.Texture.from(img)
  }

  private runSync(
    model: BitmapFontModel,
    textures: PixiTexture[],
    previewText: string,
    xmlOverride: string | undefined,
    PIXI: PixiNs,
    app: NonNullable<BitmapFontPreview['app']>
  ): void {
    const root = this.contentRoot
    if (!root) return

    const previousFace = this.installedFace
    this.lineHeightRef = model.common.lineHeight
    const xml = xmlOverride ?? serializeBitmapFontXml(model)
    const face = model.info.face
    if (previousFace != null && previousFace !== face) {
      this.userAdjustedPreviewTransform = false
    }

    if (this.bitmapText) {
      try {
        root.removeChild(this.bitmapText)
      } catch {
        /* ignore */
      }
      try {
        this.bitmapText.destroy(true)
      } catch {
        /* ignore */
      }
      this.bitmapText = null
    }
    if (this.guideGraphics) {
      try {
        app.stage.removeChild(this.guideGraphics)
      } catch {
        /* ignore */
      }
      try {
        this.guideGraphics.destroy()
      } catch {
        /* ignore */
      }
      this.guideGraphics = null
    }

    if (this.installedFace && this.installedFace !== face) {
      this.uninstallFont()
    }
    if (PIXI.BitmapFont.available[face]) {
      try {
        PIXI.BitmapFont.uninstall(face)
      } catch {
        /* ignore */
      }
    }

    const wantW = model.common.scaleW
    const wantH = model.common.scaleH
    for (let i = 0; i < textures.length; i++) {
      const t = textures[i]!
      const tw = t.baseTexture.width
      const th = t.baseTexture.height
      if (tw !== wantW || th !== wantH) {
        console.warn(
          `[BitmapFontPreview] skipping install: atlas page ${i} is ${tw}×${th} but <common> expects scaleW="${wantW}" scaleH="${wantH}". Rebuild font data or fix scale fields.`
        )
        this.installedFace = null
        this.renderOnce()
        return
      }
    }

    try {
      PIXI.BitmapFont.install(xml, textures.length === 1 ? textures[0]! : textures, true)
    } catch (e) {
      console.error('[BitmapFontPreview] install failed', e)
      this.installedFace = null
      this.renderOnce()
      return
    }
    this.installedFace = face

    const BitmapTextCtor = PIXI.BitmapText as unknown as new (text: string, style: { fontName: string }) => {
      x: number
      y: number
      anchor: { x: number; y: number }
      destroy: (o?: boolean) => void
    }
    const bt = new BitmapTextCtor(previewText || ' ', { fontName: face })
    this.layoutPreviewText(bt)
    this.bitmapText = bt as NonNullable<BitmapFontPreview['bitmapText']>
    root.addChild(bt)

    const G = PIXI.Graphics as unknown as new () => typeof this.guideGraphics
    const g = new G()
    this.guideGraphics = g
    ;(app.stage as { addChild: (c: unknown) => void }).addChild(g)
    this.syncRendererSizeToHost()
    this.renderOnce()
    this.drawGuides()
    this.applyAutoFitToViewport()
    this.drawGuides()
    this.renderOnce()
  }

  /** Uniform scale + pan on `contentRoot` so preview text fits the viewport (unless user zoomed/panned). */
  private applyAutoFitToViewport(): void {
    if (this.destroyed || this.userAdjustedPreviewTransform) return
    const app = this.app
    const root = this.contentRoot
    if (!app || !root || !this.bitmapText) return

    const W = this.opts.width
    const H = this.opts.height
    if (W < 1 || H < 1) return

    const pad = 16
    root.x = 0
    root.y = 0
    root.scale.set(1)
    this.renderOnce()

    const lb = root.getLocalBounds()
    const bw = lb.width
    const bh = lb.height
    const s = computeUniformFitScale(bw, bh, W, H, pad, PREVIEW_SCALE_MIN, PREVIEW_SCALE_MAX)
    if (s == null) return

    const cx = lb.x + bw * 0.5
    const cy = lb.y + bh * 0.5
    root.scale.set(s)
    root.x = W * 0.5 - cx * s
    root.y = H * 0.5 - cy * s
  }

  /** Left padding, vertically centered in the preview viewport. */
  private layoutPreviewText(bt: { anchor: { x: number; y: number }; x: number; y: number }) {
    bt.anchor.x = 0
    bt.anchor.y = 0.5
    bt.x = 8
    bt.y = this.opts.height / 2
  }

  private drawGuides() {
    if (!this.app || !this.guideGraphics || !this.bitmapText) return
    const g = this.guideGraphics
    const w = this.opts.width
    g.clear()
    const bt = this.bitmapText
    if (this.showBaseline) {
      const lh = this.lineHeightRef
      if (lh > 0 && this.contentRoot && this.pixi) {
        const PIXI = this.pixi
        const face = this.installedFace
        const font = face ? PIXI.BitmapFont.available[face] : undefined
        const b = bt as unknown as { getBounds: () => { y: number }; fontSize: number }
        const top = b.getBounds().y
        const designSize = font && font.size > 0 ? font.size : b.fontSize
        const fontToLocal = designSize > 0 && Number.isFinite(b.fontSize) ? b.fontSize / designSize : 1
        const root = this.contentRoot as unknown as { scale: { y: number } }
        const zoomY = Number.isFinite(root.scale.y) ? root.scale.y : 1
        const baselineY = top + lh * fontToLocal * zoomY
        g.lineStyle(1, 0xff4444, 0.8)
        g.moveTo(0, baselineY)
        g.lineTo(w, baselineY)
      }
    }
    if (this.showAnchorCenterY) {
      const PIXI = this.pixi
      if (PIXI) {
        const p = new PIXI.Point(bt.x, bt.y)
        const parent = (bt as unknown as { parent?: { toGlobal: (src: unknown, dst?: unknown) => unknown } }).parent
        if (parent) parent.toGlobal(p as never, p as never)
        const centerY = p.y
        g.lineStyle(1, 0x38bdf8, 0.85)
        g.moveTo(0, centerY)
        g.lineTo(w, centerY)
      }
    }
  }

  /** Map client coordinates to Pixi **screen** space (logical px), not canvas buffer pixels. */
  private clientToRenderer(clientX: number, clientY: number): { x: number; y: number } {
    if (!this.app) return { x: 0, y: 0 }
    const rect = this.container.getBoundingClientRect()
    const rw = this.app.renderer.screen.width
    const rh = this.app.renderer.screen.height
    if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }
    return {
      x: ((clientX - rect.left) / rect.width) * rw,
      y: ((clientY - rect.top) / rect.height) * rh,
    }
  }

  private bindPreviewInteractionEvents() {
    if (this.previewEventsBound) return
    const el = this.container
    el.style.cursor = 'grab'
    el.style.touchAction = 'none'
    ;(el.style as CSSStyleDeclaration & { userSelect?: string }).userSelect = 'none'
    el.addEventListener('wheel', this.onPreviewWheel, this.hostCaptureOpts)
    el.addEventListener('mousedown', this.onPreviewMouseDown, this.hostCaptureOpts)
    el.addEventListener('touchstart', this.onPreviewTouchStart, this.hostCaptureOpts)
    window.addEventListener('mousemove', this.onPreviewMouseMove)
    window.addEventListener('mouseup', this.onPreviewMouseUp)
    window.addEventListener('touchmove', this.onPreviewTouchMove, this.touchMoveOpts)
    window.addEventListener('touchend', this.onPreviewTouchEnd)
    window.addEventListener('touchcancel', this.onPreviewTouchEnd)
    this.previewEventsBound = true
  }

  private unbindPreviewCanvasEvents() {
    if (!this.previewEventsBound) return
    const el = this.container
    el.removeEventListener('wheel', this.onPreviewWheel, this.hostCaptureOpts)
    el.removeEventListener('mousedown', this.onPreviewMouseDown, this.hostCaptureOpts)
    el.removeEventListener('touchstart', this.onPreviewTouchStart, this.hostCaptureOpts)
    window.removeEventListener('mousemove', this.onPreviewMouseMove)
    window.removeEventListener('mouseup', this.onPreviewMouseUp)
    window.removeEventListener('touchmove', this.onPreviewTouchMove, this.touchMoveOpts)
    window.removeEventListener('touchend', this.onPreviewTouchEnd)
    window.removeEventListener('touchcancel', this.onPreviewTouchEnd)
    this.previewEventsBound = false
  }

  private readonly onPreviewWheel = (e: WheelEvent) => {
    const PIXI = this.pixi
    if (!this.app || !this.contentRoot || !PIXI) return
    if (!this.container.contains(e.target as Node)) return
    e.preventDefault()
    e.stopPropagation()
    this.syncRendererSizeToHost()
    const cr = this.contentRoot as unknown as {
      x: number
      y: number
      scale: { x: number; set: (v: number) => void }
      toLocal: (p: InstanceType<PixiNs['Point']>, from?: unknown, point?: InstanceType<PixiNs['Point']>) => InstanceType<PixiNs['Point']>
      toGlobal: (p: InstanceType<PixiNs['Point']>, point?: InstanceType<PixiNs['Point']>) => InstanceType<PixiNs['Point']>
    }
    const { x: mx, y: my } = this.clientToRenderer(e.clientX, e.clientY)
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const oldScale = cr.scale.x
    const newScale = Math.min(PREVIEW_SCALE_MAX, Math.max(PREVIEW_SCALE_MIN, oldScale * factor))
    if (newScale === oldScale) return

    this.userAdjustedPreviewTransform = true
    const global = new PIXI.Point(mx, my)
    const local = cr.toLocal(global)
    cr.scale.set(newScale)
    const after = cr.toGlobal(local)
    cr.x += mx - after.x
    cr.y += my - after.y
    this.drawGuides()
    this.renderOnce()
  }

  private readonly onPreviewMouseDown = (e: MouseEvent) => {
    if (!this.app || !this.contentRoot) return
    if (e.button !== 0) return
    if (!this.container.contains(e.target as Node)) return
    e.preventDefault()
    const p = this.clientToRenderer(e.clientX, e.clientY)
    this.dragging = { startX: p.x, startY: p.y, origX: this.contentRoot.x, origY: this.contentRoot.y }
    this.container.style.cursor = 'grabbing'
  }

  private readonly onPreviewMouseMove = (e: MouseEvent) => {
    if (!this.dragging || !this.app || !this.contentRoot) return
    if ((e.buttons & 1) === 0) {
      this.onPreviewMouseUp()
      return
    }
    const p = this.clientToRenderer(e.clientX, e.clientY)
    const nx = this.dragging.origX + (p.x - this.dragging.startX)
    const ny = this.dragging.origY + (p.y - this.dragging.startY)
    if (nx !== this.dragging.origX || ny !== this.dragging.origY) {
      this.userAdjustedPreviewTransform = true
    }
    this.contentRoot.x = nx
    this.contentRoot.y = ny
    this.drawGuides()
    this.renderOnce()
  }

  private readonly onPreviewMouseUp = () => {
    if (!this.dragging) return
    this.dragging = null
    this.container.style.cursor = 'grab'
  }

  private readonly onPreviewTouchStart = (e: TouchEvent) => {
    if (!this.app || !this.contentRoot || e.touches.length !== 1) return
    if (!this.container.contains(e.target as Node)) return
    const t = e.touches[0]!
    this.touchPanId = t.identifier
    const p = this.clientToRenderer(t.clientX, t.clientY)
    this.dragging = { startX: p.x, startY: p.y, origX: this.contentRoot.x, origY: this.contentRoot.y }
    this.container.style.cursor = 'grabbing'
  }

  private readonly onPreviewTouchMove = (e: TouchEvent) => {
    if (this.touchPanId == null || !this.dragging || !this.app || !this.contentRoot) return
    const t = Array.from(e.touches).find((x) => x.identifier === this.touchPanId)
    if (!t) return
    e.preventDefault()
    const p = this.clientToRenderer(t.clientX, t.clientY)
    const nx = this.dragging.origX + (p.x - this.dragging.startX)
    const ny = this.dragging.origY + (p.y - this.dragging.startY)
    if (nx !== this.dragging.origX || ny !== this.dragging.origY) {
      this.userAdjustedPreviewTransform = true
    }
    this.contentRoot.x = nx
    this.contentRoot.y = ny
    this.drawGuides()
    this.renderOnce()
  }

  private readonly onPreviewTouchEnd = (e: TouchEvent) => {
    if (this.touchPanId == null) return
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i]!.identifier === this.touchPanId) {
        this.touchPanId = null
        this.dragging = null
        this.container.style.cursor = 'grab'
        return
      }
    }
  }

  private renderOnce() {
    if (!this.app) return
    try {
      this.app.renderer.render(this.app.stage)
    } catch {
      /* ignore */
    }
  }
}
