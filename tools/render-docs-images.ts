/**
 * tools/render-docs-images.ts
 * ---------------------------------------------------------------------------
 * Menghasilkan gambar dokumentasi (.svg) LANGSUNG DARI KODE.
 *
 * Penting: gambar di README ini bukan desain manual — semua di-render dari
 * sumber kebenaran yang sama dengan runtime:
 *   - sprite agent  <- components/office/pixel-sprites.ts + office-draw.ts
 *   - denah kantor  <- types/office.ts
 *
 * Kalau sprite atau denah berubah, jalankan ulang `npm run docs:images`
 * dan gambarnya selalu akurat.
 *
 * Jalankan: npx tsx ./tools/render-docs-images.ts
 * ---------------------------------------------------------------------------
 */
import fs from 'node:fs'
import path from 'node:path'
import { POSES, SPRITE_H, SPRITE_W, NEUTRAL } from '../components/office/pixel-sprites'
import { CHAR_STYLE } from '../components/office/office-draw'
import { DEFAULT_AGENTS } from '../lib/orchestrator/defaults'
import { PHASE_ORDER, PHASE_LABEL } from '../lib/orchestrator/taskRegistry'
import { GRID_COLS, GRID_ROWS, PROPS, ROOMS, TILE } from '../types/office'

const OUT_DIR = path.join(process.cwd(), 'docs', 'images')
fs.mkdirSync(OUT_DIR, { recursive: true })

/**
 * Render satu sprite (32 baris string) menjadi grup <rect>.
 * Satu piksel sprite = satu <rect> berukuran `px` — sama persis dengan
 * apa yang dilakukan `rasterize()` di browser, hanya tanpa canvas.
 */
function spriteRects(
  sprite: readonly string[],
  palette: Record<string, string>,
  px: number,
  offsetX: number,
  offsetY: number,
): string {
  const parts: string[] = []
  for (let y = 0; y < sprite.length; y++) {
    const row = sprite[y] ?? ''
    for (let x = 0; x < row.length; x++) {
      const sym = row[x]
      if (!sym || sym === '.') continue
      const fill = palette[sym] ?? (NEUTRAL as Record<string, string>)[sym] ?? '#ff00ff'
      parts.push(
        `<rect x="${offsetX + x * px}" y="${offsetY + y * px}" width="${px}" height="${px}" fill="${fill}"/>`,
      )
    }
  }
  return parts.join('')
}

function renderSpriteSheet(): string {
  const PX = 3
  const cellW = SPRITE_W * PX
  const cellH = SPRITE_H * PX
  const pad = 26
  const label = 54

  const shownPoses = ['stand', 'walk', 'type', 'wave', 'sit', 'sleep'] as const
  const agents = DEFAULT_AGENTS.slice(0, 8)
  const width = pad * 2 + shownPoses.length * (cellW + pad)
  const height = 70 + agents.length * (cellH + label)

  const parts: string[] = [`<rect width="${width}" height="${height}" fill="#16161d"/>`]

  const head = shownPoses
    .map((p, i) => {
      const x = pad + i * (cellW + pad) + cellW / 2
      return `<text x="${x}" y="34" fill="#9ca3af" font-family="ui-sans-serif,system-ui" font-size="12" text-anchor="middle">${p}</text>`
    })
    .join('')
  parts.push(
    `<text x="${pad}" y="18" fill="#e5e7eb" font-family="ui-sans-serif,system-ui" font-size="14" font-weight="600">Sprites agent — dirender dari pixel-sprites.ts</text>`,
    head,
  )

  agents.forEach((agent, row) => {
    const palette = (CHAR_STYLE[agent.id]?.palette ?? NEUTRAL) as unknown as Record<string, string>
    const top = 70 + row * (cellH + label)
    parts.push(
      `<text x="${pad}" y="${top + cellH / 2}" fill="${agent.color}" font-family="ui-sans-serif,system-ui" font-size="12" font-weight="600">${agent.name}</text>`,
      `<text x="${pad}" y="${top + cellH / 2 + 15}" fill="#6b7280" font-family="ui-sans-serif,system-ui" font-size="10">${agent.role}</text>`,
    )
    shownPoses.forEach((poseName, col) => {
      const pose = POSES[poseName]
      const frames = (Array.isArray(pose) ? pose : [pose]) as readonly (readonly string[])[]
      const x = pad + col * (cellW + pad)
      parts.push(
        `<rect x="${x - 4}" y="${top - 4}" width="${cellW + 8}" height="${cellH + 8}" fill="#26262e" rx="4"/>`,
        spriteRects(frames[0], palette, PX, x, top),
      )
    })
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`
}
function renderOfficeMap(): string {
  const W = GRID_COLS * TILE
  const H = GRID_ROWS * TILE
  const parts: string[] = [`<rect width="${W}" height="${H}" fill="#26262e"/>`]

  for (const room of Object.values(ROOMS)) {
    const { x, y, w, h } = room.rect
    parts.push(
      `<rect x="${x * TILE}" y="${y * TILE}" width="${w * TILE}" height="${h * TILE}" fill="${room.floor}"/>`,
      `<rect x="${x * TILE + 1}" y="${y * TILE + 1}" width="${w * TILE - 2}" height="${h * TILE - 2}" fill="none" stroke="${room.accent}66" stroke-width="2"/>`,
      `<text x="${x * TILE + 10}" y="${y * TILE + 20}" fill="${room.accent}" font-family="ui-sans-serif,system-ui" font-size="13" font-weight="600">${room.icon} ${room.name}</text>`,
    )
  }

  for (const p of PROPS) {
    const x = p.x * TILE
    const y = p.y * TILE
    const w = (p.w ?? 1) * TILE
    const h = (p.h ?? 1) * TILE
    const fill =
      p.kind === 'desk' ? '#6b4f3a'
        : p.kind === 'computer' ? '#1f2937'
          : p.kind === 'chair' ? '#4b5563'
            : p.kind === 'screen' ? '#0ea5e9'
              : p.kind === 'plant' ? '#22c55e'
                : p.kind === 'sofa' ? '#7c5f4a'
                  : p.kind === 'rug' ? 'rgba(217,119,87,0.18)'
                    : p.kind === 'mic' ? '#9ca3af'
                      : '#6b7280'
    parts.push(`<rect x="${x + 3}" y="${y + 5}" width="${w - 6}" height="${h - 10}" fill="${fill}" rx="3"/>`)
  }

  // Tiap agent berdiri di depan komputernya sendiri.
  for (const agent of DEFAULT_AGENTS) {
    const cx = agent.location.x * TILE + TILE / 2
    const cy = agent.location.y * TILE + TILE / 2
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="7" fill="${agent.color}" stroke="#16161d" stroke-width="2"/>`,
      `<text x="${cx}" y="${cy + 3.5}" fill="#111827" font-family="ui-sans-serif,system-ui" font-size="8" font-weight="700" text-anchor="middle">${agent.name[0]}</text>`,
    )
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`
}

function renderWorkflow(): string {
  const nodeW = 150
  const nodeH = 74
  const gap = 26
  const pad = 30
  const optional = new Set(['creative'])

  const nodes = PHASE_ORDER.map((p, i) => ({
    x: pad + i * (nodeW + gap),
    label: PHASE_LABEL[p],
    isOpt: optional.has(p),
  }))

  const width = pad * 2 + nodes.length * nodeW + (nodes.length - 1) * gap
  const height = 190
  const top = 52
  const parts: string[] = [`<rect width="${width}" height="${height}" fill="#16161d"/>`]

  parts.push(
    `<text x="${pad}" y="28" fill="#e5e7eb" font-family="ui-sans-serif,system-ui" font-size="15" font-weight="700">Alur kerja ${nodes.length} fase</text>`,
    `<text x="${width - pad}" y="28" fill="#6b7280" font-family="ui-sans-serif,system-ui" font-size="11" text-anchor="end">Creative = opsional (hanya bila proyek bergenre kreatif)</text>`,
  )

  nodes.forEach((n, i) => {
    const stroke = n.isOpt ? '#FBBF24' : '#4F9AD6'
    parts.push(
      `<rect x="${n.x}" y="${top}" width="${nodeW}" height="${nodeH}" rx="10" fill="#26262e" stroke="${stroke}" stroke-width="2"${n.isOpt ? ' stroke-dasharray="6 4"' : ''}/>`,
      `<text x="${n.x + nodeW / 2}" y="${top + 34}" fill="#e5e7eb" font-family="ui-sans-serif,system-ui" font-size="14" font-weight="600" text-anchor="middle">${n.label}</text>`,
      `<text x="${n.x + nodeW / 2}" y="${top + 54}" fill="#6b7280" font-family="ui-sans-serif,system-ui" font-size="10" text-anchor="middle">${n.isOpt ? 'opsional' : 'wajib'}</text>`,
    )
    if (i < nodes.length - 1) {
      const ax = n.x + nodeW + 4
      const ay = top + nodeH / 2
      parts.push(
        `<line x1="${ax}" y1="${ay}" x2="${ax + gap - 10}" y2="${ay}" stroke="#4b5563" stroke-width="2"/>`,
        `<path d="M ${ax + gap - 10} ${ay - 5} L ${ax + gap - 2} ${ay} L ${ax + gap - 10} ${ay + 5} Z" fill="#4b5563"/>`,
      )
    }
  })

  parts.push(
    `<rect x="${pad}" y="${top + nodeH + 28}" width="${width - pad * 2}" height="52" rx="8" fill="#1f2937"/>`,
    `<text x="${pad + 14}" y="${top + nodeH + 50}" fill="#d1d5db" font-family="ui-sans-serif,system-ui" font-size="11">Tiap fase: agent menulis file nyata → menjalankan programnya → membaca error asli → memperbaiki sendiri</text>`,
    `<text x="${pad + 14}" y="${top + nodeH + 68}" fill="#9ca3af" font-family="ui-sans-serif,system-ui" font-size="10">Revisi maks 2× per giliran · reproses maks 2× per task</text>`,
  )

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`
}

const files: Record<string, string> = {
  'agents-sprites.svg': renderSpriteSheet(),
  'office-map.svg': renderOfficeMap(),
  'workflow.svg': renderWorkflow(),
}

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT_DIR, name), content, 'utf8')
  console.log(`  ✓ docs/images/${name} (${content.length} B)`)
}
