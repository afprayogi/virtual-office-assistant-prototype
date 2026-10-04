/**
 * Uji lapisan filesystem workspace — tempat agent bekerja sungguhan.
 * - Path traversal harus DITOLAK (sandbox), bukan "dibersihkan".
 * - Tulis → baca → list harus konsisten.
 * - clearWorkspace harus mengosongkan tanpa menghapus foldernya.
 *
 * Jalankan: npx tsx ./tests/workspace.test.ts
 */
import {
  WORKSPACE_DIR,
  clearWorkspace,
  createProject,
  ensureWorkspace,
  listWorkspace,
  readWorkspaceFile,
  readWorkspaceFiles,
  resolveSafe,
  setActiveTask,
  writeWorkspaceFile,
  workspaceContext,
} from '../lib/orchestrator/workspace'
import path from 'node:path'

let pass = 0
let fail = 0
const check = (ok: boolean, label: string, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
  ok ? pass++ : fail++
}

console.log('1) Sandbox: traversal ditolak')
const attacks = [
  '../../../etc/passwd',
  '..\\..\\secrets.txt',
  '/etc/passwd',
  'C:\\Windows\\System32\\config',
  'docs/../../../outside.md',
]
for (const a of attacks) {
  check(resolveSafe(a) === null, `ditolak: ${a}`, String(resolveSafe(a)))
}

console.log('\n2) Path sah tetap diterima')
// Pakai proyek sendiri: beberapa test boleh berjalan bersamaan di workspace
// yang sama, jadi jangan saling mengambil alih folder proyek aktif.
createProject('Test Sandbox Isolated')
for (const good of ['docs/architecture.md', 'src/index.ts', 'preview/app.html', 'a.md']) {
  const r = resolveSafe(good)
  check(r !== null && r.startsWith(path.resolve(WORKSPACE_DIR)), `diterima: ${good}`, r ?? 'null')
}

console.log('3) Tulis → baca → list')
ensureWorkspace()
// Proyek sendiri supaya test ini tidak berebut folder dengan test lain
// yang mungkin jalan bersamaan di workspace yang sama.
createProject('Test Workspace Isolated')
// Bersihkan pointer task supaya operasi mendarat di folder proyek.
setActiveTask(null)
clearWorkspace()
check(writeWorkspaceFile('docs/user-stories.md', '# Stories\nIsi dokumen.'), 'tulis docs/user-stories.md')
check(writeWorkspaceFile('src/index.ts', 'export const x = 1'), 'tulis src/index.ts')
check(readWorkspaceFile('docs/user-stories.md')?.includes('# Stories') === true, 'baca kembali isi benar')
check(readWorkspaceFile('tidak-ada.md') === null, 'file tak ada -> null')
const tree = listWorkspace()
check(tree.length === 2, 'workspace berisi 2 file', `dapat ${tree.length}`)
check(tree.some((f) => f.path === 'src/index.ts'), 'path nested pakai separator slash')
check(tree.every((f) => f.size > 0), 'ukuran file tercatat')

console.log('\n4) Tulis menimpa (revisi), bukan menumpuk')
writeWorkspaceFile('src/index.ts', 'export const x = 2 // revisi')
check(listWorkspace().length === 2, 'jumlah file tetap 2', String(listWorkspace().length))
check(readWorkspaceFile('src/index.ts')?.includes('revisi') === true, 'isi terbaru menimpa yang lama')

console.log('\n5) Penolakan traversal saat TULIS benar-benar ditolak')
const before = listWorkspace().length
const wrote = writeWorkspaceFile('../escape.txt', 'jangan sampai keluar')
check(wrote === false, 'tulis di luar sandbox ditolak')
check(listWorkspace().length === before, 'workspace tidak bertambah')

console.log('\n6) Baca banyak file sekaligus')
const batch = readWorkspaceFiles(['docs/user-stories.md', 'src/index.ts', 'hilang.md'])
check(batch.length === 2, '2 file terbaca (yang hilang dilewati)', `dapat ${batch.length}`)

console.log('\n7) Konteks workspace untuk prompt')
const ctx = workspaceContext()
check(ctx.includes('docs/user-stories.md'), 'konteks menyebut path file')
check(ctx.includes('src/index.ts'), 'konteks menyebut file kedua')

console.log('\n8) clearWorkspace mengosongkan tapi menyimpan folder')
const removed = clearWorkspace()
check(removed === 2, '2 entri dihapus', String(removed))
check(listWorkspace().length === 0, 'workspace kosong')
check(readWorkspaceFile('src/index.ts') === null, 'file lama tak terbaca')

console.log(`\nHASIL: ${pass} lulus, ${fail} gagal`)
if (fail > 0) process.exit(1)