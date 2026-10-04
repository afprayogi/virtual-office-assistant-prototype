/**
 * components/chat/markdown-parser.ts
 * ---------------------------------------------------------------------------
 * Parser Markdown minimal (tanpa dependensi) untuk UI ala Claude Desktop.
 * Mengubah string Markdown menjadi daftar blok yang bisa dirender.
 *
 * Didukung: heading (h1–h3), bold/italic/inline-code/link, list (ul/ol),
 * checklist task, blockquote, tabel, horizontal rule, dan code block.
 * ---------------------------------------------------------------------------
 */

export type Block =
  | { type: 'h1' | 'h2' | 'h3' | 'p' | 'quote'; text: string }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'task'; text: string; done: boolean }
  | { type: 'code'; language: string; code: string }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'hr' }

/** Pisahkan satu baris tabel menjadi sel-selnya. */
const splitRow = (row: string): string[] =>
  row.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

/** Apakah baris ini memulai blok markdown lain (bukan kelanjutan paragraf)? */
function startsAnotherBlock(t: string): boolean {
  return (
    /^(#{1,3})\s/.test(t) ||
    t.startsWith('```') ||
    /^([-*_])\1{2,}$/.test(t) ||   // horizontal rule (punya grup tangkapan)
    t.startsWith('>') ||
    t.startsWith('|') ||
    /^[-*]\s+\[[ xX]\]/.test(t) || // checklist
    /^[-*]\s+/.test(t) ||
    /^\d+[.)]\s/.test(t)
  )
}

/** Ubah string Markdown menjadi blok yang bisa dirender. */
export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    // Jaring pengaman: baris ini SELALU sudah lolos semua cek di bawah,
    // jadi aman diproses sebagai paragraf.
    const guardStart = i
    const trimmed = lines[i].trim()
    if (!trimmed) { i++; continue }

    /* ---------------------------- code block --------------------------- */
    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim()
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i])
        i++
      }
      i++ // lewati penutup fence
      blocks.push({ type: 'code', language, code: buf.join('\n') })
      continue
    }

    /* ------------------------------ heading ---------------------------- */
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed)
    if (heading) {
      const level = heading[1].length
      blocks.push({ type: level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3', text: heading[2] })
      i++
      continue
    }

    /* --------------------------- horizontal rule ---------------------- */
    if (/^([-*_])\1{2,}$/.test(trimmed)) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    /* ---------------------------- blockquote --------------------------- */
    if (trimmed.startsWith('>')) {
      const buf: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        buf.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      blocks.push({ type: 'quote', text: buf.join('\n') })
      continue
    }

    /* ------------------------------- table ----------------------------- */
    // Baris saat ini berisi '|' dan baris berikutnya hanya pembatas '-'/'|'/':'
    if (trimmed.includes('|') && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] ?? '')) {
      const header = splitRow(trimmed)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitRow(lines[i].trim()))
        i++
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }

    /* ----------------------------- checklist --------------------------- */
    const task = /^[-*]\s+\[([ xX])\]\s+(.*)$/.exec(trimmed)
    if (task) {
      blocks.push({ type: 'task', done: task[1].toLowerCase() === 'x', text: task[2] })
      i++
      continue
    }

    /* ---------------------------- list tak bernomor ------------------- */
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''))
        i++
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    /* --------------------------- list bernomor ------------------------ */
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''))
        i++
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    /* ---------------------------- paragraf ---------------------------- */
    // Baris pertama pasti paragraf (sudah lolos semua cek di atas), jadi
    // selalu dikonsumsi. Tanpa ini, baris seperti `**tebal**` akan langsung
    // kena kondisi break dan `i` tidak pernah maju → infinite loop.
    const buf: string[] = [trimmed]
    i++
    while (i < lines.length && lines[i].trim()) {
      const t = lines[i].trim()
      if (startsAnotherBlock(t)) break
      buf.push(t)
      i++
    }
    blocks.push({ type: 'p', text: buf.join('\n') })

    // Pengaman terakhir: pastikan loop selalu maju.
    if (i === guardStart) i++
  }

  return blocks
}