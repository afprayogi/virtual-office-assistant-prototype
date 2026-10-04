/**
 * tools/readme/office-scene.ts
 * ---------------------------------------------------------------------------
 * Menggambar "kamar statis" kantor virtual dalam SVG (lantai, dinding,
 * furniture) — cermin dari `drawStatic()` di components/office/office-draw.ts.
 * Dipakai ulang oleh mockup dashboard dan animasi kantor.
 * ---------------------------------------------------------------------------
 */
import { GRID_COLS, GRID_ROWS, PROPS, ROOMS, TILE, rect, text, type RectOpts } from './svg-kit'

/** Warna furniture — selaras dengan drawProp() di runtime. */
const PROP_FILL: Record<string, string> = {
  desk: '#6b4f3a',
  computer: '#27272a',
  chair: '#4b5563',
  screen: '#0ea5e9',
  plant: '#22c55e',
  sofa: '#7c5f4a',
  rug: '#3a2d35',
  mic: '#9ca3af',
  'coffee-machine': '#374151',
}

/**
 * Seluruh isi kantor (lantai, garis grid, furniture, label) sebagai elemen SVG.
 * `s` = skala (1 = ukuran asli, 1056x672).
 */
export function officeScenery(s = 1, withLabels = true): string {
  const parts: string[] = []
  const W = GRID_COLS * TILE * s
  const H = GRID_ROWS * TILE * s

  parts.push(rect(0, 0, W, H, '#26262e'))

  // Lantai tiap ruangan.
  for (const room of Object.values(ROOMS)) {
    const { x, y, w, h } = room.rect
    parts.push(
      rect(x * TILE * s, y * TILE * s, w * TILE * s, h * TILE * s, room.floor),
    )
  }

  // Garis grid halus.
  const grid: string[] = []
  for (let gx = 0; gx <= GRID_COLS; gx++) {
    grid.push(`<line x1="${gx * TILE * s}" y1="0" x2="${gx * TILE * s}" y2="${H}" stroke="rgba(255,255,255,0.035)" stroke-width="1"/>`)
  }
  for (let gy = 0; gy <= GRID_ROWS; gy++) {
    grid.push(`<line x1="0" y1="${gy * TILE * s}" x2="${W}" y2="${gy * TILE * s}" stroke="rgba(255,255,255,0.035)" stroke-width="1"/>`)
  }
  parts.push(grid.join(''))

  // Furniture.
  for (const p of PROPS) {
    const x = p.x * TILE * s
    const y = p.y * TILE * s
    const w = (p.w ?? 1) * TILE * s
    const h = (p.h ?? 1) * TILE * s
    const fill = PROP_FILL[p.kind] ?? '#6b7280'
    if (p.kind === 'desk') {
      parts.push(rect(x + 2 * s, y + 4 * s, w - 4 * s, h - 8 * s, fill, { rx: 2 * s }))
      parts.push(rect(x + 2 * s, y + 4 * s, w - 4 * s, 4 * s, '#7d5c43'))
    } else if (p.kind === 'computer') {
      const cx = x + w / 2
      parts.push(rect(cx - 9 * s, y + 6 * s, 18 * s, 11 * s, '#18181b', { rx: 1.5 * s }))
      parts.push(rect(cx - 7 * s, y + 8 * s, 14 * s, 7 * s, '#0f172a'))
      parts.push(rect(cx - 5 * s, y + 10 * s, 6 * s, 1.4 * s, '#22c55e'))
      parts.push(rect(cx - 5 * s, y + 12 * s, 9 * s, 1.4 * s, '#22c55e'))
      parts.push(rect(x + w - 8 * s, y + 8 * s, 5 * s, 11 * s, '#27272a', { rx: s }))
    } else if (p.kind === 'rug') {
      parts.push(rect(x, y, w, h, fill, { opacity: 0.35 }))
    } else if (p.kind === 'plant') {
      parts.push(`<circle cx="${x + TILE * s / 2}" cy="${y + TILE * s / 2}" r="${8 * s}" fill="#22c55e"/>`)
      parts.push(rect(x + TILE * s / 2 - 5 * s, y + TILE * s - 12 * s, 10 * s, 10 * s, '#3f2d20', { rx: s }))
    } else if (p.kind === 'chair') {
      parts.push(rect(x + 4 * s, y + 4 * s, w - 8 * s, h - 8 * s, fill, { rx: 3 * s }))
    } else if (p.kind === 'mic') {
      parts.push(rect(x + TILE * s / 2 - 2 * s, y + 2 * s, 4 * s, TILE * s - 8 * s, '#374151'))
      parts.push(`<circle cx="${x + TILE * s / 2}" cy="${y + TILE * s - 6 * s}" r="${4 * s}" fill="#9ca3af"/>`)
    } else if (p.kind === 'sofa') {
      parts.push(rect(x + 2 * s, y + 4 * s, w - 4 * s, h - 8 * s, fill, { rx: 3 * s }))
      parts.push(rect(x + 4 * s, y + 6 * s, w - 8 * s, h - 14 * s, '#8f7057', { rx: 2 * s }))
    } else if (p.kind === 'coffee-machine') {
      parts.push(rect(x + 6 * s, y + 8 * s, w - 12 * s, h - 14 * s, fill, { rx: 2 * s }))
      parts.push(rect(x + 10 * s, y + 12 * s, 6 * s, 6 * s, '#f97316'))
    } else {
      parts.push(rect(x + 1 * s, y + 2 * s, w - 2 * s, h - 4 * s, fill, { rx: 2 * s }))
    }
  }

  // Dinding ruangan (garis accent 2px di sekeliling).
  for (const room of Object.values(ROOMS)) {
    const { x, y, w, h } = room.rect
    parts.push(
      rect(x * TILE * s + s, y * TILE * s + s, w * TILE * s - 2 * s, h * TILE * s - 2 * s, 'none', {
        stroke: `${room.accent}66`, sw: 2 * s, rx: 3 * s,
      } as RectOpts),
    )
  }

  // Label ruangan.
  if (withLabels) {
    for (const room of Object.values(ROOMS)) {
      parts.push(
        text(room.rect.x * TILE * s + 10 * s, room.rect.y * TILE * s + 20 * s, `${room.icon} ${room.name}`, {
          size: 13 * s, weight: 600, fill: room.accent,
        }),
      )
    }
  }

  return parts.join('')
}
