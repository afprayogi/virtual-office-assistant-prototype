/**
 * lib/orchestrator/validation.ts
 * ---------------------------------------------------------------------------
 * Pengecekan hasil kerja: "apakah file ini SESUAI atau PERLU REVISI?".
 *
 * Berbeda dengan `quality.ts` yang hanya mengecek bentuk (panjang, fence),
 * modul ini mengecek KESESUAIAN: apakah isi file benar-benar memenuhi
 * acceptance criteria yang diminta task.
 *
 * Semua pemeriksaan lokal — tidak memanggil LLM — jadi cepat dan gratis.
 * ---------------------------------------------------------------------------
 */

/** Status kelayakan satu file hasil kerja. */
export type Verdict = 'sesuai' | 'perlu-revisi'

/** Satu butir kriteria yang diperiksa. */
export interface Criterion {
  /** Label yang tampil di UI. */
  label: string
  /** True bila terpenuhi. */
  ok: boolean
  /** Penjelasan singkat kalau gagal. */
  hint?: string
}

/** Hasil validasi satu file. */
export interface ValidationResult {
  path: string
  verdict: Verdict
  /** Skor 0..100 = rasio kriteria yang terpenuhi. */
  score: number
  criteria: Criterion[]
  /** Ringkasan satu kalimat, siap tampil di notifikasi. */
  summary: string
}

/**
 * Kriteria wajib per task.
 *
 * Ini "acceptance criteria" yang disepakati tim: isi file WAJIB menyinggung
 * hal-hal ini. Kalau tidak, hasilnya dianggap belum sesuai.
 *
 * Kata kunci dicocokkan tanpa case dan spasi fleksibel agar tidak rapuh.
 */
const CRITERIA: Record<string, string[]> = {
  'req-vision': ['visi', 'target', 'prioritas'],
  'req-spec': ['user story', 'acceptance', 'scope'],
  'design-arch': ['arsitektur', 'stack', 'modul'],
  'design-system': ['token', 'warna', 'komponen'],
  'code-impl': ['export', 'function', 'interface'],
  'code-frontend': ['export', 'component', 'state'],
  'test-plan': ['skenario', 'langkah', 'expected'],
  'doc-guide': ['langkah', 'contoh', 'panduan'],
}

/** Normalisasi teks agar pencocokan kata kunci tidak rapuh. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Periksa satu file terhadap kriteria task-nya.
 *
 * @param taskId  Id task pemilik file.
 * @param path    Path file (untuk pesan error).
 * @param content Isi file.
 * @param minLen  Panjang minimum isi.
 */
export function validateArtifact(
  taskId: string,
  path: string,
  content: string,
  minLen = 180,
): ValidationResult {
  const criteria: Criterion[] = []
  const text = normalize(content)

  // 1) Isi cukup panjang.
  criteria.push({
    label: 'Isi memadai',
    ok: content.trim().length >= minLen,
    hint: `minimal ${minLen} karakter, saat ini ${content.trim().length}`,
  })

  // 2) Tidak terpotong (blok kode seimbang).
  const fences = content.match(/^```/gm)?.length ?? 0
  criteria.push({
    label: 'Blok kode utuh',
    ok: fences % 2 === 0,
    hint: 'blok kode tidak tertutup — hasil kemungkinan terpotong',
  })

  // 3) Kriteria khusus task (jika ada).
  for (const word of CRITERIA[taskId] ?? []) {
    const found = text.includes(normalize(word))
    criteria.push({
      label: `Memuat "${word}"`,
      ok: found,
      hint: found ? undefined : `belum ada pembahasan "${word}"`,
    })
  }

  const passed = criteria.filter((c) => c.ok).length
  const score = criteria.length ? Math.round((passed / criteria.length) * 100) : 100
  const verdict: Verdict = score >= 70 ? 'sesuai' : 'perlu-revisi'

  const failed = criteria.filter((c) => !c.ok).map((c) => c.label)
  const summary =
    verdict === 'sesuai'
      ? `Sesuai (${score}%)`
      : `Perlu revisi (${score}%): ${failed.join(', ')}`

  return { path, verdict, score, criteria, summary }
}

/** Validasi seluruh hasil kerja satu task. Array kosong = tidak ada file. */
export function validateArtifacts(
  taskId: string,
  artifacts: { path: string; content: string }[],
  minLen = 180,
): ValidationResult[] {
  return artifacts.map((a) => validateArtifact(taskId, a.path, a.content, minLen))
}

/**
 * Pilih artefak yang paling perlu diperbaiki (skor terendah).
 * Mengembalikan `null` bila semua sudah sesuai.
 */
export function worstOffender(results: ValidationResult[]): ValidationResult | null {
  const bad = results.filter((r) => r.verdict === 'perlu-revisi')
  if (bad.length === 0) return null
  return bad.reduce((a, b) => (a.score <= b.score ? a : b))
}