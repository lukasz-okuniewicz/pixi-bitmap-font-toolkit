/**
 * Decode an image file to RGBA pixels for CPU-side analysis (charset strip, etc.).
 */
export async function decodeImageFileToImageData(file: File): Promise<ImageData> {
  const bmp = await createImageBitmap(file)
  try {
    const w = bmp.width
    const h = bmp.height
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Could not get a 2D canvas context.')
    ctx.drawImage(bmp, 0, 0)
    return ctx.getImageData(0, 0, w, h)
  } finally {
    bmp.close()
  }
}
