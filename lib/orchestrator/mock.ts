/**
 * lib/orchestrator/mock.ts
 * ---------------------------------------------------------------------------
 * Provider simulasi OFFLINE. Dipakai HANYA bila OmniRoute tidak terjangkau,
 * agar aplikasi tetap bisa di-preview/didemo tanpa gateway.
 * Menghasilkan balasan kontekstual per peran lalu memancarkannya per-fragment
 * seperti streaming sungguhan.
 * ---------------------------------------------------------------------------
 */
import type { LlmChunk, LlmRequest } from './llm'

/** Balasan kontekstual per peran agent (Markdown + code block + tabel). */
const MOCK_PLAYBOOK: Record<string, (task: string) => string> = {
  CEO: (t) => `## Visi Produk â€” ${t}

**Problem statement.** Pengguna membutuhkan alur kerja yang jelas untuk menyelesaikan "${t}" tanpa harus menebak langkah-langkahnya.

**Prioritas**
1. Kejelasan di atas fitur â€” satu jalur utama yang instan.
2. Waktu ke nilai pertama < 5 menit.
3. Tidak ada konfigurasi wajib sebelum pertama kali dipakai.

**Batasan.** Satu sprint (2 minggu), tim 2 orang, tanpa backend dedicated.

**Metrik sukses.** Task completion rate > 80% pada usability test pertama.`,

  'Product Manager': (t) => `### User Story

> Sebagai pengguna, saya ingin **${t}** agar saya dapat menyelesaikan pekerjaan tanpa kehilangan konteks.

**Acceptance criteria**
- [ ] Aksi utama selesai dalam 3 klik.
- [ ] State kosong selalu punya pesan yang membangun next action.
- [ ] Error tidak pernah menghilangkan data yang sudah diisi.

**Prioritas:** P0 â€” harus ada di rilis pertama.`,

  'Lead Developer': (t) => `### Rencana Implementasi

**Stack:** Next.js 14 (App Router) + TypeScript + Tailwind, state di Zustand, streaming via WebSocket.

Skema tipe bersama agar semua layer punya kontrak yang sama:
- \`Task.id\`, \`Task.title\`, \`Task.status\` ('todo' | 'doing' | 'done')
- \`Task.ownerId\` menunjuk agent yang mengerjakan
- \`Task.createdAt\` untuk pengurutan timeline

**Langkah**
1. Skema tipe di folder \`types/\` agar semua layer berbagi kontrak.
2. Store Zustand dengan immutable update.
3. Panel UI yang membaca selector sempit (re-render minimal).
4. Unit test untuk reducer store.`,

  'Code Reviewer': (t) => `### Hasil Review

**Blokir (harus diperbaiki)**
- \`lib/orchestrator/llm.ts\`: pastikan \`AbortSignal\` diteruskan ke setiap \`fetch\` agar request tidak menggantung.

**Saran**
- Pindahkan \`MODEL_CATALOG\` ke modul konfigurasi terpisah agar mudah di-cache.
- Tambahkan retry/backoff untuk provider yang transient-fail.
- Batasi \`max_tokens\` agar biaya terkendali.

**Skor:** 7/10 â€” arsitektur sudah benar, tinggal perbaikan minor.`,

  'QA Automation': (t) => `### Strategi Pengujian

| # | Skenario | Ekspektasi | prioritas |
|---|----------|------------|-----------|
| 1 | Render awal halaman | Kanvas + roster tampil tanpa error | P0 |
| 2 | Klik avatar agent | Detail panel + statistik token muncul | P1 |
| 3 | Jalankan workflow | Fase Requirement â†’ Documenting terlewati berurutan | P0 |
| 4 | Stream terputus | UI kembali ke status idle, log(error) tercatat | P0 |
| 5 | Prompt kosong | Tombol Start disabled, validasi tampil | P2 |

**Regresi:** jalankan ulang alur lengkap terhadap build sebelumnya sebelum rilis.`,
}

/**
 * Fallback generik bila peran tidak ada di playbook.
 *
 * PENTING: isi balasan mock TIDAK BOLEH mengandung fence ``` , karena
 * streamer membungkusnya di blok `file:<path>`. Fence di dalam akan
 * menggagalkan parser dan Workspace terpotong di tengah file.
 */
function genericMock(role: string, task: string): string {
  return `**${role}** menelaah "${task}" pada fase ini.

- Identifikasi kebutuhan utama.
- Susun kriteria penerimaan yang dapat diuji.
- Catat risiko serta rencana mitigasi.

Silakan lanjut ke tahap berikutnya dengan pertimbangan di atas.`
}

/** Jaring pengaman: buang fence yang mungkin menetas dari playbook. */
// Jaga agar playbook bebas fence yang bisa merusak blok `file:`.
for (const [role, fn] of Object.entries(MOCK_PLAYBOOK)) {
  const sample = fn('contoh')
  if (sample.includes('```')) console.warn(`[mock] playbook ${role} memuat fence`)
}
function stripFences(text: string): string {
  return text.replace(/```/g, '')
}

/**
 * Terjemahkan alasan kegagalan gateway menjadi penjelasan yang bisa ditindaklanjuti.
 *
 * Sebelumnya semua kegagalan — termasuk 402 "saldo habis", 429 "rate limit",
 * dan 503 "backend kosong" — dilabeli sama: "OmniRoute tidak terjangkau".
 * Itu salah dan menyesatkan: gateway-nya justru hidup dan menjawab, hanya
 * tidak punya model yang bisa dipakai. User lalu mengejar masalah yang salah.
 */
function explainDegrade(reason: string): string {
  const r = reason.toLowerCase()
  const detail = reason.length > 160 ? `${reason.slice(0, 160)}…` : reason

  // 402 — saldo akun habis. Satu-satunya jalan: top up atau ganti model.
  if (r.includes('402') || r.includes('add credits') || r.includes('insufficient')) {
    return (
      `Gateway hidup, tapi **tidak ada saldo/kredit** untuk model yang dipilih. ` +
      `Ini BUKAN masalah koneksi.\n` +
      `> Perbaikan: top up kredit OmniRoute, atau pilih model gratis di sidebar.\n` +
      `> Penyebab: ${detail}`
    )
  }

  // 429 — kena rate limit (umumnya pada model :free).
  if (r.includes('429') || r.includes('rate limit') || r.includes('too many')) {
    return (
      `Gateway hidup, tapi **kena rate limit** — biasanya terjadi pada model gratis.\n` +
      `> Perbaikan: tunggu beberapa menit, atau pilih model lain.\n` +
      `> Penyebab: ${detail}`
    )
  }

  // 503 — gateway tidak punya backend yang bisa dipakai saat ini.
  if (r.includes('503') || r.includes('unavailable') || r.includes('skipped by pre-dispatch')) {
    return (
      `Gateway hidup, tapi **tidak ada backend yang tersedia** untuk model tersebut.\n` +
      `> Perbaikan: pilih model lain (mis. auto/best-free atau model :free).\n` +
      `> Penyebab: ${detail}`
    )
  }

  // 401/403 — kredensial atau sesi kedaluwarsa.
  if (r.includes('401') || r.includes('403') || r.includes('auth') || r.includes('session')) {
    return (
      `Gateway hidup, tapi **kredensial ditolak atau sesi kedaluwarsa**.\n` +
      `> Perbaikan: cek OMNIROUTE_API_KEY di .env.local lalu jal ulang server.\n` +
      `> Penyebab: ${detail}`
    )
  }

  // 500/502/504 — sisi gateway/proxy yang bermasalah.
  if (r.includes('502') || r.includes('504') || r.includes('500')) {
    return (
      `Gateway hidup, tapi **upstream model gagal** (biasanya karena saldo habis di cascade).\n` +
      `> Penyebab: ${detail}`
    )
  }

  // Sisanya: kemungkinan benar-benar jaringan.
  return (
    `Tidak bisa menghubungi gateway (atau gateway menolak).\n` +
    `> Penyebab: ${detail}`
  )
}

export async function* streamMock(
  req: LlmRequest,
  degradeReason?: string,
): AsyncGenerator<LlmChunk> {
  const systemLine = req.system.split('\n')[0] ?? ''
  // Coba cocokkan peran dari system prompt.
  const role = Object.keys(MOCK_PLAYBOOK).find((r) => systemLine.includes(r))
  const lastUser = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? ''
  // Prompt engine mengirim "Tugas proyek: <brief>"; dukung juga bentuk polos.
  const taskMatch = lastUser.match(/Tugas(?:\s+proyek)?\s*:\s*([^\n]+)/i)
  const rawTask = (taskMatch?.[1] ?? 'proyek baru').trim()

  const rawBody = role ? MOCK_PLAYBOOK[role](rawTask) : genericMock(role ?? 'Asisten', rawTask)
  const body = stripFences(rawBody)
  const header = degradeReason
    ? `> ⚠️ **SIMULASI — BUKAN MODEL SUNGGUHAN.**\n` +
      `> ${explainDegrade(degradeReason)}\n\n`
    : ''

  /**
   * Hormati kontrak deliverable: kalau prompt meminta file tertentu, mock pun
   * WAJIB menulis blok `file:<path>`. Tanpa ini Workspace akan kosong saat
   * gateway offline — dan itu justru skenario yang paling sering dipakai demo.
   *
   * Penting: ambil match TERAKHIR. Prompt berisi "keluaran tim sebelumnya"
   * yang juga punya blok `file:`, sedangkan instruksi deliverable kita ada di
   * paling akhir. Kalau ambil yang pertama, semua agent akan menimpa path
   * milik phase requirement.
   */
  const pathMatches = [...lastUser.matchAll(/```file:([\w./-]+)/g)]
  const wantedPath = pathMatches[pathMatches.length - 1]?.[1]
  const full = wantedPath
    ? `${header}Berikut hasil kerja saya.\n\n\`\`\`file:${wantedPath}\n${body}\n\`\`\`\n`
    : header + body

  const promptTokens =
    req.messages.reduce((acc, m) => acc + estimateTokens(m.content), 0) + estimateTokens(req.system)
  const completionTokens = estimateTokens(full)

  // Emit per-fragment agar animasi & typing indicator terlihat realistis,
  // dikelompokkan (sekitar 4 kata per potong) supaya demo tidak terlalu lambat.
  const words = full.match(/\S+\s*/g) ?? [full]
  const CHUNK_SIZE = 4
  for (let i = 0; i < words.length; i += CHUNK_SIZE) {
    await new Promise((r) => setTimeout(r, 14 + Math.random() * 18))
    yield { delta: words.slice(i, i + CHUNK_SIZE).join(''), done: false }
  }
  yield {
    delta: '',
    done: true,
    usage: { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens, requests: 1 },
  }
}

/** Perkiraan token (heuristic ~4 karakter per token). */
function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4))
}