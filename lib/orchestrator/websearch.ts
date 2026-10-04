/**
 * lib/orchestrator/websearch.ts
 * ---------------------------------------------------------------------------
 * Akses internet untuk agent, TANPA API key dan TANPA dependency.
 *
 * Strategi sadar-token: DuckDuckGo Instant Answer dipakai lebih dulu karena
 * sering langsung menjawab tanpa perlu scraping. Kalau hasilnya tipis, kita
 * ambil cuplikan teratas dari halaman agregat — tidak membuka tiap artikel
 * satu per satu.
 *
 * Semua hasil dipotong ketat (`MAX_SNIPPET`) supaya tidak membanjiri prompt.
 * ---------------------------------------------------------------------------
 */

/** Panjang maksimum cuplikan per hasil (karakter). */
const MAX_SNIPPET = 320

/** Jumlah hasil yang dikembalikan ke agent. */
const MAX_RESULTS = 4

/** Batas waktu per permintaan internet. */
const TIMEOUT_MS = 5000

/** Header standar agar DDG tidak menolak request. */
const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
}

/** Satu hasil pencarian. */
export interface SearchHit {
  title: string
  url: string
  snippet: string
}

/**
 * Fetch dengan timeout; mengembalikan teks atau `null`.
 * `null` berarti jaringan tidak terjangkau (bukan "tidak ada hasil") — ini
 * penting agar kita berhenti di layer 1 dan tidak membuang waktu retry.
 */
async function fetchText(
  url: string,
  accept = 'application/json',
): Promise<{ text: string | null; offline: boolean }> {
  try {
    const res = await fetch(url, {
      headers: { ...HEADERS, Accept: accept },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return { text: null, offline: false }
    return { text: await res.text(), offline: false }
  } catch {
    return { text: null, offline: true }
  }
}

/** Buang tag HTML lalu rapatkan whitespace. */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Potong dengan batas kata agar tidak terpotong di tengah. */
function clip(text: string, max = MAX_SNIPPET): string {
  const clean = stripHtml(text)
  if (clean.length <= max) return clean
  return `${clean.slice(0, max).replace(/\s+\S*$/, '')}…`
}

/**
 * Cari di internet.
 *
 * Layer 1 — DuckDuckGo Instant Answer (ringkas, sering langsung berisi jawaban).
 * Layer 2 — halaman agregat DuckDuckGo (cuplikan teratas), sebagai cadangan.
 *
 * @returns daftar hasil; array kosong bila internet mati.
 */
export async function searchWeb(query: string): Promise<SearchHit[]> {
  const q = query.trim()
  if (!q) return []
  const hits: SearchHit[] = []

  // Layer 1: Instant Answer.
  let offline = false
  try {
    const raw = await fetchText(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`,
    )
    offline = raw.offline
    if (raw.text) {
      const data = JSON.parse(raw.text) as {
        Heading?: string
        AbstractText?: string
        AbstractURL?: string
        RelatedTopics?: { Text?: string; FirstURL?: string }[]
      }
      if (data.AbstractText) {
        hits.push({
          title: data.Heading || q,
          url: data.AbstractURL || '',
          snippet: clip(data.AbstractText),
        })
      }
      for (const t of data.RelatedTopics ?? []) {
        if (!t.Text || hits.length >= MAX_RESULTS) continue
        hits.push({ title: t.Text.slice(0, 80), url: t.FirstURL ?? '', snippet: clip(t.Text) })
      }
    }
  } catch {
    // Abaikan; layer 2 masih dicoba bila jaringan hidup.
  }

  // Jaringan mati → jangan coba layer 2, itu hanya membuang waktu.
  if (offline) return hits

  // Layer 2: agregat HTML (hanya kalau layer 1 belum cukup).
  if (hits.length < 2) {
    const html = await fetchText(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
      'text/html',
    )
    if (html.text) {
      const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
      let m: RegExpExecArray | null
      while ((m = re.exec(html.text)) && hits.length < MAX_RESULTS) {
        hits.push({
          title: clip(m[2], 90),
          url: decodeURIComponent(m[1].replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, '')),
          snippet: clip(m[3]),
        })
      }
    }
  }

  return hits.slice(0, MAX_RESULTS)
}

/**
 * Ringkas hasil pencarian menjadi blok teks siap suntik ke prompt.
 * @returns string kosong bila tidak ada hasil.
 */
export function formatResearch(query: string, hits: SearchHit[]): string {
  if (hits.length === 0) return ''
  const lines = hits.map(
    (h, i) => `${i + 1}. ${h.title}\n   ${h.snippet}${h.url ? `\n   ${h.url}` : ''}`,
  )
  return `HASIL PENCARIAN INTERNET untuk "${query}":\n${lines.join('\n')}`
}

/**
 * Cari + format dalam satu panggilan. Dipakai engine sebelum menyusun prompt.
 */
export async function research(query: string): Promise<string> {
  try {
    const hits = await searchWeb(query)
    return formatResearch(query, hits)
  } catch {
    return ''
  }
}