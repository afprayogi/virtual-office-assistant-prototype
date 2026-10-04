/**
 * Uji folder per proyek + CRUD file agent.
 * - Tiap proyek harus dapat foldernya sendiri (tidak saling menimpa).
 * - create / edit / append / delete harus jalan.
 * - Path traversal tetap ditolak, termasuk antar proyek.
 *
 * Jalankan: npx tsx ./tests/project-crud.test.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  PROJECTS_DIR,
  createProject,
  deleteWorkspaceDir,
  deleteWorkspaceFile,
  editWorkspaceFile,
  getActiveProject,
  listWorkspace,
  listWorkspaceDirs,
  readWorkspaceFile,
  setActiveTask,
} from '../lib/orchestrator/workspace'

let pass = 0
let fail = 0
const check = (ok: boolean, label: string, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
  ok ? pass++ : fail++
}

function main() {
  // Pastikan tidak ada pointer task sisa run sebelumnya — kalau ada, semua
  // operasi akan mendarat di folder task dan bukan di folder proyek.
  setActiveTask(null)

  console.log('1) Tiap proyek dapat folder sendiri')
  const p1 = createProject('Aplikasi Catatan')
  const p2 = createProject('Website Jual Beli')
  check(p1.id !== p2.id, 'dua proyek punya id berbeda', `${p1.id} vs ${p2.id}`)
  check(p1.path !== p2.path, 'path berbeda', p1.path)
  check(fs.existsSync(path.join(PROJECTS_DIR, p1.id)), 'folder proyek 1 ada di disk')
  check(fs.existsSync(path.join(PROJECTS_DIR, p2.id)), 'folder proyek 2 ada di disk')
  check(getActiveProject()?.id === p2.id, 'proyek terakhir jadi aktif', String(getActiveProject()?.id))
  check(/^aplikasi-catatan-/.test(p1.id), 'slug dari nama proyek', p1.id)

  console.log('\n2) Proyek terisolasi satu sama lain')
  check(editWorkspaceFile('docs/a.md', 'isi dari proyek 2', 'create').ok, 'tulis di proyek aktif')
  check(readWorkspaceFile('docs/a.md') === 'isi dari proyek 2', 'terbaca di proyek aktif')
  // Beralih balik ke proyek 1.
  const back = createProject('Proyek Lama')
  check(getActiveProject()?.id === back.id, 'ganti proyek aktif')
  check(readWorkspaceFile('docs/a.md') === null, 'file proyek lain tidak bocor ke proyek baru')
  check(listWorkspace().length === 0, 'proyek baru masih kosong')

  console.log('\n3) Tambah file (create)')
  const c1 = editWorkspaceFile('src/app.ts', 'export const app = 1', 'create')
  check(c1.ok && c1.created === true, 'buat file baru', `${c1.bytes} B`)
  const c2 = editWorkspaceFile('src/app.ts', 'lain', 'create')
  check(!c2.ok, 'create gagal bila file sudah ada', c2.error)
  check(readWorkspaceFile('src/app.ts') === 'export const app = 1', 'isi tidak tertimpa create')

  console.log('\n4) Edit file (overwrite)')
  const e1 = editWorkspaceFile('src/app.ts', 'export const app = 2', 'overwrite')
  check(e1.ok && e1.created === false, 'edit file ada', `${e1.bytes} B`)
  check(readWorkspaceFile('src/app.ts') === 'export const app = 2', 'isi terganti')
  check(listWorkspace().length === 1, 'jumlah file tetap 1', String(listWorkspace().length))

  console.log('\n5) Tambah isi (append)')
  editWorkspaceFile('src/app.ts', '\nexport const extra = 3', 'append')
  const appended = readWorkspaceFile('src/app.ts') ?? ''
  check(appended.includes('app = 2') && appended.includes('extra = 3'), 'isi lama + baru menyatu')
  check(listWorkspace().length === 1, 'append tidak buat file baru', String(listWorkspace().length))

  console.log('\n6) Folder dibuat otomatis')
  editWorkspaceFile('docs/deep/nested/file.md', 'ok', 'create')
  check(fs.existsSync(path.join(PROJECTS_DIR, back.id, 'docs', 'deep', 'nested')), 'folder bertingkat dibuat')
  check(listWorkspaceDirs().includes('docs/deep'), 'folder terdaftar', listWorkspaceDirs().join(', '))

  console.log('\n7) Hapus file')
  const d1 = deleteWorkspaceFile('src/app.ts')
  check(d1.ok, 'hapus file ada', String(d1.bytes))
  check(readWorkspaceFile('src/app.ts') === null, 'file sudah hilang')
  check(!deleteWorkspaceFile('src/app.ts').ok, 'hapus dua kali -> gagal')
  check(listWorkspace().length === 1, 'tinggal 1 file', String(listWorkspace().length))

  console.log('\n8) Hapus folder')
  const dd = deleteWorkspaceDir('docs/deep', true)
  check(dd.ok, 'hapus folder bertingkat')
  check(!listWorkspaceDirs().includes('docs/deep'), 'folder tidak terdaftar lagi')
  check(!deleteWorkspaceDir('docs/deep', true).ok, 'hapus folder yang sudah hilang -> gagal')

  console.log('\n9) Sandbox: traversal tetap ditolak')
  check(!editWorkspaceFile('../escaped.txt', 'x', 'create').ok, 'tulis ../ ditolak')
  check(!editWorkspaceFile('/etc/passwd', 'x', 'create').ok, 'path absolut ditolak')
  check(!deleteWorkspaceFile('../../../rahasia.txt').ok, 'hapus traversal ditolak')
  check(!fs.existsSync(path.join(PROJECTS_DIR, back.id, '..', '..', 'escaped.txt')), 'tidak ada file di luar folder')
  check(!deleteWorkspaceDir('..', true).ok, 'hapus folder traversal ditolak')

  console.log('\n10) Folder proyek lama tidak dihapus saat proyek baru dibuat')
  check(fs.existsSync(path.join(PROJECTS_DIR, p1.id)), 'proyek 1 masih ada')
  check(fs.existsSync(path.join(PROJECTS_DIR, p2.id)), 'proyek 2 masih ada')

  console.log(`\nHASIL: ${pass} lulus, ${fail} gagal`)
  if (fail > 0) process.exit(1)
}

main()