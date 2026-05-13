import { parseBitmapFontXml } from './BitmapFontParser'
import { serializeBitmapFontXml } from './BitmapFontSerializer'
import type { BitmapFontModel } from './types'

export type BitmapFontRoundTripResult = {
  ok: boolean
  messages: string[]
}

function sortedUniqueIds(model: BitmapFontModel): number[] {
  return [...new Set(model.chars.map((c) => c.id))].sort((a, b) => a - b)
}

function sortedKerningSigs(model: BitmapFontModel): string[] {
  return model.kernings
    .map((k) => `${k.first}\t${k.second}\t${k.amount}`)
    .sort()
}

function shallowCommonIssues(a: BitmapFontModel['common'], b: BitmapFontModel['common']): string[] {
  const m: string[] = []
  if (a.lineHeight !== b.lineHeight) m.push(`lineHeight ${a.lineHeight} → ${b.lineHeight}`)
  if (a.scaleW !== b.scaleW) m.push(`scaleW ${a.scaleW} → ${b.scaleW}`)
  if (a.scaleH !== b.scaleH) m.push(`scaleH ${a.scaleH} → ${b.scaleH}`)
  if (a.pages !== b.pages) m.push(`common.pages ${a.pages} → ${b.pages}`)
  return m
}

/**
 * Parse XML → serialize → parse again and compare structural fields.
 * Does not mutate the input model.
 */
export function verifyBitmapFontXmlRoundTrip(xml: string, indent: string): BitmapFontRoundTripResult {
  const messages: string[] = []
  let first: BitmapFontModel
  try {
    first = parseBitmapFontXml(xml)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, messages: [`Initial parse failed: ${msg}`] }
  }

  let roundXml: string
  try {
    roundXml = serializeBitmapFontXml(first, { indent })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, messages: [`Serialize failed: ${msg}`] }
  }

  let second: BitmapFontModel
  try {
    second = parseBitmapFontXml(roundXml)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, messages: [`Round-trip parse failed: ${msg}`] }
  }

  if (first.chars.length !== second.chars.length) {
    messages.push(`Glyph count ${first.chars.length} → ${second.chars.length}`)
  }
  const ids1 = sortedUniqueIds(first)
  const ids2 = sortedUniqueIds(second)
  if (ids1.length !== ids2.length || ids1.some((v, i) => v !== ids2[i])) {
    messages.push('Character id set differs after round-trip.')
  }
  if (first.kernings.length !== second.kernings.length) {
    messages.push(`Kerning row count ${first.kernings.length} → ${second.kernings.length}`)
  }
  const k1 = sortedKerningSigs(first)
  const k2 = sortedKerningSigs(second)
  if (k1.length !== k2.length || k1.some((v, i) => v !== k2[i])) {
    messages.push('Kerning pairs differ after round-trip.')
  }
  messages.push(...shallowCommonIssues(first.common, second.common))
  if (first.pages.length !== second.pages.length) {
    messages.push(`<page> count ${first.pages.length} → ${second.pages.length}`)
  }

  return { ok: messages.length === 0, messages }
}
