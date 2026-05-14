import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

import { ScrubNumberInput } from '@/components/ScrubNumberInput'
import { WithTooltip } from '@/components/WithTooltip'
import type { BitmapFontChar } from './types'

/** Human-readable label for a Unicode code point (for the glyph column). */
export function glyphLabelForCode(code: number): string {
  if (!Number.isFinite(code) || code < 0) return '—'
  if (code === 32) return '(space)'
  if (code === 9) return '(tab)'
  if (code === 10) return '(newline)'
  if (code === 13) return '(return)'
  try {
    return String.fromCodePoint(code)
  } catch {
    return '—'
  }
}

function rowMatchesFilter(c: BitmapFontChar, qRaw: string): boolean {
  const q = qRaw.trim()
  if (!q) return true
  const low = q.toLowerCase()
  if (glyphLabelForCode(c.id).toLowerCase().includes(low)) return true
  if (String(c.id).includes(q)) return true
  const hex = q.replace(/^u\+/i, '').replace(/^0x/i, '').trim()
  if (/^[0-9a-fA-F]+$/.test(hex) && hex.length <= 6) {
    const code = parseInt(hex, 16)
    if (!Number.isNaN(code) && c.id === code) return true
  }
  if (/^-?\d+$/.test(q.trim()) && c.id === Number(q.trim())) return true
  return false
}

const GRID_COLS = '28px 52px 72px 56px 56px 56px 56px 56px 56px 56px 56px'

export type BitmapFontBulkDelta = {
  dx?: number
  dy?: number
  xoffset?: number
  yoffset?: number
  xadvance?: number
}

export type BitmapFontBulkPreset = 'xadvance_equals_width' | 'xadvance_equals_max_wh'

export type BitmapFontCharTableHandle = {
  /** Clears filter if needed, scrolls the glyph row into view, selects the character. */
  scrollToCharId: (id: number) => boolean
  setFilterText: (q: string) => void
}

type Props = {
  chars: BitmapFontChar[]
  selectedId: number | null
  onSelect: (id: number | null) => void
  onPatch: (index: number, patch: Partial<BitmapFontChar>) => void
  onBulkDelta?: (indices: number[], delta: BitmapFontBulkDelta) => void
  onBulkPreset?: (indices: number[], preset: BitmapFontBulkPreset) => void
  darkTheme: boolean
  text: string
  textMuted: string
  inputBorder: string
  inputBg: string
}

export const BitmapFontCharTable = forwardRef<BitmapFontCharTableHandle, Props>(function BitmapFontCharTable(
  { chars, selectedId, onSelect, onPatch, onBulkDelta, onBulkPreset, darkTheme, text, textMuted, inputBorder, inputBg },
  ref
) {
  const parentRef = useRef<HTMLDivElement>(null)
  const charsRef = useRef(chars)
  charsRef.current = chars
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const [filter, setFilter] = useState('')
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(() => new Set())
  const anchorIndexRef = useRef<number | null>(null)
  const lastPrimaryIdRef = useRef<number | null>(null)
  const didMountRef = useRef(false)
  /** Virtual row index (into `rowIndices`) highlighted for keyboard navigation. */
  const [keyboardVRow, setKeyboardVRow] = useState<number | null>(null)

  const rowIndices = useMemo(() => {
    const out: number[] = []
    for (let i = 0; i < chars.length; i++) {
      if (rowMatchesFilter(chars[i]!, filter)) out.push(i)
    }
    return out
  }, [chars, filter])

  const rowVirtualizer = useVirtualizer({
    count: rowIndices.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 8,
    useFlushSync: false,
  })

  const rowVirtualizerRef = useRef(rowVirtualizer)
  rowVirtualizerRef.current = rowVirtualizer

  useImperativeHandle(ref, () => ({
    scrollToCharId(id: number): boolean {
      const ch = charsRef.current
      const mi = ch.findIndex((c) => c.id === id)
      if (mi < 0) return false
      setFilter('')
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const ch2 = charsRef.current
          const rows: number[] = []
          for (let i = 0; i < ch2.length; i++) {
            if (rowMatchesFilter(ch2[i]!, '')) rows.push(i)
          }
          const vIndex = rows.indexOf(mi)
          if (vIndex < 0) return
          rowVirtualizerRef.current.scrollToIndex(vIndex, { align: 'center' })
          onSelectRef.current(id)
          setKeyboardVRow(vIndex)
        })
      })
      return true
    },
    setFilterText(q: string) {
      setFilter(q)
    },
  }))

  useEffect(() => {
    if (selectedId == null) {
      lastPrimaryIdRef.current = null
      setSelectedIndices((prev) => (prev.size === 0 ? prev : new Set()))
      return
    }
    if (lastPrimaryIdRef.current === selectedId) return
    const idx = chars.findIndex((c) => c.id === selectedId)
    if (idx < 0) return
    lastPrimaryIdRef.current = selectedId
    setSelectedIndices(new Set([idx]))
    anchorIndexRef.current = idx
  }, [selectedId, chars])

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }
    if (selectedIndices.size > 0) return
    onSelect(null)
    lastPrimaryIdRef.current = null
  }, [selectedIndices, onSelect])

  useEffect(() => {
    if (selectedId == null) return
    const mi = chars.findIndex((c) => c.id === selectedId)
    if (mi < 0) return
    const v = rowIndices.indexOf(mi)
    if (v >= 0) setKeyboardVRow(v)
  }, [selectedId, chars, rowIndices])

  useEffect(() => {
    if (keyboardVRow == null) return
    if (keyboardVRow >= rowIndices.length) {
      setKeyboardVRow(rowIndices.length > 0 ? rowIndices.length - 1 : null)
    }
  }, [keyboardVRow, rowIndices.length])

  const cellIn = useCallback(
    (idx: number, field: keyof BitmapFontChar, raw: string) => {
      if (field === 'id') return
      const n = Number(raw)
      onPatch(idx, { [field]: Number.isFinite(n) ? n : 0 } as Partial<BitmapFontChar>)
    },
    [onPatch]
  )

  const applyBulkPreset = useCallback(
    (preset: BitmapFontBulkPreset) => {
      if (!onBulkPreset || selectedIndices.size === 0) return
      onBulkPreset([...selectedIndices], preset)
    },
    [onBulkPreset, selectedIndices]
  )

  const applyBulk = useCallback(
    (delta: BitmapFontBulkDelta) => {
      if (!onBulkDelta || selectedIndices.size === 0) return
      onBulkDelta([...selectedIndices], delta)
    },
    [onBulkDelta, selectedIndices]
  )

  const toggleOne = useCallback(
    (modelIndex: number, virtualIndex: number, e: React.MouseEvent) => {
      const id = chars[modelIndex]!.id
      setKeyboardVRow(virtualIndex)
      if (e.shiftKey && anchorIndexRef.current != null) {
        const a = anchorIndexRef.current
        const lo = Math.min(a, modelIndex)
        const hi = Math.max(a, modelIndex)
        const next = new Set<number>()
        for (let i = lo; i <= hi; i++) next.add(i)
        setSelectedIndices(next)
        onSelect(id)
        lastPrimaryIdRef.current = id
        return
      }
      if (e.metaKey || e.ctrlKey) {
        setSelectedIndices((prev) => {
          const next = new Set(prev)
          if (next.has(modelIndex)) next.delete(modelIndex)
          else next.add(modelIndex)
          return next
        })
        anchorIndexRef.current = modelIndex
        onSelect(id)
        lastPrimaryIdRef.current = id
        return
      }
      setSelectedIndices(new Set([modelIndex]))
      anchorIndexRef.current = modelIndex
      onSelect(id)
      lastPrimaryIdRef.current = id
    },
    [chars, onSelect]
  )

  const selectAllFiltered = useCallback(() => {
    setSelectedIndices(new Set(rowIndices))
    if (rowIndices.length > 0) {
      const last = rowIndices[rowIndices.length - 1]!
      anchorIndexRef.current = last
      onSelect(chars[last]!.id)
      lastPrimaryIdRef.current = chars[last]!.id
      setKeyboardVRow(rowIndices.length - 1)
    }
  }, [rowIndices, chars, onSelect])

  const hdr: Array<{ key: string; label: string; hint: string }> = [
    { key: 'chk', label: '', hint: 'Select row for bulk edit' },
    { key: 'id', label: 'Char code', hint: 'Unicode code point (character ID), e.g. 65 = A' },
    {
      key: 'glyph',
      label: 'Glyph',
      hint: 'What this code point represents: the letter or symbol, or a name for whitespace/control characters',
    },
    { key: 'x', label: 'Atlas X', hint: 'Left position of glyph rectangle in the texture atlas (pixels)' },
    { key: 'y', label: 'Atlas Y', hint: 'Top position of glyph rectangle in the texture atlas (pixels)' },
    { key: 'w', label: 'Width', hint: 'Glyph rectangle width in the texture atlas (pixels)' },
    { key: 'h', label: 'Height', hint: 'Glyph rectangle height in the texture atlas (pixels)' },
    { key: 'xo', label: 'Offset X', hint: 'Horizontal drawing offset from pen position (pixels)' },
    { key: 'yo', label: 'Offset Y', hint: 'Vertical drawing offset from baseline/pen position (pixels)' },
    {
      key: 'adv',
      label: '+Advance X',
      hint: 'Extra horizontal advance added on top of Global advance X; exported xadvance is global + this (pixels)',
    },
  ]

  const fieldTooltips: Record<'x' | 'y' | 'width' | 'height' | 'xoffset' | 'yoffset' | 'xadvance', string> = {
    x: 'Left position of glyph rectangle in the texture atlas (pixels)',
    y: 'Top position of glyph rectangle in the texture atlas (pixels)',
    width: 'Glyph rectangle width in the texture atlas (pixels)',
    height: 'Glyph rectangle height in the texture atlas (pixels)',
    xoffset: 'Horizontal drawing offset from pen position (pixels)',
    yoffset: 'Vertical drawing offset from baseline/pen position (pixels)',
    xadvance:
      'Per-glyph advance added on top of Global advance X; BMFont file stores global + this as each char’s xadvance (pixels)',
  }

  const [openHintKey, setOpenHintKey] = useState<string | null>(null)
  const [bulkDx, setBulkDx] = useState('')
  const [bulkDy, setBulkDy] = useState('')
  const [bulkXo, setBulkXo] = useState('')
  const [bulkYo, setBulkYo] = useState('')
  const [bulkAdv, setBulkAdv] = useState('')

  const tipBg = darkTheme ? '#1e293b' : '#fff'
  const tipBorder = darkTheme ? '#334155' : '#d1d5db'
  const tipShadow = darkTheme ? '0 8px 24px rgba(0,0,0,0.45)' : '0 8px 24px rgba(0,0,0,0.12)'

  const btnSm: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 8px',
    cursor: 'pointer',
    borderRadius: 6,
    border: `1px solid ${inputBorder}`,
    background: darkTheme ? '#334155' : '#e5e7eb',
    color: text,
  }

  const onCharGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (rowIndices.length === 0) return
      if (e.target !== e.currentTarget) return

      const max = rowIndices.length - 1
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setKeyboardVRow((prev) => {
          const next = prev == null ? 0 : Math.min(max, prev + 1)
          const mi = rowIndices[next]!
          onSelect(chars[mi]!.id)
          return next
        })
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setKeyboardVRow((prev) => {
          const next = prev == null ? max : Math.max(0, prev - 1)
          const mi = rowIndices[next]!
          onSelect(chars[mi]!.id)
          return next
        })
        return
      }
      if (e.key === 'Home') {
        e.preventDefault()
        setKeyboardVRow(0)
        const mi = rowIndices[0]!
        onSelect(chars[mi]!.id)
        return
      }
      if (e.key === 'End') {
        e.preventDefault()
        setKeyboardVRow(max)
        const mi = rowIndices[max]!
        onSelect(chars[mi]!.id)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const vr = keyboardVRow ?? 0
        const el = parentRef.current?.querySelector(`[data-vrow="${vr}"] input.shoebox-scrub-number`)
        if (el instanceof HTMLElement) el.focus()
      }
    },
    [chars, keyboardVRow, onSelect, rowIndices]
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0, flex: 1 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: text }}>
        Characters ({chars.length}
        {rowIndices.length !== chars.length ? ` · ${rowIndices.length} shown` : ''})
      </div>
      <div data-font-undo-scope="off" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <label style={{ fontSize: 11, color: textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
          Filter
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Code, U+20AC, glyph…"
            style={{
              width: 200,
              maxWidth: '100%',
              fontSize: 12,
              padding: '4px 8px',
              borderRadius: 6,
              border: `1px solid ${inputBorder}`,
              background: inputBg,
              color: text,
            }}
          />
        </label>
        <button type="button" onClick={selectAllFiltered} style={btnSm}>
          Select filtered
        </button>
        <span style={{ fontSize: 10, color: textMuted }}>
          Focus the grid (click below headers), then ↑/↓ Home/End navigate; Enter edits atlas X.
        </span>
      </div>

      {(onBulkDelta || onBulkPreset) && selectedIndices.size > 0 && (
        <div
          data-font-undo-scope="off"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'flex-end',
            fontSize: 11,
            color: textMuted,
            padding: '6px 0',
          }}
        >
          <span style={{ fontWeight: 600, color: text }}>Bulk ({selectedIndices.size} rows)</span>
          {onBulkDelta && (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                x
                <input
                  value={bulkDx}
                  onChange={(e) => setBulkDx(e.target.value)}
                  inputMode="numeric"
                  style={{ width: 52, fontSize: 11, padding: 4, borderRadius: 4, border: `1px solid ${inputBorder}`, background: inputBg, color: text }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                y
                <input
                  value={bulkDy}
                  onChange={(e) => setBulkDy(e.target.value)}
                  inputMode="numeric"
                  style={{ width: 52, fontSize: 11, padding: 4, borderRadius: 4, border: `1px solid ${inputBorder}`, background: inputBg, color: text }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                xoff
                <input
                  value={bulkXo}
                  onChange={(e) => setBulkXo(e.target.value)}
                  inputMode="numeric"
                  style={{ width: 52, fontSize: 11, padding: 4, borderRadius: 4, border: `1px solid ${inputBorder}`, background: inputBg, color: text }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                yoff
                <input
                  value={bulkYo}
                  onChange={(e) => setBulkYo(e.target.value)}
                  inputMode="numeric"
                  style={{ width: 52, fontSize: 11, padding: 4, borderRadius: 4, border: `1px solid ${inputBorder}`, background: inputBg, color: text }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                adv
                <input
                  value={bulkAdv}
                  onChange={(e) => setBulkAdv(e.target.value)}
                  inputMode="numeric"
                  style={{ width: 52, fontSize: 11, padding: 4, borderRadius: 4, border: `1px solid ${inputBorder}`, background: inputBg, color: text }}
                />
              </label>
              <button
                type="button"
                style={{ ...btnSm, background: '#0d9488', color: '#fff', border: 'none' }}
                onClick={() => {
                  const parse = (s: string) => (s.trim() === '' ? undefined : Number(s))
                  const dx = parse(bulkDx)
                  const dy = parse(bulkDy)
                  const xo = parse(bulkXo)
                  const yo = parse(bulkYo)
                  const adv = parse(bulkAdv)
                  const delta: BitmapFontBulkDelta = {}
                  if (dx !== undefined && Number.isFinite(dx)) delta.dx = dx
                  if (dy !== undefined && Number.isFinite(dy)) delta.dy = dy
                  if (xo !== undefined && Number.isFinite(xo)) delta.xoffset = xo
                  if (yo !== undefined && Number.isFinite(yo)) delta.yoffset = yo
                  if (adv !== undefined && Number.isFinite(adv)) delta.xadvance = adv
                  if (Object.keys(delta).length === 0) return
                  applyBulk(delta)
                }}
              >
                Apply Δ
              </button>
            </>
          )}
          {onBulkPreset && (
            <>
              <button
                type="button"
                style={btnSm}
                title="Sets +Advance X so exported xadvance equals glyph width (uses Global advance X)"
                onClick={() => applyBulkPreset('xadvance_equals_width')}
              >
                adv = width
              </button>
              <button
                type="button"
                style={btnSm}
                title="Sets +Advance X so exported xadvance equals max(width, height)"
                onClick={() => applyBulkPreset('xadvance_equals_max_wh')}
              >
                adv = max(w,h)
              </button>
            </>
          )}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: GRID_COLS,
          gap: 4,
          padding: '4px 8px',
          fontSize: 9,
          fontWeight: 600,
          color: textMuted,
          borderBottom: `1px solid ${inputBorder}`,
          overflow: 'visible',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {hdr.map((h) => (
          <span
            key={h.key}
            style={{ position: 'relative', display: 'inline-block', cursor: h.hint ? 'help' : 'default', textAlign: 'center' }}
            onMouseEnter={() => (h.hint ? setOpenHintKey(h.key) : null)}
            onMouseLeave={() => setOpenHintKey(null)}
          >
            {h.label}
            {openHintKey === h.key && h.hint && (
              <span
                role="tooltip"
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '100%',
                  transform: 'translateX(-50%)',
                  marginTop: 6,
                  zIndex: 400,
                  minWidth: 160,
                  maxWidth: 260,
                  padding: '8px 10px',
                  borderRadius: 6,
                  fontSize: 10,
                  fontWeight: 500,
                  lineHeight: 1.35,
                  color: text,
                  background: tipBg,
                  border: `1px solid ${tipBorder}`,
                  boxShadow: tipShadow,
                  pointerEvents: 'none',
                  whiteSpace: 'normal',
                  textAlign: 'left',
                }}
              >
                {h.hint}
              </span>
            )}
          </span>
        ))}
      </div>
      <WithTooltip
        darkTheme={darkTheme}
        block
        tip="Scroll to browse characters. Cmd/Ctrl+click for multi-select. Bulk row adds the typed deltas to each selected glyph. Click the scroll area (not a cell) to focus the grid, then use arrow keys to move and Enter to edit atlas X."
      >
        <div
          ref={parentRef}
          data-font-undo-scope="off"
          data-char-grid-scroll
          tabIndex={0}
          role="grid"
          aria-label="Character metrics"
          aria-rowcount={rowIndices.length}
          onKeyDown={onCharGridKeyDown}
          style={{
            flex: 1,
            minHeight: 160,
            overflow: 'auto',
            border: `1px solid ${inputBorder}`,
            borderRadius: 6,
            background: darkTheme ? '#0f172a' : '#fff',
            outline: 'none',
          }}
        >
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%', minWidth: 860 }}>
            {rowVirtualizer.getVirtualItems().map((v) => {
              const modelIndex = rowIndices[v.index]!
              const c = chars[modelIndex]
              if (!c) return null
              const sel = selectedIndices.has(modelIndex)
              const kb = keyboardVRow === v.index
              return (
                <div
                  key={`${c.id}-${modelIndex}`}
                  data-vrow={v.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${v.size}px`,
                    transform: `translateY(${v.start}px)`,
                    display: 'grid',
                    gridTemplateColumns: GRID_COLS,
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    boxSizing: 'border-box',
                    background: sel ? (darkTheme ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.12)') : 'transparent',
                    borderBottom: `1px solid ${darkTheme ? '#1e293b' : '#e5e7eb'}`,
                    fontSize: 10,
                    boxShadow: kb ? `inset 0 0 0 2px ${darkTheme ? '#38bdf8' : '#0284c7'}` : undefined,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIndices.has(modelIndex)}
                    onChange={() => {
                      setSelectedIndices((prev) => {
                        const next = new Set(prev)
                        if (next.has(modelIndex)) next.delete(modelIndex)
                        else next.add(modelIndex)
                        return next
                      })
                      anchorIndexRef.current = modelIndex
                      setKeyboardVRow(v.index)
                      onSelect(c.id)
                      lastPrimaryIdRef.current = c.id
                    }}
                    aria-label={`Select glyph ${c.id}`}
                  />
                  <WithTooltip darkTheme={darkTheme} tip={`Unicode code point ${c.id}. Click to select (Shift/Cmd for multi).`}>
                    <button
                      type="button"
                      onClick={(e) => toggleOne(modelIndex, v.index, e)}
                      style={{
                        cursor: 'pointer',
                        border: 'none',
                        background: 'transparent',
                        color: text,
                        textAlign: 'left',
                        padding: 2,
                        fontWeight: sel ? 700 : 400,
                      }}
                    >
                      {c.id}
                    </button>
                  </WithTooltip>
                  <WithTooltip darkTheme={darkTheme} tip={`Glyph for code ${c.id}: ${glyphLabelForCode(c.id)}`}>
                    <span
                      aria-label={`Glyph for code ${c.id}`}
                      style={{
                        color: textMuted,
                        fontSize: 10,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                        display: 'inline-block',
                        maxWidth: '100%',
                      }}
                    >
                      {glyphLabelForCode(c.id)}
                    </span>
                  </WithTooltip>
                  {(['x', 'y', 'width', 'height', 'xoffset', 'yoffset', 'xadvance'] as const).map((field) => (
                    <WithTooltip key={field} darkTheme={darkTheme} block tip={fieldTooltips[field]}>
                      <ScrubNumberInput
                        value={c[field]}
                        onValueChange={(n) => cellIn(modelIndex, field, String(n))}
                        style={{
                          width: '100%',
                          fontSize: 10,
                          padding: '2px 4px',
                          background: inputBg,
                          color: text,
                          border: `1px solid ${inputBorder}`,
                          borderRadius: 4,
                          boxSizing: 'border-box',
                        }}
                      />
                    </WithTooltip>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </WithTooltip>
    </div>
  )
})
