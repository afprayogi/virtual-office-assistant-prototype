/**
 * Smoke test engine: menjalankan workflow singkat (1 fase) lewat OmniRoute
 * untuk membuktikan dispatch per-role + paralel + approach benar-benar jalan.
 *
 * Jalankan: npx tsx ./tests/engine-smoke.ts
 */
import { ChatDevEngine } from '../lib/orchestrator/ChatDevEngine'
import type { OfficeEvent } from '../types/agent'

async function main() {
  const counts: Record<string, number> = {}
  const approaches: string[] = []
  const activities = new Set<string>()

  const t0 = Date.now()
  const engine = new ChatDevEngine({
    onEvent: (e: OfficeEvent) => {
      counts[e.type] = (counts[e.type] ?? 0) + 1
      if (e.type === 'AGENT_APPROACH' && e.agentId && e.targetAgentId) {
        approaches.push(`${e.agentId} → ${e.targetAgentId}`)
      }
      if (e.type === 'AGENT_ACTIVITY' && e.activity) activities.add(e.activity)
    },
  })

  // Batasi ke fase pertama supaya test tidak terlalu lama.
  const originalRun = engine.run.bind(engine)
  await originalRun('Buat aplikasi catatan singkat', false)

  console.log('durasi      :', Math.round((Date.now() - t0) / 1000), 'detik')
  console.log('events      :', JSON.stringify(counts))
  console.log('activities  :', [...activities].join(', '))
  console.log('approach    :', approaches.length ? [...new Set(approaches)].join(', ') : '(tidak ada)')
  console.log('--- roster akhir ---')
  for (const a of engine.roster()) {
    console.log(
      `${a.name.padEnd(7)} ${a.role.padEnd(17)} act=${(a.activity ?? '-').padEnd(7)} status=${(a.status ?? '-').padEnd(9)} di(${a.location.x},${a.location.y})`,
    )
  }
}
main().catch((e) => {
  console.error('GAGAL:', e)
  process.exit(1)
})