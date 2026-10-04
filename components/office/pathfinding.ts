/**
 * components/office/pathfinding.ts
 * ---------------------------------------------------------------------------
 * Pathfinding sederhana (BFS) pada grid kantor.
 *
 * Dipakai VirtualOfficeCanvas agar agent tidak berjalan menembus furniture:
 * dari tile sekarang menuju tile target, ditemukan jalur terpendek yang
 * hanya melewati tile yang bisa dilalui.
 * ---------------------------------------------------------------------------
 */
import { BLOCKED_TILES, GRID_COLS, GRID_ROWS } from '@/types/office'
import type { OfficeCoordinates } from '@/types/agent'

const key = (x: number, y: number) => `${x},${y}`

const inBounds = (x: number, y: number) => x >= 0 && x < GRID_COLS && y >= 0 && y < GRID_ROWS
const isBlocked = (x: number, y: number) => BLOCKED_TILES.has(key(x, y))

/**
 * Cari jalur terpendek dari `start` ke `goal`.
 * Mengembalikan daftar tile termasuk titik awal dan tujuan.
 * Bila tidak ada jalur, kembalikan null.
 */
export function findPath(start: OfficeCoordinates, goal: OfficeCoordinates): OfficeCoordinates[] | null {
  // Tujuan boleh menimpa tile terhalang (agent harus tetap bisa sampai).
  if (start.x === goal.x && start.y === goal.y) return [start]

  const queue: OfficeCoordinates[] = [start]
  const cameFrom = new Map<string, OfficeCoordinates>()
  const seen = new Set<string>([key(start.x, start.y)])

  while (queue.length > 0) {
    const current = queue.shift() as OfficeCoordinates

    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = current.x + dx
      const ny = current.y + dy
      const k = key(nx, ny)
      if (seen.has(k) || !inBounds(nx, ny)) continue
      if (isBlocked(nx, ny) && !(nx === goal.x && ny === goal.y)) continue

      seen.add(k)
      cameFrom.set(k, current)

      if (nx === goal.x && ny === goal.y) {
        // Rekonstruksi jalur dari goal kembali ke start.
        const path: OfficeCoordinates[] = [{ x: nx, y: ny }]
        let cursor: OfficeCoordinates | undefined = current
        while (cursor && !(cursor.x === start.x && cursor.y === start.y)) {
          path.push(cursor)
          cursor = cameFrom.get(key(cursor.x, cursor.y))
        }
        path.push(start)
        return path.reverse()
      }

      queue.push({ x: nx, y: ny })
    }
  }

  return null
}