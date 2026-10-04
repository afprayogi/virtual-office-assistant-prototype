/**
 * server/bootstrap.ts
 * ---------------------------------------------------------------------------
 * Entry point untuk `npm run dev` / `npm start`.
 *
 * Aplikasi ini memakai variabel dari `.env.local`. Karena modul ESM dievaluasi
 * sesuai urutan import, kita HARUS memuat env file sebelum modul lain
 * (`config/omniroute.ts`) membacanya. Karena itu bootstrap memuat env lebih
 * dulu, lalu mengimpor server secara dinamis.
 *
 * `tsx` tidak memuat .env secara otomatis, jadi bootstrap ini wajib ada.
 * ---------------------------------------------------------------------------
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { loadEnvFile } from 'node:process'

const root = process.cwd()

// Muat .env.local (prioritas), lalu .env sebagai fallback.
for (const file of ['.env.local', '.env']) {
  const full = path.join(root, file)
  if (!existsSync(full)) continue
  try {
    loadEnvFile(full)
    console.log(`[env] ${file} dimuat`)
  } catch (err) {
    console.warn(`[env] gagal memuat ${file}:`, err instanceof Error ? err.message : err)
  }
}

// Import dinamis → seluruh modul aplikasi baru dievaluasi SETELAH env siap.
// (Tidak memakai top-level await agar kompatibel dengan output CJS tsx.)
import('./index').catch((err) => {
  console.error('Gagal menjalankan server:', err)
  process.exit(1)
})