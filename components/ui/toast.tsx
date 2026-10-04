/**
 * components/ui/toast.tsx
 * ---------------------------------------------------------------------------
 * Penampil notifikasi. Tanpa dependency: murni Zustand + Tailwind.
 *
 * Muncul di pojok kanan atas, tidak menutupi kanvas kantor, dan menumpuk
 * ke bawah sehingga beberapa notifikasi sekaligus tetap terbaca.
 * ---------------------------------------------------------------------------
 */
'use client'

import * as React from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useToastStore, type ToastVariant } from '@/lib/toastStore'
import { cn } from '@/lib/utils'

/** Warna + ikon per varian notifikasi. */
const VARIANT_STYLE: Record<ToastVariant, { icon: React.ReactNode; accent: string }> = {
  success: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, accent: 'border-emerald-500/40' },
  info: { icon: <Info className="h-3.5 w-3.5" />, accent: 'border-sky-500/40' },
  warn: { icon: <AlertTriangle className="h-3.5 w-3.5" />, accent: 'border-amber-500/40' },
  error: { icon: <XCircle className="h-3.5 w-3.5" />, accent: 'border-destructive/50' },
}

function ToastRow({
  id,
  variant,
  icon,
  title,
  detail,
}: {
  id: string
  variant: ToastVariant
  icon: string
  title: string
  detail?: string
}) {
  const dismiss = useToastStore((s) => s.dismiss)
  const style = VARIANT_STYLE[variant]

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-auto flex w-[290px] items-start gap-2.5 rounded-lg border bg-popover/95 p-2.5',
        'shadow-lg backdrop-blur-sm animate-in slide-in-from-right-2',
        style.accent,
      )}
    >
      {/* Emoji dari server (menunjukkan jenis hasil: 📄 pdf, 💻 program, dll) */}
      <span className="mt-px shrink-0 text-[15px] leading-none" aria-hidden>
        {icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[12px] font-medium leading-snug text-foreground">
          <span className="shrink-0 opacity-80">{style.icon}</span>
          <span className="truncate">{title}</span>
        </p>
        {detail && (
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{detail}</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => dismiss(id)}
        aria-label="Tutup notifikasi"
        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

/** Pasang sekali di root dashboard. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastRow key={t.id} {...t} />
      ))}
    </div>
  )
}