'use client'

import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import { SHOEBOX_GLYPH_POPOVER_Z_INDEX } from '@/components/WithTooltip'

const MODAL_Z_INDEX = SHOEBOX_GLYPH_POPOVER_Z_INDEX + 2

export type ConfirmDialogProps = {
  open: boolean
  title: string
  children: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  darkTheme: boolean
  text: string
  textMuted: string
  inputBorder: string
  inputBg: string
  destructive?: boolean
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  darkTheme,
  text,
  textMuted,
  inputBorder,
  inputBg,
  destructive = true,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const panelBg = darkTheme ? '#1e293b' : '#ffffff'

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
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 400,
          padding: 20,
          borderRadius: 12,
          border: `1px solid ${inputBorder}`,
          background: panelBg,
          color: text,
          boxShadow: darkTheme ? '0 20px 50px rgba(0,0,0,0.55)' : '0 20px 50px rgba(0,0,0,0.2)',
        }}
      >
        <h3 id="confirm-dialog-title" style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, lineHeight: 1.35 }}>
          {title}
        </h3>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: textMuted, marginBottom: 20 }}>{children}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            style={{ ...btnBase, background: inputBg, color: text }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              ...btnBase,
              border: destructive ? 'none' : `1px solid ${inputBorder}`,
              background: destructive ? (darkTheme ? '#b91c1c' : '#dc2626') : inputBg,
              color: destructive ? '#fff' : text,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
