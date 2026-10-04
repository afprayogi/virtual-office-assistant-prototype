/**
 * Uji orkestrasi: memastikan (a) tiap task hanya jatuh ke agent ber-role cocok,
 * (b) task berjalan PARALEL, (c) skill & guard masuk ke prompt.
 *
 * Jalankan: npx tsx ./tests/orchestration.test.ts
 */
import { DEFAULT_AGENTS } from '../lib/orchestrator/defaults'
import { PHASE_ORDER, TASKS, deliverableFor, isCreativeProject, tasksForPhase } from '../lib/orchestrator/taskRegistry'
import { listSkills } from '../lib/skills/registry'
import { ANCHORS, PROPS, WORKSTATIONS, workstationFor } from '../types/office'
import { validateArtifact, worstOffender } from '../lib/orchestrator/validation'
import { buildReviewPrompt, hierarchyEdges, reviewSubordinate, upstreamContext } from '../lib/orchestrator/hierarchy'
import {
  SKILL_AUTHORING_PROMPT,
  parseSkillDraft,
  slugify,
  validateSkillDraft,
} from '../lib/skills/authoring'
import {
  NEUTRAL,
  POSES,
  SPRITE_H,
  SPRITE_W,
  buildAgentFrames,
  framesOf,
  type AgentPalette,
} from '../components/office/pixel-sprites'
import type { Artifact } from '../types/agent'

async function main() {
  let pass = 0
  let fail = 0
  const check = (ok: boolean, label: string, extra = '') => {
    console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
    ok ? pass++ : fail++
  }

  /* ---- 1) Struktur task: ownerRole selalu ada di roster ---- */
  console.log('1) Registry task vs roster')
  const roles = new Set(DEFAULT_AGENTS.map((a) => a.role))
  const orphans = TASKS.filter((t) => !roles.has(t.ownerRole))
  check(orphans.length === 0, 'semua task punya agent pemilik', `${TASKS.length} task, ${roles.size} peran`)
  if (orphans.length) console.log('    yatim:', orphans.map((t) => `${t.id}→${t.ownerRole}`).join(', '))

  /* ---- 2) Semua agent punya homeStation & guard lengkap ---- */
  console.log('\n2) Kelengkapan agent')
  const noStation = DEFAULT_AGENTS.filter((a) => !a.homeStation)
  const noGuard = DEFAULT_AGENTS.filter((a) => a.guard.cannot.length === 0)
  check(noStation.length === 0, 'semua agent punya homeStation')
  check(noGuard.length === 0, 'semua agent punya daftar "tidak boleh"')
  check(DEFAULT_AGENTS.length === 12, 'jumlah agent = 12', `${DEFAULT_AGENTS.length}`)

  /* ---- 3) Tidak ada dua agent dengan role sama ---- */
  const dupRoles = DEFAULT_AGENTS.map((a) => a.role).filter((r, i, arr) => arr.indexOf(r) !== i)
  check(dupRoles.length === 0, 'tidak ada role duplikat', dupRoles.join(', '))

  /* ---- 4) Skill Anthropic terbaca ---- */
  console.log('\n4b) Role baru punya task dan territory sendiri')
  const ux = DEFAULT_AGENTS.find((a) => a.role === 'UX Designer')
  check(Boolean(ux), 'UX Designer ada di roster', ux?.name ?? '-')
  check(
    TASKS.some((t) => t.ownerRole === 'UX Designer'),
    'UX Designer memegang minimal satu task',
    TASKS.filter((t) => t.ownerRole === 'UX Designer').map((t) => t.id).join(', '),
  )
  check(
    Boolean(ux && ux.guard.cannot.length > 0),
    'UX Designer punya batas wewenang',
    ux?.guard.cannot[0] ?? '-',
  )

  // Tim kreatif: agent + territory + batas wewenang yang tidak saling menabrak.
  console.log('\n4c) Tim kreatif (storyboard & character design)')
  const chara = DEFAULT_AGENTS.find((a) => a.role === 'Character Designer')
  const story = DEFAULT_AGENTS.find((a) => a.role === 'Storyboard Artist')
  check(Boolean(chara), 'Character Designer ada di roster', chara?.name ?? '-')
  check(Boolean(story), 'Storyboard Artist ada di roster', story?.name ?? '-')
  check(
    chara !== undefined && story !== undefined && chara.id !== story.id,
    'dua agent kreatif berbeda orang',
  )
  check(
    TASKS.some((t) => t.ownerRole === 'Character Designer'),
    'Character Designer memegang task sendiri',
    TASKS.filter((t) => t.ownerRole === 'Character Designer').map((t) => t.id).join(', '),
  )
  check(
    TASKS.some((t) => t.ownerRole === 'Storyboard Artist'),
    'Storyboard Artist memegang task sendiri',
    TASKS.filter((t) => t.ownerRole === 'Storyboard Artist').map((t) => t.id).join(', '),
  )
  // Guard harus tegas: mereka tidak boleh saling mengerjakan jobdesc satu sama lain.
  const charaCannot = chara?.guard.cannot.join(' ') ?? ''
  const storyCannot = story?.guard.cannot.join(' ') ?? ''
  check(
    charaCannot.includes('cerita') || charaCannot.includes('storyboard'),
    'Character Designer DILARANG menulis storyboard/cerita',
    chara?.guard.cannot[0] ?? '-',
  )
  check(
    storyCannot.includes('karakter'),
    'Storyboard Artist DILARANG menggambar desain karakter',
    story?.guard.cannot[0] ?? '-',
  )

  // Fase creative = OPSIONAL. Gerbang relevansi inilah yang mencegah proyek
  // backend biasa ikut membayar harga desain karakter + storyboard.
  const creativeTasks = TASKS.filter((t) => t.phase === 'creative')
  check(creativeTasks.length === 3, 'fase creative punya 3 task', `${creativeTasks.length}`)
  check(
    creativeTasks.every((t) => deliverableFor(t.id)?.path.endsWith('.svg') || deliverableFor(t.id)?.path.endsWith('.md')),
    'task creative menghasilkan file (SVG artwork / dokumen)',
    creativeTasks.map((t) => deliverableFor(t.id)?.path).join(', '),
  )
  check(isCreativeProject('bikin game snake versi komik'), 'brief kreatif terdeteksi')
  check(isCreativeProject('buat animasi karakter hero'), 'brief animasi terdeteksi')
  check(!isCreativeProject('bikin API todo list dengan Express'), 'brief backend biasa TIDAK memicu fase creative')
  check(!isCreativeProject(''), 'brief kosong tidak memicu fase creative')

  console.log('\n5) Tiap agent punya komputer sendiri')
  const ids = DEFAULT_AGENTS.map((a) => a.id)
  const stands = new Set<string>()
  let dupStand = ''
  for (const a of DEFAULT_AGENTS) {
    const key = `${a.homeStation.x},${a.homeStation.y}`
    if (stands.has(key)) dupStand += ` ${a.id}`
    stands.add(key)
  }
  check(dupStand === '', 'tidak ada agent berebut satu posisi', dupStand || 'semua unik')
  check(
    DEFAULT_AGENTS.every((a) => workstationFor(a.id, 0).standX === a.homeStation.x),
    'homeStation = workstation milik agent itu',
  )
  const desks = PROPS.filter((p) => p.kind === 'desk').length
  const computers = PROPS.filter((p) => p.kind === 'computer').length
  check(computers >= DEFAULT_AGENTS.length, 'komputer >= jumlah agent', `${computers} komputer`)
  // Ada meja ekstra di ruang rapat/lab/lounge, jadi meja >= komputer.
  check(desks >= computers, 'setiap komputer punya mejanya', `${desks} meja / ${computers} komputer`)
  check(
    Object.keys(WORKSTATIONS).length >= DEFAULT_AGENTS.length,
    'workstation cukup untuk semua agent',
    `${Object.keys(WORKSTATIONS).length} slot`,
  )

  console.log('\n6) Ada developer backend & frontend terpisah')
  const be = DEFAULT_AGENTS.find((a) => a.role === 'Backend Developer')
  const fe = DEFAULT_AGENTS.find((a) => a.role === 'Frontend Developer')
  check(Boolean(be), 'Backend Developer ada', be?.name ?? '-')
  check(Boolean(fe), 'Frontend Developer ada', fe?.name ?? '-')
  check(
    be?.guard.cannot.some((c) => c.includes('tampilan')) === true,
    'Backend DILARANG menggarap tampilan',
  )
  check(
    fe?.guard.cannot.some((c) => c.includes('server')) === true,
    'Frontend DILARANG menulis server',
  )
  const beTask = TASKS.find((t) => t.ownerRole === 'Backend Developer')
  const feTask = TASKS.find((t) => t.ownerRole === 'Frontend Developer')
  check(
    Boolean(beTask) && beTask?.id !== feTask?.id,
    'mereka punya task terpisah',
    `${beTask?.id} vs ${feTask?.id}`,
  )

  console.log('\n6) Validasi hasil kerja (sesuai / perlu revisi)')
  const goodCode = `export interface Order { id: string; total: number }\nexport function calcTotal(o: Order) { return o.total }`
  const vGood = validateArtifact('code-impl', 'src/api.ts', goodCode)
  check(vGood.verdict === 'sesuai', 'kode lengkap = sesuai', vGood.summary)

  const vShort = validateArtifact('code-impl', 'src/api.ts', 'export const a=1')
  check(vShort.verdict === 'perlu-revisi', 'kode terlalu pendek = perlu revisi', vShort.summary)

  const vMissing = validateArtifact('code-impl', 'src/api.ts', 'lorem ipsum dolor sit amet '.repeat(20))
  check(
    vMissing.verdict === 'perlu-revisi',
    'isi panjang tapi tanpa kata kunci = perlu revisi',
    vMissing.summary,
  )

  // Sebelah fence ``` yang tidak pernah ditutup (jumlah fence ganjil).
  const vFence = validateArtifact('req-spec', 'docs/spec.md', '```ts\nexport function a() { return 1 }\n')
  check(
    vFence.criteria.find((c) => c.label === 'Blok kode utuh')?.ok === false,
    'blok kode tak tertutup terdeteksi',
    vFence.summary,
  )
  check(
    validateArtifact('req-spec', 'docs/spec.md', '```ts\nexport function a() { return 1 }\n```\n')
      .criteria.find((c) => c.label === 'Blok kode utuh')?.ok === true,
    'blok kode tertutup dianggap utuh',
  )

  check(worstOffender([vGood, vShort])?.path === 'src/api.ts', 'worstOffender memilih skor terendah')
  check(worstOffender([vGood]) === null, 'tidak ada offender bila semua sesuai')

  console.log('\n7) Atasan reviewing bawahan & reproses')
  const edges = hierarchyEdges(TASKS)
  check(edges.length > 0, 'ada relasi atasan → bawahan', `${edges.length} task melapor`)
  check(
    edges.every((e) => DEFAULT_AGENTS.some((a) => a.role === e.parent)),
    'setiap atasan ada di roster',
  )
  check(
    TASKS.filter((t) => t.reportsTo).every((t) => DEFAULT_AGENTS.some((a) => a.role === t.ownerRole)),
    'setiap bawahan ada di roster',
  )
  check(
    TASKS.filter((t) => (t.dependsOn ?? []).length > 0).length >= 8,
    'banyak task membaca hasil kerja rekannya',
    `${TASKS.filter((t) => (t.dependsOn ?? []).length > 0).length} task punya dependsOn`,
  )
  check(
    TASKS.every((t) => !(t.dependsOn ?? []).includes(t.id)),
    'task tidak bergantung pada dirinya sendiri',
  )
  // Siklus dependency = deadlock logika.
  const byId = new Map(TASKS.map((t) => [t.id, t]))
  const visiting = new Set<string>()
  const done = new Set<string>()
  let cycle = false
  const walk = (id: string): void => {
    if (cycle) return
    if (done.has(id)) return
    if (visiting.has(id)) { cycle = true; return }
    visiting.add(id)
    for (const d of byId.get(id)?.dependsOn ?? []) walk(d)
    visiting.delete(id)
    done.add(id)
  }
  TASKS.forEach((t) => walk(t.id))
  check(!cycle, 'tidak ada siklus dependsOn (akan deadlock)')

  // Handoff: apa yang dibaca task hilir harus berisi ISI file, bukan namanya.
  const depTask = TASKS.find((t) => (t.dependsOn ?? []).includes('code-impl'))!
  const mkFile = (content: string): Artifact => ({
    id: 'a1',
    path: 'src/server/api.ts',
    language: 'ts',
    kind: 'code',
    content,
    agentId: 'be',
    agentName: 'Budi',
    createdAt: 0,
  })
  const outputs = new Map<string, Artifact[]>([
    ['code-impl', [mkFile('export function handler() {}')]],
  ])
  const ctx = upstreamContext(depTask, outputs)
  check(ctx.includes('src/server/api.ts'), 'konteks handoff menyebut path file', ctx.slice(0, 60))
  check(ctx.includes('export function handler'), 'konteks handoff memuat ISI file')
  check(upstreamContext({ ...depTask, dependsOn: [] }, outputs) === '', 'tanpa dependency → konteks kosong')

  // Atasan menolak → wajib dapat verdict perlu-revisi.
  const badTask = TASKS.find((t) => t.id === 'code-impl')!
  const badFiles = [mkFile('done')]
  const rv = reviewSubordinate(badTask, badFiles, 'Lead Developer')
  check(rv[0].verdict === 'perlu-revisi', 'atasan menolak hasil yang tidak sesuai', rv[0].summary)
  check(rv[0].requestedBy === 'Lead Developer', 'verdict mencatat siapa yang meninjau')
  const prompt = buildReviewPrompt(badTask, badFiles)
  check(prompt.includes('src/server/api.ts') && prompt.includes('done'), 'prompt review memuat file bawahan')

  console.log('\n8) Berdiskusi = duduk di meja rapat')
  const seats = ANCHORS.meeting
  check(seats.length >= 2, 'ada kursi di ruang rapat', `${seats.length} kursi`)
  check(
    seats.every((s) => {
      const inRoom = s.x >= 1 && s.x <= 10 && s.y >= 4 && s.y <= 10
      return inRoom
    }),
    'semua kursi berada di dalam ruang rapat',
  )
  const uniq = new Set(seats.map((s) => `${s.x},${s.y}`))
  check(uniq.size === seats.length, 'kursi tidak tumpang tindih', `${uniq.size}/${seats.length}`)
  check(
    PROPS.filter((p) => p.kind === 'chair').length >= seats.length,
    'setiap kursi punya gambar kursi',
    `${PROPS.filter((p) => p.kind === 'chair').length} kursi digambar`,
  )
  const consultTasks = TASKS.filter((t) => (t.consult ?? []).length > 0)
  check(consultTasks.length > 0, 'ada task yang memicu diskusi', `${consultTasks.length} task`)

  console.log('\n7) Agent bisa membuat skill sendiri')
  check(SKILL_AUTHORING_PROMPT.includes('skill-draft:'), 'instruksi authoring ada di prompt')
  check(
    SKILL_AUTHORING_PROMPT.length < 2000,
    'instruksi authoring ringkas (hemat token)',
    `${SKILL_AUTHORING_PROMPT.length} karakter`,
  )
  // Isi sengaja dibuat >= 300 karakter: draft tipis harus ditolak.
  const skillBody =
    '## Kapan dipakai\nSaat diminta menyusun ringkasan kuartalan untuk Direksi.\n\n' +
    '## Langkah\n' +
    '1. Kumpulkan seluruh angka keuangan dari modul akuntansi.\n' +
    '2. Bandingkan dengan kuartal sebelumnya dan tahun lalu.\n' +
    '3. Tandai penyimpangan yang melebihi sepuluh persen.\n' +
    '4. Susun tabel ringkas dan tulis paragraf penjelasan.\n' +
    '5. Minta persetujuan atasan sebelum dikirim.\n\n' +
    '## Perhatikan\n' +
    '- Jangan menyimpulkan penyebab tanpa data pendukung.\n' +
    '- Satuan angka harus konsisten (juta rupiah).\n'
  const draft = parseSkillDraft(
    'skill-draft: quarterly-report | Cara menyusun ringkasan kuartalan\n\n' + skillBody,
  )
  check(draft?.key === 'quarterly-report', 'draft dari balasan agent ter-parse', draft?.key ?? '(null)')
  check(validateSkillDraft(draft!, new Set()).ok, 'draft yang baik lolos validasi')
  check(
    !validateSkillDraft(
      { key: 'frontend-design', description: 'mencoba menimpa bawaan', body: 'x'.repeat(400) },
      new Set(['frontend-design']),
    ).ok,
    'skill bawaan tidak boleh ditimpa',
  )
  check(!validateSkillDraft(draft!, new Set(['quarterly-report'])).ok, 'skill ganda ditolak')
  check(slugify('PDF Report Generator') === 'pdf-report-generator', 'nama skill disanitasi jadi slug')
  check(parseSkillDraft('balasan biasa') === null, 'balasan tanpa draft -> null')

  console.log('\n8) Pixel art grid')
  // POSE bisa berupa array of frames (walk/type) ATAU satu sprite yang
  // berupa array of baris (stand/sit/wave). Bedakan lewat ISI elemen pertama —
  // `Array.isArray(v)` selalu true dan akan memecah sprite tunggal jadi
  // daftar baris, persis bug yang dulu membuat karakter tidak tampil.
  const poseList = Object.values(POSES).flatMap((v) => framesOf(v))
  check(poseList.length > 0, 'ada sprite pixel art', `${poseList.length} pose`)
  check(poseList.every((s) => s.length === SPRITE_H), 'semua sprite 32 baris')
  check(
    poseList.every((s) => s.every((r) => r.length === SPRITE_W)),
    'semua baris tepat 16 piksel',
  )
  // REGRESI: setiap frame harus berupa sprite utuh (32 baris string), bukan
  // satu baris string. Kalau ini bocor, `stamp()`/`rasterize()` akan melempar
  // TypeError di frame pertama dan tidak ada karakter yang tergambar.
  check(
    poseList.every((s) => typeof s[0] === 'string'),
    'setiap frame adalah sprite utuh (bukan satu baris)',
  )
  check(
    Object.values(POSES).every((p) => framesOf(p).every((f) => Array.isArray(f))),
    'framesOf() menormalkan tiap pose jadi daftar sprite',
  )
  const symbols = new Set(poseList.flatMap((s) => s.join('').split('')))
  /**
   * Alfabet resmi sprite — cerminan daftar simbol di header pixel-sprites.ts:
   * '.' transparan, S kulit, B kulit gelap, H rambut, C baju, c bayangan
   * baju, P celana, K sepatu, E mata, M mulut, A aksesori.
   *
   * Alfabet ini WAJIB sama persis dengan isi palet (NEUTRAL + 'A'). Kalau
   * tidak, simbol bisa lolos cek "ada di palet" padahal tidak punya warna
   * (atau sebaliknya) — dan gridnya diam-diam kehilangan satu karakter.
   */
  const ALPHABET = '.SBHCcPKEMA'
  check(
    [...new Set(ALPHABET)].every((s) => s === 'A' || s === '.' || s in NEUTRAL),
    'alfabet sprite cocok dengan palet',
    ALPHABET,
  )
  check(
    [...symbols].every((s) => ALPHABET.includes(s)),
    'semua simbol ada di palet',
    [...symbols].join(''),
  )
  check(symbols.has('.'), 'ada piksel transparan')
  check(
    // 'A' = aksesori, warnanya datang dari palet agent (bukan NEUTRAL).
    [...symbols].every((s) => s === 'A' || s === '.' || s in NEUTRAL),
    'setiap simbol punya warna (A = palet agent)',
  )
  check(POSES.walk.length === 4, 'animasi jalan punya 4 frame', `${POSES.walk.length}`)

  // REGRESI UTAMA — menjalankan rasterizer sungguhan (bukan hanya cek bentuk).
  // Node tidak punya DOM, jadi kita pasang stub `document.createElement('canvas')`
  // yang mencatat setiap fillRect. Stub ini membuat `buildAgentFrames()` benar
  // benar berjalan: sprite tunggal yang salah dipisah jadi daftar baris akan
  // membuat `stamp()` memanggil .map() pada string dan melempar TypeError.
  const fillCalls: number[] = []
  const realDoc = (globalThis as { document?: unknown }).document
  ;(globalThis as { document?: unknown }).document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        imageSmoothingEnabled: true,
        fillStyle: '',
        fillRect: () => { fillCalls.push(1) },
      }),
    }),
  }
  let framesOk = false
  let framesErr = ''
  try {
    const palette: AgentPalette = { ...NEUTRAL, A: '#dc2626' }
    const built = buildAgentFrames(palette, 2, 'cap')
    // Tiap pose harus punya frame, dan tidak boleh ada frame kosong.
    framesOk =
      Object.keys(POSES).every((k) => {
        const list = built[k as keyof typeof built]
        return Array.isArray(list) && list.length > 0 && list.every(Boolean)
      }) &&
      // Aksesori 'cap' menimpa rambut dengan simbol 'A' -> harus ada piksel.
      fillCalls.length > 0
  } catch (e) {
    framesErr = e instanceof Error ? e.message : String(e)
  } finally {
    ;(globalThis as { document?: unknown }).document = realDoc
  }
  check(framesOk, 'buildAgentFrames() meraster semua pose tanpa error', framesErr || `${fillCalls.length} piksel`)

  console.log('\n9) Skill Anthropic')
  const skills = await listSkills()
  check(skills.length > 0, 'SKILL.md terbaca', `${skills.length} skill`)
  const usedKeys = new Set(TASKS.flatMap((t) => t.skillKeys ?? []))
  const missing = [...usedKeys].filter((k) => !skills.some((s) => s.key === k))
  check(missing.length === 0, 'semua skillKeys task tersedia', missing.join(', ') || 'semua ada')

  /* ---- 5) Simulasi: cek agent mana mengerjakan task apa ---- */
  console.log('\n4) Simulasi dispatch task (5 fase)')
  const assigned: Record<string, string[]> = {}
  for (const phase of PHASE_ORDER) {
    const owners = tasksForPhase(phase).map((t) => {
      const agent = DEFAULT_AGENTS.find((a) => a.role === t.ownerRole)
      return agent ? `${agent.name}(${agent.role})` : `TANPA PEMILIK:${t.ownerRole}`
    })
    assigned[phase] = owners
  }
  const anyOrphan = Object.values(assigned).flat().some((o) => o.startsWith('TANPA'))
  check(!anyOrphan, 'tidak ada task tanpa pemilik di semua fase')
  for (const phase of PHASE_ORDER) {
    console.log(`    ${phase.padEnd(13)} → ${assigned[phase].join(' | ')}`)
  }

  // Cek QA tidak pernah memegang task coding/arsitektur.
  const qaTasks = TASKS.filter((t) => t.ownerRole === 'QA Automation').map((t) => t.id)
  const qaBad = qaTasks.some((id) => id.includes('impl') || id.includes('arch'))
  check(!qaBad, 'QA tidak memegang task implementasi/arsitektur', qaTasks.join(', '))

  // Cek CEO tidak memegang task teknis.
  const ceoTasks = TASKS.filter((t) => t.ownerRole === 'CEO').map((t) => t.id)
  const ceoBad = ceoTasks.some((id) => id.includes('impl') || id.includes('test-plan'))
  check(!ceoBad, 'CEO tidak memegang task teknis', ceoTasks.join(', '))

  console.log(`\nHASIL: ${pass} lulus, ${fail} gagal`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error('GAGAL:', e)
  process.exit(1)
})