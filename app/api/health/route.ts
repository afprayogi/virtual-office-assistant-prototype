import { NextResponse } from 'next/server'
import {
  OMNIROUTE_BASE_URL,
  OMNIROUTE_COMBO,
  OMNIROUTE_COMPRESSION,
  omnirouteHealth,
} from '@/config/omniroute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Status aplikasi & konektivitas ke gateway OmniRoute. */
export async function GET() {
  const health = await omnirouteHealth(2500)
  return NextResponse.json({
    ok: true,
    app: 'Virtual Office Multi-Agent Workspace',
    socket: '/socket/office',
    gateway: {
      reachable: health.reachable,
      baseUrl: OMNIROUTE_BASE_URL,
      compression: OMNIROUTE_COMPRESSION,
      combo: OMNIROUTE_COMBO,
      detail: health.detail,
    },
    mode: health.reachable ? 'live (OmniRoute)' : 'simulasi (OmniRoute offline)',
    uptimeSeconds: Math.round(process.uptime()),
  })
}