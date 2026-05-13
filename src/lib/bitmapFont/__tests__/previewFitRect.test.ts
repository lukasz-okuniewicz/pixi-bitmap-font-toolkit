import { describe, expect, it } from 'vitest'
import { computeUniformFitScale, PREVIEW_SCALE_MAX, PREVIEW_SCALE_MIN } from '../previewFitRect'

describe('computeUniformFitScale', () => {
  it('returns null for non-positive bounds', () => {
    expect(computeUniformFitScale(0, 100, 200, 200, 16, PREVIEW_SCALE_MIN, PREVIEW_SCALE_MAX)).toBeNull()
    expect(computeUniformFitScale(100, -1, 200, 200, 16, PREVIEW_SCALE_MIN, PREVIEW_SCALE_MAX)).toBeNull()
  })

  it('scales down when content is larger than padded viewport', () => {
    const s = computeUniformFitScale(400, 200, 200, 200, 16, PREVIEW_SCALE_MIN, PREVIEW_SCALE_MAX)
    expect(s).toBeCloseTo(168 / 400, 5)
  })

  it('clamps to max when content is tiny', () => {
    const s = computeUniformFitScale(1, 1, 500, 500, 16, PREVIEW_SCALE_MIN, PREVIEW_SCALE_MAX)
    expect(s).toBe(PREVIEW_SCALE_MAX)
  })

  it('clamps to min when content is huge', () => {
    const s = computeUniformFitScale(100_000, 100_000, 200, 200, 16, PREVIEW_SCALE_MIN, PREVIEW_SCALE_MAX)
    expect(s).toBe(PREVIEW_SCALE_MIN)
  })
})
