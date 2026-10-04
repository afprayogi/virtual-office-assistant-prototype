/**
 * components/panels/AgentRoster.tsx
 * ---------------------------------------------------------------------------
 * Sidebar kiri: daftar agent aktif + status + pengaturan model per agent.
 * ---------------------------------------------------------------------------
 */
'use client'

import * as React from 'react'
import {
  Activity, AlertCircle, Bot, Brain, CheckCircle2, Cpu, Keyboard, Loader2, MoveRight, ShieldCheck,
} from 'lucide-react'
import type { Agent, AgentStatus } from '@/types/agent'
import { ACTIVITY_META } from '@/types/agent'
import type { RoutingStrategy } from '@/config/routing'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
// Import dari modul client-safe (bukan llm.ts) supaya SDK `openai`
// tidak ikut ter-bundle ke browser.
import { PINNED_MODELS, ROUTING_CATALOG, ROUTING_HINT } from '@/config/routing'
import { findTask } from '@/lib/orchestrator/taskRegistry'
import { cn, formatTokens } from '@/lib/utils'

/** Metadata tampilan untuk tiap status agent. */
const STATUS_META: Record<
  AgentStatus,
  { label: string; icon: React.ReactNode; badge: 'muted' | 'info' | 'success' | 'warn' | 'destructive' }
> = {
  idle: { label: 'Idle', icon: <CheckCircle2 className="h-3 w-3" />, badge: 'muted' },
  thinking: { label: 'Thinking', icon: <Loader2 className="h-3 w-3 animate-spin" />, badge: 'info' },
  typing: { label: 'Typing', icon: <Keyboard className="h-3 w-3" />, badge: 'success' },
  moving: { label: 'Moving', icon: <MoveRight className="h-3 w-3" />, badge: 'warn' },
  error: { label: 'Error', icon: <AlertCircle className="h-3 w-3" />, badge: 'destructive' },
}

export interface AgentRosterProps {
  agents: Agent[]
  selectedAgentId: string | null
  onSelectAgent: (id: string) => void
  onChangeRouting: (agentId: string, strategy: RoutingStrategy, modelId: string) => void
}

export function AgentRoster({ agents, selectedAgentId, onSelectAgent, onChangeRouting }: AgentRosterProps) {
  const [expanded, setExpanded] = React.useState<string | null>(null)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Bot className="h-4 w-4 text-claude" />
        <h2 className="text-[13px] font-semibold">Agent Roster</h2>
        <Badge variant="muted" className="ml-auto text-[10px]">{agents.length} agent</Badge>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-2">
          {agents.map((agent) => {
            const meta = STATUS_META[agent.status]
            const isSelected = agent.id === selectedAgentId
            const isOpen = expanded === agent.id

            return (
              <div
                key={agent.id}
                className={cn(
                  'rounded-lg border transition-colors',
                  isSelected ? 'border-claude/50 bg-claude/[0.07]' : 'border-transparent hover:bg-accent/50',
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelectAgent(agent.id)
                    setExpanded(isOpen ? null : agent.id)
                  }}
                  className="flex w-full items-center gap-2.5 p-2 text-left"
                >
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm"
                    style={{ backgroundColor: `${agent.color}22` }}
                    aria-hidden
                  >
                    {agent.avatar}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-medium text-foreground">{agent.name}</span>
                      <Badge variant={meta.badge} className="h-4 shrink-0 gap-0.5 px-1 text-[9px]">
                        {meta.icon}
                        {meta.label}
                      </Badge>
                    </span>
                    <span className="block truncate text-[10.5px] text-muted-foreground">{agent.role}</span>
                    {/* Badge aktivitas: apa yang sedang dilakukan agent ini */}
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[9.5px] text-muted-foreground">
                      <span>{ACTIVITY_META[agent.activity]?.icon ?? '⌨️'}</span>
                      <span>{ACTIVITY_META[agent.activity]?.label ?? '—'}</span>
                      {agent.consulting ? <span className="text-claude">→ bertanya</span> : null}
                    </span>
                  </span>
                </button>

                <div className="flex items-center gap-2 px-2 pb-1.5 text-[10px] text-muted-foreground">
                  <Cpu className="h-2.5 w-2.5" />
                  <span className="truncate font-mono">{agent.model.modelId}</span>
                  <span className="ml-auto tabular-nums">{formatTokens(agent.usage.total)} tok</span>
                </div>

                {/* Panel pengaturan routing OmniRoute */}
                {isOpen && (
                  <div className="space-y-2 border-t border-border/60 px-2 py-2">
                    <label className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Routing strategy
                    </label>
                    <Select
                      value={agent.model.strategy}
                      onValueChange={(v) => onChangeRouting(agent.id, v as RoutingStrategy, agent.model.modelId)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROUTING_CATALOG.map((s) => (
                          <SelectItem key={s.value} value={s.value} title={s.hint}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <p className="text-[10px] leading-tight text-muted-foreground">
                      {ROUTING_HINT[agent.model.strategy]}
                    </p>

                    {/* Model hanya relevan saat di-pin */}
                    <label className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Model (saat pinned)
                    </label>
                    <Select
                      value={agent.model.modelId}
                      onValueChange={(v) => onChangeRouting(agent.id, agent.model.strategy, v)}
                      disabled={agent.model.strategy !== 'pinned'}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PINNED_MODELS.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Telemetry request terakhir */}
                    {agent.telemetry && (
                      <div className="rounded-md bg-muted/50 p-2 text-[10px]">
                        <p className="font-medium text-muted-foreground">Telemetry OmniRoute</p>
                        <p className="mt-1 font-mono text-foreground/80">
                          model: {agent.telemetry.model ?? 'auto'}
                        </p>
                        <p className="font-mono text-foreground/80">
                          latency: {agent.telemetry.latencyMs ?? 0} ms
                        </p>
                        {agent.telemetry.tokensSaved ? (
                          <p className="font-mono text-emerald-500">
                            hemat ~{agent.telemetry.tokensSaved} token
                          </p>
                        ) : null}
                        {agent.telemetry.fallback && (
                          <p className="font-mono text-amber-500">auto-fallback aktif</p>
                        )}
                      </div>
                    )}

                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                        <ShieldCheck className="h-2.5 w-2.5" /> Jobdesc — {agent.role}
                      </p>
                      <p className="mt-1 text-[10.5px] leading-relaxed text-foreground/80">
                        {agent.guard.mandate}
                      </p>
                      <p className="mt-1.5 text-[9.5px] font-medium text-emerald-500">BOLEH:</p>
                      <p className="text-[10px] leading-snug text-foreground/70">
                        {agent.guard.can.join(' · ')}
                      </p>
                      <p className="mt-1.5 text-[9.5px] font-medium text-red-400">TIDAK BOLEH:</p>
                      <p className="text-[10px] leading-snug text-foreground/70">
                        {agent.guard.cannot.join(' · ')}
                      </p>
                      {agent.currentTaskId && (
                        <p className="mt-1.5 border-t border-border/60 pt-1.5 text-[10px] text-claude">
                          Task: {findTask(agent.currentTaskId)?.title ?? agent.currentTaskId}
                        </p>
                      )}
                    </div>

                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                        <Brain className="h-2.5 w-2.5" /> System prompt
                      </p>
                      <p className="mt-1 line-clamp-3 text-[10.5px] leading-relaxed text-foreground/70">
                        {agent.systemPrompt}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {agent.skills.map((s) => (
                        <span key={s} className="rounded bg-accent px-1.5 py-0.5 text-[9.5px] text-accent-foreground">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </ScrollArea>

      <div className="border-t border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Activity className="h-3 w-3" />
          Total tokens tim
          <span className="ml-auto font-mono tabular-nums text-foreground">
            {formatTokens(agents.reduce((acc, a) => acc + a.usage.total, 0))}
          </span>
        </div>
      </div>
    </div>
  )
}