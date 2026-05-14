import { numAttr, parseKeyValueLine } from './parseAttrs'
import type { BitmapFontChar, BitmapFontKerning, BitmapFontModel, BitmapFontPage } from './types'
import { defaultBitmapFontModel, effectiveCharXAdvance, globalXAdvanceValue } from './types'
import { serializeBitmapFontText } from './BitmapFontTextSerializer'

export function isBitmapFontBinaryMagic(buf: Uint8Array): boolean {
  return buf.length >= 4 && buf[0] === 0x42 && buf[1] === 0x4d && buf[2] === 0x46 && buf[3] === 3
}

function readCString(buf: Uint8Array, start: number): { str: string; end: number } {
  let end = start
  while (end < buf.length && buf[end] !== 0) end++
  const slice = buf.subarray(start, end)
  const str = new TextDecoder('utf-8', { fatal: false }).decode(slice)
  return { str, end: end + 1 }
}

function parseInfoFromBlockString(s: string, model: BitmapFontModel): void {
  const kv = parseKeyValueLine(`info ${s}`)
  if (kv.face != null) model.info.face = kv.face
  if (kv.size != null && kv.size !== '') model.info.size = numAttr(kv.size, model.info.size)
  if (kv.bold != null && kv.bold !== '') model.info.bold = numAttr(kv.bold, 0)
  if (kv.italic != null && kv.italic !== '') model.info.italic = numAttr(kv.italic, 0)
  if (kv.charset !== undefined) model.info.charset = kv.charset
  if (kv.unicode != null && kv.unicode !== '') model.info.unicode = numAttr(kv.unicode, 0)
  if (kv.stretchH != null && kv.stretchH !== '') model.info.stretchH = numAttr(kv.stretchH, 100)
  if (kv.smooth != null && kv.smooth !== '') model.info.smooth = numAttr(kv.smooth, 0)
  if (kv.aa != null && kv.aa !== '') model.info.aa = numAttr(kv.aa, 0)
  if (kv.padding !== undefined) model.info.padding = kv.padding
  if (kv.spacing !== undefined) model.info.spacing = kv.spacing
  if (kv.outline != null && kv.outline !== '') model.info.outline = numAttr(kv.outline, 0)
}

function readCommonBlock(dv: DataView, offset: number, model: BitmapFontModel): void {
  if (dv.byteLength - offset < 15) return
  model.common.lineHeight = dv.getUint16(offset, true)
  model.common.base = dv.getUint16(offset + 2, true)
  model.common.scaleW = dv.getUint16(offset + 4, true)
  model.common.scaleH = dv.getUint16(offset + 6, true)
  model.common.pages = dv.getUint16(offset + 8, true)
  model.common.packed = dv.getUint8(offset + 10)
  model.common.alphaChnl = dv.getUint8(offset + 11)
  model.common.redChnl = dv.getUint8(offset + 12)
  model.common.greenChnl = dv.getUint8(offset + 13)
  model.common.blueChnl = dv.getUint8(offset + 14)
}

function readPagesBlock(buf: Uint8Array, start: number, byteLen: number): BitmapFontPage[] {
  const end = start + byteLen
  const pages: BitmapFontPage[] = []
  let p = start
  let idx = 0
  while (p < end) {
    if (buf[p] === 0) {
      p++
      continue
    }
    const { str, end: next } = readCString(buf, p)
    if (next > end) break
    pages.push({ id: idx, file: str })
    idx++
    p = next
  }
  return pages
}

function readCharsBlock(buf: Uint8Array, start: number, byteLen: number): BitmapFontChar[] {
  const n = Math.floor(byteLen / 20)
  const out: BitmapFontChar[] = []
  const dv = new DataView(buf.buffer, buf.byteOffset + start, byteLen)
  for (let i = 0; i < n; i++) {
    const o = i * 20
    const ch: BitmapFontChar = {
      id: dv.getUint32(o, true),
      x: dv.getUint16(o + 4, true),
      y: dv.getUint16(o + 6, true),
      width: dv.getUint16(o + 8, true),
      height: dv.getUint16(o + 10, true),
      xoffset: dv.getInt16(o + 12, true),
      yoffset: dv.getInt16(o + 14, true),
      xadvance: dv.getInt16(o + 16, true),
    }
    const page = dv.getUint8(o + 18)
    const chnl = dv.getUint8(o + 19)
    if (page !== 0) ch.page = page
    if (chnl !== 0) ch.chnl = chnl
    out.push(ch)
  }
  return out
}

function readKerningsBlock(buf: Uint8Array, start: number, byteLen: number): BitmapFontKerning[] {
  const n = Math.floor(byteLen / 10)
  const out: BitmapFontKerning[] = []
  const dv = new DataView(buf.buffer, buf.byteOffset + start, byteLen)
  for (let i = 0; i < n; i++) {
    const o = i * 10
    out.push({
      first: dv.getUint32(o, true),
      second: dv.getUint32(o + 4, true),
      amount: dv.getInt16(o + 8, true),
    })
  }
  return out
}

/** Parse AngelCode BMFont binary format (magic `BMF` version 3). */
export function parseBitmapFontBinary(buf: Uint8Array): BitmapFontModel {
  if (!isBitmapFontBinaryMagic(buf)) {
    throw new Error('Not a BMFont binary file (expected BMF version 3 header).')
  }
  const model = defaultBitmapFontModel()
  model.chars = []
  model.kernings = []
  model.pages = []

  let o = 4
  while (o + 5 <= buf.length) {
    const blockType = buf[o]!
    const dv = new DataView(buf.buffer, buf.byteOffset + o, 5)
    const blockSize = dv.getInt32(1, true)
    o += 5
    if (blockSize < 0 || o + blockSize > buf.length) {
      throw new Error('Invalid BMFont binary block size.')
    }
    const dataStart = o
    const dataEnd = o + blockSize
    const slice = buf.subarray(dataStart, dataEnd)

    switch (blockType) {
      case 1: {
        const { str } = readCString(slice, 0)
        parseInfoFromBlockString(str, model)
        break
      }
      case 2:
        readCommonBlock(new DataView(slice.buffer, slice.byteOffset, slice.byteLength), 0, model)
        break
      case 3:
        model.pages = readPagesBlock(buf, dataStart, blockSize)
        break
      case 4:
        model.chars = readCharsBlock(buf, dataStart, blockSize)
        break
      case 5:
        model.kernings = readKerningsBlock(buf, dataStart, blockSize)
        break
      default:
        break
    }
    o = dataEnd
  }

  if (model.pages.length === 0) {
    model.pages = [{ id: 0, file: '' }]
    model.common.pages = Math.max(1, model.common.pages)
  }

  return model
}

function encodeCStringUtf8(s: string): Uint8Array {
  const enc = new TextEncoder()
  const b = enc.encode(s)
  const out = new Uint8Array(b.length + 1)
  out.set(b)
  out[b.length] = 0
  return out
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  let len = 0
  for (const c of chunks) len += c.length
  const out = new Uint8Array(len)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

function writeBlock(type: number, payload: Uint8Array): Uint8Array {
  const head = new Uint8Array(5)
  head[0] = type & 0xff
  const hdv = new DataView(head.buffer)
  hdv.setInt32(1, payload.length, true)
  return concatChunks([head, payload])
}

/** Serialize to AngelCode BMFont binary format (version 3). */
export function serializeBitmapFontBinary(model: BitmapFontModel): Uint8Array {
  const textStub = serializeBitmapFontText(model)
  const infoLine = textStub.split(/\r?\n/).find((l) => l.startsWith('info ')) ?? `info face="${model.info.face}" size=${model.info.size}`
  const infoStr = infoLine.startsWith('info ') ? infoLine.slice(5).trim() : infoLine
  const infoBytes = encodeCStringUtf8(infoStr)

  const commonBuf = new ArrayBuffer(15)
  const cdv = new DataView(commonBuf)
  const base = model.common.base ?? Math.round(model.common.lineHeight * 0.8)
  cdv.setUint16(0, model.common.lineHeight, true)
  cdv.setUint16(2, base, true)
  cdv.setUint16(4, model.common.scaleW, true)
  cdv.setUint16(6, model.common.scaleH, true)
  cdv.setUint16(8, model.common.pages, true)
  cdv.setUint8(10, model.common.packed ?? 0)
  cdv.setUint8(11, model.common.alphaChnl ?? 0)
  cdv.setUint8(12, model.common.redChnl ?? 0)
  cdv.setUint8(13, model.common.greenChnl ?? 0)
  cdv.setUint8(14, model.common.blueChnl ?? 0)
  const commonBytes = new Uint8Array(commonBuf)

  const pageParts: Uint8Array[] = []
  for (const p of model.pages) {
    pageParts.push(encodeCStringUtf8(p.file))
  }
  const pagesBytes = concatChunks(pageParts)

  const charCount = model.chars.length
  const charBuf = new ArrayBuffer(charCount * 20)
  const chDv = new DataView(charBuf)
  const gAdv = globalXAdvanceValue(model.common)
  for (let i = 0; i < charCount; i++) {
    const c = model.chars[i]!
    const po = i * 20
    const pg = c.page ?? 0
    chDv.setUint32(po, c.id, true)
    chDv.setUint16(po + 4, c.x, true)
    chDv.setUint16(po + 6, c.y, true)
    chDv.setUint16(po + 8, c.width, true)
    chDv.setUint16(po + 10, c.height, true)
    chDv.setInt16(po + 12, c.xoffset, true)
    chDv.setInt16(po + 14, c.yoffset, true)
    chDv.setInt16(po + 16, effectiveCharXAdvance(c, gAdv), true)
    chDv.setUint8(po + 18, pg)
    chDv.setUint8(po + 19, c.chnl ?? 0)
  }
  const charBytes = new Uint8Array(charBuf)

  const kCount = model.kernings.length
  const kernBuf = new ArrayBuffer(kCount * 10)
  const kDv = new DataView(kernBuf)
  for (let i = 0; i < kCount; i++) {
    const k = model.kernings[i]!
    const ko = i * 10
    kDv.setUint32(ko, k.first, true)
    kDv.setUint32(ko + 4, k.second, true)
    kDv.setInt16(ko + 8, k.amount, true)
  }
  const kernBytes = new Uint8Array(kernBuf)

  const header = new Uint8Array([0x42, 0x4d, 0x46, 3])
  const body = concatChunks([
    writeBlock(1, infoBytes),
    writeBlock(2, commonBytes),
    writeBlock(3, pagesBytes),
    writeBlock(4, charBytes),
    writeBlock(5, kernBytes),
  ])
  return concatChunks([header, body])
}
