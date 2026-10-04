/**
 * components/office/VirtualOfficeCanvas.tsx
 * ---------------------------------------------------------------------------
 * DELIVERABLE 2 — Kanvas kantor virtual 2D (HTML5 Canvas API).
 *
 * Yang ditangani komponen ini:
 *   - Merender layout kantor (lantai, dinding, furniture, label ruangan).
 *   - Sprite pixel-art untuk setiap agent beserta animasi berjalan.
 *   - Animation loop berbasis requestAnimationFrame (dibatasi devicePixelRatio).
 *   - Pergerakan otomatis: saat status agent = 'moving', jalur BFS dihitung dari
 *     posisi sekarang ke `target`, lalu sprite diinterpolasi menyusuri jalur.
 *   - Speech bubble yang muncul saat agentSedang berbicara.
 *   - Interaksi: klik avatar → pilih agent (detail & statistik token).
 * ---------------------------------------------------------------------------
 */
'use client'

import * as React from 'react'
import { AGENT_MOVE_SPEED, ACTIVITY_META, SPEECH_BUBBLE_MS, type Agent } from '@/types/agent'
import { OFFICE_HEIGHT, OFFICE_WIDTH, TILE, pixelToTile, tileToPixel } from '@/types/office'
import { findPath } from './pathfinding'
import {
  drawConfetti, drawConsultBadge, drawConsultLink, drawDoneBadge, drawFocusIcon,
  drawNameTag, drawSparks, drawSpeechBubble, drawSprite, drawStatic, emitConfetti,
  emitSparks, stepSparks, type Spark,
} from './office-draw'
import { cn } from '@/lib/utils'

/** Posisi sprite yang sedang diinterpolasi (bukan milik store). */
interface Sprite {
  /** Posisi kontinu saat ini dalam piksel. */
  px: number
  py: number
  /** Jalur tersisa menuju target. */
  path: { x: number; y: number }[]
  /** Arah pandang terakhir: -1 kiri, 1 kanan. */
  facing: number
  /** Waktu (detik) sejak terakhir tiba — dipakai untuk jeda status idle. */
  arrivedAt: number
}

export interface VirtualOfficeCanvasProps {
  agents: Agent[]
  bubbles?: Record<string, { text: string; at: number }>
  /** Waktu (ms) agent terakhir selesai — memunculkan centang ✅ di avatar. */
  finishedAt?: Record<string, number>
  /** Waktu (ms) workflow selesai — memicu confetti dan agent berkumpul. */
  celebratedAt?: number | null
  selectedAgentId?: string | null
  onSelectAgent?: (id: string | null) => void
  className?: string
}

/** Lama centang "selesai" tetap terlihat sebelum menghilang (ms). */
const DONE_BADGE_MS = 1800

/** Hitung ulang jalur bila simpul terakhir sudah jauh dari tujuan. */
function pathNeedsRebuild(
  path: { x: number; y: number }[],
  goal: { x: number; y: number },
): boolean {
  if (path.length === 0) return true
  const last = path[path.length - 1]
  return Math.hypot(tileToPixel(last).x - goal.x, tileToPixel(last).y - goal.y) > TILE
}

export function VirtualOfficeCanvas({
  agents,
  bubbles = {},
  finishedAt = {},
  celebratedAt = null,
  selectedAgentId = null,
  onSelectAgent,
  className,
}: VirtualOfficeCanvasProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const spritesRef = React.useRef<Map<string, Sprite>>(new Map())
  const sparksRef = React.useRef<Spark[]>([])
  const confettiRef = React.useRef<Spark[]>([])
  const burstRef = React.useRef<Record<string, number>>({})
  const confettiFiredRef = React.useRef(false)
  const agentsRef = React.useRef<Agent[]>(agents)
  const bubblesRef = React.useRef(bubbles)
  const finishedRef = React.useRef(finishedAt)
  const celebratedRef = React.useRef(celebratedAt)
  const selectedRef = React.useRef<string | null>(selectedAgentId)
  const hoverRef = React.useRef<{ x: number; y: number } | null>(null)
  const rafRef = React.useRef<number | null>(null)

  // Effect membaca ref terini tanpa perlu re-subscribe loop.
  agentsRef.current = agents
  bubblesRef.current = bubbles
  finishedRef.current = finishedAt
  celebratedRef.current = celebratedAt
  selectedRef.current = selectedAgentId

  /* ----------------- inisialisasi canvas + animation loop ---------------- */

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Bitmap statis: lantai + dinding + furniture (digambar sekali saja).
    const staticLayer = document.createElement('canvas')
    staticLayer.width = OFFICE_WIDTH
    staticLayer.height = OFFICE_HEIGHT
    const staticCtx = staticLayer.getContext('2d')
    if (staticCtx) drawStatic(staticCtx, OFFICE_WIDTH, OFFICE_HEIGHT)

    // Resolution mengikuti devicePixelRatio supaya tajam di layar retina.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = OFFICE_WIDTH * dpr
    canvas.height = OFFICE_HEIGHT * dpr
    canvas.style.width = `${OFFICE_WIDTH}px`
    canvas.style.height = `${OFFICE_HEIGHT}px`
    ctx.scale(dpr, dpr)

    // WAJIB untuk pixel art: tanpa ini canvas memblur tiap tepi sprite dan
    // hasilnya terlihat vektor, bukan piksel tajam.
    ctx.imageSmoothingEnabled = false

    let last = performance.now()

    const frame = (now: number) => {
      // clamp dt agar sprite tidak "lompat" saat tab browser tidak aktif
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const t = now / 1000

      ctx.clearRect(0, 0, OFFICE_WIDTH, OFFICE_HEIGHT)
      ctx.drawImage(staticLayer, 0, 0)

      if (hoverRef.current) {
        ctx.fillStyle = 'rgba(217,119,87,0.12)'
        ctx.fillRect(hoverRef.current.x * TILE, hoverRef.current.y * TILE, TILE, TILE)
      }

      const sprites = spritesRef.current

      /* ------------------------- partikel & rayakan ------------------------ */

      // Confetti jatuh sekali saja saat workflow selesai.
      if (celebratedRef.current && !confettiFiredRef.current) {
        confettiFiredRef.current = true
        emitConfetti(confettiRef.current, OFFICE_WIDTH, 110)
      }
      if (!celebratedRef.current) confettiFiredRef.current = false

      const celebrating = celebratedRef.current
        ? Date.now() - celebratedRef.current < 9000
        : false

      // Percikan: agent yang sedang berpikir/typing mengeluarkan bara kecil,
      // dan task yang baru selesai meledak jadi ledakan besar (boost).
      const burst = burstRef.current
      for (const agent of agentsRef.current) {
        const sprite = sprites.get(agent.id)
        if (!sprite) continue
        const headY = sprite.py - TILE * 0.62

        // Bara kecil saat berpikir.
        if (agent.status === 'thinking' && Math.random() < 0.35) {
          emitSparks(sparksRef.current, sprite.px, headY, agent.color, 1)
        }

        // Ledakan saat task selesai (dibatasi satu kali per agent).
        const doneAt = finishedRef.current[agent.id]
        if (doneAt && burst[agent.id] !== doneAt) {
          burst[agent.id] = doneAt
          emitSparks(sparksRef.current, sprite.px, headY, agent.color, 12, true)
        }

        // Percikan merayakan untuk agent yang ikut berkumpul.
        if (celebrating && Math.random() < 0.25) {
          emitSparks(
            sparksRef.current,
            sprite.px,
            headY,
            agent.color,
            1,
            true,
          )
        }
      }

      stepSparks(sparksRef.current, dt, { w: OFFICE_WIDTH, h: OFFICE_HEIGHT })
      stepSparks(confettiRef.current, dt, { w: OFFICE_WIDTH, h: OFFICE_HEIGHT })

      // Confetti digambar paling belakang (di belakang sprite).
      if (confettiRef.current.length > 0) drawConfetti(ctx, confettiRef.current, t)

      // Sinkronkan sprite dengan roster agent.
      const alive = new Set<string>()
      for (const agent of agentsRef.current) {
        alive.add(agent.id)
        if (!sprites.has(agent.id)) {
          const p = tileToPixel(agent.location)
          sprites.set(agent.id, { px: p.x, py: p.y, path: [], facing: 1, arrivedAt: t })
        }
      }
      for (const id of [...sprites.keys()]) if (!alive.has(id)) sprites.delete(id)

      for (const agent of agentsRef.current) {
        const sprite = sprites.get(agent.id)
        if (!sprite) continue

        if (agent.status === 'moving') {
          const goal = tileToPixel(agent.target)
          const dx = goal.x - sprite.px
          const dy = goal.y - sprite.py
          const distance = Math.hypot(dx, dy)

          if (distance < 1.5) {
            sprite.px = goal.x
            sprite.py = goal.y
            sprite.path = []
            sprite.arrivedAt = t
          } else {
            if (pathNeedsRebuild(sprite.path, goal)) {
              const from = pixelToTile(sprite.px, sprite.py)
              const found = findPath(from, agent.target)
              // found[0] adalah tile sekarang — lewati, kita sudah berada di sana.
              sprite.path = found && found.length > 1 ? found.slice(1) : [{ ...agent.target }]
            }

            const step = AGENT_MOVE_SPEED * TILE * dt
            if (step >= distance) {
              sprite.px = goal.x
              sprite.py = goal.y
              sprite.path = []
            } else {
              sprite.px += (dx / distance) * step
              sprite.py += (dy / distance) * step
              if (Math.abs(dx) > 0.5) sprite.facing = dx > 0 ? 1 : -1
            }
          }
        }
      }

      // Urutkan sprite berdasarkan y agar terasa seperti kedalaman 2.5D.
      const ordered = [...agentsRef.current].sort((a, b) => {
        const sa = sprites.get(a.id)
        const sb = sprites.get(b.id)
        return (sa?.py ?? 0) - (sb?.py ?? 0)
      })

      // Garis tautan digambar lebih dulu agar ada di belakang sprite.
      for (const agent of ordered) {
        if (!agent.consulting) continue
        const from = sprites.get(agent.id)
        const target = agentsRef.current.find((a) => a.id === agent.consulting)
        const to = target ? sprites.get(target.id) : undefined
        if (!from || !to) continue
        drawConsultLink(
          ctx,
          { x: from.px, y: from.py },
          { x: to.px, y: to.py },
          agent.color,
          t,
        )
      }

      for (const agent of ordered) {
        const sprite = sprites.get(agent.id)
        if (!sprite) continue
        const selected = agent.id === selectedRef.current
        const busy = agent.status === 'thinking' || agent.status === 'typing'

        if (selected) {
          ctx.strokeStyle = agent.color
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(sprite.px, sprite.py, TILE * 0.42, 0, Math.PI * 2)
          ctx.stroke()
        }

        drawSprite(
          ctx, sprite.px, sprite.py, agent.color, agent.status, t,
          agent.status === 'moving', sprite.facing, agent.id, agent.activity,
        )

        // Ikon fokus di atas kepala (mode B): menampilkan activities agent.
        const meta = ACTIVITY_META[agent.activity] ?? ACTIVITY_META.work
        drawFocusIcon(ctx, sprite.px, sprite.py, meta.icon, meta.label, agent.color, busy)

        // Badge interaksi: menempel di avatar ("mau bertanya ke siapa"),
        // bukan garis panjang lintas ruangan.
        if (agent.consulting) {
          const target = agentsRef.current.find((a) => a.id === agent.consulting)
          if (target) {
            drawConsultBadge(ctx, sprite.px, sprite.py, target.name, agent.color)
          }
        }

        // Centang "selesai" — muncul singkat setelah task rampung.
        const finished = finishedRef.current[agent.id]
        if (finished && Date.now() - finished < DONE_BADGE_MS) {
          drawDoneBadge(ctx, sprite.px, sprite.py)
        }

        const bubble = bubblesRef.current[agent.id]
        if (bubble && Date.now() - bubble.at < SPEECH_BUBBLE_MS) {
          drawSpeechBubble(ctx, sprite.px, sprite.py, bubble.text, agent.color)
        }

        drawNameTag(ctx, sprite.px, sprite.py, agent.name, selected)
      }

      // Percikan api digambar paling atas supaya terlihat menyala di depan.
      if (sparksRef.current.length > 0) drawSparks(ctx, sparksRef.current)

      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  /* ------------------------------ interaksi ------------------------------- */

  /** Ubah koordinat mouse → posisi di dalam kanvas. */
  const toCanvasCoords = React.useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  /** Cari agent terdekat dari titik klik (toleransi ±0.7 tile). */
  const hitTest = React.useCallback((x: number, y: number): string | null => {
    let found: string | null = null
    let best = Infinity
    for (const [id, sprite] of spritesRef.current) {
      const d = Math.hypot(sprite.px - x, sprite.py - y)
      if (d < best && d <= TILE * 0.7) {
        best = d
        found = id
      }
    }
    return found
  }, [])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = toCanvasCoords(e)
    if (!pos) return
    const hit = hitTest(pos.x, pos.y)
    // Klik ulang pada agent yang sama → deselect.
    onSelectAgent?.(hit === selectedAgentId ? null : hit)
  }

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = toCanvasCoords(e)
    if (!pos) return
    hoverRef.current = pixelToTile(pos.x, pos.y)
    canvasRef.current?.style.setProperty('cursor', hitTest(pos.x, pos.y) ? 'pointer' : 'default')
  }

  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-border bg-[#26262e]', className)}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onMouseMove={handleMove}
        onMouseLeave={() => { hoverRef.current = null }}
        className="block"
        aria-label="Kantor virtual 2D"
        role="img"
      />
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/50 px-2 py-1 text-[10px] text-white/70">
        Klik avatar agent untuk melihat detail
      </div>
    </div>
  )
}

export default VirtualOfficeCanvas