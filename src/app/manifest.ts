import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pixi: Bitmap Font Toolkit',
    short_name: 'BMFont Toolkit',
    description: 'Edit BMFont XML with a live Pixi preview in the browser.',
    start_url: '/',
    display: 'standalone',
    background_color: '#111827',
    theme_color: '#0f172a',
    icons: [
      {
        src: '/bitmapFont.png',
        sizes: 'any',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
