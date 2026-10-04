/**
 * lib/orchestrator/taskRegistry.ts
 * ---------------------------------------------------------------------------
 * Registry task per fase. Inilah yang memaksa agent bekerja sesuai perannya.
 *
 * PRINSIP: setiap task punya `ownerRole` yang pasti. Engine HANYA menugaskan
 * task ke agent dengan role tersebut. Tidak ada lagi "semua agent mengerjakan
 * instruksi fase yang sama" — itulah penyebab utama QA ikut menulis kode.
 * ---------------------------------------------------------------------------
 */
import type { Deliverable, PhaseTask, WorkflowPhase } from '@/types/agent'

export const PHASE_ORDER: readonly WorkflowPhase[] = [
  'requirement',
  'design',
  'creative',
  'coding',
  'testing',
  'documenting',
]

/** Label friendly untuk tiap fase (dipakai UI). */
export const PHASE_LABEL: Record<WorkflowPhase, string> = {
  requirement: 'Requirement',
  design: 'Design',
  creative: 'Creative',
  coding: 'Coding',
  testing: 'Testing',
  documenting: 'Documenting',
  done: 'Done',
}

/**
 * Apakah fase `creative` relevan untuk brief proyek ini?
 *
 * Tanpa gerbang ini, SETIAP proyek — termasuk backend biasa — akan menganggap
 * diri butuh desain karakter dan storyboard. Itu pekerjaan sia-sia yang juga
 * membakar kuota gateway.
 *
 * Sebaliknya, kalau terlalu ketat, proyek berisi kata "game" atau "animasi"
 * akan terlewat. Maka daftar ini sengaja lebar, dan satu sinyal dari dokumen
 * hasil fase sebelumnya (req-vision / req-spec) juga ikut dipertimbangkan.
 */
const CREATIVE_KEYWORDS = [
  // naratif & sastra
  'cerita', 'dongeng', 'novel', 'skenario', 'naskah',
  'komik', 'manga', 'anime', 'drama', 'film', 'layar', 'serial', 'episode',
  // visual & karakter
  'karakter', 'tokoh', 'pahlawan', 'protagonis', 'antagonis',
  'desain karakter', 'character design', 'storyboard', 'visual novel',
  // permainan & animasi
  'game', 'games', 'level design', 'animasi', 'animation', 'sprite',
  'pixel art', 'webtoon',
].map((k) => k.toLowerCase())

/**
 * True bila proyek jelas-jelas berbudaya (cerita/karakter/game/animasi).
 *
 * Fungsi ini yang membuat fase `creative` OPSIONAL: untuk proyek software
 * biasa fase ini kosong dan dilewati, jadi tidak ada agent yang sia-sia bekerja.
 */
export function isCreativeProject(text: string): boolean {
  const t = (text ?? '').toLowerCase()
  if (!t.trim()) return false
  return CREATIVE_KEYWORDS.some((k) => t.includes(k))
}

export const TASKS: PhaseTask[] = [
  /* ------------------------------ REQUIREMENT ----------------------------- */
  {
    id: 'req-vision',
    phase: 'requirement',
    ownerRole: 'CEO',
    activity: 'chat',
    title: 'Visi & prioritas produk',
    instruction:
      'Tetapkan visi produk, target pengguna, dan 3 prioritas utama. ' +
      'Jawab tegas dan singkat. Jangan menulis kode atau test.',
    consult: ['pm'],
    skillKeys: ['internal-comms'],
  },
  {
    id: 'req-spec',
    phase: 'requirement',
    ownerRole: 'Product Manager',
    activity: 'chat',
    title: 'User story & acceptance criteria',
    instruction:
      'Susun user story utama beserta acceptance criteria yang bisa diuji. ' +
      'Jelaskan batas scope dan apa yang TIDAK termasuk. Jangan menulis kode.',
    consult: ['ba'],
    skillKeys: ['doc-coauthoring'],
    reportsTo: 'CEO',
    dependsOn: ['req-vision'],
  },
  {
    id: 'req-analysis',
    phase: 'requirement',
    ownerRole: 'Business Analyst',
    activity: 'chat',
    title: 'Analisis kebutuhan & risiko',
    instruction:
      'Analisis kebutuhan pengguna dari sudut data: pola usage, edge case, ' +
      'dan risiko utama. Beri rekomendasi yang bisa ditindaklanjuti tim. ' +
      'Jangan menulis kode.',
    consult: ['pm'],
    skillKeys: ['doc-coauthoring'],
    reportsTo: 'CEO',
    dependsOn: ['req-vision', 'req-spec'],
  },

  /* --------------------------------- DESIGN ------------------------------- */
  {
    id: 'design-arch',
    phase: 'design',
    ownerRole: 'Lead Developer',
    activity: 'work',
    title: 'Arsitektur teknis',
    instruction:
      'Rancang arsitektur: pilih stack, module boundaries, dan data flow. ' +
      'Jelaskan trade-off tiap pilihan. Sertakan diagram bila perlu.',
    skillKeys: ['frontend-design', 'canvas-design'],
    reportsTo: 'CEO',
    dependsOn: ['req-spec', 'req-analysis'],
  },
  {
    id: 'design-risk',
    phase: 'design',
    ownerRole: 'Code Reviewer',
    activity: 'review',
    title: 'Review risiko arsitektur',
    instruction:
      'Tinjau rencana arsitektur dari sisi risiko: keamanan, performa, dan ' +
      'rawatan. Sebutkan blocking issue beserta tingkat keparahan. ' +
      'Jangan menulis kode implementasi.',
    consult: ['dev'],
    skillKeys: [],
    reportsTo: 'Lead Developer',
    dependsOn: ['design-arch'],
  },
  {
    id: 'design-ux',
    phase: 'design',
    ownerRole: 'Demo Engineer',
    activity: 'work',
    title: 'Rancangan alur layar',
    instruction:
      'Rancang alur layar utama dan komponen UI yang dibutuhkan. ' +
      'Fokus pada pengalaman pengguna, bukan logika bisnis.',
    skillKeys: ['frontend-design', 'theme-factory'],
  },
  {
    id: 'design-system',
    phase: 'design',
    ownerRole: 'UX Designer',
    activity: 'work',
    title: 'Susun design system',
    instruction:
      'Susun design system untuk developer: pilihan warna dan tipografi, ' +
      'skala spasi, daftar komponen beserta variantnya, serta aturan ' +
      'Aksesibilitas yang bisa diukur. Fokus keputusan visual, bukan kode.',
    consult: ['pm'],
    skillKeys: ['frontend-design', 'theme-factory', 'brand-guidelines'],
    reportsTo: 'Lead Developer',
  },

  /* -------------------------------- CREATIVE ----------------------------- */
  // Fase opsional: hanya diisi bila `isCreativeProject(brief)` true. Tanpa
  // gerbang itu, proyek backend biasa akan ikut masuk jalur creative.
  {
    id: 'creative-character',
    phase: 'creative',
    ownerRole: 'Character Designer',
    activity: 'work',
    title: 'Desain karakter',
    instruction:
      'Rancang tokoh utama dari brief proyek. Gambar SATU sheet SVG berisi ' +
      'character turnaround 3 panel (depan, samping 3/4, belakang) dengan ' +
      'siluet, proporsi, dan ekspresi yang konsisten antar panel. Sertakan ' +
      'color palette bernilai hex di dalam sheet itu. Beri label nama tokoh ' +
      'dan singkatnya ciri khas. JANGAN menulis alur cerita - itu tugas lain.',
    consult: ['story'],
    skillKeys: ['canvas-design'],
    reportsTo: 'Storyboard Artist',
    dependsOn: ['req-vision', 'design-system'],
  },
  {
    id: 'creative-storyboard',
    phase: 'creative',
    ownerRole: 'Storyboard Artist',
    activity: 'demo',
    title: 'Storyboard adegan',
    instruction:
      'Ubah cerita dari brief menjadi storyboard sheet dalam SVG: 6 panel ' +
      'berurutan dengan nomor shot, keterangan angle kamera, dan dialog ' +
      'singkat. Beri judul adegan pada tiap panel. Pakai palet warna yang ' +
      'konsisten antar panel.',
    consult: ['chara'],
    skillKeys: ['canvas-design'],
    reportsTo: 'CEO',
    dependsOn: ['creative-character'],
  },
  {
    id: 'creative-narrative',
    phase: 'creative',
    ownerRole: 'Storyboard Artist',
    activity: 'chat',
    title: 'Struktur cerita',
    instruction:
      'Tulis struktur cerita: logline satu kalimat, daftar tokoh utama ' +
      'beserta motifnya, dan pembagian tiga akt dengan titik balik di akt dua. ' +
      'Ringkas dan spesifik, bukan caption umum.',
    consult: ['chara'],
    skillKeys: ['canvas-design'],
    reportsTo: 'CEO',
    dependsOn: ['req-vision'],
  },

  {
    id: 'code-impl',
    phase: 'coding',
    ownerRole: 'Backend Developer',
    activity: 'work',
    title: 'Implementasi backend',
    instruction:
      'Tulis sisi server sesuai arsitektur: model data, endpoint API, dan ' +
      'penanganan error. TypeScript bertipe dan lengkap, tanpa penjelasan ' +
      'berlebihan.',
    skillKeys: ['claude-api', 'webapp-testing'],
    reportsTo: 'Lead Developer',
    dependsOn: ['design-arch'],
  },
  {
    id: 'code-frontend',
    phase: 'coding',
    ownerRole: 'Frontend Developer',
    activity: 'work',
    title: 'Implementasi frontend',
    instruction:
      'Tulis sisi klien: komponen, state, dan pemanggilan API. ' +
      'TypeScript bertipe, aksesibel, dan siap di-render.',
    skillKeys: ['frontend-design', 'theme-factory'],
    reportsTo: 'Lead Developer',
    dependsOn: ['design-arch', 'design-system'],
  },
  {
    id: 'code-review',
    phase: 'coding',
    ownerRole: 'Code Reviewer',
    activity: 'review',
    title: 'Review kode implementasi',
    instruction:
      'Tinjau kode yang baru ditulis: kebenaran, edge case, keamanan. ' +
      'Jangan menulis ulang implementasinya — cukup temuan dan saran konkret.',
    consult: ['dev'],
    skillKeys: [],
    reportsTo: 'Lead Developer',
    dependsOn: ['code-impl', 'code-frontend'],
  },
  {
    id: 'code-ui',
    phase: 'coding',
    ownerRole: 'Demo Engineer',
    activity: 'work',
    title: 'Bangun prototipe tampilan',
    instruction:
      'Buat prototipe UI yang bisa didemokan dari acceptance criteria. ' +
      'Prioritaskan yang terlihat oleh pengguna akhir.',
    skillKeys: ['frontend-design', 'theme-factory', 'brand-guidelines'],
    reportsTo: 'Lead Developer',
    dependsOn: ['design-ux', 'req-spec'],
  },

  /* -------------------------------- TESTING ------------------------------- */
  {
    id: 'test-plan',
    phase: 'testing',
    ownerRole: 'QA Automation',
    activity: 'test',
    title: 'Rencana pengujian',
    instruction:
      'Susun skenario uji, kasus tepi, dan kriteria lulus/gagal. ' +
      'Prioritaskan P0/P1/P2. Jangan menulis kode fitur.',
    skillKeys: ['webapp-testing'],
    reportsTo: 'Lead Developer',
    dependsOn: ['req-spec', 'code-impl', 'code-frontend'],
  },
  {
    id: 'test-verify',
    phase: 'testing',
    ownerRole: 'Business Analyst',
    activity: 'test',
    title: 'Validasi kesesuaian requirement',
    instruction:
      'Verifikasi apakah solusi yang dibangun memenuhi requirement awal. ' +
      'Buat matriks requirement lalu statusnya. Jangan menulis kode.',
    consult: ['qa'],
    skillKeys: ['doc-coauthoring'],
    reportsTo: 'Product Manager',
    dependsOn: ['req-spec', 'code-impl', 'code-frontend'],
  },
  {
    id: 'test-demo',
    phase: 'testing',
    ownerRole: 'Demo Engineer',
    activity: 'demo',
    title: 'Siapkan skrip demo',
    instruction:
      'Siapkan langkah demo yang akan ditunjukkan ke stakeholder, ' +
      'termasuk narasi singkat dan alur highlight. ' +
      'Jangan menulis kode backend.',
    skillKeys: ['frontend-design', 'brand-guidelines'],
    reportsTo: 'Lead Developer',
    dependsOn: ['code-ui', 'req-spec'],
  },

  /* ------------------------------ DOCUMENTING ----------------------------- */
  {
    id: 'doc-guide',
    phase: 'documenting',
    ownerRole: 'Product Manager',
    activity: 'lounge',
    title: 'Panduan produk',
    instruction:
      'Tulis panduan penggunaan singkat untuk pengguna akhir. ' +
      'Bahasa sederhana, banyak contoh langkah. Jangan menulis kode.',
    skillKeys: ['doc-coauthoring'],
    reportsTo: 'CEO',
    dependsOn: ['test-verify'],
  },
  {
    id: 'doc-release',
    phase: 'documenting',
    ownerRole: 'CEO',
    activity: 'lounge',
    title: 'Catatan rilis & metrik',
    instruction:
      'Rangkum apa yang rilis ini kerjakan, metrik keberhasilan, dan langkah ' +
      'berikutnya. Bentuk ringkas untuk stakeholder. Jangan menulis kode.',
    skillKeys: ['internal-comms'],
    dependsOn: ['doc-guide', 'test-verify'],
  },
  {
    id: 'doc-handoff',
    phase: 'documenting',
    ownerRole: 'Code Reviewer',
    activity: 'lounge',
    title: 'Catatan technical handoff',
    instruction:
      'Tulis catatan serah terima teknis: keputusan desain penting, ' +
      'utang teknis yang perlu diperhatikan, dan lokasi kode utama.',
    skillKeys: ['internal-comms'],
    reportsTo: 'Lead Developer',
    dependsOn: ['code-impl', 'code-frontend', 'test-plan'],
  },
]

/**
 * Hasil kerja wajib per task. Inilah yang membuat Workspace berisi FILE,
 * bukan cuplikan percakapan: agent diminta menulis file dengan path nyata.
 */
const DELIVERABLES: Record<string, Deliverable> = {
  // --- Requirement: dokumen resmi -> PDF ---
  'req-vision': { path: 'docs/product-vision.pdf', language: 'md', kind: 'pdf', output: 'pdf', brief: 'Visi produk, target pengguna, 3 prioritas utama, dan metrik keberhasilan.' },
  'req-spec': { path: 'docs/user-stories.pdf', language: 'md', kind: 'pdf', output: 'pdf', brief: 'Daftar user story dengan acceptance criteria dan batas scope (termasuk apa yang TIDAK termasuk).' },
  'req-analysis': { path: 'docs/risk-analysis.md', language: 'md', kind: 'markdown', output: 'markdown', brief: 'Tabel 3 risiko utama: dampak, kemungkinan, mitigasi, dan siapa penanggung jawabnya. Tulis sebagai dokumen, bukan jawaban singkat.' },

  // --- Design: arsitektur PDF, review + ux sebagai dokumen ---
  'design-arch': { path: 'docs/architecture.pdf', language: 'md', kind: 'pdf', output: 'pdf', brief: 'Rancangan arsitektur: pilihan stack, module boundaries, dan alur data.' },
  'design-risk': { path: 'docs/architecture-review.md', language: 'md', kind: 'markdown', output: 'markdown', brief: 'Temuan arsitektur berdasar severity (BLOCKER/MAJOR/MINOR) dengan saran perbaikan konkret per temuan.' },
  // UX Designer punya satu deliverable sendiri: sistem visual.
  'design-system': { path: 'docs/design-system.md', language: 'md', kind: 'markdown', output: 'markdown', brief: 'Design token (warna, tipografi, spasi), daftar komponen UI, dan aturan aksesibilitas (kontras, ukuran font minimum, target sentuh).' },
  'design-ux': { path: 'docs/ux-flows.md', language: 'md', kind: 'markdown', output: 'markdown', brief: 'Daftar layar utama, komponen UI yang dibutuhkan tiap layar, dan empty state tiap layar. Sertakan diagram alur sederhana.' },

  // --- Creative (fase opsional): artwork asli, bukan dokumen ---
  'creative-character': { path: 'art/character-sheet.svg', language: 'svg', kind: 'svg', output: 'code', brief: 'Sheet karakter: 3 panel turnaround (depan, samping 3/4, belakang) + color palette hex. Bentuk SVG lengkap dengan viewBox.' },
  'creative-storyboard': { path: 'art/storyboard-sheet.svg', language: 'svg', kind: 'svg', output: 'code', brief: 'Sheet storyboard: 6 panel dengan nomor shot, angle kamera, dan dialog. Bentuk SVG lengkap dengan viewBox.' },
  'creative-narrative': { path: 'docs/story-bible.md', language: 'md', kind: 'markdown', output: 'markdown', brief: 'Logline, daftar tokoh beserta motifnya, dan struktur tiga akt dengan titik balik. Tulis sebagai dokumen, bukan jawaban singkat.' },

  // --- Coding: program sungguhan ---
  'code-impl': { path: 'src/server/api.ts', language: 'ts', kind: 'code', output: 'code', brief: 'Implementasi backend TypeScript lengkap: tipe, model data, endpoint API, dan penanganan error. Harus bisa dikompilasi.' },
  'code-frontend': { path: 'src/client/ui.ts', language: 'ts', kind: 'code', output: 'code', brief: 'Implementasi frontend TypeScript lengkap: komponen, state, dan pemanggilan API. Harus bisa dikompilasi.' },
  'code-ui': { path: 'preview/app.html', language: 'html', kind: 'html', output: 'code', brief: 'Prototipe UI HTML satu file (self-contained, inline CSS) yang bisa langsung dibuka di browser.' },
  'code-review': { path: 'docs/code-review.md', language: 'md', kind: 'markdown', output: 'markdown', brief: 'Temuan review per file dengan severity (BLOCKER/MAJOR/MINOR) dan satu kalimat perbaikan konkret. Tulis temuan yang nyata dari isi file, bukan umum.' },

  // --- Testing: test plan PDF, verifikasi + demo sebagai dokumen ---
  'test-plan': { path: 'docs/test-plan.pdf', language: 'md', kind: 'pdf', output: 'pdf', brief: 'Tabel skenario uji: ID, skenario, langkah, expected result, priority (P0/P1/P2).' },
  'test-verify': { path: 'docs/traceability.md', language: 'md', kind: 'markdown', output: 'markdown', brief: 'Matriks traceability requirement: ID requirement, status (TERPENUHI/BELUM), dan bukti (path file + hasil eksekusi bila ada).' },
  'test-demo': { path: 'docs/demo-script.md', language: 'md', kind: 'markdown', output: 'markdown', brief: 'Skrip demo bernomor: langkah, narasi singkat, poin highlight, dan perintah yang dipakai untuk menjalankan demo.' },

  // --- Documenting: panduan PDF, rilis + handoff sebagai dokumen ---
  'doc-guide': { path: 'docs/user-guide.pdf', language: 'md', kind: 'pdf', output: 'pdf', brief: 'Panduan pengguna akhir dengan langkah bernomor dan contoh pemakaian nyata.' },
  'doc-release': { path: 'docs/release-notes.md', language: 'md', kind: 'markdown', output: 'markdown', brief: 'Ringkasan rilis: fitur baru, perbaikan, dan langkah berikutnya. Sebutkan file mana yang berubah.' },
  'doc-handoff': { path: 'docs/technical-handoff.md', language: 'md', kind: 'markdown', output: 'markdown', brief: 'Catatan serah terima: keputusan desain kunci, utang teknis, dan langkah berikutnya untuk whoever menerima proyek.' },
}

/**
 * Petunjuk output yang disisipkan ke prompt owner.
 *
 * Dua mode, mengikuti bentuk yang diminta:
 *  - Mode FILE  → agent menulis blok `file:<path>` (program / dokumen / PDF).
 *  - Mode CHAT → TIDAK ada file; agent menjawab singkat dan langsung ke inti.
 *
 * Mode chat sengaja tidak boleh membuat file. Itu yang menjaga Workspace
 * berisi "hasil dalam bentuk yang benar" — tidak semua tugas perlu dokumen.
 */
export function deliverablePrompt(d: Deliverable): string {
  if (d.output === 'chat') {
    return (
      `\n\nCARA JAWAB - WAJIB:\n` +
      `Ini tugas BERBICARA, bukan menulis file. Jawab langsung di chat.\n` +
      `- Maksimal ${d.maxWords ?? 120} kata.\n` +
      `- Isi: ${d.brief}\n` +
      `- Tanpa pengulangan, tanpa basa-basi, tanpa penutup offer bantuan.\n` +
      `- JANGAN menulis blok kode atau membuat file untuk tugas ini.`
    )
  }

  const ext = d.output === 'pdf' ? 'pdf' : d.language
  const isDoc = d.output === 'markdown'
  return (
    `\n\nKETENTUAN OUTPUT - WAJIB:\n` +
    `Tulis hasil kerja sebagai file sungguhan di dalam satu blok kode berformat:\n` +
    '```file:' + d.path + '\n' +
    `<isi file ${d.output === 'pdf' ? 'Markdown yang akan dikonversi ke PDF' : ext} lengkap>\n` +
    '```\n' +
    `Isi file: ${d.brief}\n` +
    (d.output === 'pdf'
      ? `File ini otomatis dikonversi menjadi PDF sungguhan (${d.path}). ` +
        `Tulis sebagai Markdown terstruktur dengan heading dan tabel.\n`
      : `Format: ${ext}. `) +
    (isDoc
      ? `Dokumen ini akan tersimpan di direktori kerja proyek, jadi tulis lengkap ` +
        `dan terstruktur (heading + tabel) - ini hasil kerja nyata, bukan ringkasan chat.\n`
      : '') +
    `Jangan menulis blok kode lain yang tidak diberi tanda "file:" - ` +
    `blok contoh di dalam penjelasan TIDAK akan disimpan.\n` +
    `Hanya isi file, tanpa penjelasan tambahan.`
  )
}

/**
 * Aturan kerja direktori yang disuntikkan ke prompt owner.
 *
 * Agent bukan hanya menulis satu file — mereka boleh menambah, mengedit, dan
 * menghapus file di folder proyeknya sendiri. Aturannya dibuat eksplisit
 * supaya model tidak menebak-nebak sintaksnya.
 */
export function workspaceRulesPrompt(): string {
  return (
    `\n\nATURAN DIREKTORI KERJA:\n` +
    `- Kamu bekerja di satu folder proyek milik tim. Semua path relatif terhadap folder itu.\n` +
    `- Kamu BOLEH menambah file baru, mengedit file yang sudah ada, dan menghapus file yang tidak terpakai.\n` +
    `- File lain milik rekaan: baca dulu isinya, lalu JANGAN menimpa tanpa alasan. ` +
    `Tambahkan perubahan di akhir atau buat file revisi bila perlu.\n` +
    `- Nama file mengikuti path yang diminta di atas. Jangan membuat folder project sendiri.`
  )
}

/** Deliverable yang diminta sebuah task (kalau ada). */
export function deliverableFor(taskId: string): Deliverable | undefined {
  return DELIVERABLES[taskId]
}

/** True bila task ini menghasilkan file (bukan jawaban chat). */
export function producesFile(taskId: string): boolean {
  const d = DELIVERABLES[taskId]
  return Boolean(d && d.output !== 'chat' && d.path)
}

/** Ambil semua task untuk sebuah fase. */
export function tasksForPhase(phase: WorkflowPhase): PhaseTask[] {
  return TASKS.filter((t) => t.phase === phase)
}

/** Cari task berdasarkan id. */
export function findTask(id: string): PhaseTask | undefined {
  return TASKS.find((t) => t.id === id)
}
