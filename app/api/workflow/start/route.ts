/**
 * POST /api/workflow/start
 * ---------------------------------------------------------------------------
 * Menjalankan workflow multi-agent secara sinkron (untuk integrasi non-UI /
 * skrip), memakai engine yang sama dengan yang dipakai WebSocket.
 *
 * Untuk streaming real-time ke UI, gunakan socket `/socket/office`.
 * ---------------------------------------------------------------------------
 */
import { NextResponse } from 'next/server'
import type { Agent } from '@/types/agent'
import { ChatDevEngine } from '@/lib/orchestrator/ChatDevEngine'
import { readAgentConfig } from '@/lib/server/agentConfigStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Workflow penuh bisa berjalan lama → izinkanDurasi panjang. */
export const maxDuration = 300

export async function POST(request: Request) {
  let body: { task?: unknown; agents?: unknown; hitl?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON valid' }, { status: 400 })
  }

  const task = typeof body.task === 'string' ? body.task.trim() : ''
  if (!task) {
    return NextResponse.json({ error: 'Field "task" wajib diisi' }, { status: 400 })
  }
  if (task.length > 4000) {
    return NextResponse.json({ error: 'Task terlalu panjang (maks 4000 karakter)' }, { status: 400 })
  }

  // Prioritaskan roster dari request, lalu config server, lalu default engine.
  let roster: Agent[] = await readAgentConfig()
  if (Array.isArray(body.agents) && body.agents.length > 0) {
    roster = body.agents as Agent[]
  }

  // Kumpulkan event agar bisa dikirim balik sebagai ringkasan.
  const phases: string[] = []
  const artifacts: { path: string; language: string }[] = []

  const engine = new ChatDevEngine({
    onEvent: (event) => {
      if (event.type === 'PHASE_CHANGE' && event.phase) phases.push(event.phase)
      if (event.type === 'ARTIFACT' && event.artifact) {
        artifacts.push({ path: event.artifact.path, language: event.artifact.language })
      }
    },
  })
  engine.configure(roster)

  try {
    const messages = await engine.run(task, Boolean(body.hitl))
    return NextResponse.json({
      task,
      messages,
      phases,
      artifacts,
      tokens: engine.roster().reduce(
        (acc, a) => ({
          prompt: acc.prompt + a.usage.prompt,
          completion: acc.completion + a.usage.completion,
          total: acc.total + a.usage.total,
        }),
        { prompt: 0, completion: 0, total: 0 },
      ),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}