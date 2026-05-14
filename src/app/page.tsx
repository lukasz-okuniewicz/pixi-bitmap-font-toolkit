import { Suspense } from 'react'

import ShoeboxBitmapFontEditor from '@/components/ShoeboxBitmapFontEditor'

function ToolkitLoadingFallback() {
  return (
    <div
      className="toolkit-loading"
      role="status"
      aria-live="polite"
      aria-label="Loading Bitmap Font Toolkit"
    >
      <div className="toolkit-loading__inner">
        <div className="toolkit-loading__spinner" aria-hidden="true" />
        <p className="toolkit-loading__title">Bitmap Font Toolkit</p>
        <p className="toolkit-loading__subtitle">Loading…</p>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<ToolkitLoadingFallback />}>
      <ShoeboxBitmapFontEditor />
    </Suspense>
  )
}
