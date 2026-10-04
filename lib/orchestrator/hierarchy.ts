/**
 * lib/orchestrator/hierarchy.ts
 * ---------------------------------------------------------------------------
 * Relasi ATASAN → BAWAHAN antar agent.
 *
 * Dua hal yang ditangani modul ini:
 *
 * 1. `upstreamContext()` — agent membaca ISI FILE hasil kerja rekannya
 *    (bukan ringkasan chat), sehingga task hilir berikutnya benar-benar
 *    berdasar pada pekerjaan yang sudah ada.
 *
 * 2. `buildReviewPrompt()` — atasan menilai hasil kerja bawahan terhadap
 *    acceptance criteria. Kalau tidak sesuai, engine menjalankan ulang task
 *    si bawahan dengan catatan revisi dari atasan.
 *
 * Semua keputusan "sesuai / tidak" tetap memakai `validation.ts` supaya
 * objektif dan tidak bergantung pada rellenar LLM.
 * ---------------------------------------------------------------------------
 */
import type { Artifact, PhaseTask, ReviewResult } from '@/types/agent'
import { validateArtifacts } from './validation'

/** Batas karakter per file saat dikirim ke prompt (hemat token). */
const MAX_CHARS_PER_FILE = 2200

/**
 * Susun blok konteks dari hasil kerja task yang menjadi dependency.
 *
 * @param task     Task yang sedang dikerjakan.
 * @param byTask   Hasil kerja per task id, diisi engine selama workflow.
 */
export function upstreamContext(task: PhaseTask, byTask: Map<string, Artifact[]>): string {
  const deps = task.dependsOn ?? []
  if (deps.length === 0) return ''

  const blocks: string[] = []
  for (const depId of deps) {
    const files = byTask.get(depId) ?? []
    if (files.length === 0) continue
    for (const f of files) {
      const body =
        f.content.length > MAX_CHARS_PER_FILE
          ? `${f.content.slice(0, MAX_CHARS_PER_FILE)}\n… (dipotong)`
          : f.content
      blocks.push(
        `<file path="${f.path}" oleh="${f.agentName}">\n${body}\n</file>`,
      )
    }
  }

  if (blocks.length === 0) return ''
  return (
    `Hasil kerja rekan yang menjadi acuanmu:\n${blocks.join('\n\n')}\n` +
    `Gunakan file di atas sebagai bahan kerja. Jangan mengulang dari nol.`
  )
}

/**
 * Validasi hasil kerja bawahan dari sudut pandang atasan.
 *
 * Memakai criteria yang sama dengan `validation.ts`, jadi verdict-nya
 * konsisten dengan badge di UI.
 */
export function reviewSubordinate(
  task: PhaseTask,
  artifacts: Artifact[],
  supervisorRole?: string,
): ReviewResult[] {
  return validateArtifacts(
    task.id,
    artifacts.map((a) => ({ path: a.path, content: a.content })),
  ).map((v) => ({
    taskId: task.id,
    agentId: v.path,
    path: v.path,
    verdict: v.verdict,
    score: v.score,
    summary: v.summary,
    criteria: v.criteria,
    requestedBy: supervisorRole,
  }))
}

/**
 * Prompt untuk atasan: menilai hasil kerja bawahan.
 *
 * Dipakai supaya agent yang jadi atasan benar-benar MEMBACA file yang
 * dikerjakan rekannya, bukan menerima verdict angka tanpa konteks.
 */
export function buildReviewPrompt(
  task: PhaseTask,
  artifacts: Artifact[],
): string {
  const files = artifacts
    .map((f) => {
      const body =
        f.content.length > MAX_CHARS_PER_FILE
          ? `${f.content.slice(0, MAX_CHARS_PER_FILE)}\n… (dipotong)`
          : f.content
      return `<file path="${f.path}" oleh="${f.agentName}">\n${body}\n</file>`
    })
    .join('\n\n')

  return (
    `Tinjau hasil kerja rekanmu untuk task "${task.title}".\n` +
    `Kriteria yang wajib dipenuhi:\n${task.instruction}\n\n` +
    `File yang dihasilkan:\n${files || '(tidak ada file)'}\n\n` +
    `Periksa satu per satu: apakah setiap kriteria benar-benar terpenuhi? ` +
    `Sebutkan bagian yang kurang secara spesifik (bukan " kurang bagus").`
  )
}

/**
 * Daftar bawahan langsung seorang atasan dalam satu fase.
 */
export function subordinatesOf(
  tasks: PhaseTask[],
  supervisorRole: string,
): PhaseTask[] {
  return tasks.filter((t) => t.reportsTo === supervisorRole)
}

/**
 * Susun daftar anak → induk dari registry.
 * Dipakai test untuk memastikan hierarki tidak membentuk lingkaran.
 */
export function hierarchyEdges(tasks: PhaseTask[]): { child: string; parent: string }[] {
  return tasks
    .filter((t) => t.reportsTo)
    .map((t) => ({ child: t.id, parent: t.reportsTo as string }))
}