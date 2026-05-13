/** Same clamp as preview wheel zoom in `BitmapFontPreview`. */
export const PREVIEW_SCALE_MIN = 0.25
export const PREVIEW_SCALE_MAX = 8

/**
 * Uniform scale so `boundsWidth` × `boundsHeight` fits inside the padded viewport.
 * Returns `null` if inputs are invalid.
 */
export function computeUniformFitScale(
  boundsWidth: number,
  boundsHeight: number,
  viewportW: number,
  viewportH: number,
  pad: number,
  minS: number,
  maxS: number
): number | null {
  if (
    !Number.isFinite(boundsWidth) ||
    !Number.isFinite(boundsHeight) ||
    boundsWidth <= 0 ||
    boundsHeight <= 0 ||
    !Number.isFinite(viewportW) ||
    !Number.isFinite(viewportH) ||
    viewportW <= 0 ||
    viewportH <= 0
  ) {
    return null
  }
  const innerW = viewportW - 2 * pad
  const innerH = viewportH - 2 * pad
  if (innerW <= 0 || innerH <= 0) return null
  const raw = Math.min(innerW / boundsWidth, innerH / boundsHeight)
  if (!Number.isFinite(raw) || raw <= 0) return null
  return Math.min(maxS, Math.max(minS, raw))
}
