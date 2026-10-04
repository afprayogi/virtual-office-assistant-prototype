/**
 * types/agent.ts
 * ---------------------------------------------------------------------------
 * Kontrak tipe tunggal untuk "Virtual Office Multi-Agent Workspace".
 * Dipakai bersama oleh frontend (Next.js App Router) DAN backend
 * (custom server + WebSocket), sehingga menjadi sumber kebenaran tunggal
 * untuk bentuk payload yang mengalir melalui socket `/socket/office`.
 * ---------------------------------------------------------------------------
 */

/** Status visual & perilaku sebuah agent di kantor virtual. */
export type AgentStatus =
  | 'idle'      // diam di tempat
  | 'thinking'  // sedang memproses prompt (ikon berputar)
  | 'typing'    // sedang menulis balasan (speech bubble muncul)
  | 'moving'    // berjalan menuju room tujuan
  | 'error'     // panggilan LLM gagal

/** Posisi agent pada grid kantor (koordinat tile, bukan piksel). */
export interface OfficeCoordinates {
  x: number
  y: number
}

/** Konfigurasi model per agent. */
export interface ModelConfig {
  /** Strategi routing OmniRoute untuk agent ini. */
  strategy: 'auto/smart' | 'auto/fast' | 'auto/cheap' | 'auto/offline' | 'pinned'
  /** Dipakai hanya saat strategy = 'pinned'. */
  modelId: string
  temperature?: number
  maxTokens?: number
}

/** Telemetry yang dilaporkan OmniRoute untuk satu request. */
export interface RouteTelemetry {
  /** Model aktual yang dipilih gateway. */
  model?: string
  /** Latency round-trip dalam ms. */
  latencyMs?: number
  /** Estimasi token yang dihemat oleh compression. */
  tokensSaved?: number
  /** True bila Auto-Combo melakukan fallback. */
  fallback?: boolean
  compression?: string
}

/** Akumulasi pemakaian token untuk UI statistik. */
export interface TokenUsage {
  prompt: number
  completion: number
  total: number
  requests: number
}

/**
 * Aktivitas agent di kantor. Menentukan ruangan tujuan, pose, dan ikon fokus.
 *  - fun    : santai / ngobang santai di lobby
 *  - chat   : rapat / diskusi terarah di ruang rapat
 *  - work   : fokus di komputer sendiri
 *  - review : meninjau hasil colleague
 *  - test   : menguji di lab
 *  - demo   : presentasi di panggung
 *  - lounge : dokumentasi / rekap saat santai
 */
export type Activity = 'fun' | 'chat' | 'work' | 'review' | 'test' | 'demo' | 'lounge' | 'sleep'

/** Ikon + label fokus yang digantung di atas kepala sprite. */
export const ACTIVITY_META: Record<Activity, { icon: string; label: string }> = {
  fun: { icon: '🎲', label: 'santai' },
  chat: { icon: '💬', label: 'berdiskusi' },
  work: { icon: '⌨️', label: 'menulis kode' },
  review: { icon: '🔍', label: 'meninjau' },
  test: { icon: '🧪', label: 'menguji' },
  demo: { icon: '🎤', label: 'demo' },
  lounge: { icon: '📝', label: 'mendokumentasi' },
  // Tidur: agent yang memang tidak punya tugas di fase ini boleh istirahat.
  sleep: { icon: '😴', label: 'istirahat' },
}

/**
 * Batas kewenangan peran.
 * Dipakai untuk menyusun system prompt yang tegas agar agent tidak mengerjakan
 * pekerjaan di luar jobdesc-nya (mis. QA menulis kode produksi).
 */
export interface RoleGuard {
  /** Definisi singkat peran ini. */
  mandate: string
  /** Yang BOLEH dikerjakan peran ini. */
  can: string[]
  /** Yang TIDAK BOLEH dikerjakan; akan menolak bila diminta. */
  cannot: string[]
  /** Nama skill Anthropic yang relevan untuk peran ini. */
  skillKeys: string[]
}

/** Definisi lengkap satu agent. */
export interface Agent {
  id: string
  name: string
  role: string
  /** Emoji avatar yang dirender di atas sprite pixel-art. */
  avatar: string
  /** Warna aksen agent (sidebar, speech bubble, dan canvas). */
  color: string
  systemPrompt: string
  skills: string[]
  /** Batas kewenangan — inti dari pemisahan kerja antar agent. */
  guard: RoleGuard
  /** Koordinat komputer miliknya sendiri (mode B: sprite tetap berdiri di samping meja). */
  homeStation: OfficeCoordinates
  /** Aktivitas saat ini; menentukan ruangan & ikon fokus. */
  activity: Activity
  /** Strategi routing OmniRoute + model bila dipin. */
  model: ModelConfig
  status: AgentStatus
  /** Posisi tile saat ini. */
  location: OfficeCoordinates
  /** Tile tujuan yang dituju saat status = 'moving'. */
  target: OfficeCoordinates
  usage: TokenUsage
  /** Telemetry request terakhir dari OmniRoute (ditampilkan di detail panel). */
  telemetry?: RouteTelemetry
  /** Id agent yang sedang didatungi (untuk garis tautan di canvas). */
  consulting?: string | null
  /** Task id yang sedang dikerjakan. */
  currentTaskId?: string | null
}

/**
 * Tahapan alur kerja.
 *
 * `creative` adalah fase opsional (lihat `creativeRelevance` di taskRegistry):
 * fase ini hanya diisi task bila brief proyek benar-benar berbudaya —
 * cerita, karakter, game, animasi. Untuk proyek backend biasa fase ini kosong
 * dan dilewati, jadi tidak ada kerja sia-sia.
 */
export type WorkflowPhase =
  | 'requirement'
  | 'design'
  | 'creative'
  | 'coding'
  | 'testing'
  | 'documenting'
  | 'done'

/** Satu pesan dalam percakapan (panel Chat ala Claude). */
export interface Message {
  id: string
  agentId: string
  agentName: string
  role: string
  content: string
  phase: WorkflowPhase
  createdAt: number
  /** true whilst tokens are still streaming in. */
  streaming?: boolean
  usage?: TokenUsage
  /** Id artefak/deliverable yang dihasilkan pesan ini (bukan percakapan). */
  artifactIds?: string[]
}

/* -------------------------------------------------------------------------- */
/*  Artifact / Workspace Viewer                                                 */
/* -------------------------------------------------------------------------- */

export type ArtifactKind = 'code' | 'markdown' | 'html' | 'mermaid' | 'json' | 'text' | 'pdf' | 'svg'

export interface Artifact {
  id: string
  /** Path file hasil kerja, mis. 'docs/user-stories.pdf'. */
  path: string
  language: string
  kind: ArtifactKind
  /** Isi file dalam bentuk TEKS (untuk PDF: Markdown sumbernya). */
  content: string
  agentId: string
  agentName: string
  /** Fase tempat file ini dihasilkan. */
  phase?: WorkflowPhase
  /** Judul task yang menghasilkan file ini. */
  taskTitle?: string
  createdAt: number
  /** Emoji penanda bentuk hasil (📄 pdf, 💻 program, 📝 dokumen). */
  icon?: string
  /** URL unduh untuk file biner (PDF). */
  downloadUrl?: string
}

/* -------------------------------------------------------------------------- */
/*  Terminal log                                                                */
/* -------------------------------------------------------------------------- */

export type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'debug'

export interface LogEntry {
  id: string
  ts: number
  level: LogLevel
  source: string
  message: string
  /** Payload JSON mentah (request body, token usage, dll). */
  payload?: unknown
}

/* -------------------------------------------------------------------------- */
/*  WebSocket protocol                                                          */
/* -------------------------------------------------------------------------- */

/** Hasil eksekusi nyata satu file program. */
export interface RunReport {
  /** Path file yang dijalankan. */
  path: string
  /** Bahasa terdeteksi dari ekstensi. */
  lang: string
  /** True bila program berjalan tanpa error. */
  ok: boolean
  /** Exit code; null bila timeout / gagal spawn. */
  code: number | null
  /** Lama eksekusi (ms). */
  durationMs: number
  /** True bila dihentikan timeout (kemungkinan infinite loop). */
  timedOut: boolean
  /** Ringkasan singkat siap tampil di badge. */
  message: string
}

/** Event yang dialirkan server -> client. */
export type OfficeEventType =
  | 'HELLO'
  | 'SNAPSHOT'
  | 'AGENT_THINKING'
  | 'AGENT_TALKING'
  | 'AGENT_MOVE_TO_ROOM'
  | 'AGENT_APPROACH'   // agent berjalan menghampiri rekannya
  | 'AGENT_LEAVE'      // agent selesai menghampiri, kembali ke posisinya
  | 'AGENT_ACTIVITY'   // agent pindah aktivitas (ikon fokus berubah)
  | 'AGENT_MESSAGE'
  | 'AGENT_STREAM_CHUNK'
  | 'AGENT_DONE'
  | 'AGENT_ERROR'
  | 'PHASE_CHANGE'
  | 'HITL_REQUEST'
  | 'HITL_RESOLVED'
  | 'ARTIFACT'
  | 'REVIEW'            // hasil kerja dicek: sesuai / perlu revisi
  | 'RUN_RESULT'        // program hasil kerja benar-benar DIJALANKAN
  | 'LOG'
  | 'WORKFLOW_DONE'
  | 'ERROR'

export interface OfficeEvent {
  type: OfficeEventType
  agentId?: string
  phase?: WorkflowPhase
  /** Koordinat tujuan untuk AGENT_MOVE_TO_ROOM. */
  to?: OfficeCoordinates
  /** Pesan agent yang sudah selesai (bukan streaming). */
  message?: Message
  /** Teks sambutan pada event HELLO. */
  hello?: string
  /** Potongan teks streaming. */
  chunk?: string
  artifact?: Artifact
  log?: LogEntry
  /** Roster agent terkini (SNAPSHOT / PHASE_CHANGE). */
  agents?: Agent[]
  /** Permintaan persetujuan human-in-the-loop. */
  hitl?: HitlRequest
  usage?: TokenUsage
  /** Agent tujuan approach (AGENT_APPROACH). */
  targetAgentId?: string
  /** Aktivitas baru (AGENT_ACTIVITY). */
  activity?: Activity
  /** Task id yang sedang dikerjakan. */
  taskId?: string
  /** Hasil pengecekan kelayakan (REVIEW). */
  review?: ReviewResult
  /** Hasil eksekusi program nyata (RUN_RESULT). */
  run?: RunReport
  /** Catatan revisi dari user atau agent reviewer. */
  revisionNote?: string
  error?: string
}

/**
 * Hasil pengecekan satu file hasil kerja.
 *
 * `verdict` menjawab pertanyaan "sesuai atau tidak":
 * - `sesuai`        → semua acceptance criteria terpenuhi.
 * - `perlu-revisi`  → ada criteria yang gagal, harus diperbaiki.
 */
export interface ReviewResult {
  taskId: string
  agentId: string
  /** Path file yang diperiksa. */
  path: string
  verdict: 'sesuai' | 'perlu-revisi'
  /** Skor 0..100. */
  score: number
  /** Ringkasan singkat, siap tampil di badge. */
  summary: string
  /** Detail tiap criteria yang dicek. */
  criteria: { label: string; ok: boolean; hint?: string }[]
  /** Siapa yang meminta revisi: user atau agent lain. */
  requestedBy?: string
}

/**
 * Bentuk akhir yang diminta untuk sebuah deliverable.
 *
 * Ini yang membuat Workspace berisi "hasil dalam bentuk yang benar":
 *  - `code`     → program sungguhan (bisa dijalankan)
 *  - `markdown` → dokumen teks
 *  - `pdf`      → dokumen PDF nyata di disk
 *  - `chat`     → TIDAK ada file; cukup jawaban singkat di percakapan
 */
export type DeliverableOutput = 'code' | 'markdown' | 'pdf' | 'chat'

/**
 * Deliverable yang harus dihasilkan pemilik sebuah task.
 *
 * Inilah yang membedakan "hasil kerja" dari "percakapan": agent diminta
 * menulis file sungguhan di dalam blok bertanda `file:<path>`, dan HANYA blok
 * bertanda itulah yang masuk ke Workspace. Cuplikan kode yang sengaja dipakai
 * sebagai contoh di dalam penjelasan TIDAK akan tersimpan.
 *
 * Untuk `output: 'chat'` tidak ada file sama sekali — deliverable-nya adalah
 * jawaban langsung, jadi Workspace sengaja tidak bertambah.
 */
export interface Deliverable {
  /** Path file hasil, mis. 'src/components/TaskCard.tsx'. */
  path: string
  /** Extensi tanpa titik, mis. 'tsx', 'md', 'pdf'. */
  language: string
  /** Jenis tampilan di Workspace. */
  kind: ArtifactKind
  /** Bentuk akhir yang diminta. */
  output: DeliverableOutput
  /** Petunjuk isi singkat yang diminta ke agent. */
  brief: string
  /** Batas kata untuk mode chat — menjaga jawaban tetap terarah. */
  maxWords?: number
}

/**
 * Unit kerja dengan pemilik peran yang pasti.
 *
 * Inilah kunci pemisahan kerja: engine HANYA menugaskan task ini ke agent
 * yang `ownerRole`-nya cocok. Tidak ada agent lain yang menerimanya.
 */
export interface PhaseTask {
  id: string
  phase: WorkflowPhase
  /** Role yang jadi pemilik tunggal task ini. */
  ownerRole: string
  /** Aktivitas & ruangan tujuan saat mengerjakan. */
  activity: Activity
  /** Judul singkat untuk log/UI. */
  title: string
  /** Instruksi spesifik untuk pemilik task (bukan generik per fase). */
  instruction: string
  /** Id agent yang harus didekati untuk klarifikasi sebelum bekerja. */
  consult?: string[]
  /**
   * Role ATASAN yang meninjau hasil kerja task ini.
   *
   * Kalau diisi, setelah task selesai atasan membaca file hasilnya. Bila
   * tidak sesuai acceptance criteria, task ini DIJALANKAN ULANG dengan
   * catatan revisi dari atasan.
   */
  reportsTo?: string
  /**
   * Id task yang hasilnya jadi bahan/atasan untuk task ini.
   *
   * Isi file dari task-task ini dibaca agent pemilik sebelum bekerja — inilah
   * cara "agent melihat hasil kerja rekannya" secara konkret, bukan sekadar
   * membaca transkrip chat.
   */
  dependsOn?: string[]
  /** Skill Anthropic yang di-inject ke system prompt pemilik. */
  skillKeys?: string[]
  /** Hasil kerja wajib yang harus ditulis agent. */
  deliverable?: Deliverable
}

/** Permintaan persetujuan manusia di tengah workflow. */
export interface HitlRequest {
  id: string
  phase: WorkflowPhase
  agentId: string
  agentName: string
  title: string
  body: string
  options: { id: string; label: string; kind: 'approve' | 'reject' | 'revise' }[]
  createdAt: number
  resolved?: boolean
}

/** Pesan yang dikirim client -> server melalui socket. */
export type ClientCommand =
  | { action: 'start'; task: string; agents?: Agent[]; hitl?: boolean }
  | { action: 'hitl'; hitlId: string; choice: string; note?: string }
  | { action: 'interrupt' }
  | { action: 'update_agents'; agents: Agent[] }
  | { action: 'nudge'; agentId: string }
  /** Minta agent merevisi hasil kerjanya, dengan catatan dari user. */
  | { action: 'revise'; agentId: string; taskId: string; note?: string }
  /** Minta agent lain merevisi pekerjaan rekannya (review antar agent). */
  | { action: 'review_peer'; reviewerAgentId: string; taskId: string; note: string }
  | { action: 'ping' }

/* -------------------------------------------------------------------------- */
/*  Workflow state                                                              */
/* -------------------------------------------------------------------------- */

export type WorkflowStatus = 'idle' | 'running' | 'awaiting_human' | 'done' | 'error'

export interface WorkflowState {
  id: string
  task: string
  phase: WorkflowPhase
  status: WorkflowStatus
  messages: Message[]
  artifacts: Artifact[]
  agents: Agent[]
  createdAt: number
}

/** Definisi tahapan statis (label + agent yang terlibat). */
export interface PhaseDefinition {
  phase: WorkflowPhase
  label: string
  /** Room tujuan tempat agent berkumpul pada fase ini. */
  roomId: RoomId
  /** Template prompt yang dikirim ke agent. */
  instruction: string
}

export const WORKFLOW_PHASES: readonly WorkflowPhase[] = [
  'requirement',
  'design',
  'creative',
  'coding',
  'testing',
  'documenting',
  'done',
] as const

export type RoomId = 'lobby' | 'meeting' | 'desks' | 'lab' | 'stage' | 'lounge'

/** Faktor skala global saat render canvas. */
export const SPRITE_SIZE = 20
export const AGENT_MOVE_SPEED = 3.2   // tile per detik
export const SPEECH_BUBBLE_MS = 4200

/** Ruangan yang bisa ditempati agent. */
export interface OfficeRoom {
  id: RoomId
  name: string
  icon: string
  /** Batas area (bukan eksklusif) dalam koordinat tile. */
  rect: { x: number; y: number; w: number; h: number }
  /** Warna lantai. */
  floor: string
  accent: string
  /** Aktivitas utama yang berlangsung di ruangan ini. */
  activity: Activity
}