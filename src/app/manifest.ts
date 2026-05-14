import type { MetadataRoute } from 'next'
import { withBasePath } from '@/lib/withBasePath'

export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bitmap Font Toolkit',
    short_name: 'BMFont Toolkit',
    description: 'Edit BMFont XML with a live preview in the browser.',
    start_url: withBasePath('/'),
    display: 'standalone',
    background_color: '#111827',
    theme_color: '#0f172a',
    icons: [
      {
        src: withBasePath('/bitmapFont.png'),
        sizes: 'any',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
