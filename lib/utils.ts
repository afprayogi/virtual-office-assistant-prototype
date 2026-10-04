import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Gabungkan class Tailwind dengan penyelesaian konflik yang benar. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Pembuat id pendek & stabil (aman untuk DOM & socket payload). */
export function uid(prefix = ''): string {
  const s = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
  return prefix ? `${prefix}_${s}` : s
}

/** Format token menjadi string ringkas: 1.2k, 3.4M. */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

/** Format timestamp HH:MM:SS untuk terminal log. */
export function formatTime(ts: number): string {
  const d = new Date(ts)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** Potong teks panjang dengan ellipsis. */
export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}