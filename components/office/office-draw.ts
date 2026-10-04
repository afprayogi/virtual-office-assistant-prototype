/**
 * components/office/office-draw.ts
 * ---------------------------------------------------------------------------
 * Semua perintah menggambar pixel-art dipecah ke modul pure-function ini
 * (tidak menyentuh DOM/React) supaya mudah diuji dan di-maintenance.
 * ---------------------------------------------------------------------------
 */
import type { Activity, OfficeCoordinates } from '@/types/agent'
import { GRID_COLS, GRID_ROWS, PROPS, ROOMS, TILE, type Prop } from '@/types/office'
import {
  buildAgentFrames,
  clearRasterCache,
  type AccessoryName,
  type AgentPalette,
  type PoseName,
} from './pixel-sprites'

export type Ctx = CanvasRenderingContext2D

/** Warna status → warna indikator di atas kepala sprite. */
export const STATUS_COLOR: Record<string, string> = {
  idle: '#6b7280',
  thinking: '#a78bfa',
  typing: '#34d399',
  moving: '#fbbf24',
  error: '#f87171',
}

/** Gambar grid lantai seluruh kantor. */
export function drawFloor(ctx: Ctx, w: number, h: number): void {
  // Base
  ctx.fillStyle = '#26262e'
  ctx.fillRect(0, 0, w, h)

  // Lantai tiap ruangan
  for (const room of Object.values(ROOMS)) {
    ctx.fillStyle = room.floor
    ctx.fillRect(room.rect.x * TILE, room.rect.y * TILE, room.rect.w * TILE, room.rect.h * TILE)
  }

  // Garis grid halus
  ctx.strokeStyle = 'rgba(255,255,255,0.035)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= GRID_COLS; x++) {
    ctx.moveTo(x * TILE + 0.5, 0)
    ctx.lineTo(x * TILE + 0.5, GRID_ROWS * TILE)
  }
  for (let y = 0; y <= GRID_ROWS; y++) {
    ctx.moveTo(0, y * TILE + 0.5)
    ctx.lineTo(GRID_COLS * TILE, y * TILE + 0.5)
  }
  ctx.stroke()
}

/** Dinding / pembatas ruangan (garis accent 2px di sisi atas room). */
export function drawWalls(ctx: Ctx): void {
  for (const room of Object.values(ROOMS)) {
    if (room.id === 'lobby') continue
    ctx.strokeStyle = `${room.accent}66`
    ctx.lineWidth = 2
    ctx.strokeRect(
      room.rect.x * TILE + 1,
      room.rect.y * TILE + 1,
      room.rect.w * TILE - 2,
      room.rect.h * TILE - 2,
    )
  }
}

/** Label ruangan di pojok kiri atas. */
export function drawRoomLabels(ctx: Ctx): void {
  ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif'
  ctx.textBaseline = 'top'
  for (const room of Object.values(ROOMS)) {
    const x = room.rect.x * TILE + 8
    const y = room.rect.y * TILE + 6
    ctx.fillStyle = `${room.accent}dd`
    ctx.fillText(`${room.icon} ${room.name}`, x, y)
  }
}

/** Gambar satu furniture/prop pixel-art. */
export function drawProp(ctx: Ctx, prop: Prop): void {
  const x = prop.x * TILE
  const y = prop.y * TILE
  const w = (prop.w ?? 1) * TILE
  const h = (prop.h ?? 1) * TILE

  switch (prop.kind) {
    case 'desk':
      ctx.fillStyle = '#6b4f3a'
      ctx.fillRect(x + 2, y + 4, w - 4, h - 8)
      ctx.fillStyle = '#7d5c43'
      ctx.fillRect(x + 2, y + 4, w - 4, 4)
      // monitor
      ctx.fillStyle = '#1f2937'
      ctx.fillRect(x + w / 2 - 6, y + 7, 12, 8)
      ctx.fillStyle = '#38bdf8'
      ctx.fillRect(x + w / 2 - 4, y + 9, 8, 4)
      break
    case 'screen':
      ctx.fillStyle = '#111827'
      ctx.fillRect(x + 1, y + 2, w - 2, h - 4)
      ctx.fillStyle = '#0ea5e9'
      ctx.fillRect(x + 3, y + 4, w - 6, h - 8)
      break
    case 'computer': {
      // Komputer pribadi: monitor + menara CPU + keyboard.
      // Gambar di atas meja `desk` supaya jelas satu unit per agent.
      const cx = x + w / 2
      // Monitor
      ctx.fillStyle = '#18181b'
      ctx.fillRect(cx - 9, y + 6, 18, 11)
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(cx - 7, y + 8, 14, 7)
      // Kilau layar: garis hijau kecil ala terminal.
      ctx.fillStyle = '#22c55e'
      ctx.fillRect(cx - 5, y + 10, 6, 1)
      ctx.fillRect(cx - 5, y + 12, 9, 1)
      // Dudukan monitor
      ctx.fillStyle = '#3f3f46'
      ctx.fillRect(cx - 1, y + 17, 2, 2)
      // Menara CPU di samping kanan
      ctx.fillStyle = '#27272a'
      ctx.fillRect(x + w - 8, y + 8, 5, 11)
      ctx.fillStyle = '#f59e0b'
      ctx.fillRect(x + w - 7, y + 10, 3, 1)
      // Keyboard
      ctx.fillStyle = '#3f3f46'
      ctx.fillRect(cx - 9, y + 19, 14, 4)
      break
    }
    case 'chair':
      ctx.fillStyle = '#4b5563'
      ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8)
      break
    case 'plant':
      ctx.fillStyle = '#3f2d20'
      ctx.fillRect(x + TILE / 2 - 5, y + TILE - 12, 10, 10)
      ctx.fillStyle = '#22c55e'
      ctx.beginPath()
      ctx.arc(x + TILE / 2, y + TILE / 2, 8, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'coffee-machine':
      ctx.fillStyle = '#374151'
      ctx.fillRect(x + 6, y + 8, TILE - 12, TILE - 14)
      ctx.fillStyle = '#f97316'
      ctx.fillRect(x + 10, y + 12, 6, 6)
      break
    case 'sofa':
      ctx.fillStyle = '#7c5f4a'
      ctx.fillRect(x + 2, y + 4, w - 4, h - 8)
      ctx.fillStyle = '#8f7057'
      ctx.fillRect(x + 4, y + 6, w - 8, h - 14)
      break
    case 'mic':
      ctx.fillStyle = '#374151'
      ctx.fillRect(x + TILE / 2 - 2, y + 2, 4, TILE - 8)
      ctx.fillStyle = '#9ca3af'
      ctx.beginPath()
      ctx.arc(x + TILE / 2, y + TILE - 6, 4, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'rug':
      ctx.fillStyle = 'rgba(217,119,87,0.18)'
      ctx.fillRect(x, y, w, h)
      break
  }
}

/** Gambar seluruh statis layer (lantai, dinding, furniture, label). */
export function drawStatic(ctx: Ctx, w: number, h: number): void {
  drawFloor(ctx, w, h)
  drawRoomLabels(ctx)
  for (const prop of PROPS) drawProp(ctx, prop)
  drawWalls(ctx)
}

/**
 * Sprite agent bergaya pixel-art: badan, kepala berotasi, kaki yang bergoyang
 * saat bergerak, dan indikator status berdenyut di atas kepala.
 *
 * @param t     waktu animasi (detik) untuk animasi berjalan
 * @param steps arah pandang (-1 kiri, 1 kanan)
 */
/**
 * Gaya visual tiap agent.
 *
 * Tanpa ini semua sprite terlihat sama yang bedanya cuma warna — susah
 * ditebak siapa yang sedang bicara. Tiap peran punya rambut, warna kulit,
 * aksesori, dan build tubuh berbeda agar langsung kenalan.
 */
export interface PixelCharStyle {
  palette: AgentPalette
  accessory: AccessoryName | null
}

/** Warna kulit yang dipakai beserta pasangannya (tangan lebih gelap). */
const SKIN = (light: string, dark: string): Pick<AgentPalette, 'S' | 'B'> => ({
  S: light,
  B: dark,
})

const SHIRT = (main: string, shade: string): Pick<AgentPalette, 'C' | 'c'> => ({
  C: main,
  c: shade,
})

/** Celana+sepatu netral untuk agent yang tidak punya warna khas. */
const LEGS = { P: '#1f2937', K: '#111827' } as const

export const CHAR_STYLE: Record<string, PixelCharStyle> = {
  // Budi — CEO: rambut gelap, kemeja navy, dasi merah.
  ceo: {
    palette: { ...SKIN('#e8b98d', '#c68a5e'), H: '#2b2118', ...SHIRT('#1e3a8a', '#1a3374'), ...LEGS, E: '#111827', M: '#8b3a3a', A: '#dc2626' },
    accessory: 'badge',
  },
  // Sinta — PM: rambut panjang coklat, blus merah muda.
  pm: {
    palette: { ...SKIN('#f0c9a4', '#cf9f78'), H: '#4a3728', ...SHIRT('#db2777', '#b91c62'), ...LEGS, E: '#111827', M: '#b4506a', A: '#f59e0b' },
    accessory: 'badge',
  },
  // Deni — Lead Developer: rambut spiked, kacamata, hoodie hijau.
  dev: {
    palette: { ...SKIN('#d9a273', '#b07a4f'), H: '#1f2937', ...SHIRT('#059669', '#047857'), ...LEGS, E: '#111827', M: '#8b3a3a', A: '#1f2937' },
    accessory: 'glasses',
  },
  // Ayu — Code Reviewer: kuncung, blus ungu, lencana.
  rev: {
    palette: { ...SKIN('#f2d3b4', '#d3ab84'), H: '#3f2d20', ...SHIRT('#7c3aed', '#6d28d9'), ...LEGS, E: '#111827', M: '#9d4a6a', A: '#facc15' },
    accessory: 'badge',
  },
  // Eko — QA: kulit sawo matang, topi lab putih.
  qa: {
    palette: { ...SKIN('#c68642', '#a06a2e'), H: '#171717', ...SHIRT('#0ea5e9', '#0284c7'), ...LEGS, E: '#111827', M: '#8b3a3a', A: '#f8fafc' },
    accessory: 'cap',
  },
  // Rina — BA: kulit paling terang, rambut panjang, kacamata.
  ba: {
    palette: { ...SKIN('#ffd9b3', '#e0b48c'), H: '#5c4033', ...SHIRT('#f59e0b', '#d97706'), ...LEGS, E: '#111827', M: '#b4506a', A: '#334155' },
    accessory: 'glasses',
  },
  // Rio — Demo Engineer: kulit paling gelap, jaket oranye.
  demo: {
    palette: { ...SKIN('#a9714b', '#8a5537'), H: '#111827', ...SHIRT('#ea580c', '#c2410c'), ...LEGS, E: '#111827', M: '#8b3a3a', A: '#facc15' },
    accessory: 'badge',
  },
  // Nadia — UX Designer: rambut auburn, blus teal, kacamata.
  ux: {
    palette: { ...SKIN('#e8b08a', '#c78f6a'), H: '#7c2d12', ...SHIRT('#14b8a6', '#0d9488'), ...LEGS, E: '#111827', M: '#b4506a', A: '#334155' },
    accessory: 'glasses',
  },
}

/** Gaya default untuk agent baru yang belum punya entri. */
export const DEFAULT_CHAR_STYLE: PixelCharStyle = {
  palette: { ...SKIN('#f4d3b0', '#d4ab86'), H: '#3f2d20', ...SHIRT('#6366f1', '#4f46e5'), ...LEGS, E: '#111827', M: '#8b3a3a', A: '#ef4444' },
  accessory: null,
}

/** Ambil gaya berdasarkan id agent (dengan fallback aman). */
export function charStyleFor(agentId: string): PixelCharStyle {
  return CHAR_STYLE[agentId] ?? DEFAULT_CHAR_STYLE
}

/* -------------------------------------------------------------------------- */
/*  RENDERER PIXEL ART                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Skala sprite dalam piksel device per piksel sprite.
 *
 * TILE = 48px dan sprite 16px lebar, jadi skala 3 memberi sprite 48px — pas
 * satu tile. Dengan TILE yang lebih besar, skala 3 menjaga agent tetap
 * sebanding dengan mejanya (skala 2 akan membuatnya terlihat kecil).
 */
const PX_SCALE = 3

/** Lebar/tinggi sprite dalam CSS pixel. */
export const SPRITE_CSS_W = 16 * PX_SCALE
export const SPRITE_CSS_H = 32 * PX_SCALE

/** Cache frame per agent: agentId -> frames. */
const frameCache = new Map<string, Record<PoseName, HTMLCanvasElement[]>>()

/** Ambil (dan bangun sekali) semua frame sprite milik satu agent. */
function framesFor(agentId: string): Record<PoseName, HTMLCanvasElement[]> {
  const key = `${agentId}:${PX_SCALE}`
  const hit = frameCache.get(key)
  if (hit) return hit

  const style = charStyleFor(agentId)
  const frames = buildAgentFrames(style.palette, PX_SCALE, style.accessory)
  frameCache.set(key, frames)
  return frames
}

/** Bersihkan cache sprite (untuk HMR). */
export function clearSpriteCache(): void {
  frameCache.clear()
  clearRasterCache()
}

/**
 * Pilih pose & frame berdasarkan aktivitas agent.
 *
 * Mengembalikan nama pose + indeks frame animasi yang sedang aktif.
 * Logikanya dipisah agar mudah diuji dan tidak bercampur dengan gambar.
 */
export function resolvePose(
  activity: Activity,
  moving: boolean,
  steps: number,
  t: number,
  seed: number,
): { pose: PoseName; frame: number } {
  if (activity === 'sleep') return { pose: 'sleep', frame: 0 }
  if (activity === 'chat') return { pose: 'sit', frame: 0 }

  // Mengetik: 2 frame bergantian cepat (~6 Hz) supaya terlihat mengetik.
  if (activity === 'review' || activity === 'test') {
    return { pose: 'type', frame: Math.floor(t * 6 + seed * 10) % 2 }
  }

  if (moving) {
    // 4 frame langkah; `steps` mengunci supaya kaki tidak "slip" saat berhenti.
    const base = Math.floor(steps) % 4
    return { pose: 'walk', frame: base }
  }

  // Idle: napas halus dengan turun-t Naik 1 baris setiap ~2 detik.
  // Idle: satu frame statis supaya karakter terlihat tenang dan tidak melebihi
  // pemeriksaan sprite.
  return { pose: 'stand', frame: 0 }
}

/**
 * Gambar satu agent sebagai pixel sprite.
 *
 * Gambar karakter TIDAK memakai fillRect berukuran pecahan — hanya
 * `drawImage` dari canvas offscreen yang sudah diraster dengan smoothing mati.
 * Itulah yang membuat tepi sprite tetap tajam.
 */
export function drawSprite(
  ctx: Ctx,
  px: number,
  py: number,
  color: string,
  status: string,
  t: number,
  moving: boolean,
  steps: number,
  agentId = '',
  activity: Activity = 'work',
): void {
  // `color` tidak lagi dipakai untuk badan — warna теперь datang dari palet
  // agent. Parameter tetap ada supaya signature tidak pecah di pemanggil.
  void color

  const seed = (agentId.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 97) / 97
  const { pose, frame } = resolvePose(activity, moving, steps, t, seed)
  const frames = framesFor(agentId)
  const set = frames[pose]
  const img = set[frame % set.length]
  if (!img) return

  // Bayangan: elips, digambar SEBELUM sprite agaragent terlihat berdiri di atasnya.
  ctx.fillStyle = 'rgba(0,0,0,0.30)'
  ctx.beginPath()
  ctx.ellipse(px, py + 1, SPRITE_CSS_W * 0.26, SPRITE_CSS_H * 0.07, 0, 0, Math.PI * 2)
  ctx.fill()

  // Kaki sprite berada di baris 27 dari 32, jadi anchor di titik tile:
  // sprite digeser supaya baris Kakinya tepat di `py`.
  const drawX = Math.round(px - SPRITE_CSS_W / 2)
  const drawY = Math.round(py - SPRITE_CSS_H * (27 / 32))

  ctx.drawImage(img, drawX, drawY, SPRITE_CSS_W, SPRITE_CSS_H)

  // Indikator status di atas kepala — sengaja memakai vektor supaya tetap
  // terbaca jelas pada sprite yang cuma 32px.
  const headY = drawY + 4
  const statusColor = STATUS_COLOR[status] ?? STATUS_COLOR.idle
  if (status === 'thinking') {
    ctx.strokeStyle = statusColor
    ctx.lineWidth = 2
    ctx.beginPath()
    const a = t * 5
    ctx.arc(px, headY - 4, 5, a, a + Math.PI * 1.3)
    ctx.stroke()
  } else if (status === 'typing') {
    for (let i = 0; i < 3; i++) {
      const phase = (t * 3 + i * 0.5) % 3
      ctx.fillStyle = statusColor
      ctx.globalAlpha = Math.max(0.25, 1 - Math.abs(phase - 1.5) / 1.5)
      ctx.beginPath()
      ctx.arc(px - 6 + i * 6, headY - 4, 2.4, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  } else {
    ctx.fillStyle = statusColor
    ctx.beginPath()
    ctx.arc(px, headY - 4, 3.2, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Gambar rambut sesuai gaya karakter — tiap gaya punya siluet berbeda. */
/**
 * Speech bubble melayang di atas sprite.
 * Membungkus teks ke beberapa baris dan memotong panjang maksimum.
 */
export function drawSpeechBubble(
  ctx: Ctx,
  px: number,
  py: number,
  text: string,
  color: string,
): void {
  if (!text.trim()) return

  const maxWidth = 168
  const lineHeight = 11
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif'

  // Bungkus teks per kata
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
    if (lines.length >= 3) break
  }
  if (line && lines.length < 3) lines.push(line)

  const bubbleW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14
  const bubbleH = lines.length * lineHeight + 10
  const bx = Math.max(2, Math.min(px - bubbleW / 2, GRID_COLS * TILE - bubbleW - 2))
  const by = py - TILE * 0.62 - bubbleH - 12

  // Badan bubble
  ctx.fillStyle = 'rgba(20,20,26,0.94)'
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  const r = 6
  ctx.beginPath()
  ctx.moveTo(bx + r, by)
  ctx.arcTo(bx + bubbleW, by, bx + bubbleW, by + bubbleH, r)
  ctx.arcTo(bx + bubbleW, by + bubbleH, bx, by + bubbleH, r)
  ctx.arcTo(bx, by + bubbleH, bx, by, r)
  ctx.arcTo(bx, by, bx + bubbleW, by, r)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Ekor bubble
  ctx.beginPath()
  ctx.moveTo(px - 5, by + bubbleH - 1)
  ctx.lineTo(px, by + bubbleH + 6)
  ctx.lineTo(px + 5, by + bubbleH - 1)
  ctx.closePath()
  ctx.fillStyle = 'rgba(20,20,26,0.94)'
  ctx.fill()
  ctx.stroke()

  // Teks
  ctx.fillStyle = '#e8e8ec'
  ctx.textBaseline = 'top'
  lines.forEach((l, i) => {
    ctx.fillText(l, bx + 7, by + 5 + i * lineHeight)
  })
}

/** Nametag kecil di bawah sprite. */
export function drawNameTag(ctx: Ctx, px: number, py: number, name: string, selected: boolean): void {
  ctx.font = selected ? '600 10px ui-sans-serif, system-ui, sans-serif' : '10px ui-sans-serif, system-ui, sans-serif'
  const w = ctx.measureText(name).width + 8
  ctx.fillStyle = selected ? 'rgba(217,119,87,0.9)' : 'rgba(0,0,0,0.6)'
  ctx.fillRect(px - w / 2, py + 4, w, 12)
  ctx.fillStyle = selected ? '#ffffff' : '#d4d4d8'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'
  ctx.fillText(name, px, py + 6)
  ctx.textAlign = 'left'
}

/**
 * Ikon fokus di atas kepala — mode B untuk menampilkan "apa yang sedang dilakukan"
 * agent tanpa harus menggambar sprite duduk yang baru.
 *
 * Contoh: ⌨️ menulis kode, 🔍 meninjau, 🎤 demo, 🎲 santai.
 */
export function drawFocusIcon(
  ctx: Ctx,
  px: number,
  py: number,
  icon: string,
  label: string,
  color: string,
  active: boolean,
): void {
  // Y di atas kepala sprite (sprite setinggi TILE*0.62 dari py ke atas).
  const top = py - TILE * 0.62 - 18

  ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
  const textW = ctx.measureText(label).width
  const boxW = textW + 22
  const boxH = 15

  // Latar rounded
  ctx.fillStyle = active ? 'rgba(217,119,87,0.92)' : 'rgba(12,12,16,0.78)'
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  const r = 7
  const bx = Math.max(1, Math.min(px - boxW / 2, GRID_COLS * TILE - boxW - 1))
  const by = top - boxH
  ctx.beginPath()
  ctx.moveTo(bx + r, by)
  ctx.arcTo(bx + boxW, by, bx + boxW, by + boxH, r)
  ctx.arcTo(bx + boxW, by + boxH, bx, by + boxH, r)
  ctx.arcTo(bx, by + boxH, bx, by, r)
  ctx.arcTo(bx, by, bx + boxW, by, r)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Ikon + teks
  ctx.textBaseline = 'top'
  ctx.fillText(icon, bx + 5, by + 1)
  ctx.fillStyle = active ? '#ffffff' : '#cfcfd6'
  ctx.fillText(label, bx + 18, by + 2)
}

/**
 * Badge "sedang bertanya ke siapa" — menempel di avatar, bukan garis panjang.
 *
 * Ini pengganti visual untuk garis consultation yang dulu melintasi ruangan:
 * user langsung tahu siapa yang sedang ditanyakan, tanpa ada "jalur"
 * yang membelah lantai kantor.
 */
export function drawConsultBadge(
  ctx: Ctx,
  px: number,
  py: number,
  targetName: string,
  color: string,
): void {
  // Tumpuk di bawah ikon fokus agar tidak saling menutupi.
  const top = py - TILE * 0.62 - 18
  const by = top + 14

  const label = targetName.length > 10 ? `${targetName.slice(0, 9)}…` : targetName
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif'
  const textW = ctx.measureText(label).width
  const boxW = textW + 26
  const boxH = 14

  const bx = Math.max(1, Math.min(px - boxW / 2, GRID_COLS * TILE - boxW - 1))

  ctx.fillStyle = 'rgba(12,12,16,0.9)'
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  const r = 7
  ctx.beginPath()
  ctx.moveTo(bx + r, by)
  ctx.arcTo(bx + boxW, by, bx + boxW, by + boxH, r)
  ctx.arcTo(bx + boxW, by + boxH, bx, by + boxH, r)
  ctx.arcTo(bx, by + boxH, bx, by, r)
  ctx.arcTo(bx, by, bx + boxW, by, r)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Ikon gelembung bicara + nama target.
  ctx.textBaseline = 'top'
  ctx.fillText('💬', bx + 4, by)
  ctx.fillStyle = '#e8e8ee'
  ctx.fillText(label, bx + 21, by + 2)
}

/* ------------------------------ partikel ------------------------------- */

/** Satu butir percikan. */
export interface Spark {
  x: number
  y: number
  /** Kecepatan horizontal per detik (px). */
  vx: number
  /** Kecepatan vertikal per detik (px), negatif = ke atas. */
  vy: number
  /** Umur maksimum (detik). */
  ttl: number
  /** Umur berjalan (detik). */
  age: number
  /** Radius awal (px). */
  size: number
  color: string
  /** Percikan 'boost' melesat lebih vigor ke atas. */
  boost: boolean
}

/** Gravitasi ringan supaya percikan melengkung turun, bukan lurus. */
const SPARK_GRAVITY = 120

/**
 * Buat ledakan percikan di sekitar titik tertentu.
 *
 * Dipakai untuk: agent mulai berpikir, task selesai, file dibuat, dan
 * saat merayakan. `boost` membuat percikan menyala lebih vigor ke atas.
 */
export function emitSparks(
  sparks: Spark[],
  x: number,
  y: number,
  color: string,
  count = 8,
  boost = false,
): void {
  for (let i = 0; i < count; i++) {
    // Sebar radial, dengan sedikit randomness supaya tidak simetris.
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6
    const speed = boost ? 70 + Math.random() * 60 : 34 + Math.random() * 36
    sparks.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 6,
      vx: Math.cos(angle) * speed,
      // Condongkan ke atas supaya terlihat seperti percikan api.
      vy: -Math.abs(Math.sin(angle)) * speed * (boost ? 1.25 : 1) - (boost ? 30 : 0),
      ttl: 0.5 + Math.random() * (boost ? 0.7 : 0.4),
      age: 0,
      size: boost ? 2.2 + Math.random() * 1.4 : 1.4 + Math.random() * 1.1,
      color,
      boost,
    })
  }
}

/** Majukan simulasi partikel satu langkah. Partikel mati dibuang. */
export function stepSparks(sparks: Spark[], dt: number, bounds: { w: number; h: number }): void {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]
    s.age += dt
    if (s.age >= s.ttl || s.y > bounds.h + 20) {
      sparks.splice(i, 1)
      continue
    }
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.vy += SPARK_GRAVITY * dt
    // Percikan 'boost' sedikit bergoyang ke samping seperti percikan api.
    if (s.boost) s.vx += Math.sin(s.age * 22 + s.x) * 12 * dt
  }
}

/** Gambar semua percikan dengan benar-benar memudar seiring umur. */
export function drawSparks(ctx: Ctx, sparks: Spark[]): void {
  for (const s of sparks) {
    const life = 1 - s.age / s.ttl        // 1 -> 0
    if (life <= 0) continue
    ctx.globalAlpha = Math.min(1, life)
    ctx.fillStyle = s.color
    const r = s.size * (0.4 + life * 0.8)
    ctx.beginPath()
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2)
    ctx.fill()
    // Halo tipis supaya terlihat seperti Bara, bukan titik biasa.
    ctx.globalAlpha = Math.min(0.45, life * 0.45)
    ctx.beginPath()
    ctx.arc(s.x, s.y, r * 2.1, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/**
 * Confetti untuk merayakan — kertas kecil yang jatuh dari atas
 * dengan warna cerah, berayun pelan seperti di udara.
 */
export function emitConfetti(confetti: Spark[], w: number, count = 90): void {
  const colors = ['#f472b6', '#facc15', '#34d399', '#60a5fa', '#c084fc', '#fb923c']
  for (let i = 0; i < count; i++) {
    confetti.push({
      x: Math.random() * w,
      y: -10 - Math.random() * 160,
      vx: (Math.random() - 0.5) * 34,
      vy: 34 + Math.random() * 42,
      ttl: 7 + Math.random() * 5,
      age: 0,
      size: 3 + Math.random() * 3,
      color: colors[i % colors.length],
      boost: false,
    })
  }
}

/** Bedakan confetti dari percikan api saat menggambar. */
export function drawConfetti(ctx: Ctx, confetti: Spark[], t: number): void {
  for (const c of confetti) {
    const life = 1 - c.age / c.ttl
    if (life <= 0) continue
    // Jangan fade terlalu cepat — biar terlihat sampai jatuh.
    ctx.globalAlpha = life > 0.25 ? 1 : life / 0.25
    ctx.fillStyle = c.color
    // Berputar: lebar mengecil-kecil seperti kertas berputar.
    const wobble = Math.abs(Math.cos(t * 3 + c.x * 0.05))
    ctx.fillRect(c.x - c.size / 2, c.y - c.size / 2, c.size * Math.max(0.25, wobble), c.size)
  }
  ctx.globalAlpha = 1
}

/**
 * Badge "selesai" — centang hijau yang muncul singkat setelah task rampung,
 * lalu menghilang sendiri. Tanpa ini, agent yang selesai task hanya diam
 * dan user tidak pernah tahu pekerjaannya kelar.
 */
export function drawDoneBadge(ctx: Ctx, px: number, py: number): void {
  const top = py - TILE * 0.62 - 18
  const cy = top - 9
  const cx = px + TILE * 0.30

  ctx.save()
  // Cincin hijau + centang putih di dalam.
  ctx.fillStyle = '#22c55e'
  ctx.beginPath()
  ctx.arc(cx, cy, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#0b0b0f'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - 3, cy + 0.2)
  ctx.lineTo(cx - 0.8, cy + 2.4)
  ctx.lineTo(cx + 3.2, cy - 2.2)
  ctx.stroke()
  ctx.restore()
}

/**
 * Garis tautan putus-putus antara dua agent yang berdekatan.
 *
 * PENTING: link hanya digambar bila keduanya benar-benar berdekatan. Kalau
 * jauh, alpha turun ke 0 — supaya tidak pernah berubah menjadi "jalur"
 * panjang yang melintasi seluruh kantor. Indikator interaksi tetap terbaca
 * lewat `drawConsultBadge` yang menempel pada avatar.
 */
export function drawConsultLink(
  ctx: Ctx,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  t: number,
): void {
  const dist = Math.hypot(to.x - from.x, to.y - from.y)

  // Fade: penuh di bawah 2 tile, hilang total di atas 3.5 tile.
  const alpha = Math.max(0, Math.min(1, (3.5 * TILE - dist) / (2 * TILE)))
  if (alpha <= 0.02) return

  const mx = (from.x + to.x) / 2
  const my = (from.y + to.y) / 2 - 10

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.4
  ctx.setLineDash([3, 4])
  ctx.lineDashOffset = -t * 10
  ctx.globalAlpha = 0.55 * alpha
  ctx.beginPath()
  ctx.moveTo(from.x, from.y - 8)
  ctx.quadraticCurveTo(mx, my, to.x, to.y - 8)
  ctx.stroke()
  ctx.restore()
}