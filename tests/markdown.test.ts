/**
 * tests/markdown.test.ts
 * ---------------------------------------------------------------------------
 * Regression test untuk parser Markdown.
 *
 * Fokus: jaminan parser SELALU membuat progres. Bug sebelumnya membuat baris
 * seperti `**tebal**` menyebabkan `i` tidak pernah maju → infinite loop →
 * main thread browser tersendat ("Page Unresponsive").
 *
 * Jalankan: npx tsx tests/markdown.test.ts
 * ---------------------------------------------------------------------------
 */
import { parseBlocks } from '../components/chat/markdown-parser'

/** Batas waktu keras per kasus — kalau loop, Promise ini akan tertahan. */
function timed<T>(fn: () => T, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve().then(fn),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT / infinite loop')), ms)),
  ])
}

const cases: [string, string][] = [
  ['bold di awal baris', '**Prioritas**\n\nParagraph biasa'],
  ['tabel markdown', '| a | b |\n|---|---|\n| 1 | 2 |'],
  ['pipe tanpa tabel', '| kolom satu'],
  ['blockquote', '> catatan penting\n> baris dua'],
  ['campuran semua blok', '**tebal**\n* miring\n# judul\n> quote\n|pipe|\n```\ncode\n```'],
  ['list lalu bold', '- satu\n- dua\n\n**tebal**'],
  ['horizontal rule', 'teks\n\n---\n\nteks lagi'],
  ['checklist', '- [x] selesai\n- [ ] belum'],
  ['fence tak ditutup', '```ts\nconst a = 1'],
  ['string kosong', ''],
  ['hanya newline', '\n\n\n'],
  ['nomor lalu teks', '1. pertama\n2. kedua\n\nPenutup.'],
  ['star tanpa spasi', '**a**\n**b**\n**c**'],
  ['underline hr', '___\n\nteks'],
  ['full document', '# H\n\n## S\n\nTeks **tebal**.\n\n- a\n- b\n\n> q\n\n```js\nx\n```\n\n| h |\n|---|\n| c |'],
]

async function main() {
  let pass = 0
  let fail = 0

  for (const [name, input] of cases) {
    const t0 = Date.now()
    try {
      const blocks = await timed(() => parseBlocks(input), 3000)
      console.log(`  ✓ ${name.padEnd(22)} → ${String(blocks.length).padStart(3)} blok (${Date.now() - t0}ms)`)
      pass++
    } catch (err) {
      console.log(`  ✗ ${name.padEnd(22)} → ${err instanceof Error ? err.message : String(err)}`)
      fail++
    }
  }

  // Beban nyata: teks panjang hasil streaming.
  const big = Array.from({ length: 400 }, (_, i) => `**Baris ${i}** dengan teks lanjutannya di sini.`).join('\n\n')
  try {
    const t1 = Date.now()
    const blocks = await timed(() => parseBlocks(big), 5000)
    console.log(`  ✓ teks besar ${big.length} char → ${blocks.length} blok (${Date.now() - t1}ms)`)
    pass++
  } catch (err) {
    console.log(`  ✗ teks besar → ${err instanceof Error ? err.message : String(err)}`)
    fail++
  }

  console.log(`\nHASIL: ${pass} lulus, ${fail} gagal`)
  if (fail > 0) process.exit(1)
}

main()