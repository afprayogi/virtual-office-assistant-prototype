/**
 * lib/server/agentConfigStore.ts
 * ---------------------------------------------------------------------------
 * Penyimpanan konfigurasi agent per-server (in-memory + file JSON).
 * Mendukung endpoint GET/POST /api/agents/config.
 * ---------------------------------------------------------------------------
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Agent } from '@/types/agent'
import { DEFAULT_AGENTS } from '@/lib/orchestrator/defaults'

const DATA_DIR = path.join(process.cwd(), 'projects')
const CONFIG_FILE = path.join(DATA_DIR, 'agent-config.json')

let cache: Agent[] | null = null

/** Baca roster tersimpan, atau default bila belum ada. */
export async function readAgentConfig(): Promise<Agent[]> {
  if (cache) return cache
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Agent[]
    if (Array.isArray(parsed) && parsed.length > 0) {
      cache = parsed
      return cache
    }
  } catch {
    /* belum ada file — pakai default */
  }
  cache = structuredClone(DEFAULT_AGENTS)
  return cache
}

/** Simpan roster baru ke memori + disk. */
export async function writeAgentConfig(agents: Agent[]): Promise<Agent[]> {
  cache = agents
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    await fs.writeFile(CONFIG_FILE, JSON.stringify(agents, null, 2), 'utf8')
  } catch (err) {
    // Kegagalan menulis file tidak boleh menggagalkan request.
    console.warn('[agentConfig] gagal menyimpan ke disk:', err)
  }
  return agents
}

/** Validasi bentuk dasar roster sebelum disimpan. */
export function validateAgents(input: unknown): { ok: true; agents: Agent[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'Body harus berupa array agent' }
  if (input.length === 0) return { ok: false, error: 'Daftar agent tidak boleh kosong' }
  for (const raw of input as Record<string, unknown>[]) {
    if (typeof raw?.id !== 'string' || !raw.id) return { ok: false, error: 'Setiap agent harus punya id' }
    if (typeof raw?.name !== 'string' || !raw.name) return { ok: false, error: `Agent "${raw.id}" harus punya name` }
  }
  return { ok: true, agents: input as Agent[] }
}