/**
 * Uji folder per task — hasil kerja tiap task tidak boleh tercampur.
 * Jalankan: npx tsx ./tests/task-folder.test.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  PROJECTS_DIR,
  createProject,
  editWorkspaceFile,
  getActiveTask,
  listProjectTree,
  listWorkspace,
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
  console.log('1) Setiap task dapat folder sendiri')
  const project = createProject('Test Folder Per Task')
  setActiveTask('req-vision')
  editWorkspaceFile('docs/visi.md', 'isi visi', 'create')
  setActiveTask('code-impl')
  editWorkspaceFile('src/index.ts', 'export const a = 1', 'create')
  setActiveTask('design-arch')
  editWorkspaceFile('docs/arsitektur.md', 'isi arsitektur', 'create')
  setActiveTask(null)

  const tree = listProjectTree()
  console.log('   struktur:')
  for (const f of tree) console.log(`     ${f.path}`)

  check(tree.length === 3, '3 file di 3 folder berbeda', String(tree.length))
  check(
    tree.some((f) => f.path === 'tasks/req-vision/docs/visi.md'),
    'req-vision punya folder sendiri',
  )
  check(
    tree.some((f) => f.path === 'tasks/code-impl/src/index.ts'),
    'code-impl punya folder sendiri',
  )
  check(
    tree.some((f) => f.path === 'tasks/design-arch/docs/arsitektur.md'),
    'design-arch punya folder sendiri',
  )

  console.log('\n2) File tidak tercampur antar task')
  // File dengan nama sama di dua task harus terpisah, bukan saling menimpa.
  setActiveTask('req-vision')
  editWorkspaceFile('docs/laporan.md', 'dari req-vision', 'create')
  setActiveTask('design-risk')
  editWorkspaceFile('docs/laporan.md', 'dari design-risk', 'create')
  setActiveTask(null)
  check(
    listProjectTree().filter((f) => f.path.endsWith('laporan.md')).length === 2,
    'nama file sama di 2 task tetap 2 file terpisah',
  )

  console.log('\n3) Membaca dibatasi ke folder task aktif')
  setActiveTask('req-vision')
  check(readWorkspaceFile('docs/laporan.md') === 'dari req-vision', 'baca isi milik sendiri')
  check(readWorkspaceFile('../../design-risk/docs/laporan.md') === null, 'tolak baca file task lain')
  setActiveTask(null)
  check(getActiveTask() === null, 'pointer task aktif dibersihkan', String(getActiveTask()))

  console.log('\n4) Folder task benar-benar ada di disk')
  for (const id of ['req-vision', 'code-impl', 'design-arch', 'design-risk']) {
    check(
      fs.existsSync(path.join(PROJECTS_DIR, project.id, 'tasks', id)),
      `folder task ${id} ada`,
    )
  }

  console.log('\n5) Di luar task, operasi masuk folder proyek')
  setActiveTask(null)
  editWorkspaceFile('catatan-umum.md', 'level proyek', 'create')
  const root = listProjectTree()
  check(
    root.some((f) => f.path === 'catatan-umum.md'),
    'file proyek tidak pakai prefix tasks/',
  )

  console.log('\n6) Traversal lintas task tetap ditolak')
  setActiveTask('req-vision')
  check(!editWorkspaceFile('../design-risk/docs/laporan.md', 'x', 'create').ok,
    'tulis ke folder task lain ditolak')
  check(readWorkspaceFile('../../design-risk/docs/laporan.md') === null, 'baca lintas task ditolak')
  setActiveTask(null)

  console.log('\n7) listWorkspace hanya isi folder task aktif')
  setActiveTask('code-impl')
  const scoped = listWorkspace()
  check(scoped.length === 1 && scoped[0].path === 'src/index.ts', 'hanya isi folder task',
    scoped.map((f) => f.path).join(', '))
  setActiveTask(null)

  console.log(`\nHASIL: ${pass} lulus, ${fail} gagal`)
  if (fail > 0) process.exit(1)
}

main()