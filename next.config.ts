import type { NextConfig } from 'next'

const raw = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? ''
const basePath =
  raw === '' || raw === '/'
    ? undefined
    : raw.startsWith('/')
      ? raw
      : `/${raw}`

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  output: 'export',
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath ?? '',
  },
}

export default nextConfig
