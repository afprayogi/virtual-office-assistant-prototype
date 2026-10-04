// tools/test-skill-authoring.mjs — uji parsing + validasi skill buatan agent
// tanpa memanggil LLM, supaya cepat dan deterministik.
import { promises as fs } from 'node:fs'
import path from 'node:path'
// Default import: file .ts dimuat lewat loader tsx, named import tidak selalu
// terdeteksi pada modul ESM.
import authoring from '../lib/skills/authoring.ts'
const { parseSkillDraft, saveSkillDraft, similarity, slugify, validateSkillDraft } = authoring

let pass = 0
let fail = 0
const check = (ok, label, info = '') => {
  if (ok) {
    pass++
    console.log(`  ✓ ${label}${info ? ` — ${info}` : ''}`)
  } else {
    fail++
    console.log(`  ✗ ${label}${info ? ` — ${info}` : ''}`)
  }
}

console.log('1) slugify')
check(slugify('PDF Report Generator') === 'pdf-report-generator', 'judul -> slug', slugify('PDF Report Generator'))
check(slugify('  Riset   Pasar!!  ') === 'riset-pasar', 'spasi & tanda baca dibersihkan')
check(slugify('---') === '', 'slug kosong ditolak')

console.log('\n2) parse draft')
const good = parseSkillDraft(`skill-draft: quarterly-report | Cara membuat laporan kuartalan

## Kapan dipakai
Saat diminta menyusun ringkasan kuartalan.

## Langkah
1. Kumpulkan angka
2. Bandingkan dengan kuartal lalu
3. Tulis ringkasan
`)
check(good?.key === 'quarterly-report', 'nama terbaca', good?.key)
check(good?.description === 'Cara membuat laporan kuartalan', 'deskripsi terbaca', good?.description)
check((good?.body.length ?? 0) > 40, 'isi terbaca', `${good?.body.length} karakter`)
check(parseSkillDraft('ini balasan biasa tanpa draft') === null, 'balasan biasa -> null')
check(parseSkillDraft('<skill-draft>legacy-format | desc\n\nisi skill\n').key === 'legacy-format', 'format kurung sudut diterima')

console.log('\n3) validasi')
const longBody = 'x'.repeat(400)
check(validateSkillDraft({ key: 'ok-name', description: 'deskripsi yang cukup panjang untuk lolos', body: longBody }, new Set()).ok, 'draft sah lolos')
check(!validateSkillDraft({ key: 'ok-name', description: 'pendek', body: longBody }, new Set()).ok, 'deskripsi terlalu pendek ditolak')
check(!validateSkillDraft({ key: 'ok-name', description: 'deskripsi yang cukup panjang untuk lolos', body: 'pendek' }, new Set()).ok, 'isi terlalu tipis ditolak')
check(!validateSkillDraft({ key: 'a', description: 'deskripsi yang cukup panjang untuk lolos', body: longBody }, new Set()).ok, 'nama terlalu pendek ditolak')
// slugify MEMBERSIHKAN nama jahat (Bad_Name! -> bad-name), jadi yang ditolak
// adalah nama yang tidak bisa disanitasi jadi slug sah.
check(!validateSkillDraft({ key: '!!!', description: 'deskripsi yang cukup panjang untuk lolos', body: longBody }, new Set()).ok, 'nama tidak bisa disanitasi ditolak')
check(validateSkillDraft({ key: 'Bad_Name!', description: 'deskripsi yang cukup panjang untuk lolos', body: longBody }, new Set()).draft?.key === 'bad-name', 'nama jahat justru disanitasi jadi slug sah')
const dup = validateSkillDraft({ key: 'frontend-design', description: 'mencoba menimpa skill bawaan', body: longBody }, new Set(['frontend-design']))
check(!dup.ok && dup.errors.some((e) => e.includes('sudah ada')), 'menimpa skill yang ada ditolak', dup.errors[0])

console.log('\n4) similarity')
check(similarity('membuat pdf dari markdown', 'membuat pdf dari markdown') === 1, 'deskripsi identik = 1')
check(similarity('membuat pdf', 'desain warna antarmuka') < 0.3, 'deskripsi berbeda jauh = rendah')

console.log('\n5) simpan ke disk')
const dir = path.join(process.cwd(), 'server', 'skills', 'uji-skill-agent')
await fs.rm(dir, { recursive: true, force: true })
const saved = await saveSkillDraft({ key: 'uji-skill-agent', description: 'Skill uji yang dibuat agent untuk memastikan penulisan disk bekerja.', body: longBody })
check(Boolean(saved), 'file tersimpan', saved ?? 'gagal')
const raw = saved ? await fs.readFile(saved, 'utf8') : ''
check(raw.startsWith('---\nname: uji-skill-agent'), 'frontmatter name benar')
check(/^description: /m.test(raw), 'frontmatter description ada')
await fs.rm(dir, { recursive: true, force: true })
check(!(await fs.readdir(path.join(process.cwd(), 'server', 'skills'))).includes('uji-skill-agent'), 'sisa uji dibersihkan')

console.log(`\nHASIL: ${pass} lulus, ${fail} gagal`)
process.exit(fail === 0 ? 0 : 1)