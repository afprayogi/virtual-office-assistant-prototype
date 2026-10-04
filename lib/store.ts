/**
 * lib/store.ts
 * ---------------------------------------------------------------------------
 * State management global (Zustand). Satu store untuk roster agent, pesan chat
 * (streaming), artefak, log terminal, status workflow, permintaan HITL, dan
 * koneksi WebSocket. Event dari socket masuk lewat `applyEvent()` sehingga UI
 * hanya memiliki satu jalur mutasi state.
 * ---------------------------------------------------------------------------
 */
'use client'

import { create } from 'zustand'
import type {
  Agent,
  Artifact,
  HitlRequest,
  LogEntry,
  Message,
  OfficeEvent,
  ReviewResult,
  WorkflowPhase,
  WorkflowStatus,
} from '@/types/agent'
import { DEFAULT_AGENTS } from '@/lib/orchestrator/defaults'
import { notify } from '@/lib/toastStore'
import { uid } from '@/lib/utils'

const MAX_LOG = 400

/** Label fase untuk UI (server & client memakai sumber yang sama). */
export const PHASE_LABELS: Record<WorkflowPhase, string> = {
  requirement: 'Requirement',
  design: 'Design',
  creative: 'Creative',
  coding: 'Coding',
  testing: 'Testing',
  documenting: 'Documenting',
  done: 'Done',
}

export interface OfficeStore {
  agents: Agent[]
  messages: Message[]
  artifacts: Artifact[]
  logs: LogEntry[]
  task: string
  phase: WorkflowPhase
  status: WorkflowStatus
  connected: boolean
  hitlEnabled: boolean
  pendingHitl: HitlRequest | null
  selectedAgentId: string | null
  activeArtifactId: string | null
  /** Speech bubble aktif per agent beserta teksnya. */
  bubbles: Record<string, { text: string; at: number }>
  /**
   * Waktu (ms) agent terakhir menyelesaikan task-nya.
   *
   * Disimpan sebagai map terpisah — BUKAN di dalam `Agent` — karena `agents`
   * di-overwrite utuh oleh snapshot dari server. Kalau disimpan di objek
   * agent, centang "selesai" akan ikut terhapus tiap kali roster dikirim.
   */
  finishedAt: Record<string, number>
  /**
   * Waktu (ms) workflow selesai. Selama beberapa detik setelahnya semua agent
   * berkumpul merayakan — dipakai canvas untuk confetti + percikan api.
   */
  celebratedAt: number | null
  /**
   * Hasil pengecekan kelayakan per file, diisi dari event `REVIEW`.
   *
   * Key = path file. Disimpan terpisah dari `artifacts` karena `artifacts`
   * di-overwrite utuh setiap ada file baru, sedangkan status "sesuai atau
   * belum" harus bertahan supaya user bisa memutuskan minta revisi.
   */
  reviews: Record<string, ReviewResult>

  setTask: (task: string) => void
  setConnected: (connected: boolean) => void
  setHitlEnabled: (enabled: boolean) => void
  selectAgent: (id: string | null) => void
  setActiveArtifact: (id: string | null) => void
  updateAgentModel: (agentId: string, patch: Partial<Agent['model']>) => void
  updateAgent: (agentId: string, patch: Partial<Agent>) => void
  applyEvent: (event: OfficeEvent) => void
  reset: () => void
}

export const useOfficeStore = create<OfficeStore>((set) => ({
  agents: structuredClone(DEFAULT_AGENTS),
  messages: [],
  artifacts: [],
  logs: [],
  task: '',
  phase: 'requirement',
  status: 'idle',
  connected: false,
  hitlEnabled: false,
  pendingHitl: null,
  selectedAgentId: null,
  activeArtifactId: null,
  bubbles: {},
  finishedAt: {},
  celebratedAt: null,
  reviews: {},

  setTask: (task) => set({ task }),
  setConnected: (connected) => set({ connected }),
  setHitlEnabled: (hitlEnabled) => set({ hitlEnabled }),
  selectAgent: (selectedAgentId) => set({ selectedAgentId }),
  setActiveArtifact: (activeArtifactId) => set({ activeArtifactId }),

  updateAgentModel: (agentId, patch) =>
    set((s) => ({
      agents: s.agents.map((a) => (a.id === agentId ? { ...a, model: { ...a.model, ...patch } } : a)),
    })),

  updateAgent: (agentId, patch) =>
    set((s) => ({ agents: s.agents.map((a) => (a.id === agentId ? { ...a, ...patch } : a)) })),

  reset: () =>
    set({
      messages: [],
      artifacts: [],
      logs: [],
      phase: 'requirement',
      status: 'idle',
      pendingHitl: null,
      bubbles: {},
      finishedAt: {},
      celebratedAt: null,
      reviews: {},
      activeArtifactId: null,
    }),

  /** Titik masuk tunggal untuk seluruh event dari WebSocket. */
  applyEvent: (event) =>
    set((s) => {
      const next = officeReducer(s, event)
      // Notifikasi dipicu di sini — satu-satunya titik pemicu, supaya tidak
      // tersebar di komponen dan tidak ada toast yang terduplikasi.
      // Gabungkan dengan state lama agar notifikasi bisa membaca jumlah
      // file/pesan terbaru walau reducer hanya mengubah sebagian state.
      notifyForEvent(event, { ...s, ...next })
      return next
    }),
}))
/**
 * Terjemahkan event socket menjadi notifikasi yang dilihat user.
 *
 * Prinsipnya: beri tahu saat sesuatu BENAR-BENAR selesai atau perlu
 * perhatian — bukan setiap potongan stream. Kalau terlalu sering, notifikasi
 * jadi noise dan user akan dimatikan.
 *
 * `next` adalah state SETELAH event diterapkan (gabungan state lama + hasil
 * reducer), supaya notifikasi bisa membaca jumlah file/pesan terbaru.
 */
function notifyForEvent(event: OfficeEvent, next: OfficeStore): void {
  switch (event.type) {
    // Agent menyelesaikan satu task → konfirmasi dengan nama peran & hasil.
    case 'AGENT_DONE': {
      if (!event.agentId) return
      const agent = next.agents.find((a) => a.id === event.agentId)
      const name = agent?.name ?? 'Agent'
      const role = agent?.role ? ` (${agent.role})` : ''
      // Kalau pesan terakhirnya menghasilkan file, sebut bendanya.
      const last = [...next.messages].reverse().find((m) => m.agentId === event.agentId)
      const files = last?.artifactIds?.length ?? 0
      notify.success(
        '✅',
        `${name} selesai${role}`,
        files > 0 ? `${files} file dihasilkan` : undefined,
      )
      return
    }

    // File hasil kerja baru → tampilkan bentuknya (📄 pdf / 💻 program).
    case 'ARTIFACT': {
      const a = event.artifact
      if (!a) return
      notify.info(a.icon ?? '📄', `Hasil kerja: ${a.path.split('/').pop()}`, a.path)
      return
    }

    // Pengecekan kelayakan → toast ✅ / ⚠️ supaya user langsung tahu.
    case 'REVIEW': {
      const r = event.review
      if (!r) return
      const file = r.path.split('/').pop() ?? r.path
      if (r.verdict === 'sesuai') {
        notify.success('✅', `${file} sesuai`, `${r.score}% criteria terpenuhi`)
      } else {
        notify.warn('⚠️', `${file} perlu revisi`, r.summary)
      }
      return
    }

    // Ringkasan akhir — inilah "notifikasi selesai" yang paling penting.
    case 'WORKFLOW_DONE': {
      const files = next.artifacts.length
      const pdf = next.artifacts.filter((a) => a.kind === 'pdf').length
      const code = next.artifacts.filter((a) => a.kind === 'code' || a.kind === 'html').length
      const bits = [
        `${files} file`,
        pdf > 0 ? `📄 ${pdf}` : null,
        code > 0 ? `💻 ${code}` : null,
        `${next.messages.length} pesan`,
      ].filter(Boolean)
      notify.success('🎉', 'Workflow selesai', bits.join(' · '))
      return
    }

    case 'HITL_REQUEST':
      notify.warn('⏸', 'Menunggu persetujuan kamu',
        event.hitl ? `Fase ${PHASE_LABELS[event.hitl.phase]}` : undefined)
      return

    case 'ERROR':
      notify.error('⚠️', 'Terjadi kesalahan', event.error)
      return

    default:
      return
  }
}

/**
 * Reducer tunggal untuk seluruh event WebSocket — dipisah agar `create()`
 * tetap ringkas dan mudah dibaca.
 */
function officeReducer(s: OfficeStore, event: OfficeEvent): Partial<OfficeStore> {
  switch (event.type) {
    case 'SNAPSHOT':
    case 'PHASE_CHANGE':
    case 'WORKFLOW_DONE':
      return {
        ...(event.agents ? { agents: event.agents } : {}),
        ...(event.phase ? { phase: event.phase } : {}),
        ...(event.type === 'WORKFLOW_DONE'
          ? {
              status: 'done' as WorkflowStatus,
              // Penanda mulai merayakan (confetti + percikan).
              celebratedAt: Date.now(),
            }
          : {}),
      }

    case 'AGENT_THINKING':
    case 'AGENT_TALKING':
    case 'AGENT_MOVE_TO_ROOM':
    case 'AGENT_DONE':
    case 'AGENT_ERROR':
    case 'AGENT_ACTIVITY':
    case 'AGENT_APPROACH':
      return { agents: mergeAgentStatus(s.agents, event) }

    case 'AGENT_MESSAGE': {
      if (!event.message) return {}
      const msg = event.message
      const exists = s.messages.some((m) => m.id === msg.id)
      return {
        messages: exists ? s.messages.map((m) => (m.id === msg.id ? msg : m)) : [...s.messages, msg],
        ...(event.agentId ? { bubbles: { ...s.bubbles, [event.agentId]: { text: '', at: Date.now() } } } : {}),
      }
    }

    case 'AGENT_STREAM_CHUNK': {
      if (!event.agentId || !event.chunk) return {}
      // Pesan streaming aktif = pesan terakhir milik agent tersebut.
      const target = [...s.messages].reverse().find((m) => m.agentId === event.agentId && m.streaming)
      if (!target) return {}
      const text = target.content + event.chunk
      return {
        messages: s.messages.map((m) => (m.id === target.id ? { ...m, content: text } : m)),
        bubbles: { ...s.bubbles, [event.agentId]: { text: text.slice(-140), at: Date.now() } },
      }
    }

    case 'ARTIFACT':
      // File dengan path yang sama ditimpa (revisi), bukan diduplikasi —
      // supaya Workspace mencerminkan struktur proyek, bukan riwayat percakapan.
      if (!event.artifact) return {}
      return {
        artifacts: [
          ...s.artifacts.filter((a) => a.path !== event.artifact!.path),
          event.artifact,
        ],
        activeArtifactId: s.activeArtifactId ?? event.artifact.id,
        // File baru = status-reviewed lama tidak berlaku lagi.
        reviews: Object.fromEntries(
          Object.entries(s.reviews).filter(([p]) => p !== event.artifact!.path),
        ),
      }

    // Pengecekan hasil kerja → "sesuai" atau "perlu revisi".
    case 'REVIEW': {
      const r = event.review
      if (!r) return {}
      return { reviews: { ...s.reviews, [r.path]: r } }
    }

    case 'HITL_REQUEST':
      return { pendingHitl: event.hitl ?? null, status: 'awaiting_human' as WorkflowStatus }

    case 'HITL_RESOLVED':
      return { pendingHitl: null, status: 'running' as WorkflowStatus }

    case 'LOG': {
      if (!event.log) return {}
      const entry: LogEntry = { ...event.log, id: event.log.id || uid('log') }
      return { logs: [...s.logs, entry].slice(-MAX_LOG) }
    }

    case 'ERROR': {
      const log: LogEntry = {
        id: uid('log'),
        ts: Date.now(),
        level: 'error',
        source: 'socket',
        message: event.error ?? 'Kesalahan tidak diketahui',
      }
      return { logs: [...s.logs, log].slice(-MAX_LOG), status: 'error' as WorkflowStatus }
    }

    // Task selesai → catat waktunya supaya canvas bisa menggambar centang ✅
    // di atas avatar selama beberapa detik ke depan.
    case 'AGENT_DONE':
      return {
        ...s,
        agents: mergeAgentStatus(s.agents, event),
        ...(event.agentId
          ? { finishedAt: { ...s.finishedAt, [event.agentId]: Date.now() } }
          : {}),
      }

    default:
      return {}
  }
}

/** Terapkan perubahan status satu agent dari event visual. */
function mergeAgentStatus(agents: Agent[], event: OfficeEvent): Agent[] {
  if (event.agents) return event.agents
  if (!event.agentId) return agents
  return agents.map((a) => {
    if (a.id !== event.agentId) return a
    switch (event.type) {
      case 'AGENT_MOVE_TO_ROOM':
        return { ...a, status: 'moving', ...(event.to ? { target: event.to } : {}) }
      case 'AGENT_ACTIVITY':
        return {
          ...a,
          ...(event.activity ? { activity: event.activity } : {}),
          ...(event.taskId ? { currentTaskId: event.taskId } : {}),
        }
      case 'AGENT_APPROACH':
        // Agent berjalan menghampiri rekanan → garis tautan digambar di canvas.
        return { ...a, status: 'moving', consulting: event.targetAgentId ?? null }
      case 'AGENT_THINKING':
        return { ...a, status: 'thinking', currentTaskId: event.taskId ?? a.currentTaskId ?? null }
      case 'AGENT_TALKING':
        return { ...a, status: 'typing', currentTaskId: event.taskId ?? a.currentTaskId ?? null }
      case 'AGENT_ERROR':
        return { ...a, status: 'error' }
      case 'AGENT_DONE':
        return { ...a, status: 'idle', consulting: null, currentTaskId: null, ...(event.to ? { location: event.to } : {}) }
      default:
        return a
    }
  })
}