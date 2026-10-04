/**
 * tests/memory.test.ts
 * ---------------------------------------------------------------------------
 * Bukti bahwa memori antar-task benar-benar bekerja.
 *
 * Yang diuji:
 *  1. Simpan -> baca balik round-trip.
 *  2. Pencarian menemukan catatan yang RELEVAN.
 *  3. Catatan yang tidak relevan TIDAK ikut disuntikkan (hemat token).
 *  4. Task tanpa dependensi formal tetap bisa "ingat".
 *  5. Memori dibersihkan saat proyek/workflow baru.
 *
 * Jalankan: npx tsx ./tests/memory.test.ts
 * ---------------------------------------------------------------------------
 */
import {
  clearMemory,
  createProject,
  listMemory,
  memoryContext,
  recallMemory,
  saveMemory,
  setActiveTask,
} from '../lib/orchestrator/workspace'

let pass = 0
let fail = 0
const check = (ok: boolean, label: string, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
  ok ? pass++ : fail++
}

console.log('1) Simpan -> baca balik')
createProject('uji-memori')
clearMemory()
setActiveTask(null)

check(
  saveMemory({
    taskId: 'req-vision',
    title: 'Visi produk',
    agentName: 'Budi',
    phase: 'requirement',
    summary:
      'Target pengguna adalah freelancer yang butuh catatan cepat. ' +
      'Tiga prioritas: sinkronisasi offline, pencarian cepat, dan tag.Color.',
    files: ['docs/product-vision.pdf'],
  }),
  'req-vision tersimpan',
)

check(
  saveMemory({
    taskId: 'design-arch',
    title: 'Rancangan arsitektur',
    agentName: 'Deni',
    phase: 'design',
    summary:
      'Stack TypeScript + Express. Modul dipisah per domain. ' +
      'Database Postgres. Alur data lewat REST API.',
    files: ['docs/architecture.pdf'],
  }),
  'design-arch tersimpan',
)

const all = listMemory()
check(all.length === 2, '2 catatan terbaca', `${all.length}`)
const vision = all.find((n) => n.taskId === 'req-vision')
check(vision?.title === 'Visi produk', 'judul terbaca', vision?.title ?? '-')
check(vision?.agentName === 'Budi', 'agent terbaca', vision?.agentName ?? '-')
check(vision?.files.length === 1 && vision.files[0] === 'docs/product-vision.pdf',
  'daftar file terbaca sebagai array', JSON.stringify(vision?.files))
check((vision?.summary ?? '').includes('freelancer'), 'isi ringkasan terbaca')

console.log('\n2) Pencarian menemukan yang RELEVAN')
const arch = recallMemory('arsitektur dan pilihan stack database')
check(arch.some((n) => n.taskId === 'design-arch'), 'task arsitektur ditemukan',
  arch.map((n) => n.taskId).join(', '))
check(arch.every((n) => n.taskId !== 'req-vision'), 'visi tidak ikut (tidak relevan)')

console.log('\n3) Query berbeda menemukan catatan berbeda')
const vis = recallMemory('target pengguna dan prioritas produk')
check(vis.some((n) => n.taskId === 'req-vision'), 'task visi ditemukan',
  vis.map((n) => n.taskId).join(', '))

console.log('\n4) Memori tidak relevan dibuang (hemat token)')
const kosong = recallMemory('zzzzz qqqqq xxxxx tidak ada kaitan sama sekali')
check(kosong.length === 0, 'query tanpa kaitan tidak menemukan apa pun', `${kosong.length}`)

console.log('\n5) Blok konteks disuntikkan ke prompt')
const ctx = memoryContext('menulis panduan pengguna berdasarkan arsitektur')
check(ctx.includes('<memory'), 'blok memori terbentuk', ctx.slice(0, 40))
check(ctx.includes('req-vision'), 'memori visi ikut terbawa')
check(ctx.length < 4000, 'panjang dibatasi agar hemat token', `${ctx.length} karakter`)

console.log('\n6) Project baru = memori kosong')
clearMemory()
check(listMemory().length === 0, 'clearMemory mengosongkan semuanya')

setActiveTask(null)
console.log(`\nHASIL: ${pass} lulus, ${fail} gagal`)
if (fail > 0) process.exit(1)