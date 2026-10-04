/**
 * tools/readme/demo-svg.ts
 * ---------------------------------------------------------------------------
 * Animasi kantor versi SVG memakai SMIL (<animate>/<animateTransform>) dengan
 * label ruangan & nama agent — tajam di skala apa pun. Berjalan di Chrome/Edge;
 * untuk dukungan seragam semua browser, pakai office-demo.gif.
 * ---------------------------------------------------------------------------
 */
import { officeScenery } from './office-scene'
import {
  DEFAULT_AGENTS, agentSprite, hexPalette, rect, svg, spritePath, text,
} from './svg-kit'
import { scheduleFor, sampleAt } from './demo-schedule'

/**
 * Bangun animasi kantor dalam SVG.
 * @param samples jumlah titik sampel jalur per agent (makin banyak makin halus)
 * @param durSec  lama satu loop (detik)
 */
export function renderOfficeDemoSvg(samples = 16, durSec = 8): string {
  const ST = 32 // piksel per tile
  const W = 22 * ST
  const OFFICE_H = 14 * ST
  const BAR_H = 34
  const H = OFFICE_H + BAR_H

  const parts: string[] = [rect(0, 0, W, H, '#16161d')]
  // Latar kantor (lantai + furniture + label) di skala 32/48.
  parts.push(officeScenery(ST / 48, true))
  parts.push(rect(0, OFFICE_H, W, 1, '#00000044'))

  const schedules = DEFAULT_AGENTS.map((_, i) => scheduleFor(i))
  const keyTimes: string[] = []
  for (let k = 0; k <= samples; k++) keyTimes.push((k / samples).toFixed(4))

  DEFAULT_AGENTS.forEach((agent, i) => {
    const sched = schedules[i]
    const samplesAt = Array.from({ length: samples + 1 }, (_, k) => sampleAt(sched, k / samples))
    const posVals = samplesAt.map((s) => `${(s.x * ST).toFixed(1)},${(s.y * ST).toFixed(1)}`)
    const poses = Array.from(new Set(samplesAt.map((s) => s.pose)))

    let inner = ''
    for (const pose of poses) {
      const opacityVals = samplesAt.map((s) => (s.pose === pose ? '1' : '0'))
      inner +=
        `<g opacity="0">` +
        `<animate attributeName="opacity" dur="${durSec}s" repeatCount="indefinite" ` +
        `keyTimes="${keyTimes.join(';')}" values="${opacityVals.join(';')}"/>` +
        spritePath(agentSprite(agent, pose), hexPalette(agent), 2, -16, -54) +
        `</g>`
    }
    // Nama agent kecil di bawah sprite (statis, mengikuti translate).
    inner += text(0, 6, agent.name, { size: 10, weight: 700, fill: agent.color, anchor: 'middle' })

    parts.push(
      `<g transform="translate(0,0)">` +
        `<animateTransform attributeName="transform" type="translate" dur="${durSec}s" ` +
        `repeatCount="indefinite" keyTimes="${keyTimes.join(';')}" values="${posVals.join(';')}"/>` +
        inner +
        `</g>`,
    )
  })

  // Bar progres fase di bawah.
  const trackX = 16
  const trackW = W - 32
  parts.push(rect(0, OFFICE_H, W, BAR_H, '#16161d'))
  parts.push(rect(trackX, OFFICE_H + 20, trackW, 6, '#2a2930', { rx: 3 }))
  parts.push(
    `<rect x="${trackX}" y="${OFFICE_H + 20}" width="0" height="6" rx="3" fill="#D97757">` +
      `<animate attributeName="width" dur="${durSec}s" repeatCount="indefinite" values="0;${trackW}"/>` +
      `</rect>`,
  )
  const phases = ['Requirement', 'Design', 'Creative', 'Coding', 'Testing', 'Documenting']
  const step = trackW / (phases.length - 1)
  phases.forEach((p, k) => {
    const cx = trackX + k * step
    parts.push(`<circle cx="${cx}" cy="${OFFICE_H + 14}" r="3" fill="#4ade80"/>`)
    parts.push(text(k === 0 ? cx + 8 : k === phases.length - 1 ? cx - 8 : cx, OFFICE_H + 4, p, {
      size: 9, fill: '#8f877e', anchor: k === 0 ? 'start' : k === phases.length - 1 ? 'end' : 'middle',
    }))
  })

  return svg(W, H, parts.join(''))
}
