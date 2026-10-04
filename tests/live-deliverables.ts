/**
 * Smoke test end-to-end lewat OmniRoute sungguhan.
 * Membuktikan LangGraph berjalan 5 node dan agent benar-benar menulis FILE
 * (blok `file:`) sehingga Workspace terisi hasil kerja, bukan percakapan.
 *
 * Jalankan: npx tsx ./tests/live-deliverables.ts
 */
import { ChatDevEngine } from '../lib/orchestrator/ChatDevEngine'
import { listWorkspace, readWorkspaceFile } from '../lib/orchestrator/workspace'
import type { Artifact, OfficeEvent } from '../types/agent'

async function main() {
  const counts: Record<string, number> = {}
  const files: Artifact[] = []
  const phases: string[] = []

  const t0 = Date.now()
  const engine = new ChatDevEngine({
    onEvent: (e: OfficeEvent) => {
      counts[e.type] = (counts[e.type] ?? 0) + 1
      if (e.type === 'PHASE_CHANGE' && e.phase) phases.push(e.phase)
      if (e.type === 'ARTIFACT' && e.artifact) files.push(e.artifact)
    },
  })

  await engine.run('Buat aplikasi catatan-taking sederhana', false)

  console.log('durasi     :', Math.round((Date.now() - t0) / 1000), 'detik')
  console.log('node graph :', phases.join(' → '))
  console.log('events     :', JSON.stringify(counts))

  // Bukti bahwa agent benar-benar menjadi worker: file NYATA di disk.
  console.log('\n--- ISI DIREKTORI KERJA (disk) ---')
  const onDisk = listWorkspace()
  for (const f of onDisk) {
    console.log(`  ${f.path.padEnd(30)} ${String(f.size).padStart(6)} B`)
  }

  console.log('\n--- FILE HASIL KERJA (isi Workspace) ---')
  if (files.length === 0) console.log('  (belum ada file)')
  for (const f of files) {
    const lines = f.content.split('\n').length
    console.log(
      `  ${f.path.padEnd(30)} ${String(lines).padStart(4)} baris  ${String(f.content.length).padStart(6)} char  oleh ${f.agentName} (${f.taskTitle ?? '-'})`,
    )
  }

  // Validasi: isi di Workspace harus identik dengan isi di disk.
  const mismatched = files.filter((f) => readWorkspaceFile(f.path) !== f.content)
  console.log(`\ntotal file artefak : ${files.length}`)
  console.log(`total file di disk: ${onDisk.length}`)
  console.log(`path unik di disk : ${new Set(onDisk.map((f) => f.path)).size}`)
  console.log(`mismatch disk/UI  : ${mismatched.length === 0 ? 'tidak ada (konsisten)' : mismatched.map((f) => f.path).join(', ')}`)
}
main().catch((e) => {
  console.error('GAGAL:', e)
  process.exit(1)
})