/**
 * components/panels/TerminalLog.tsx
 * ---------------------------------------------------------------------------
 * Panel bawah-kanan: terminal log real-time berisi raw JSON payload,
 * prompt token, dan status API dari workflow.
 * ---------------------------------------------------------------------------
 */
'use client'

import * as React from 'react'
import { ChevronDown, ChevronRight, Terminal, Trash2 } from 'lucide-react'
import type { LogEntry } from '@/types/agent'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, formatTime } from '@/lib/utils'

const LEVEL_STYLE: Record<LogEntry['level'], { dot: string; text: string; label: string }> = {
  debug: { dot: 'bg-muted-foreground/50', text: 'text-muted-foreground', label: 'DBG' },
  info: { dot: 'bg-sky-400', text: 'text-sky-300', label: 'INF' },
  success: { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'OK ' },
  warn: { dot: 'bg-amber-400', text: 'text-amber-300', label: 'WRN' },
  error: { dot: 'bg-red-400', text: 'text-red-300', label: 'ERR' },
}

export interface TerminalLogProps {
  logs: LogEntry[]
  onClear: () => void
}

export function TerminalLog({ logs, onClear }: TerminalLogProps) {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  const endRef = React.useRef<HTMLDivElement>(null)

  // Auto-scroll ke bawah setiap ada baris baru.
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [logs.length])

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0d0d10]">
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <Terminal className="h-3.5 w-3.5 text-claude" />
        <h3 className="text-[12px] font-semibold text-white/90">Terminal</h3>
        <Badge variant="muted" className="text-[10px]">{logs.length} baris</Badge>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto rounded p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Bersihkan log"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0.5 px-2 py-1.5 font-mono text-[11px] leading-relaxed">
          {logs.length === 0 && (
            <p className="px-2 py-3 text-white/30">
              Menunggu event… jalankan workflow untuk melihat log raw.
            </p>
          )}

          {logs.map((log) => {
            const style = LEVEL_STYLE[log.level]
            const hasPayload = log.payload !== undefined
            const isOpen = expanded.has(log.id)

            return (
              <div key={log.id} className="group">
                <div
                  className={cn('flex items-start gap-1.5 rounded px-1 hover:bg-white/5')}
                >
                  <span className="shrink-0 text-white/30">{formatTime(log.ts)}</span>
                  <span className={cn('shrink-0 font-semibold', style.text)}>{style.label}</span>
                  <span className="shrink-0 text-white/40">[{log.source}]</span>

                  {hasPayload && (
                    <button
                      type="button"
                      onClick={() => toggle(log.id)}
                      className="mt-0.5 shrink-0 text-white/30 transition-colors hover:text-white"
                      aria-label={isOpen ? 'Sembunyikan payload' : 'Tampilkan payload'}
                    >
                      {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </button>
                  )}

                  <span className="min-w-0 flex-1 break-all text-white/75">{log.message}</span>
                  <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} aria-hidden />
                </div>

                {hasPayload && isOpen && (
                  <pre className="ml-6 mt-0.5 overflow-x-auto rounded border border-white/10 bg-black/40 p-2 text-[10.5px] text-white/60">
                    {JSON.stringify(log.payload, null, 2)}
                  </pre>
                )}
              </div>
            )
          })}
          <div ref={endRef} />
        </div>
      </ScrollArea>
    </div>
  )
}