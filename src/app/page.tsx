import { Suspense } from 'react'

import ShoeboxBitmapFontEditor from '@/components/ShoeboxBitmapFontEditor'

export default function Home() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontFamily: 'system-ui' }}>Loading…</div>}>
      <ShoeboxBitmapFontEditor />
    </Suspense>
  )
}
