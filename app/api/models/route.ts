import { NextResponse } from 'next/server'
import { PINNED_MODELS, ROUTING_CATALOG, ROUTING_INFO } from '@/lib/orchestrator/llm'
import { omnirouteHealth } from '@/config/omniroute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/models — daftar strategi routing + status gateway OmniRoute.
 * `reachable: false` berarti aplikasi otomatis jatuh ke mode simulasi.
 */
export async function GET() {
  const health = await omnirouteHealth()
  return NextResponse.json({
    gateway: health,
    routing: ROUTING_CATALOG,
    pinnedModels: PINNED_MODELS,
    info: ROUTING_INFO,
    mode: health.reachable ? 'omniroute' : 'simulasi (gateway offline)',
  })
}