/**
 * components/office/pixel-sprites.ts
 * ---------------------------------------------------------------------------
 * Pixel art SEJATI untuk agent — mengikuti `pixel-agents-hq/pixel-agents`.
 *
 * BEDA DARI SEBELUMNYA:
 * Sprite lama memakai `ctx.fillRect(x, y, 7.42, 3.11)` — koordinat pecahan.
 * Itu menghasilkan **vector** yang kabur saat di-zoom, bukan pixel art.
 *
 * Di sini setiap sprite adalah GRID DISKRET 16x32 piksel: satu karakter =
 * satu piksel, tanpa anti-aliasing, tepinya tegas seperti game 16-bit.
 *
 * Simbol: '.' transparan - 'S' kulit - 'B' kulit gelap (tangan) -
 * 'H' rambut - 'C' baju - 'c' bayangan baju - 'P' celana - 'K' sepatu -
 * 'E' mata - 'M' mulut - 'A' aksesori.
 * ---------------------------------------------------------------------------
 */

/** Sprite = grid karakter 16 kolom x 32 baris. */
export type PixelSprite = readonly string[]

export const SPRITE_W = 16
export const SPRITE_H = 32

/** Warna netral — diganti per agent saat rasterisasi. */
export const NEUTRAL = {
  S: '#e8b98d',
  B: '#c68a5e',
  H: '#3f2d20',
  C: '#6366f1',
  c: '#4f46e5',
  P: '#1f2937',
  K: '#111827',
  E: '#111827',
  M: '#8b3a3a',
} as const

/**
 * POSE BERDIRI — digambar tangan, piksel demi piksel.
 * y=0..1 margin - y=2..9 kepala - y=10 leher - y=11..20 torso+lengan
 * - y=21..27 kaki - y=28..31 margin.
 */
export const POSE_STAND: PixelSprite = [
  '................', //  0
  '................', //  1
  '....HHHHHHHH....', //  2  puncak rambut
  '...HHHHHHHHHH...', //  3
  '..HHHHHHHHHHHH..', //  4  rambut melebar
  '...HSSSSSSSSH...', //  5  wajah
  '...HSSESSESSH...', //  6  MATA
  '...HSSSSSSSSH...', //  7
  '...HSSSMMSSSH...', //  8  MULUT
  '....SSSSSSSS....', //  9  dagu
  '......SSSS......', // 10  leher
  '....CCCCCCCC....', // 11  bahu
  '...ccCCCCCCcc...', // 12  lengan + torso
  '...ccCCCCCCcc...', // 13
  '...ccCCCCCCcc...', // 14
  '...ccCCCCCCcc...', // 15
  '...ccCCCCCCcc...', // 16
  '...ccCCCCCCcc...', // 17
  '...BBCCCCCCBB...', // 18  TANGAN
  '...BBCCCCCCBB...', // 19
  '....CCCCCCCC....', // 20  hem
  '....PPPPPPPP....', // 21  pinggul
  '....PPPPPPPP....', // 22
  '.....PP..PP.....', // 23  kaki kiri | kanan
  '.....PP..PP.....', // 24
  '.....PP..PP.....', // 25
  '.....KK..KK.....', // 26
  '....KKKKKKKK....', // 27  SEPATU
  '................', // 28
  '................', // 29
  '................', // 30
  '................', // 31
]

/** Mengetik — lengan ke depan meja, kepala turun 1 baris (membungkuk). */
export const POSE_TYPE_A: PixelSprite = [
  '................', //  0
  '................', //  1
  '................', //  2
  '....HHHHHHHH....', //  3  kepala turun
  '...HHHHHHHHHH...', //  4
  '..HHHHHHHHHHHH..', //  5
  '...HSSSSSSSSH...', //  6
  '...HSSESSESSH...', //  7
  '...HSSSSSSSSH...', //  8
  '...HSSSMMSSSH...', //  9
  '....SSSSSSSS....', // 10
  '......SSSS......', // 11
  '....CCCCCCCC....', // 12
  '...ccCCCCCCcc...', // 13
  '...ccCCCCCCcc...', // 14
  '...BBCCCCCCBB...', // 15  tangan di atas meja
  '..BBBBBBBBBBBB..', // 16  KEDUA TANGAN di keyboard
  '..BBBBBBBBBBBB..', // 17
  '....CCCCCCCC....', // 18
  '....PPPPPPPP....', // 19
  '....PPPPPPPP....', // 20
  '.....PP..PP.....', // 21
  '.....PP..PP.....', // 22
  '.....PP..PP.....', // 23
  '.....KK..KK.....', // 24
  '....KKKKKKKK....', // 25
  '................', // 26
  '................', // 27
  '................', // 28
  '................', // 29
  '................', // 30
  '................', // 31
]

/** Mengetik frame 2 — tangan turun 1 baris; dihitung dari frame 1. */
export const POSE_TYPE_B: PixelSprite = POSE_TYPE_A.map((row, i) =>
  i === 16 || i === 17 ? row.slice(0, 3) + 'BBBBBBBBBB' + row.slice(13) : row,
)

/** Melambaikan tangan — satu lengan terangkat. */
export const POSE_WAVE: PixelSprite = [
  '................', //  0
  '..BB............', //  1  tangan terangkat
  '..BB............', //  2
  '..BB.HHHHHHHH...', //  3
  '..BBHHHHHHHHHH..', //  4
  '...HSSSSSSSSH...', //  5
  '...HSSESSESSH...', //  6
  '...HSSSSSSSSH...', //  7
  '...HSSSMMSSSH...', //  8  MULUT (panjang 16)
  '....SSSSSSSS....', //  9
  '......SSSS......', // 10
  '....CCCCCCCC....', // 11
  '...ccCCCCCCcc...', // 12
  '...ccCCCCCCcc...', // 13
  '...ccCCCCCCcc...', // 14
  '...ccCCCCCCcc...', // 15
  '...ccCCCCCCcc...', // 16
  '...BBCCCCCCBB...', // 17
  '....CCCCCCCC....', // 18
  '....PPPPPPPP....', // 19
  '....PPPPPPPP....', // 20
  '.....PP..PP.....', // 21
  '.....PP..PP.....', // 22
  '.....PP..PP.....', // 23
  '.....KK..KK.....', // 24
  '....KKKKKKKK....', // 25
  '................', // 26
  '................', // 27
  '................', // 28
  '................', // 29
  '................', // 30
  '................', // 31
]

/**
 * Duduk — pangkuan horizontal, lengan bersedekap di dada.
 * Agent terlihat BENAR-BENAR duduk di kursi, bukan berdiri di atasnya.
 */
export const POSE_SIT: PixelSprite = [
  '................', //  0
  '................', //  1
  '....HHHHHHHH....', //  2
  '...HHHHHHHHHH...', //  3
  '..HHHHHHHHHHHH..', //  4
  '...HSSSSSSSSH...', //  5
  '...HSSESSESSH...', //  6
  '...HSSSSSSSSH...', //  7
  '...HSSSMMSSSH...', //  8
  '....SSSSSSSS....', //  9
  '......SSSS......', // 10
  '....CCCCCCCC....', // 11
  '...ccCCCCCCcc...', // 12
  '...ccCCCCCCcc...', // 13
  '..BBBBBBBBBBBB..', // 14  lengan bersedekap
  '..BBBBBBBBBBBB..', // 15
  '....CCCCCCCC....', // 16
  '....PPPPPPPP....', // 17
  '..PPPPPPPPPPPP..', // 18  pangkuan melebar
  '..PPPPPPPPPPPP..', // 19
  '..PPPPPPPPPPPP..', // 20
  '..PPPPPPPPPPPP..', // 21
  '...KKKKKKKKKK...', // 22  SEPATU maju ke depan
  '................', // 23
  '................', // 24
  '................', // 25
  '................', // 26
  '................', // 27
  '................', // 28
  '................', // 29
  '................', // 30
  '................', // 31
]

/**
 * Berjalan — kaki kiri maju.
 *
 * Hanya baris SEPATU (26-27) yang digeser; baris kaki dan pinggul tetap.
 * Ini menjaga proporsi antar-pose identik dan lebar baris selalu 16 piksel:
 * 4 piksel kiri + 8 piksel tengah + 4 piksel kanan.
 */
export const POSE_WALK_A: PixelSprite = POSE_STAND.map((row, i) => {
  if (i === 26) return row.slice(0, 4) + 'KKK..PP.' + row.slice(12)
  if (i === 27) return row.slice(0, 4) + 'KKKKKK..' + row.slice(12)
  return row
})

/** Berjalan — kaki kanan maju. */
export const POSE_WALK_B: PixelSprite = POSE_STAND.map((row, i) => {
  if (i === 26) return row.slice(0, 4) + '.PP..KKK' + row.slice(12)
  if (i === 27) return row.slice(0, 4) + '..KKKKKK' + row.slice(12)
  return row
})

/** Berjalan — posisi netral. */
export const POSE_WALK_MID: PixelSprite = POSE_STAND

/** Tidur — badan sama, diputar saat render supaya terlihat rebah. */
export const POSE_SLEEP: PixelSprite = POSE_STAND

/** Semua pose. `walk` 4 frame agar langkah kaki benar-benar berayun. */
export const POSES = {
  stand: POSE_STAND,
  walk: [POSE_WALK_MID, POSE_WALK_A, POSE_WALK_MID, POSE_WALK_B],
  type: [POSE_TYPE_A, POSE_TYPE_B],
  wave: POSE_WAVE,
  sit: POSE_SIT,
  sleep: POSE_SLEEP,
} as const

/** Nama pose yang valid. */
export type PoseName = keyof typeof POSES

/**
 * Satu entri `POSES` bisa berupa SATU sprite (array of baris) atau SEJUMUH
 * frame (array of sprite) — dan keduanya sama-sama `Array`, jadi bentuknya
 * harus dibedakan dari ISI elemen pertama, bukan dari `Array.isArray(pose)`.
 *
 * `Array.isArray(pose)` selalu true untuk sprite tunggal: `stand` lalu
 * dianggap 32 frame, masing-masing adalah satu baris string.
 * `stamp()` memanggil `.map()` pada string itu dan melempar TypeError —
 * seluruh frame pertama mati, jadi tidak ada karakter yang pernah tampil.
 */
export function framesOf(pose: PixelSprite | readonly PixelSprite[]): PixelSprite[] {
  return (Array.isArray(pose[0]) ? pose : [pose]) as PixelSprite[]
}

/* -------------------------------------------------------------------------- */
/*  AKSESORI                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Sel piksel yang ditimpa aksesori, dalam bentuk (baris, kolom).
 * Aksesori dibuat dengan menimpa rambut/mata — seperti pixel art manual.
 */
export const ACCESSORY_CELLS = {
  /** Topi baseball — menutupi puncak rambut. */
  cap: [
    [2, 4], [2, 5], [2, 6], [2, 7], [2, 8], [2, 9], [2, 10],
    [3, 3], [3, 4], [3, 5], [3, 6], [3, 7], [3, 8], [3, 9], [3, 10], [3, 11],
  ],
  /** Kacamata — menutupi area mata. */
  glasses: [[6, 5], [6, 6], [6, 7], [6, 9], [6, 10], [7, 6], [7, 9]],
  /** Lencana di dada. */
  badge: [[15, 10]],
} as const

export type AccessoryName = keyof typeof ACCESSORY_CELLS

/**
 * Salin sprite lalu timpa sel tertentu dengan simbol warna baru.
 * Sprite asal tidak diubah (dipakai ulang berkali-kali).
 */
export function stamp(
  sprite: PixelSprite,
  cells: ReadonlyArray<readonly [number, number]>,
  symbol: string,
): PixelSprite {
  const g = sprite.map((r) => r.split(''))
  for (const [y, x] of cells) {
    if (y < g.length && x < g[y].length && g[y][x] !== '.') g[y][x] = symbol
  }
  return g.map((r) => r.join(''))
}

/** Cermin horizontal — untuk arah hadap kiri. */
export function flipSprite(sprite: PixelSprite): PixelSprite {
  return sprite.map((r) => r.split('').reverse().join(''))
}

/** Putar 90 derajat — dipakai untuk pose tidur supaya badan terlihat rebah. */
export function rotateSprite(sprite: PixelSprite): PixelSprite {
  const out: string[] = []
  for (let x = 0; x < SPRITE_W; x++) {
    let row = ''
    for (let y = SPRITE_H - 1; y >= 0; y--) row += sprite[y]?.[x] ?? '.'
    out.push(row)
  }
  return out
}

/* -------------------------------------------------------------------------- */
/*  PALET + RASTERIZER + CACHE                                                  */
/* -------------------------------------------------------------------------- */

/** Palet warna satu agent — semua simbol bisa ditulis ulang. */
export interface AgentPalette {
  S: string // kulit
  B: string // kulit gelap (tangan)
  H: string // rambut
  C: string // baju
  c: string // bayangan baju
  P: string // celana
  K: string // sepatu
  E: string // mata
  M: string // mulut
  /** Warna aksesori agent ini. */
  A: string
}

/** Cache sprite → canvas. Kunci = simbol warna + isi grid + skala. */
const rasterCache = new Map<string, HTMLCanvasElement>()

function cacheKey(sprite: PixelSprite, palette: AgentPalette, scale: number): string {
  return `${scale}|${palette.S}${palette.B}${palette.H}${palette.C}${palette.c}` +
    `${palette.P}${palette.K}${palette.E}${palette.M}${palette.A}|${sprite.join('~')}`
}

/**
 * Rasterisasi grid piksel ke canvas offscreen dengan smoothing MATI.
 *
 * `imageSmoothingEnabled = false` adalah inti pixel art: tanpa itu canvas
 * memblur setiap tepi sprite dan hasilnya terlihat vektor, bukan pixel.
 */
export function rasterize(
  sprite: PixelSprite,
  palette: AgentPalette,
  scale: number,
): HTMLCanvasElement {
  const key = cacheKey(sprite, palette, scale)
  const hit = rasterCache.get(key)
  if (hit) return hit

  const canvas = document.createElement('canvas')
  canvas.width = SPRITE_W * scale
  canvas.height = SPRITE_H * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  // INI yang membuat gambar tetap tajam saat canvas di-zoom.
  ctx.imageSmoothingEnabled = false

  for (let y = 0; y < SPRITE_H; y++) {
    const row = sprite[y]
    if (!row) continue
    for (let x = 0; x < SPRITE_W; x++) {
      const sym = row[x]
      if (!sym || sym === '.') continue
      const color = palette[sym as keyof AgentPalette]
      if (!color) continue
      ctx.fillStyle = color
      // Satu piksel sprite = blok scale x scale piksel device; tepi tetap tajam.
      ctx.fillRect(x * scale, y * scale, scale, scale)
    }
  }

  rasterCache.set(key, canvas)
  return canvas
}

/** Bersihkan cache (dipakai saat HMR atau ganti palet). */
export function clearRasterCache(): void {
  rasterCache.clear()
}

/** Kumpulan framePXELS sebuah agent, sudah di-raster. */
export type AgentFrames = Record<PoseName, HTMLCanvasElement[]>

/**
 * Bangun semua frame untuk satu agent.
 * Dipanggil sekali per agent; setelah itu renderer cukup `drawImage`.
 */
export function buildAgentFrames(
  palette: AgentPalette,
  scale: number,
  accessory: AccessoryName | null,
): AgentFrames {
  const decorate = (s: PixelSprite): PixelSprite =>
    accessory ? stamp(s, ACCESSORY_CELLS[accessory], 'A') : s

  const out = {} as Record<string, HTMLCanvasElement[]>
  for (const [name, pose] of Object.entries(POSES)) {
    const list = framesOf(pose)
    out[name] = list.map((s) => rasterize(decorate(s), palette, scale))
  }
  return out as AgentFrames
}