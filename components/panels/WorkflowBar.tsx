/**
 * components/panels/WorkflowBar.tsx
 * ---------------------------------------------------------------------------
 * Panel bawah: indikator alur kerja ChatDev (Requirement → Design → Coding →
 * Testing → Documenting) + brief + tombol kontrol + toggle HITL.
 * ---------------------------------------------------------------------------
 */
'use client'

import * as React from 'react'
import { Check, CircleDot, Loader2, Play, Radio, Square, Trash2, UserCheck, Zap } from 'lucide-react'
import type { WorkflowPhase, WorkflowStatus } from '@/types/agent'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { PHASE_LABEL, PHASE_ORDER, tasksForPhase } from '@/lib/orchestrator/taskRegistry'
import { cn } from '@/lib/utils'

export interface WorkflowBarProps {
  task: string
  phase: WorkflowPhase
  status: WorkflowStatus
  hitlEnabled: boolean
  connected: boolean
  /** Jumlah file hasil kerja per jenis — untuk badge ringkasan. */
  pdfCount?: number
  codeCount?: number
  onTaskChange: (task: string) => void
  onStart: () => void
  onInterrupt: () => void
  onReset: () => void
  onHitlToggle: (enabled: boolean) => void
}

const STATUS_BADGE: Record<
  WorkflowStatus,
  { label: string; variant: 'muted' | 'info' | 'success' | 'warn' | 'destructive' }
> = {
  idle: { label: 'Siap', variant: 'muted' },
  running: { label: 'Berjalan', variant: 'info' },
  awaiting_human: { label: 'Menunggu Anda', variant: 'warn' },
  done: { label: 'Selesai', variant: 'success' },
  error: { label: 'Error', variant: 'destructive' },
}

export function WorkflowBar({
  task, phase, status, hitlEnabled, connected,
  pdfCount = 0, codeCount = 0,
  onTaskChange, onStart, onInterrupt, onReset, onHitlToggle,
}: WorkflowBarProps) {
  const currentIndex = Math.max(0, PHASE_ORDER.indexOf(phase))
  const isRunning = status === 'running' || status === 'awaiting_human'
  const canStart = connected && task.trim().length > 0 && !isRunning

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Indikator fase — jumlah task per fase ditampilkan agar jelas paralel */}
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        {PHASE_ORDER.map((p, i) => {
          const state = i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'pending'
          const taskCount = tasksForPhase(p).length
          return (
            <React.Fragment key={p}>
              {i > 0 && <div className={cn('h-px w-4', i <= currentIndex ? 'bg-claude' : 'bg-border')} />}
              <div
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors',
                  state === 'active' && 'bg-claude/15 text-claude',
                  state === 'pending' && 'text-muted-foreground',
                )}
                title={`${PHASE_LABEL[p]} — ${taskCount} task (dibagi sesuai peran)`}
              >
                {state === 'done' ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : state === 'active' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CircleDot className="h-3 w-3" />
                )}
                <span className="whitespace-nowrap">{PHASE_LABEL[p]}</span>
                <span className="rounded bg-black/20 px-1 text-[9px] tabular-nums">{taskCount}</span>
              </div>
            </React.Fragment>
          )
        })}

        <div className="ml-auto flex items-center gap-2">
          {/* Ringkasan hasil kerja — user tahu Workspace akan berisi apa. */}
          {pdfCount + codeCount > 0 && (
            <Badge variant="success" className="gap-1 text-[10px]" title="Jumlah file hasil kerja">
              📄 {pdfCount}
              {codeCount > 0 && <span>· 💻 {codeCount}</span>}
            </Badge>
          )}
          {connected ? (
            <Badge variant="success" className="gap-1 text-[10px]">
              <Radio className="h-2.5 w-2.5" /> Socket aktif
            </Badge>
          ) : (
            <Badge variant="warn" className="gap-1 text-[10px]">
              <Radio className="h-2.5 w-2.5" /> Menyambung…
            </Badge>
          )}
          <Badge variant={STATUS_BADGE[status].variant} className="text-[10px]">
            {STATUS_BADGE[status].label}
          </Badge>
        </div>
      </div>

      {/* Kontrol */}
      <div className="flex flex-1 items-end gap-2 p-3">
        <Textarea
          value={task}
          onChange={(e) => onTaskChange(e.target.value)}
          placeholder="Deskripsikan proyek — contoh: “Buat aplikasi catatan-taking dengan pencarian dan tag”"
          className="min-h-[44px] flex-1 resize-none text-[13px]"
          rows={2}
          disabled={isRunning}
        />

        <div className="flex flex-col gap-1.5">
          <Button onClick={onStart} disabled={!canStart} size="sm" className="w-28">
            {isRunning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Jalan
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" /> Mulai Workflow
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" className="w-28" onClick={onInterrupt} disabled={!isRunning}>
            <Square className="h-3.5 w-3.5" /> Interupsi
          </Button>
          <Button variant="ghost" size="sm" className="w-28" onClick={onReset}>
            <Trash2 className="h-3.5 w-3.5" /> Bersihkan
          </Button>
        </div>

        {/* Toggle Human-in-the-Loop */}
        <button
          type="button"
          onClick={() => onHitlToggle(!hitlEnabled)}
          disabled={isRunning}
          aria-pressed={hitlEnabled}
          className={cn(
            'flex h-full w-40 flex-col items-start justify-center gap-1 rounded-lg border p-2.5 text-left transition-colors',
            hitlEnabled ? 'border-claude/50 bg-claude/10 hover:bg-claude/15' : 'border-border hover:bg-accent',
            isRunning && 'cursor-not-allowed opacity-60',
          )}
        >
          <span className="flex items-center gap-1.5 text-[11.5px] font-medium">
            {hitlEnabled ? <UserCheck className="h-3.5 w-3.5 text-claude" /> : <Zap className="h-3.5 w-3.5" />}
            HITL {hitlEnabled ? 'aktif' : 'nonaktif'}
          </span>
          <span className="text-[10px] leading-tight text-muted-foreground">
            {hitlEnabled
              ? 'Anda menyetujui tiap fase sebelum lanjut.'
              : 'Aktifkan untuk menyetujui tiap fase.'}
          </span>
        </button>
      </div>
    </div>
  )
}