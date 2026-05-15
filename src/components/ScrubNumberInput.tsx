'use client'

import React, { useCallback, useLayoutEffect, useRef, useState } from 'react'

export type ScrubNumberInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number
  onValueChange: (n: number) => void
  /** Model units added per one screen pixel of horizontal drag. Default 1. */
  sensitivity?: number
  /** Horizontal movement (px) before scrub activates; below this, click behaves normally. */
  deadZonePx?: number
  min?: number
  max?: number
  /** Increment for scrub rounding and native step (e.g. 0.01 for fractions in 0–1). */
  step?: number
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

function decimalPlacesFromStep(step: number): number {
  const s = String(step)
  const dot = s.indexOf('.')
  if (dot < 0) return 0
  return s.length - dot - 1
}

/** Round `n` to the nearest multiple of `step` (supports fractional steps like 0.01). */
export function roundToStep(n: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return Math.round(n)
  if (step >= 1) return Math.round(n / step) * step
  const places = decimalPlacesFromStep(step)
  const factor = 10 ** places
  return Math.round(n * factor) / factor
}

const PARTIAL_DECIMAL = /^-?\d*\.?\d*$/

function isPartialDecimalInput(raw: string): boolean {
  return raw === '' || raw === '.' || raw === '-' || raw === '-.' || raw.endsWith('.')
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
  step = 1,
  style,
  className,
  onPointerDown: onPointerDownProp,
  onFocus: onFocusProp,
  onBlur: onBlurProp,
  disabled,
  baselineValue,
  resetControlBg,
  resetControlBorder,
  resetControlColor,
  ...rest
}: ScrubNumberInputProps) {
  const valueRef = useRef(value)
  const [editText, setEditText] = useState<string | null>(null)
  const fractional = step > 0 && step < 1

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
          setEditText(null)
          try {
            el.setPointerCapture(pointerId)
          } catch {
            /* already captured or unsupported */
          }
        }
        ev.preventDefault()
        const next = clamp(roundToStep(startValue + dx * sensitivity, step), min, max)
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
    [value, deadZonePx, sensitivity, step, min, max, onValueChange, onPointerDownProp, disabled],
  )

  const base = Number.isFinite(value) ? value : 0
  const mergedClass = [className, 'shoebox-scrub-number'].filter(Boolean).join(' ')

  const styleObj = (style ?? {}) as React.CSSProperties
  const { width: widthFromStyle, ...inputOnlyStyle } = styleObj

  const displayValue = fractional && editText !== null ? editText : String(base)

  const commitFromText = useCallback(
    (raw: string, fallback: number) => {
      const n = parseFloat(raw)
      return clamp(Number.isFinite(n) ? n : fallback, min, max)
    },
    [min, max],
  )

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      onFocusProp?.(e)
      if (fractional) setEditText(String(base))
    },
    [fractional, base, onFocusProp],
  )

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      onBlurProp?.(e)
      if (!fractional) return
      const raw = editText ?? String(base)
      onValueChange(commitFromText(raw, base))
      setEditText(null)
    },
    [fractional, editText, base, onValueChange, commitFromText, onBlurProp],
  )

  const handleChange = useCallback(
    (ev: React.ChangeEvent<HTMLInputElement>) => {
      const raw = ev.target.value
      if (fractional) {
        if (!PARTIAL_DECIMAL.test(raw)) return
        setEditText(raw)
        if (!isPartialDecimalInput(raw)) {
          onValueChange(commitFromText(raw, base))
        }
        return
      }
      const n = Number(raw)
      onValueChange(Number.isFinite(n) ? clamp(n, min, max) : 0)
    },
    [fractional, base, onValueChange, commitFromText, min, max],
  )

  const inputType = fractional ? 'text' : 'number'
  const inputMode = fractional ? 'decimal' : rest.inputMode

  const canRestore =
    typeof baselineValue === 'number' &&
    Number.isFinite(baselineValue) &&
    !disabled &&
    base !== baselineValue

  const restoreTitle = `Restore value from last import or generator (${baselineValue})`

  const commonInputProps: React.InputHTMLAttributes<HTMLInputElement> = {
    type: inputType,
    inputMode,
    className: mergedClass,
    disabled,
    value: displayValue,
    onChange: handleChange,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onPointerDown: handlePointerDown,
    step,
    min,
    max,
    ...rest,
  }

  if (!canRestore) {
    return (
      <input
        {...commonInputProps}
        style={{ cursor: 'ew-resize', ...styleObj }}
      />
    )
  }

  const inputEl = (
    <input
      {...commonInputProps}
      style={{
        cursor: 'ew-resize',
        ...inputOnlyStyle,
        flex: 1,
        minWidth: 0,
        width: 'auto',
      }}
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
          setEditText(null)
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
