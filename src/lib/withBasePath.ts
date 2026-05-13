/**
 * Prefix absolute paths when the app is served under `basePath` (e.g. GitHub Pages project sites).
 * Must match `basePath` in `next.config.ts`, driven by `NEXT_PUBLIC_BASE_PATH` at build time.
 */
export function withBasePath(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
  if (!path.startsWith('/')) {
    return `${base}/${path}`.replace(/\/{2,}/g, '/')
  }
  if (!base) return path
  return `${base}${path}`
}
