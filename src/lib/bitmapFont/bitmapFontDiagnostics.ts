import {
  DEFAULT_XADVANCE_FIX_OPTIONS,
  findSuspiciousXAdvanceChars,
  formatXAdvanceChange,
  type XAdvanceFixOptions,
} from './bitmapFontMetricsUtils'
import { charAtlasPage } from './types'
import type { BitmapFontModel } from './types'

export type BitmapFontDiagnosticLevel = 'info' | 'warn' | 'error'

export type BitmapFontDiagnosticTarget =
  | { kind: 'char'; id: number }
  | { kind: 'kerning'; first: number; second: number }
  | { kind: 'page'; id: number }

export type BitmapFontDiagnostic = {
  level: BitmapFontDiagnosticLevel
  code: string
  message: string
  target?: BitmapFontDiagnosticTarget
}

const pageIdSet = (model: BitmapFontModel): Set<number> => new Set(model.pages.map((p) => p.id))

export function bitmapFontDiagnostics(model: BitmapFontModel): BitmapFontDiagnostic[] {
  const out: BitmapFontDiagnostic[] = []
  const ids = model.chars.map((c) => c.id)
  const idSet = new Set<number>()
  for (const id of ids) {
    if (idSet.has(id)) {
      out.push({
        level: 'error',
        code: 'dup_char_id',
        message: `Duplicate character id ${id} in <chars>.`,
        target: { kind: 'char', id },
      })
    }
    idSet.add(id)
  }

  const pageIds = pageIdSet(model)
  if (model.common.pages !== model.pages.length) {
    const firstPageId = model.pages[0]?.id ?? 0
    out.push({
      level: 'warn',
      code: 'pages_count_mismatch',
      message: `<common pages="${model.common.pages}"> does not match number of <page> entries (${model.pages.length}).`,
      target: { kind: 'page', id: firstPageId },
    })
  }

  const sw = model.common.scaleW
  const sh = model.common.scaleH
  for (const c of model.chars) {
    const p = charAtlasPage(c)
    if (!pageIds.has(p)) {
      out.push({
        level: 'error',
        code: 'char_page_missing',
        message: `Glyph U+${c.id.toString(16)} uses page=${p} but no <page id="${p}"> exists.`,
        target: { kind: 'char', id: c.id },
      })
    }
    if (c.width <= 0 || c.height <= 0) {
      out.push({
        level: 'warn',
        code: 'zero_glyph_rect',
        message: `Glyph U+${c.id.toString(16)} has width×height ${c.width}×${c.height}.`,
        target: { kind: 'char', id: c.id },
      })
    }
    const r = c.x + c.width
    const b = c.y + c.height
    if (c.width > 0 && c.height > 0 && (c.x < 0 || c.y < 0 || r > sw || b > sh)) {
      out.push({
        level: 'warn',
        code: 'glyph_outside_atlas',
        message: `Glyph U+${c.id.toString(16)} rectangle [${c.x},${c.y},${c.width},${c.height}] extends outside common scale ${sw}×${sh}.`,
        target: { kind: 'char', id: c.id },
      })
    }
  }

  for (const k of model.kernings) {
    if (!idSet.has(k.first)) {
      out.push({
        level: 'warn',
        code: 'kerning_unknown_first',
        message: `Kerning pair references unknown first character id ${k.first}.`,
        target: { kind: 'kerning', first: k.first, second: k.second },
      })
    }
    if (!idSet.has(k.second)) {
      out.push({
        level: 'warn',
        code: 'kerning_unknown_second',
        message: `Kerning pair references unknown second character id ${k.second}.`,
        target: { kind: 'kerning', first: k.first, second: k.second },
      })
    }
  }

  const pageFiles = model.pages.map((p) => p.file.trim()).filter(Boolean)
  const dupFile = pageFiles.filter((f, i) => pageFiles.indexOf(f) !== i)
  if (dupFile.length > 0) {
    out.push({
      level: 'warn',
      code: 'dup_page_file',
      message: `Duplicate page file name(s): ${[...new Set(dupFile)].join(', ')}.`,
    })
  }

  if (model.chars.length === 0) {
    out.push({ level: 'info', code: 'no_chars', message: 'Font has no glyphs (<chars> is empty).' })
  }

  out.push(...bitmapFontXAdvanceDiagnostics(model))

  return out
}

/** Diagnostics for glyphs whose effective xadvance exceeds visible width (same rules as Auto Fix xAdvance). */
export function bitmapFontXAdvanceDiagnostics(
  model: BitmapFontModel,
  options?: XAdvanceFixOptions
): BitmapFontDiagnostic[] {
  const out: BitmapFontDiagnostic[] = []
  const suspicious = findSuspiciousXAdvanceChars(model, options ?? DEFAULT_XADVANCE_FIX_OPTIONS)

  if (suspicious.length === 0) {
    out.push({
      level: 'info',
      code: 'xadvance_none_suspicious',
      message: 'No suspicious xAdvance values found.',
    })
    return out
  }

  const n = suspicious.length
  out.push({
    level: 'warn',
    code: 'xadvance_suspicious_summary',
    message: `${n} glyph(s) with suspicious xadvance (effective = global + local). Use Auto Fix xAdvance in Preview guides.`,
  })

  for (const s of suspicious) {
    const code = `U+${s.charId.toString(16).toUpperCase().padStart(4, '0')}`
    out.push({
      level: 'warn',
      code: 'xadvance_suspicious',
      message: `${code}: effective ${formatXAdvanceChange(s.oldEffectiveXAdvance, s.suggestedEffectiveXAdvance)}; local ${formatXAdvanceChange(s.oldLocalXAdvance, s.suggestedLocalXAdvance)}.`,
      target: { kind: 'char', id: s.charId },
    })
  }

  return out
}
