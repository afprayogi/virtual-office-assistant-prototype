/**
 * tools/readme/assets-workspace.ts
 * ---------------------------------------------------------------------------
 * Mockup panel Workspace (ui-workspace.svg) — cermin dari
 * components/chat/ArtifactViewer.tsx: daftar file hasil kerja + preview kode
 * dengan badge hasil review.
 * ---------------------------------------------------------------------------
 */
import { C, SANS, pill } from './assets-dashboard'
import { rect, svg, text } from './svg-kit'

interface Tok { t: string; c: string }
/** Baris kode: indentasi + daftar token berwarna. */
type CodeLine = Tok[]

const K = '#A626A4' // keyword
const S = '#50A14F' // string
const F = '#2F6FB0' // function
const N = '#B76B01' // number/const
const Cm = '#9AA0A6' // comment
const Pu = '#6E6A65' // plain
const T = '#3A3733'

/** Potongan kode nyata dari salah satu deliverable. */
const CODE: CodeLine[] = [
  [{ t: '// store.js — catatan dengan pencarian & tag', c: Cm }],
  [{ t: 'export ', c: K }, { t: 'class ', c: K }, { t: 'NoteStore', c: F }, { t: ' {', c: T }],
  [{ t: '  #notes = ', c: T }, { t: 'new ', c: K }, { t: 'Map', c: F }, { t: '()', c: T }],
  [{ t: '', c: T }],
  [{ t: '  add', c: F }, { t: '(text, tags = []) {', c: T }],
  [{ t: '    const ', c: K }, { t: 'id = crypto.', c: T }, { t: 'randomUUID', c: F }, { t: '()', c: T }],
  [{ t: '    this.#notes.', c: T }, { t: 'set', c: F }, { t: '(id, { text, tags, at: ', c: T }, { t: 'Date', c: F }, { t: '.now() })', c: T }],
  [{ t: '    return ', c: K }, { t: 'id', c: N }],
  [{ t: '  }', c: T }],
  [{ t: '', c: T }],
  [{ t: '  search', c: F }, { t: '(q) {', c: T }],
  [{ t: '    const ', c: K }, { t: 'k = q.', c: T }, { t: 'toLowerCase', c: F }, { t: '()', c: T }],
  [{ t: '    return ', c: K }, { t: '[...this.#notes.', c: T }, { t: 'values', c: F }, { t: '()].', c: T }, { t: 'filter', c: F }, { t: '(n =>', c: T }],
  [{ t: '      n.text.', c: T }, { t: 'toLowerCase', c: F }, { t: '().', c: T }, { t: 'includes', c: F }, { t: '(k) ||', c: T }],
  [{ t: '      n.tags.', c: T }, { t: 'some', c: F }, { t: '(t => t.', c: T }, { t: 'includes', c: F }, { t: '(k)))', c: T }],
  [{ t: '  }', c: T }],
  [{ t: '}', c: T }],
]

const FILES: { icon: string; name: string; kind: string; color: string }[] = [
  { icon: '📝', name: 'docs/vision.md', kind: 'Dokumen', color: '#8B7FD4' },
  { icon: '💻', name: 'src/store.js', kind: 'Program', color: '#4F9AD6' },
  { icon: '🌐', name: 'preview/index.html', kind: 'Program', color: '#1F9D5A' },
]

/** Mockup panel Workspace. */
export function renderWorkspace(): string {
  const W = 920
  const H = 560
  const p: string[] = []
  p.push(rect(0, 0, W, H, C.card, { rx: 14, stroke: C.border, sw: 1.5 }))

  /* ------------------------------ daftar file ----------------------------- */
  p.push(rect(0, 0, 300, H, '#FDFCFB'))
  p.push(text(20, 34, 'Workspace', { size: 14, weight: 700, fill: C.fg }))
  p.push(pill(20 + 92, 20, '3 file', { fg: C.mutedFg, bg: C.muted }).svg)
  p.push(rect(0, 56, 300, 1, C.border))
  let fy = 74
  FILES.forEach((f, i) => {
    const active = i === 1
    if (active) p.push(rect(8, fy - 6, 284, 46, C.claudeSoft, { rx: 8 }))
    p.push(text(20, fy + 14, f.icon, { size: 14, fill: C.fg }))
    p.push(text(44, fy + 10, f.name, { size: 11.5, weight: 600, fill: active ? C.claude : C.fg, mono: true }))
    p.push(text(44, fy + 26, `${f.kind} · oleh Deni`, { size: 9.5, fill: C.mutedFg }))
    fy += 56
  })
  p.push(rect(300, 0, 1, H, C.border))

  /* -------------------------------- preview ------------------------------- */
  const px = 320
  p.push(text(px, 34, 'src/store.js', { size: 12.5, weight: 700, fill: C.fg, mono: true }))
  p.push(text(px, 52, 'Deni · User story & acceptance criteria · 1.8k karakter', { size: 10, fill: C.mutedFg }))
  // Badge review.
  p.push(rect(W - 300, 22, 116, 22, C.greenBg, { rx: 11 }))
  p.push(text(W - 242, 37, '✓ Sesuai · 92%', { size: 10, weight: 700, fill: C.green, anchor: 'middle' }))
  // Tombol revisi + copy.
  p.push(rect(W - 176, 22, 92, 22, C.card, { rx: 11, stroke: C.border, sw: 1 }))
  p.push(text(W - 130, 37, '↺ Minta revisi', { size: 9.5, weight: 600, fill: C.fg, anchor: 'middle' }))
  p.push(rect(360, 66, W - 380, H - 86, '#FBFBFA', { rx: 10, stroke: C.border, sw: 1 }))

  // Isi kode.
  let ly = 92
  CODE.forEach((line, i) => {
    p.push(text(374, ly, String(i + 1).padStart(2, ' '), { size: 10.5, fill: '#C4BFB8', anchor: 'end', mono: true }))
    let tx = 392
    for (const tok of line) {
      p.push(text(tx, ly, tok.t, { size: 11, fill: tok.c, mono: true }))
      tx += tok.t.length * 6.35
    }
    ly += 22
  })
  return svg(W, H, p.join(''), `font-family="${SANS}"`)
}
