/**
 * types/office.ts
 * ---------------------------------------------------------------------------
 * Geometri kantor virtual 2D (gaya pixel-art / top-down isometric).
 * Semua koordinat dalam satuan TILE. Canvas mengonversinya ke piksel.
 * ---------------------------------------------------------------------------
 */
import type { Activity, OfficeCoordinates, RoomId } from './agent'

/**
 * Ukuran grid kantor.
 *
 * Kolom/tinggi grid tetap 22x14 supaya semua koordinat ROOM, PROP, dan ANCHORS
 * di bawah TIDAK berubah. Yang diperbesar hanya `TILE` — yaitu besaran satu sel
 * dalam piksel. Jadi seluruh kantor (lantai, dinding, furniture, agent) ikut
 * membesar secara proporsional tanpa perlu mengubah satu pun koordinat.
 */
export const GRID_COLS = 22
export const GRID_ROWS = 14
/**
 * TILE = 48px (semula 34px). Sprite 16px dengan skala 3 = 48px pas satu tile,
 * jadi agent terlihat jauh lebih besar dan tidak tenggelam di antara furniture.
 */
export const TILE = 48

export const OFFICE_WIDTH = GRID_COLS * TILE   // 1056px
export const OFFICE_HEIGHT = GRID_ROWS * TILE  // 672px

/** Ruangan yang bisa ditempati agent. */
export interface OfficeRoom {
  id: RoomId
  name: string
  icon: string
  /** Batas area (bukan eksklusif) dalam koordinat tile. */
  rect: { x: number; y: number; w: number; h: number }
  /** Warna lantai. */
  floor: string
  accent: string
  /** Aktivitas utama yang berlangsung di ruangan ini. */
  activity: Activity
}

/** Titik berdiri / posisi agent di dalam ruangan. */
export interface OfficeAnchor {
  x: number
  y: number
}

export const ROOMS: Record<RoomId, OfficeRoom> = {
  lobby: {
    id: 'lobby', name: 'Lobby', icon: '🚪',
    rect: { x: 0, y: 0, w: 22, h: 3 },
    floor: '#3b3a45', accent: '#6c6a7d', activity: 'fun',
  },
  meeting: {
    id: 'meeting', name: 'Ruang Rapat', icon: '🗣️',
    rect: { x: 1, y: 4, w: 9, h: 6 },
    floor: '#454257', accent: '#8b7fd4', activity: 'chat',
  },
  desks: {
    id: 'desks', name: 'Ruang Coding', icon: '💻',
    rect: { x: 11, y: 4, w: 10, h: 6 },
    floor: '#3f4a55', accent: '#4f9ad6', activity: 'work',
  },
  lab: {
    id: 'lab', name: 'Lab QA', icon: '🧪',
    rect: { x: 1, y: 11, w: 7, h: 3 },
    floor: '#3d4a3f', accent: '#4ade80', activity: 'test',
  },
  stage: {
    id: 'stage', name: 'Panggung Demo', icon: '🎤',
    rect: { x: 9, y: 11, w: 6, h: 3 },
    floor: '#4a3f52', accent: '#c96fb0', activity: 'demo',
  },
  lounge: {
    id: 'lounge', name: 'Lounge', icon: '☕',
    rect: { x: 16, y: 11, w: 6, h: 3 },
    floor: '#4d4638', accent: '#c9a227', activity: 'lounge',
  },
}

/** Titik berdiri / posisi agent di dalam ruangan. */
export interface OfficeAnchor {
  x: number
  y: number
}

/**
 * Slot berdiri per ruangan. Agent mengklaim slot berdasarkan urutannya,
 * jadi slot pertama dipakai agent pertama yang datang.
 */
/**
 * Kursi di sekeliling meja ruang rapat.
 *
 * Meja ruang rapat menempati x=2..8, y=4..5 (lihat PROPS). Agent duduk
 * mengelilingi meja: 3 kursi di sisi atas, 3 di sisi bawah.
 *
 * Dipakai saat agent berdiskusi — mereka tidak berdiri tegang, tapi benar-benar
 * duduk di meja rapat.
 */
export const MEETING_SEATS: OfficeAnchor[] = [
  { x: 2, y: 6 },
  { x: 4, y: 6 },
  { x: 6, y: 6 },
  { x: 2, y: 7 },
  { x: 4, y: 7 },
  { x: 6, y: 7 },
]

export const ANCHORS: Record<RoomId, OfficeAnchor[]> = {
  // Lobby: area santai, 7 slot
  lobby: [
    { x: 2, y: 1 }, { x: 5, y: 1 }, { x: 8, y: 1 }, { x: 11, y: 1 },
    { x: 14, y: 1 }, { x: 17, y: 1 }, { x: 19, y: 1 },
  ],
  // Ruang rapat: mengelilingi meja besar, 10 slot
  // Ruang rapat: 6 kursi mengelilingi meja. Agent yang berdiskusi DUDUK di sini.
  meeting: [
    { x: 2, y: 6 }, { x: 4, y: 6 }, { x: 6, y: 6 },
    { x: 2, y: 7 }, { x: 4, y: 7 }, { x: 6, y: 7 },
  ],
  // Ruang coding: 9 workstation individual (mode B: berdiri di samping meja)
  desks: [
    { x: 12, y: 6 }, { x: 14, y: 6 }, { x: 16, y: 6 }, { x: 18, y: 6 }, { x: 20, y: 6 },
    { x: 13, y: 8 }, { x: 15, y: 8 }, { x: 17, y: 8 }, { x: 19, y: 8 },
  ],
  // Lab QA: 5 slot di depan meja test
  lab: [
    { x: 2, y: 12 }, { x: 3, y: 12 }, { x: 4, y: 12 }, { x: 5, y: 12 }, { x: 6, y: 12 },
  ],
  // Panggung demo: 5 slot
  stage: [
    { x: 10, y: 12 }, { x: 11, y: 12 }, { x: 12, y: 13 }, { x: 13, y: 12 }, { x: 14, y: 12 },
  ],
  // Lounge: 5 slot
  lounge: [
    { x: 17, y: 12 }, { x: 18, y: 12 }, { x: 19, y: 12 }, { x: 20, y: 12 }, { x: 16, y: 12 },
  ],
}

/** Ruangan tempat activity tertentu berlangsung. */
export const ACTIVITY_ROOM: Record<Activity, RoomId> = {
  fun: 'lobby',
  chat: 'meeting',
  work: 'desks',
  review: 'desks',
  test: 'lab',
  demo: 'stage',
  lounge: 'lounge',
  // Tidur di lounge — ruangan paling tenang di kantor.
  sleep: 'lounge',
}

/** Furniture dekoratif yang digambar statis di canvas. */
export interface Prop {
  kind: 'desk' | 'chair' | 'plant' | 'screen' | 'computer' | 'coffee-machine' | 'sofa' | 'mic' | 'rug'
  x: number
  y: number
  w?: number
  h?: number
}

/**
 * Workstation milik satu agent: posisi mejanya dan posisi berdiri di depannya.
 *
 * Tiap agent punya komputer sendiri supaya:
 *  - jelas siapa sedang mengerjakan apa,
 *  - agent yang tidak berdiskusi tetap bisa "duduk" di komputernya sendiri
 *    alih-alih bergerak bolak-balik,
 *  - tidak ada dua orang berebut satu meja.
 */
export interface Workstation {
  /** Tile kiri atas meja. */
  deskX: number
  /** Tile atas meja. */
  deskY: number
  /** Lebar meja (tile). */
  w: number
  /** Tile tempat agent berdiri di bawah mejanya. */
  standX: number
  standY: number
}

/**
 * Pemetaan agent -> workstation. Kunci = id agent.
 *
 * Ruang coding (x 11..20, y 4..9) dibagi 2 baris x 5 kolom, jadi muat 10
 * komputer. Meja lebar 2 tile, agent berdiri 1 tile di bawahnya.
 */
export const WORKSTATIONS: Record<string, Workstation> = {
  ceo: { deskX: 11, deskY: 4, w: 2, standX: 11, standY: 5 },
  pm: { deskX: 13, deskY: 4, w: 2, standX: 13, standY: 5 },
  dev: { deskX: 15, deskY: 4, w: 2, standX: 15, standY: 5 },
  ba: { deskX: 17, deskY: 4, w: 2, standX: 17, standY: 5 },
  rev: { deskX: 19, deskY: 4, w: 2, standX: 19, standY: 5 },
  ux: { deskX: 11, deskY: 7, w: 2, standX: 11, standY: 8 },
  qa: { deskX: 13, deskY: 7, w: 2, standX: 13, standY: 8 },
  demo: { deskX: 15, deskY: 7, w: 2, standX: 15, standY: 8 },
  be: { deskX: 17, deskY: 7, w: 2, standX: 17, standY: 8 },
  fe: { deskX: 19, deskY: 7, w: 2, standX: 19, standY: 8 },
  // Tim kreatif. Baris y=9 masih kosong dan MASIH di dalam room `desks`
  // (rect y 4..9), jadi mereka dapat meja sungguhan — bukan slot cadangan.
  chara: { deskX: 13, deskY: 9, w: 2, standX: 13, standY: 10 },
  story: { deskX: 17, deskY: 9, w: 2, standX: 17, standY: 10 },
}

/**
 * Workstation cadangan untuk agent yang belum punya meja sendiri — diberi
 * slot liar di pojok bawah ruang coding.
 */
export const FALLBACK_WORKSTATIONS: Workstation[] = [
  { deskX: 11, deskY: 9, w: 2, standX: 11, standY: 10 },
  { deskX: 13, deskY: 9, w: 2, standX: 13, standY: 10 },
]

/** Cari workstation agent; fallback ke slot cadangan berdasarkan urutan. */
export function workstationFor(agentId: string, index = 0): Workstation {
  return (
    WORKSTATIONS[agentId] ??
    FALLBACK_WORKSTATIONS[index % FALLBACK_WORKSTATIONS.length] ??
    { deskX: 11, deskY: 9, w: 2, standX: 11, standY: 10 }
  )
}

export const PROPS: Prop[] = [
  // --- Lobby: area santai, sofa & meja kecil
  { kind: 'plant', x: 0, y: 0 },
  { kind: 'plant', x: 21, y: 0 },
  { kind: 'rug', x: 7, y: 0, w: 8, h: 2 },
  { kind: 'sofa', x: 4, y: 1, w: 2, h: 1 },
  { kind: 'coffee-machine', x: 1, y: 1 },

  // --- Ruang rapat: meja besar + kursi mengelilinginya + layar
  { kind: 'desk', x: 2, y: 4, w: 7, h: 2 },
  { kind: 'screen', x: 8, y: 4, w: 2, h: 1 },
  // Kursi: agent yang berdiskusi DUDUK di sini, bukan berdiri.
  ...MEETING_SEATS.map((s) => ({ kind: 'chair' as const, x: s.x, y: s.y })),
  { kind: 'plant', x: 1, y: 9 },

  // --- Ruang coding: meja GERA-DARI WORKSTATIONS (satu komputer per agent).
  // Jangan tulis manual di sini, supaya meja selalu sinkron dengan
  // WORKSTATIONS di types/office.ts.
  ...Object.values(WORKSTATIONS).flatMap((s) => [
    { kind: 'desk' as const, x: s.deskX, y: s.deskY, w: s.w, h: 1 },
    { kind: 'computer' as const, x: s.deskX, y: s.deskY, w: s.w, h: 1 },
  ]),
  { kind: 'plant', x: 11, y: 9 },

  // --- Lab QA: meja test + rak
  { kind: 'desk', x: 1, y: 11, w: 7, h: 1 },
  { kind: 'screen', x: 3, y: 11, w: 2, h: 1 },
  { kind: 'chair', x: 4, y: 11 },

  // --- Panggung demo: panggung + mic + layar
  { kind: 'rug', x: 9, y: 11, w: 6, h: 3 },
  { kind: 'mic', x: 12, y: 11 },
  { kind: 'screen', x: 9, y: 13, w: 6, h: 1 },

  // --- Lounge: sofa panjang + meja
  { kind: 'sofa', x: 16, y: 11, w: 4, h: 1 },
  { kind: 'desk', x: 20, y: 11, w: 2, h: 1 },
  { kind: 'plant', x: 15, y: 13 },
]

/** Tile yang terhalang furniture -> pathfinding menghindari ini. */
export const BLOCKED_TILES: ReadonlySet<string> = new Set(
  PROPS.filter((p) => p.kind === 'desk' || p.kind === 'sofa' || p.kind === 'coffee-machine')
    .flatMap((p) => {
      const cells: string[] = []
      for (let dx = 0; dx < (p.w ?? 1); dx++) {
        for (let dy = 0; dy < (p.h ?? 1); dy++) cells.push(`${p.x + dx},${p.y + dy}`)
      }
      return cells
    }),
)

/** Semua ruangan, dalam urutan tampil di UI. */
export const ROOM_ORDER: RoomId[] = ['lobby', 'meeting', 'desks', 'lab', 'stage', 'lounge']

/** Konversi tile <-> piksel. */
export const tileToPixel = (c: OfficeCoordinates) => ({
  x: c.x * TILE + TILE / 2,
  y: c.y * TILE + TILE / 2,
})

export const pixelToTile = (x: number, y: number): OfficeCoordinates => ({
  x: Math.floor(x / TILE),
  y: Math.floor(y / TILE),
})

/** True bila tile berada di dalam batas area room. */
export const isInsideRoom = (room: OfficeRoom, c: OfficeCoordinates) =>
  c.x >= room.rect.x &&
  c.x < room.rect.x + room.rect.w &&
  c.y >= room.rect.y &&
  c.y < room.rect.y + room.rect.h