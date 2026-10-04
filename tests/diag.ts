/**
 * Diagnosis fokus: satu panggilan LLM dengan prompt deliverable.
 * Membuktikan apakah gateway benar-benar menghasilkan blok `file:`.
 * Jalankan: npx tsx ./tests/diag.ts
 */
import { stream } from '../lib/orchestrator/llm'
import { deliverableFor, deliverablePrompt } from '../lib/orchestrator/taskRegistry'

async function main() {
  const spec = deliverableFor('req-vision')!
  const systemPrompt = [
    'Kamu adalah CEO perusahaan produk digital.',
    'Kamu menulis dokumentasi produk yang konkret dan bisa langsung dipakai.',
    'Selalu jawab dalam Bahasa Indonesia.',
  ].join('\n')

  const userPrompt =
    'Proyek: Aplikasi catatan-taking sederhana\n\n' +
    'Tugas: Susun visi produk untuk proyek ini.\n' +
    deliverablePrompt(spec)

  console.log('--- PROMPT (potongan) ---')
  console.log(userPrompt.slice(0, 600))
  console.log('\n--- memanggil gateway ...\n')

  let content = ''
  for await (const chunk of stream({
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    strategy: 'auto/smart',
    maxTokens: 2000,
  })) {
    if (chunk.delta) content += chunk.delta
  }

  console.log('--- BALASAN (1200 karakter pertama) ---')
  console.log(content.slice(0, 1200))
  console.log('\n=========================================')
  console.log('ada marker ```file: ?', content.includes('```file:'))
  const paths = [...content.matchAll(/```file:([\w./-]+)/g)].map((x) => x[1])
  console.log('path ditemukan  :', paths.length ? paths.join(', ') : '(TIDAK ADA)')
  console.log('jumlah karakter  :', content.length)
  const fences = [...content.matchAll(/```(\w+)?/g)].map((x) => x[1] ?? '(tanpa bahasa)')
  console.log('semua fence      :', fences.join(', ') || '(tidak ada)')
}
main().catch((e) => { console.error(e); process.exit(1) })