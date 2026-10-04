/**
 * tools/readme/assets-intro.ts
 * ---------------------------------------------------------------------------
 * Banner judul (hero.svg) + diagram arsitektur (architecture.svg).
 * ---------------------------------------------------------------------------
 */
import {
  DEFAULT_AGENTS, agentSprite, hexPalette, rect, svg, text, spritePath, tint,
} from './svg-kit'

/** Banner judul dengan barisan 12 sprite agent. */
export function renderHero(): string {
  const W = 1280
  const H = 380
  const parts: string[] = []

  // Latar bergradasi + aksen hangat.
  parts.push(
    '<defs>' +
      '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="#1d1c24"/><stop offset="55%" stop-color="#141319"/>' +
      '<stop offset="100%" stop-color="#0f0e13"/></linearGradient>' +
      '<radialGradient id="glow" cx="0.5" cy="0.1" r="0.8">' +
      '<stop offset="0%" stop-color="#D97757" stop-opacity="0.22"/>' +
      '<stop offset="100%" stop-color="#D97757" stop-opacity="0"/></radialGradient>' +
    '</defs>',
  )
  parts.push(rect(0, 0, W, H, 'url(#bg)'))
  parts.push(rect(0, 0, W, H, 'url(#glow)'))
  parts.push(rect(0, 0, W, 6, '#D97757'))

  // Judul + subjudul.
  parts.push(text(W / 2, 96, 'AI Assistant Visual', { size: 56, weight: 800, fill: '#F5F3EF', anchor: 'middle', spacing: -1 }))
  parts.push(text(W / 2, 136, 'Kantor virtual 2D dengan 12 agen AI yang benar-benar mengerjakan tugas', {
    size: 19, fill: '#C7C0B8', anchor: 'middle',
  }))
  parts.push(text(W / 2, 164, 'agen menulis kode → menjalankannya → membaca error asli → memperbaiki sendiri', {
    size: 15, fill: '#8f877e', anchor: 'middle',
  }))

  // Baris pill teknologi.
  const pills = ['Next.js 14', 'TypeScript', 'LangGraph', 'OmniRoute Gateway', 'MIT']
  const pw = 150
  const gap = 12
  const totalW = pills.length * pw + (pills.length - 1) * gap
  let px = (W - totalW) / 2
  for (const p of pills) {
    parts.push(rect(px, 184, pw, 28, '#26252d', { rx: 14, stroke: '#39373f', sw: 1 }))
    parts.push(text(px + pw / 2, 202, p, { size: 12.5, weight: 600, fill: '#CFC8C0', anchor: 'middle' }))
    px += pw + gap
  }

  // Barisan 12 sprite.
  const sPx = 3
  const cellW = 16 * sPx
  const sGap = 44
  const rowW = DEFAULT_AGENTS.length * cellW + (DEFAULT_AGENTS.length - 1) * sGap
  const startX = (W - rowW) / 2
  const baseY = 250
  DEFAULT_AGENTS.forEach((agent, i) => {
    const x = startX + i * (cellW + sGap)
    parts.push(rect(x - 6, baseY - 8, cellW + 12, 96, '#1b1a21', { rx: 8 }))
    parts.push(spritePath(agentSprite(agent, 'stand'), hexPalette(agent), sPx, x, baseY))
    parts.push(text(x + cellW / 2, baseY + 108, agent.name, {
      size: 12, weight: 700, fill: agent.color, anchor: 'middle',
    }))
    parts.push(text(x + cellW / 2, baseY + 123, agent.role.length > 16 ? agent.role.slice(0, 15) + '…' : agent.role, {
      size: 9, fill: '#7d766e', anchor: 'middle',
    }))
  })

  return svg(W, H, parts.join(''))
}

/** Kotak berlabel untuk diagram arsitektur. */
function box(x: number, y: number, w: number, h: number, title: string, sub: string, accent: string): string {
  return (
    rect(x, y, w, h, '#1c1b23', { rx: 10, stroke: accent, sw: 2 }) +
    rect(x, y, 5, h, accent, { rx: 2 }) +
    text(x + 18, y + (sub ? h / 2 - 3 : h / 2 + 5), title, { size: 14, weight: 700, fill: '#EDE8E2' }) +
    (sub ? text(x + 18, y + h / 2 + 16, sub, { size: 11, fill: '#948C84' }) : '')
  )
}

/** Panah vertikal dari (cx, y) ke bawah sepanjang `len`. */
function arrowV(cx: number, y: number, len: number, color = '#4b5563'): string {
  return (
    `<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y + len - 7}" stroke="${color}" stroke-width="2"/>` +
    `<path d="M ${cx - 5} ${y + len - 8} L ${cx} ${y + len} L ${cx + 5} ${y + len - 8} Z" fill="${color}"/>`
  )
}

/** Diagram arsitektur berlapis. */
export function renderArchitecture(): string {
  const W = 1080
  const H = 560
  const p: string[] = []
  p.push(rect(0, 0, W, H, '#121118', { rx: 14 }))
  p.push(text(40, 42, 'Arsitektur — satu jalan keluar LLM', { size: 18, weight: 700, fill: '#EDE8E2' }))
  p.push(text(40, 64, 'Semua panggilan model melewati OmniRoute Gateway. Tidak ada koneksi langsung ke provider.', {
    size: 12, fill: '#8f877e',
  }))

  const cx = W / 2
  const colW = 700
  const colX = (W - colW) / 2
  const accentA = '#D97757'
  const accentB = '#4F9AD6'
  const accentC = '#8B7FD4'

  p.push(box(colX, 92, colW, 52, 'Browser', 'kanvas kantor 2D + panel chat ala Claude Desktop', accentB))
  p.push(arrowV(cx, 144, 40))
  p.push(box(colX, 184, colW, 52, 'Custom server', 'Express + Next.js + WebSocket (streaming per-token)', accentB))
  p.push(arrowV(cx, 236, 40))
  p.push(box(colX, 276, colW, 56, 'ChatDevEngine (LangGraph)', '6 fase · tool loop · review atasan→bawahan · retry maks 2×', accentA))

  // Tiga modul inti.
  const modY = 372
  const modH = 76
  const modW = 300
  const mGap = 40
  const mStart = (W - (3 * modW + 2 * mGap)) / 2
  const mods: [string, string][] = [
    ['workspace.ts', 'file sandbox + memori antar-task'],
    ['runner.ts', 'jalankan 7 bahasa + venv/npm'],
    ['tools.ts', 'CRUD file · install library'],
  ]
  mods.forEach(([t, s], i) => {
    const x = mStart + i * (modW + mGap)
    p.push(`<line x1="${cx}" y1="332" x2="${x + modW / 2}" y2="${modY}" stroke="#4b5563" stroke-width="2" stroke-dasharray="4 4"/>`)
    p.push(box(x, modY, modW, modH, t, s, accentC))
  })

  p.push(arrowV(cx, 448, 34))
  p.push(box(colX, 482, colW, 46, 'config/omniroute.ts', 'klien gateway + routing/compression', accentA))

  p.push(rect(180, 468, 720, 74, 'none', { rx: 12, stroke: '#D9775744', sw: 1, dash: '5 5' }))
  p.push(text(cx, 555, 'Aturan: tidak ada kode yang memanggil OpenAI / Anthropic / Gemini / Ollama secara langsung', {
    size: 11, fill: '#B0A8A0', anchor: 'middle',
  }))

  p.push(rect(W - 300, 22, 260, 48, tint('#4F9AD6', 0.05), { rx: 10, stroke: '#4F9AD655', sw: 1 }))
  p.push(text(W - 285, 42, '3 deliverable utama', { size: 11, fill: '#9AA0AA' }))
  p.push(text(W - 285, 60, 'Office · Chat · Workspace', { size: 13, weight: 700, fill: '#E5E7EB' }))

  return svg(W, H, p.join(''))
}

