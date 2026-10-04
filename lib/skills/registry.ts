/**
 * lib/skills/registry.ts
 * ---------------------------------------------------------------------------
 * Loader skill Anthropic dari folder `server/skills` (satu folder per skill,
 * masing-masing berisi file SKILL.md).
 *
 * Skill di-inject ke system prompt agent yang relevan supaya output-nya benar
 * benar mengikuti pola kerja skill tersebut (mis. webapp-testing untuk QA).
 *
 * Demi hemat token kita hanya mengambil deskripsi + maksimal N karakter isi,
 * bukan keseluruhan file (banyak SKILL.md berukuran belasan KB).
 * ---------------------------------------------------------------------------
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { similarity } from './authoring'

export interface Skill {
  /** Nama folder skill, mis. 'frontend-design'. */
  key: string
  /** Deskripsi singkat dari frontmatter YAML. */
  description: string
  /** Cuplikan isi instruksi inti. */
  excerpt: string
  /** Jumlah karakter asli (untuk ditampilkan di UI). */
  size: number
}

/** Batas karakter per skill agar prompt tidak membengkak. */
const MAX_EXCERPT = 1800

let cache: Map<string, Skill> | null = null

/** Ambil nilai sederhana dari frontmatter YAML. */
function frontmatterField(raw: string, field: string): string {
  const match = new RegExp(`^${field}:\\s*(.+)$`, 'm').exec(raw)
  return match?.[1]?.trim().replace(/^["']|["']$/g, '') ?? ''
}

/** Pisahkan frontmatter dari body. */
function splitFrontmatter(raw: string): { meta: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  return match ? { meta: match[1], body: raw.slice(match[0].length) } : { meta: '', body: raw }
}

/** Muat semua skill sekali lalu cache. */
export async function loadSkills(): Promise<Map<string, Skill>> {
  if (cache) return cache
  const dir = path.join(process.cwd(), 'server', 'skills')
  const map = new Map<string, Skill>()

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const file = path.join(dir, entry.name, 'SKILL.md')
      try {
        const raw = await fs.readFile(file, 'utf8')
        const { meta, body } = splitFrontmatter(raw)
        // Ambil paragraf awal isi; buang blok kode yang sangat panjang.
        const excerpt = body
          .replace(/```[\s\S]*?```/g, '[contoh kode dihemat]')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
          .slice(0, MAX_EXCERPT)
        map.set(entry.name, {
          key: entry.name,
          description: frontmatterField(meta, 'description'),
          excerpt,
          size: raw.length,
        })
      } catch {
        // Skill tanpa SKILL.md → lewati.
      }
    }
  } catch {
    // Folder tidak ada → tidak ada skill (mode minimal tetap jalan).
  }

  cache = map
  return map
}

/**
 * Susun blok skill untuk system prompt.
 * Skill yang tidak ditemukan diabaikan diam-diam.
 */
export async function buildSkillBlock(keys: string[]): Promise<string> {
  if (keys.length === 0) return ''
  const all = await loadSkills()
  const found = keys.map((k) => all.get(k)).filter((s): s is Skill => Boolean(s))
  if (found.length === 0) return ''

  return found
    .map((s) => `### Skill: ${s.key}\n${s.description || '(tanpa deskripsi)'}\n\n${s.excerpt}`)
    .join('\n\n---\n\n')
}

/** Daftar skill ringkas untuk UI / endpoint. */
export async function listSkills(): Promise<Skill[]> {
  const all = await loadSkills()
  return [...all.values()].sort((a, b) => a.key.localeCompare(b.key))
}

/**
 * Cari skill yang RELEVAN dengan deskripsi sebuah task.
 *
 * Ini upgrade dari `task.skillKeys` yang statis: task registry hanya tahu
 * `['webapp-testing']`, padahal agent yang sedang menulis pengujian web
 * mungkin lebih butuh `frontend-design`. Pencarian deskripsi membuat pilihan
 * skill mengikuti kebutuhan nyata, bukan tebakan saat registry ditulis.
 *
 * Mengembalikan key yang SEDANG dipakai registry (jadi tidak pernah
 * merekomendasikan skill fiktif).
 */
export async function discoverSkills(taskText: string, limit = 2): Promise<string[]> {
  const all = await loadSkills()
  if (all.size === 0 || !taskText.trim()) return []

  const scores: { key: string; score: number }[] = []
  for (const s of all.values()) {
    if (!s.description) continue
    const score = similarity(taskText, `${s.key} ${s.description}`)
    if (score > 0.08) scores.push({ key: s.key, score })
  }

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.key)
}

/**
 * Buang cache skill.
 *
 * WAJIB dipanggil setelah agent membuat skill baru — kalau tidak, skill itu
 * tidak terlihat sampai server restart, padahal agent lain langsung butuh.
 */
export function invalidateSkillCache(): void {
  cache = null
}