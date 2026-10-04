/**
 * lib/orchestrator/quality.ts
 * ---------------------------------------------------------------------------
 * Evaluasi hasil kerja + orchestrasi revisi.
 *
 * Deliverable yang tidak memenuhi standarminimum (terlalu pendek, belum
 * menulis file sama sekali, atau fence tak tertutup karena terpotong) akan
 * ditandai `needsRevision`. Engine lalu meminta agent yang sama merevisinya.
 *
 * Ini murni pemeriksaan lokal — tidak memanggil LLM — jadi cepat dan gratis.
 * ---------------------------------------------------------------------------
 */

/** Panjang minimum isi file, per jenis hasil. */
const MIN_LENGTH: Record<'code' | 'markdown' | 'pdf' | 'html', number> = {
  code: 220,
  html: 220,
  markdown: 180,
  pdf: 180,
}

/** Hasil evaluasi satu deliverable. */
export interface QualityReport {
  /** Path file yang dinilai. */
  path: string
  /** Skor 0..100. */
  score: number
  /** Alasan kalau perlu revisi. */
  issues: string[]
  /** True bila hasilnya belum layak. */
  needsRevision: boolean
}

/**
 * Nilai satu file hasil kerja.
 *
 * Yang diperiksa:
 *  1. Panjang isi — hasil terlalu pendek biasanya belum serius.
 *  2. Keseimbangan buka-tutup code fence — fence tak tertutup berarti output
 *     terpotong (biasanya kena batas max_tokens) dan file ikut rusak.
 *  3. Deteksi blok kosong / placeholder yang isinya cuma kerangka.
 */
export function evaluateFile(path: string, content: string): QualityReport {
  const issues: string[] = []
  const kind = (path.split('.').pop()?.toLowerCase() ?? 'md') as
    | 'code' | 'markdown' | 'pdf' | 'html'
  const min = MIN_LENGTH[kind] ?? 180
  const text = content.trim()

  if (text.length === 0) {
    issues.push('File kosong')
  } else if (text.length < min) {
    issues.push(`Terlalu pendek (${text.length} karakter, minimal ${min})`)
  }

  // Code fence tak tertutup = output terpotong.
  const fences = text.match(/^```/gm)?.length ?? 0
  if (fences % 2 !== 0) {
    issues.push('Blok kode tidak tertutup (hasil kemungkinan terpotong)')
  }

  // Isi yang hanya kerangka belum layak dianggap hasil kerja.
  if (/^(TODO|TBD|FIXME|\.{3})?\s*$/i.test(text)) {
    issues.push('Isi belum berisi pekerjaan nyata')
  }

  // Skor: 100 dikurangi penalti per masalah.
  const score = Math.max(0, 100 - issues.length * 40)
  return { path, score, issues, needsRevision: issues.length > 0 }
}

/**
 * Nilai seluruh hasil kerja satu task.
 * Mengembalikan `null` bila tidak ada file yang perlu dinilai (mis. task chat).
 */
export function evaluateArtifacts(
  artifacts: { path: string; content: string }[],
): QualityReport[] {
  return artifacts.map((a) => evaluateFile(a.path, a.content))
}

/** Ringkasan singkat untuk log: "3 file, 1 perlu revisi". */
export function summarizeQuality(reports: QualityReport[]): string {
  const bad = reports.filter((r) => r.needsRevision)
  return `${reports.length} file diperiksa, ${bad.length} perlu revisi`
}