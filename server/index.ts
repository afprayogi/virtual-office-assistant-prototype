/**
 * server/index.ts
 * ---------------------------------------------------------------------------
 * Custom server Next.js: menyatukan request handler Next.js dan WebSocket
 * `/socket/office` pada SATU port (default 3000), sehingga tidak perlu CORS
 * dan alur socket tetap sinkron dengan route handler.
 *
 * Jalankan dengan:
 *     npm run dev     (mode pengembangan, hot reload)
 *     npm run build && npm start   (mode produksi)
 * ---------------------------------------------------------------------------
 */
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import next from 'next'
import { OMNIROUTE_BASE_URL } from '@/config/omniroute'
import { attachWebSocket } from './websocket'

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOST ?? 'localhost'
const port = Number(process.env.PORT ?? 3000)

/**
 * Kredensial gateway (opsional untuk lokal). Sengaja TIDAK membaca API key
 * provider — seluruh routing dikelola OmniRoute.
 */
const hasGatewayCredentials = () =>
  Boolean(process.env.OMNIROUTE_API_KEY ?? process.env.LLM_API_KEY)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

async function main(): Promise<void> {
  // Banner dicetak SEBELUM `app.prepare()`.
  //
  // Sebelumnya banner hanya muncul di dalam callback `server.listen`, yang
  // berjalan SETELAH Next.js selesai menyiapkan itself. Di mode produksi itu
  // bisa memakan puluhan detik — dan karena tidak ada output apa pun selama
  // itu, user mengira server-nya mati padahal sebenarnya sedang berjalan.
  console.log(`\n  ▸ Virtual Office Multi-Agent Workspace`)
  console.log(`    http://${hostname}:${port}`)
  console.log(`    WebSocket: ws://${hostname}:${port}/socket/office`)
  console.log(`    Gateway : ${OMNIROUTE_BASE_URL}`)
  console.log(`    Mode    : ${dev ? 'development' : 'production'}`)
  console.log(`    …menyiapkan Next.js${dev ? '' : ' (butuh build produksi)'}\n`)

  // Preflight produksi: tanpa build, Next akan gagal dengan pesan yang
  // membingungkan. Lebih baik gagal cepat dengan perintah yang jelas.
  if (!dev && !existsSync(path.join(process.cwd(), '.next', 'BUILD_ID'))) {
    console.error(
      `\n  ✗ BUILD PRODUKSI BELUM ADA.\n` +
        `    Jalankan dulu:  npm run build\n` +
        `    Baru jalankan:  npm start\n` +
        `    (atau pakai mode dev: npm run dev)\n`,
    )
    process.exit(1)
  }

  await app.prepare()

  const server = createServer((req, res) => {
    // `url.parse()` deprecated → pakai WHATWG URL API.
    //
    // CATATAN PENTING: untuk request tanpa host (path relatif), `url.parse()`
    // lama menghasilkan host/protocol/port = null dan Next.js lalu memakai
    // header `Host` milik request. Kita harus mempertahankan semantik itu,
    // karena Next menyusun URL redirect dari field-field tersebut.
    const base = `http://${req.headers.host ?? `${hostname}:${port}`}`
    const url = new URL(req.url ?? '/', base)

    const query: Record<string, string> = {}
    url.searchParams.forEach((value, key) => {
      query[key] = value
    })

    void handle(req, res, {
      auth: null,
      hash: url.hash || null,
      // Sengaja null — biarkan Next memakai header Host dari request.
      host: null,
      hostname: null,
      href: url.href,
      path: `${url.pathname}${url.search}`,
      pathname: url.pathname,
      port: null,
      protocol: null,
      query,
      search: url.search || null,
      slashes: null,
    })
  })

  // Pasang WebSocket sebelum server mulai listen.
  const office = attachWebSocket(server)

  server.listen(port, () => {
    // Mode ditentukan oleh gateway OmniRoute, bukan oleh API key provider.
    const mode = hasGatewayCredentials() ? 'OmniRoute (live)' : 'simulasi (gateway offline)'
    // Banner sudah dicetak di atas; di sini cukup konfirmasi "sudah siap".
    console.log(`    ✓ SIAP — http://${hostname}:${port}`)
    console.log(`    Gateway : ${mode}\n`)
  })

  // Tutup dengan rapi saat proses dihentikan (Ctrl+C).
  const shutdown = async (signal: string) => {
    console.log(`\n[${signal}] menutup server…`)
    await office.close()
    server.close(() => process.exit(0))
    // Paksa keluar bila ada koneksi yang menggantung.
    setTimeout(() => process.exit(0), 3000).unref()
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('Gagal menjalankan server:', err)
  process.exit(1)
})