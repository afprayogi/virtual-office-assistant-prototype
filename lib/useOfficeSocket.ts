/**
 * lib/useOfficeSocket.ts
 * ---------------------------------------------------------------------------
 * Client-side hook yang manages koneksi WebSocket ke `/socket/office`.
 *
 * Tanggung jawab:
 *   - Membuka & menutup koneksi dengan auto-reconnect (backoff eksponensial).
 *   - Menerjemahkan tiap OfficeEvent menjadi state store (`applyEvent`).
 *   - Mengekspos API aksi: start / interrupt / hitl / updateAgents / nudge.
 * ---------------------------------------------------------------------------
 */
'use client'

import * as React from 'react'
import type { Agent, ClientCommand, OfficeEvent } from '@/types/agent'
import { useOfficeStore } from '@/lib/store'

const SOCKET_URL = `${(() => {
  if (typeof window === 'undefined') return ''
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/socket/office`
})()}`

export interface OfficeSocketApi {
  connected: boolean
  start: (task: string, agents: Agent[], hitl: boolean) => void
  interrupt: () => void
  respondHitl: (hitlId: string, choice: string, note?: string) => void
  updateAgents: (agents: Agent[]) => void
  /** Picu agent berpikir (debug). */
  nudge: (agentId: string) => void
  /** Minta agent merevisi hasil kerjanya. */
  requestRevision: (agentId: string, taskId: string, note?: string) => void
  /** Minta agent lain merevisi pekerjaan rekannya (code review). */
  reviewPeer: (reviewerAgentId: string, taskId: string, note: string) => void
}

export function useOfficeSocket(): OfficeSocketApi {
  const socketRef = React.useRef<WebSocket | null>(null)
  const retryRef = React.useRef(0)
  const closedRef = React.useRef(false)

  const applyEvent = useOfficeStore((s) => s.applyEvent)
  const setConnected = useOfficeStore((s) => s.setConnected)
  const connected = useOfficeStore((s) => s.connected)

  /** Kirim perintah bila socket siap (antre bila belum). */
  const send = React.useCallback((cmd: ClientCommand) => {
    const ws = socketRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(cmd))
    } else {
      // Tunda sampai socket siap agar aksi tidak hilang.
      window.setTimeout(() => {
        const retry = socketRef.current
        if (retry && retry.readyState === WebSocket.OPEN) retry.send(JSON.stringify(cmd))
      }, 400)
    }
  }, [])

  React.useEffect(() => {
    closedRef.current = false

    const connect = () => {
      if (closedRef.current) return
      const ws = new WebSocket(SOCKET_URL)
      socketRef.current = ws

      ws.onopen = () => {
        retryRef.current = 0
        setConnected(true)
      }

      ws.onmessage = (event) => {
        try {
          applyEvent(JSON.parse(event.data as string) as OfficeEvent)
        } catch {
          /* abaikan payload rusak */
        }
      }

      ws.onclose = () => {
        setConnected(false)
        socketRef.current = null
        if (closedRef.current) return
        // Backoff eksponensial: 0.5s, 1s, 2s, 4s… maksimum 8s.
        const delay = Math.min(500 * 2 ** retryRef.current, 8000)
        retryRef.current += 1
        window.setTimeout(connect, delay)
      }

      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      closedRef.current = true
      socketRef.current?.close()
    }
  }, [applyEvent, setConnected])

  return React.useMemo<OfficeSocketApi>(
    () => ({
      connected,
      start: (task, agents, hitl) => send({ action: 'start', task, agents, hitl }),
      interrupt: () => send({ action: 'interrupt' }),
      respondHitl: (hitlId, choice, note) => send({ action: 'hitl', hitlId, choice, note }),
      updateAgents: (agents) => send({ action: 'update_agents', agents }),
      nudge: (agentId) => send({ action: 'nudge', agentId }),
    requestRevision: (agentId, taskId, note) =>
      send({ action: 'revise', agentId, taskId, note }),
    reviewPeer: (reviewerAgentId, taskId, note) =>
      send({ action: 'review_peer', reviewerAgentId, taskId, note }),
    }),
    [connected, send],
  )
}