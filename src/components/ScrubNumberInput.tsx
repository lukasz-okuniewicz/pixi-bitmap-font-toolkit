'use client'

import React, { useCallback, useLayoutEffect, useRef } from 'react'

export type ScrubNumberInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number
  onValueChange: (n: number) => void
  /** Model units added per one screen pixel of horizontal drag. Default 1. */
  sensitivity?: number
  /** Horizontal movement (px) before scrub activates; below this, click behaves normally. */
  deadZonePx?: number
  min?: number
  max?: number
  /**
   * When a finite number and different from `value`, shows a small control to restore that number
   * (typically from the last import / generator snapshot). `null` / `undefined` = no restore UI.
   */
  baselineValue?: number | null
  /** Optional colors for the restore control (matches surrounding inputs). */
  resetControlBg?: string
  resetControlBorder?: string
  resetControlColor?: string
}

function clamp(n: number, min?: number, max?: number): number {
  let v = n
  if (min != null) v = Math.max(min, v)
  if (max != null) v = Math.min(max, v)
  return v
}

/**
 * Native number input with horizontal drag-to-adjust: hold primary button and move
 * left/right. Small movement keeps normal click-to-focus typing.
 */
export function ScrubNumberInput({
  value,
  onValueChange,
  sensitivity = 1,
  deadZonePx = 4,
  min,
  max,
  style,
  className,
  onPointerDown: onPointerDownProp,
  disabled,
  baselineValue,
  resetControlBg,
  resetControlBorder,
  resetControlColor,
  ...rest
}: ScrubNumberInputProps) {
  const valueRef = useRef(value)

  useLayoutEffect(() => {
    valueRef.current = value
  }, [value])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLInputElement>) => {
      onPointerDownProp?.(e)
      if (e.button !== 0 || disabled) return

      const el = e.currentTarget
      const startValue = Number.isFinite(value) ? value : 0
      const pointerId = e.pointerId
      const startX = e.clientX

      let scrubbing = false

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return
        const dx = ev.clientX - startX
        if (!scrubbing) {
          if (Math.abs(dx) < deadZonePx) return
          scrubbing = true
          try {
            el.setPointerCapture(pointerId)
          } catch {
            /* already captured or unsupported */
          }
        }
        ev.preventDefault()
        const next = clamp(Math.round(startValue + dx * sensitivity), min, max)
        const latest = Number.isFinite(valueRef.current) ? valueRef.current : 0
        if (next === latest) return
        onValueChange(next)
      }

      const onEnd = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return
        if (scrubbing) {
          try {
            el.releasePointerCapture(pointerId)
          } catch {
            /* ignore */
          }
        }
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onEnd)
        window.removeEventListener('pointercancel', onEnd)
      }

      window.addEventListener('pointermove', onMove, { passive: false })
      window.addEventListener('pointerup', onEnd)
      window.addEventListener('pointercancel', onEnd)
    },
    [value, deadZonePx, sensitivity, min, max, onValueChange, onPointerDownProp, disabled],
  )

  const base = Number.isFinite(value) ? value : 0
  const mergedClass = [className, 'shoebox-scrub-number'].filter(Boolean).join(' ')

  const styleObj = (style ?? {}) as React.CSSProperties
  const { width: widthFromStyle, ...inputOnlyStyle } = styleObj

  const canRestore =
    typeof baselineValue === 'number' &&
    Number.isFinite(baselineValue) &&
    !disabled &&
    base !== baselineValue

  const restoreTitle = `Restore value from last import or generator (${baselineValue})`

  if (!canRestore) {
    return (
      <input
        type="number"
        className={mergedClass}
        disabled={disabled}
        value={base}
        onChange={(ev) => {
          const n = Number(ev.target.value)
          onValueChange(Number.isFinite(n) ? n : 0)
        }}
        onPointerDown={handlePointerDown}
        style={{ cursor: 'ew-resize', ...styleObj }}
        {...rest}
      />
    )
  }

  const inputEl = (
    <input
      type="number"
      className={mergedClass}
      disabled={disabled}
      value={base}
      onChange={(ev) => {
        const n = Number(ev.target.value)
        onValueChange(Number.isFinite(n) ? n : 0)
      }}
      onPointerDown={handlePointerDown}
      style={{
        cursor: 'ew-resize',
        ...inputOnlyStyle,
        flex: 1,
        minWidth: 0,
        width: 'auto',
      }}
      {...rest}
    />
  )

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'stretch',
        width: widthFromStyle ?? '100%',
        gap: 2,
        verticalAlign: 'middle',
      }}
    >
      {inputEl}
      <button
        type="button"
        aria-label={restoreTitle}
        title={restoreTitle}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onValueChange(clamp(baselineValue, min, max))
        }}
        style={{
          flex: '0 0 auto',
          minWidth: 18,
          padding: '0 2px',
          fontSize: 12,
          lineHeight: 1,
          cursor: 'pointer',
          borderRadius: 4,
          border: `1px solid ${resetControlBorder ?? 'var(--shoebox-border, #d1d5db)'}`,
          background: resetControlBg ?? 'var(--shoebox-input-bg, #fff)',
          color: resetControlColor ?? 'var(--shoebox-text, #111827)',
        }}
      >
        ↺
      </button>
    </span>
  )
}
