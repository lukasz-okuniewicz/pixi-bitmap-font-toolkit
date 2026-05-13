/** Parse BMFont attribute string to number; safe fallback if missing or invalid. */
export function numAttr(raw: string | null | undefined, fallback = 0): number {
  if (raw == null || raw === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

/** Split line into key=value pairs (BMFont .fnt text format). */
export function parseKeyValueLine(line: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /(\w+)=([^\s"]+|"[^"]*")/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    let v = m[2]
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}
