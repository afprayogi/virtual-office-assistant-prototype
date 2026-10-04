/**
 * config/omniroute.ts
 * ---------------------------------------------------------------------------
 * DELIVERABLE — Konfigurasi OmniRoute AI Gateway.
 *
 * INTI ARSITEKTUR:
 *   Seluruh panggilan LLM aplikasi ini melewati OmniRoute. TIDAK ADA kode yang
 *   memanggil OpenAI / Anthropic / Gemini secara langsung. Provider asli,
 *   pemilihan model, dan failover ditangani gateway.
 *
 * Kita memakai SDK `openai` dengan `baseURL` diarahkan ke OmniRoute karena
 * OmniRoute mengekspos OpenAI-compatible endpoint.
 *
 * Header kustom yang dikirim:
 *   X-OmniRoute-Routing   : auto/smart | auto/fast | auto/cheap | auto/offline
 *   X-OmniRoute-Compress  : rtk | caveman  (token compression)
 *   X-OmniRoute-Combo     : auto          (auto-fallback antar provider)
 *
 * Mock/offline: bila gateway tidak terjangkau, `streamMock` di llm.ts
 * mengambil alih sehingga demo tetap jalan tanpa infra.
 * ---------------------------------------------------------------------------
 */
import OpenAI from 'openai'
import { ROUTING_CATALOG, type RoutingStrategy } from './routing'

// Konstanta routing client-safe tinggal di ./routing agar tidak menarik kode
// server ke bundle browser. Kita re-export di sini supaya satu titik import
// tetap bisa dipakai oleh seluruh kode server.
export { PINNED_MODELS, ROUTING_CATALOG, ROUTING_HINT, type RoutingStrategy } from './routing'

/** Base URL gateway OmniRoute (lokal/self-hosted). */
export const OMNIROUTE_BASE_URL =
  process.env.OMNIROUTE_BASE_URL ?? process.env.LLM_BASE_URL ?? 'http://localhost:20128/v1'

/**
 * API key gateway. Default lokal OmniRoute memakai key statis.
 * Override via OMNIROUTE_API_KEY bila gateway memakai kredensial lain.
 */
export const OMNIROUTE_API_KEY = process.env.OMNIROUTE_API_KEY ?? 'omni-local'

/** Token compression: 'rtk' (default) atau 'caveman'. */
export const OMNIROUTE_COMPRESSION = (process.env.OMNIROUTE_COMPRESS ?? 'rtk') as 'rtk' | 'caveman' | 'off'

/** Auto-Combo Engine → 'auto' mengaktifkan fallback otomatis antar provider. */
export const OMNIROUTE_COMBO = (process.env.OMNIROUTE_COMBO ?? 'auto') as 'auto' | 'off'

export const ROUTING_STRATEGIES: readonly RoutingStrategy[] = ROUTING_CATALOG.map((c) => c.value)

/**
 * Klien OpenAI yang diarahkan penuh ke OmniRoute.
 * `dangerouslyAllowBrowser` tidak diaktifkan — modul ini server-only.
 */
export const omniClient = new OpenAI({
  baseURL: OMNIROUTE_BASE_URL,
  apiKey: OMNIROUTE_API_KEY,
  maxRetries: 2,               // retry otomatis transient-failure
  timeout: 120_000,            // guard agar request tidak menggantung
})

/**
 * Bangun header routing per request.
 * SDK `openai` menerima `defaultHeaders` di level client, tetapi kita butuh
 * header yang BERUBAH per agent, jadi diinjeksikan lewat opsi `headers` tiap request.
 */
export function omnirouteHeaders(
  strategy: RoutingStrategy,
  modelId?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-OmniRoute-Routing': strategy,
    'X-OmniRoute-Compress': OMNIROUTE_COMPRESSION,
    'X-OmniRoute-Combo': OMNIROUTE_COMBO,
  }
  if (strategy === 'pinned' && modelId) headers['X-OmniRoute-Model'] = modelId
  return headers
}

/**
 * Nama model yang dikirim di body request.
 *
 * OmniRoute mengekspos strategi routing sebagai **model ID native**
 * (`auto/smart`, `auto/fast`, `auto/cheap`, `auto/offline`, dst), sehingga kita
 * mengirimnya langsung sebagai `model`. Ini jauh lebih andal daripada
 * mengandalkan header kustom, dan tetap kompatibel dengan gateway yang hanya
 * membaca field `model`.
 *
 * Untuk `pinned`, kita kirim model id eksplisit dari pilihan pengguna.
 */
export function modelForStrategy(strategy: RoutingStrategy, modelId?: string): string {
  if (strategy === 'pinned') return modelId || 'auto/smart'
  return strategy
}

/** Status gateway untuk UI (reachability + model yang dibadowsakan). */
export async function omnirouteHealth(timeoutMs = 4000): Promise<{
  reachable: boolean
  baseUrl: string
  compression: string
  combo: string
  models: string[]
  detail?: string
}> {
  const base = {
    baseUrl: OMNIROUTE_BASE_URL,
    compression: OMNIROUTE_COMPRESSION,
    combo: OMNIROUTE_COMBO,
  }
  try {
    const res = await fetch(`${OMNIROUTE_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${OMNIROUTE_API_KEY}` },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return { ...base, reachable: false, models: [], detail: `HTTP ${res.status}` }
    const json = (await res.json()) as { data?: { id?: string }[] }
    return {
      ...base,
      reachable: true,
      models: (json.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id)),
    }
  } catch (err) {
    return {
      ...base,
      reachable: false,
      models: [],
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}