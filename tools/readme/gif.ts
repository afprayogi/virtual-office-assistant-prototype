/**
 * tools/readme/gif.ts
 * ---------------------------------------------------------------------------
 * Encoder GIF89a mungil — TANPA dependensi. Cukup untuk membuat animasi
 * README: tabel warna global tunggal, penundaan seragam, loop tak terbatas.
 *
 * Skema warna ≤ 256 (pixel art selalu sedikit warna). Kalau lebih, pemanggil
 * harus mengkuantisasi lebih dulu.
 * ---------------------------------------------------------------------------
 */

/** Penulis byte yang bisa bertumbuh. */
class ByteWriter {
  private buf = new Uint8Array(1 << 16)
  private len = 0
  private ensure(n: number): void {
    if (this.len + n <= this.buf.length) return
    const next = new Uint8Array(Math.max(this.buf.length * 2, this.len + n))
    next.set(this.buf.subarray(0, this.len))
    this.buf = next
  }
  byte(b: number): void { this.ensure(1); this.buf[this.len++] = b & 0xff }
  u16(v: number): void { this.ensure(2); this.buf[this.len++] = v & 0xff; this.buf[this.len++] = (v >> 8) & 0xff }
  bytes(a: Uint8Array): void { this.ensure(a.length); this.buf.set(a, this.len); this.len += a.length }
  done(): Uint8Array { return this.buf.subarray(0, this.len) }
}

/**
 * Kompresi LZW ala GIF. Codes dipaket LSB-first lalu dipecah ke sub-blok 255
 * byte oleh pemanggil.
 */
function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize
  const eofCode = clearCode + 1
  const w = new ByteWriter()
  const dict = new Map<number, number>()
  let codeSize = minCodeSize + 1
  let nextCode = clearCode + 2
  let cur = 0
  let curBits = 0

  const flushBits = (): void => {
    while (curBits >= 8) {
      w.byte(cur & 0xff)
      cur >>>= 8
      curBits -= 8
    }
  }

  /**
   * Tulis satu kode (LSB-first), LALU naikkan ukuran kode bila entri berikutnya
   * sudah melebihi kapasitas saat ini. Urutan ini penting: dekoder naikkan
   * ukuran satu kode lebih lambat, jadi encoder harus naik setelah menulis.
   */
  const emit = (code: number): void => {
    cur |= code << curBits
    curBits += codeSize
    flushBits()
    if (nextCode > (1 << codeSize) - 1 && codeSize < 12) codeSize++
  }

  emit(clearCode)

  if (indices.length === 0) {
    emit(eofCode)
    if (curBits > 0) w.byte(cur & 0xff)
    return w.done()
  }

  let prefix = indices[0]
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]
    const key = (prefix << 8) | k
    const found = dict.get(key)
    if (found !== undefined) { prefix = found; continue }
    emit(prefix)
    if (nextCode < 4096) {
      dict.set(key, nextCode)
      nextCode++
    } else {
      // Tabel penuh: tulis clear code, lalu reset ukuran & kamus.
      cur |= clearCode << curBits
      curBits += codeSize
      flushBits()
      dict.clear()
      codeSize = minCodeSize + 1
      nextCode = clearCode + 2
    }
    prefix = k
  }
  emit(prefix)
  emit(eofCode)
  if (curBits > 0) w.byte(cur & 0xff)
  return w.done()
}

export interface GifOptions {
  width: number
  height: number
  /** Palet global: tiap entri = 0xRRGGBB (maks 256). */
  palette: number[]
  /** Satu Uint8Array indeks-palet per frame (panjang = width*height). */
  frames: Uint8Array[]
  /** Penundaan antar frame (ms). */
  delayMs: number
  /** 0 = loop tak terbatas (default). */
  loop?: number
}

/** Susun berkas GIF89a lengkap dari frame indeks-palet. */
export function encodeGif(o: GifOptions): Uint8Array {
  if (o.palette.length > 256) throw new Error('encodeGif: palet > 256 warna')
  const w = new ByteWriter()

  // Ukuran tabel warna global: 2^sizeBits, minimal 2 warna.
  let sizeBits = 2
  while ((1 << sizeBits) < o.palette.length) sizeBits++
  if (sizeBits > 8) sizeBits = 8
  const gctEntries = 1 << sizeBits
  const n = sizeBits - 1

  // Header.
  w.bytes(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) // "GIF89a"
  // Logical Screen Descriptor.
  w.u16(o.width)
  w.u16(o.height)
  w.byte(0x80 | 0x70 | n) // GCT aktif, color resolution 7, ukuran N
  w.byte(0) // warna latar
  w.byte(0) // rasio aspek

  // Global Color Table.
  for (let i = 0; i < gctEntries; i++) {
    const c = o.palette[i] ?? 0
    w.byte((c >> 16) & 0xff)
    w.byte((c >> 8) & 0xff)
    w.byte(c & 0xff)
  }

  // Netscape Application Extension — loop.
  w.bytes(new Uint8Array([0x21, 0xff, 0x0b]))
  for (const ch of 'NETSCAPE2.0') w.byte(ch.charCodeAt(0))
  w.bytes(new Uint8Array([0x03, 0x01]))
  w.u16(o.loop ?? 0)
  w.byte(0)

  const delay = Math.max(1, Math.round(o.delayMs / 10))
  for (const frame of o.frames) {
    // Graphic Control Extension.
    w.bytes(new Uint8Array([0x21, 0xf9, 0x04, 0x04])) // disposal = 1 (keep)
    w.u16(delay)
    w.byte(0) // indeks transparan (tak dipakai)
    w.byte(0)
    // Image Descriptor.
    w.byte(0x2c)
    w.u16(0)
    w.u16(0)
    w.u16(o.width)
    w.u16(o.height)
    w.byte(0) // tanpa tabel warna lokal, tak ber-interlace
    // Data gambar (LZW).
    w.byte(sizeBits)
    const data = lzwEncode(frame, sizeBits)
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.subarray(i, Math.min(i + 255, data.length))
      w.byte(chunk.length)
      w.bytes(chunk)
    }
    w.byte(0) // akhir sub-blok
  }

  w.byte(0x3b) // trailer
  return w.done()
}
