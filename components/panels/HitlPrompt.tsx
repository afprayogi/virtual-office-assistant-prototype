/**
 * components/panels/HitlPrompt.tsx
 * ---------------------------------------------------------------------------
 * Dialog Human-in-the-Loop: muncul saat engine meminta persetujuan sebelum
 * melanjutkan ke fase berikutnya. Pengguna dapat menyetujui, meminta revisi,
 * atau membatalkan workflow.
 * ---------------------------------------------------------------------------
 */
'use client'

import * as React from 'react'
import { MessageSquareWarning } from 'lucide-react'
import type { HitlRequest } from '@/types/agent'
import { Button } from '@/components/ui/button'

export interface HitlPromptProps {
  request: HitlRequest | null
  onRespond: (hitlId: string, choice: string, note?: string) => void
}

export function HitlPrompt({ request, onRespond }: HitlPromptProps) {
  const [note, setNote] = React.useState('')

  // Bersihkan catatan ketika permintaan baru arrives.
  React.useEffect(() => {
    if (request) setNote('')
  }, [request?.id])

  if (!request) return null

  const respond = (choice: string) => {
    onRespond(request.id, choice, note.trim() || undefined)
    setNote('')
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hitl-title"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl">
        <div className="mb-3 flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-500/15">
            <MessageSquareWarning className="h-4.5 w-4.5 text-amber-500" />
          </div>
          <div>
            <h2 id="hitl-title" className="text-[14px] font-semibold text-foreground">
              {request.title}
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Diminta oleh {request.agentName} · fase {request.phase}
            </p>
          </div>
        </div>

        <p className="rounded-md bg-muted/60 p-3 text-[12.5px] leading-relaxed text-foreground/80">
          {request.body}
        </p>

        <label className="mt-3 block text-[11px] font-medium text-muted-foreground">
          Catatan untuk tim (opsional)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Contoh: fokuskan pada performa mobile"
          className="mt-1 w-full resize-none rounded-md border border-input bg-background px-2.5 py-2 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring"
        />

        <div className="mt-4 flex justify-end gap-2">
          {request.options.map((opt) => (
            <Button
              key={opt.id}
              size="sm"
              variant={opt.kind === 'approve' ? 'default' : opt.kind === 'reject' ? 'destructive' : 'outline'}
              onClick={() => respond(opt.id)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}