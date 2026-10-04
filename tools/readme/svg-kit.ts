/**
 * tools/readme/svg-kit.ts
 * ---------------------------------------------------------------------------
 * Helper SVG mungil (tanpa dependensi) + jembatan ke sumber kebenaran runtime:
 * geometri kantor (types/office), sprite (pixel-sprites + office-draw), dan
 * roster agen (defaults). Dipakai oleh seluruh generator aset README.
 * ---------------------------------------------------------------------------
 */
import path from 'node:path'
import {
  ACCESSORY_CELLS,
  NEUTRAL,
  POSES,
  SPRITE_H,
  SPRITE_W,
  framesOf,
  stamp,
  type AgentPalette,
  type PoseName,
} from '../../components/office/pixel-sprites'
import { CHAR_STYLE, charStyleFor } from '../../components/office/office-draw'
import { DEFAULT_AGENTS } from '../../lib/orchestrator/defaults'
import { PHASE_LABEL, PHASE_ORDER } from '../../lib/orchestrator/taskRegistry'
import { GRID_COLS, GRID_ROWS, MEETING_SEATS, PROPS, ROOMS, TILE } from '../../types/office'
import type { Agent } from '../../types/agent'

export const OUT_DIR = path.join(process.cwd(), 'docs', 'images')
export {
  SPRITE_W, SPRITE_H, POSES, framesOf, stamp, ACCESSORY_CELLS,
  CHAR_STYLE, charStyleFor, DEFAULT_AGENTS, PHASE_ORDER, PHASE_LABEL,
  MEETING_SEATS, PROPS, ROOMS, TILE, GRID_COLS, GRID_ROWS,
  type AgentPalette, type PoseName, type Agent,
}

/* ------------------------------- teks & bentuk ---------------------------- */

/** Escape teks agar aman di dalam SVG. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export interface TextOpts {
  size?: number
  weight?: number
  fill?: string
  anchor?: 'start' | 'middle' | 'end'
  mono?: boolean
  opacity?: number
  spacing?: number
}

/** Satu elemen <text>. */
export function text(x: number, y: number, value: string, o: TextOpts = {}): string {
  const family = o.mono
    ? 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'
    : 'ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif'
  const attrs = [
    `x="${x}"`, `y="${y}"`,
    `fill="${o.fill ?? '#e5e7eb'}"`,
    `font-family="${family}"`,
    `font-size="${o.size ?? 12}"`,
    o.weight ? `font-weight="${o.weight}"` : '',
    o.anchor ? `text-anchor="${o.anchor}"` : '',
    o.opacity != null ? `opacity="${o.opacity}"` : '',
    o.spacing ? `letter-spacing="${o.spacing}"` : '',
  ].filter(Boolean).join(' ')
  return `<text ${attrs}>${esc(value)}</text>`
}

export interface RectOpts {
  rx?: number
  stroke?: string
  sw?: number
  opacity?: number
  dash?: string
}

/** Satu elemen <rect>. */
export function rect(x: number, y: number, w: number, h: number, fill: string, o: RectOpts = {}): string {
  const attrs = [
    `x="${x}"`, `y="${y}"`, `width="${w}"`, `height="${h}"`, `fill="${fill}"`,
    o.rx ? `rx="${o.rx}"` : '',
    o.stroke ? `stroke="${o.stroke}"` : '',
    o.sw ? `stroke-width="${o.sw}"` : '',
    o.opacity != null ? `opacity="${o.opacity}"` : '',
    o.dash ? `stroke-dasharray="${o.dash}"` : '',
  ].filter(Boolean).join(' ')
  return `<rect ${attrs}/>`
}

/** Bungkus elemen menjadi dokumen <svg>. */
export function svg(width: number, height: number, body: string, extra = ''): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" ${extra}>${body}</svg>`
  )
}

/* --------------------------------- sprite --------------------------------- */

/**
 * Ubah grid sprite 16x32 menjadi kumpulan <rect> (satu piksel = satu kotak).
 * Sama persis dengan `rasterize()` di browser, hanya keluaran SVG.
 */
export function spriteRects(
  sprite: readonly string[],
  palette: Record<string, string>,
  px: number,
  ox: number,
  oy: number,
): string {
  const parts: string[] = []
  for (let y = 0; y < sprite.length; y++) {
    const row = sprite[y] ?? ''
    for (let x = 0; x < row.length; x++) {
      const sym = row[x]
      if (!sym || sym === '.') continue
      const fill = palette[sym] ?? (NEUTRAL as Record<string, string>)[sym] ?? '#ff00ff'
      parts.push(`<rect x="${ox + x * px}" y="${oy + y * px}" width="${px}" height="${px}" fill="${fill}"/>`)
    }
  }
  return parts.join('')
}

/** Frame pertama (statis) dari sebuah pose. */
export function poseSprite(pose: PoseName): readonly string[] {
  return framesOf(POSES[pose])[0]
}

/** Gelapkan warna hex `amount` untuk bayangan. */
export function shade(hex: string, amount = 0.16): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)))
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)))
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** Terangkan warna hex `amount`. */
export function tint(hex: string, amount = 0.25): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, Math.round(((n >> 16) & 255) + (255 - ((n >> 16) & 255)) * amount))
  const g = Math.min(255, Math.round(((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * amount))
  const b = Math.min(255, Math.round((n & 255) + (255 - (n & 255)) * amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/**
 * Palet warna per agent. Agent yang punya entri `CHAR_STYLE` memakai gayanya;
 * agent baru (be/fe/chara/story) mewarisi gaya default dengan warna baju
 * diturunkan dari `agent.color` agar tetap unik.
 */
export function paletteFor(agent: Agent): AgentPalette {
  const style = charStyleFor(agent.id)
  if (CHAR_STYLE[agent.id]) return style.palette
  return { ...style.palette, C: agent.color, c: shade(agent.color) }
}

/** Sprite FINAL (aksesori sudah ditempel) untuk agent pada pose tertentu. */
export function agentSprite(agent: Agent, pose: PoseName): readonly string[] {
  const sprite = poseSprite(pose)
  const acc = charStyleFor(agent.id).accessory
  return acc ? stamp(sprite, ACCESSORY_CELLS[acc], 'A') : sprite
}

/** Palet sebagai objek hex-string (untuk spriteRects). */
export function hexPalette(agent: Agent): Record<string, string> {
  return paletteFor(agent) as unknown as Record<string, string>
}


/**
 * Render sprite sebagai SEDIKIT <path> — satu path per warna, dan piksel
 * sebaris yang sewarna digabung menjadi satu run horizontal. Jauh lebih ringan
 * daripada satu <rect> per piksel (10x lebih kecil), tanpa kehilangan ketajaman.
 */
export function spritePath(
  sprite: readonly string[],
  palette: Record<string, string>,
  px: number,
  ox: number,
  oy: number,
): string {
  const byColor = new Map<string, string[]>()
  for (let y = 0; y < sprite.length; y++) {
    const row = sprite[y] ?? ''
    let x = 0
    while (x < row.length) {
      const sym = row[x]
      if (!sym || sym === '.') { x++; continue }
      let x2 = x
      while (x2 + 1 < row.length && row[x2 + 1] === sym) x2++
      const fill = palette[sym] ?? (NEUTRAL as Record<string, string>)[sym] ?? '#ff00ff'
      const wpx = (x2 - x + 1) * px
      const cmd = `M${ox + x * px} ${oy + y * px}h${wpx}v${px}h${-wpx}z`
      let list = byColor.get(fill)
      if (!list) { list = []; byColor.set(fill, list) }
      list.push(cmd)
      x = x2 + 1
    }
  }
  let out = ''
  for (const [fill, cmds] of byColor) out += `<path fill="${fill}" d="${cmds.join('')}"/>`
  return out
}

