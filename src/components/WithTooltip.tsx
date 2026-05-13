'use client'

import React, { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type WithTooltipProps = {
  tip: string
  children: React.ReactNode
  darkTheme: boolean
  /** Stretch wrapper to full width (grid cells, textareas) */
  block?: boolean
  maxWidthPx?: number
}

/**
 * Hover help shown immediately under the control (fixed position, portaled to
 * `document.body` so it is not clipped by `overflow: hidden` on parents).
 * Hides immediately on mouse out; `relatedTarget` keeps the tooltip open while
 * moving from the trigger onto the portaled panel.
 */
export function WithTooltip({ tip, children, darkTheme, block, maxWidthPx = 320 }: WithTooltipProps) {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const hide = () => {
    setOpen(false)
    setPos(null)
  }

  const leaveWrap = (e: React.MouseEvent) => {
    const next = e.relatedTarget
    // `relatedTarget` is not always a Node (e.g. Window in some cases); `contains` requires a Node.
    if (next instanceof Node && tipRef.current?.contains(next)) return
    hide()
  }

  const leaveTip = (e: React.MouseEvent) => {
    const next = e.relatedTarget
    if (next instanceof Node && wrapRef.current?.contains(next)) return
    hide()
  }

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) {
      setPos(null)
      return
    }
    const update = () => {
      const el = wrapRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setPos({ left: r.left, top: r.bottom + 6 })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  const tipBg = darkTheme ? '#1e293b' : '#fff'
  const tipBorder = darkTheme ? '#475569' : '#d1d5db'
  const tipShadow = darkTheme ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.15)'
  const tipColor = darkTheme ? '#f1f5f9' : '#1f2937'

  const portal =
    open &&
    pos &&
    tip.trim() !== '' &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        ref={tipRef}
        role="tooltip"
        onMouseLeave={leaveTip}
        style={{
          position: 'fixed',
          left: pos.left,
          top: pos.top,
          zIndex: 2_147_000_000,
          minWidth: 100,
          maxWidth: maxWidthPx,
          padding: '8px 10px',
          borderRadius: 8,
          fontSize: 11,
          fontWeight: 500,
          lineHeight: 1.45,
          color: tipColor,
          background: tipBg,
          border: `1px solid ${tipBorder}`,
          boxShadow: tipShadow,
          pointerEvents: 'auto',
          whiteSpace: 'normal',
          textAlign: 'left',
        }}
      >
        {tip}
      </div>,
      document.body
    )

  return (
    <>
      <span
        ref={wrapRef}
        style={{
          position: 'relative',
          display: block ? 'block' : 'inline-block',
          width: block ? '100%' : undefined,
          verticalAlign: block ? undefined : 'middle',
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={leaveWrap}
      >
        {children}
      </span>
      {portal}
    </>
  )
}
