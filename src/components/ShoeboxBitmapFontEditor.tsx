'use client'

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, startTransition } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'

import {
  addKerning,
  bitmapFontDiagnostics,
  charAtlasPage,
  detectIndentFromXml,
  parseBitmapFont,
  patchChar,
  patchCharById,
  patchKerning,
  removeKerningAt,
  serializeBitmapFontText,
  serializeBitmapFontXml,
  setCommon,
  setInfo,
  utf8ToUint8,
  verifyBitmapFontXmlRoundTrip,
  zipBitmapFontFiles,
} from '@/lib/bitmapFont'
import { isBitmapFontBinaryMagic, parseBitmapFontBinary, serializeBitmapFontBinary } from '@/lib/bitmapFont/BitmapFontBinary'
import {
  BitmapFontCharTable,
  glyphLabelForCode,
  type BitmapFontBulkPreset,
  type BitmapFontCharTableHandle,
} from '@/lib/bitmapFont/BitmapFontCharTable'
import { BitmapFontKerningEditor, type BitmapFontKerningEditorHandle } from '@/lib/bitmapFont/BitmapFontKerningEditor'
import { BitmapFontPreview } from '@/lib/bitmapFont/BitmapFontPreview'
import { BitmapFontTextureView } from '@/lib/bitmapFont/BitmapFontTextureView'
import type { BitmapFontChar, BitmapFontModel } from '@/lib/bitmapFont/types'
import type { BitmapFontDiagnosticTarget, BitmapFontDiagnosticLevel } from '@/lib/bitmapFont'
import { defaultBitmapFontModel, globalXAdvanceValue } from '@/lib/bitmapFont/types'
import { isBitmapFontXmlString } from '@/lib/bitmapFont/isBitmapFontXml'
import { charsetStripToModel } from '@/lib/bitmapFont/charsetStripToModel'
import { decodeImageFileToImageData } from '@/lib/bitmapFont/decodeImageFileToImageData'
import {
  clearBitmapFontSession,
  loadBitmapFontSession,
  saveBitmapFontSession,
  type BitmapFontSessionRecordV1,
} from '@/lib/bitmapFont/bitmapFontSessionDb'
import { initialModelHistoryState, modelHistoryReducer } from '@/lib/bitmapFont/modelHistoryReducer'
import { rasterizeFontToModel } from '@/lib/bitmapFont/rasterizeFontToModel'
import { withBasePath } from '@/lib/withBasePath'
import { ScrubNumberInput } from '@/components/ScrubNumberInput'
import { ShoeboxHelpSection } from '@/components/ShoeboxHelpSection'
import { WithTooltip, SHOEBOX_GLYPH_POPOVER_Z_INDEX, SHOEBOX_TOOLTIP_ABOVE_POPOVER_Z_INDEX } from '@/components/WithTooltip'

const GLYPH_POPOVER_TIP_PORTAL_Z = SHOEBOX_TOOLTIP_ABOVE_POPOVER_Z_INDEX

const GLYPH_POPOVER_FIELD_TIPS = {
  atlasX: 'Left position of glyph rectangle in the texture atlas (pixels).',
  atlasY: 'Top position of glyph rectangle in the texture atlas (pixels).',
  width: 'Glyph rectangle width in the texture atlas (pixels).',
  height: 'Glyph rectangle height in the texture atlas (pixels).',
  xoffset: 'Horizontal drawing offset from pen position (pixels).',
  yoffset: 'Vertical drawing offset from baseline or pen position (pixels).',
  xadvance:
    'Per-glyph horizontal advance added on top of Global advance X; the BMFont file stores global + this as each char’s xadvance (pixels).',
  showAtlasRect:
    'Show Atlas X/Y, width, and height in this dialog and in the character table. You can still drag glyph rectangles on the texture preview when this is off.',
} as const

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i >= 0 ? p.slice(i + 1) : p
}

/** Short human-readable label for a code point in coverage / diagnostics text. */
function glyphHintForCodePoint(id: number): string {
  const named: Record<number, string> = {
    0x0: 'NUL',
    0x9: 'tab',
    0xa: 'LF (line feed)',
    0xb: 'vertical tab',
    0xc: 'form feed',
    0xd: 'CR (carriage return)',
    0x20: 'space',
    0x85: 'NEL',
    0xa0: 'NBSP',
    0xad: 'SHY (soft hyphen)',
    0x200b: 'ZWSP',
    0x200c: 'ZWNJ',
    0x200d: 'ZWJ',
    0x2028: 'line separator',
    0x2029: 'paragraph separator',
    0x2060: 'WJ',
    0xfeff: 'BOM',
    0x3000: 'ideographic space',
  }
  const hit = named[id]
  if (hit) return hit
  if (id <= 0x1f) return `C0 control U+${id.toString(16).toUpperCase().padStart(2, '0')}`
  if (id === 0x7f) return 'DEL'
  if (id >= 0x80 && id <= 0x9f) return `C1 control U+${id.toString(16).toUpperCase().padStart(2, '0')}`
  const ch = String.fromCodePoint(id)
  const esc = ch
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t')
  return `'${esc}'`
}

/** Atlas image: MIME or common extension (some browsers leave type empty). */
function isLikelyAtlasImageFile(f: File): boolean {
  if (f.type.startsWith('image/')) return true
  return /\.(png|webp|jpe?g)$/i.test(f.name)
}

/** Batches ResizeObserver + skips redundant sizes to avoid canvas↔layout feedback loops. */
function observeElementSize(
  el: HTMLElement,
  onSize: (width: number, height: number) => void,
  opts?: { minWidth?: number; minHeight?: number }
): () => void {
  const minW = opts?.minWidth ?? 1
  const minH = opts?.minHeight ?? 1
  let raf = 0
  let lastW = -1
  let lastH = -1
  const ro = new ResizeObserver((entries) => {
    const entry = entries.find((e) => e.target === el)
    if (!entry) return
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => {
      const cr = entry.contentRect
      const w = Math.max(minW, Math.round(cr.width))
      const h = Math.max(minH, Math.round(cr.height))
      if (w === lastW && h === lastH) return
      lastW = w
      lastH = h
      onSize(w, h)
    })
  })
  try {
    ro.observe(el, { box: 'content-box' })
  } catch {
    ro.observe(el)
  }
  return () => {
    cancelAnimationFrame(raf)
    ro.disconnect()
  }
}

/** Host div height; ResizeObserver drives Pixi/texture sizing. */
const PREVIEW_HOST_HEIGHT = 'clamp(200px, 28vh, 360px)'

/** Pixi `fontName` for the loaded-snapshot preview only — avoids clobbering `model.info.face` in the global BitmapFont registry. */
const SHOEBOX_PREVIEW_BASELINE_FACE = '__shoebox_preview_baseline__'

function diagnosticLevelRank(level: BitmapFontDiagnosticLevel): number {
  if (level === 'error') return 0
  if (level === 'warn') return 1
  return 2
}

const themeLight = {
  text: '#111827',
  textMuted: '#6b7280',
  inputBg: '#fff',
  inputBorder: '#d1d5db',
  panelBorder: '#e5e7eb',
  pageBg: '#f9fafb',
}

const themeDark = {
  text: '#f9fafb',
  textMuted: '#9ca3af',
  inputBg: '#1f2937',
  inputBorder: '#374151',
  panelBorder: '#374151',
  pageBg: '#111827',
}

const DARK_UI_STORAGE_KEY = 'pixi-bitmap-font-toolkit-dark-ui'
/** Previous key; still read so existing users keep their theme preference. */
const DARK_UI_STORAGE_KEY_LEGACY = 'pixi-js-shoebox-dark-ui'

/** Bundled BMFont served from `public/` (see `public/bitmapFont.xml`). */
const EXAMPLE_FONT_XML_PATH = withBasePath('/bitmapFont.xml')
const EXAMPLE_FONT_PNG_PATH = withBasePath('/bitmapFont.png')

const SESSION_DISMISS_STORAGE_KEY = 'pixi-bitmap-font-session-dismiss-savedAt'

const SHOW_ATLAS_RECT_COLS_STORAGE_KEY = 'pixi-bitmap-font-toolkit-show-atlas-rect-cols'

type ImportSourceTab = 'bmfont' | 'styledStrip' | 'rasterFont'

function parseImportTabParam(v: string | null): ImportSourceTab | null {
  if (v === 'bmfont' || v === 'styledStrip' || v === 'rasterFont') return v
  return null
}

function readDarkUiFromStorage(): boolean | null {
  if (typeof window === 'undefined') return null
  try {
    const raw =
      localStorage.getItem(DARK_UI_STORAGE_KEY) ?? localStorage.getItem(DARK_UI_STORAGE_KEY_LEGACY)
    if (raw === null) return null
    if (raw === '1' || raw === 'true') return true
    if (raw === '0' || raw === 'false') return false
    return null
  } catch {
    return null
  }
}

function readShowAtlasRectColsFromStorage(): boolean | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SHOW_ATLAS_RECT_COLS_STORAGE_KEY)
    if (raw === null) return null
    if (raw === '1' || raw === 'true') return true
    if (raw === '0' || raw === 'false') return false
    return null
  } catch {
    return null
  }
}

export default function ShoeboxBitmapFontEditor() {
  const searchParams = useSearchParams()

  /** Default dark; first paint matches SSR; then we apply localStorage if set. */
  const [darkTheme, setDarkThemeState] = useState(true)
  const [showAtlasRectColumns, setShowAtlasRectColumnsState] = useState(false)

  useEffect(() => {
    const v = readDarkUiFromStorage()
    if (v !== null) {
      startTransition(() => setDarkThemeState(v))
    }
  }, [])

  useEffect(() => {
    const v = readShowAtlasRectColsFromStorage()
    if (v !== null) {
      startTransition(() => setShowAtlasRectColumnsState(v))
    }
  }, [])

  const setShowAtlasRectColumns = useCallback((next: boolean) => {
    setShowAtlasRectColumnsState(next)
    try {
      localStorage.setItem(SHOW_ATLAS_RECT_COLS_STORAGE_KEY, next ? '1' : '0')
    } catch {
      /* ignore quota / private mode */
    }
  }, [])

  const setDarkTheme = useCallback((next: boolean) => {
    setDarkThemeState(next)
    try {
      localStorage.setItem(DARK_UI_STORAGE_KEY, next ? '1' : '0')
      localStorage.removeItem(DARK_UI_STORAGE_KEY_LEGACY)
    } catch {
      /* ignore quota / private mode */
    }
  }, [])
  const theme = darkTheme ? themeDark : themeLight
  const { text, textMuted, inputBg, inputBorder, panelBorder, pageBg } = theme
  const panelBg = darkTheme ? '#1e293b' : '#fff'

  const [stackPreviews, setStackPreviews] = useState(false)
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 720px)')
    const apply = () => setStackPreviews(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const cssVars = {
    '--shoebox-text': text,
    '--shoebox-muted': textMuted,
    '--shoebox-border': inputBorder,
    '--shoebox-panel-border': panelBorder,
    '--shoebox-panel-bg': panelBg,
    '--shoebox-input-bg': inputBg,
    '--shoebox-canvas-bg': darkTheme ? '#0f172a' : '#fff',
  } as React.CSSProperties

  const panelChrome: React.CSSProperties = {
    border: '1px solid var(--shoebox-panel-border)',
    borderRadius: 12,
    background: 'var(--shoebox-panel-bg)',
    padding: '16px 18px',
    marginBottom: 16,
  }

  const sectionTitle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    margin: '0 0 12px',
    color: 'var(--shoebox-text)',
    letterSpacing: '0.02em',
  }

  const subsectionLabel: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--shoebox-muted)',
    margin: '0 0 8px',
  }

  const chipStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--shoebox-muted)',
    background: darkTheme ? 'rgba(15, 23, 42, 0.55)' : '#f3f4f6',
    border: '1px solid var(--shoebox-border)',
    borderRadius: 8,
    padding: '5px 10px',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }

  const [xmlFileName, setXmlFileName] = useState<string | null>(null)
  const [pngFileName, setPngFileName] = useState<string | null>(null)
  const [textureObjectUrl, setTextureObjectUrl] = useState<string | null>(null)
  const textureObjectUrlRef = useRef<string | null>(null)
  /** Object URLs per BMFont `<page id="…">` for multi-page atlases. */
  const [pageAtlasUrls, setPageAtlasUrls] = useState<Record<number, string>>({})
  const pageAtlasUrlsRef = useRef<Record<number, string>>({})
  const [activeAtlasPageId, setActiveAtlasPageId] = useState(0)
  const atlasImageFileRef = useRef<File | null>(null)
  const lastRasterFontFaceRef = useRef<FontFace | null>(null)

  const [indent, setIndent] = useState('\t')
  const [histState, histDispatch] = useReducer(modelHistoryReducer, undefined, initialModelHistoryState)
  const model = histState.model
  const modelRef = useRef(model)

  /** Snapshot updated on every full model replace (`setModel(m, false)`) for per-field “restore loaded” controls. */
  const [baselineModel, setBaselineModel] = useState(() => structuredClone(initialModelHistoryState().model))

  const setModel = useCallback((update: React.SetStateAction<BitmapFontModel>, recordHistory = true) => {
    if (!recordHistory && typeof update !== 'function') {
      setBaselineModel(structuredClone(update))
    }
    histDispatch({ type: 'set', update, recordHistory })
  }, [])

  useLayoutEffect(() => {
    modelRef.current = model
  }, [model])
  const [previewText, setPreviewText] = useState('€ 123.456,90')
  const [selectedCharId, setSelectedCharId] = useState<number | null>(null)
  const [atlasGlyphPopover, setAtlasGlyphPopover] = useState<{
    charId: number
    anchorX: number
    anchorY: number
  } | null>(null)
  const atlasGlyphPopoverRef = useRef<HTMLDivElement>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lastSavedXml, setLastSavedXml] = useState<string | null>(null)
  const [showBaseline, setShowBaseline] = useState(false)
  const [showAnchorCenterY, setShowAnchorCenterY] = useState(false)
  const [showOutlines, setShowOutlines] = useState(true)
  const [showAdvanceOverlay, setShowAdvanceOverlay] = useState(false)
  /** Side-by-side Pixi: loaded snapshot (`baselineModel`) vs current edits. */
  const [comparePixiToBaseline, setComparePixiToBaseline] = useState(false)
  const charTableRef = useRef<BitmapFontCharTableHandle>(null)
  const kernEditorRef = useRef<BitmapFontKerningEditorHandle>(null)

  const closeAtlasGlyphPopover = useCallback(() => {
    setAtlasGlyphPopover(null)
  }, [])

  const onAtlasGlyphClick = useCallback((charId: number, clientX: number, clientY: number) => {
    setSelectedCharId(charId)
    setAtlasGlyphPopover({ charId, anchorX: clientX, anchorY: clientY })
    requestAnimationFrame(() => {
      charTableRef.current?.scrollToCharId(charId)
    })
  }, [])

  const [exportFileName, setExportFileName] = useState('font.xml')
  const [showHelp, setShowHelp] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(true)
  const [roundTripNote, setRoundTripNote] = useState<string | null>(null)
  const [sessionOffer, setSessionOffer] = useState<BitmapFontSessionRecordV1 | null>(null)

  const [importSourceTab, setImportSourceTab] = useState<ImportSourceTab>('bmfont')

  useEffect(() => {
    const t = parseImportTabParam(searchParams.get('tab'))
    if (t === null) return
    startTransition(() => setImportSourceTab(t))
  }, [searchParams])

  const setImportSourceTabFromUi = useCallback((tab: ImportSourceTab) => {
    setImportSourceTab(tab)
    // Keep `?tab=` in the address bar for bookmarks, but avoid `router.replace`:
    // App Router soft navigation can remount this client tree (and drop in-memory edits).
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    const next = url.pathname + url.search + url.hash
    window.history.replaceState(window.history.state, '', next)
  }, [])
  const [stripCharset, setStripCharset] = useState('$€£1234567890,. ')
  const [stripFace, setStripFace] = useState('StyledCharset')
  const [stripAlpha, setStripAlpha] = useState(8)
  const [stripMinGap, setStripMinGap] = useState(2)
  const [stripMinRowGap, setStripMinRowGap] = useState(3)
  const [stripTrimPad, setStripTrimPad] = useState(0)
  const [stripSpaceAdvance, setStripSpaceAdvance] = useState(8)
  const [stripDotCommaDetect, setStripDotCommaDetect] = useState(true)
  const [stripBusy, setStripBusy] = useState(false)

  const [rasterFontFile, setRasterFontFile] = useState<File | null>(null)
  const [rasterSize, setRasterSize] = useState(48)
  const [rasterCharset, setRasterCharset] = useState(
    '$€£1234567890,.'
  )
  const [rasterColor, setRasterColor] = useState('#111827')
  const [rasterAtlasMaxW, setRasterAtlasMaxW] = useState(2048)
  const [rasterPadding, setRasterPadding] = useState(2)
  const [rasterFace, setRasterFace] = useState('RasterFont')
  const [rasterPageFile, setRasterPageFile] = useState('font-atlas.png')
  const [rasterBusy, setRasterBusy] = useState(false)

  const [generatorNotes, setGeneratorNotes] = useState<string[]>([])
  const [initialFontLoading, setInitialFontLoading] = useState(true)

  const previewHostRef = useRef<HTMLDivElement>(null)
  const baselinePreviewHostRef = useRef<HTMLDivElement>(null)
  const textureHostRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<BitmapFontPreview | null>(null)
  const baselinePreviewRef = useRef<BitmapFontPreview | null>(null)
  const textureRef = useRef<BitmapFontTextureView | null>(null)
  /** Incremented when the user starts a load that must win over the bundled example fetch. */
  const fontSessionEpochRef = useRef(0)

  const serialized = serializeBitmapFontXml(model, { indent })
  const serializedFnt = useMemo(() => serializeBitmapFontText(model), [model])
  const dirty = lastSavedXml != null && serialized !== lastSavedXml
  const texUrl = textureObjectUrl ?? ''

  const previewTextureUrls = useMemo(() => {
    const sorted = [...model.pages].sort((a, b) => a.id - b.id)
    if (sorted.length === 0) return [] as string[]
    return sorted.map((p) => pageAtlasUrls[p.id] || texUrl)
  }, [model.pages, pageAtlasUrls, texUrl])

  const hasXml = lastSavedXml != null
  const ready = hasXml && previewTextureUrls.length > 0 && previewTextureUrls.every((u) => !!u)

  /** null = still measuring; preview only when true (atlas pixels must match &lt;common scaleW/scaleH&gt;). */
  const [atlasPixelMatchesCommon, setAtlasPixelMatchesCommon] = useState<boolean | null>(null)

  useEffect(() => {
    if (!ready || previewTextureUrls.length === 0) {
      queueMicrotask(() => setAtlasPixelMatchesCommon(null))
      return
    }
    const urls = previewTextureUrls
    const wantW = model.common.scaleW
    const wantH = model.common.scaleH
    let cancelled = false

    const measure = (url: string) =>
      new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = () => reject(new Error('atlas measure failed'))
        img.src = url
      })

    ;(async () => {
      try {
        for (const url of urls) {
          const { w, h } = await measure(url)
          if (cancelled) return
          if (w !== wantW || h !== wantH) {
            setAtlasPixelMatchesCommon(false)
            return
          }
        }
        if (!cancelled) setAtlasPixelMatchesCommon(true)
      } catch {
        if (!cancelled) setAtlasPixelMatchesCommon(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [ready, previewTextureUrls, model.common.scaleW, model.common.scaleH])

  /** Loaded snapshot expects atlas pixels to match its `common.scaleW` / `scaleH` (can differ from the live model after edits). */
  const [baselineAtlasPixelMatchesCommon, setBaselineAtlasPixelMatchesCommon] = useState<boolean | null>(null)

  useEffect(() => {
    if (!ready || previewTextureUrls.length === 0) {
      queueMicrotask(() => setBaselineAtlasPixelMatchesCommon(null))
      return
    }
    const urls = previewTextureUrls
    const wantW = baselineModel.common.scaleW
    const wantH = baselineModel.common.scaleH
    let cancelled = false

    const measure = (url: string) =>
      new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = () => reject(new Error('atlas measure failed'))
        img.src = url
      })

    ;(async () => {
      try {
        for (const url of urls) {
          const { w, h } = await measure(url)
          if (cancelled) return
          if (w !== wantW || h !== wantH) {
            setBaselineAtlasPixelMatchesCommon(false)
            return
          }
        }
        if (!cancelled) setBaselineAtlasPixelMatchesCommon(true)
      } catch {
        if (!cancelled) setBaselineAtlasPixelMatchesCommon(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [ready, previewTextureUrls, baselineModel.common.scaleW, baselineModel.common.scaleH])

  const baselinePreviewModel = useMemo(
    () => setInfo(structuredClone(baselineModel), { face: SHOEBOX_PREVIEW_BASELINE_FACE }),
    [baselineModel]
  )

  const diagnostics = useMemo(() => bitmapFontDiagnostics(model), [model])

  const sortedDiagnostics = useMemo(
    () => [...diagnostics].sort((a, b) => diagnosticLevelRank(a.level) - diagnosticLevelRank(b.level)),
    [diagnostics]
  )

  const diagnosticCounts = useMemo(() => {
    let errors = 0
    let warnings = 0
    let infos = 0
    for (const d of diagnostics) {
      if (d.level === 'error') errors++
      else if (d.level === 'warn') warnings++
      else infos++
    }
    return { errors, warnings, infos }
  }, [diagnostics])

  const pixiPreviewHostBg = useMemo(() => (darkTheme ? '#0f172a' : '#ffffff'), [darkTheme])

  const charIdMap = useMemo(() => {
    const m = new Map<number, BitmapFontChar>()
    for (const c of model.chars) m.set(c.id, c)
    return m
  }, [model.chars])

  const coverageReport = useMemo(() => {
    if (!previewText) return { missing: [] as number[], zero: [] as number[] }
    const seen = new Set<number>()
    const codes: number[] = []
    for (const ch of previewText) {
      const cp = ch.codePointAt(0)!
      if (seen.has(cp)) continue
      seen.add(cp)
      codes.push(cp)
    }
    const missing: number[] = []
    const zero: number[] = []
    for (const id of codes) {
      const ch = charIdMap.get(id)
      if (!ch) missing.push(id)
      else if (ch.width <= 0 || ch.height <= 0) zero.push(id)
    }
    return { missing, zero }
  }, [previewText, charIdMap])

  const applyDiagnosticTarget = useCallback((t: BitmapFontDiagnosticTarget) => {
    if (t.kind === 'char') {
      setSelectedCharId(t.id)
      void charTableRef.current?.scrollToCharId(t.id)
      return
    }
    if (t.kind === 'page') {
      setActiveAtlasPageId(t.id)
      return
    }
    if (t.kind === 'kerning') {
      requestAnimationFrame(() => {
        kernEditorRef.current?.scrollToPair(t.first, t.second)
      })
    }
  }, [])

  const pageFileHint = useMemo(() => {
    const pageFile = model.pages[0]?.file?.trim() ?? ''
    if (!pageFile || !pngFileName) return null
    if (basename(pageFile) !== basename(pngFileName)) {
      return `XML page file is "${pageFile}" but the uploaded image is "${basename(pngFileName)}". Preview uses your PNG; adjust the page file field before export if your runtime expects matching names.`
    }
    return null
  }, [model.pages, pngFileName])

  const atlasViewPageId = model.pages.some((p) => p.id === activeAtlasPageId)
    ? activeAtlasPageId
    : (model.pages[0]?.id ?? 0)

  const activeAtlasUrl = pageAtlasUrls[atlasViewPageId] || texUrl

  const charsOnActivePage = useMemo(
    () => model.chars.filter((c) => charAtlasPage(c) === atlasViewPageId),
    [model.chars, atlasViewPageId]
  )

  const atlasGlyphPopoverIndex = useMemo(() => {
    if (!atlasGlyphPopover) return -1
    return model.chars.findIndex((c) => c.id === atlasGlyphPopover.charId)
  }, [atlasGlyphPopover, model.chars])

  const atlasGlyphPopoverPosition = useMemo(() => {
    if (!atlasGlyphPopover) return null
    const pad = 12
    const w = 300
    const maxH = 420
    let left = atlasGlyphPopover.anchorX + 10
    let top = atlasGlyphPopover.anchorY + 10
    if (typeof window !== 'undefined') {
      left = Math.min(left, window.innerWidth - w - pad)
      left = Math.max(pad, left)
      top = Math.min(top, window.innerHeight - maxH - pad)
      top = Math.max(pad, top)
    }
    return { left, top, width: w }
  }, [atlasGlyphPopover])

  const atlasGlyphPopoverChar = useMemo(() => {
    if (atlasGlyphPopoverIndex < 0) return null
    const ch = model.chars[atlasGlyphPopoverIndex]
    if (!ch) return null
    const bk = baselineModel.chars.find((c) => c.id === ch.id)
    return { ch, bk }
  }, [atlasGlyphPopoverIndex, model.chars, baselineModel.chars])

  useEffect(() => {
    pageAtlasUrlsRef.current = pageAtlasUrls
  }, [pageAtlasUrls])

  const revokeAllPageAtlasUrls = useCallback(() => {
    for (const u of Object.values(pageAtlasUrlsRef.current)) {
      try {
        URL.revokeObjectURL(u)
      } catch {
        /* ignore */
      }
    }
    pageAtlasUrlsRef.current = {}
    setPageAtlasUrls({})
  }, [])

  const revokeCurrentTextureUrl = useCallback(() => {
    const u = textureObjectUrlRef.current
    if (u) {
      try {
        URL.revokeObjectURL(u)
      } catch {
        /* ignore */
      }
      textureObjectUrlRef.current = null
    }
  }, [])

  const revokeAllTextures = useCallback(() => {
    revokeAllPageAtlasUrls()
    revokeCurrentTextureUrl()
    setTextureObjectUrl(null)
  }, [revokeAllPageAtlasUrls, revokeCurrentTextureUrl])

  const releaseRasterFont = useCallback(() => {
    const f = lastRasterFontFaceRef.current
    if (f) {
      try {
        document.fonts.delete(f)
      } catch {
        /* ignore */
      }
      lastRasterFontFaceRef.current = null
    }
  }, [])

  const loadPngFromFile = useCallback(
    (f: File, primaryPageIdOverride?: number) => {
      atlasImageFileRef.current = f
      revokeAllTextures()
      const url = URL.createObjectURL(f)
      const pid = primaryPageIdOverride ?? modelRef.current.pages[0]?.id ?? 0
      pageAtlasUrlsRef.current = { [pid]: url }
      setPageAtlasUrls({ [pid]: url })
      textureObjectUrlRef.current = url
      setTextureObjectUrl(url)
      setActiveAtlasPageId(pid)
      setPngFileName(f.name)
      setGeneratorNotes([])
    },
    [revokeAllTextures]
  )

  /** Parse BMFont XML text and update editor state (synchronous). Returns the parsed model or null. */
  const applyXmlString = useCallback((textBody: string, displayFileName: string): BitmapFontModel | null => {
    try {
      if (!isBitmapFontXmlString(textBody).isBitmapFont) return null
      const m = parseBitmapFont(textBody)
      const ind = detectIndentFromXml(textBody)
      setIndent(ind)
      setModel(m, false)
      setLastSavedXml(serializeBitmapFontXml(m, { indent: ind }))
      setXmlFileName(displayFileName)
      setExportFileName(
        displayFileName.endsWith('.xml') || displayFileName.endsWith('.fnt') ? displayFileName : `${displayFileName}.xml`
      )
      setSelectedCharId(null)
      setLoadError(null)
      setGeneratorNotes([])
      return m
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setLoadError(msg)
      return null
    }
  }, [setModel])

  /** Try to parse BMFont from a file without throwing (for multi-select). */
  const tryLoadXmlFromFile = useCallback(
    async (f: File): Promise<BitmapFontModel | null> => {
      try {
        const buf = await f.arrayBuffer()
        const u8 = new Uint8Array(buf)
        if (isBitmapFontBinaryMagic(u8)) {
          const m = parseBitmapFontBinary(u8)
          const ind = '\t'
          setIndent(ind)
          setModel(m, false)
          setLastSavedXml(serializeBitmapFontXml(m, { indent: ind }))
          setXmlFileName(f.name)
          const raw = f.name.replace(/^.*[/\\]/, '')
          const stem = raw.replace(/\.[^.]+$/i, '') || 'font'
          setExportFileName(`${stem}.xml`)
          setSelectedCharId(null)
          setLoadError(null)
          setGeneratorNotes([])
          return m
        }
        const textBody = new TextDecoder('utf-8', { fatal: false }).decode(u8)
        return applyXmlString(textBody, f.name)
      } catch {
        return null
      }
    },
    [applyXmlString, setModel]
  )

  const onPickFontFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return

    fontSessionEpochRef.current += 1

    const images = files.filter(isLikelyAtlasImageFile)
    const textCandidates = files.filter((f) => !isLikelyAtlasImageFile(f))

    let xmlOk = false
    let loadedModel: BitmapFontModel | null = null
    for (const f of textCandidates) {
      const m = await tryLoadXmlFromFile(f)
      if (m) {
        loadedModel = m
        xmlOk = true
        break
      }
    }

    if (images.length > 1 && loadedModel && loadedModel.pages.length > 0) {
      atlasImageFileRef.current = null
      revokeAllTextures()
      const sorted = [...loadedModel.pages].sort((a, b) => a.id - b.id)
      const next: Record<number, string> = {}
      for (let i = 0; i < sorted.length; i++) {
        const p = sorted[i]!
        const want = basename(p.file.trim())
        const hit =
          want && images.some((img) => basename(img.name) === want)
            ? images.find((img) => basename(img.name) === want)
            : images[i] ?? images[0]
        if (hit) next[p.id] = URL.createObjectURL(hit)
      }
      pageAtlasUrlsRef.current = next
      setPageAtlasUrls(next)
      const first = sorted[0]!
      const primaryUrl = next[first.id] ?? ''
      textureObjectUrlRef.current = primaryUrl || null
      setTextureObjectUrl(primaryUrl || null)
      setPngFileName(images[0]!.name)
      setActiveAtlasPageId(first.id)
      setGeneratorNotes([])
    } else if (images.length > 0) {
      loadPngFromFile(images[0]!, loadedModel?.pages[0]?.id)
    }

    if (textCandidates.length > 0 && !xmlOk) {
      setLoadError('No valid BMFont XML, ASCII .fnt, or binary BMF in the selection.')
      if (files.length === 1 && images.length === 0) {
        setLastSavedXml(null)
        setXmlFileName(null)
      }
    } else {
      setLoadError(null)
      setGeneratorNotes([])
    }
  }

  useEffect(() => {
    const ac = new AbortController()
    const epochAtStart = fontSessionEpochRef.current
    let bootstrapTextureUrl: string | null = null

    const resetToEmptyFont = () => {
      setModel(defaultBitmapFontModel(), false)
      setLastSavedXml(null)
      setXmlFileName(null)
      setPngFileName(null)
      revokeAllTextures()
      atlasImageFileRef.current = null
      setExportFileName('font.xml')
      setIndent('\t')
      setSelectedCharId(null)
      setGeneratorNotes([])
      setLoadError(null)
    }

    startTransition(() => {
      setInitialFontLoading(true)
    })

    ;(async () => {
      try {
        const [resXml, resPng] = await Promise.all([
          fetch(EXAMPLE_FONT_XML_PATH, { signal: ac.signal }),
          fetch(EXAMPLE_FONT_PNG_PATH, { signal: ac.signal }),
        ])
        if (ac.signal.aborted || fontSessionEpochRef.current !== epochAtStart) return
        if (!resXml.ok || !resPng.ok) {
          if (fontSessionEpochRef.current === epochAtStart) {
            setLoadError('Could not load the bundled example font (missing or HTTP error).')
          }
          return
        }
        const [xmlText, pngBuf] = await Promise.all([resXml.text(), resPng.arrayBuffer()])
        if (ac.signal.aborted || fontSessionEpochRef.current !== epochAtStart) return

        const loadedModel = applyXmlString(xmlText, 'bitmapFont.xml')
        if (!loadedModel) {
          if (fontSessionEpochRef.current === epochAtStart) {
            setLoadError('Bundled example font XML was not recognized as BMFont.')
          }
          return
        }
        if (ac.signal.aborted || fontSessionEpochRef.current !== epochAtStart) return

        const pngFile = new File([pngBuf], 'bitmapFont.png', { type: 'image/png' })
        loadPngFromFile(pngFile, loadedModel.pages[0]?.id ?? 0)
        bootstrapTextureUrl = textureObjectUrlRef.current
      } catch (err) {
        if (ac.signal.aborted || fontSessionEpochRef.current !== epochAtStart) return
        const msg = err instanceof Error ? err.message : String(err)
        setLoadError(`Could not load the bundled example font: ${msg}`)
      } finally {
        setInitialFontLoading(false)
      }
    })()

    return () => {
      ac.abort()
      if (bootstrapTextureUrl && textureObjectUrlRef.current === bootstrapTextureUrl) {
        try {
          URL.revokeObjectURL(bootstrapTextureUrl)
        } catch {
          /* ignore */
        }
        resetToEmptyFont()
      }
    }
  }, [applyXmlString, loadPngFromFile, revokeAllTextures, setModel])

  const onBuildFromStyledStrip = useCallback(async () => {
    const f = atlasImageFileRef.current
    if (!f) {
      setLoadError('Upload a PNG (or WebP/JPEG) atlas first using “Upload font files”, then run styled strip import.')
      return
    }
    fontSessionEpochRef.current += 1
    setStripBusy(true)
    setLoadError(null)
    setGeneratorNotes([])
    try {
      const charsetForBuild = stripCharset.includes('\u0020')
        ? stripCharset
        : `${stripCharset}\u0020`
      const imageData = await decodeImageFileToImageData(f)
      const pageFile = basename(f.name)
      const baseName = pageFile.replace(/\.[^.]+$/i, '') || 'font'
      const r = charsetStripToModel(imageData, charsetForBuild, {
        alphaThreshold: Math.max(0, Math.min(255, stripAlpha)),
        minGapPx: Math.max(1, stripMinGap),
        minRowGapPx: Math.max(1, stripMinRowGap),
        trimPadPx: Math.max(0, stripTrimPad),
        pageFile,
        face: stripFace.trim() || baseName,
        spaceAdvancePx: Math.max(1, stripSpaceAdvance),
        swapDotCommaByShape: stripDotCommaDetect,
      })
      if (!r.ok) {
        setLoadError(r.error)
        setGeneratorNotes(r.warnings)
        return
      }
      const ind = '\t'
      const m: BitmapFontModel = {
        ...r.model,
        info: { ...r.model.info, face: stripFace.trim() || r.model.info.face },
      }
      setModel(m, false)
      setIndent(ind)
      const xml = serializeBitmapFontXml(m, { indent: ind })
      setLastSavedXml(xml)
      setXmlFileName(`${baseName}.xml`)
      setExportFileName(`${baseName}.xml`)
      setGeneratorNotes(r.warnings)
      setSelectedCharId(null)
      if (charsetForBuild !== stripCharset) {
        setStripCharset(charsetForBuild)
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setStripBusy(false)
    }
  }, [stripCharset, stripFace, stripAlpha, stripMinGap, stripMinRowGap, stripTrimPad, stripSpaceAdvance, stripDotCommaDetect, setModel])

  const onRasterizeFont = useCallback(async () => {
    if (!rasterFontFile) {
      setLoadError('Choose a .ttf or .otf file for “Raster from font file”.')
      return
    }
    fontSessionEpochRef.current += 1
    setRasterBusy(true)
    setLoadError(null)
    setGeneratorNotes([])
    try {
      const buf = await rasterFontFile.arrayBuffer()
      releaseRasterFont()
      const pageName = rasterPageFile.replace(/^.*[/\\]/, '').trim() || 'font-atlas.png'
      const r = await rasterizeFontToModel(buf, rasterFontFile.name, {
        sizePx: rasterSize,
        charset: rasterCharset,
        fillStyle: rasterColor,
        paddingPx: rasterPadding,
        atlasMaxWidth: rasterAtlasMaxW,
        face: rasterFace.trim() || 'RasterFont',
        pageFile: pageName,
      })
      if (!r.ok) {
        setLoadError(r.error)
        setGeneratorNotes(r.warnings)
        return
      }
      lastRasterFontFaceRef.current = r.fontFace
      revokeAllTextures()
      const url = URL.createObjectURL(r.pngBlob)
      const pid = r.model.pages[0]?.id ?? 0
      pageAtlasUrlsRef.current = { [pid]: url }
      setPageAtlasUrls({ [pid]: url })
      textureObjectUrlRef.current = url
      setTextureObjectUrl(url)
      setActiveAtlasPageId(pid)
      setPngFileName(pageName)
      atlasImageFileRef.current = null
      const ind = '\t'
      const m = r.model
      setModel(m, false)
      setIndent(ind)
      const xml = serializeBitmapFontXml(m, { indent: ind })
      setLastSavedXml(xml)
      const xmlStem = pageName.replace(/\.[^.]+$/i, '') || 'font'
      setXmlFileName(`${xmlStem}.xml`)
      setExportFileName(`${xmlStem}.xml`)
      setGeneratorNotes(r.warnings)
      setSelectedCharId(null)
    } catch (err) {
      releaseRasterFont()
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setRasterBusy(false)
    }
  }, [
    rasterFontFile,
    rasterSize,
    rasterCharset,
    rasterColor,
    rasterAtlasMaxW,
    rasterPadding,
    rasterFace,
    rasterPageFile,
    releaseRasterFont,
    revokeAllTextures,
    setModel,
  ])

  useEffect(() => {
    return () => {
      revokeAllTextures()
      releaseRasterFont()
    }
  }, [releaseRasterFont, revokeAllTextures])

  useEffect(() => {
    if (!hasXml || !previewHostRef.current) return
    const p = new BitmapFontPreview(previewHostRef.current, { width: 320, height: 180 })
    previewRef.current = p
    void p.init().then(() => {
      p.setShowBaseline(showBaseline)
      p.setShowAnchorCenterY(showAnchorCenterY)
    })
    return () => {
      p.destroy()
      previewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- (re)create when XML appears; host stays mounted when toggling compare
  }, [hasXml])

  useEffect(() => {
    if (!hasXml || baselineAtlasPixelMatchesCommon !== true || !baselinePreviewHostRef.current) {
      const existing = baselinePreviewRef.current
      if (existing) {
        existing.destroy()
        baselinePreviewRef.current = null
      }
      return
    }
    const host = baselinePreviewHostRef.current
    const p = new BitmapFontPreview(host, { width: 320, height: 180 })
    baselinePreviewRef.current = p
    void p.init().then(() => {
      p.setShowBaseline(showBaseline)
      p.setShowAnchorCenterY(showAnchorCenterY)
    })
    return () => {
      p.destroy()
      baselinePreviewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baseline host mounts when atlas matches loaded snapshot; sync handles model
  }, [hasXml, baselineAtlasPixelMatchesCommon])

  useEffect(() => {
    const p = previewRef.current
    if (!p || !ready) return
    if (atlasPixelMatchesCommon === false) {
      p.clearFontDisplay()
      return
    }
    if (atlasPixelMatchesCommon !== true) return
    void p.sync(model, previewTextureUrls, previewText, serialized, {
      maxWidth: 0,
      align: 'left',
    })
    // `comparePixiToBaseline` kept so toggling compare still re-runs sync if needed; main Pixi host no longer remounts on toggle.
  }, [previewText, serialized, previewTextureUrls, model, ready, atlasPixelMatchesCommon, comparePixiToBaseline])

  useEffect(() => {
    if (comparePixiToBaseline) return
    baselinePreviewRef.current?.clearFontDisplay()
  }, [comparePixiToBaseline])

  useEffect(() => {
    const p = baselinePreviewRef.current
    if (!p || !ready || !comparePixiToBaseline) return
    if (baselineAtlasPixelMatchesCommon === false) {
      p.clearFontDisplay()
      return
    }
    if (baselineAtlasPixelMatchesCommon !== true) return
    void p.sync(baselinePreviewModel, previewTextureUrls, previewText, undefined, {
      maxWidth: 0,
      align: 'left',
    })
  }, [
    previewText,
    previewTextureUrls,
    baselinePreviewModel,
    ready,
    comparePixiToBaseline,
    baselineAtlasPixelMatchesCommon,
  ])

  useEffect(() => {
    previewRef.current?.setShowBaseline(showBaseline)
    baselinePreviewRef.current?.setShowBaseline(showBaseline)
  }, [showBaseline])

  useEffect(() => {
    previewRef.current?.setShowAnchorCenterY(showAnchorCenterY)
    baselinePreviewRef.current?.setShowAnchorCenterY(showAnchorCenterY)
  }, [showAnchorCenterY])

  useEffect(() => {
    if (!hasXml || !textureHostRef.current || !activeAtlasUrl) return
    const tv = new BitmapFontTextureView(textureHostRef.current, {
      imageUrl: activeAtlasUrl,
      chars: charsOnActivePage,
      selectedCharId,
      scaleW: model.common.scaleW,
      scaleH: model.common.scaleH,
      globalXAdvance: globalXAdvanceValue(model.common),
      showOutlines,
      showAdvanceOverlay,
      onRectDragEnd: (charId, rect) => {
        setModel((prev) => patchCharById(prev, charId, rect))
      },
      onGlyphClick: onAtlasGlyphClick,
    })
    textureRef.current = tv
    const el = textureHostRef.current
    const r = el.getBoundingClientRect()
    tv.resize(Math.max(120, r.width), Math.max(120, r.height))
    const unobserve = observeElementSize(
      el,
      (w, h) => {
        tv.resize(w, h)
      },
      { minWidth: 120, minHeight: 120 }
    )
    return () => {
      unobserve()
      tv.destroy()
      textureRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- (re)create when atlas URL or XML presence changes (host mounts with hasXml); setOptions effect handles model/selection
  }, [activeAtlasUrl, hasXml])

  useEffect(() => {
    textureRef.current?.setOptions({
      chars: charsOnActivePage,
      selectedCharId,
      scaleW: model.common.scaleW,
      scaleH: model.common.scaleH,
      globalXAdvance: globalXAdvanceValue(model.common),
      showOutlines,
      showAdvanceOverlay,
      onGlyphClick: onAtlasGlyphClick,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- model.common fields listed explicitly (common object identity changes every render)
  }, [
    charsOnActivePage,
    model.common.scaleW,
    model.common.scaleH,
    model.common.globalXAdvance,
    selectedCharId,
    showOutlines,
    showAdvanceOverlay,
    onAtlasGlyphClick,
  ])

  useEffect(() => {
    if (!atlasGlyphPopover) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAtlasGlyphPopover()
    }
    const onDown = (e: MouseEvent) => {
      const el = atlasGlyphPopoverRef.current
      if (el && !el.contains(e.target as Node)) closeAtlasGlyphPopover()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown, true)
    }
  }, [atlasGlyphPopover, closeAtlasGlyphPopover])

  useEffect(() => {
    if (hasXml) return
    const id = requestAnimationFrame(() => {
      closeAtlasGlyphPopover()
    })
    return () => cancelAnimationFrame(id)
  }, [hasXml, closeAtlasGlyphPopover])

  useEffect(() => {
    if (!hasXml) return
    const host = previewHostRef.current
    const p = previewRef.current
    if (!host || !p) return
    const r = host.getBoundingClientRect()
    p.resize(Math.max(80, r.width), Math.max(80, r.height))
    return observeElementSize(
      host,
      (w, h) => {
        p.resize(w, h)
      },
      { minWidth: 80, minHeight: 80 }
    )
  }, [hasXml, comparePixiToBaseline])

  useEffect(() => {
    if (!hasXml || baselineAtlasPixelMatchesCommon !== true) return
    const host = baselinePreviewHostRef.current
    const p = baselinePreviewRef.current
    if (!host || !p) return
    const r = host.getBoundingClientRect()
    p.resize(Math.max(80, r.width), Math.max(80, r.height))
    return observeElementSize(
      host,
      (w, h) => {
        p.resize(w, h)
      },
      { minWidth: 80, minHeight: 80 }
    )
  }, [hasXml, baselineAtlasPixelMatchesCommon, comparePixiToBaseline])

  const charCodeLabel = useCallback((code: number) => {
    try {
      if (code === 32) return '(space)'
      if (code === 9) return '(tab)'
      const s = String.fromCodePoint(code)
      return `"${s}"`
    } catch {
      return ''
    }
  }, [])

  const downloadXml = () => {
    const blob = new Blob([serialized], { type: 'application/xml;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = exportFileName.replace(/^.*\//, '') || 'font.xml'
    a.click()
    URL.revokeObjectURL(a.href)
    setLastSavedXml(serialized)
  }

  const downloadFnt = useCallback(() => {
    const blob = new Blob([serializedFnt], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const raw = exportFileName.replace(/^.*\//, '')
    const stem = raw.replace(/\.(xml|fnt)$/i, '') || 'font'
    a.download = `${stem}.fnt`
    a.click()
    URL.revokeObjectURL(a.href)
  }, [exportFileName, serializedFnt])

  const downloadFntBinary = useCallback(() => {
    const bin = serializeBitmapFontBinary(model)
    const blob = new Blob([new Uint8Array(bin)], { type: 'application/octet-stream' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const raw = exportFileName.replace(/^.*\//, '')
    const stem = raw.replace(/\.(xml|fnt)$/i, '') || 'font'
    a.download = `${stem}-bmfont.fnt`
    a.click()
    URL.revokeObjectURL(a.href)
  }, [exportFileName, model])

  const downloadZipBundle = useCallback(async () => {
    const xmlName = exportFileName.replace(/^.*\//, '') || 'font.xml'
    const entries: { path: string; data: Uint8Array }[] = [{ path: xmlName, data: utf8ToUint8(serialized) }]
    const sorted = [...model.pages].sort((a, b) => a.id - b.id)
    for (const p of sorted) {
      const u = pageAtlasUrls[p.id] || texUrl
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
    const zipped = zipBitmapFontFiles(entries)
    const blob = new Blob([new Uint8Array(zipped)], { type: 'application/zip' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const stem = xmlName.replace(/\.[^.]+$/i, '') || 'font'
    a.download = `${stem}.zip`
    a.click()
    URL.revokeObjectURL(a.href)
  }, [exportFileName, model.pages, pageAtlasUrls, serialized, texUrl])

  const patchCharAt = useCallback((index: number, patch: Partial<BitmapFontChar>) => {
    setModel((prev) => patchChar(prev, index, patch))
  }, [setModel])

  const bulkCharDelta = useCallback(
    (indices: number[], delta: { dx?: number; dy?: number; xoffset?: number; yoffset?: number; xadvance?: number }) => {
      setModel((prev) => {
        let m = prev
        for (const mi of indices) {
          const c = m.chars[mi]
          if (!c) continue
          const patch: Partial<BitmapFontChar> = {}
          if (delta.dx !== undefined) patch.x = c.x + delta.dx
          if (delta.dy !== undefined) patch.y = c.y + delta.dy
          if (delta.xoffset !== undefined) patch.xoffset = c.xoffset + delta.xoffset
          if (delta.yoffset !== undefined) patch.yoffset = c.yoffset + delta.yoffset
          if (delta.xadvance !== undefined) patch.xadvance = c.xadvance + delta.xadvance
          if (Object.keys(patch).length > 0) m = patchChar(m, mi, patch)
        }
        return m
      })
    },
    [setModel]
  )

  const bulkCharPreset = useCallback(
    (indices: number[], preset: BitmapFontBulkPreset) => {
      setModel((prev) => {
        let m = prev
        const g = globalXAdvanceValue(prev.common)
        for (const mi of indices) {
          const c = m.chars[mi]
          if (!c) continue
          if (preset === 'xadvance_equals_width') {
            m = patchChar(m, mi, { xadvance: c.width - g })
          } else {
            m = patchChar(m, mi, { xadvance: Math.max(c.width, c.height) - g })
          }
        }
        return m
      })
    },
    [setModel]
  )

  const autoCenterVerticalYoffset = useCallback(() => {
    const d = previewRef.current?.getUniformYoffsetDeltaForVisualCenter()
    if (d == null) return
    setModel((prev) => ({
      ...prev,
      chars: prev.chars.map((c) => ({ ...c, yoffset: c.yoffset + d })),
    }))
  }, [setModel])

  useEffect(() => {
    loadBitmapFontSession()
      .then((rec) => {
        if (!rec) return
        try {
          const dismissed = localStorage.getItem(SESSION_DISMISS_STORAGE_KEY)
          if (dismissed === String(rec.savedAt)) return
        } catch {
          /* ignore */
        }
        setSessionOffer(rec)
      })
      .catch(() => {
        /* ignore */
      })
  }, [])

  const idbSaveTimerRef = useRef(0)
  useEffect(() => {
    if (!hasXml || initialFontLoading) return
    window.clearTimeout(idbSaveTimerRef.current)
    idbSaveTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          let atlasBuffer: ArrayBuffer | null = null
          const file = atlasImageFileRef.current
          if (file) {
            atlasBuffer = await file.arrayBuffer()
          } else if (textureObjectUrl) {
            const res = await fetch(textureObjectUrl)
            atlasBuffer = await res.arrayBuffer()
          }
          await saveBitmapFontSession({
            version: 1,
            savedAt: Date.now(),
            model: structuredClone(model),
            indent,
            exportFileName,
            xmlFileName,
            pngFileName,
            atlasBuffer,
          })
        } catch {
          /* ignore quota / private mode */
        }
      })()
    }, 1200)
    return () => window.clearTimeout(idbSaveTimerRef.current)
  }, [model, indent, exportFileName, xmlFileName, pngFileName, textureObjectUrl, hasXml, initialFontLoading])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('[data-font-undo-scope="off"]')) return
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key === 'z' || e.key === 'Z') {
        if (e.shiftKey) histDispatch({ type: 'redo' })
        else histDispatch({ type: 'undo' })
        e.preventDefault()
      } else if (e.key === 'y' || e.key === 'Y') {
        histDispatch({ type: 'redo' })
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const applySessionRestore = useCallback(
    (rec: BitmapFontSessionRecordV1) => {
      fontSessionEpochRef.current += 1
      revokeAllTextures()
      if (rec.atlasBuffer && rec.atlasBuffer.byteLength > 0) {
        const blob = new Blob([rec.atlasBuffer], { type: 'image/png' })
        const url = URL.createObjectURL(blob)
        const pid = rec.model.pages[0]?.id ?? 0
        pageAtlasUrlsRef.current = { [pid]: url }
        setPageAtlasUrls({ [pid]: url })
        textureObjectUrlRef.current = url
        setTextureObjectUrl(url)
        setActiveAtlasPageId(pid)
      } else {
        setTextureObjectUrl(null)
        textureObjectUrlRef.current = null
      }
      atlasImageFileRef.current = null
      setModel(rec.model, false)
      setIndent(rec.indent)
      setExportFileName(rec.exportFileName)
      setXmlFileName(rec.xmlFileName)
      setPngFileName(rec.pngFileName)
      setLastSavedXml(serializeBitmapFontXml(rec.model, { indent: rec.indent }))
      setSelectedCharId(null)
      setLoadError(null)
      setSessionOffer(null)
    },
    [revokeAllTextures, setModel]
  )

  return (
    <div
      style={{
        minHeight: '100vh',
        background: pageBg,
        color: text,
        padding: '20px 24px 48px',
        fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto', ...cssVars }}>
        <header style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Bitmap Font Toolkit</h1>
            <p style={{ fontSize: 13, color: textMuted, margin: '6px 0 0', lineHeight: 1.45 }}>
              BMFont multitool: edit XML + atlas, or generate from a styled charset PNG / a font file — all with live preview.
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
            <button
              type="button"
              id="editor-help-toggle"
              onClick={() => setShowHelp((v) => !v)}
              aria-expanded={showHelp}
              aria-controls="editor-help-panel"
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                cursor: 'pointer',
                background: darkTheme ? '#334155' : '#e5e7eb',
                color: text,
                border: `1px solid ${inputBorder}`,
                borderRadius: 8,
              }}
            >
              {showHelp ? 'Hide help' : 'Show help'}
            </button>
            <label style={{ fontSize: 12, color: textMuted, cursor: 'default' }}>
              <WithTooltip
                darkTheme={darkTheme}
                tip="Toggle dark UI. Your choice is saved in this browser (local storage)."
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={darkTheme} onChange={(e) => setDarkTheme(e.target.checked)} />
                  Dark UI
                </span>
              </WithTooltip>
            </label>
          </div>
        </header>

        {sessionOffer && (
          <div
            role="region"
            aria-label="Restore saved session"
            style={{
              marginBottom: 16,
              padding: '12px 14px',
              borderRadius: 10,
              border: `1px solid ${inputBorder}`,
              background: darkTheme ? '#1e3a5f' : '#e0f2fe',
              color: text,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <strong>Previous session found</strong> (saved locally in this browser; may include font assets). Restore it,
            dismiss this offer, or clear stored data.
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                onClick={() => applySessionRestore(sessionOffer)}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '6px 12px',
                  cursor: 'pointer',
                  background: '#0d9488',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                }}
              >
                Restore
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.setItem(SESSION_DISMISS_STORAGE_KEY, String(sessionOffer.savedAt))
                  } catch {
                    /* ignore */
                  }
                  setSessionOffer(null)
                }}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '6px 12px',
                  cursor: 'pointer',
                  background: darkTheme ? '#334155' : '#e5e7eb',
                  color: text,
                  border: `1px solid ${inputBorder}`,
                  borderRadius: 8,
                }}
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => {
                  void clearBitmapFontSession()
                  setSessionOffer(null)
                }}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '6px 12px',
                  cursor: 'pointer',
                  background: 'transparent',
                  color: textMuted,
                  border: `1px solid ${panelBorder}`,
                  borderRadius: 8,
                }}
              >
                Clear stored session
              </button>
            </div>
          </div>
        )}

        {showHelp && (
          <ShoeboxHelpSection
            darkTheme={darkTheme}
            text={text}
            textMuted={textMuted}
            inputBorder={inputBorder}
            panelBorder={panelBorder}
          />
        )}

        <section style={panelChrome} aria-labelledby="load-font-heading">
          <h2 id="load-font-heading" style={sectionTitle}>
            Load font
          </h2>
          <p style={{ fontSize: 13, color: textMuted, margin: '0 0 12px', lineHeight: 1.55 }}>
            Choose an import path. <strong style={{ color: 'var(--shoebox-text)' }}>BMFont files</strong> is the original workflow; the other tabs add optional generators (nothing is uploaded to a server).
          </p>
          <div role="tablist" aria-label="Import source" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <WithTooltip
              darkTheme={darkTheme}
              tip="Upload existing BMFont XML / .fnt and atlas image — the original workflow (use Upload font files below)."
            >
              <button
                type="button"
                role="tab"
                aria-selected={importSourceTab === 'bmfont'}
                onClick={() => setImportSourceTabFromUi('bmfont')}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: `1px solid ${inputBorder}`,
                  cursor: 'pointer',
                  background: importSourceTab === 'bmfont' ? '#0d9488' : darkTheme ? '#334155' : '#e5e7eb',
                  color: importSourceTab === 'bmfont' ? '#fff' : text,
                }}
              >
                BMFont files (default)
              </button>
            </WithTooltip>
            <WithTooltip
              darkTheme={darkTheme}
              tip="Build BMFont from one Shoebox-style strip image whose glyphs match your charset in reading order."
            >
              <button
                type="button"
                role="tab"
                aria-selected={importSourceTab === 'styledStrip'}
                onClick={() => setImportSourceTabFromUi('styledStrip')}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: `1px solid ${inputBorder}`,
                  cursor: 'pointer',
                  background: importSourceTab === 'styledStrip' ? '#0d9488' : darkTheme ? '#334155' : '#e5e7eb',
                  color: importSourceTab === 'styledStrip' ? '#fff' : text,
                }}
              >
                Styled charset PNG
              </button>
            </WithTooltip>
            <WithTooltip
              darkTheme={darkTheme}
              tip="Rasterize a browser-loadable .ttf / .otf (or woff) into a new atlas + BMFont XML from your charset."
            >
              <button
                type="button"
                role="tab"
                aria-selected={importSourceTab === 'rasterFont'}
                onClick={() => setImportSourceTabFromUi('rasterFont')}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: `1px solid ${inputBorder}`,
                  cursor: 'pointer',
                  background: importSourceTab === 'rasterFont' ? '#0d9488' : darkTheme ? '#334155' : '#e5e7eb',
                  color: importSourceTab === 'rasterFont' ? '#fff' : text,
                }}
              >
                Raster from font file
              </button>
            </WithTooltip>
          </div>

          {importSourceTab === 'styledStrip' && (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                borderRadius: 10,
                border: `1px solid ${panelBorder}`,
                background: darkTheme ? 'rgba(15, 23, 42, 0.35)' : '#f9fafb',
              }}
            >
              <p style={{ fontSize: 12, color: textMuted, margin: '0 0 10px', lineHeight: 1.5 }}>
                Upload a <strong style={{ color: 'var(--shoebox-text)' }}>single image</strong> whose glyphs match your charset string in reading order (left‑to‑right per row, rows top‑to‑bottom). Then tune thresholds and click build. Space (U+0020) is synthetic (advance only). Dot vs comma can be corrected from glyph shape when the charset order does not match the drawing.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: textMuted }}>
                  face
                  <WithTooltip
                    darkTheme={darkTheme}
                    block
                    tip="BMFont face string written to the built XML — Pixi BitmapText uses this as fontName."
                  >
                    <input
                      value={stripFace}
                      onChange={(e) => setStripFace(e.target.value)}
                      style={{
                        padding: 6,
                        background: inputBg,
                        color: text,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 6,
                        fontSize: 12,
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    />
                  </WithTooltip>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: textMuted }}>
                  alpha threshold (0–255)
                  <WithTooltip
                    darkTheme={darkTheme}
                    block
                    tip="Pixels with alpha below this value are treated as background when detecting glyph bounding boxes."
                  >
                    <input
                      type="number"
                      min={0}
                      max={255}
                      value={stripAlpha}
                      onChange={(e) => setStripAlpha(Number(e.target.value) || 0)}
                      style={{
                        padding: 6,
                        background: inputBg,
                        color: text,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 6,
                        fontSize: 12,
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    />
                  </WithTooltip>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: textMuted }}>
                  min column gap (px)
                  <WithTooltip
                    darkTheme={darkTheme}
                    block
                    tip="Minimum horizontal gap (pixels) between ink regions before starting a new glyph column."
                  >
                    <input
                      type="number"
                      min={1}
                      value={stripMinGap}
                      onChange={(e) => setStripMinGap(Math.max(1, Number(e.target.value) || 1))}
                      style={{
                        padding: 6,
                        background: inputBg,
                        color: text,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 6,
                        fontSize: 12,
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    />
                  </WithTooltip>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: textMuted }}>
                  min row gap (px)
                  <WithTooltip
                    darkTheme={darkTheme}
                    block
                    tip="Minimum vertical gap (pixels) between ink regions before treating glyphs as a new row."
                  >
                    <input
                      type="number"
                      min={1}
                      value={stripMinRowGap}
                      onChange={(e) => setStripMinRowGap(Math.max(1, Number(e.target.value) || 1))}
                      style={{
                        padding: 6,
                        background: inputBg,
                        color: text,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 6,
                        fontSize: 12,
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    />
                  </WithTooltip>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: textMuted }}>
                  trim pad (px)
                  <WithTooltip
                    darkTheme={darkTheme}
                    block
                    tip="Extra pixels added (or effectively inset) around each detected glyph box after bbox detection."
                  >
                    <input
                      type="number"
                      min={0}
                      value={stripTrimPad}
                      onChange={(e) => setStripTrimPad(Math.max(0, Number(e.target.value) || 0))}
                      style={{
                        padding: 6,
                        background: inputBg,
                        color: text,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 6,
                        fontSize: 12,
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    />
                  </WithTooltip>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: textMuted }}>
                  space xadvance (px)
                  <WithTooltip
                    darkTheme={darkTheme}
                    block
                    tip="Horizontal advance for U+0020 space — space is synthetic (not sliced from the image)."
                  >
                    <input
                      type="number"
                      min={1}
                      value={stripSpaceAdvance}
                      onChange={(e) => setStripSpaceAdvance(Math.max(1, Number(e.target.value) || 1))}
                      style={{
                        padding: 6,
                        background: inputBg,
                        color: text,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 6,
                        fontSize: 12,
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    />
                  </WithTooltip>
                </label>
              </div>
              <label style={{ display: 'block', marginBottom: 10, cursor: 'pointer', userSelect: 'none' }}>
                <WithTooltip
                  darkTheme={darkTheme}
                  block
                  tip="When enabled, swaps comma vs period assignments if glyph ink shape disagrees with the charset order (U+002C / U+002E)."
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: textMuted }}>
                    <input
                      type="checkbox"
                      checked={stripDotCommaDetect}
                      onChange={(e) => setStripDotCommaDetect(e.target.checked)}
                    />
                    Detect comma vs period from ink (swap U+002C / U+002E when shape disagrees with charset)
                  </span>
                </WithTooltip>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: textMuted, marginBottom: 10 }}>
                Charset (order matches image, code points; U+0020 is appended when missing so space uses space xadvance)
                <WithTooltip
                  darkTheme={darkTheme}
                  block
                  tip="Character sequence in reading order (left to right per row, rows top to bottom). Code points map to glyphs in the image; space is appended if missing."
                >
                  <textarea
                    value={stripCharset}
                    onChange={(e) => setStripCharset(e.target.value)}
                    rows={2}
                    style={{
                      padding: 8,
                      background: inputBg,
                      color: text,
                      border: `1px solid ${inputBorder}`,
                      borderRadius: 6,
                      fontFamily: 'var(--font-geist-mono), monospace',
                      fontSize: 12,
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  />
                </WithTooltip>
              </label>
              <WithTooltip darkTheme={darkTheme} tip="Requires the same PNG you uploaded for the atlas (see chip below).">
                <button
                  type="button"
                  disabled={stripBusy}
                  onClick={() => void onBuildFromStyledStrip()}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '8px 14px',
                    cursor: stripBusy ? 'wait' : 'pointer',
                    opacity: stripBusy ? 0.7 : 1,
                    background: '#6366f1',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                  }}
                >
                  {stripBusy ? 'Building…' : 'Build BMFont from styled image'}
                </button>
              </WithTooltip>
            </div>
          )}

          {importSourceTab === 'rasterFont' && (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                borderRadius: 10,
                border: `1px solid ${panelBorder}`,
                background: darkTheme ? 'rgba(15, 23, 42, 0.35)' : '#f9fafb',
              }}
            >
              <p style={{ fontSize: 12, color: textMuted, margin: '0 0 10px', lineHeight: 1.5 }}>
                Load a <strong style={{ color: 'var(--shoebox-text)' }}>.ttf / .otf</strong> (browser-supported), pick a charset and size, then generate a new atlas + XML. Duplicate code points are deduped. Respect the font license.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <label style={{ cursor: 'pointer', display: 'inline-block', margin: 0, padding: 0 }}>
                  <input
                    type="file"
                    accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,application/font-woff,application/font-woff2"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null
                      e.target.value = ''
                      setRasterFontFile(f)
                    }}
                  />
                  <WithTooltip
                    darkTheme={darkTheme}
                    tip="Pick a .ttf, .otf, or web font the browser can load via FontFace for canvas rasterization."
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '8px 14px',
                        borderRadius: 8,
                        background: '#6366f1',
                        color: '#fff',
                        display: 'inline-block',
                      }}
                    >
                      Choose font file
                    </span>
                  </WithTooltip>
                </label>
                {rasterFontFile && (
                  <span style={chipStyle} title={rasterFontFile.name}>
                    Font: <strong style={{ color: 'var(--shoebox-text)' }}>{rasterFontFile.name}</strong>
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: textMuted }}>
                  size (px)
                  <WithTooltip
                    darkTheme={darkTheme}
                    block
                    tip="Nominal pixel size used when drawing each glyph to the atlas (canvas font size)."
                  >
                    <input
                      type="number"
                      min={1}
                      value={rasterSize}
                      onChange={(e) => setRasterSize(Math.max(1, Number(e.target.value) || 1))}
                      style={{
                        padding: 6,
                        background: inputBg,
                        color: text,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 6,
                        fontSize: 12,
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    />
                  </WithTooltip>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: textMuted }}>
                  fill color
                  <WithTooltip darkTheme={darkTheme} block tip="Fill color behind glyphs when rasterizing (opaque cells on the generated atlas).">
                    <input
                      type="color"
                      value={rasterColor.startsWith('#') && rasterColor.length >= 7 ? rasterColor : '#111827'}
                      onChange={(e) => setRasterColor(e.target.value)}
                      style={{
                        height: 32,
                        width: '100%',
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 6,
                        padding: 2,
                        boxSizing: 'border-box',
                      }}
                    />
                  </WithTooltip>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: textMuted }}>
                  atlas max width (px)
                  <WithTooltip
                    darkTheme={darkTheme}
                    block
                    tip="Maximum atlas image width before packing wraps to the next row of glyph cells."
                  >
                    <input
                      type="number"
                      min={32}
                      value={rasterAtlasMaxW}
                      onChange={(e) => setRasterAtlasMaxW(Math.max(32, Number(e.target.value) || 2048))}
                      style={{
                        padding: 6,
                        background: inputBg,
                        color: text,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 6,
                        fontSize: 12,
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    />
                  </WithTooltip>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: textMuted }}>
                  cell padding (px)
                  <WithTooltip
                    darkTheme={darkTheme}
                    block
                    tip="Extra transparent padding around each glyph cell in the packed atlas (pixels)."
                  >
                    <input
                      type="number"
                      min={0}
                      value={rasterPadding}
                      onChange={(e) => setRasterPadding(Math.max(0, Number(e.target.value) || 0))}
                      style={{
                        padding: 6,
                        background: inputBg,
                        color: text,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 6,
                        fontSize: 12,
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    />
                  </WithTooltip>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: textMuted }}>
                  face
                  <WithTooltip
                    darkTheme={darkTheme}
                    block
                    tip="BMFont face string written to generated XML — Pixi BitmapText uses this as fontName."
                  >
                    <input
                      value={rasterFace}
                      onChange={(e) => setRasterFace(e.target.value)}
                      style={{
                        padding: 6,
                        background: inputBg,
                        color: text,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 6,
                        fontSize: 12,
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    />
                  </WithTooltip>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: textMuted }}>
                  page file name
                  <WithTooltip
                    darkTheme={darkTheme}
                    block
                    tip="Value for &lt;page file=&quot;…&quot;&gt; in the generated XML — should match your runtime texture file name."
                  >
                    <input
                      value={rasterPageFile}
                      onChange={(e) => setRasterPageFile(e.target.value)}
                      style={{
                        padding: 6,
                        background: inputBg,
                        color: text,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 6,
                        fontSize: 12,
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    />
                  </WithTooltip>
                </label>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: textMuted, marginBottom: 10 }}>
                Charset (unique glyphs; duplicates are skipped with a note)
                <WithTooltip
                  darkTheme={darkTheme}
                  block
                  tip="Characters to rasterize from the font; duplicate code points are deduplicated (a note is shown when skipped)."
                >
                  <textarea
                    value={rasterCharset}
                    onChange={(e) => setRasterCharset(e.target.value)}
                    rows={2}
                    style={{
                      padding: 8,
                      background: inputBg,
                      color: text,
                      border: `1px solid ${inputBorder}`,
                      borderRadius: 6,
                      fontFamily: 'var(--font-geist-mono), monospace',
                      fontSize: 12,
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  />
                </WithTooltip>
              </label>
              <WithTooltip darkTheme={darkTheme} tip="Requires a chosen font file and charset — generates a new PNG atlas and BMFont XML in memory.">
                <button
                  type="button"
                  disabled={rasterBusy}
                  onClick={() => void onRasterizeFont()}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '8px 14px',
                    cursor: rasterBusy ? 'wait' : 'pointer',
                    opacity: rasterBusy ? 0.7 : 1,
                    background: '#6366f1',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                  }}
                >
                  {rasterBusy ? 'Rasterizing…' : 'Generate atlas + XML'}
                </button>
              </WithTooltip>
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <label style={{ cursor: 'pointer', display: 'inline-block', margin: 0, padding: 0 }}>
              <input
                type="file"
                multiple
                accept=".xml,.fnt,.fnt.xml,text/xml,application/xml,image/png,image/webp,image/jpeg,image/jpg,image/*"
                hidden
                onChange={(e) => void onPickFontFiles(e)}
              />
              <WithTooltip
                darkTheme={darkTheme}
                tip="Pick BMFont XML / .fnt, atlas image, or both. Multi-select (Shift / Cmd / Ctrl) to choose two files in one dialog."
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '8px 14px',
                    borderRadius: 8,
                    background: '#0d9488',
                    color: '#fff',
                    display: 'inline-block',
                  }}
                >
                  Upload font files
                </span>
              </WithTooltip>
            </label>
            {xmlFileName && (
              <span style={chipStyle} title={xmlFileName}>
                XML: <strong style={{ color: 'var(--shoebox-text)' }}>{xmlFileName}</strong>
              </span>
            )}
            {pngFileName && (
              <span style={chipStyle} title={pngFileName}>
                PNG: <strong style={{ color: 'var(--shoebox-text)' }}>{pngFileName}</strong>
              </span>
            )}
          </div>

          {ready && atlasPixelMatchesCommon === false && (
            <div
              style={{
                fontSize: 13,
                color: '#fbbf24',
                marginBottom: 12,
                lineHeight: 1.5,
                padding: 10,
                border: '1px solid #92400e',
                borderRadius: 8,
              }}
              role="status"
            >
              Atlas image size does not match <strong style={{ color: 'var(--shoebox-text)' }}>scaleW</strong> /{' '}
              <strong style={{ color: 'var(--shoebox-text)' }}>scaleH</strong> in the current font data ({model.common.scaleW}×{model.common.scaleH}). The Pixi
              preview is paused until they match. For <strong style={{ color: 'var(--shoebox-text)' }}>Styled charset PNG</strong>, click{' '}
              <strong style={{ color: 'var(--shoebox-text)' }}>Build BMFont from styled image</strong> after uploading your strip. For BMFont XML workflows,
              upload the atlas that belongs to this XML or edit scale fields to match your PNG.
            </div>
          )}

          {loadError && (
            <div style={{ fontSize: 13, color: '#f87171', marginBottom: 12, lineHeight: 1.45 }} role="alert">
              {loadError}
            </div>
          )}

          {generatorNotes.length > 0 && (
            <ul
              style={{
                fontSize: 12,
                color: '#34d399',
                margin: '0 0 12px',
                paddingLeft: 20,
                lineHeight: 1.5,
              }}
            >
              {generatorNotes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}

          {model.pages.length > 1 && (
            <div
              style={{
                fontSize: 12,
                color: '#fbbf24',
                marginBottom: 12,
                padding: 10,
                border: '1px solid #92400e',
                borderRadius: 8,
                lineHeight: 1.45,
              }}
            >
              This font declares {model.pages.length} pages. Upload one image per page (matching <strong>page file</strong> names) or
              multi-select images with the font XML. Use the page tabs above the texture to edit each atlas.
            </div>
          )}

          {pageFileHint && (
            <div style={{ fontSize: 12, color: textMuted, marginBottom: 12, lineHeight: 1.45 }}>{pageFileHint}</div>
          )}

          {initialFontLoading && !ready && (
            <div
              className="toolkit-loading toolkit-loading--inline"
              role="status"
              aria-live="polite"
              style={{ fontSize: 14, color: textMuted, lineHeight: 1.55, margin: '0 0 8px' }}
            >
              <div className="toolkit-loading__spinner toolkit-loading__spinner--sm" aria-hidden="true" />
              <span>Loading example font…</span>
            </div>
          )}

          {!hasXml && !texUrl && !initialFontLoading && (
            <p style={{ fontSize: 14, color: textMuted, lineHeight: 1.55, margin: 0 }}>
              No font loaded. Use <strong style={{ color: 'var(--shoebox-text)' }}>Upload font files</strong> to choose your BMFont XML or .fnt, the atlas
              image, or both in one go (multi-select).
            </p>
          )}

          {!hasXml && texUrl && (
            <p style={{ fontSize: 14, color: textMuted, lineHeight: 1.55, margin: 0 }}>
              Atlas image loaded{pngFileName ? ` (${pngFileName})` : ''}. Use <strong style={{ color: 'var(--shoebox-text)' }}>Upload font files</strong> to
              add your BMFont XML or .fnt (you can select the font file alone or together with a new image).
            </p>
          )}

          {hasXml && !texUrl && (
            <p style={{ fontSize: 14, color: textMuted, lineHeight: 1.55, margin: 0 }}>
              XML loaded. Use <strong style={{ color: 'var(--shoebox-text)' }}>Upload font files</strong> to add the atlas image.
            </p>
          )}
        </section>

        {hasXml && (
          <>
            <section style={panelChrome} aria-labelledby="preview-guides-heading">
              <h2 id="preview-guides-heading" style={sectionTitle}>
                Preview guides &amp; metrics assist
              </h2>
              <p style={{ ...subsectionLabel, marginBottom: 10 }}>
                Overlays and tools for the atlas and Pixi panels. Auto center Y edits glyph metrics.
              </p>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 14,
                  alignItems: 'center',
                  fontSize: 13,
                  color: textMuted,
                }}
              >
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <WithTooltip darkTheme={darkTheme} tip="Draw a red line at the first line’s baseline in the preview.">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={showBaseline} onChange={(e) => setShowBaseline(e.target.checked)} />
                      Baseline
                    </span>
                  </WithTooltip>
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <WithTooltip
                    darkTheme={darkTheme}
                    tip="Draw a cyan line at BitmapText.y — Pixi’s vertical anchor when anchor.y is 0.5 (vertical center of the text object). This preview sets that Y to half the panel height, so the line matches the panel’s vertical middle; compare glyph pixels above and below to judge optical centering."
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={showAnchorCenterY} onChange={(e) => setShowAnchorCenterY(e.target.checked)} />
                      Anchor Y (0.5)
                    </span>
                  </WithTooltip>
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <WithTooltip darkTheme={darkTheme} tip="Show rectangles around each glyph on the atlas texture.">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={showOutlines} onChange={(e) => setShowOutlines(e.target.checked)} />
                      Glyph outlines
                    </span>
                  </WithTooltip>
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <WithTooltip
                    darkTheme={darkTheme}
                    tip="Under each glyph, draw a bar whose width matches exported xadvance (includes Global advance X). Helps compare rhythm to atlas boxes."
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={showAdvanceOverlay} onChange={(e) => setShowAdvanceOverlay(e.target.checked)} />
                      Advance bars
                    </span>
                  </WithTooltip>
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <WithTooltip
                    darkTheme={darkTheme}
                    tip="Show a second Pixi panel with the font as it was at the last import or generator output, next to your current edits. Uses the same preview text and atlas files."
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={comparePixiToBaseline}
                        onChange={(e) => setComparePixiToBaseline(e.target.checked)}
                      />
                      Compare to loaded
                    </span>
                  </WithTooltip>
                </label>
                <WithTooltip
                  darkTheme={darkTheme}
                  tip="Add the same yoffset to every glyph so the preview string’s bounding box is vertically centered on the Anchor Y line. Uses the current preview text; click again if needed after edits."
                >
                  <button
                    type="button"
                    disabled={!ready}
                    onClick={autoCenterVerticalYoffset}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '6px 12px',
                      cursor: ready ? 'pointer' : 'not-allowed',
                      opacity: ready ? 1 : 0.45,
                      background: darkTheme ? '#334155' : '#e5e7eb',
                      color: text,
                      border: `1px solid ${inputBorder}`,
                      borderRadius: 8,
                    }}
                  >
                    Auto center Y
                  </button>
                </WithTooltip>
              </div>
            </section>

            <section style={panelChrome} aria-labelledby="font-metadata-heading">
              <h2 id="font-metadata-heading" style={sectionTitle}>
                Font metadata
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, fontSize: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  face
                  <WithTooltip darkTheme={darkTheme} block tip="BMFont face name — Pixi BitmapText uses this as fontName.">
                    <div style={{ display: 'flex', gap: 6, alignItems: 'stretch', width: '100%' }}>
                      <input
                        value={model.info.face}
                        onChange={(e) => setModel((p) => setInfo(p, { face: e.target.value }))}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: 6,
                          background: inputBg,
                          color: text,
                          border: `1px solid ${inputBorder}`,
                          borderRadius: 4,
                          boxSizing: 'border-box',
                        }}
                      />
                      {model.info.face !== baselineModel.info.face && (
                        <WithTooltip darkTheme={darkTheme} tip={`Restore face from last import or generator (${baselineModel.info.face})`}>
                          <button
                            type="button"
                            aria-label={`Restore face from last import or generator (${baselineModel.info.face})`}
                            title={`Restore face from last import or generator (${baselineModel.info.face})`}
                            onClick={() => setModel((p) => setInfo(p, { face: baselineModel.info.face }))}
                            style={{
                              flex: '0 0 auto',
                              minWidth: 28,
                              padding: '0 4px',
                              fontSize: 14,
                              lineHeight: 1,
                              cursor: 'pointer',
                              borderRadius: 4,
                              border: `1px solid ${inputBorder}`,
                              background: inputBg,
                              color: text,
                            }}
                          >
                            ↺
                          </button>
                        </WithTooltip>
                      )}
                    </div>
                  </WithTooltip>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  size
                  <WithTooltip darkTheme={darkTheme} block tip="Nominal size from &lt;info size=&quot;…&quot;&gt; (pixels).">
                    <ScrubNumberInput
                      value={model.info.size}
                      onValueChange={(n) => setModel((p) => setInfo(p, { size: n }))}
                      baselineValue={baselineModel.info.size}
                      resetControlBg={inputBg}
                      resetControlBorder={inputBorder}
                      resetControlColor={text}
                      style={{
                        padding: 6,
                        background: inputBg,
                        color: text,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 4,
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    />
                  </WithTooltip>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  lineHeight
                  <WithTooltip darkTheme={darkTheme} block tip="Line height from &lt;common lineHeight=&quot;…&quot;&gt; — vertical distance between lines (pixels).">
                    <ScrubNumberInput
                      value={model.common.lineHeight}
                      onValueChange={(n) => setModel((p) => setCommon(p, { lineHeight: n }))}
                      baselineValue={baselineModel.common.lineHeight}
                      resetControlBg={inputBg}
                      resetControlBorder={inputBorder}
                      resetControlColor={text}
                      style={{
                        padding: 6,
                        background: inputBg,
                        color: text,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 4,
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    />
                  </WithTooltip>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  scaleW
                  <WithTooltip darkTheme={darkTheme} block tip="Atlas width from &lt;common scaleW=&quot;…&quot;&gt; — usually the texture image width in pixels.">
                    <ScrubNumberInput
                      value={model.common.scaleW}
                      onValueChange={(n) => setModel((p) => setCommon(p, { scaleW: n }))}
                      baselineValue={baselineModel.common.scaleW}
                      resetControlBg={inputBg}
                      resetControlBorder={inputBorder}
                      resetControlColor={text}
                      style={{
                        padding: 6,
                        background: inputBg,
                        color: text,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 4,
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    />
                  </WithTooltip>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  scaleH
                  <WithTooltip darkTheme={darkTheme} block tip="Atlas height from &lt;common scaleH=&quot;…&quot;&gt; — usually the texture image height in pixels.">
                    <ScrubNumberInput
                      value={model.common.scaleH}
                      onValueChange={(n) => setModel((p) => setCommon(p, { scaleH: n }))}
                      baselineValue={baselineModel.common.scaleH}
                      resetControlBg={inputBg}
                      resetControlBorder={inputBorder}
                      resetControlColor={text}
                      style={{
                        padding: 6,
                        background: inputBg,
                        color: text,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 4,
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    />
                  </WithTooltip>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  page file
                  <WithTooltip darkTheme={darkTheme} block tip="Value for &lt;page file=&quot;…&quot;&gt; — should match how your game resolves the atlas file name.">
                    <div style={{ display: 'flex', gap: 6, alignItems: 'stretch', width: '100%' }}>
                      <input
                        value={model.pages[0]?.file ?? ''}
                        onChange={(e) =>
                          setModel((p) => ({
                            ...p,
                            pages: [{ id: 0, file: e.target.value.trim() }],
                            common: { ...p.common, pages: 1 },
                          }))
                        }
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: 6,
                          background: inputBg,
                          color: text,
                          border: `1px solid ${inputBorder}`,
                          borderRadius: 4,
                          boxSizing: 'border-box',
                        }}
                      />
                      {(model.pages[0]?.file ?? '') !== (baselineModel.pages[0]?.file ?? '') && (
                        <WithTooltip
                          darkTheme={darkTheme}
                          tip={`Restore page file from last import or generator (${baselineModel.pages[0]?.file ?? ''})`}
                        >
                          <button
                            type="button"
                            aria-label={`Restore page file from last import or generator (${baselineModel.pages[0]?.file ?? ''})`}
                            title={`Restore page file from last import or generator (${baselineModel.pages[0]?.file ?? ''})`}
                            onClick={() =>
                              setModel((p) => ({
                                ...p,
                                pages: [{ id: 0, file: baselineModel.pages[0]?.file ?? '' }],
                                common: { ...p.common, pages: 1 },
                              }))
                            }
                            style={{
                              flex: '0 0 auto',
                              minWidth: 28,
                              padding: '0 4px',
                              fontSize: 14,
                              lineHeight: 1,
                              cursor: 'pointer',
                              borderRadius: 4,
                              border: `1px solid ${inputBorder}`,
                              background: inputBg,
                              color: text,
                            }}
                          >
                            ↺
                          </button>
                        </WithTooltip>
                      )}
                    </div>
                  </WithTooltip>
                </label>
              </div>
            </section>

            <section style={panelChrome} aria-labelledby="sample-text-heading">
              <h2 id="sample-text-heading" style={sectionTitle}>
                Sample text
              </h2>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: textMuted }}>
                Preview string (multi-line)
                <WithTooltip
                  darkTheme={darkTheme}
                  block
                  tip="Text rendered by Pixi BitmapText in the preview; supports line breaks. When this field is not empty, unique code points missing from the font or with a zero-width/zero-height atlas rectangle are listed below."
                >
                  <textarea
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value)}
                    rows={3}
                    style={{
                      padding: 8,
                      background: inputBg,
                      color: text,
                      border: `1px solid ${inputBorder}`,
                      borderRadius: 6,
                      fontFamily: 'var(--font-geist-mono), monospace',
                      fontSize: 12,
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  />
                </WithTooltip>
              </label>
              {previewText.trim() !== '' && (
                <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5, color: textMuted }}>
                  {coverageReport.missing.length === 0 && coverageReport.zero.length === 0 ? (
                    <p style={{ margin: 0, color: '#059669' }}>All unique code points are present with non-zero atlas size.</p>
                  ) : (
                    <>
                      {coverageReport.missing.length > 0 && (
                        <p style={{ margin: '0 0 6px', color: '#b91c1c' }}>
                          <strong style={{ color: text }}>Missing:</strong>{' '}
                          {coverageReport.missing
                            .map(
                              (id) =>
                                `U+${id.toString(16).toUpperCase()} (${id}, ${glyphHintForCodePoint(id)})`
                            )
                            .join(', ')}
                        </p>
                      )}
                      {coverageReport.zero.length > 0 && (
                        <p style={{ margin: '0 0 6px', color: '#ca8a04' }}>
                          <strong style={{ color: text }}>Zero-size:</strong>{' '}
                          {coverageReport.zero
                            .map(
                              (id) =>
                                `U+${id.toString(16).toUpperCase()} (${id}, ${glyphHintForCodePoint(id)})`
                            )
                            .join(', ')}
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={coverageReport.missing.length === 0}
                        onClick={() => {
                          const id = coverageReport.missing[0]
                          if (id == null) return
                          charTableRef.current?.setFilterText(`U+${id.toString(16).toUpperCase()}`)
                        }}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          cursor: coverageReport.missing.length === 0 ? 'not-allowed' : 'pointer',
                          opacity: coverageReport.missing.length === 0 ? 0.5 : 1,
                          borderRadius: 6,
                          border: `1px solid ${inputBorder}`,
                          background: darkTheme ? '#334155' : '#e5e7eb',
                          color: text,
                        }}
                      >
                        Filter first missing in character table
                      </button>
                    </>
                  )}
                </div>
              )}
            </section>
            <section
              style={{
                ...panelChrome,
                ...(!stackPreviews
                  ? {
                      position: 'sticky',
                      top: 8,
                      zIndex: 5,
                    }
                  : {}),
              }}
              aria-labelledby="atlas-preview-heading"
            >
              <h2 id="atlas-preview-heading" style={sectionTitle}>
                Atlas &amp; live preview
              </h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: stackPreviews
                    ? '1fr'
                    : comparePixiToBaseline
                      ? 'repeat(3, minmax(0, 1fr))'
                      : '1fr 1fr',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 6 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <WithTooltip darkTheme={darkTheme} tip="Atlas: wheel zoom, drag to pan, drag a glyph box to change atlas X/Y in the font.">
                      <div style={{ fontSize: 12, fontWeight: 600, color: textMuted }}>Texture</div>
                    </WithTooltip>
                    <WithTooltip darkTheme={darkTheme} tip="Reset pan and zoom so the atlas fits and is centered in the preview.">
                      <button
                        type="button"
                        disabled={!hasXml || !activeAtlasUrl}
                        onClick={() => textureRef.current?.resetPreviewView()}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: 6,
                          border: `1px solid ${inputBorder}`,
                          cursor: !hasXml || !activeAtlasUrl ? 'not-allowed' : 'pointer',
                          background: darkTheme ? '#334155' : '#e5e7eb',
                          color: text,
                          flexShrink: 0,
                          opacity: !hasXml || !activeAtlasUrl ? 0.55 : 1,
                        }}
                      >
                        Center
                      </button>
                    </WithTooltip>
                  </div>
                  {model.pages.length > 1 && (
                    <div role="tablist" aria-label="Atlas page" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {[...model.pages]
                        .sort((a, b) => a.id - b.id)
                        .map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            role="tab"
                            aria-selected={atlasViewPageId === p.id}
                            onClick={() => setActiveAtlasPageId(p.id)}
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '4px 10px',
                              borderRadius: 6,
                              border: `1px solid ${inputBorder}`,
                              cursor: 'pointer',
                              background: atlasViewPageId === p.id ? '#0d9488' : darkTheme ? '#334155' : '#e5e7eb',
                              color: atlasViewPageId === p.id ? '#fff' : text,
                            }}
                          >
                            Page {p.id}
                          </button>
                        ))}
                    </div>
                  )}
                  <WithTooltip darkTheme={darkTheme} block tip="Atlas preview. Glyph outlines reflect the current character table.">
                    <div
                      ref={textureHostRef}
                      style={{
                        height: PREVIEW_HOST_HEIGHT,
                        width: '100%',
                        border: `1px solid ${panelBorder}`,
                        borderRadius: 8,
                        overflow: 'hidden',
                        contain: 'strict',
                        background: 'var(--shoebox-canvas-bg)',
                      }}
                    />
                  </WithTooltip>
                </div>
                <div
                  style={{
                    display: comparePixiToBaseline ? 'flex' : 'none',
                    flexDirection: 'column',
                    minWidth: 0,
                    gap: 6,
                  }}
                  aria-hidden={!comparePixiToBaseline}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <WithTooltip darkTheme={darkTheme} tip="BitmapText from the last import or generator snapshot (same atlas files).">
                      <div style={{ fontSize: 12, fontWeight: 600, color: textMuted }}>Loaded</div>
                    </WithTooltip>
                    <WithTooltip darkTheme={darkTheme} tip="Reset pan and zoom for the loaded snapshot panel.">
                      <button
                        type="button"
                        disabled={baselineAtlasPixelMatchesCommon !== true}
                        onClick={() => baselinePreviewRef.current?.resetPreviewView()}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: 6,
                          border: `1px solid ${inputBorder}`,
                          cursor: baselineAtlasPixelMatchesCommon !== true ? 'not-allowed' : 'pointer',
                          background: darkTheme ? '#334155' : '#e5e7eb',
                          color: text,
                          flexShrink: 0,
                          opacity: baselineAtlasPixelMatchesCommon !== true ? 0.55 : 1,
                        }}
                      >
                        Center
                      </button>
                    </WithTooltip>
                  </div>
                  {baselineAtlasPixelMatchesCommon === true ? (
                    <WithTooltip darkTheme={darkTheme} block tip="Last import or generator metrics at the time they were applied.">
                      <div
                        ref={baselinePreviewHostRef}
                        style={{
                          height: PREVIEW_HOST_HEIGHT,
                          width: '100%',
                          border: `1px solid ${panelBorder}`,
                          borderRadius: 8,
                          overflow: 'hidden',
                          contain: 'strict',
                          background: pixiPreviewHostBg,
                        }}
                      />
                    </WithTooltip>
                  ) : baselineAtlasPixelMatchesCommon === false ? (
                    <div
                      style={{
                        height: PREVIEW_HOST_HEIGHT,
                        width: '100%',
                        border: `1px solid ${panelBorder}`,
                        borderRadius: 8,
                        overflow: 'auto',
                        contain: 'strict',
                        background: pixiPreviewHostBg,
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: textMuted,
                        padding: 10,
                        boxSizing: 'border-box',
                      }}
                    >
                      Loaded snapshot expects atlas size{' '}
                      <strong style={{ color: text }}>{baselineModel.common.scaleW}×{baselineModel.common.scaleH}</strong> px (from{' '}
                      <code style={{ fontFamily: 'monospace', fontSize: 11 }}>&lt;common&gt;</code> at import). The uploaded image does not match, so this panel
                      is hidden until the atlas matches that size or you reload font data.
                    </div>
                  ) : (
                    <div
                      style={{
                        height: PREVIEW_HOST_HEIGHT,
                        width: '100%',
                        border: `1px solid ${panelBorder}`,
                        borderRadius: 8,
                        overflow: 'hidden',
                        contain: 'strict',
                        background: pixiPreviewHostBg,
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: textMuted,
                        padding: 10,
                        boxSizing: 'border-box',
                      }}
                    >
                      Checking atlas for loaded snapshot…
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 6 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <WithTooltip
                      darkTheme={darkTheme}
                      tip={
                        comparePixiToBaseline
                          ? 'Live BitmapText with your current XML and atlas.'
                          : 'Live BitmapText using BitmapFont.install with your XML and atlas.'
                      }
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: textMuted }}>
                        {comparePixiToBaseline ? 'Current' : 'Live preview'}
                      </div>
                    </WithTooltip>
                    <WithTooltip darkTheme={darkTheme} tip="Reset pan and zoom so the preview text fits and is centered in the box.">
                      <button
                        type="button"
                        disabled={atlasPixelMatchesCommon !== true}
                        onClick={() => previewRef.current?.resetPreviewView()}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: 6,
                          border: `1px solid ${inputBorder}`,
                          cursor: atlasPixelMatchesCommon !== true ? 'not-allowed' : 'pointer',
                          background: darkTheme ? '#334155' : '#e5e7eb',
                          color: text,
                          flexShrink: 0,
                          opacity: atlasPixelMatchesCommon !== true ? 0.55 : 1,
                        }}
                      >
                        Center
                      </button>
                    </WithTooltip>
                  </div>
                  <WithTooltip darkTheme={darkTheme} block tip="Renders the same way as in-game BitmapText.">
                    <div
                      ref={previewHostRef}
                      style={{
                        height: PREVIEW_HOST_HEIGHT,
                        width: '100%',
                        border: `1px solid ${panelBorder}`,
                        borderRadius: 8,
                        overflow: 'hidden',
                        contain: 'strict',
                        background: pixiPreviewHostBg,
                      }}
                    />
                  </WithTooltip>
                </div>
              </div>
            </section>

            <section
              style={{
                ...panelChrome,
                ...(hasXml ? { marginBottom: 0 } : !dirty ? { marginBottom: 0 } : {}),
              }}
              aria-labelledby="glyphs-kerning-heading"
            >
              <h2 id="glyphs-kerning-heading" style={sectionTitle}>
                Glyphs &amp; kerning
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: text }}>Global advance X</span>
                    <WithTooltip
                      darkTheme={darkTheme}
                      block
                      tip="Horizontal spacing added to every glyph (Shoebox-style global tracking). Each row’s +Advance X is added on top. Exported BMFont &lt;char xadvance&gt; is the sum so Pixi and other tools stay compatible."
                    >
                      <ScrubNumberInput
                        value={model.common.globalXAdvance ?? 0}
                        onValueChange={(n) => setModel((p) => setCommon(p, { globalXAdvance: n }))}
                        baselineValue={baselineModel.common.globalXAdvance ?? 0}
                        resetControlBg={inputBg}
                        resetControlBorder={inputBorder}
                        resetControlColor={text}
                        style={{
                          width: 88,
                          padding: 6,
                          background: inputBg,
                          color: text,
                          border: `1px solid ${inputBorder}`,
                          borderRadius: 4,
                          boxSizing: 'border-box',
                        }}
                      />
                    </WithTooltip>
                  </label>
                  <span style={{ fontSize: 11, color: textMuted, maxWidth: 420, lineHeight: 1.4 }}>
                    Per-glyph column is the extra advance on top of this value; XML still stores combined xadvance per character.
                  </span>
                </div>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: 12,
                    color: text,
                  }}
                >
                  <WithTooltip
                    darkTheme={darkTheme}
                    tip="When off, Atlas X/Y, width, and height are hidden in the table and in the quick glyph editor from the texture view (offsets and advance stay visible). Dragging glyph boxes on the atlas still updates X/Y. Preference is saved in this browser."
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={showAtlasRectColumns}
                        onChange={(e) => setShowAtlasRectColumns(e.target.checked)}
                      />
                      Show atlas X/Y, width &amp; height
                    </span>
                  </WithTooltip>
                </label>
                <BitmapFontCharTable
                  ref={charTableRef}
                  chars={model.chars}
                  baselineChars={baselineModel.chars}
                  selectedId={selectedCharId}
                  onSelect={setSelectedCharId}
                  onPatch={patchCharAt}
                  onBulkDelta={bulkCharDelta}
                  onBulkPreset={bulkCharPreset}
                  showAtlasRectColumns={showAtlasRectColumns}
                  darkTheme={darkTheme}
                  text={text}
                  textMuted={textMuted}
                  inputBorder={inputBorder}
                  inputBg={inputBg}
                />

                <BitmapFontKerningEditor
                  ref={kernEditorRef}
                  kernings={model.kernings}
                  baselineKernings={baselineModel.kernings}
                  onPatch={(i, p) => setModel((prev) => patchKerning(prev, i, p))}
                  onRemove={(i) => setModel((prev) => removeKerningAt(prev, i))}
                  onAdd={() => setModel((prev) => addKerning(prev, { first: 32, second: 32, amount: 0 }))}
                  charCodeLabel={charCodeLabel}
                  darkTheme={darkTheme}
                  text={text}
                  textMuted={textMuted}
                  inputBorder={inputBorder}
                  inputBg={inputBg}
                />
              </div>
            </section>

            <section style={{ ...panelChrome, marginTop: 16 }} aria-labelledby="diagnostics-heading">
              <button
                type="button"
                id="diagnostics-heading"
                onClick={() => setDiagnosticsOpen((o) => !o)}
                aria-expanded={diagnosticsOpen}
                aria-controls="diagnostics-panel"
                style={{
                  ...sectionTitle,
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span>Diagnostics</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: textMuted }}>{diagnosticsOpen ? '▼' : '▶'}</span>
              </button>
              {diagnosticsOpen && (
                <div
                  id="diagnostics-panel"
                  role="region"
                  aria-label="Font validation messages"
                  aria-live="polite"
                  style={{ marginTop: 10, fontSize: 12, lineHeight: 1.45, color: text }}
                >
                  {sortedDiagnostics.length === 0 ? (
                    <p style={{ margin: 0, color: textMuted }}>No issues.</p>
                  ) : (
                    <>
                      <p style={{ margin: '0 0 10px', fontSize: 12, color: textMuted }}>
                        <strong style={{ color: text }}>Fix next:</strong> {diagnosticCounts.errors} error
                        {diagnosticCounts.errors !== 1 ? 's' : ''}, {diagnosticCounts.warnings} warning
                        {diagnosticCounts.warnings !== 1 ? 's' : ''},{' '}
                        {diagnosticCounts.infos} info — highest severity first.
                      </p>
                      <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                        {sortedDiagnostics.map((d, di) => (
                          <li
                            key={`diag-${di}`}
                            style={{
                              marginBottom: 8,
                              display: 'flex',
                              flexWrap: 'wrap',
                              alignItems: 'flex-start',
                              gap: 8,
                              color: d.level === 'error' ? '#dc2626' : d.level === 'warn' ? '#ca8a04' : textMuted,
                            }}
                          >
                            <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                              <strong style={{ fontWeight: 600 }}>[{d.level}]</strong> {d.message}
                            </span>
                            {d.target && (
                              <button
                                type="button"
                                onClick={() => applyDiagnosticTarget(d.target!)}
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: '4px 10px',
                                  cursor: 'pointer',
                                  borderRadius: 6,
                                  border: `1px solid ${inputBorder}`,
                                  background: darkTheme ? '#334155' : '#e5e7eb',
                                  color: text,
                                  flexShrink: 0,
                                }}
                              >
                                Jump
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {hasXml && (
                    <div
                      style={{
                        marginTop: 14,
                        paddingTop: 12,
                        borderTop: `1px solid ${panelBorder}`,
                      }}
                    >
                      <WithTooltip
                        darkTheme={darkTheme}
                        block
                        tip="Serializes the current model to BMFont XML, parses it back, and compares glyph ids, counts, kernings, and common atlas size fields. Does not change your font."
                      >
                        <button
                          type="button"
                          onClick={() => {
                            const r = verifyBitmapFontXmlRoundTrip(serialized, indent)
                            setRoundTripNote(
                              r.ok
                                ? 'Round-trip OK (glyph ids, counts, kernings, and common scale/pages match after parse → serialize → parse).'
                                : r.messages.join('\n')
                            )
                          }}
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '6px 12px',
                            cursor: 'pointer',
                            borderRadius: 8,
                            border: `1px solid ${inputBorder}`,
                            background: darkTheme ? '#334155' : '#e5e7eb',
                            color: text,
                          }}
                        >
                          Verify XML round-trip
                        </button>
                      </WithTooltip>
                      {roundTripNote != null && (
                        <pre
                          style={{
                            margin: '8px 0 0',
                            fontSize: 11,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            color: roundTripNote.startsWith('Round-trip OK') ? '#059669' : '#b91c1c',
                            fontFamily: 'var(--font-geist-mono), monospace',
                          }}
                        >
                          {roundTripNote}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Save/export only when serialized XML differs from last load or download baseline. */}
            {hasXml && (
              <section
                style={{ ...panelChrome, marginTop: 16, marginBottom: 0 }}
                aria-labelledby="save-export-heading"
              >
                <h2 id="save-export-heading" style={sectionTitle}>
                  Save &amp; export
                  {dirty && (
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#ca8a04' }}>(unsaved edits)</span>
                  )}
                </h2>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    alignItems: 'center',
                    marginBottom: 0,
                    minWidth: 0,
                  }}
                >
                  <WithTooltip darkTheme={darkTheme} tip="Download the current font as BMFont XML to your computer.">
                    <button
                      type="button"
                      onClick={downloadXml}
                      style={{
                        fontSize: 12,
                        padding: '8px 16px',
                        cursor: 'pointer',
                        background: '#10b981',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      Download XML
                    </button>
                  </WithTooltip>
                  <WithTooltip darkTheme={darkTheme} tip="ZIP contains the exported XML plus each page image that could be read from the current session.">
                    <button
                      type="button"
                      disabled={!ready}
                      onClick={() => void downloadZipBundle()}
                      style={{
                        fontSize: 12,
                        padding: '8px 16px',
                        cursor: ready ? 'pointer' : 'not-allowed',
                        opacity: ready ? 1 : 0.45,
                        background: darkTheme ? '#334155' : '#e5e7eb',
                        color: text,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 8,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      Download ZIP
                    </button>
                  </WithTooltip>
                  <WithTooltip darkTheme={darkTheme} tip="BMFont ASCII (.fnt) text — same data as the XML export.">
                    <button
                      type="button"
                      onClick={downloadFnt}
                      style={{
                        fontSize: 12,
                        padding: '8px 16px',
                        cursor: 'pointer',
                        background: darkTheme ? '#334155' : '#e5e7eb',
                        color: text,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 8,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      Download .fnt
                    </button>
                  </WithTooltip>
                  <WithTooltip darkTheme={darkTheme} tip="AngelCode BMFont binary format (BMF version 3). Some engines load this instead of ASCII .fnt.">
                    <button
                      type="button"
                      onClick={downloadFntBinary}
                      style={{
                        fontSize: 12,
                        padding: '8px 16px',
                        cursor: 'pointer',
                        background: darkTheme ? '#334155' : '#e5e7eb',
                        color: text,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 8,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      Download binary .fnt
                    </button>
                  </WithTooltip>
                  <label
                    style={{
                      fontSize: 12,
                      color: textMuted,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      flex: '1 1 200px',
                      minWidth: 0,
                    }}
                  >
                    Export name
                    <WithTooltip darkTheme={darkTheme} block tip="File name used when you click Download XML (e.g. myfont.xml).">
                      <input
                        value={exportFileName}
                        onChange={(e) => setExportFileName(e.target.value)}
                        style={{
                          padding: '6px 8px',
                          width: '100%',
                          maxWidth: 360,
                          boxSizing: 'border-box',
                          background: 'var(--shoebox-input-bg)',
                          color: 'var(--shoebox-text)',
                          border: '1px solid var(--shoebox-border)',
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                      />
                    </WithTooltip>
                  </label>
                </div>
              </section>
            )}
          </>
        )}
      </div>
        {atlasGlyphPopover &&
          atlasGlyphPopoverChar &&
          atlasGlyphPopoverPosition &&
          typeof document !== 'undefined' &&
          createPortal(
            <div
              ref={atlasGlyphPopoverRef}
              role="dialog"
              aria-labelledby="atlas-glyph-popover-title"
              style={{
                position: 'fixed',
                left: atlasGlyphPopoverPosition.left,
                top: atlasGlyphPopoverPosition.top,
                width: atlasGlyphPopoverPosition.width,
                zIndex: SHOEBOX_GLYPH_POPOVER_Z_INDEX,
                padding: 14,
                borderRadius: 10,
                border: `1px solid ${panelBorder}`,
                background: panelBg,
                boxShadow: darkTheme ? '0 12px 40px rgba(0,0,0,0.55)' : '0 12px 40px rgba(0,0,0,0.18)',
                maxHeight: 'min(420px, 70vh)',
                overflowY: 'auto',
                color: text,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <h3 id="atlas-glyph-popover-title" style={{ margin: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>
                  Glyph U+{atlasGlyphPopoverChar.ch.id.toString(16).toUpperCase()} ({atlasGlyphPopoverChar.ch.id}){' '}
                  <span style={{ fontWeight: 500, color: textMuted }}>{glyphLabelForCode(atlasGlyphPopoverChar.ch.id)}</span>
                </h3>
                <button
                  type="button"
                  onClick={closeAtlasGlyphPopover}
                  aria-label="Close glyph editor"
                  style={{
                    flexShrink: 0,
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '4px 10px',
                    cursor: 'pointer',
                    borderRadius: 6,
                    border: `1px solid ${inputBorder}`,
                    background: inputBg,
                    color: text,
                  }}
                >
                  Close
                </button>
              </div>
              <WithTooltip
                darkTheme={darkTheme}
                block
                portalZIndex={GLYPH_POPOVER_TIP_PORTAL_Z}
                tip={GLYPH_POPOVER_FIELD_TIPS.showAtlasRect}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 11,
                    color: textMuted,
                    cursor: 'pointer',
                    marginBottom: 6,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showAtlasRectColumns}
                    onChange={(e) => setShowAtlasRectColumns(e.target.checked)}
                  />
                  Show atlas X/Y, width &amp; height
                </label>
              </WithTooltip>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11 }}>
                {showAtlasRectColumns && (
                  <>
                    <WithTooltip
                      darkTheme={darkTheme}
                      block
                      portalZIndex={GLYPH_POPOVER_TIP_PORTAL_Z}
                      tip={GLYPH_POPOVER_FIELD_TIPS.atlasX}
                    >
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: textMuted }}>
                        Atlas X
                        <ScrubNumberInput
                          value={atlasGlyphPopoverChar.ch.x}
                          onValueChange={(n) => patchCharAt(atlasGlyphPopoverIndex, { x: n })}
                          baselineValue={atlasGlyphPopoverChar.bk?.x}
                          resetControlBg={inputBg}
                          resetControlBorder={inputBorder}
                          resetControlColor={text}
                          style={{
                            width: '100%',
                            padding: 6,
                            background: inputBg,
                            color: text,
                            border: `1px solid ${inputBorder}`,
                            borderRadius: 4,
                            boxSizing: 'border-box',
                          }}
                        />
                      </label>
                    </WithTooltip>
                    <WithTooltip
                      darkTheme={darkTheme}
                      block
                      portalZIndex={GLYPH_POPOVER_TIP_PORTAL_Z}
                      tip={GLYPH_POPOVER_FIELD_TIPS.atlasY}
                    >
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: textMuted }}>
                        Atlas Y
                        <ScrubNumberInput
                          value={atlasGlyphPopoverChar.ch.y}
                          onValueChange={(n) => patchCharAt(atlasGlyphPopoverIndex, { y: n })}
                          baselineValue={atlasGlyphPopoverChar.bk?.y}
                          resetControlBg={inputBg}
                          resetControlBorder={inputBorder}
                          resetControlColor={text}
                          style={{
                            width: '100%',
                            padding: 6,
                            background: inputBg,
                            color: text,
                            border: `1px solid ${inputBorder}`,
                            borderRadius: 4,
                            boxSizing: 'border-box',
                          }}
                        />
                      </label>
                    </WithTooltip>
                    <WithTooltip
                      darkTheme={darkTheme}
                      block
                      portalZIndex={GLYPH_POPOVER_TIP_PORTAL_Z}
                      tip={GLYPH_POPOVER_FIELD_TIPS.width}
                    >
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: textMuted }}>
                        Width
                        <ScrubNumberInput
                          value={atlasGlyphPopoverChar.ch.width}
                          onValueChange={(n) => patchCharAt(atlasGlyphPopoverIndex, { width: n })}
                          baselineValue={atlasGlyphPopoverChar.bk?.width}
                          resetControlBg={inputBg}
                          resetControlBorder={inputBorder}
                          resetControlColor={text}
                          style={{
                            width: '100%',
                            padding: 6,
                            background: inputBg,
                            color: text,
                            border: `1px solid ${inputBorder}`,
                            borderRadius: 4,
                            boxSizing: 'border-box',
                          }}
                        />
                      </label>
                    </WithTooltip>
                    <WithTooltip
                      darkTheme={darkTheme}
                      block
                      portalZIndex={GLYPH_POPOVER_TIP_PORTAL_Z}
                      tip={GLYPH_POPOVER_FIELD_TIPS.height}
                    >
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: textMuted }}>
                        Height
                        <ScrubNumberInput
                          value={atlasGlyphPopoverChar.ch.height}
                          onValueChange={(n) => patchCharAt(atlasGlyphPopoverIndex, { height: n })}
                          baselineValue={atlasGlyphPopoverChar.bk?.height}
                          resetControlBg={inputBg}
                          resetControlBorder={inputBorder}
                          resetControlColor={text}
                          style={{
                            width: '100%',
                            padding: 6,
                            background: inputBg,
                            color: text,
                            border: `1px solid ${inputBorder}`,
                            borderRadius: 4,
                            boxSizing: 'border-box',
                          }}
                        />
                      </label>
                    </WithTooltip>
                  </>
                )}
                <WithTooltip
                  darkTheme={darkTheme}
                  block
                  portalZIndex={GLYPH_POPOVER_TIP_PORTAL_Z}
                  tip={GLYPH_POPOVER_FIELD_TIPS.xoffset}
                >
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: textMuted }}>
                    Offset X
                    <ScrubNumberInput
                      value={atlasGlyphPopoverChar.ch.xoffset}
                      onValueChange={(n) => patchCharAt(atlasGlyphPopoverIndex, { xoffset: n })}
                      baselineValue={atlasGlyphPopoverChar.bk?.xoffset}
                      resetControlBg={inputBg}
                      resetControlBorder={inputBorder}
                      resetControlColor={text}
                      style={{
                        width: '100%',
                        padding: 6,
                        background: inputBg,
                        color: text,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 4,
                        boxSizing: 'border-box',
                      }}
                    />
                  </label>
                </WithTooltip>
                <WithTooltip
                  darkTheme={darkTheme}
                  block
                  portalZIndex={GLYPH_POPOVER_TIP_PORTAL_Z}
                  tip={GLYPH_POPOVER_FIELD_TIPS.yoffset}
                >
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: textMuted }}>
                    Offset Y
                    <ScrubNumberInput
                      value={atlasGlyphPopoverChar.ch.yoffset}
                      onValueChange={(n) => patchCharAt(atlasGlyphPopoverIndex, { yoffset: n })}
                      baselineValue={atlasGlyphPopoverChar.bk?.yoffset}
                      resetControlBg={inputBg}
                      resetControlBorder={inputBorder}
                      resetControlColor={text}
                      style={{
                        width: '100%',
                        padding: 6,
                        background: inputBg,
                        color: text,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 4,
                        boxSizing: 'border-box',
                      }}
                    />
                  </label>
                </WithTooltip>
                <WithTooltip
                  darkTheme={darkTheme}
                  block
                  portalZIndex={GLYPH_POPOVER_TIP_PORTAL_Z}
                  tip={GLYPH_POPOVER_FIELD_TIPS.xadvance}
                >
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: textMuted }}>
                    +Advance X
                    <ScrubNumberInput
                      value={atlasGlyphPopoverChar.ch.xadvance}
                      onValueChange={(n) => patchCharAt(atlasGlyphPopoverIndex, { xadvance: n })}
                      baselineValue={atlasGlyphPopoverChar.bk?.xadvance}
                      resetControlBg={inputBg}
                      resetControlBorder={inputBorder}
                      resetControlColor={text}
                      style={{
                        width: '100%',
                        padding: 6,
                        background: inputBg,
                        color: text,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 4,
                        boxSizing: 'border-box',
                      }}
                    />
                  </label>
                </WithTooltip>
                <p style={{ margin: 0, fontSize: 10, color: textMuted, lineHeight: 1.45 }}>
                  Drag the glyph rectangle on the atlas to move X/Y; click without dragging to open this panel. Per-glyph
                  advance is on top of Global advance X (see Glyphs section). Use the checkbox above (or under Glyphs) to show
                  atlas rect fields in this dialog and in the character table.
                </p>
              </div>
            </div>,
            document.body
          )}
    </div>
  )
}
