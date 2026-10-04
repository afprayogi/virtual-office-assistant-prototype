/**
 * lib/toastStore.ts
 * ---------------------------------------------------------------------------
 * Store notifikasi ringan, TANPA dependency baru.
 *
 * Dipisah dari `lib/store.ts` supaya reducer event yang sudah padat tidak
 * makin-berat, dan supaya toast bisa dipakai dari mana saja (canvas, panel,
 * maupun pemanggilan langsung dari event).
 * ---------------------------------------------------------------------------
 */
'use client'

import { create } from 'zustand'
import { uid } from '@/lib/utils'

export type ToastVariant = 'success' | 'info' | 'warn' | 'error'

export interface Toast {
  id: string
  variant: ToastVariant
  /** Ikon yang ditampilkan, mis. '✅', '📄', '⏸'. */
  icon: string
  title: string
  /** Baris kedua opsional (path file, jumlah, dsb). */
  detail?: string
  createdAt: number
}

/** Maksimal toast yang tampil bersamaan agar tidak menutupi kanvas. */
const MAX_TOASTS = 4

/** Lama tampil sebelum menghilang (ms). */
const TOAST_TTL = 4200

interface ToastStore {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id' | 'createdAt'>) => void
  dismiss: (id: string) => void
  clear: () => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const toast: Toast = { ...t, id: uid('toast'), createdAt: Date.now() }
    set((s) => ({ toasts: [...s.toasts, toast].slice(-MAX_TOASTS) }))
    // Auto-dismiss. Timeout memakai setTimeout biasa (bukan timer React)
    // supaya tidak memicu re-render di luar lifecycle yang salah.
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((x) => x.id !== toast.id) }))
      }, TOAST_TTL)
    }
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  clear: () => set({ toasts: [] }),
}))

/**
 * API singkat untuk memunculkan notifikasi dari mana saja tanpa hook.
 * Contoh: `notify.success('📄', 'PDF dibuat', 'docs/visi.pdf')`.
 */
export const notify = {
  push: (t: Omit<Toast, 'id' | 'createdAt'>) => useToastStore.getState().push(t),
  success: (icon: string, title: string, detail?: string) =>
    useToastStore.getState().push({ variant: 'success', icon, title, detail }),
  info: (icon: string, title: string, detail?: string) =>
    useToastStore.getState().push({ variant: 'info', icon, title, detail }),
  warn: (icon: string, title: string, detail?: string) =>
    useToastStore.getState().push({ variant: 'warn', icon, title, detail }),
  error: (icon: string, title: string, detail?: string) =>
    useToastStore.getState().push({ variant: 'error', icon, title, detail }),
}