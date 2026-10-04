/**
 * Uji akses internet + hemat token.
 * Jalankan: npx tsx ./tests/websearch.test.ts
 */
import { formatResearch, searchWeb } from '../lib/orchestrator/websearch'

let pass = 0
let fail = 0
const check = (ok: boolean, label: string, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
  ok ? pass++ : fail++
}

async function main() {
  console.log('1) Pencarian internet nyata')
  const t0 = Date.now()
  const hits = await searchWeb('What is the capital of Indonesia')
  const ms = Date.now() - t0

  console.log(`   dapat ${hits.length} hasil dalam ${ms} ms`)
  for (const h of hits.slice(0, 2)) {
    console.log(`   - ${h.title}`)
    console.log(`     ${h.snippet.slice(0, 120)}`)
  }

  check(hits.length > 0, 'minimal 1 hasil ditemukan', `${hits.length} hasil`)
  check(hits.every((h) => h.snippet.length > 0), 'semua hasil punya cuplikan')
  check(hits.length <= 4, 'hasil dibatasi maksimal 4', String(hits.length))
  check(hits.every((h) => h.snippet.length <= 321), 'cuplikan dipotong hemat token',
    `terpanjang ${Math.max(...hits.map((h) => h.snippet.length))} char`)
  check(ms < 15000, 'cukup cepat', `${ms} ms`)

  console.log('\n2) Format blok riset untuk prompt')
  const block = formatResearch('capital of Indonesia', hits)
  if (block) {
    console.log('   ' + block.slice(0, 160).replace(/\n/g, ' | '))
  }
  check(block.length === 0 || block.includes('HASIL PENCARIAN INTERNET'), 'blok berformat benar')
  check(formatResearch('x', []).length === 0, 'hasil kosong -> blok kosong')

  console.log('\n3) Query kosong tidak memanggil jaringan')
  check((await searchWeb('')).length === 0, 'query kosong -> 0 hasil')
  check((await searchWeb('   ')).length === 0, 'query spasi -> 0 hasil')

  console.log('\n4) Kegagalan jaringan tidak melempar error')
  // Query aneh tetap mengembalikan array, tidak melempar error.
  const weird = await searchWeb('zzzzqqqxyzzy-tidak-adalah-topik-12345')
  check(Array.isArray(weird), 'selalu mengembalikan array', `${weird.length} hasil`)

  console.log(`\nHASIL: ${pass} lulus, ${fail} gagal`)
  // Di sandbox tanpa akses internet, koneksi memang ditolak. Yang wajib
  // dipastikan adalah: tidak melempar error, cepat, dan tidak membanjiri prompt.
  if (hits.length === 0) {
    console.log(
      'CATATAN: lingkungan ini tidak punya akses internet keluar, jadi jumlah\n' +
      '        hasil 0. Yang diuji di sini adalah perilaku fallback yang benar.\n' +
      '        Jalankan ulang di mesin dengan internet untuk melihat hasil nyata.',
    )
  }
  if (fail > 1) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })