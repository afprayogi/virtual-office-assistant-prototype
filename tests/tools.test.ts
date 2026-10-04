/**
 * tests/tools.test.ts
 * ---------------------------------------------------------------------------
 * Bukti bahwa tool agent benar-benar bekerja — dipanggil langsung, tanpa LLM.
 *
 * Ini menguji lapisan eksekusi tool: daftar file, baca file, jalankan program,
 * dan pasang library. Yang diuji adalah "apakah agent BISA Graduate
 * menjalankan program", bukan apakah model memilih memanggilnya.
 * ---------------------------------------------------------------------------
 */
import { executeTool, TOOL_SPECS } from '../lib/orchestrator/tools'
import {
  clearWorkspace,
  createProject,
  editWorkspaceFile,
  setActiveTask,
} from '../lib/orchestrator/workspace'

let pass = 0
let fail = 0
const check = (ok: boolean, label: string, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
  ok ? pass++ : fail++
}

const call = (name: string, args: Record<string, unknown> = {}) =>
  executeTool({ id: `t_${name}`, name, args }, 'uji')

async function main() {
  console.log('1) Spec tool valid')
  check(TOOL_SPECS.length === 8, '8 tool terdaftar', String(TOOL_SPECS.length))
  check(
    TOOL_SPECS.every((t) => t.type === 'function' && t.function.name && t.function.description),
    'semua tool punya nama + deskripsi',
  )
  const names = TOOL_SPECS.map((t) => t.function.name).join(', ')
  check(names.includes('run_program'), 'run_program terdaftar', names)

  console.log('\n2) Tool tak dikenal ditolak')
  const bad = await call('hapus_semua_file')
  check(!bad.ok, 'tool di luar daftar ditolak', bad.content.slice(0, 50))

  console.log('\n3) list_files melihat hasil kerja rekanan')
  clearWorkspace()
  createProject('uji-tools')
  setActiveTask('uji')
  editWorkspaceFile('catatan.md', '# Catatan tim\n', 'create')
  const ls = await call('list_files')
  check(ls.ok && ls.content.includes('catatan.md'), 'file rekanan terlihat', ls.content.split('\n')[0])

  console.log('\n4) read_file membaca isi sebenarnya')
  const rd = await call('read_file', { path: 'catatan.md' })
  check(rd.ok && rd.content.includes('Catatan tim'), 'isi file terbaca', rd.content.split('\n')[1] ?? '')
  const missing = await call('read_file', { path: 'tidak-ada.md' })
  check(!missing.ok, 'file tidak ada -> error jelas', missing.content.slice(0, 50))

  console.log('\n5) read_file menolak keluar dari sandbox')
  const escape = await call('read_file', { path: '../../../../.env.local' })
  check(!escape.ok, 'path traversal ditolak', escape.content.slice(0, 50))

  console.log('\n6) run_program menjalankan program sungguhan')
  editWorkspaceFile('halo.py', 'print("halo dari tool")\n', 'overwrite')
  const run = await call('run_program', { path: 'halo.py' })
  check(run.ok, 'program berjalan', run.content.split('\n')[0] ?? '')
  check(run.content.includes('halo dari tool'), 'stdout dikembalikan ke agent', run.content.split('\n')[1] ?? '')

  console.log('\n7) run_program mengembalikan error yang bisa diperbaiki')
  editWorkspaceFile('rusak.py', 'raise ValueError("kok error")\n', 'overwrite')
  const err = await call('run_program', { path: 'rusak.py' })
  check(!err.ok, 'program gagal terdeteksi')
  check(err.content.includes('ValueError'), 'stderr apa adanya sampai ke agent', err.content.split('\n').pop() ?? '')
  check(
    err.content.includes('Perbaiki kodenya'),
    'agent diarahkan memperbaiki, bukan menyerah',
  )

  console.log('\n8) Parameter kosong ditolak dengan pesan jelas')
  const noPath = await call('run_program', {})
  check(!noPath.ok && noPath.content.includes('wajib diisi'), 'path kosong ditolak', noPath.content)

  console.log('\n9) CRUD: write_file -> edit_file -> read_file -> delete_file')
  const created = await call('write_file', { path: 'src/hasil.ts', content: 'export const a = 1\n' })
  check(created.ok, 'write_file membuat file baru', created.content)
  check(
    (await call('read_file', { path: 'src/hasil.ts' })).content.includes('export const a = 1'),
    'file bisa dibaca kembali',
  )

  // create SEKALI LAGI harus gagal — mencegah penimpaan diam-diam.
  const dup = await call('write_file', { path: 'src/hasil.ts', content: 'lain\n' })
  check(!dup.ok, 'write_file tidak menimpa file yang ada', dup.content.slice(0, 60))

  const edited = await call('edit_file', { path: 'src/hasil.ts', content: 'export const a = 2\n' })
  check(edited.ok, 'edit_file menimpa isi', edited.content)
  check(
    (await call('read_file', { path: 'src/hasil.ts' })).content.includes('const a = 2'),
    'isi benar-benar berubah',
  )

  const appended = await call('edit_file', {
    path: 'src/hasil.ts',
    content: '// baris tambahan\n',
    mode: 'append',
  })
  check(
    appended.ok &&
      (await call('read_file', { path: 'src/hasil.ts' })).content.includes('baris tambahan'),
    'mode append menambah di akhir',
  )

  const editedMissing = await call('edit_file', { path: 'tidak-ada.ts', content: 'x' })
  check(!editedMissing.ok, 'edit_file pada file hilang ditolak', editedMissing.content.slice(0, 60))

  const deleted = await call('delete_file', { path: 'src/hasil.ts' })
  check(deleted.ok, 'delete_file menghapus file', deleted.content)
  check(
    (await call('read_file', { path: 'src/hasil.ts' })).content === null ||
      (await call('read_file', { path: 'src/hasil.ts' })).content.includes('tidak ditemukan'),
    'file benar-benar hilang',
  )

  console.log('\n10) CRUD tetap di dalam sandbox')
  const escapeWrite = await call('write_file', { path: '../../../../escaped.txt', content: 'x' })
  check(!escapeWrite.ok, 'write_file menolak path keluar sandbox', escapeWrite.content.slice(0, 60))
  const escapeDelete = await call('delete_file', { path: '../../../../.env.local' })
  check(!escapeDelete.ok, 'delete_file menolak path keluar sandbox', escapeDelete.content.slice(0, 60))

  console.log('\n11) list_tasks melihat folder tiap task')
  const tasks = await call('list_tasks')
  check(tasks.ok, 'list_tasks berhasil', tasks.content.split('\n')[0])
  check(tasks.content.includes('uji'), 'folder task aktif terlihat', tasks.content.split('\n')[0])
  check(tasks.content.includes('catatan.md'), 'file di dalam folder task terdaftar')

  console.log('\n12) Install framework NODE (npm) — nyata, bukan mock')
  // Ini yang tadinya mustahil: `spawn('npm', {shell:false})` ENOENT dan
  // `npm.cmd` EINVAL. Sekarang npm dijalankan lewat entry-point JS-nya.
  const npmPkg = await call('install_library', { package: 'is-odd', ecosystem: 'node' })
  check(npmPkg.ok, 'framework npm terpasang', npmPkg.content.split('\n')[0])
  check(npmPkg.content.includes('node'), 'melaporkan ecosystem yang dipakai')

  // Bukti nyata: program JS yang mengimpor paket itu harus jalan.
  await call('write_file', {
    path: 'cek-npm.mjs',
    content:
      "import isOdd from 'is-odd'\n" +
      "console.log('IS_ODD_7:', isOdd(7))\n" +
      "console.log('IS_ODD_4:', isOdd(4))\n",
  })
  const npmRun = await call('run_program', { path: 'cek-npm.mjs' })
  check(
    npmRun.ok && npmRun.content.includes('IS_ODD_7: true'),
    'program JS mengimpor paket npm dan jalan',
    (npmRun.content.match(/IS_ODD_\d: \w+.*/) ?? [''])[0],
  )
  await call('delete_file', { path: 'cek-npm.mjs' })

  console.log('\n13) install_library menebak ecosystem dari nama paket')
  const scoped = await call('install_library', { package: '@types/node' })
  check(scoped.ok, 'scope @types/node dikenali sebagai paket npm', scoped.content.split('\n')[0])

  console.log('\n14) Sanitizer paket tetap menolak yang berbahaya')
  const badPkgs = [
    ['--index-url=http://evil.test', 'flag pip tersembunyi'],
    ['../../paket Jahat', 'path traversal ke luar sandbox'],
    ['paket; rm -rf /', 'operator shell'],
    ['paket && whoami', 'operator shell lain'],
  ]
  for (const [pkg, why] of badPkgs) {
    const r = await call('install_library', { package: pkg })
    check(!r.ok, `ditolak: ${why}`, pkg)
  }

  setActiveTask(null)
  console.log(`\nHASIL: ${pass} lulus, ${fail} gagal`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error('GAGAL:', e)
  process.exit(1)
})