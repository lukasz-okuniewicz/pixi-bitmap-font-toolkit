'use client'

import React, { forwardRef, useImperativeHandle, useRef } from 'react'

import { ScrubNumberInput } from '@/components/ScrubNumberInput'
import { WithTooltip } from '@/components/WithTooltip'
import type { BitmapFontKerning } from './types'

export type BitmapFontKerningEditorHandle = {
  scrollToPair: (first: number, second: number) => void
}

type Props = {
  kernings: BitmapFontKerning[]
  onPatch: (index: number, patch: Partial<BitmapFontKerning>) => void
  onRemove: (index: number) => void
  onAdd: () => void
  previewFirst: string
  previewSecond: string
  onPreviewFirst: (v: string) => void
  onPreviewSecond: (v: string) => void
  charCodeLabel: (code: number) => string
  darkTheme: boolean
  text: string
  textMuted: string
  inputBorder: string
  inputBg: string
}

export const BitmapFontKerningEditor = forwardRef<BitmapFontKerningEditorHandle, Props>(function BitmapFontKerningEditor(
  {
    kernings,
    onPatch,
    onRemove,
    onAdd,
    previewFirst,
    previewSecond,
    onPreviewFirst,
    onPreviewSecond,
    charCodeLabel,
    darkTheme,
    text,
    textMuted,
    inputBorder,
    inputBg,
  },
  ref
) {
  const scrollBodyRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    scrollToPair(first: number, second: number) {
      const el = scrollBodyRef.current?.querySelector(`[data-kern-row="${first}_${second}"]`)
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    },
  }))

  const a = previewFirst.length ? previewFirst.codePointAt(0) : null
  const b = previewSecond.length ? previewSecond.codePointAt(0) : null
  let pairAmount: number | null = null
  if (a != null && b != null) {
    const row = kernings.find((k) => k.first === a && k.second === b)
    pairAmount = row ? row.amount : null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: text }}>Kerning ({kernings.length})</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 10, color: textMuted }}>
        <WithTooltip
          darkTheme={darkTheme}
          tip="Type or paste a character; the last character is used as the first code point in the pair you are previewing."
        >
          <span style={{ display: 'inline-block' }}>Kerning preview:</span>
        </WithTooltip>
        <WithTooltip
          darkTheme={darkTheme}
          tip="First glyph in the pair (Unicode). Decimal code is also shown in the table below."
        >
          <input
            value={previewFirst}
            onChange={(e) => onPreviewFirst(e.target.value.slice(-1) ? e.target.value.slice(-1) : '')}
            placeholder="first"
            maxLength={4}
            style={{ width: 48, fontSize: 10, padding: 4, background: inputBg, color: text, border: `1px solid ${inputBorder}`, borderRadius: 4 }}
          />
        </WithTooltip>
        <WithTooltip darkTheme={darkTheme} tip="Second glyph in the pair (Unicode).">
          <input
            value={previewSecond}
            onChange={(e) => onPreviewSecond(e.target.value.slice(-1) ? e.target.value.slice(-1) : '')}
            placeholder="second"
            maxLength={4}
            style={{ width: 48, fontSize: 10, padding: 4, background: inputBg, color: text, border: `1px solid ${inputBorder}`, borderRadius: 4 }}
          />
        </WithTooltip>
        {pairAmount != null && (
          <span style={{ color: text }}>
            amount: <strong>{pairAmount}</strong>
          </span>
        )}
        {a != null && b != null && pairAmount == null && <span style={{ color: textMuted }}>no pair</span>}
      </div>
      <WithTooltip
        darkTheme={darkTheme}
        block
        tip="Kerning pairs: extra horizontal offset (pixels) when the first glyph is immediately followed by the second. Negative values pull glyphs together."
      >
        <div
          ref={scrollBodyRef}
          style={{
            maxHeight: 160,
            overflow: 'auto',
            border: `1px solid ${inputBorder}`,
            borderRadius: 6,
            background: darkTheme ? '#0f172a' : '#fff',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ background: darkTheme ? '#1e293b' : '#f3f4f6', color: text }}>
                <th style={{ textAlign: 'left', padding: 6 }}>
                  <WithTooltip darkTheme={darkTheme} tip="Unicode code point (decimal) of the first glyph in the pair.">
                    <span style={{ cursor: 'help' }}>first</span>
                  </WithTooltip>
                </th>
                <th style={{ textAlign: 'left', padding: 6 }}>
                  <WithTooltip darkTheme={darkTheme} tip="Unicode code point (decimal) of the second glyph in the pair.">
                    <span style={{ cursor: 'help' }}>second</span>
                  </WithTooltip>
                </th>
                <th style={{ textAlign: 'left', padding: 6 }}>
                  <WithTooltip
                    darkTheme={darkTheme}
                    tip="Adjustment in pixels applied after the first glyph when it is followed by the second (can be negative)."
                  >
                    <span style={{ cursor: 'help' }}>amount</span>
                  </WithTooltip>
                </th>
                <th style={{ padding: 6 }}>
                  <WithTooltip darkTheme={darkTheme} tip="Actions for each row.">
                    <span style={{ cursor: 'help' }}> </span>
                  </WithTooltip>
                </th>
              </tr>
            </thead>
            <tbody>
              {kernings.map((k, i) => (
                <tr
                  key={`${k.first}-${k.second}-${i}`}
                  data-kern-row={`${k.first}_${k.second}`}
                  style={{ borderTop: `1px solid ${inputBorder}` }}
                >
                  <td style={{ padding: 4 }}>
                    <WithTooltip darkTheme={darkTheme} block tip="First glyph: Unicode code point (decimal).">
                      <ScrubNumberInput
                        value={k.first}
                        onValueChange={(n) => onPatch(i, { first: n })}
                        style={{
                          width: '100%',
                          fontSize: 10,
                          padding: 4,
                          background: inputBg,
                          color: text,
                          border: `1px solid ${inputBorder}`,
                          borderRadius: 4,
                          boxSizing: 'border-box',
                        }}
                      />
                    </WithTooltip>
                    <span style={{ fontSize: 9, color: textMuted }}>{charCodeLabel(k.first)}</span>
                  </td>
                  <td style={{ padding: 4 }}>
                    <WithTooltip darkTheme={darkTheme} block tip="Second glyph: Unicode code point (decimal).">
                      <ScrubNumberInput
                        value={k.second}
                        onValueChange={(n) => onPatch(i, { second: n })}
                        style={{
                          width: '100%',
                          fontSize: 10,
                          padding: 4,
                          background: inputBg,
                          color: text,
                          border: `1px solid ${inputBorder}`,
                          borderRadius: 4,
                          boxSizing: 'border-box',
                        }}
                      />
                    </WithTooltip>
                    <span style={{ fontSize: 9, color: textMuted }}>{charCodeLabel(k.second)}</span>
                  </td>
                  <td style={{ padding: 4 }}>
                    <WithTooltip darkTheme={darkTheme} block tip="Kerning amount in pixels (negative pulls the second glyph closer to the first).">
                      <ScrubNumberInput
                        value={k.amount}
                        onValueChange={(n) => onPatch(i, { amount: n })}
                        style={{
                          width: '100%',
                          fontSize: 10,
                          padding: 4,
                          background: inputBg,
                          color: text,
                          border: `1px solid ${inputBorder}`,
                          borderRadius: 4,
                          boxSizing: 'border-box',
                        }}
                      />
                    </WithTooltip>
                  </td>
                  <td style={{ padding: 4 }}>
                    <WithTooltip darkTheme={darkTheme} tip="Remove this kerning pair from the font.">
                      <button
                        type="button"
                        onClick={() => onRemove(i)}
                        style={{
                          fontSize: 10,
                          padding: '4px 8px',
                          cursor: 'pointer',
                          border: `1px solid ${inputBorder}`,
                          borderRadius: 4,
                          background: darkTheme ? '#374151' : '#fee8e8',
                          color: text,
                        }}
                      >
                        Remove
                      </button>
                    </WithTooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </WithTooltip>
      <WithTooltip darkTheme={darkTheme} tip="Append a new kerning row (defaults 32→32, amount 0). Edit values in the table.">
        <button
          type="button"
          onClick={onAdd}
          style={{
            alignSelf: 'flex-start',
            fontSize: 10,
            padding: '6px 10px',
            cursor: 'pointer',
            border: `1px solid ${inputBorder}`,
            borderRadius: 6,
            background: inputBg,
            color: text,
          }}
        >
          Add kerning pair
        </button>
      </WithTooltip>
    </div>
  )
})
