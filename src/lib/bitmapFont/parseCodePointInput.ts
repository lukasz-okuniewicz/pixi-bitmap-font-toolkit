/** Parse user input for a Unicode code point (decimal, U+hex, 0xhex, or single character). */
export function parseCodePointInput(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null

  const hex = s.replace(/^u\+/i, '').replace(/^0x/i, '').trim()
  if (/^[0-9a-fA-F]+$/.test(hex) && (s.startsWith('U+') || s.startsWith('u+') || s.startsWith('0x') || s.startsWith('0X'))) {
    const code = parseInt(hex, 16)
    if (Number.isFinite(code) && code >= 0 && code <= 0x10ffff) return code
    return null
  }

  if (/^-?\d+$/.test(s)) {
    const code = Number(s)
    if (Number.isFinite(code) && code >= 0 && code <= 0x10ffff) return code
    return null
  }

  const cps = [...s]
  if (cps.length === 1) {
    const code = cps[0]!.codePointAt(0)
    if (code != null && code >= 0 && code <= 0x10ffff) return code
  }

  return null
}
