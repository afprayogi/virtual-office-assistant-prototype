/**
 * E2E produksi: halaman + WebSocket workflow penuh dengan konten Markdown
 * yang mengandung baris `**tebal**` (pemicu bug infinite loop sebelumnya).
 */
const BASE = process.env.TEST_BASE ?? 'http://localhost:3100'

async function main() {
  const page = await fetch(BASE)
  const html = await page.text()
  console.log('1) GET /        :', page.status, '| len', html.length)
  console.log('   error page   :', /agent-error|Application error/.test(html) ? 'ADA (buruk)' : 'tidak ada (baik)')

  // Jalankan workflow lewat WebSocket dan kumpulkan pesan pertama per agent.
  const WebSocket = (await import('ws')).default
  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/socket/office`)

  const counts: Record<string, number> = {}
  let firstText = ''

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS timeout 5 menit')), 300_000)
    ws.on('open', () => ws.send(JSON.stringify({ action: 'start', task: 'Buat aplikasi catatan singkat' })))
    ws.on('message', (raw: Buffer) => {
      const ev = JSON.parse(raw.toString()) as { type: string; message?: { content: string } }
      counts[ev.type] = (counts[ev.type] ?? 0) + 1
      if (ev.type === 'AGENT_STREAM_CHUNK' && !firstText && ev.message) firstText = ev.message.content
      if (ev.type === 'WORKFLOW_DONE') {
        clearTimeout(timer)
        ws.close()
        resolve()
      }
    })
    ws.on('error', reject)
  })

  console.log('2) WS selesai   :', JSON.stringify(counts))
  console.log('   chunk pertama:', JSON.stringify(firstText.slice(0, 90)))
  console.log('   ada **bold**:', /\*\*/.test(firstText))
}
main().catch((e) => {
  console.error('GAGAL:', e.message)
  process.exit(1)
})