/**
 * config/routing.ts
 * ---------------------------------------------------------------------------
 * Konstanta routing yang AMAN dipakai client component.
 *
 * PENTING: file ini SENGAJA tidak meng-import `openai` maupun membaca
 * `process.env`, supaya tidak menarik kode server ke bundle browser.
 * `config/omniroute.ts` (server-only) meng-import types dari sini.
 * ---------------------------------------------------------------------------
 */

/**
 * Strategi routing adaptif — karakter utama OmniRoute.
 *  - smart   : tugas berpikir tinggi → model terkuat (Sonnet / GPT-4o / R1)
 *  - fast    : eksekusi & respons cepat → latency terendah (Groq / Qwen Flash)
 *  - cheap   : task ringan → free-tier quota
 *  - offline : model lokal / cache gateway
 *  - pinned  : kunci ke model tertentu (header X-OmniRoute-Model)
 */
export type RoutingStrategy =
  | 'auto/smart'
  | 'auto/fast'
  | 'auto/cheap'
  | 'auto/offline'
  | 'pinned'

/** Strategi routing yang bisa dipilih di UI sidebar. */
export const ROUTING_CATALOG: { value: RoutingStrategy; label: string; hint: string }[] = [
  { value: 'auto/smart', label: 'auto/smart', hint: 'Model terkuat — planner, arsitektur, keputusan kritis' },
  { value: 'auto/fast', label: 'auto/fast', hint: 'Latency terendah — eksekutor, coder, respon' },
  { value: 'auto/cheap', label: 'auto/cheap', hint: 'Hemat kuota — summarizer, task ringan' },
  { value: 'auto/offline', label: 'auto/offline', hint: 'Model lokal / cache gateway' },
  { value: 'pinned', label: 'pinned', hint: 'Kunci ke model ID tertentu' },
]

/**
 * Model ID native OmniRoute untuk mode `pinned` (diambil dari katalog gateway,
 * prefix `auto/` = routing otomatis).
 */
export const PINNED_MODELS = [
  // Routing otomatis lain
  'auto/best-reasoning',
  'auto/best-coding',
  'auto/best-fast',
  'auto/best-chat',
  'auto/best-vision',
  'auto/pro-reasoning',
  'auto/pro-coding',
  'auto/pro-fast',
  'auto/pro-chat',
  'auto/coding',
  // Routing per keluarga model
  'auto/claude-opus',
  'auto/claude-sonnet',
  'auto/claude-haiku',
]

/** Petunjuk singkat untuk tiap strategi (dipakai di UI). */
export const ROUTING_HINT: Record<RoutingStrategy, string> = Object.fromEntries(
  ROUTING_CATALOG.map((c) => [c.value, c.hint]),
) as Record<RoutingStrategy, string>