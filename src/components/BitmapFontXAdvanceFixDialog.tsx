'use client'

import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import { ScrubNumberInput } from '@/components/ScrubNumberInput'
import { SHOEBOX_GLYPH_POPOVER_Z_INDEX, WithTooltip } from '@/components/WithTooltip'
import { glyphLabelForCode } from '@/lib/bitmapFont/BitmapFontCharTable'
import {
  DEFAULT_XADVANCE_FIX_OPTIONS,
  formatXAdvanceChange,
  type XAdvanceFixOptions,
  type XAdvanceFixSuggestion,
} from '@/lib/bitmapFont/bitmapFontMetricsUtils'

const MODAL_Z_INDEX = SHOEBOX_GLYPH_POPOVER_Z_INDEX + 2
const TOOLTIP_Z_INDEX = MODAL_Z_INDEX + 1

export type BitmapFontXAdvanceFixDialogProps = {
  open: boolean
  suggestions: XAdvanceFixSuggestion[]
  options: XAdvanceFixOptions
  globalXAdvance: number
  onOptionsChange: (patch: Partial<XAdvanceFixOptions>) => void
  onApply: () => void
  onCancel: () => void
  darkTheme: boolean
  text: string
  textMuted: string
  inputBorder: string
  inputBg: string
}

function formatGlyphCode(id: number): string {
  return `U+${id.toString(16).toUpperCase().padStart(4, '0')}`
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontWeight: 600,
  fontSize: 11,
}

const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  verticalAlign: 'top',
}

export function BitmapFontXAdvanceFixDialog({
  open,
  suggestions,
  options,
  globalXAdvance,
  onOptionsChange,
  onApply,
  onCancel,
  darkTheme,
  text,
  textMuted,
  inputBorder,
  inputBg,
}: BitmapFontXAdvanceFixDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const panelBg = darkTheme ? '#1e293b' : '#ffffff'
  const hasSuggestions = suggestions.length > 0

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open || typeof document === 'undefined') return null

  const btnBase: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    padding: '8px 14px',
    cursor: 'pointer',
    borderRadius: 8,
    border: `1px solid ${inputBorder}`,
  }

  const fieldLabel: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 11,
    color: textMuted,
    minWidth: 120,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: 6,
    background: inputBg,
    color: text,
    border: `1px solid ${inputBorder}`,
    borderRadius: 4,
    boxSizing: 'border-box',
  }

  const padding = options.padding ?? DEFAULT_XADVANCE_FIX_OPTIONS.padding
  const tolerance = options.tolerance ?? DEFAULT_XADVANCE_FIX_OPTIONS.tolerance
  const absoluteThreshold = options.absoluteThreshold ?? DEFAULT_XADVANCE_FIX_OPTIONS.absoluteThreshold
  const relativeThreshold = options.relativeThreshold ?? DEFAULT_XADVANCE_FIX_OPTIONS.relativeThreshold
  const includeSpaces = options.includeSpaces ?? DEFAULT_XADVANCE_FIX_OPTIONS.includeSpaces

  return createPortal(
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: MODAL_Z_INDEX,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: darkTheme ? 'rgba(15, 23, 42, 0.72)' : 'rgba(15, 23, 42, 0.45)',
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="xadvance-fix-dialog-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 720,
          maxHeight: 'min(92vh, 720px)',
          display: 'flex',
          flexDirection: 'column',
          padding: 20,
          borderRadius: 12,
          border: `1px solid ${inputBorder}`,
          background: panelBg,
          color: text,
          boxShadow: darkTheme ? '0 20px 50px rgba(0,0,0,0.55)' : '0 20px 50px rgba(0,0,0,0.2)',
        }}
      >
        <h3 id="xadvance-fix-dialog-title" style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, lineHeight: 1.35 }}>
          Auto Fix xAdvance
        </h3>
        <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5, color: textMuted }}>
          {hasSuggestions
            ? `${suggestions.length} glyph(s) with suspicious xadvance (effective = global + local).`
            : 'No suspicious xAdvance values found.'}
        </p>

        {globalXAdvance !== 0 && (
          <p style={{ margin: '0 0 12px', fontSize: 11, lineHeight: 1.45, color: textMuted }}>
            Effective = global + local (matches export/Pixi). Global advance X is {globalXAdvance}px and is not changed by
            this tool.
          </p>
        )}

        <details style={{ marginBottom: 14, fontSize: 12, color: textMuted }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, color: text, marginBottom: 8 }}>
            Advanced detection options
          </summary>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              marginTop: 10,
              paddingTop: 4,
            }}
          >
            <label style={fieldLabel}>
              Padding (px)
              <WithTooltip
                darkTheme={darkTheme}
                block
                portalZIndex={TOOLTIP_Z_INDEX}
                tip="Pixels added after the visible right edge (xoffset + width) when computing expected effective xadvance. Default 4."
              >
                <ScrubNumberInput
                  value={padding}
                  onValueChange={(n) => onOptionsChange({ padding: Math.max(0, Math.round(n)) })}
                  min={0}
                  style={inputStyle}
                />
              </WithTooltip>
            </label>
            <label style={fieldLabel}>
              Tolerance (px)
              <WithTooltip
                darkTheme={darkTheme}
                block
                portalZIndex={TOOLTIP_Z_INDEX}
                tip="Extra effective advance allowed above expected before a glyph is flagged. Default 0."
              >
                <ScrubNumberInput
                  value={tolerance}
                  onValueChange={(n) => onOptionsChange({ tolerance: Math.max(0, Math.round(n)) })}
                  min={0}
                  style={inputStyle}
                />
              </WithTooltip>
            </label>
            <label style={fieldLabel}>
              Absolute threshold (px)
              <WithTooltip
                darkTheme={darkTheme}
                block
                portalZIndex={TOOLTIP_Z_INDEX}
                tip="Minimum excess advance (px) required to flag a glyph. Used alone for narrow glyphs (width ≤ 8px), e.g. “.” and “,”. Default 6."
              >
                <ScrubNumberInput
                  value={absoluteThreshold}
                  onValueChange={(n) => onOptionsChange({ absoluteThreshold: Math.max(0, Math.round(n)) })}
                  min={0}
                  style={inputStyle}
                />
              </WithTooltip>
            </label>
            <label style={fieldLabel}>
              Relative threshold
              <WithTooltip
                darkTheme={darkTheme}
                block
                portalZIndex={TOOLTIP_Z_INDEX}
                tip="Minimum excess as a fraction of glyph width (0–1). For wider glyphs, threshold = max(absolute, width × relative). Default 0.2."
              >
                <ScrubNumberInput
                  value={relativeThreshold}
                  onValueChange={(n) => onOptionsChange({ relativeThreshold: Math.max(0, Math.min(1, n)) })}
                  min={0}
                  max={1}
                  step={0.01}
                  sensitivity={0.01}
                  style={inputStyle}
                />
              </WithTooltip>
            </label>
            <WithTooltip
              darkTheme={darkTheme}
              portalZIndex={TOOLTIP_Z_INDEX}
              tip="When off, space (U+0020) is skipped — it often has little or no atlas ink and relies on advance only."
            >
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: text,
                  cursor: 'pointer',
                  alignSelf: 'flex-end',
                  marginBottom: 6,
                }}
              >
                <input
                  type="checkbox"
                  checked={includeSpaces}
                  onChange={(e) => onOptionsChange({ includeSpaces: e.target.checked })}
                />
                Include spaces
              </label>
            </WithTooltip>
          </div>
        </details>

        {hasSuggestions && (
          <div
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              overflow: 'auto',
              marginBottom: 16,
              border: `1px solid ${inputBorder}`,
              borderRadius: 8,
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 12,
                color: text,
              }}
            >
              <thead>
                <tr style={{ background: darkTheme ? '#0f172a' : '#f8fafc', position: 'sticky', top: 0 }}>
                  <th style={thStyle}>Glyph</th>
                  <th style={thStyle}>
                    <WithTooltip
                      darkTheme={darkTheme}
                      portalZIndex={TOOLTIP_Z_INDEX}
                      tip="Effective xadvance (global + local) as used by Pixi and export — old → new with signed change."
                    >
                      <span>Effective</span>
                    </WithTooltip>
                  </th>
                  <th style={thStyle}>
                    <WithTooltip
                      darkTheme={darkTheme}
                      portalZIndex={TOOLTIP_Z_INDEX}
                      tip="Per-glyph local xadvance stored in the editor — old → new with signed change."
                    >
                      <span>Local</span>
                    </WithTooltip>
                  </th>
                  <th style={{ ...thStyle, minWidth: 140 }}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => (
                  <tr key={s.charId} style={{ borderTop: `1px solid ${inputBorder}` }}>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600 }}>{glyphLabelForCode(s.charId)}</span>
                      <span style={{ display: 'block', fontSize: 10, color: textMuted }}>{formatGlyphCode(s.charId)}</span>
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {formatXAdvanceChange(s.oldEffectiveXAdvance, s.suggestedEffectiveXAdvance)}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {formatXAdvanceChange(s.oldLocalXAdvance, s.suggestedLocalXAdvance)}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11, color: textMuted, lineHeight: 1.4 }}>{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            style={{ ...btnBase, background: inputBg, color: text }}
          >
            {hasSuggestions ? 'Cancel' : 'Close'}
          </button>
          {hasSuggestions && (
            <button
              type="button"
              onClick={onApply}
              style={{
                ...btnBase,
                border: 'none',
                background: darkTheme ? '#2563eb' : '#1d4ed8',
                color: '#fff',
              }}
            >
              Apply fixes
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
