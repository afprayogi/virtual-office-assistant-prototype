/**
 * tests/deps.test.ts
 * ---------------------------------------------------------------------------
 * Bukti bahwa "pasang library -> jalankan program" benar-benar bekerja.
 *
 * Ini mengujikasus yang paling sering dikeluhkan: agent menulis kode yang
 * mengimpor paket, paketnya belum terpasang, lalu program mati dengan
 * ModuleNotFoundError. Test ini memakai paket NYATA dari PyPI.
 * ---------------------------------------------------------------------------
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  ensureVenv,
  hasVenv,
  installRequirements,
  projectPython,
  readRequirements,
  runFile,
} from '../lib/orchestrator/runner'
import {
  clearWorkspace,
  createProject,
  editWorkspaceFile,
  resolveSafe,
  setActiveTask,
} from '../lib/orchestrator/workspace'

let pass = 0
let fail = 0
const check = (ok: boolean, label: string, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
  ok ? pass++ : fail++
}

async function main() {
  console.log('1) Setup sandbox')
  clearWorkspace()
  createProject('uji-deps')
  setActiveTask('uji')
  const abs = resolveSafe('.') ?? '.'
  check(fs.existsSync(abs), 'folder task siap', path.basename(abs))
  check(!hasVenv(abs), 'belum ada venv di awal (kondisi bersih)')

  console.log('\n2) requirements.txt dibaca dengan benar')
  editWorkspaceFile(
    'requirements.txt',
    '# komentar harus diabaikan\n\nsix\n  python-dateutil \n',
    'overwrite',
  )
  const reqs = readRequirements(abs)
  check(reqs.length === 2, '2 paket terbaca, komentar & baris kosong dilewati', reqs.join(', '))

  console.log('\n3) venv dibuat')
  const venv = await ensureVenv(abs)
  check(venv.ok, 'venv berhasil dibuat', venv.stderr.split('\n')[0] ?? '')
  check(hasVenv(abs), '.venv terdeteksi')

  const py = projectPython(abs)
  check(py !== 'python' && fs.existsSync(py), 'interpreter menunjuk ke venv', path.basename(py))

  console.log('\n4) Install library NYATA dari internet')
  const deps = await installRequirements(abs)
  check(deps.failed.length === 0, 'semua library terpasang', deps.failed.map(f => f.name).join(', ') || 'ok')
  check(
    deps.installed.some((p) => p.startsWith('six')),
    'library six terpasang',
    deps.installed.join(', '),
  )

  console.log('\n5) PROGRAM BISA JALAN DAN IMPORT BERHASIL')
  // Inti bug-nya: kalau program dijalankan dengan python global, import
  // `six` akan GAGAL walau paketnya sudah terpasang di .venv.
  editWorkspaceFile(
    'main.py',
    'import six\n' +
    'from dateutil import tz\n\n' +
    'print("SIX_PY3:", six.PY3)\n' +
    'print("TZ:", tz.UTC is not None)\n' +
    'print("BERHASIL-JALAN")\n',
    'overwrite',
  )
  const run = await runFile('main.py')
  check(run.ok, 'program berjalan tanpa error', run.stderr.split('\n').pop()?.trim() ?? '')
  check(run.stdout.includes('BERHASIL-JALAN'), 'kedua library ter-import', run.stdout.replace(/\n/g, ' | '))

  console.log('\n6) Interpreter yang dipakai = venv (bukan global)')
  editWorkspaceFile('cek.py', 'import sys\nprint(sys.prefix)\n', 'overwrite')
  const which = await runFile('cek.py')
  check(
    which.stdout.includes('.venv'),
    'program berjalan DI DALAM venv',
    which.stdout.trim().split('\n')[0] ?? '',
  )

  console.log('\n7) Error import memberi pesan yang bisa ditindaklanjuti')
  editWorkspaceFile('rusak.py', 'import paket_yang_tidak_ada_12345\n', 'overwrite')
  const bad = await runFile('rusak.py')
  check(!bad.ok, 'program gagal dengan benar')
  check(
    bad.stderr.includes('ModuleNotFoundError') || bad.stderr.includes('No module named'),
    'pesan error menyebut nama modul yang hilang',
    bad.stderr.split('\n').pop()?.trim() ?? '',
  )

  setActiveTask(null)
  console.log(`\nHASIL: ${pass} lulus, ${fail} gagal`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error('GAGAL:', e)
  process.exit(1)
})