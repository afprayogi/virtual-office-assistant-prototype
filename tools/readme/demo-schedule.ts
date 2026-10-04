/**
 * tools/readme/demo-schedule.ts
 * ---------------------------------------------------------------------------
 * "Skrip gerak" untuk animasi kantor: setiap agent punya rangkaian segmen
 * (diam / berpindah) yang berawal dan berakhir di titik home, sehingga animasi
 * melingkar (loop) mulus. Dipakai oleh animasi SVG maupun GIF.
 * ---------------------------------------------------------------------------
 */
import { DEFAULT_AGENTS, MEETING_SEATS, type PoseName } from './svg-kit'

export interface Pt { x: number; y: number }

export type Seg =
  | { kind: 'still'; pose: PoseName; at: Pt; w: number }
  | { kind: 'move'; from: Pt; to: Pt; w: number }

export interface Sample { x: number; y: number; pose: PoseName; moving: boolean }

/** Posisi awal semua agent: berbaris rapi di Lobby (y=2 agar sprite utuh). */
function homeFor(i: number): Pt {
  return { x: 1.2 + i * 1.78, y: 2 }
}

/** Meja kerja agent di Ruang Coding (baris atas & bawah). */
function deskFor(i: number): Pt {
  return { x: 11.4 + (i % 6) * 1.65, y: i < 6 ? 6 : 8 }
}

/** Titik tujuan untuk agent yang tidak ke ruang rapat. */
function destFor(i: number): Pt {
  return i % 2 === 0 ? { x: 12, y: 12 } : { x: 18, y: 12 }
}

/** Rangkaian segmen per agent. Semua kembali ke `home` di akhir. */
export function scheduleFor(i: number): Seg[] {
  const home = homeFor(i)
  const desk = deskFor(i)
  const segs: Seg[] = [
    { kind: 'still', pose: 'stand', at: home, w: 1 + (i % 6) * 0.6 },
    { kind: 'move', from: home, to: desk, w: 2 },
    { kind: 'still', pose: 'type', at: desk, w: 3 },
  ]
  if (i < 6) {
    const seat = MEETING_SEATS[i % MEETING_SEATS.length]
    segs.push(
      { kind: 'move', from: desk, to: seat, w: 1.6 },
      { kind: 'still', pose: 'sit', at: seat, w: 3.2 },
      { kind: 'move', from: seat, to: desk, w: 1.6 },
    )
  } else {
    const dest = destFor(i)
    segs.push(
      { kind: 'still', pose: 'wave', at: desk, w: 1 },
      { kind: 'move', from: desk, to: dest, w: 1.6 },
      { kind: 'still', pose: 'sit', at: dest, w: 2.4 },
      { kind: 'move', from: dest, to: desk, w: 1.6 },
    )
  }
  segs.push(
    { kind: 'still', pose: 'wave', at: desk, w: 1 },
    { kind: 'move', from: desk, to: home, w: 2 },
  )
  return segs
}

/** Fase (0..1) di mana agent mulai berjalan pertama kali — untuk efek stagger. */
export function startOffset(i: number): number {
  const total = scheduleFor(i).reduce((a, s) => a + s.w, 0)
  return (1 + (i % 6) * 0.6) / total
}

/** Sampel posisi & pose pada fase `t` (0..1). */
export function sampleAt(segs: Seg[], t: number): Sample {
  const total = segs.reduce((a, s) => a + s.w, 0)
  let left = (((t % 1) + 1) % 1) * total
  for (let idx = 0; idx < segs.length; idx++) {
    const s = segs[idx]
    if (left <= s.w || idx === segs.length - 1) {
      const p = s.w === 0 ? 1 : Math.max(0, Math.min(1, left / s.w))
      if (s.kind === 'move') {
        return {
          x: s.from.x + (s.to.x - s.from.x) * p,
          y: s.from.y + (s.to.y - s.from.y) * p,
          pose: 'walk',
          moving: true,
        }
      }
      return { x: s.at.x, y: s.at.y, pose: s.pose, moving: false }
    }
    left -= s.w
  }
  const last = segs[segs.length - 1]
  return last.kind === 'move'
    ? { x: last.to.x, y: last.to.y, pose: 'walk', moving: true }
    : { x: last.at.x, y: last.at.y, pose: last.pose, moving: false }
}

/** Jumlah agent yang beranimasi. */
export const DEMO_AGENTS = DEFAULT_AGENTS
