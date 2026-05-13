'use client'

import { useEffect } from 'react'
import { withBasePath } from '@/lib/withBasePath'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    void navigator.serviceWorker.register(withBasePath('/sw.js')).catch(() => {
      /* ignore registration failures */
    })
  }, [])
  return null
}
