/**
 * tools/readme/assets-dashboard.ts
 * ---------------------------------------------------------------------------
 * Mockup antarmuka utama (ui-dashboard.svg). Bukan tangkapan layar — semua
 * elemen digambar dari struktur nyata OfficeDashboard.tsx: header, sidebar
 * Agent Roster, kanvas kantor, panel chat, WorkflowBar, dan Terminal.
 * ---------------------------------------------------------------------------
 */
import { officeScenery } from './office-scene'
import { DEFAULT_AGENTS, PHASE_LABEL, PHASE_ORDER, rect, svg, text } from './svg-kit'
import { tasksForPhase } from '../../lib/orchestrator/taskRegistry'

/* -------------------------------- palet UI -------------------------------- */
const C = {
  bg: '#F8F7F5',
  card: '#FFFFFF',
  border: '#E5E1DC',
  muted: '#F2F0ED',
  mutedFg: '#6E6A65',
  fg: '#232020',
  claude: '#D97757',
  claudeSoft: '#F6E4DC',
  green: '#1F9D5A',
  greenBg: '#E6F4EC',
  amber: '#B7791F',
  amberBg: '#FBF1DF',
  sky: '#2A7BB5',
  skyBg: '#E4F0F8',
  term: '#0D0D10',
}

const SANS = 'ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif'
const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'

/** Badge/pill kecil; mengembalikan SVG + lebar supaya bisa dirapikan. */
function pill(
  x: number, y: number, label: string,
  o: { fg?: string; bg?: string; border?: string; size?: number; h?: number; dot?: string; mono?: boolean } = {},
): { svg: string; w: number } {
  const size = o.size ?? 10.5
  const h = o.h ?? 20
  const padX = 8
  const w = Math.round(label.length * size * 0.58) + padX * 2 + (o.dot ? 10 : 0)
  const body =
    rect(x, y, w, h, o.bg ?? C.muted, { rx: h / 2, stroke: o.border, sw: 1 }) +
    (o.dot ? `<circle cx="${x + padX + 1}" cy="${y + h / 2}" r="2.6" fill="${o.dot}"/>` : '') +
    text(x + padX + (o.dot ? 10 : 0), y + h / 2 + size * 0.36, label, {
      size, weight: 600, fill: o.fg ?? C.mutedFg, mono: o.mono,
    })
  return { svg: body, w }
}

/** Avatar bulat berisi inisial agent. */
function avatar(x: number, y: number, d: number, color: string, initial: string, fs: number): string {
  return (
    `<circle cx="${x}" cy="${y}" r="${d / 2}" fill="${color}22" stroke="${color}" stroke-width="2"/>` +
    text(x, y + fs * 0.36, initial, { size: fs, weight: 700, fill: color, anchor: 'middle' })
  )
}

export { C, SANS, MONO, pill, avatar }

/* ========================================================================== */
/*  PANEL                                                                     */
/* ========================================================================== */

/** Baris roster satu agent di sidebar kiri. */
function rosterRow(x: number, y: number, w: number, i: number): string {
  const a = DEFAULT_AGENTS[i]
  const status = i === 2 ? ['Typing', C.green] : i === 3 ? ['Thinking', '#7C6BD4'] : ['Idle', C.mutedFg]
  return (
    rect(x, y, w, 42, 'transparent') +
    avatar(x + 22, y + 21, 24, a.color, a.name[0], 11) +
    text(x + 42, y + 17, a.name, { size: 12.5, weight: 600, fill: C.fg }) +
    text(x + 42, y + 31, a.role.length > 18 ? a.role.slice(0, 17) + '…' : a.role, { size: 10, fill: C.mutedFg }) +
    text(x + w - 12, y + 17, status[0], { size: 9.5, weight: 600, fill: status[1], anchor: 'end' }) +
    text(x + w - 12, y + 31, i < 4 ? `${120 + i * 40} tok` : '0 tok', { size: 9, fill: C.mutedFg, anchor: 'end', mono: true })
  )
}

/** Header aplikasi. */
function header(w: number): string {
  const p: string[] = []
  p.push(rect(0, 0, w, 52, C.card))
  p.push(rect(0, 51, w, 1, C.border))
  // Logo + judul.
  p.push(rect(16, 12, 28, 28, C.claudeSoft, { rx: 8 }))
  p.push(`<path d="M30 19 l3.2 6.6 6.8 1 -5 4.7 1.3 6.7 -6.3 -3.4 -6.3 3.4 1.3 -6.7 -5 -4.7 6.8 -1 Z" fill="${C.claude}"/>`)
  p.push(text(54, 26, 'Virtual Office', { size: 14.5, weight: 700, fill: C.fg }))
  p.push(text(54, 41, 'Multi-Agent Workspace · ChatDev workflow', { size: 10.5, fill: C.mutedFg }))
  // Badge kanan.
  let bx = w - 16
  const items: { label: string; fg: string; bg: string; border?: string; dot?: string }[] = [
    { label: 'Terhubung', fg: C.green, bg: C.greenBg, dot: C.green },
    { label: '12 agent aktif', fg: C.mutedFg, bg: C.card, border: C.border },
    { label: 'OmniRoute · rtk', fg: C.green, bg: C.greenBg, dot: C.green },
  ]
  for (const it of items) {
    const r = pill(0, 0, it.label, { fg: it.fg, bg: it.bg, border: it.border, dot: it.dot })
    bx -= r.w
    p.push(pill(bx, 16, it.label, { fg: it.fg, bg: it.bg, border: it.border, dot: it.dot }).svg)
    bx -= 8
  }
  return p.join('')
}

/** Sidebar kiri: Agent Roster. */
function sidebar(x: number, y: number, w: number, h: number): string {
  const p: string[] = []
  p.push(rect(x, y, w, h, C.card))
  p.push(rect(x + w - 1, y, 1, h, C.border))
  p.push(text(x + 14, y + 26, 'Agent Roster', { size: 13, weight: 700, fill: C.fg }))
  p.push(pill(x + w - 74, y + 12, '12 agent', { fg: C.mutedFg, bg: C.muted }).svg)
  p.push(rect(x, y + 40, w, 1, C.border))
  let ry = y + 46
  for (let i = 0; i < 12; i++) {
    p.push(rosterRow(x + 6, ry, w - 12, i))
    ry += 44
  }
  p.push(rect(x, y + h - 30, w, 1, C.border))
  p.push(text(x + 14, y + h - 12, 'Total tokens tim', { size: 10, fill: C.mutedFg }))
  p.push(text(x + w - 14, y + h - 12, '48.2k', { size: 10, fill: C.fg, anchor: 'end', mono: true }))
  return p.join('')
}


/** Panel tengah: kanvas kantor + kartu detail agent terpilih. */
function center(x: number, y: number, w: number, h: number): string {
  const p: string[] = []
  const s = 0.5
  const oW = 22 * 48 * s // 528
  const oH = 14 * 48 * s // 336
  const ox = x + (w - oW) / 2
  const oy = y + 6

  p.push(rect(x, y, w, h, C.bg))
  p.push('<defs><clipPath id="officeClip"><rect x="' + ox + '" y="' + oy + '" width="' + oW + '" height="' + oH + '" rx="10"/></clipPath></defs>')
  p.push(`<g clip-path="url(#officeClip)">${officeScenery(s)}</g>`)
  p.push(rect(ox, oy, oW, oH, 'none', { rx: 10, stroke: C.border, sw: 1.5 }))
  // Overlay hint.
  p.push(rect(ox + 8, oy + oH - 26, 208, 18, '#000000', { rx: 5, opacity: 0.5 }))
  p.push(text(ox + 16, oy + oH - 13, 'Klik avatar agent untuk melihat detail', { size: 9.5, fill: '#FFFFFFCC' }))

  // Kartu detail agent terpilih.
  const cx = x + 12
  const cy = oy + oH + 12
  const cw = w - 24
  const ch = 76
  p.push(rect(cx, cy, cw, ch, C.card, { rx: 10, stroke: C.border, sw: 1 }))
  const agent = DEFAULT_AGENTS[2] // Deni — Lead Developer
  p.push(avatar(cx + 26, cy + ch / 2, 30, agent.color, agent.name[0], 13))
  p.push(text(cx + 50, cy + 30, `${agent.name}`, { size: 13, weight: 700, fill: C.fg }))
  p.push(text(cx + 50, cy + 46, agent.role, { size: 10.5, fill: C.mutedFg }))
  const stats: [string, string][] = [
    ['Routing', 'auto/fast'],
    ['Model terpakai', 'gpt-4o-mini'],
    ['Latency', '812 ms'],
    ['Token dihemat', '~1.2k'],
    ['Requests', '6'],
    ['Status', 'typing'],
  ]
  let sx = cx + 150
  for (const [k, v] of stats) {
    p.push(text(sx, cy + 30, k, { size: 9, fill: C.mutedFg }))
    p.push(text(sx, cy + 46, v, { size: 10.5, fill: C.fg, mono: true }))
    sx += 92
  }
  // Tombol.
  p.push(rect(cx + cw - 104, cy + 24, 92, 28, C.card, { rx: 7, stroke: C.border, sw: 1 }))
  p.push(text(cx + cw - 58, cy + 42, 'Minta respon', { size: 10, weight: 600, fill: C.fg, anchor: 'middle' }))
  return p.join('')
}

/** Satu gelembung pesan chat. */
function chatMessage(
  x: number, y: number, w: number, sender: number, phase: string, lines: string[],
): string {
  const a = DEFAULT_AGENTS[sender]
  const p: string[] = []
  p.push(avatar(x + 18, y + 16, 26, a.color, a.name[0], 11))
  const r = pill(0, 0, phase, { fg: C.claude, bg: C.claudeSoft })
  p.push(text(x + 40, y + 14, a.name, { size: 12, weight: 700, fill: C.fg }))
  p.push(text(x + 40 + a.name.length * 7 + 8, y + 14, a.role, { size: 9.5, fill: C.mutedFg }))
  p.push(pill(x + w - r.w - 4, y + 3, phase, { fg: C.claude, bg: C.claudeSoft }).svg)
  let ly = y + 32
  for (const line of lines) {
    p.push(text(x + 40, ly, line, { size: 10.5, fill: '#3A3733' }))
    ly += 15
  }
  return p.join('')
}

/** Panel kanan: chat ala Claude Desktop. */
function chatPanel(x: number, y: number, w: number, h: number): string {
  const p: string[] = []
  p.push(rect(x, y, w, h, C.card))
  p.push(rect(x, y, 1, h, C.border))
  // Tab bar.
  p.push(text(x + 16, y + 26, 'Chat', { size: 12, weight: 700, fill: C.fg }))
  p.push(rect(x + 12, y + 34, 40, 2, C.claude, { rx: 1 }))
  p.push(text(x + 72, y + 26, 'Workspace', { size: 12, fill: C.mutedFg }))
  p.push(rect(x + 74, y + 16, 34, 15, C.claudeSoft, { rx: 7 }))
  p.push(text(x + 91, y + 27, '3', { size: 10, weight: 700, fill: C.claude, anchor: 'middle' }))
  p.push(text(x + w - 16, y + 26, '4 pesan', { size: 10, fill: C.mutedFg, anchor: 'end' }))
  p.push(rect(x, y + 40, w, 1, C.border))

  let my = y + 54
  my += 74
  p.push(chatMessage(x + 6, my, w - 12, 0, 'Requirement', [
    'Visi: aplikasi catatan pribadi yang cepat, offline-first,',
    'dan bisa dicari. 3 prioritas: kecepatan, pencarian, sinkron.',
  ]))
  my += 68
  p.push(chatMessage(x + 6, my, w - 12, 1, 'Requirement', [
    'User story + acceptance criteria siap. Scope: CRUD catatan,',
    'pencarian teks, dan tag. Tidak termasuk kolaborasi realtime.',
  ]))
  my += 64
  p.push(chatMessage(x + 6, my, w - 12, 2, 'Coding', [
    'src/store.js sudah jalan di Node 20 — 12 test lulus.',
    'Dependensi: fastify. Menjalankan programnya sekarang…',
  ]))
  my += 60
  p.push(rect(x + 40, my + 18, 150, 20, C.greenBg, { rx: 6 }))
  p.push(text(x + 48, my + 32, '✓ Program berjalan, 0 error', { size: 9.5, fill: C.green }))

  // Composer.
  const compY = y + h - 58
  p.push(rect(x, compY - 1, w, 1, C.border))
  p.push(rect(x + 12, compY + 10, w - 24, 38, C.card, { rx: 8, stroke: C.border, sw: 1 }))
  p.push(text(x + 24, compY + 33, 'Kirim arahan baru ke tim…', { size: 10.5, fill: '#A9A29B' }))
  p.push(`<path d="M ${x + w - 34} ${compY + 22} l10 7 -10 7 z" fill="${C.claude}"/>`)
  return p.join('')
}

export { center, chatPanel }


/** Panel bawah: WorkflowBar (fase + brief + kontrol + HITL). */
function workflowBar(x: number, y: number, w: number, h: number): string {
  const p: string[] = []
  p.push(rect(x, y, w, h, C.card))
  p.push(rect(x, y, w, 1, C.border))
  const cur = 2 // Creative sedang aktif
  let cx = x + 12
  PHASE_ORDER.forEach((ph, i) => {
    const state = i < cur ? 'done' : i === cur ? 'active' : 'pending'
    const count = tasksForPhase(ph).length
    const label = PHASE_LABEL[ph]
    const cw = 34 + label.length * 6.4 + 16
    if (i > 0) p.push(rect(cx - 12, y + 24, 12, 1.5, i <= cur ? C.claude : C.border))
    const bg = state === 'active' ? C.claudeSoft : 'transparent'
    p.push(rect(cx, y + 12, cw, 24, bg, { rx: 6 }))
    const icon = state === 'done' ? '✓' : state === 'active' ? '◐' : '○'
    const iconColor = state === 'done' ? C.green : state === 'active' ? C.claude : C.mutedFg
    p.push(text(cx + 10, y + 28, icon, { size: 12, weight: 700, fill: iconColor }))
    p.push(text(cx + 24, y + 28, label, { size: 11, weight: state === 'active' ? 700 : 500, fill: state === 'pending' ? C.mutedFg : C.fg }))
    p.push(rect(cx + cw - 22, y + 19, 16, 12, '#00000018', { rx: 3 }))
    p.push(text(cx + cw - 14, y + 28, String(count), { size: 9, fill: C.mutedFg, anchor: 'middle' }))
    cx += cw + 12
  })
  // Badge kanan.
  let bx = x + w - 12
  const rb = pill(0, 0, 'Berjalan', { fg: C.sky, bg: C.skyBg })
  bx -= rb.w; p.push(pill(bx, y + 14, 'Berjalan', { fg: C.sky, bg: C.skyBg }).svg); bx -= 8
  const rs = pill(0, 0, 'Socket aktif', { fg: C.green, bg: C.greenBg, dot: C.green })
  bx -= rs.w; p.push(pill(bx, y + 14, 'Socket aktif', { fg: C.green, bg: C.greenBg, dot: C.green }).svg); bx -= 8
  const rp = pill(0, 0, '📄 4  ·  💻 6', { fg: C.green, bg: C.greenBg })
  bx -= rp.w; p.push(pill(bx, y + 14, '📄 4  ·  💻 6', { fg: C.green, bg: C.greenBg }).svg)

  // Kontrol.
  const ty = y + 48
  const pw = 120
  p.push(rect(x + 12, ty, w - 24 - pw - 176 - 24, 140, C.card, { rx: 8, stroke: C.border, sw: 1 }))
  p.push(text(x + 24, ty + 22, 'Buat aplikasi catatan pribadi dengan pencarian', { size: 12, fill: C.fg }))
  p.push(text(x + 24, ty + 40, 'teks dan tag. Offline-first, cepat, sinkron opsional.', { size: 12, fill: C.fg }))
  // Tombol.
  const bxx = x + w - 12 - pw - 176 - 12
  p.push(rect(bxx, ty, pw, 30, C.claude, { rx: 7 }))
  p.push(text(bxx + pw / 2, ty + 20, '⟳  Jalan', { size: 11.5, weight: 700, fill: '#FFFFFF', anchor: 'middle' }))
  p.push(rect(bxx, ty + 38, pw, 28, C.card, { rx: 7, stroke: C.border, sw: 1 }))
  p.push(text(bxx + pw / 2, ty + 56, '▪  Interupsi', { size: 11, weight: 600, fill: C.fg, anchor: 'middle' }))
  p.push(rect(bxx, ty + 72, pw, 28, 'transparent', { rx: 7 }))
  p.push(text(bxx + pw / 2, ty + 90, '🗑  Bersihkan', { size: 11, weight: 600, fill: C.mutedFg, anchor: 'middle' }))
  // HITL.
  const hx = x + w - 12 - 160
  p.push(rect(hx, ty, 160, 100, C.claudeSoft, { rx: 8, stroke: '#D9775755', sw: 1 }))
  p.push(text(hx + 12, ty + 24, '✓ HITL aktif', { size: 11.5, weight: 700, fill: C.claude }))
  p.push(text(hx + 12, ty + 44, 'Anda menyetujui tiap fase', { size: 10, fill: C.mutedFg }))
  p.push(text(hx + 12, ty + 58, 'sebelum lanjut.', { size: 10, fill: C.mutedFg }))
  return p.join('')
}

/** Panel bawah-kanan: terminal log real-time. */
function terminal(x: number, y: number, w: number, h: number): string {
  const p: string[] = []
  p.push(rect(x, y, w, h, C.term))
  p.push(text(x + 14, y + 24, 'Terminal', { size: 12, weight: 700, fill: '#FFFFFFE0' }))
  p.push(rect(x + 74, y + 13, 52, 15, '#FFFFFF14', { rx: 7 }))
  p.push(text(x + 100, y + 24, '38 baris', { size: 9, fill: '#FFFFFF99', anchor: 'middle' }))
  p.push(text(x + w - 20, y + 24, '🗑', { size: 11, fill: '#FFFFFF66', anchor: 'middle' }))
  p.push(rect(x, y + 36, w, 1, '#FFFFFF1A'))
  const logs: [string, string, string, string][] = [
    ['09:14:02', 'INF', 'engine', 'fase=requirement task=req-vision owner=CEO'],
    ['09:14:05', 'OK ', 'gateway', 'POST /chat/completions 200 (842ms, compress=rtk)'],
    ['09:14:06', 'INF', 'tools', 'write_file docs/vision.md (1.9 KB)'],
    ['09:14:09', 'OK ', 'runner', 'node src/store.js → exit 0, 12 test lulus'],
    ['09:14:11', 'WRN', 'runner', 'undefined is not a function → retry 1/2'],
    ['09:14:13', 'OK ', 'runner', 'node src/store.js → exit 0 (fixed)'],
    ['09:14:14', 'INF', 'deps', 'npm install fastify (venv=project)'],
    ['09:14:18', 'OK ', 'engine', 'task=code-api selesai, artifact=code'],
  ]
  const color: Record<string, string> = { INF: '#7CC5F0', 'OK ': '#6EE7A8', WRN: '#F2C879', ERR: '#F29B9B' }
  let ly = y + 54
  for (const [t, lvl, src, msg] of logs) {
    p.push(text(x + 12, ly, t, { size: 9.5, fill: '#FFFFFF4D', mono: true }))
    p.push(text(x + 64, ly, lvl, { size: 9.5, weight: 700, fill: color[lvl], mono: true }))
    p.push(text(x + 90, ly, `[${src}]`, { size: 9.5, fill: '#FFFFFF66', mono: true }))
    p.push(text(x + 148, ly, msg, { size: 9.5, fill: '#FFFFFFBF', mono: true }))
    ly += 19
  }
  return p.join('')
}

/** Susun seluruh dashboard menjadi satu SVG. */
export function renderDashboard(): string {
  const W = 1440
  const H = 900
  const p: string[] = []
  p.push(rect(0, 0, W, H, C.bg, { rx: 14 }))
  p.push(header(W))
  const mainY = 52
  const mainH = 638
  p.push(sidebar(0, mainY, 288, mainH))
  p.push(center(288, mainY, 732, mainH))
  p.push(chatPanel(1020, mainY, 420, mainH))
  const botY = 690
  p.push(workflowBar(0, botY, 1040, 210))
  p.push(terminal(1040, botY, 400, 210))
  return svg(W, H, p.join(''))
}

