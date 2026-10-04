/**
 * lib/orchestrator/llm.ts
 * ---------------------------------------------------------------------------
 * Integration Layer. TIDAK ADA koneksi langsung ke provider individual —
 * semua request dialirkan ke OmniRoute lewat `config/omniroute.ts`, yang
 * menangani:
 *   - pemilihan model adaptif (auto/smart, auto/fast, auto/cheap, auto/offline)
 *   - auto-fallback antar provider saat outage / rate-limit (Auto-Combo)
 *   - token compression (RTK / Caveman)
 *
 * Bila gateway tidak terjangkau, kita degrade ke simulasi lokal (`mock.ts`)
 * supaya aplikasi tetap dapat dijalankan tanpa infra apa pun.
 * ---------------------------------------------------------------------------
 */
import type { TokenUsage } from '@/types/agent'
import {
  modelForStrategy,
  omniClient,
  omnirouteHeaders,
  OMNIROUTE_COMBO,
  OMNIROUTE_COMPRESSION,
  OMNIROUTE_BASE_URL,
  type RoutingStrategy,
} from '@/config/omniroute'
import { streamMock } from './mock'
import type { ToolCall, ToolSpec } from './tools'

/**
 * Konstanta routing client-safe berada di `@/config/routing` (tanpa import
 * `openai`/`process.env`) supaya aman di-import oleh komponen browser.
 * Kita re-export sekali di sini agar pemanggil server cukup satu jalur.
 */
export {
  PINNED_MODELS,
  ROUTING_CATALOG,
  ROUTING_HINT,
  type RoutingStrategy,
} from '@/config/routing'

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  /** Wajib untuk role 'tool': id tool call yang dijawab. */
  toolCallId?: string
}

export interface LlmRequest {
  system: string
  messages: LlmMessage[]
  strategy: RoutingStrategy
  /** Wajib saat strategy = 'pinned'. */
  modelId?: string
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
  /**
   * Tool yang boleh dipanggil model. Bila diisi, gateway dapat mengembalikan
   * `toolCalls` di chunk terakhir, dan engine menjalankan tool tersebut lalu
   * melanjutkan percakapan — inilah yang membuat agent bisa MENGERJAKAN
   * (bukan hanya menulis).
   */
  tools?: ToolSpec[]
}

/** Telemetry yang dilaporkan OmniRoute untuk satu request. */
export interface RouteTelemetry {
  /** Model aktual yang dipilih gateway untuk request ini. */
  model?: string
  /** Latency round-trip dalam milidetik. */
  latencyMs?: number
  /** Estimasi token yang dihemat oleh compression. */
  tokensSaved?: number
  /** True bila Auto-Combo melakukan fallback. */
  fallback?: boolean
  compression?: string
}

export interface LlmChunk {
  delta: string
  done: boolean
  usage?: TokenUsage
  route?: RouteTelemetry
  /** Tool yang diminta model pada giliran ini (kalau ada). */
  toolCalls?: ToolCall[]
}

/** Ringkasan konfigurasi gateway untuk UI. */
export const ROUTING_INFO = {
  baseUrl: OMNIROUTE_BASE_URL,
  compression: OMNIROUTE_COMPRESSION,
  combo: OMNIROUTE_COMBO,
}

/* ------------------------------- entry point ------------------------------ */

/**
 * Titik masuk tunggal untuk streaming. Selalu degrade dengan baik:
 * error gateway tidak boleh membuat UI kosong.
 */
export async function* stream(req: LlmRequest): AsyncGenerator<LlmChunk> {
  const startedAt = Date.now()
  try {
    yield* routeStream(req, startedAt)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    yield* streamMock(req, reason)
  }
}

/* --------------------------- OmniRoute streaming -------------------------- */

/** Stream chat completion lewat OmniRoute menggunakan SDK `openai`. */
async function* routeStream(req: LlmRequest, startedAt: number): AsyncGenerator<LlmChunk> {
  const headers = omnirouteHeaders(req.strategy, req.modelId)

  const stream = await omniClient.chat.completions.create(
    {
      model: modelForStrategy(req.strategy, req.modelId),
      stream: true,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 1400,
      // Tanpa ini gateway tidak akan pernah mengembalikan tool_calls.
      ...(req.tools && req.tools.length > 0 ? { tools: req.tools } : {}),
      messages: [
        { role: 'system', content: req.system },
        // Pisah per role: tipe pesan 'tool' di SDK WAJIB punya `tool_call_id`,
        // sedangkan pesan biasa tidak boleh membawa field itu sama sekali.
        ...req.messages.map((m) =>
          m.role === 'tool'
            ? ({ role: 'tool', content: m.content, tool_call_id: m.toolCallId ?? '' } as const)
            : ({ role: m.role, content: m.content } as const),
        ),
      ],
    },
    { headers, signal: req.signal },
  )

  let prompt = 0
  let completion = 0
  let model: string | undefined
  let tokensSaved: number | undefined
  let fallback = false

  // Tool call datang terpotong antar chunk: `index` menandai posisinya, dan
  // `arguments` tumbuh bertahap. Kita kumpulkan dulu lalu parse di akhir.
  const pending = new Map<number, { id: string; name: string; args: string }>()

  for await (const part of stream) {
    // Metadata non-standar OmniRoute datang pada objek chunk; baca defensif
    // agar tetap kompatibel bila gateway tidak mengirimnya.
    const meta = part as unknown as {
      omniroute?: { model?: string; tokens_saved?: number; fallback?: boolean }
      model?: string
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    if (meta.omniroute?.model) model = meta.omniroute.model
    else if (meta.model && meta.model !== 'auto') model = meta.model
    if (meta.omniroute?.tokens_saved) tokensSaved = meta.omniroute.tokens_saved
    if (meta.omniroute?.fallback) fallback = true

    // Kumpulkan tool call yang streaming.
    const deltas = part.choices?.[0]?.delta as unknown as
      | {
          tool_calls?: {
            index?: number
            id?: string
            function?: { name?: string; arguments?: string }
          }[]
        }
      | undefined
    for (const tc of deltas?.tool_calls ?? []) {
      const idx = tc.index ?? 0
      const cur = pending.get(idx) ?? { id: '', name: '', args: '' }
      if (tc.id) cur.id = tc.id
      if (tc.function?.name) cur.name += tc.function.name
      if (tc.function?.arguments) cur.args += tc.function.arguments
      pending.set(idx, cur)
    }

    const delta = part.choices?.[0]?.delta?.content
    if (delta) {
      completion += Math.max(1, Math.round(delta.length / 4))
      yield { delta, done: false }
    }

    if (meta.usage) {
      prompt = meta.usage.prompt_tokens ?? prompt
      completion = meta.usage.completion_tokens ?? completion
    }
  }

  // Parse arguments jadi objek. JSON rusak -> objek kosong, TIDAK melempar:
  // lebih baik model melihat argumen kosong daripada error fatal.
  const toolCalls: ToolCall[] = [...pending.values()]
    .filter((t) => t.name)
    .map((t, i) => {
      let args: Record<string, unknown> = {}
      if (t.args.trim()) {
        try {
          const parsed: unknown = JSON.parse(t.args)
          if (parsed && typeof parsed === 'object') args = parsed as Record<string, unknown>
        } catch {
          args = {}
        }
      }
      return { id: t.id || `call_${i}`, name: t.name, args }
    })

  yield {
    delta: '',
    done: true,
    usage: { prompt, completion, total: prompt + completion, requests: 1 },
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    route: {
      model,
      latencyMs: Date.now() - startedAt,
      tokensSaved,
      fallback,
      compression: OMNIROUTE_COMPRESSION,
    },
  }
}

