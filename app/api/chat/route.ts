import { NextResponse } from 'next/server'
import { stream } from '@/lib/orchestrator/llm'
import type { RoutingStrategy } from '@/config/omniroute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Body {
  strategy?: RoutingStrategy
  modelId?: string
  system?: string
  prompt?: string
  temperature?: number
  maxTokens?: number
}

/**
 * POST /api/chat — completion non-streaming lewat OmniRoute, untuk menguji
 * strategi routing tanpa menjalankan workflow penuh.
 */
export async function POST(request: Request) {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON valid' }, { status: 400 })
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) {
    return NextResponse.json({ error: 'Field "prompt" wajib diisi' }, { status: 400 })
  }

  let text = ''
  let usage = { prompt: 0, completion: 0, total: 0, requests: 0 }
  let route: unknown = null

  for await (const chunk of stream({
    system: body.system ?? 'Kamu adalah asisten yang helpful.',
    messages: [{ role: 'user', content: prompt }],
    strategy: body.strategy ?? 'auto/fast',
    modelId: body.modelId,
    temperature: body.temperature,
    maxTokens: body.maxTokens ?? 800,
  })) {
    if (chunk.delta) text += chunk.delta
    if (chunk.done) {
      if (chunk.usage) usage = chunk.usage
      if (chunk.route) route = chunk.route
    }
  }

  return NextResponse.json({ text, usage, route })
}