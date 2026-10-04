/**
 * tools/readme/demo-gif.ts
 * ---------------------------------------------------------------------------
 * Merender animasi kantor menjadi GIF — murni dari kode, tanpa dependensi.
 * Skala TILE=24px (kantor 528x358) supaya berkasnya ringan untuk README.
 * ---------------------------------------------------------------------------
 */
import {
  ACCESSORY_CELLS, DEFAULT_AGENTS, POSES, PROPS, ROOMS, charStyleFor, framesOf, hexPalette, stamp,
  type PoseName,
} from './svg-kit'
import { scheduleFor, sampleAt } from './demo-schedule'
import { encodeGif } from './gif'

const ST = 24                 // piksel per tile pada GIF
const W = 22 * ST             // 528
const OFFICE_H = 14 * ST      // 336
const BAR_H = 22
const H = OFFICE_H + BAR_H    // 358
const SPX = 1.5               // skala piksel sprite (sprite 24x48)

const EXPORT_WIDTH = W
const EXPORT_HEIGHT = H

const hi = (hex: string): number => parseInt(hex.replace('#', ''), 16)

/* ------------------------------- perangkat -------------------------------- */

/**
 * Target gambar. `buf === null` → hanya mengumpulkan warna (untuk membangun
 * palet lebih dulu). `map` menerjemahkan warna ke indeks palet saat merender.
 */
class Device {
  readonly colors = new Set<number>()
  constructor(readonly map: Map<number, number> | null, readonly buf: Uint8Array | null) {}

  rect(x: number, y: number, w: number, h: number, color: number): void {
    this.colors.add(color)
    if (!this.buf || !this.map) return
    const idx = this.map.get(color)
    if (idx === undefined) return
    const x0 = Math.max(0, Math.round(x))
    const y0 = Math.max(0, Math.round(y))
    const x1 = Math.min(W, Math.round(x + w))
    const y1 = Math.min(H, Math.round(y + h))
    for (let yy = y0; yy < y1; yy++) this.buf.fill(idx, yy * W + x0, yy * W + x1)
  }
}

/* -------------------------------- scenery --------------------------------- */

/** Furniture pixel-art (cermin drawProp, digambar pada skala ST). */
function drawProps(dev: Device): void {
  for (const p of PROPS) {
    const x = p.x * ST
    const y = p.y * ST
    const w = (p.w ?? 1) * ST
    const h = (p.h ?? 1) * ST
    switch (p.kind) {
      case 'desk':
        dev.rect(x + 1, y + 2, w - 2, h - 4, 0x6b4f3a)
        dev.rect(x + 1, y + 2, w - 2, 2, 0x7d5c43)
        break
      case 'computer': {
        const cx = x + w / 2
        dev.rect(cx - 4.5, y + 3, 9, 5.5, 0x18181b)
        dev.rect(cx - 3.5, y + 4, 7, 3.5, 0x0f172a)
        dev.rect(cx - 2.5, y + 5, 3, 0.8, 0x22c55e)
        dev.rect(cx - 2.5, y + 6, 4.5, 0.8, 0x22c55e)
        dev.rect(x + w - 4, y + 4, 2.5, 5.5, 0x27272a)
        break
      }
      case 'chair':
        dev.rect(x + 2, y + 2, w - 4, h - 4, 0x4b5563)
        break
      case 'screen':
        dev.rect(x + 1, y + 1, w - 2, h - 2, 0x111827)
        dev.rect(x + 2, y + 2.5, w - 4, h - 5, 0x0ea5e9)
        break
      case 'plant':
        dev.rect(x + ST / 2 - 2.5, y + ST - 6, 5, 5, 0x3f2d20)
        dev.rect(x + ST / 2 - 4, y + ST / 2 - 4, 8, 8, 0x22c55e)
        break
      case 'sofa':
        dev.rect(x + 1, y + 2, w - 2, h - 4, 0x7c5f4a)
        dev.rect(x + 2, y + 3, w - 4, h - 7, 0x8f7057)
        break
      case 'rug':
        dev.rect(x, y, w, h, 0x3a2d35)
        break
      case 'mic':
        dev.rect(x + ST / 2 - 1, y + 1, 2, ST - 4, 0x374151)
        dev.rect(x + ST / 2 - 2, y + ST - 4, 4, 4, 0x9ca3af)
        break
      case 'coffee-machine':
        dev.rect(x + 3, y + 4, w - 6, h - 7, 0x374151)
        dev.rect(x + 5, y + 6, 3, 3, 0xf97316)
        break
    }
  }
}

/** Lantai + garis dinding tiap ruangan. */
function drawRooms(dev: Device): void {
  for (const room of Object.values(ROOMS)) {
    const { x, y, w, h } = room.rect
    dev.rect(x * ST, y * ST, w * ST, h * ST, hi(room.floor))
  }
  for (const room of Object.values(ROOMS)) {
    const { x, y, w, h } = room.rect
    const c = hi(room.accent)
    const X = x * ST
    const Y = y * ST
    const WW = w * ST
    const HH = h * ST
    dev.rect(X, Y, WW, 1, c)
    dev.rect(X, Y + HH - 1, WW, 1, c)
    dev.rect(X, Y, 1, HH, c)
    dev.rect(X + WW - 1, Y, 1, HH, c)
  }
}

/* -------------------------------- agents ---------------------------------- */

/** Grid sprite agent (aksesori ditempel) untuk pose + frame tertentu. */
function spriteFor(agent: (typeof DEFAULT_AGENTS)[number], pose: PoseName, frame: number): readonly string[] {
  const frames = framesOf(POSES[pose])
  const idx = pose === 'stand' ? 0 : frame % frames.length
  const base = frames[idx]
  const acc = charStyleFor(agent.id).accessory
  return acc ? stamp(base, ACCESSORY_CELLS[acc], 'A') : base
}

/** Balon percakapan mungil (tanpa teks — garis abu sebagai pengganti kalimat). */
function drawBubble(dev: Device, tx: number, oy: number): void {
  const bw = 20
  const bh = 12
  const bx = tx - bw / 2
  const by = oy - 15
  dev.rect(bx, by, bw, bh, 0xffffff)
  dev.rect(bx, by, bw, 1, 0x9aa0a6)
  dev.rect(bx, by + bh - 1, bw, 1, 0x9aa0a6)
  dev.rect(bx, by, 1, bh, 0x9aa0a6)
  dev.rect(bx + bw - 1, by, 1, bh, 0x9aa0a6)
  dev.rect(bx + 3, by + 3, bw - 6, 1.5, 0xc4bfb8)
  dev.rect(bx + 3, by + 6, bw - 9, 1.5, 0xc4bfb8)
  dev.rect(tx - 1, by + bh, 2, 3, 0xffffff)
}

/** Gambar seluruh agent pada fase `t`. */
function drawAgents(dev: Device, t: number, frame: number, schedules: ReturnType<typeof scheduleFor>[]): void {
  DEFAULT_AGENTS.forEach((agent, i) => {
    const s = sampleAt(schedules[i], t)
    const tx = s.x * ST + ST / 2
    const ty = s.y * ST + ST / 2
    dev.rect(tx - 6, ty - 1, 12, 2, 0x1a1a20) // bayangan
    const grid = spriteFor(agent, s.pose, frame)
    const pal = hexPalette(agent)
    const ox = tx - (16 * SPX) / 2
    const oy = ty - 27 * SPX
    for (let y = 0; y < grid.length; y++) {
      const row = grid[y] ?? ''
      for (let x = 0; x < row.length; x++) {
        const sym = row[x]
        if (!sym || sym === '.') continue
        const hex = pal[sym]
        if (!hex) continue
        dev.rect(ox + x * SPX, oy + y * SPX, SPX, SPX, hi(hex))
      }
    }
    if (s.pose === 'sit') drawBubble(dev, tx, oy)
  })
}

/** Bar progres fase di bagian bawah (pengganti label, tanpa teks). */
function drawBar(dev: Device, t: number): void {
  dev.rect(0, OFFICE_H, W, BAR_H, 0x16161d)
  const n = 6
  for (let k = 0; k < n; k++) {
    const cx = 12 + k * ((W - 24) / (n - 1))
    dev.rect(cx - 2.5, OFFICE_H + 4, 5, 5, t > (k + 0.5) / n ? 0x4ade80 : 0x3a3941)
  }
  dev.rect(12, OFFICE_H + 13, W - 24, 5, 0x2a2930)
  dev.rect(12, OFFICE_H + 13, (W - 24) * t, 5, 0xd97757)
}

/** Confetti perayaan di akhir loop. */
function drawConfetti(dev: Device, t: number): void {
  if (t < 0.86) return
  const cols = [0xf472b6, 0xfacc15, 0x34d399, 0x60a5fa, 0xc084fc]
  const fall = (t - 0.86) / 0.14
  for (let i = 0; i < 30; i++) {
    const seed = ((i * 2654435761) % 1000) / 1000
    const x = seed * (W - 6)
    const y = ((seed * 331) % 120) + fall * 260
    if (y < OFFICE_H) dev.rect(x, y, 3, 4, cols[i % cols.length])
  }
}

/** Satu frame lengkap. */
function drawScene(dev: Device, frame: number, total: number, schedules: ReturnType<typeof scheduleFor>[]): void {
  const t = frame / total
  dev.rect(0, 0, W, H, 0x26262e)
  drawRooms(dev)
  drawProps(dev)
  drawAgents(dev, t, frame, schedules)
  drawConfetti(dev, t)
  drawBar(dev, t)
}

/* ------------------------------- palet warna ------------------------------ */

/** Susun palet ≤256 warna; kuantisasi 6x6x6 kalau kelebihan. */
function buildPalette(colors: number[]): { palette: number[]; map: Map<number, number> } {
  if (colors.length <= 256) {
    const map = new Map<number, number>()
    colors.forEach((c, i) => map.set(c, i))
    return { palette: colors, map }
  }
  const levels = [0, 51, 102, 153, 204, 255]
  const cube: number[] = []
  for (const r of levels) for (const g of levels) for (const b of levels) cube.push((r << 16) | (g << 8) | b)
  const map = new Map<number, number>()
  for (const c of colors) {
    const r = (c >> 16) & 255
    const g = (c >> 8) & 255
    const b = c & 255
    let best = 0
    let bd = Infinity
    for (let i = 0; i < cube.length; i++) {
      const cc = cube[i]
      const dr = ((cc >> 16) & 255) - r
      const dg = ((cc >> 8) & 255) - g
      const db = (cc & 255) - b
      const d = dr * dr + dg * dg + db * db
      if (d < bd) { bd = d; best = i }
    }
    map.set(c, best)
  }
  return { palette: cube, map }
}

export interface DemoGifResult { gif: Uint8Array; width: number; height: number; frames: number; paletteSize: number }

/** Hasilkan GIF animasi kantor. */
export function renderOfficeDemoGif(frames = 40, delayMs = 80): DemoGifResult {
  const schedules = DEFAULT_AGENTS.map((_, i) => scheduleFor(i))

  // Pass 1: kumpulkan semua warna.
  const collector = new Device(null, null)
  for (let f = 0; f < frames; f++) drawScene(collector, f, frames, schedules)
  const { palette, map } = buildPalette([...collector.colors])

  // Pass 2: render tiap frame memakai palet tetap.
  const bgIndex = map.get(0x26262e) ?? 0
  const out: Uint8Array[] = []
  for (let f = 0; f < frames; f++) {
    const buf = new Uint8Array(W * H)
    buf.fill(bgIndex)
    drawScene(new Device(map, buf), f, frames, schedules)
    out.push(buf)
  }

  return {
    gif: encodeGif({ width: W, height: H, palette, frames: out, delayMs }),
    width: W,
    height: H,
    frames,
    paletteSize: palette.length,
  }
}

export { EXPORT_WIDTH, EXPORT_HEIGHT }

