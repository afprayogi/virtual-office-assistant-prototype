/**
 * lib/orchestrator/pdf.ts
 * ---------------------------------------------------------------------------
 * Penulis PDF minimal, tanpa dependensi.
 *
 * Agent menulis Markdown; modul ini mengubahnya menjadi file PDF sungguhan
 * (header `%PDF-1.4`, xref, trailer) yang bisa dibuka Acrobat/Chrome/Edge.
 *
 * Disengaja sederhana: font standar Helvetica, teks rata kiri, heading lebih
 * besar. Cukup untuk dokumen hasil kerja tanpa menarik dependency besar.
 * ---------------------------------------------------------------------------
 */

/** A4 dalam poin (72 pt = 1 inci). */
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 56
const LEADING = 14
/** Helvetica 11pt: ~1.9pt per karakter pada lebar 520pt. */
const CHARS_PER_LINE = 82

/** Escape karakter khusus sintaks PDF + flatten ke WinAnsi. */
function escapePdf(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/→/g, '->')
    .replace(/·/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
}

/** Potong baris panjang agar muat dalam lebar halaman. */
function wrap(line: string, maxChars: number): string[] {
  if (line.length <= maxChars) return [line]
  const words = line.split(/\s+/)
  const out: string[] = []
  let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) {
      if (cur) out.push(cur)
      cur = w
    } else {
      cur = (cur + ' ' + w).trim()
    }
  }
  if (cur) out.push(cur)
  return out.length ? out : [line.slice(0, maxChars)]
}

interface Line {
  text: string
  /** Ukuran font dalam poin. */
  size: number
  /** true bila baris kosong (jarak antar paragraf). */
  gap: boolean
}

/** Ubah Markdown sederhana menjadi baris yang siap digambar. */
function markdownToLines(md: string): Line[] {
  const lines: Line[] = []
  for (const raw of md.replace(/\r\n/g, '\n').split('\n')) {
    const text = raw.trimEnd()

    if (!text.trim()) {
      lines.push({ text: '', size: 11, gap: true })
      continue
    }

    const heading = text.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      const size = level === 1 ? 20 : level === 2 ? 15 : 13
      for (const w of wrap(heading[2], Math.max(20, Math.floor(520 / size)))) {
        lines.push({ text: w, size, gap: false })
      }
      lines.push({ text: '', size: 11, gap: true })
      continue
    }

    // Separator tabel Markdown: abaikan.
    if (/^\|?[\s:|-]+\|[\s:|-]+$/.test(text.trim())) continue

    // Baris tabel: sel digabung agar tetap terbaca di PDF teks.
    if (text.trim().startsWith('|')) {
      const cells = text.split('|').map((c) => c.trim()).filter(Boolean)
      for (const w of wrap(cells.join('  -  '), 74)) {
        lines.push({ text: w, size: 10, gap: false })
      }
      continue
    }

    // Bullet dan numbered list.
    const bullet = text.match(/^\s*[-*]\s+(.*)$/) ?? text.match(/^\s*\d+\.\s+(.*)$/)
    if (bullet) {
      for (const w of wrap(bullet[1], 72)) {
        lines.push({ text: `  - ${w}`, size: 11, gap: false })
      }
      continue
    }

    // Blockquote.
    const quote = text.match(/^>\s?(.*)$/)
    if (quote) {
      for (const w of wrap(quote[1], 70)) {
        lines.push({ text: `  ${w}`, size: 11, gap: false })
      }
      continue
    }

    for (const w of wrap(text.trim(), CHARS_PER_LINE)) {
      lines.push({ text: w, size: 11, gap: false })
    }
  }
  return lines
}
/**
 * Bangun PDF sungguhan dari Markdown.
 * @returns buffer biner PDF, siap ditulis ke disk / dikirim ke browser.
 */
export function markdownToPdf(markdown: string, title = 'Dokumen'): Buffer {
  const lines = markdownToLines(markdown)
  const maxLinesPerPage = Math.max(1, Math.floor((PAGE_H - MARGIN * 2) / LEADING))

  // Bagi baris menjadi halaman.
  const pages: Line[][] = []
  let current: Line[] = []
  for (const line of lines) {
    if (current.length >= maxLinesPerPage) {
      pages.push(current)
      current = []
    }
    current.push(line)
  }
  pages.push(current.length ? current : [{ text: '', size: 11, gap: true }])

  // Objek PDF: 1=Catalog, 2=Pages, 3=Font, lalu tiap halaman (Page + Contents).
  const objects: string[] = []
  const pageCount = pages.length
  const firstPageObj = 4
  const kids = Array.from(
    { length: pageCount },
    (_, i) => `${firstPageObj + i * 2} 0 R`,
  ).join(' ')

  objects.push('<< /Type /Catalog /Pages 2 0 R >>')
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`)
  objects.push(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  )

  pages.forEach((pageLines, pageIndex) => {
    // Sumbu Y PDF tumbuh ke atas, jadi kita gambar dari atas ke bawah.
    let y = PAGE_H - MARGIN
    const ops: string[] = ['BT']
    let lastSize = 0

    for (const line of pageLines) {
      if (line.gap) {
        y -= LEADING * 0.6
        continue
      }
      if (line.size !== lastSize) {
        ops.push(`/F1 ${line.size} Tf`)
        lastSize = line.size
      }
      ops.push(`1 0 0 1 ${MARGIN.toFixed(2)} ${y.toFixed(2)} Tm`)
      ops.push(`(${escapePdf(line.text)}) Tj`)
      y -= LEADING
      if (y < MARGIN) break
    }
    ops.push('ET')

    const content = ops.join('\n')
    const contentObj = firstPageObj + pageIndex * 2 + 1

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObj} 0 R >>`,
    )
    objects.push(
      `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    )
  })

  // Rakit file PDF lengkap dengan xref + trailer.
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })

  const xrefStart = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ` +
    `/Info << /Title (${escapePdf(title)}) /Producer (Virtual Office) >> >>\n`
  pdf += `startxref\n${xrefStart}\n%%EOF\n`

  return Buffer.from(pdf, 'latin1')
}