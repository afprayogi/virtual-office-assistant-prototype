/**
 * lib/skills/authoring.ts
 *
 * Alurnya (dipanggil engine sebelum agent mulai bekerja):
 *
 *   1. Cek apakah skill yang dibutuhkan sudah ada (nama/deskripsi Similarity).
 *   2. Kalau tidak ada → agent menulis `skill-draft:` berisi YAML frontmatter.
 *   3. Draft divalidasi: nama aman, deskripsi ada, isi cukup bermakna.
 *   4. Draft disimpan ke `server/skills/<key>/SKILL.md` dan langsung bisa
 *      dipakai agent lain pada giliran berikutnya.
 *
 * Motley penting: skill TIDAK PERNAH menimpa skill bawaan. Folder yang sudah
 * ada akan ditolak — mencegah agent merusak prompt sistemnya sendiri atau
 * menimpa skill proven.
 * ---------------------------------------------------------------------------
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

/** Batas ukuran SKILL.md hasil generate agent (hemat token & filesystem). */
const MAX_SKILL_BYTES = 24_000

/** Nama skill yang sah. */
const KEY_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/

/** Draft skill yang dibuat agent. */
export interface SkillDraft {
  /** Nama folder skill (slug). */
  key: string
  /** Deskripsi singkat — dipakai agent lain untuk memilih memakai skill ini. */
  description: string
  /** Isi instruksi (markdown, tanpa frontmatter). */
  body: string
}

/** Hasil validasi draft. */
export interface DraftValidation {
  ok: boolean
  errors: string[]
  draft?: SkillDraft
}

/**
 * Ambil nilai field dari frontmatter YAML sederhana.
 * Versi sinkron dari `registry.ts` supaya konsisten.
 */
function frontmatterField(raw: string, field: string): string {
  const match = new RegExp(`^${field}:\\s*(.+)$`, 'm').exec(raw)
  return match?.[1]?.trim().replace(/^["']|["']$/g, '') ?? ''
}

/** Pisahkan frontmatter dari body. */
function splitFrontmatter(raw: string): { meta: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  return match ? { meta: match[1], body: raw.slice(match[0].length) } : { meta: '', body: raw }
}

/**
 * Ubah teks bebas menjadi slug aman untuk nama folder.
 * "PDF Report Generator" -> "pdf-report-generator"
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 48)
    .replace(/^-+|-+$/g, '')
}
/**
 * Parse blok `skill-draft:` dari balasan LLM.
 *
 * Format yang diharapkan agent (di-inject lewat prompt):
 *
 *   skill-draft: nama-skill | deskripsi singkat
 *   ---
 *   (isi instruksi markdown)
 *
 * Mengembalikan `null` bila tidak ada blok — itu kondisi normal.
 */
export function parseSkillDraft(text: string): SkillDraft | null {
  // Toleran: 'skill-draft:' atau '<skill-draft>' (model sering menambah kurung).
  const marker = /<?skill-draft>?\s*:?\s*([^\n]*)\n([\s\S]*)/i.exec(text)
  if (!marker) return null

  const rawKey = marker[1].trim()
  const rest = marker[2]

  // Potong blok dari sisa balasan (mis. blok file: setelahnya).
  const endMarker = rest.search(/\n\s*(?:file:|<\/?skill-draft>)/i)
  const block = endMarker > 0 ? rest.slice(0, endMarker) : rest

  // Kalau agent memakai frontmatter YAML penuh, ambil field-nya.
  if (/^---\r?\n/.test(block.trim())) {
    const { meta, body } = splitFrontmatter(block)
    return {
      key: slugify(frontmatterField(meta, 'name') || rawKey),
      description: frontmatterField(meta, 'description'),
      body: body.trim(),
    }
  }

  // Format ringkas: "nama-skill | deskripsi" lalu isi.
  const [maybeKey, maybeDesc] = rawKey.split('|').map((s) => s.trim())
  return {
    key: slugify(maybeKey),
    description: maybeDesc ?? '',
    body: block.trim(),
  }
}

/**
 * Periksa draft sebelum ditulis ke disk.
 *
 * Penolakan yang disengaja:
 * - nama tidak aman (karakter aneh, terlalu pendek/panjang),
 * - deskripsi kosong — skill tanpa deskripsi tidak akan pernah dipilih agent,
 * - isi terlalu tipis → biasanya output kosong atau basa-basi,
 * - nama menabrak skill bawaan yang sudah ada (tidak boleh menimpa).
 */
export function validateSkillDraft(
  draft: SkillDraft,
  existingKeys: Set<string>,
): DraftValidation {
  const errors: string[] = []
  const key = slugify(draft.key)

  if (!key) errors.push('nama skill kosong atau tidak punya karakter valid')
  else if (!KEY_RE.test(key)) errors.push(`nama "${key}" tidak valid (hanya a-z, 0-9, tanda hubung)`)

  if (!draft.description || draft.description.length < 20) {
    errors.push('deskripsi wajib diisi (minimal 20 karakter) — itu yang dipakai agent lain memilih skill')
  }
  if (draft.body.trim().length < 300) {
    errors.push(`isi terlalu tipis (${draft.body.trim().length} karakter, minimal 300)`)
  }
  if (existingKeys.has(key)) {
    errors.push(`skill "${key}" sudah ada — jangan menimpa skill yang sudah tersedia`)
  }

  return errors.length === 0 ? { ok: true, errors: [], draft: { ...draft, key } } : { ok: false, errors }
}

/**
 * Simpan draft menjadi SKILL.md yang langsung bisa dipakai.
 * Mengembalikan path file, atau `null` bila penyimpanan gagal.
 */
export async function saveSkillDraft(draft: SkillDraft): Promise<string | null> {
  const key = slugify(draft.key)
  if (!KEY_RE.test(key)) return null

  const dir = path.join(process.cwd(), 'server', 'skills', key)
  const file = path.join(dir, 'SKILL.md')

  const content =
    `---\n` +
    `name: ${key}\n` +
    `description: ${draft.description.replace(/\r?\n/g, ' ').trim()}\n` +
    `---\n\n` +
    `${draft.body.trim()}\n`

  // Guard ukuran: skill raksasa hanya akan membanjiri prompt.
  if (Buffer.byteLength(content, 'utf8') > MAX_SKILL_BYTES) return null

  try {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(file, content, 'utf8')
    return file
  } catch {
    return null
  }
}

/**
 * Seberapa mirip dua deskripsi (0..1).
 * Dipakai engine untuk memutuskan "sudah ada" vs "perlu skill baru".
 */
export function similarity(a: string, b: string): number {
  const tok = (s: string): Set<string> =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\w\s-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3),
    )
  const ta = tok(a)
  const tb = tok(b)
  if (ta.size === 0 || tb.size === 0) return 0

  let shared = 0
  for (const w of ta) if (tb.has(w)) shared++
  return shared / Math.min(ta.size, tb.size)
}
/**
 * Instruksi untuk agent yang BOLEH membuat skill baru.
 *
 * Disuntikkan hanya bila agent berwenang, supaya tidak menambah token untuk
 * agent yang sebenarnya tidak butuh membuat apa pun.
 */
export const SKILL_AUTHORING_PROMPT = [
  '## Kemampuan tambahan: membuat skill sendiri',
  '',
  'Kalau skill yang kamu terima BELUM cukup untuk pekerjaan ini, kamu BOLEH',
  'membuat satu skill baru agar giliran berikutnya dan agent lain lebih cepat.',
  'Kamu ini senior, jadi skill yang kamu tulis harus berisi prosedur',
  'langkah-demi-langkah, bukan nasihat umum.',
  '',
  'Tulis skill DI AWAL balasan, sebelum blok file:, dengan format ini:',
  '',
  'skill-draft: nama-skill-bahasa-inggris | deskripsi satu kalimat kapan skill ini dipakai',
  '---',
  '## Kapan dipakai',
  'Pemicu yang spesifik.',
  '## Langkah',
  '1. ...',
  '2. ...',
  '3. ...',
  '## Perhatikan',
  '- Pitfall yang sering terjadi...',
  '- Contoh singkat...',
  '',
  'Aturan:',
  '- Maksimal SATU skill per giliran.',
  '- Isi minimal 300 karakter. Kalau tidak cukup, jangan buat skill.',
  '- Jangan duplikasi skill yang sudah kamu terima.',
  '- Namanya unik dan belum dipakai skill lain.',
  '- Setelah blok ini, lanjutkan dengan pekerjaan utamamu seperti biasa.',
].join('\n')