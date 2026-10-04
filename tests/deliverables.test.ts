/**
 * Uji deliverable-only + LangGraph.
 * - Blok kode biasa (contoh di percakapan) TIDAK boleh jadi artefak.
 * - Hanya blok `file:<path>` yang boleh.
 * - Mode chat TIDAK boleh menghasilkan file.
 * - PDF harus benar-benar PDF (header %PDF, trailer, xref).
 * - Graph harus melewati kelima node.
 *
 * Jalankan: npx tsx ./tests/deliverables.test.ts
 */
import { DEFAULT_AGENTS } from '../lib/orchestrator/defaults'
import { TASKS, deliverableFor, deliverablePrompt, producesFile, tasksForPhase } from '../lib/orchestrator/taskRegistry'
import { PHASE_ORDER } from '../lib/orchestrator/taskRegistry'
import { markdownToPdf } from '../lib/orchestrator/pdf'
import { buildGraph, type OfficeStateType } from '../lib/orchestrator/graph'

async function main() {
  let pass = 0
  let fail = 0
  const check = (ok: boolean, label: string, extra = '') => {
    console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
    ok ? pass++ : fail++
  }

  /* ---- Replika parser artefak (harus sama dgn ChatDevEngine) ---- */
  const extract = (content: string) =>
    [...content.matchAll(/```file:([\w./-]+)\s*\n([\s\S]*?)```/g)].map((m) => ({
      path: m[1].trim(),
      content: (m[2] ?? '').trim(),
    }))

  console.log('1) Parser hanya mengambil file bertanda')
  const sample = [
    'Ini penjelasan biasa.',
    '```ts', 'const contoh = 1 // cuplikan contoh', '```',
    'Sekarang hasil kerjanya:',
    '```file:src/index.ts', 'export const nyata = true', '```',
    'Contoh lain di penjelasan:',
    '```json', '{"contoh": true}', '```',
  ].join('\n')
  const got = extract(sample)
  check(got.length === 1, 'hanya 1 artefak terbaca', `dapat ${got.length}`)
  check(got[0]?.path === 'src/index.ts', 'path benar', got[0]?.path ?? '-')
  check(got[0]?.content === 'export const nyata = true', 'isi file benar')

  console.log('\n2) Semua task punya deliverable')
  const missing = TASKS.filter((t) => !deliverableFor(t.id))
  check(missing.length === 0, 'setiap task punya deliverable', missing.map((t) => t.id).join(', ') || 'lengkap')

  console.log('\n3) Path deliverable unik per task')
  const paths = TASKS.map((t) => deliverableFor(t.id)?.path).filter(Boolean) as string[]
  const dupes = paths.filter((p, i) => paths.indexOf(p) !== i)
  check(dupes.length === 0, 'tidak ada path duplikat', dupes.join(', ') || `${paths.length} file unik`)

  console.log('\n4) Prompt memaksa menulis file')
  const spec = deliverableFor('code-impl')!
  const p = deliverablePrompt(spec)
  check(p.includes('```file:'), 'meminta format file:', 'ada marker file:')
  check(p.includes(spec.path), 'menyebutkan path target', spec.path)

  console.log('\n5) Bentuk deliverable sesuai permintaan')
  const byOutput = { pdf: 0, code: 0, chat: 0, markdown: 0 }
  for (const t of TASKS) {
    const d = deliverableFor(t.id)
    if (d) byOutput[d.output]++
  }
  check(byOutput.pdf > 0, 'ada deliverable PDF', `${byOutput.pdf} PDF`)
  check(byOutput.code > 0, 'ada deliverable program', `${byOutput.code} program`)
  check(byOutput.markdown > 0, 'ada dokumen kerja', `${byOutput.markdown} dokumen`)

  // KONTRAK INTI: SETIAP task wajib menghasilkan file nyata.
  //
  // Dulu 8 dari 17 task memakai `output: 'chat'`, jadi hasil kerja mereka
  // (analisis risiko, review kode, skrip demo, ...) hilang sebagai chat dan
  // TIDAK PERNAH masuk ke direktori kerja. Itu membuat Workspace berisi
  // hasil diskusi, bukan hasil kerja.
  const noFile = TASKS.filter((t) => !producesFile(t.id))
  check(
    noFile.length === 0,
    'SEMUA task menghasilkan file (tidak ada task diskusi-saja)',
    noFile.map((t) => t.id).join(', ') || `${TASKS.length}/${TASKS.length} task punya file`,
  )

  const nonChatTasks = TASKS.filter((t) => producesFile(t.id))
  // Path harus cocok dengan bentuk outputnya: pdf -> .pdf, markdown -> .md,
  // code -> berkas program.
  check(
    nonChatTasks.every((t) => {
      const d = deliverableFor(t.id)!
      if (d.output === 'pdf') return d.path.endsWith('.pdf')
      if (d.output === 'markdown') return d.path.endsWith('.md')
      return d.output === 'code'
    }),
    'file task punya path yang sesuai bentuknya', `${nonChatTasks.length} task`)

  console.log('\n6) Prompt dokumen menunjuk ke direktori kerja')
  const docSpec = deliverableFor('code-review')!
  const docPrompt = deliverablePrompt(docSpec)
  check(docPrompt.includes('```file:docs/code-review.md'), 'prompt dokumen menyebut path file',
    docSpec.path)
  check(docPrompt.includes('hasil kerja nyata'), 'prompt menegaskan ini bukan ringkasan chat')
  const pdfSpec = deliverableFor('req-vision')!
  const pdfPrompt = deliverablePrompt(pdfSpec)
  check(pdfPrompt.includes('```file:docs/product-vision.pdf'), 'prompt PDF meminta path .pdf',
    pdfPrompt.includes('```file:docs/product-vision.pdf') ? 'ok' : 'salah')
  check(pdfPrompt.includes('Markdown'), 'prompt PDF menyuruh tulis Markdown')

  console.log('\n7) PDF yang dihasilkan benar-benar PDF')
  const pdf = markdownToPdf('# Judul Dokumen\n\nParagraf isi.\n\n- butir satu\n- butir dua', 'Uji')
  const head = pdf.subarray(0, 8).toString('latin1')
  const tail = pdf.subarray(-8).toString('latin1').trim()
  check(head.startsWith('%PDF-1.4'), 'header %PDF-1.4', head.trim())
  check(tail.includes('%%EOF'), 'penutup %%EOF', tail)
  check(pdf.toString('latin1').includes('/Type /Catalog'), 'ada objek Catalog')
  check(pdf.toString('latin1').includes('/MediaBox'), 'ada MediaBox A4')
  check(pdf.toString('latin1').includes('xref'), 'ada tabel xref')
  check(pdf.toString('latin1').includes('startxref'), 'ada startxref')
  check(pdf.length > 400, 'ukuran wajar', `${pdf.length} B`)
  check(pdf.subarray(0, 5).toString() === '%PDF-', 'signature biner benar')

  console.log('\n8) Mock mengambil path deliverable yang BENAR')
  // Regresi: prompt berisi "keluaran tim sebelumnya" yg juga punya blok file:.
  // Mock harus ambil match TERAKHIR (instruksi deliverable milik task ini),
  // bukan match pertama (path milik phase sebelumnya).
  const promptWithHistory = [
    'Proyek: X',
    'Keluaran tim sebelumnya:',
    '```file:docs/risk-analysis.md', 'isi lama', '```',
    'Tugas: tulis dokumentasi',
    'KETENTUAN OUTPUT:',
    '```file:docs/user-guide.md',
  ].join('\n')
  const allPaths = [...promptWithHistory.matchAll(/```file:([\w./-]+)/g)].map((m) => m[1])
  const mockChosen = allPaths[allPaths.length - 1]
  check(mockChosen === 'docs/user-guide.md', 'mock pilih path terakhir',
    `dapat ${mockChosen} dari [${allPaths.join(', ')}]`)

  console.log('\n9) LangGraph melewati semua node')
  const visited: string[] = []
  const graph = buildGraph(async (state: OfficeStateType) => {
    visited.push(state.phase)
    const tasks = tasksForPhase(state.phase)
    // Hanya task berfile yang menghasilkan artefak (chat-only tidak).
    return {
      halted: false,
      artifacts: tasks.filter((t) => producesFile(t.id)).map((t) => {
        const d = deliverableFor(t.id)!
        const agent = DEFAULT_AGENTS.find((a) => a.role === t.ownerRole)!
        return {
          id: t.id,
          path: d.path,
          language: d.language,
          kind: d.kind,
          content: '',
          agentId: agent.id,
          agentName: agent.name,
          phase: t.phase,
          taskTitle: t.title,
          createdAt: Date.now(),
        }
      }),
    }
  }, () => false)

  const state = await graph.invoke({ task: 'uji', halted: false }, { recursionLimit: 100 })

  const fileTasks = TASKS.filter((t) => producesFile(t.id))
  check(
    visited.length === PHASE_ORDER.length,
    `graph melewati ${PHASE_ORDER.length} node`,
    visited.join(' → '),
  )
  check(JSON.stringify(visited) === JSON.stringify([...PHASE_ORDER]), 'urutan node benar')
  check((state.artifacts ?? []).length === fileTasks.length, 'artefak terkumpul di state',
    `${(state.artifacts ?? []).length}/${fileTasks.length}`)
  check(
    state.step === PHASE_ORDER.length,
    `step akhir = ${PHASE_ORDER.length}`,
    String(state.step),
  )

  console.log('\n10) Daftar file hasil yang akan muncul di Workspace')
  for (const t of fileTasks) {
    const d = deliverableFor(t.id)!
    const icon = d.output === 'pdf' ? '📄' : d.output === 'code' ? '💻' : '📝'
    console.log(`    ${icon} ${d.path}`)
  }
  const chatOnly = TASKS.filter((t) => deliverableFor(t.id)?.output === 'chat')
  console.log(`\n    Task chat-only (tidak masuk Workspace, ${chatOnly.length}):`)
  for (const t of chatOnly) console.log(`    💬 ${t.title}`)

  console.log(`\nHASIL: ${pass} lulus, ${fail} gagal`)
  if (fail > 0) process.exit(1)
  void DEFAULT_AGENTS
}

main().catch((e) => {
  console.error('GAGAL:', e)
  process.exit(1)
})