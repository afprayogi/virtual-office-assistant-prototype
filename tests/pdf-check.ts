/**
 * Bukti: file PDF yang dihasilkan benar-benar valid dan bisa dibuka.
 * Jalankan: npx tsx ./tests/pdf-check.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { markdownToPdf } from '../lib/orchestrator/pdf'
import { WORKSPACE_DIR } from '../lib/orchestrator/workspace'

const md = `# Laporan Uji

Dokumen ini dihasilkan agent ke Workspace.

- Butir satu
- Butir dua

| Kolom A | Kolom B |
|---|---|
| nilai | 42 |
`

const pdf = markdownToPdf(md, 'Laporan Uji')
const out = path.join(WORKSPACE_DIR, 'sample.pdf')
fs.mkdirSync(WORKSPACE_DIR, { recursive: true })
fs.writeFileSync(out, pdf)

const s = pdf.toString('latin1')
const checks: [string, boolean][] = [
  ['header %PDF-1.4', s.startsWith('%PDF-1.4')],
  ['ada %%EOF', s.trimEnd().endsWith('%%EOF')],
  ['ada trailer', s.includes('trailer')],
  ['ada startxref', s.includes('startxref')],
  ['ada xref', s.includes('xref')],
  ['ada Catalog', s.includes('/Type /Catalog')],
  ['ada Pages', s.includes('/Type /Pages')],
  ['ada Font', s.includes('/BaseFont /Helvetica')],
  ['ada MediaBox A4', s.includes('/MediaBox [0 0 595.28 841.89]')],
  ['isi teks masuk', s.includes('Laporan Uji')],
  ['ukuran > 500 B', pdf.length > 500],
  ['file tersimpan', fs.existsSync(out)],
]

let fail = 0
for (const [label, ok] of checks) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
  if (!ok) fail++
}
console.log(`\nfile  : ${out}`)
console.log(`bytes : ${pdf.length}`)
console.log(`\nHASIL: ${checks.length - fail} lulus, ${fail} gagal`)
if (fail > 0) process.exit(1)