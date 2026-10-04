// tools/inspect-sprites.mjs — cetak sprite pixel art sebagai teks di terminal
// supaya bentuknya bisa diperiksa tanpa membuka browser.
import { readFileSync } from 'node:fs'

const src = readFileSync('components/office/pixel-sprites.ts', 'utf8')

/** Warna ANSI 256 supaya simbol bisa dibedakan mata. */
const PAL = {
  S: '\x1b[38;5;223m', B: '\x1b[38;5;180m', H: '\x1b[38;5;238m',
  C: '\x1b[38;5;99m', c: '\x1b[38;5;63m', P: '\x1b[38;5;240m',
  K: '\x1b[38;5;235m', E: '\x1b[38;5;232m', M: '\x1b[38;5;167m',
  A: '\x1b[38;5;203m',
}
const R = '\x1b[0m'

const names = ['POSE_STAND', 'POSE_TYPE_A', 'POSE_TYPE_B', 'POSE_WAVE', 'POSE_SIT']

/**
 * Ambil isi grid sebuah sprite langsung dari sumber.
 * Sprite yang DIHITUNG (dari `.map()`) dihitung ulang di sini agar output
 * terminal persis sama dengan yang dirender canvas.
 */
function extract(name) {
  const decl = `export const ${name}: PixelSprite = `
  const i = src.indexOf(decl)
  if (i < 0) throw new Error(`sprite ${name} tidak ditemukan`)

  // Kasus turunan: "= POSE_X.map((row, i) => ...)".
  const after = src.slice(i + decl.length, i + decl.length + 40)
  if (/^POSE_\w+\.map/.test(after)) return null // dihitung terpisah

  const j = src.indexOf('\n]', i)
  const body = src.slice(i, j)
  return body.match(/'([^']*)'/g).map((s) => s.slice(1, -1))
}

const raw = Object.fromEntries(names.map((n) => [n, extract(n)]))

// Hitung ulang sprite turunan dengan aturan yang sama seperti di modul.
raw.POSE_TYPE_B = raw.POSE_TYPE_A.map((row, i) =>
  i === 16 || i === 17 ? row.slice(0, 3) + 'BBBBBBBBBB' + row.slice(13) : row,
)
raw.POSE_WALK_A = raw.POSE_STAND.map((row, i) =>
  i >= 23 ? row.slice(0, 5) + 'KK..' + row.slice(12) : row,
)
raw.POSE_WALK_B = raw.POSE_STAND.map((row, i) =>
  i >= 23 ? row.slice(0, 8) + '..KK' + row.slice(14) : row,
)

const grids = raw

console.log('Validasi ukuran grid:')
for (const n of names) {
  const g = grids[n]
  const bad = g.filter((r) => r.length !== 16)
  const flag = g.length !== 32 ? '  <-- HARUS 32 BARIS' : bad.length ? `  <-- PANJANG: ${bad.map((r) => r.length).join(',')}` : '  ok'
  console.log(`  ${n.padEnd(14)} ${g.length} baris${flag}`)
}

console.log('')
for (let y = 0; y < 32; y++) {
  const cells = names.map((n) => {
    const row = grids[n][y] ?? '................'
    return row
      .split('')
      .map((c) => (c === '.' ? ' ' : PAL[c] + c + R))
      .join('')
      .padEnd(16 * 9)
  })
  console.log(cells.join(' | '))
}
console.log('')
console.log(names.map((n) => n.padEnd(16)).join(' | '))