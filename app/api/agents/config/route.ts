import { NextResponse } from 'next/server'
import { readAgentConfig, validateAgents, writeAgentConfig } from '@/lib/server/agentConfigStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/agents/config — roster agent beserta konfigurasi modelnya. */
export async function GET() {
  return NextResponse.json(await readAgentConfig())
}

/** POST /api/agents/config — tetapkan model/provider per agent. */
export async function POST(request: Request) {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON valid' }, { status: 400 })
  }

  // Terima juga bentuk { agents: [...] } agar ramah klien.
  const candidate = Array.isArray(payload) ? payload : (payload as { agents?: unknown })?.agents

  const result = validateAgents(candidate)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json(await writeAgentConfig(result.agents))
}