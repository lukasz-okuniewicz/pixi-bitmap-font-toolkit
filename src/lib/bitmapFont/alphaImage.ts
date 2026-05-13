/** Alpha channel index in RGBA ImageData. */
const A = 3

export type AlphaBBox = { x: number; y: number; width: number; height: number }

/**
 * Tight axis-aligned bbox of pixels with alpha > threshold inside [x0,y0]-[x1,y1] inclusive.
 * Returns null if no such pixel.
 */
export function alphaBBoxInRect(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  alphaThreshold: number
): AlphaBBox | null {
  const xmin = Math.max(0, Math.min(x0, x1))
  const ymin = Math.max(0, Math.min(y0, y1))
  const xmax = Math.min(width - 1, Math.max(x0, x1))
  const ymax = Math.min(height - 1, Math.max(y0, y1))
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = ymin; y <= ymax; y++) {
    const row = y * width * 4
    for (let x = xmin; x <= xmax; x++) {
      if (data[row + x * 4 + A] > alphaThreshold) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/** Max alpha in column x within rows [y0, y1] inclusive. */
export function columnMaxAlpha(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y0: number,
  y1: number
): number {
  const ymin = Math.max(0, Math.min(y0, y1))
  const ymax = Math.min(height - 1, Math.max(y0, y1))
  let m = 0
  const xi = Math.max(0, Math.min(width - 1, x))
  for (let y = ymin; y <= ymax; y++) {
    const a = data[y * width * 4 + xi * 4 + A]
    if (a > m) m = a
  }
  return m
}

/** True if any pixel in row y exceeds threshold. */
export function rowHasInk(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  y: number,
  alphaThreshold: number
): boolean {
  const yi = Math.max(0, Math.min(height - 1, y))
  const row = yi * width * 4
  for (let x = 0; x < width; x++) {
    if (data[row + x * 4 + A] > alphaThreshold) return true
  }
  return false
}

export function padBBox(b: AlphaBBox, pad: number, maxW: number, maxH: number): AlphaBBox {
  if (pad <= 0) return clampBBox(b, maxW, maxH)
  return clampBBox(
    {
      x: b.x - pad,
      y: b.y - pad,
      width: b.width + pad * 2,
      height: b.height + pad * 2,
    },
    maxW,
    maxH
  )
}

function clampBBox(b: AlphaBBox, maxW: number, maxH: number): AlphaBBox {
  let { x, y, width, height } = b
  if (x < 0) {
    width += x
    x = 0
  }
  if (y < 0) {
    height += y
    y = 0
  }
  if (x + width > maxW) width = maxW - x
  if (y + height > maxH) height = maxH - y
  width = Math.max(0, width)
  height = Math.max(0, height)
  return { x, y, width, height }
}
