/**
 * lib/orchestrator/ChatDevEngine.ts
 * ---------------------------------------------------------------------------
 * DELIVERABLE 4 â€” Otak alur kerja multi-agent (ChatDev).
 *
 * Tanggung jawab:
 *   1. Mengatur sekuens fase: Requirement â†’ Design â†’ Coding â†’ Testing â†’ Documenting.
 *   2. Memanggil LLM multi-model lewat `lib/orchestrator/llm.ts` dengan
 *      streaming, sehingga UI bisa menampilkan typing indicator & speech bubble.
 *   3. Menghasilkan event visual (`AGENT_MOVE_TO_ROOM`, `AGENT_THINKING`, ...)
 *      yang dikonsumsi VirtualOfficeCanvas lewat WebSocket.
 *   4. Mendukung Human-in-the-Loop: workflow berhenti dan menunggu persetujuan
 *      pengguna sebelum melanjutkan ke fase berikutnya.
 *
 * Class ini murni server-side (tidak boleh di-import dari komponen client).
 * ---------------------------------------------------------------------------
 */
import type {
  Activity,
  Agent,
  Artifact,
  HitlRequest,
  LogEntry,
  LogLevel,
  Message,
  OfficeCoordinates,
  OfficeEvent,
  PhaseTask,
  RoomId,
  TokenUsage,
  WorkflowPhase,
} from '@/types/agent'
import { ACTIVITY_ROOM, ANCHORS, ROOMS } from '@/types/office'
import { uid } from '@/lib/utils'
import { buildSkillBlock, discoverSkills, invalidateSkillCache, loadSkills } from '@/lib/skills/registry'
import {
  SKILL_AUTHORING_PROMPT,
  parseSkillDraft,
  saveSkillDraft,
  validateSkillDraft,
} from '@/lib/skills/authoring'
import { stream } from './llm'
import { DEFAULT_AGENTS } from './defaults'
import { PHASE_LABEL, PHASE_ORDER, deliverableFor, deliverablePrompt, findTask, isCreativeProject, tasksForPhase, workspaceRulesPrompt } from './taskRegistry'
import { buildGraph } from './graph'
import {
  clearMemory,
  clearWorkspace,
  createProject,
  ensureWorkspace,
  getActiveProject,
  listProjectTree,
  memoryContext,
  readWorkspaceFiles,
  resolveSafe,
  saveMemory,
  setActiveTask,
  writeWorkspaceBinary,
  writeWorkspaceFile,
} from './workspace'
import { markdownToPdf } from './pdf'
import { evaluateArtifacts } from './quality'
import { validateArtifacts, worstOffender } from './validation'
import { buildReviewPrompt, reviewSubordinate, upstreamContext } from './hierarchy'
import { research } from './websearch'
import { detectCommand, installRequirements, runFile, type RunResult } from './runner'
import { TOOL_SPECS, executeTool, type ToolCall } from './tools'
import type { LlmMessage } from './llm'

export { DEFAULT_AGENTS }
export { PHASE_LABEL, PHASE_ORDER }

/**
 * Batas agent yang boleh jalan bersamaan dalam satu fase.
 * Menghindari gateway kewalahan sekaligus tetap terlihat paralel.
 */
export const MAX_PARALLEL = Number(process.env.MAX_PARALLEL ?? 3)

/**
 * Ringkas balasan agent menjadi KESIMPULAN yang layak diingat.
 *
 * Yang dibuang: blok kode (sudah tersimpan sebagai file di disk, jadi
 * memorizinginya di memori hanya buang token) dan penjelasan berulang.
 * Yang disimpan: paragraf naratif — keputusan, alasan, dan parameter apa.
 *
 * Hasilnya disuntikkan ke task berikutnya, jadi harus pendek tapi bermakna.
 */
function summarizeForMemory(content: string, maxChars = 1200): string {
  let text = content
    // Buang blok kode bertanda file: dan blok bahasa biasa.
    text = text.replace(/```[\s\S]*?```/g, ' ')
    // Buang penanda skill-draft supaya tidak mengotori memori.
    text = text.replace(/<\/?skill-draft>[\s\S]*?(?=\n\n|$)/gi, ' ')
    // Rapatkan baris kosong berlebih.
    text = text.replace(/\n{3,}/g, '\n\n').trim()

  if (!text) return '(hanya menghasilkan file, tanpa narasi)'
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n… (ringkasan dipotong)`
}

/**
 * Batas ukuran file yang isinya ikut disuntikkan ke prompt.
 * File lebih besar hanya ditampilkan namanya di tree (hemat konteks).
 */
/** Batas revisi per giliran supaya tidak berputar tanpa henti. */
const MAX_REVISION = 2
/**
 * Berapa kali satu task boleh di-reproses karena atasan menolak hasilnya.
 *
 * Batas 2 supaya alur tetap maju: kalau setelah 2x perbaikan masih belum
 * sesuai, hasilnya diterima apa adanya dan ditandai di log — bukan diputar
 * tanpa henti. Nilainya sinkron dengan MAX_REVISION supaya satu giliran bisa
 * diperbaiki berkali-kali, lalu task-nya sendiri bisa di-reproses sekali lagi.
 */
const MAX_REPROCESS = 2

/**
 * Berapa kali satu giliran boleh memakai tool sebelum dipaksa menjawab.
 *
 * Batas ini penting: tanpa batas, agent bisa looping "jalan program -> gagal ->
 * jalan lagi" tanpa henti dan membakar kuota gateway. 4 putaran cukup untuk
 * alur nyata: baca file -> jalankan -> baca error -> perbaiki -> jalankan lagi.
 */
const MAX_TOOL_ROUNDS = 4

/**
 * Peran yang boleh memakai tool (menjalankan program, memasang library).
 *
 * Hanya peran teknis. Manager/CEO/BA tidak perlu menjalankan kode — mereka
 * menulis dokumen. Membiarkan mereka memakai tool hanya menambah risiko tanpa
 * manfaat.
 */
const TOOL_ROLES = new Set([
  'Lead Developer',
  'Backend Developer',
  'Frontend Developer',
  'Code Reviewer',
  'QA Automation',
  'Demo Engineer',
  'UX Designer',
])
/**
 * Peran yang boleh membuat skill baru.
 *
 * Dipilih yang senior/teknis saja — mereka yang paling sering menemukan
 * "skill yang ada tidak cukup". Manager/BA cukup memakai skill yang ada.
 */
const AUTHOR_SKILL_ROLES = new Set([
  'CEO',
  'Lead Developer',
  'Backend Developer',
  'Frontend Developer',
  'Code Reviewer',
  'QA Automation',
  'Demo Engineer',
])

export const MAX_CONTEXT_BYTES = 12_000

const zeroUsage = (): TokenUsage => ({ prompt: 0, completion: 0, total: 0, requests: 0 })

/** Slot berdiri berikutnya yang belum terpakai di sebuah ruangan. */
function nextSlot(roomId: RoomId, taken: Set<string>, seed: number): OfficeCoordinates {
  const slots = ANCHORS[roomId]
  const free = slots.filter((a) => !taken.has(`${a.x},${a.y}`))
  const pool = free.length ? free : slots
  const slot = pool[seed % pool.length]
  taken.add(`${slot.x},${slot.y}`)
  return { x: slot.x, y: slot.y }
}

/** Tile di sebelah kiri/atas target, untuk agent yang menghampiri. */
function adjacentTo(target: OfficeCoordinates): OfficeCoordinates {
  return { x: Math.max(0, target.x - 1), y: target.y }
}

/* -------------------------------------------------------------------------- */
/*  Engine                                                                     */
/* -------------------------------------------------------------------------- */

export interface EngineOptions {
  /** Callback tunggal untuk semua event yang dikirim ke client. */
  onEvent: (event: OfficeEvent) => void
}

export class ChatDevEngine {
  private agents: Agent[]
  private readonly onEvent: (event: OfficeEvent) => void
  private abort: AbortController | null = null
  /** Resolver untuk HITL: id permintaan -> fungsi pelepas. */
  private pendingHitl = new Map<string, (choice: string) => void>()
  /** Deliverable hasil giliran terakhir (dikembalikan oleh streamTurn). */
  private lastArtifacts: Artifact[] = []
  /**
   * Hasil kerja per task id — inilah yang membuat "agent melihat hasil kerja
   * rekannya" jadi nyata: task hilir membaca ISI FILE, bukan ringkasan chat.
   */
  private taskOutputs = new Map<string, Artifact[]>()
  /** Berapa kali tiap task boleh di-reproses karena ditolak atasan. */
  private reprocessCount = new Map<string, number>()

  /**
   * Cache hasil pencarian internet per workflow.
   *
   * Tujuannya hemat token: satu pencarian per kata kunci, dipakai bersama oleh
   * semua agent. Tanpa cache, tiga agent di satu fase akan memanggil jaringan
   * tiga kali dan menyuntikkan hasil yang sama tiga kali ke prompt.
   */
  private researchCache = new Map<string, string>()
  /**
   * Nama skill yang dibuat agent selama workflow ini.
   * Ditampilkan di UI supaya user tahu kemampuan tim bertambah.
   */
  private createdSkills: string[] = []

  /** Id folder proyek yang sedang dikerjakan. */
  private projectId: string | null = null

  /** Sisa jatah revisi untuk giliran ini (dikurangi tiap revisi). */
  private revisionLeft = MAX_REVISION

  /** Folder proyek aktif (null bila belum ada workflow yang jalan). */
  getProjectId(): string | null {
    return this.projectId
  }

  /** Metadata proyek aktif, untuk ditampilkan di UI. */
  projectInfo(): ReturnType<typeof getActiveProject> {
    return getActiveProject()
  }

  constructor(opts: EngineOptions, agents: Agent[] = DEFAULT_AGENTS) {
    this.onEvent = opts.onEvent
    this.agents = structuredClone(agents)
  }

  /** Salinan roster terkini (dikirim sebagai SNAPSHOT / PHASE_CHANGE). */
  roster(): Agent[] {
    return structuredClone(this.agents)
  }

  /** Ganti konfigurasi model/peran agent dari UI (POST /api/agents/config). */
  configure(next: Agent[]): void {
    this.agents = next.map((a) => ({ ...structuredClone(a), status: 'idle' }))
  }

  /* ------------------------------- utilitas ------------------------------- */

  private emit(event: OfficeEvent): void {
    this.onEvent(event)
  }

  private log(level: LogLevel, source: string, message: string, payload?: unknown): void {
    this.emit({ type: 'LOG', log: { id: uid('log'), ts: Date.now(), level, source, message, payload } })
  }

  private agent(id: string): Agent {
    const found = this.agents.find((a) => a.id === id)
    if (!found) throw new Error(`Agent "${id}" tidak dikenal`)
    return found
  }

  /** Berhenti sejenak; hormati signal abort agar "Cancel" terasa responsif. */
  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms)
      signal.addEventListener('abort', () => { clearTimeout(t); resolve() }, { once: true })
    })
  }

  /* --------------------------------- HITL --------------------------------- */

  /** Pertanyaan persetujuan; mengembalikan pilihan pengguna. */
  private requestHitl(req: Omit<HitlRequest, 'id' | 'createdAt'>): Promise<string> {
    const hitl: HitlRequest = { ...req, id: uid('hitl'), createdAt: Date.now() }
    this.emit({ type: 'HITL_REQUEST', hitl, agents: this.roster() })
    return new Promise<string>((resolve) => {
      this.pendingHitl.set(hitl.id, (choice) => {
        this.pendingHitl.delete(hitl.id)
        this.emit({ type: 'HITL_RESOLVED', hitl: { ...hitl, resolved: true }, agents: this.roster() })
        resolve(choice)
      })
    })
  }

  /** Dipanggil dari handler WebSocket saat user menekan tombol persetujuan. */
  resolveHitl(hitlId: string, choice: string, note?: string): boolean {
    const pending = this.pendingHitl.get(hitlId)
    if (!pending) return false
    this.log('info', 'HITL', `Keputusan "${choice}" diterima${note ? ` â€” catatan: ${note}` : ''}`)
    pending(choice)
    return true
  }

  /* ------------------------------ deliverable ----------------------------- */

  /**
   * Ambil HANYA file bertanda `file:<path>` dari balasan agent.
   *
   * Ini yang membedakan Workspace berisi hasil kerja dari Workspace yang
   * dipenuhi cuplikan percakapan. Blok kode biasa (contoh/ilustrasi di dalam
   * penjelasan) sengaja DIABAIKAN.
   */
  private extractArtifacts(
    agent: Agent,
    task: PhaseTask,
    content: string,
  ): Artifact[] {
    const spec = task.deliverable ?? deliverableFor(task.id)
    const produced: Artifact[] = []

    // Mode CHAT: task ini memang tidak menghasilkan file. Kalau agent tetap
    // menulis blok `file:`, kita hormati format yang diminta — jangan diam-diam
    // menambahkan dokumen yang tidak diminta.
    if (spec?.output === 'chat') {
      this.log('info', 'artifact', `${agent.name} menjawab langsung (tanpa file): "${task.title}"`, {
        task: task.id,
      })
      return produced
    }

    const blocks = [...content.matchAll(/```file:([\w./-]+)\s*\n([\s\S]*?)```/g)]

    for (const [i, match] of blocks.entries()) {
      const path = (match[1] ?? '').trim()
      const body = (match[2] ?? '').trim()
      if (!path || !body) continue

      const ext = path.split('.').pop()?.toLowerCase() ?? 'txt'
      const isPdf = spec?.output === 'pdf' || ext === 'pdf'
      const kind: Artifact['kind'] =
        isPdf ? 'pdf'
          : spec ? spec.kind
            : (ext === 'html' ? 'html'
              : ext === 'svg' ? 'svg'
                : ext === 'mermaid' ? 'mermaid'
                  : ext === 'md' ? 'markdown'
                    : ext === 'json' ? 'json'
                      : 'code')

      const artifact: Artifact = {
        id: uid('art'),
        path,
        language: isPdf ? 'pdf' : (spec?.language ?? ext),
        kind,
        content: body,
        agentId: agent.id,
        agentName: agent.name,
        phase: task.phase,
        taskTitle: task.title,
        createdAt: Date.now(),
        icon: isPdf ? '📄' : kind === 'code' || kind === 'html' ? '💻' : '📝',
      }

      // PDF: yang ditulis ke disk adalah PDF sungguhan; `content` tetap Markdown
      // sumbernya supaya UI bisa menampilkan preview + mengunduh.
      const saved = isPdf
        ? writeWorkspaceBinary(path, markdownToPdf(body, spec?.brief ?? path))
        : writeWorkspaceFile(path, body)

      if (isPdf) artifact.downloadUrl = `/api/workspace/file?path=${encodeURIComponent(path)}`

      produced.push(artifact)
      this.emit({ type: 'ARTIFACT', artifact })
      this.log(saved ? 'success' : 'warn', 'artifact',
        `${artifact.icon} ${isPdf ? 'PDF' : 'Deliverable'}: ${path}`,
        {
          task: task.id,
          bytes: body.length,
          from: agent.name,
          disk: saved ? 'tersimpan' : 'gagal simpan',
          index: i,
        })
    }

    if (produced.length === 0) {
      this.log('warn', 'artifact',
        `${agent.name} tidak menulis file bertanda "file:" untuk "${task.title}"`,
        { task: task.id })
    }
    return produced
  }

  /* ---------------------------------- run --------------------------------- */

  /**
   * Jalankan workflow penuh.
   * @param task Brief dari pengguna.
   * @param hitl Bila true, workflow berhenti sebelum tiap fase untuk disetujui user.
   */
  async run(task: string, hitl = false): Promise<Message[]> {
    this.abort = new AbortController()
    const signal = this.abort.signal
    const transcript: Message[] = []
    const artifacts: Artifact[] = []
    // Workflow baru = hasil kerja & kuota reproses lama dibuang, supaya
    // task hilir tidak membaca file dari run sebelumnya.
    this.taskOutputs.clear()
    this.reprocessCount.clear()

    // Reset semua agent: sebagian ke lobby (santai), sebagian ke homeStation.
    // Workspace dibersihkan dulu supaya file run sebelumnya tidak bocor ke
    // konteks fase berikutnya (agent harus mengerjakan proyek yang aktif).
    // SETIAP PROYEK DAPAT FOLDERNYA SENDIRI di workspace/projects/<slug>.
    ensureWorkspace()
    const project = createProject(task)
    this.log('info', 'workspace', `Folder proyek dibuat: ${project.path}`, {
      project: project.id,
    })
    const cleared = clearWorkspace()
    if (cleared > 0) this.log('info', 'workspace', `${cleared} entri lama dibersihkan`)
    // Memori ikut dibersihkan: proyek BARU tidak boleh "mengingat" proyek lama.
    clearMemory()
    this.researchCache.clear()
    this.projectId = project.id
    this.seatCaches.clear()
    const lobbySeats = new Set<string>()
    this.agents.forEach((agent) => {
      agent.status = 'idle'
      agent.consulting = null
      agent.currentTaskId = null
      const to = agent.activity === 'fun'
        ? nextSlot('lobby', lobbySeats, this.agents.indexOf(agent))
        : agent.homeStation
      agent.target = { ...to }
      agent.location = { ...to }
    })

    this.emit({ type: 'SNAPSHOT', agents: this.roster() })
    this.log('info', 'workflow', `Workflow dimulai (LangGraph): "${task}"`)

    // Graph node = satu fase. Task-task di dalamnya jalan paralel sesuai peran.
    const runPhase = async (state: { phase: WorkflowPhase }): Promise<Partial<{
      messages: Message[]
      artifacts: Artifact[]
      halted: boolean
    }>> => {
      const phase = state.phase
      if (signal.aborted) return { halted: true }

      const label = PHASE_LABEL[phase]
      let tasks = tasksForPhase(phase)

      // Fase CREATIVE bersifat opsional.
      //
      // Tanpa gerbang ini, proyek backend biasa ("bikin API todo list") akan
      // ikut Designing karakter dan storyboard — kerja sia-sia yang juga
      // membakar kuota gateway. Sebaliknya, proyek yang memang berbudaya
      // (game, komik, animasi) otomatis punya tim kreatif yang bekerja.
      //
      // Sinyal diambil dari brief PLUS dokumen yang sudah dihasilkan fase
      // sebelumnya, karena user sering menulis brief singkat ("bikin game
      // snake") sementara detailnya ada di dokumen visi.
      if (phase === 'creative') {
        const context = [
          task,
          ...[...this.taskOutputs.values()]
            .flat()
            .slice(-4)
            .map((a) => a.content),
        ].join(' ')
        if (!isCreativeProject(context)) {
          this.log('info', 'workflow', 'Fase creative dilewati — proyek tidak bergenre kreatif')
          this.emit({ type: 'PHASE_CHANGE', phase, agents: this.roster() })
          return { halted: false, artifacts: [] }
        }
        this.log('info', 'workflow', `Fase creative aktif — ${tasks.length} task`)
      }

      this.emit({ type: 'PHASE_CHANGE', phase, agents: this.roster() })
      this.log('info', 'workflow', `Node "${phase}" — ${tasks.length} task paralel`)

      // Agent tanpa task di fase ini kembali ke markas masing-masing.
      await this.idleToStations(phase, signal)

      if (signal.aborted) return { halted: true }

      // Human-in-the-Loop sebelum fase dijalankan.
      if (hitl) {
        const choice = await this.requestPhaseApproval(phase, task, tasks.length, signal)
        if (choice === 'reject') return { halted: true }
        if (signal.aborted) return { halted: true }
      }

      const history = transcript
        .map((m) => `### ${m.agentName} (${m.role})\n${m.content}`)
        .join('\n\n')

      // Isi workspace = "keluaran tim sebelumnya" versi NYATA (file di disk),
      // bukan sekadar transkrip chat. Inilah yang membuat agent bisa melanjutkan
      // atau mereview pekerjaan rekannya alih-alih mengulang dari nol.
      const tree = listProjectTree()
      const onDisk = readWorkspaceFiles(
        tree
          // Hanya file yang muat dalam batas konteks; yang besar cukup namanya.
          .filter((f) => f.size <= MAX_CONTEXT_BYTES)
          .map((f) => f.path),
      )
      const diskContext = [
        `File yang sudah ada di direktori kerja (${tree.length}):\n${tree.map((f) => `- ${f.path} (${f.size} B)`).join('\n') || '(kosong)'}`,
        onDisk.length
          ? `\nIsi file yang perlu kamu baca / direview:\n${onDisk
              .map((f) => `<file path="${f.path}">\n${f.content}\n</file>`)
              .join('\n\n')}`
          : '',
      ].filter(Boolean).join('\n')

      const produced = await this.runPhaseParallel(
        tasks,
        task,
        history,
        signal,
        transcript,
        diskContext,
      )
      // 5) Atasan meninjau hasil kerja bawahan; yang tidak sesuai diproses ulang.
      await this.reviewBySupervisors(tasks, task, signal, transcript, diskContext)
      if (signal.aborted) return { halted: true }

      // Kembali ke folder proyek: tiap task punya foldernya sendiri, jadi
      // di luar eksekusi task tidak ada file yang "bergedar".
      setActiveTask(null)
      return { halted: false, artifacts: produced }
    }

    const graph = buildGraph(runPhase, () => hitl)

    try {
      const finalState = await graph.invoke(
        { task, halted: false },
        {
          recursionLimit: PHASE_ORDER.length * 20,
          configurable: { thread_id: uid('thread') },
        },
      )

      artifacts.push(...(finalState.artifacts ?? []))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.log('error', 'workflow', message)
      this.emit({ type: 'ERROR', error: message })
      throw err
    } finally {
      this.abort = null
      // SEMUA AGENT BERKUMPUL merayakan hasil kerja — tapi BERUNTUN, bukan
      // SEMUA AGENT BERKUMPUL merayakan hasil kerja - tapi BERUNTUN, bukan
      // serentak, supaya gerakannya natural dan enak dilihat.
      //
      // Agent yang memang tidak punya tugas di fase terakhir tidak dipaksa;
      // dia boleh tetap di markas. Bertahan di tempat = rapi.
      const crew = new Set<string>()
      const gatherOrder = this.agents.map((agent, i) => ({ agent, i }))
      for (const { agent, i } of gatherOrder) {
        if (signal.aborted) break
        agent.status = 'idle'
        agent.consulting = null
        agent.currentTaskId = null
        agent.activity = 'demo'
        agent.target = nextSlot('stage', crew, i)
        this.emit({ type: 'AGENT_ACTIVITY', agentId: agent.id, activity: 'demo', agents: this.roster() })
        // Jeda 320 ms antar agent supaya bergerak bergantian, bukan rame.
        await this.sleep(320, signal)
      }
      // Beri waktu semua agent sampai ke panggung.
      await this.sleep(1400, signal)
      this.emit({ type: 'WORKFLOW_DONE', agents: this.roster() })
      this.log(
        'success',
        'workflow',
        `Workflow selesai — ${transcript.length} pesan, ${artifacts.length} deliverable`,
        { deliverables: artifacts.map((a) => a.path) },
      )

      // Rayakan beberapa detik, lalu pulang.
      await this.sleep(6500, signal)
      const homeAfterCelebration = new Set<string>()
      this.agents.forEach((agent, i) => {
        const backTo = agent.homeStation
        agent.activity = i % 3 === 0 ? 'fun' : 'work'
        if (i % 3 === 0) agent.target = nextSlot('lobby', homeAfterCelebration, 0)
        else agent.target = { ...backTo }
        agent.location = { ...agent.target }
      })
      this.emit({ type: 'SNAPSHOT', agents: this.roster() })
    }

    return transcript
  }

  /** Batalkan workflow yang sedang berjalan. */
  interrupt(): void {
    this.abort?.abort()
    this.log('warn', 'workflow', 'Interupsi diterima oleh pengguna')
  }

  /** Slot yang sudah dipakai per ruangan (agar dua agent tidak tabrakan). */
  private seatCaches = new Map<RoomId, Set<string>>()

  private slotsFor(room: RoomId): Set<string> {
    let set = this.seatCaches.get(room)
    if (!set) { set = new Set(); this.seatCaches.set(room, set) }
    return set
  }

  /** Pindahkan agent ke tile tujuan lalu emit event visual. */
  private async moveTo(agent: Agent, to: OfficeCoordinates, signal: AbortSignal, ms = 340): Promise<void> {
    agent.status = 'moving'
    agent.target = { ...to }
    this.emit({ type: 'AGENT_MOVE_TO_ROOM', agentId: agent.id, to: agent.target, agents: this.roster() })
    await this.sleep(ms, signal)
    agent.location = { ...to }
    agent.status = 'idle'
  }

  /** Ubah aktivitas agent — ikon fokus di kepala ikut berubah. */
  private setActivity(agent: Agent, activity: Activity): void {
    agent.activity = activity
    this.emit({ type: 'AGENT_ACTIVITY', agentId: agent.id, activity, agents: this.roster() })
  }

  /**
   * Agent yang TIDAK mendapat task di fase ini diparkir di "markas"-nya:
   *  - activity 'fun' → lobby (santai / having fun)
   *  - activity lain   → homeStation, komputer miliknya sendiri
   * Dipanggil paralel supaya tidak terlihat berbaris rapi.
   */
  private async idleToStations(phase: WorkflowPhase, signal: AbortSignal): Promise<void> {
    const busyRoles = new Set(tasksForPhase(phase).map((t) => t.ownerRole))
    const idle = this.agents.filter((a) => !busyRoles.has(a.role))

    // Agent yang TIDAK mendapat task di fase ini DUDUK DI KOMPUTERNYA
    // SENDIRI. Bukan Wander monoton ke lounge — supaya jelas siapa yang sedang
    // bekerja, siapa yang selesai, dan tiap orang tetap punya tempat.
    await Promise.all(
      idle.map(async (agent, i) => {
        if (signal.aborted) return
        // Semua agent non-'fun' balik ke meja masing-masing.
        await this.moveTo(agent, agent.homeStation, signal, 300)
        void i
      }),
    )
  }

  /** Minta persetujuan manusia sebelum masuk sebuah fase. */
  private async requestPhaseApproval(
    phase: WorkflowPhase,
    task: string,
    taskCount: number,
    signal: AbortSignal,
  ): Promise<string> {
    this.log('warn', 'HITL', `Menunggu persetujuan manusia untuk fase ${PHASE_LABEL[phase]}`)
    const choice = await this.requestHitl({
      phase,
      agentId: this.agents[0]?.id ?? 'ceo',
      agentName: 'Manajer Proyek',
      title: `Lanjut ke fase ${PHASE_LABEL[phase]}?`,
      body:
        `${taskCount} task akan berjalan paralel untuk tugas "${task}". ` +
        `Setiap task hanya dikerjakan oleh agent dengan peran yang sesuai.`,
      options: [
        { id: 'approve', label: 'Lanjutkan', kind: 'approve' },
        { id: 'revise', label: 'Minta revisi', kind: 'revise' },
        { id: 'reject', label: 'Batalkan workflow', kind: 'reject' },
      ],
    })
    if (choice === 'reject') this.log('warn', 'HITL', 'Workflow dibatalkan oleh pengguna')
    void signal
    return choice
  }

/**
   * Jalankan daftar task PARALEL dengan batas konkurensi.
   *
   * Ini inti pemisahan kerja: setiap task hanya diambil agent yang `role`-nya
   * cocok. Tidak ada lagi "semua agent mengerjakan instruksi fase yang sama".
   */
  private async runPhaseParallel(
    tasks: PhaseTask[],
    projectTask: string,
    history: string,
    signal: AbortSignal,
    transcript: Message[],
    diskContext: string,
  ): Promise<Artifact[]> {
    const pairs = tasks
      .map((task) => ({ task, agent: this.agents.find((a) => a.role === task.ownerRole) }))
      .filter((p): p is { task: PhaseTask; agent: Agent } => Boolean(p.agent))

    // Task tanpa pemilik di roster → laporkan terang-terangan, jangan diamkan.
    for (const task of tasks) {
      if (!this.agents.some((a) => a.role === task.ownerRole)) {
        this.log('warn', 'workflow', `Task "${task.title}" dilewati: tidak ada agent ${task.ownerRole}`)
      }
    }

    this.log('info', 'workflow', `${pairs.length} task dieksekusi paralel (maks ${MAX_PARALLEL} bersamaan)`)

    // Worker pool sederhana: satu antrean, N worker jalan bersamaan.
    const queue = [...pairs]
    const workerCount = Math.max(1, Math.min(MAX_PARALLEL, queue.length))
    const produced: Artifact[] = []

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        for (;;) {
          if (signal.aborted) return
          const next = queue.shift()
          if (!next) return
          // Stagger kecil supaya tidak semua menembak gateway serentak.
          await this.sleep(300, signal)
          if (signal.aborted) return
          const result = await this.runTask(next.task, next.agent, projectTask, history, signal, diskContext)
          if (result.message) transcript.push(result.message)
          produced.push(...result.artifacts)
        }
      }),
    )

    return produced
  }

  /**
   * Tinjau hasil kerja bawahan oleh atasan, lalu PROSES ULANG bila tidak sesuai.
   *
   *  1. Atasan (`reportsTo`) membuka file yang dikerjakan oleh bawahan.
   *  2. File dinilai terhadap acceptance criteria task (`validation.ts`).
   *  3. Kalau `perlu-revisi`, task bawahan DIJALANKAN ULANG dengan catatan
   *     revisi dari atasan — bukan sekadar dicatat sebagai temuan.
   *
   * Dibatasi {@link MAX_REPROCESS} kali per task supaya tidak putar tanpa
   * henti kalau LLM memang tidak mampu memenuhi criteria.
   */
  private async reviewBySupervisors(
    tasks: PhaseTask[],
    projectTask: string,
    signal: AbortSignal,
    transcript: Message[],
    diskContext: string,
  ): Promise<void> {
    const withSupervisor = tasks.filter((t) => t.reportsTo)
    if (withSupervisor.length === 0) return

    for (const task of withSupervisor) {
      if (signal.aborted) return
      const supervisor = this.agents.find((a) => a.role === task.reportsTo)
      if (!supervisor) continue

      const artifacts = this.taskOutputs.get(task.id) ?? []
      if (artifacts.length === 0) continue

      // 1) Validasi independen: sudah memenuhi criteria atau belum?
      const reviews = reviewSubordinate(task, artifacts, supervisor.role)
      for (const r of reviews) {
        this.emit({ type: 'REVIEW', agentId: supervisor.id, taskId: task.id, review: r })
      }

      const rejected = reviews.filter((r) => r.verdict === 'perlu-revisi')
      if (rejected.length === 0) {
        this.log('success', 'quality', `${supervisor.name} menyetujui hasil "${task.title}"`, {
          task: task.id,
          score: reviews[0]?.score,
        })
        continue
      }

      // 2) Kuota reproses habis → terima apa adanya, jangan looping.
      const done = this.reprocessCount.get(task.id) ?? 0
      if (done >= MAX_REPROCESS) {
        this.log(
          'warn', 'quality',
          `${supervisor.name}: "${task.title}" belum sesuai setelah ${done}x reproses — diterima apa adanya`,
          { task: task.id },
        )
        continue
      }

      const reasons = rejected
        .flatMap((r) => r.criteria.filter((c) => !c.ok).map((c) => c.hint ?? c.label))
        .filter((v, i, a) => a.indexOf(v) === i)

      this.log(
        'warn', 'quality',
        `${supervisor.name} menolak "${task.title}" — diproses ulang (${done + 1}/${MAX_REPROCESS})`,
        { task: task.id },
      )

      // 3) Atasan MEMBACA file bawahan, lalu task-nya dijalankan ulang dengan
      //    catatan revisi yang menyebut bagian yang kurang.
      const reread = await this.askSupervisor(supervisor, buildReviewPrompt(task, artifacts), signal)

      const reviewMsg: Message = {
        id: uid('msg'),
        agentId: supervisor.id,
        agentName: supervisor.name,
        role: 'review',
        content:
          (reread ? `${reread}\n\n` : '') +
          `❌ Hasil "${task.title}" dari ${task.ownerRole} BELUM SESUAI.\n` +
          `Masalah: ${reasons.join('; ')}\n` +
          `Saya kembalikan ke ${task.ownerRole} untuk diproses ulang.`,
        phase: task.phase,
        createdAt: Date.now(),
        streaming: false,
      }
      transcript.push(reviewMsg)
      this.emit({ type: 'AGENT_MESSAGE', agentId: supervisor.id, message: reviewMsg, agents: this.roster() })

      this.reprocessCount.set(task.id, done + 1)
      const owner = this.agents.find((a) => a.role === task.ownerRole)
      if (!owner) continue

      const rebuilt = await this.runTask(
        task,
        owner,
        projectTask,
        `${supervisor.name} (atasanmu) meninjau hasilmu dan meminta revisi:\n` +
          `${reread || 'Hasil belum memenuhi criteria.'}\n\n` +
          `Masalah spesifik: ${reasons.join('; ')}\n\n` +
          `Perbaiki bagian itu saja. Jangan mengulang pekerjaan yang sudah benar.`,
        signal,
        diskContext,
      )
      if (rebuilt.message) transcript.push(rebuilt.message)
    }
  }

  /**
   * Minta penilaian singkat dari atasan. Kalau LLM gagal, kembalikan string
   * kosong — keputusan tetap diambil validasi lokal, bukan oleh teks ini.
   */
  private async askSupervisor(
    supervisor: Agent,
    prompt: string,
    signal: AbortSignal,
  ): Promise<string> {
    const systemPrompt =
      `Kamu ${supervisor.role}. ${supervisor.systemPrompt}\n` +
      `Tugasmu: menilai hasil kerja bawahanmu secara objektif dan spesifik. ` +
      `Sebutkan bagian yang kurang secara teknis, bukan komentar umum.`
    let content = ''
    try {
      for await (const chunk of stream({
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        strategy: supervisor.model.strategy,
        modelId: supervisor.model.modelId,
        temperature: 0.3,
        maxTokens: 500,
        signal,
      })) {
        if (signal.aborted) break
        if (chunk.delta) content += chunk.delta
      }
      return content.trim()
    } catch (err) {
      this.log(
        'warn', 'quality',
        `Penilaian atasan gagal: ${err instanceof Error ? err.message : String(err)}`,
      )
      return ''
    }
  }

  /* ------------------------------ eksekusi -------------------------------- */

  /**
   * Jalankan file program yang baru ditulis agent, lalu ubah hasilnya jadi
   * catatan revisi.
   *
   * Inilah yang menutup celah verifikasi: sebelumnya "kode ini benar?" hanya
   * dijawab dengan mencocokkan kata kunci (`export`, `function`, ...), jadi
   * program yang gagal compile tetap ditulis "Sesuai". Sekarang programnya
   * benar-benar dijalankan dan pesan error-nya dikembalikan ke agent supaya ia
   * bisa memperbaiki sendiri.
   *
   * Return `null` bila tidak ada yang perlu dijalankan (bukan kode, atau tidak
   * ada runner untuk ekstensi itu) — supaya tidak membanjiri prompt.
   */
  private async executeAndReport(
    agent: Agent,
    artifacts: Artifact[],
  ): Promise<string | null> {
    const notes: string[] = []

    // Pasang dependensi SEBELUM menjalankan apa pun. Tanpa ini, program python
    // yang mengimpor paket akan mati dengan ModuleNotFoundError walaupun
    // requirements.txt-nya sudah benar — persis kasus "pas dicoba hasilnya
    // jelek" yang sering dikeluhkan.
    const absDir = resolveSafe('.')
    if (absDir) {
      const deps = await installRequirements(absDir)
      if (deps.installed.length > 0) {
        this.log('success', 'run', `Library terpasang: ${deps.installed.join(', ')}`)
        notes.push(
          `Library sudah dipasang otomatis sebelum dijalankan: ${deps.installed.join(', ')}`,
        )
      }
      if (deps.failed.length > 0) {
        for (const f of deps.failed) {
          this.log('error', 'run', `Gagal memasang ${f.name}: ${f.error}`)
        }
        notes.push(
          `Gagal memasang library: ${deps.failed.map((f) => `${f.name} (${f.error})`).join(', ')}.\n` +
            `Perbaiki requirements.txt atau hapus dependensi yang tidak tersedia.`,
        )
      }
    }

    for (const art of artifacts) {
      if (art.kind !== 'code') continue

      const detected = detectCommand(art.path)
      if (!detected.ok) {
        // Runtime belum ada (mis. PHP) — dicatat tanpa menghakimi hasil kerja.
        this.log('info', 'run', `${agent.name}: ${art.path} dilewati (${detected.reason})`, {
          task: art.taskTitle,
        })
        continue
      }

      this.log('info', 'run', `${agent.name}: menjalankan ${art.path} (${detected.lang})`, {
        task: art.taskTitle,
      })

      const run: RunResult = await runFile(art.path)
      const label = art.path

      if (run.skipped) {
        notes.push(`${label}: tidak dijalankan — ${run.skipped}`)
        continue
      }

      this.emit({
        type: 'RUN_RESULT',
        agentId: agent.id,
        run: {
          path: label,
          lang: detected.lang,
          ok: run.ok,
          code: run.code,
          durationMs: run.durationMs,
          timedOut: run.timedOut,
          message: run.ok
            ? 'berhasil'
            : run.timedOut
              ? 'timeout'
              : `exit ${run.code}`,
        },
      })

      const status = run.ok ? 'berhasil' : run.timedOut ? 'timeout' : `exit ${run.code}`
      this.log(
        run.ok ? 'success' : 'warn',
        'run',
        `${agent.name}: ${label} → ${status} (${run.durationMs} ms)`,
        { task: art.taskTitle },
      )

      if (run.ok) {
        const out = run.stdout.trim()
        notes.push(
          `${label}: program BERJALAN tanpa error${
            out ? `\nstdout:\n${out.slice(0, 1200)}` : ' (tidak ada output)'
          }`,
        )
      } else {
        // Inilah umpan balik yang paling berharga: pesan error aslinya.
        const detail = run.stderr.trim() || run.stdout.trim() || '(tanpa pesan)'
        notes.push(
          `${label}: program GAGAL${
            run.timedOut ? ' (timeout - mungkin infinite loop)' : ` (exit ${run.code})`
          }\n` +
            `pesan error:\n${detail.slice(0, 1800)}\n\n` +
            `Perbaiki kode sampai program benar-benar berjalan tanpa error.`,
        )
      }
    }

    if (notes.length === 0) return null

    return (
      `\n\nHASIL EKSEKUSI PROGRAM (dijalankan sungguhan di mesin ini):\n` +
      notes.join('\n\n')
    )
  }

  /**
   * Kerjakan satu task. Urutannya: pindah ke ruangan activity → kalau perlu
   * menghampiri rekanan → thinking → typing(stream) → selesai.
   */
  private async runTask(
    task: PhaseTask,
    agent: Agent,
    projectTask: string,
    history: string,
    signal: AbortSignal,
    diskContext: string,
  ): Promise<{ message: Message | null; artifacts: Artifact[] }> {
    if (signal.aborted) return { message: null, artifacts: [] }

  agent.currentTaskId = task.id
    this.setActivity(agent, task.activity)
    // Setiap giliran/task punya jatah revisi sendiri.
    this.revisionLeft = MAX_REVISION

    // Folder khusus task ini — hasil kerja agent TIDAK akan tercampur dengan
    // task lain. Semua tulis selama task ini aktif masuk ke
    // projects/<proyek>/tasks/<taskId>/.
    setActiveTask(task.id)

    // 1) Pindah ke ruangan sesuai activity.
    const room = ACTIVITY_ROOM[task.activity]
    const seat =
      task.activity === 'work' && room === 'desks'
        ? agent.homeStation
        : nextSlot(room, this.slotsFor(room), this.agents.indexOf(agent))
    await this.moveTo(agent, seat, signal, 420)
    if (signal.aborted) return { message: null, artifacts: [] }

    // 2) Kalau task meminta, menghampiri rekanan lebih dulu.
    const consultNote = await this.approachConsults(task, agent, signal)
    if (signal.aborted) return { message: null, artifacts: [] }

    // 3) Skill: gabungkan skill dari registry dengan skill yang DITEMUKAN
    // dari deskripsi task. Ini yang membuat pemilihan skill mengikuti kebutuhan
    // nyata, bukan hanya tebakan `task.skillKeys` saat registry ditulis.
    const declared = task.skillKeys ?? agent.guard.skillKeys
    const discovered = await discoverSkills(`${task.title} ${task.instruction}`)
    const merged = [...new Set([...declared, ...discovered])].slice(0, 4)
    const skillBlock = await buildSkillBlock(merged)
    const extraFound = discovered.filter((k) => !declared.includes(k))
    if (extraFound.length > 0) {
      this.log('info', 'skills', `Skill ditemukan untuk "${task.title}": ${extraFound.join(', ')}`, {
        task: task.id,
      })
    }
    const allowTools = TOOL_ROLES.has(agent.role)
    const systemPrompt = this.buildSystemPrompt(agent, skillBlock, allowTools)

    // 4) Prompt tugas: spesifik per peran + instruksi menulis FILE.
    const spec = task.deliverable ?? deliverableFor(task.id)

    // 4-bis) Hasil kerja rekan yang jadi acuan — isi file, bukan ringkasan chat.
    const upstream = upstreamContext(task, this.taskOutputs)

    // 4-ter) MEMORI: kesimpulan task-task sebelumnya yang relevan. Ini yang
    // membuat task berikutnya tidak mulai dari nol walau tidak punya
    // dependensi formal ke task itu.
    const memory = memoryContext(`${task.title} ${task.instruction} ${projectTask}`)

    // Agent berwenang boleh membuat skill baru kalau yang ada tidak cukup.
    // Hanya peran senior/teknis — bukan semua agent, supaya hemat token.
    const canAuthor = AUTHOR_SKILL_ROLES.has(agent.role)

    // 4a) riset internet — sekali per kata kunci, di-cache supaya agent lain
    // di fase yang sama memakai hasil yang sama tanpa memanggil jaringan lagi.
    const webBlock = await this.researchOnce(projectTask, agent, signal)

    const userPrompt =
      `Proyek: ${projectTask}\n\n` +
      `Tugas khusus untukmu (${task.title}): ${task.instruction}\n` +
      (consultNote ? `\n${consultNote}\n` : '') +
      (webBlock ? `\n${webBlock}\n` : '') +
      (history ? `\nKeluaran tim sebelumnya:\n${history}\n` : '') +
      (memory ? `\n${memory}\n` : '') +
      (upstream ? `\n${upstream}\n` : '') +
      (diskContext ? `\n${diskContext}\n` : '') +
      `\nKerjakan sesuai jobdescmu sebagai ${agent.role}. Jangan mengerjakan bagian tim lain.` +
      (spec ? deliverablePrompt(spec) : '') +
      (canAuthor ? `\n${SKILL_AUTHORING_PROMPT}\n` : '') +
      workspaceRulesPrompt()

    const message = await this.streamTurn(
      agent,
      task,
      systemPrompt,
      userPrompt,
      signal,
      allowTools,
    )

    const produced = this.lastArtifacts
    agent.currentTaskId = null
    // Simpan per task agar task hilir dan atasan bisa membaca hasilnya.
    if (produced.length > 0) {
      this.taskOutputs.set(task.id, produced)
    }

    // MEMORI: simpan KESIMPULAN (bukan transkrip) supaya task berikutnya bisa
    // mengingat keputusan ini walau tidak punya dependensi formal ke task ini.
    if (message) {
      const saved = saveMemory({
        taskId: task.id,
        title: task.title,
        agentName: agent.name,
        phase: task.phase,
        summary: summarizeForMemory(message.content),
        files: produced.map((a) => a.path),
      })
      if (saved) {
        this.log('info', 'memory', `Kesimpulan "${task.title}" disimpan untuk task berikutnya`, {
          task: task.id,
        })
      }
    }

    return { message, artifacts: produced }
  }

/**
   * Simpan skill baru yang ditulis agent, bila ada di balasannya.
   *
   * Aturan main:
   *  - Hanya satu skill per balasan.
   *  - Draft wajib lolos validasi (nama aman, deskripsi ada, isi >= 300 karakter).
   *  - Skill yang namanya sudah dipakai DITOLAK — agent tidak boleh menimpa
   *    skill bawaan maupun skill buatan agent lain.
   *  - Setelah tersimpan, cache skill di-invalidate supaya agent berikutnya
   *    langsung memakainya tanpa restart server.
   */
  private async maybeAuthorSkill(agent: Agent, content: string): Promise<void> {
    const draft = parseSkillDraft(content)
    if (!draft) return

    const existing = new Set((await loadSkills()).keys())
    const verdict = validateSkillDraft(draft, existing)

    if (!verdict.ok) {
      this.log(
        'warn', 'skills',
        `${agent.name}: skill "${draft.key}" ditolak — ${verdict.errors.join('; ')}`,
      )
      return
    }

    const file = await saveSkillDraft(verdict.draft!)
    if (!file) {
      this.log('warn', 'skills', `${agent.name}: gagal menyimpan skill "${draft.key}"`)
      return
    }

    invalidateSkillCache()
    this.createdSkills.push(draft.key)
    this.log(
      'success', 'skills',
      `${agent.name} membuat skill baru: "${draft.key}"`,
      { description: draft.description },
    )
    this.emit({
      type: 'AGENT_MESSAGE',
      agentId: agent.id,
      message: {
        id: uid('msg'),
        agentId: agent.id,
        agentName: agent.name,
        role: 'skill',
        content:
          `🧠 Saya membuat skill baru: **${draft.key}**\n` +
          `${draft.description}\n` +
          `Skill ini tersimpan dan bisa dipakai agent lain pada giliran berikutnya.`,
        phase: 'requirement',
        createdAt: Date.now(),
        streaming: false,
      },
      agents: this.roster(),
    })
  }

  /**
   * Riset internet untuk satu giliran, dengan cache per kata kunci.
 *
 * Aturan hemat token & kecepatan:
 *  - Hanya agent "peneliti" (CEO, PM, BA) yang menelusuri internet.
 *  - Satu pencarian per kata kunci; cache dipakai lintas agent & lintas task.
 *  - Kegagalan jaringan → blok kosong, task tetap jalan (tidak menggagalkan).
 */
private async researchOnce(
    projectTask: string,
    agent: Agent,
    signal: AbortSignal,
  ): Promise<string> {
    // Hanya agen riset; coder/reviewer/QA bekerja dari brief + isi workspace.
    const researcherRoles = new Set(['CEO', 'Product Manager', 'Business Analyst'])
    if (!researcherRoles.has(agent.role)) return ''

    const key = projectTask.trim().toLowerCase()
    if (!key) return ''

    const cached = this.researchCache.get(key)
    if (cached !== undefined) return cached

    // Batasi: satu kata kunci, dipotong agar hemat.
    const query = projectTask.slice(0, 200)
    const block = await research(query)
    this.researchCache.set(key, block)
    if (block) {
      this.log('info', 'research', `Riset internet: "${query.slice(0, 60)}"`, {
        chars: block.length,
      })
    }
    void signal
    return block
  }

  /**
   * Susun system prompt: menjaga agent di jobdesc-nya DAN membuatnya terarah.
   *
   * Bagian "GAYA KOMUNIKASI" adalah penawar utama agar tim tidak bertele-tele:
   * satu giliran = satu keputusan/hasil, tanpa mengulang tugas dan tanpa
   * penutup basa-basi.
   */
  private buildSystemPrompt(agent: Agent, skillBlock: string, allowTools: boolean): string {
    return (
      `${agent.systemPrompt}\n\n` +
      `PERAN: ${agent.role}\n` +
      `MANDAT: ${agent.guard.mandate}\n` +
      `BOLEH: ${agent.guard.can.join(', ')}\n` +
      `TIDAK BOLEH: ${agent.guard.cannot.join(', ')}\n\n` +
      `Jika diminta mengerjakan sesuatu di luar batas itu, nyatakan singkat bahwa itu bukan ` +
      `bagian dari jobdescmu, lalu fokuskan dengan bagian yang menjadi tanggung jawabmu.\n` +
      `\nGAYA KOMUNIKASI (WAJIB):\n` +
      `- Satu giliran = satu hasil kerja konkret, bukan diskusi panjang.\n` +
      `- Langsung ke inti. JANGAN mengulang tugas, konteks, atau pertanyaan yang sudah jelas.\n` +
      `- DILARANG: basa-basi, sapaan, penutup offer bantuan, dan kalimat penanda.\n` +
      `- Jangan mengomentari pekerjaan teammate; cukup sebut temuan faktual bila relevan.\n` +
      `- Jika tidak ada yang perlu Said, jawab dalam 1-2 kalimat saja.\n` +
      `- Tulis dalam Bahasa Indonesia yang lugas dan teknis.\n` +
      (allowTools
        ? `\nALAT KERJA (WAJIB dipakai, bukan sekadar dicatat):\n` +
          `Kamu punya akses nyata ke direktori kerja dan mesin ini:\n` +
          `- list_tasks   : lihat folder tiap agent + file apa yang sudah dikerjakan\n` +
          `- list_files   : lihat file yang sudah ada (pun milik rekananmu)\n` +
          `- read_file    : baca isi file sebelum menyuntingnya\n` +
          `- write_file   : buat file baru di folder taskmu\n` +
          `- edit_file    : ubah file (overwrite/append)\n` +
          `- delete_file  : hapus file yang tidak dipakai\n` +
          `- run_program  : JALANKAN programmu dan lihat stdout/stderr aslinya\n` +
          `- install_library : pasang library python ke venv proyek\n\n` +
          `Folder kerja taskmu sendiri. Semua hasil kerja finalmu harus ada di sana.\n\n` +
          `Aturan wajib:\n` +
          `1. Untuk tugas kode: tulis file LALU panggil run_program. Jangan percaya kode yang belum dijalankan.\n` +
          `2. Kalau program GAGAL, baca stderr-nya, perbaiki, lalu jalankan LAGI. Ulangi sampai berjalan.\n` +
          `3. Kalau butuh library, panggil install_library sebelum menjalankan program.\n` +
          `4. Sebelum menimpa file rekanan: baca dulu (read_file) lalu edit, jangan langsung overwrite.\n` +
          `5. Kerjakan sendiri bagian jobdescmu; jangan menunggu aid dari rekanan.\n`
        : '') +
      (skillBlock ? `\n${skillBlock}\n` : '')
    )
  }

  /** Eksekusi satu giliran: thinking → typing → stream → (tool) → selesai. */
  private async streamTurn(
    agent: Agent,
    task: PhaseTask,
    systemPrompt: string,
    userPrompt: string,
    signal: AbortSignal,
    allowTools = false,
  ): Promise<Message | null> {
    agent.status = 'thinking'
    this.emit({ type: 'AGENT_THINKING', agentId: agent.id, taskId: task.id, agents: this.roster() })
    this.log('info', 'llm', `→ ${agent.name} (${agent.role}) · ${task.title} · ${agent.model.strategy}`, {
      task: task.id,
      routing: agent.model.strategy,
      skills: task.skillKeys ?? agent.guard.skillKeys,
    })

    // Jeda "berpikir" supaya animasi terlihat.
    await this.sleep(400, signal)
    if (signal.aborted) return null

    agent.status = 'typing'
    this.emit({ type: 'AGENT_TALKING', agentId: agent.id, taskId: task.id, agents: this.roster() })

    const message: Message = {
      id: uid('msg'),
      agentId: agent.id,
      agentName: agent.name,
      role: agent.role,
      content: '',
      phase: task.phase,
      createdAt: Date.now(),
      streaming: true,
    }
    this.emit({ type: 'AGENT_MESSAGE', agentId: agent.id, message: { ...message } })

    let content = ''
    let usage: TokenUsage = zeroUsage()

    // Riwayat percakapan + tool result. Inilah yang membuat agent bisa
    // BERKALI-KALI memakai tool: hasil tool jadi pesan(role:'tool') yang
    // dikirim kembali, lalu model memutuskan langkah berikutnya sendiri.
    const convo: LlmMessage[] = [{ role: 'user', content: userPrompt }]

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        let roundCalls: ToolCall[] = []
        let roundText = ''

        for await (const chunk of stream({
          system: systemPrompt,
          messages: convo,
          strategy: agent.model.strategy,
          modelId: agent.model.modelId,
          signal,
          ...(allowTools ? { tools: TOOL_SPECS } : {}),
        })) {
          if (signal.aborted) break
          if (chunk.delta) {
            roundText += chunk.delta
            content += chunk.delta
            this.emit({ type: 'AGENT_STREAM_CHUNK', agentId: agent.id, chunk: chunk.delta })
          }
          if (chunk.done) {
            if (chunk.usage) usage = chunk.usage
            if (chunk.toolCalls) roundCalls = chunk.toolCalls
            if (chunk.route) {
              agent.telemetry = chunk.route
              this.log(
                chunk.route.fallback ? 'warn' : 'success',
                'route',
                `${agent.name}: model=${chunk.route.model ?? 'auto'} latency=${chunk.route.latencyMs ?? 0}ms`,
                {
                  model: chunk.route.model,
                  latencyMs: chunk.route.latencyMs,
                  tokensSaved: chunk.route.tokensSaved,
                  fallback: chunk.route.fallback,
                  compression: chunk.route.compression,
                },
              )
            }
          }
        }

        // Model tidak meminta tool -> giliran selesai.
        if (roundCalls.length === 0) break

        // Simpan giliran assistant berisi pemanggilan tool.
        convo.push({
          role: 'assistant',
          content: roundText || `(memakai tool: ${roundCalls.map((c) => c.name).join(', ')})`,
        })

        // Jalankan setiap tool, lalu kirim hasilnya kembali ke model.
        for (const call of roundCalls) {
          this.log('info', 'tools', `${agent.name} memanggil ${call.name}(${JSON.stringify(call.args)})`, {
            task: task.id,
          })
          const result = await executeTool(call, task.id)

          if (call.name === 'run_program') {
            this.emit({
              type: 'RUN_RESULT',
              agentId: agent.id,
              run: {
                path: String(call.args.path ?? ''),
                lang: '—',
                ok: result.ok,
                code: result.ok ? 0 : null,
                durationMs: 0,
                timedOut: result.content.includes('timeout'),
                message: result.ok ? 'berhasil' : 'gagal',
              },
            })
          }

          this.log(
            result.ok ? 'success' : 'warn',
            'tools',
            `${agent.name} ← ${call.name}: ${result.content.split('\n')[0]}`,
            { task: task.id },
          )
          convo.push({ role: 'tool', content: result.content, toolCallId: call.id })
        }
      }
    } catch (err) {
      agent.status = 'error'
      const m = err instanceof Error ? err.message : String(err)
      this.log('error', 'llm', `${agent.name} gagal: ${m}`)
      this.emit({ type: 'AGENT_ERROR', agentId: agent.id, error: m })
      return null
    }

    if (!content.trim()) {
      agent.status = 'idle'
      this.log('warn', 'llm', `${agent.name} tidak menghasilkan balasan`)
      return null
    }

    agent.usage = {
      prompt: agent.usage.prompt + usage.prompt,
      completion: agent.usage.completion + usage.completion,
      total: agent.usage.total + usage.total,
      requests: agent.usage.requests + usage.requests,
    }
    agent.status = 'idle'

    const produced = this.extractArtifacts(agent, task, content)
    this.lastArtifacts = produced

    // Skill buatan agent (bila ada di balasan): divalidasi lalu disimpan
    // supaya agent lain bisa memakainya di giliran berikutnya.
    await this.maybeAuthorSkill(agent, content)

    // VALIDASI: apakah hasil kerja ini SESUAI dengan criteria task?
    // Tiga lapis: bentuk (quality.ts), kesesuaian isi (validation.ts), lalu
    // EKSEKUSI NYATA (runner.ts) — program dijalankan, bukan cuma dibaca.
    if (produced.length > 0) {
      const shape = evaluateArtifacts(produced)
      const verdict = validateArtifacts(
        task.id,
        produced.map((p) => ({ path: p.path, content: p.content })),
      )
      const worst = worstOffender(verdict)

      // Jalankan program yang ditulis agent. Hasilnya jadi bahan revisi.
      const runNote = await this.executeAndReport(agent, produced)
      const runFailed = runNote !== null && runNote.includes('GAGAL')

      for (const v of verdict) {
        this.emit({
          type: 'REVIEW',
          agentId: agent.id,
          taskId: task.id,
          review: {
            taskId: task.id,
            agentId: agent.id,
            path: v.path,
            verdict: v.verdict,
            score: v.score,
            summary: v.summary,
            criteria: v.criteria,
          },
        })
      }

      const shapeBad = shape.filter((r) => r.needsRevision)
      // Program yang gagal = hasil belum layak, apa pun skor validasi kata kunci.
      if (worst !== null || shapeBad.length > 0 || runFailed) {
        const issues = [
          ...(worst ? worst.criteria.filter((c) => !c.ok).map((c) => c.hint ?? c.label) : []),
          ...shapeBad.flatMap((r) => r.issues),
          ...(runFailed && runNote ? [runNote] : []),
        ]
        const revised = await this.revise(agent, task, systemPrompt, userPrompt, issues, signal, message)
        if (revised) return revised
      } else {
        this.log('success', 'quality', `${agent.name}: hasil sesuai (${verdict[0]?.score ?? 100}%)`, {
          task: task.id,
          files: produced.map((a) => a.path),
        })
      }
    }

    await this.sleep(240, signal)

    const finalMessage: Message = {
      ...message,
      content,
      streaming: false,
      usage,
      artifactIds: produced.map((a) => a.id),
    }
    this.emit({ type: 'AGENT_MESSAGE', agentId: agent.id, message: finalMessage, agents: this.roster() })
    this.emit({ type: 'AGENT_DONE', agentId: agent.id, usage: agent.usage, agents: this.roster() })
    this.log('info', 'llm', `← ${agent.name}: ${content.length} chars, ${usage.total} tokens`)

    return finalMessage
  }

  /**
   * Minta agent memperbaiki hasil kerjanya.
   *
   * Dipakai dua sumber permintaan:
   * - otomatis  — validasi lokal menemukan criteria yang gagal,
   * - manual     — user menekan "Minta Revisi" di UI, atau agent reviewer
   *                mengirim catatan revisi lewat socket.
   *
   * Revisi dibatasi {@link MAX_REVISION} kali per task supaya tidak berputar
   * tanpa henti. Hasil akhir divalidasi ulang — kalau masih gagal, verdict
   * `perlu-revisi` tetap dikirim ke UI agar user tahu perlu intervensi.
   */
  private async revise(
    agent: Agent,
    task: PhaseTask,
    systemPrompt: string,
    userPrompt: string,
    issues: string[],
    signal: AbortSignal,
    baseMessage?: Message,
  ): Promise<Message | null> {
    if (this.revisionLeft <= 0) {
      this.log('warn', 'quality', `${agent.name}: batas revisi tercapai, menerima hasil apa adanya`, {
        task: task.id,
      })
      return null
    }
    this.revisionLeft--
    const attempt = MAX_REVISION - this.revisionLeft + 1
    const reason = issues.length > 0 ? issues.join('; ') : 'hasil belum memenuhi criteria'

    this.log(
      'warn', 'quality',
      `${agent.name}: perlu revisi (${reason})`,
      { task: task.id, attempt },
    )

    // Instruksi revisi menyebut secara spesifik apa yang kurang, supaya
    // agent memperbaiki bagian yang benar, bukan menulis ulang asal-asalan.
    const note =
      `\n\nPERMINTAAN REVISI (percobaan ${attempt}/${MAX_REVISION}):\n` +
      `Hasil sebelumnya BELUM SESUAI dengan criteria task karena:\n` +
      `- ${reason}\n\n` +
      `Tulis ulang file yang sama dengan:\n` +
      `1. Isi UTUH dan lengkap — jangan dipotong.\n` +
      `2. Semua bagian yang disebut di atas harus dibahas eksplisit.\n` +
      `3. Tutup setiap blok kode dengan benar.\n` +
      `4. Hanya tulis blok "file:<path>" jika tugas memang meminta file.`

    const revised = await this.streamTurn(agent, task, systemPrompt, userPrompt + note, signal)
    if (!revised) return null

    const revProduced = this.extractArtifacts(agent, task, revised.content)
    if (revProduced.length === 0) return null
    this.lastArtifacts = revProduced

    // Validasi ulang hasil revisi — inilah yang ditampilkan ke user.
    const checks = validateArtifacts(
      task.id,
      revProduced.map((p) => ({ path: p.path, content: p.content })),
    )
    const stillBad = worstOffender(checks)
    for (const v of checks) {
      this.emit({
        type: 'REVIEW',
        agentId: agent.id,
        taskId: task.id,
        review: {
          taskId: task.id,
          agentId: agent.id,
          path: v.path,
          verdict: v.verdict,
          score: v.score,
          summary: v.summary,
          criteria: v.criteria,
        },
      })
    }

    this.log(
      stillBad ? 'warn' : 'success',
      'quality',
      stillBad
        ? `${agent.name}: revisi masih belum sesuai (${stillBad.summary})`
        : `${agent.name}: revisi sesuai (${checks[0]?.score ?? 100}%)`,
      { task: task.id, files: revProduced.map((a) => a.path) },
    )

    const revMessage: Message = {
      ...(baseMessage ?? {
        id: uid('msg'),
        agentId: agent.id,
        agentName: agent.name,
        role: 'agent',
        content: '',
        phase: task.phase,
        createdAt: Date.now(),
        streaming: true,
      }),
      content: revised.content,
      streaming: false,
      usage: agent.usage,
      artifactIds: revProduced.map((a) => a.id),
    }
    this.emit({ type: 'AGENT_MESSAGE', agentId: agent.id, message: revMessage, agents: this.roster() })
    this.emit({ type: 'AGENT_DONE', agentId: agent.id, usage: agent.usage, agents: this.roster() })
    return revMessage
  }

  /**
   * Revisi atas permintaan user — dipanggil dari socket `revise`.
   *
   * Alur: user memilih artefak → memberi catatan → agent pemilik task
   * menulis ulang file tersebut → hasil divalidasi ulang.
   */
  async requestRevision(
    agentId: string,
    taskId: string,
    note: string,
  ): Promise<void> {
    const agent = this.agents.find((a) => a.id === agentId)
    const task = findTask(taskId)
    if (!agent || !task) {
      this.log('warn', 'quality', `Revisi ditolak: agent/task tidak ditemukan (${taskId})`)
      return
    }

    this.log('info', 'quality', `User meminta revisi: ${agent.name} → ${taskId}`, { task: taskId })

    // Revisi dari user boleh melewati batas revisi otomatis: ini perintah
    // eksplisit manusia, bukan Quality Gate yang memancing dirinya sendiri.
    this.revisionLeft = Math.max(this.revisionLeft, 1)

    const skillBlock = await buildSkillBlock(task.skillKeys ?? agent.guard.skillKeys)
    const systemPrompt = this.buildSystemPrompt(agent, skillBlock, TOOL_ROLES.has(agent.role))
    const userPrompt =
      `Tulis ulang hasil kerja untuk task "${task.title}".\n` +
      `Permintaan revisi dari user:\n${note || 'Perbaiki agar lebih lengkap dan sesuai criteria.'}`

    const revMessage = await this.revise(agent, task, systemPrompt, userPrompt, [note], new AbortController().signal)
    if (revMessage) {
      this.log('success', 'quality', `${agent.name} menindaklanjuti revisi user`)
    }
  }

  /**
   * Agent berjalan menghampiri rekan yang perlu ia tanyakan, lalu berdiri di
   * sebelahnya (garis tautan digambar di canvas lewat `consulting`).
   */
  private async approachConsults(
    task: PhaseTask,
    agent: Agent,
    signal: AbortSignal,
  ): Promise<string> {
    const ids = task.consult ?? []
    if (ids.length === 0) return ''

    const notes: string[] = []

    for (const id of ids) {
      if (signal.aborted) return ''
      const other = this.agents.find((a) => a.id === id)
      if (!other) continue

      agent.consulting = id
      this.emit({ type: 'AGENT_APPROACH', agentId: agent.id, targetAgentId: id, agents: this.roster() })
      this.log('info', 'workflow', `${agent.name} menghampiri ${other.name} (${other.role})`)

      await this.moveTo(agent, adjacentTo(other.location), signal, 700)
      if (signal.aborted) return ''

      notes.push(
        `Kamu baru saja menghampiri ${other.name} (${other.role}) untuk bertanya sebelum ` +
          `mengerjakan "${task.title}". Tanyakan hal yang memang berada di wilayah jobdesc ` +
          `${other.role}, bukan mengerjakan pekerjaannya.`,
      )
    }

    return notes.join('\n')
  }
}
