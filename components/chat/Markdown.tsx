/**
 * components/chat/Markdown.tsx
 * ---------------------------------------------------------------------------
 * Renderer Markdown bergaya Claude Desktop.
 *
 * Sengaja TIDAK memakai react-markdown/shiki supaya tidak menambah dependensi
 * berat dan tetap berjalan sepenuhnya offline, sekaligus memberi kita kontrol
 * penuh atas code block (highlight sintaks ringan + tombol copy).
 * ---------------------------------------------------------------------------
 */
'use client'

import * as React from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseBlocks } from './markdown-parser'

/* ----------------------------- inline parsing ---------------------------- */

/** Pecah markup inline (bold, italic, code, link) menjadi node React. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g
  let last = 0
  let i = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyPrefix}-i${i++}`

    if (token.startsWith('**') || token.startsWith('__')) {
      out.push(<strong key={key} className="font-semibold text-foreground">{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('`')) {
      out.push(
        <code key={key} className="rounded bg-claude/10 px-1.5 py-0.5 font-mono text-[0.85em] text-claude">
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith('[')) {
      const link = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(token)
      out.push(
        link ? (
          <a
            key={key}
            href={link[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-claude underline underline-offset-2 hover:opacity-80"
          >
            {link[1]}
          </a>
        ) : (
          token
        ),
      )
    } else {
      out.push(<em key={key} className="italic">{token.slice(1, -1)}</em>)
    }
    last = match.index + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/* --------------------------- syntax highlighting ------------------------- */

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class',
  'import', 'from', 'export', 'default', 'async', 'await', 'new', 'this', 'try', 'catch',
  'interface', 'type', 'enum', 'implements', 'extends', 'public', 'private', 'readonly',
  'true', 'false', 'null', 'undefined', 'def', 'lambda', 'pass', 'with', 'as', 'in',
])

/** Highlight sintaks ringan per-token (cukup agar kode terbaca). */
function highlight(code: string, language: string): React.ReactNode[] {
  const isMarkup = ['html', 'xml', 'svg', 'markdown', 'md'].includes(language)
  const pattern = /("""[\s\S]*?"""|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+(?:\.\d+)?\b|\b\w+\b|\s+|[^\s\w])/g
  const out: React.ReactNode[] = []
  let match: RegExpExecArray | null
  let i = 0

  while ((match = pattern.exec(code)) !== null) {
    const tok = match[0]
    const key = `h${i++}`
    if (/^["'`]/.test(tok)) {
      out.push(<span key={key} className="text-emerald-400">{tok}</span>)
    } else if (/^\d/.test(tok)) {
      out.push(<span key={key} className="text-amber-400">{tok}</span>)
    } else if (/^\s+$/.test(tok)) {
      out.push(tok)
    } else if (KEYWORDS.has(tok)) {
      out.push(<span key={key} className="text-sky-400">{tok}</span>)
    } else if (isMarkup && tok.startsWith('<')) {
      out.push(<span key={key} className="text-claude">{tok}</span>)
    } else if (/^[A-Z]/.test(tok)) {
      out.push(<span key={key} className="text-violet-400">{tok}</span>)
    } else {
      out.push(<span key={key} className="text-foreground/90">{tok}</span>)
    }
  }
  return out
}

/* -------------------------------- CodeBlock ------------------------------- */

export function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = React.useState(false)

  const copy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard tidak tersedia (mis. konteks http non-secure) */
    }
  }, [code])

  return (
    <div className="group relative my-3 overflow-hidden rounded-lg border border-border bg-[#0d0d10]">
      <div className="flex items-center justify-between border-b border-border/70 bg-white/[0.03] px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {language || 'text'}
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus:opacity-100 group-hover:opacity-100"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[12.5px] leading-relaxed">
        <code className="font-mono">{highlight(code, language.toLowerCase())}</code>
      </pre>
    </div>
  )
}

/* -------------------------------- Markdown -------------------------------- */

export interface MarkdownProps {
  content: string
  className?: string
}

export function Markdown({ content, className }: MarkdownProps) {
  const blocks = React.useMemo(() => parseBlocks(content), [content])

  return (
    <div className={cn('space-y-3 text-[13.5px] leading-relaxed text-foreground/90', className)}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h1':
            return <h1 key={i} className="mt-4 text-lg font-semibold text-foreground">{renderInline(b.text, String(i))}</h1>
          case 'h2':
            return <h2 key={i} className="mt-4 text-base font-semibold text-foreground">{renderInline(b.text, String(i))}</h2>
          case 'h3':
            return <h3 key={i} className="mt-3 text-sm font-semibold text-foreground">{renderInline(b.text, String(i))}</h3>
          case 'p':
            return <p key={i} className="whitespace-pre-wrap">{renderInline(b.text, String(i))}</p>
          case 'quote':
            return (
              <blockquote key={i} className="border-l-2 border-claude bg-claude/5 py-1.5 pl-3 text-muted-foreground">
                {renderInline(b.text, String(i))}
              </blockquote>
            )
          case 'ul':
            return (
              <ul key={i} className="list-disc space-y-1 pl-5 marker:text-claude">
                {b.items.map((it, j) => <li key={j}>{renderInline(it, `${i}-${j}`)}</li>)}
              </ul>
            )
          case 'ol':
            return (
              <ol key={i} className="list-decimal space-y-1 pl-5 marker:text-claude">
                {b.items.map((it, j) => <li key={j}>{renderInline(it, `${i}-${j}`)}</li>)}
              </ol>
            )
          case 'task':
            return (
              <div key={i} className="flex items-start gap-2">
                <span className={cn(
                  'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                  b.done ? 'bg-emerald-500' : 'bg-muted-foreground/50',
                )} />
                <span className={cn('whitespace-pre-wrap', b.done && 'text-muted-foreground line-through')}>
                  {renderInline(b.text, String(i))}
                </span>
              </div>
            )
          case 'code':
            return <CodeBlock key={i} language={b.language} code={b.code} />
          case 'table':
            return (
              <div key={i} className="my-3 overflow-x-auto rounded-lg border border-border">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead className="bg-white/[0.03]">
                    <tr>
                      {b.header.map((h, j) => (
                        <th key={j} className="border-b border-border px-3 py-2 text-left font-semibold text-foreground">
                          {renderInline(h, `${i}-h${j}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-b border-border/50 last:border-0 hover:bg-white/[0.02]">
                        {r.map((c, k) => (
                          <td key={k} className="px-3 py-2 align-top">{renderInline(c, `${i}-r${j}c${k}`)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'hr':
            return <hr key={i} className="my-4 border-border" />
          default:
            return null
        }
      })}
    </div>
  )
}