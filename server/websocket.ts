/**
 * server/websocket.ts
 * ---------------------------------------------------------------------------
 * DELIVERABLE 5 — Node.js WebSocket handler untuk menyinkronkan event antara
 * ChatDevEngine, UI Chat, dan Virtual Office Canvas.
 *
 * Alur:
 *   Browser ──ws──▶ OfficeSocketServer ──▶ ChatDevEngine
 *                            │                       │
 *                            └──── OfficeEvent ◀──────┘   (fan-out ke client)
 *
 * Protokol (JSON):
 *   client → server : ClientCommand  { action: 'start' | 'hitl' | 'interrupt' | ... }
 *   server → client : OfficeEvent    { type: 'AGENT_THINKING' | ... }
 * ---------------------------------------------------------------------------
 */
import type { Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import type { Agent, ClientCommand, OfficeEvent } from '@/types/agent'
import { ChatDevEngine, DEFAULT_AGENTS } from '@/lib/orchestrator/ChatDevEngine'
import { findTask } from '@/lib/orchestrator/taskRegistry'

export const SOCKET_PATH = '/socket/office'

interface Session {
  id: string
  engine: ChatDevEngine
  /** Model agent terakhir yang dikirim client (dipakai saat 'start'). */
  roster: Agent[]
}

/** Socket server yang mengelola banyak sesi workflow secara paralel. */
export class OfficeSocketServer {
  private readonly wss: WebSocketServer
  private readonly sessions = new Map<WebSocket, Session>()
  private sessionSeq = 0

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: SOCKET_PATH })
    this.wss.on('connection', (socket, req) => {
      this.handleConnection(socket, req.headers.origin ?? null)
    })
  }

  /** Jumlah koneksi aktif (untuk health-check). */
  get connectionCount(): number {
    return this.sessions.size
  }

  /* ------------------------------ per-sesi ------------------------------- */

  private handleConnection(socket: WebSocket, origin: string | null): void {
    const id = `s${++this.sessionSeq}`
    const engine = new ChatDevEngine({ onEvent: (event) => this.send(socket, event) })

    this.sessions.set(socket, { id, engine, roster: structuredClone(DEFAULT_AGENTS) })

    this.log(socket, 'info', 'ws', `Koneksi ${id} diterima${origin ? ` dari ${origin}` : ''}`)
    this.send(socket, { type: 'HELLO', hello: 'Terhubung ke Virtual Office Multi-Agent Workspace' })
    // Kirim roster awal supaya canvas langsung menampilkan semua agent.
    this.send(socket, { type: 'SNAPSHOT', agents: engine.roster() })

    socket.on('message', (raw) => { void this.handleMessage(socket, raw.toString()) })
    socket.on('close', () => {
      const session = this.sessions.get(socket)
      this.sessions.delete(socket)
      // Batalkan workflow yang masih berjalan agar tidak sia-sia.
      session?.engine.interrupt()
      this.log(socket, 'info', 'ws', `Koneksi ${id} terputus`)
    })
    socket.on('error', (err) => this.log(socket, 'error', 'ws', `Kesalahan socket: ${err.message}`))
  }

  /* ------------------------------ broadcast ------------------------------ */

  /** Kirim event ke socket dengan safe-serialize (hindari circular/Map). */
  private send(socket: WebSocket, event: OfficeEvent): void {
    if (socket.readyState !== socket.OPEN) return
    socket.send(JSON.stringify(event, (_k, v: unknown) =>
      v instanceof Map || v instanceof Set ? undefined : v))
  }

  /** Helper untuk menulis baris log ke terminal UI milik sebuah socket. */
  private log(socket: WebSocket, level: 'info' | 'warn' | 'error', source: string, message: string): void {
    this.send(socket, {
      type: 'LOG',
      log: {
        id: `ws_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        ts: Date.now(),
        level,
        source,
        message,
      },
    })
  }

  /** Parse dan dispatch perintah client. */
  private async handleMessage(socket: WebSocket, raw: string): Promise<void> {
    const session = this.sessions.get(socket)
    if (!session) return

    let cmd: ClientCommand
    try {
      cmd = JSON.parse(raw) as ClientCommand
    } catch {
      this.log(socket, 'error', 'ws', 'Payload JSON tidak valid')
      return
    }

    switch (cmd.action) {
      case 'start': {
        if (typeof cmd.task !== 'string' || !cmd.task.trim()) {
          this.send(socket, { type: 'ERROR', error: 'Field "task" wajib diisi' })
          return
        }
        if (cmd.agents?.length) session.roster = structuredClone(cmd.agents)
        session.engine.configure(session.roster)
        this.log(socket, 'info', 'ws', `Perintah start diterima (HITL=${Boolean(cmd.hitl)})`)
        try {
          await session.engine.run(cmd.task.trim(), Boolean(cmd.hitl))
        } catch (err) {
          this.send(socket, { type: 'ERROR', error: err instanceof Error ? err.message : String(err) })
        }
        return
      }

      case 'hitl': {
        const ok = session.engine.resolveHitl(cmd.hitlId, cmd.choice, cmd.note)
        if (!ok) this.log(socket, 'warn', 'HITL', `Permintaan "${cmd.hitlId}" sudah kadaluarsa`)
        return
      }

      case 'interrupt': {
        session.engine.interrupt()
        return
      }

      case 'update_agents': {
        if (!Array.isArray(cmd.agents) || cmd.agents.length === 0) {
          this.send(socket, { type: 'ERROR', error: 'Daftar agent tidak boleh kosong' })
          return
        }
        session.roster = structuredClone(cmd.agents)
        session.engine.configure(session.roster)
        this.send(socket, { type: 'SNAPSHOT', agents: session.engine.roster() })
        this.log(socket, 'info', 'ws', `Roster diperbarui (${cmd.agents.length} agent)`)
        return
      }

      case 'nudge': {
        const agent = session.engine.roster().find((a) => a.id === cmd.agentId)
        if (agent) {
          this.log(socket, 'info', 'ws', `Manual nudge → ${agent.name}`)
          this.send(socket, { type: 'AGENT_THINKING', agentId: agent.id, agents: session.engine.roster() })
        }
        return
      }

      case 'revise': {
        if (!cmd.agentId || !cmd.taskId) {
          this.send(socket, { type: 'ERROR', error: 'Revisi butuh agentId dan taskId' })
          return
        }
        this.log(socket, 'info', 'ws', `Permintaan revisi → ${cmd.taskId}`)
        void session.engine
          .requestRevision(cmd.agentId, cmd.taskId, cmd.note ?? '')
          .catch((err: unknown) =>
            this.send(socket, {
              type: 'ERROR',
              error: err instanceof Error ? err.message : String(err),
            }),
          )
        return
      }

      // Agent A meminta agent B merevisi hasil kerjanya (code review).
      case 'review_peer': {
        const reviewer = session.engine.roster().find((a) => a.id === cmd.reviewerAgentId)
        if (!reviewer) {
          this.send(socket, { type: 'ERROR', error: `Agent "${cmd.reviewerAgentId}" tidak dikenal` })
          return
        }
        const task = findTask(cmd.taskId)
        if (!task) {
          this.send(socket, { type: 'ERROR', error: `Task "${cmd.taskId}" tidak dikenal` })
          return
        }
        // Owner task-lah yang merevisi, bukan reviewer-nya.
        const ownerId = task.ownerRole
          ? session.engine.roster().find((a) => a.role === task.ownerRole)?.id
          : undefined
        if (!ownerId) {
          this.send(socket, { type: 'ERROR', error: `Pemilik task "${cmd.taskId}" tidak ada di roster` })
          return
        }
        this.log(socket, 'warn', 'ws', `${reviewer.name} meminta revisi → ${cmd.taskId}`)
        void session.engine
          .requestRevision(ownerId, cmd.taskId, `[Catatan ${reviewer.name}] ${cmd.note}`)
          .catch((err: unknown) =>
            this.send(socket, {
              type: 'ERROR',
              error: err instanceof Error ? err.message : String(err),
            }),
          )
        return
      }

      case 'ping': {
        this.send(socket, {
          type: 'LOG',
          log: { id: `pong_${Date.now()}`, ts: Date.now(), level: 'debug', source: 'ws', message: 'pong' },
        })
        return
      }

      default:
        this.send(socket, { type: 'ERROR', error: `Aksi tidak dikenal: ${String((cmd as { action: string }).action)}` })
    }
  }

  /** Tutup semua koneksi (dipakai saat shutdown). */
  async close(): Promise<void> {
    for (const session of this.sessions.values()) session.engine.interrupt()
    this.sessions.clear()
    await new Promise<void>((resolve) => this.wss.close(() => resolve()))
  }
}

/** Helper faktori: pasang server WS ke HTTP server yang sudah berjalan. */
export function attachWebSocket(server: Server): OfficeSocketServer {
  return new OfficeSocketServer(server)
}