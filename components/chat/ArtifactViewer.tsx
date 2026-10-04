/**
 * components/chat/ArtifactViewer.tsx
 * ---------------------------------------------------------------------------
 * Workspace berisi FILE hasil kerja, bukan percakapan:
 *   - `code`     → syntax highlight + copy
 *   - `html`     → preview terisolasi lewat iframe sandboxed
 *   - `mermaid`  → ditampilkan sebagai source (aman tanpa dependensi)
 *   - `json`     → pretty-print
 *   - `markdown` → dirender sebagai Markdown
 *
 * Hanya blok bertanda `file:<path>` yang menghasilkan entri di sini, sehingga
 * file dikelompokkan per folder (docs/, src/, preview/) seperti proyek nyata.
 * ---------------------------------------------------------------------------
 */
'use client'

import * as React from 'react'
import {
  Check, Code2, Copy, Download, ExternalLink, FileJson, FileText, FileType,
  Globe, Image as ImageIcon, Network, Pencil, RotateCcw,
} from 'lucide-react'
import type { Artifact, ArtifactKind, ReviewResult } from '@/types/agent'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Markdown, CodeBlock } from './Markdown'
import { cn } from '@/lib/utils'

/** Ikon per jenis artefak. */
export function artifactIcon(kind: ArtifactKind): React.ReactNode {
  switch (kind) {
    case 'html': return <Globe className="h-3.5 w-3.5" />
    case 'json': return <FileJson className="h-3.5 w-3.5" />
    case 'mermaid': return <Network className="h-3.5 w-3.5" />
    case 'markdown': return <FileText className="h-3.5 w-3.5" />
    case 'pdf': return <FileType className="h-3.5 w-3.5" />
    case 'svg': return <ImageIcon className="h-3.5 w-3.5" />
    default: return <Code2 className="h-3.5 w-3.5" />
  }
}

/** Emoji bentuk hasil — dipakai di daftar file Workspace. */
export function artifactEmoji(kind: ArtifactKind): string {
  switch (kind) {
    case 'pdf': return '📄'
    case 'html': return '🌐'
    case 'json': return '🧾'
    case 'mermaid': return '🔗'
    case 'markdown': return '📝'
    case 'svg': return '🎨'
    default: return '💻'
  }
}

/** Label singkat bentuk file, untuk badge di header. */
export function artifactKindLabel(kind: ArtifactKind): string {
  switch (kind) {
    case 'pdf': return 'PDF'
    case 'html': return 'Program'
    case 'json': return 'Data'
    case 'mermaid': return 'Diagram'
    case 'markdown': return 'Dokumen'
    case 'svg': return 'Gambar'
    default: return 'Program'
  }
}

/** Panel isi sesuai jenis artefak. */
function ArtifactBody({ artifact }: { artifact: Artifact }) {
  const pretty = React.useMemo(() => {
    if (artifact.kind !== 'json') return artifact.content
    try {
      return JSON.stringify(JSON.parse(artifact.content), null, 2)
    } catch {
      return artifact.content
    }
  }, [artifact])

  switch (artifact.kind) {
    case 'pdf':
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              PDF asli tersimpan di direktori kerja — file ini bisa diunduh atau
              dibuka langsung di browser.
            </p>
            {artifact.downloadUrl && (
              <Button asChild size="sm" className="h-7 shrink-0 text-[11px]">
                <a href={artifact.downloadUrl} target="_blank" rel="noreferrer">
                  <Download className="h-3 w-3" />
                  Buka PDF
                </a>
              </Button>
            )}
          </div>
          {artifact.downloadUrl && (
            <iframe
              title={`PDF ${artifact.path}`}
              src={artifact.downloadUrl}
              className="h-[560px] w-full rounded-md border border-border bg-white"
            />
          )}
          <details className="rounded-md border border-border">
            <summary className="cursor-pointer px-3 py-2 text-[11px] font-medium text-muted-foreground">
              Lihat sumber Markdown
            </summary>
            <div className="border-t border-border p-3">
              <Markdown content={artifact.content} />
            </div>
          </details>
        </div>
      )
    case 'html':
      return (
        <iframe
          title={`Preview ${artifact.path}`}
          // Tanpa 'allow-same-origin' → HTML agen tidak bisa menyentuh host.
          sandbox="allow-scripts"
          srcDoc={artifact.content}
          className="h-full min-h-[320px] w-full rounded-md border border-border bg-white"
        />
      )
    case 'mermaid':
      return (
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-[#0d0d10] p-4">
            <pre className="overflow-x-auto text-[12px] leading-relaxed text-sky-300">
              <code>{artifact.content}</code>
            </pre>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Diagram Mermaid — salin ke penampil Mermaid online untuk merender visual.
          </p>
        </div>
      )
    case 'markdown':
      return <Markdown content={artifact.content} />
    case 'json':
      return <CodeBlock language="json" code={pretty} />
    case 'svg': {
      // SVG dirender sebagai gambar. Sengaja lewat <img src="data:..."> BUKAN
      // inline: SVG yang ditulis model boleh berisi script, dan <img> tidak
      // mengeksekusikannya — kalau di-inline, itu jadi vektor XSS.
      const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artifact.content)}`
      return (
        <div className="space-y-3">
          <div className="flex justify-center overflow-x-auto rounded-md border border-border bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={svgUrl}
              alt={artifact.path}
              className="max-h-[520px] w-auto max-w-full"
            />
          </div>
          <details className="rounded-md border border-border">
            <summary className="cursor-pointer px-3 py-2 text-[11px] text-muted-foreground">
              Lihat kode SVG
            </summary>
            <CodeBlock language="xml" code={artifact.content} />
          </details>
        </div>
      )
    }
    default:
      return <CodeBlock language={artifact.language} code={artifact.content} />
  }
}

/**
 * Daftar file hasil kerja + area preview.
 *
 * Workspace HANYA menampilkan deliverable (file hasil kerja), bukan percakapan.
 * File dikelompokkan berdasarkan foldernya (docs/, src/, preview/) supaya
 * terlihat seperti struktur proyek sungguhan.
 */
export function ArtifactViewer({
  artifacts,
  activeId,
  onSelect,
  reviews,
  onRequestRevision,
}: {
  artifacts: Artifact[]
  activeId: string | null
  onSelect: (id: string) => void
  /** Status "sesuai / perlu revisi" per path file. */
  reviews?: Record<string, ReviewResult>
  /** Minta agent merevisi file yang sedang dibuka. */
  onRequestRevision?: (artifact: Artifact) => void
}) {
  const active = artifacts.find((a) => a.id === activeId) ?? artifacts[0]
  const activeReview = active ? reviews?.[active.path] : undefined

  // Kelompokkan berdasarkan folder path.
  const groups = React.useMemo(() => {
    const map = new Map<string, Artifact[]>()
    for (const a of artifacts) {
      const folder = a.path.includes('/') ? a.path.slice(0, a.path.lastIndexOf('/')) : '/'
      const list = map.get(folder) ?? []
      list.push(a)
      map.set(folder, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [artifacts])

  if (artifacts.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-muted">
          <Pencil className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">Belum ada hasil kerja</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Workspace hanya menampilkan file yang benar-benar dihasilkan agent
          (dokumen, kode, prototipe) — bukan cuplikan percakapan.
        </p>
      </div>
    )
  }

  const totalBytes = artifacts.reduce((acc, a) => acc + a.content.length, 0)

  return (
    <div className="flex h-full min-h-0">
      {/* Daftar file */}
      <div className="flex w-52 shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Hasil Kerja
          </span>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {artifacts.length} file · {Math.round(totalBytes / 1024)} KB
          </span>
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-2 p-1.5">
            {groups.map(([folder, files]) => (
              <div key={folder}>
                <p className="px-1.5 pb-1 font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground/70">
                  {folder}
                </p>
                <div className="space-y-0.5">
                  {files.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onSelect(a.id)}
                      title={`${a.taskTitle ?? ''} — oleh ${a.agentName}`}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] transition-colors',
                        a.id === active?.id
                          ? 'bg-claude/15 text-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      <span className="shrink-0 text-[12px] leading-none" aria-hidden>
                        {artifactEmoji(a.kind)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {a.path.split('/').pop()}
                      </span>
                      <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground/60">
                        {reviews?.[a.path] ? (
                          <span
                            title={reviews[a.path].summary}
                            className={reviews[a.path].verdict === 'sesuai' ? 'text-emerald-500' : 'text-amber-500'}
                          >
                            {reviews[a.path].verdict === 'sesuai' ? '✓' : '✎'} {reviews[a.path].score}%
                          </span>
                        ) : (
                          artifactKindLabel(a.kind)
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Preview */}
      {active && (
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-2 border-b border-border px-3 py-2">
            <span className="text-muted-foreground">{artifactIcon(active.kind)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[12px] font-medium text-foreground">{active.path}</p>
              <p className="truncate text-[10px] text-muted-foreground">
                {active.agentName}
                {active.taskTitle ? ` · ${active.taskTitle}` : ''} · {active.content.length} karakter
              </p>
            </div>
            {activeReview && (
              <span
                title={activeReview.criteria
                  .map((c) => `${c.ok ? '✓' : '✗'} ${c.label}${c.hint ? ` — ${c.hint}` : ''}`)
                  .join('\n')}
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                  activeReview.verdict === 'sesuai'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                )}
              >
                {activeReview.verdict === 'sesuai' ? '✓ Sesuai' : '✎ Perlu revisi'} ·{' '}
                {activeReview.score}%
              </span>
            )}
            {onRequestRevision && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 shrink-0 px-2 text-[11px]"
                onClick={() => onRequestRevision(active)}
              >
                <RotateCcw className="h-3 w-3" />
                Minta revisi
              </Button>
            )}
            {active.kind === 'html' && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => {
                  const blob = new Blob([active.content], { type: 'text/html' })
                  window.open(URL.createObjectURL(blob), '_blank', 'noopener')
                }}
              >
                <ExternalLink className="h-3 w-3" />
                Tab baru
              </Button>
            )}
            <CopyButton text={active.content} />
          </header>
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-3">
              <ArtifactBody artifact={active} />
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}

/** Tombol copy dengan umpan balik visual. */
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-[11px]"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1600)
        } catch {
          /* abaikan */
        }
      }}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : label}
    </Button>
  )
}