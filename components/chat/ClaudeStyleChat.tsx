/**
 * components/chat/ClaudeStyleChat.tsx
 * ---------------------------------------------------------------------------
 * DELIVERABLE 3 — Panel percakapan bergaya Claude Desktop.
 *
 * Fitur:
 *   - Daftar pesan dengan avatar, nama peran, dan badge fase.
 *   - Streaming response: kursor berkedip + animasi "sedang berpikir".
 *   - Copy message, tombol buka file hasil kerja terkait.
 *   - Tab kembar: Chat ⇄ Workspace (berisi FILE: kode, HTML preview, dokumen).
 *   - Composer untuk mengirim arahan baru (human-in-the-loop).
 * ---------------------------------------------------------------------------
 */
'use client'

import * as React from 'react'
import { Check, Copy, Sparkles, Workflow } from 'lucide-react'
import type { Agent, Artifact, Message, ReviewResult } from '@/types/agent'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Markdown } from './Markdown'
import { ArtifactViewer } from './ArtifactViewer'
import { PHASE_LABELS } from '@/lib/store'
import { cn, truncate } from '@/lib/utils'

/* ------------------------------ sub-komponen ----------------------------- */

/** Avatar bulat berisi emoji agent dengan cincin warna status. */
export function AgentAvatar({ agent, size = 'md' }: { agent?: Agent; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'sm' ? 'h-6 w-6 text-[11px]' : size === 'lg' ? 'h-11 w-11 text-lg' : 'h-8 w-8 text-sm'
  if (!agent) return <div className={cn('grid place-items-center rounded-full bg-muted', cls)}>?</div>
  return (
    <div
      className={cn('grid shrink-0 place-items-center rounded-full ring-2', cls)}
      style={{ backgroundColor: `${agent.color}22`, ['--tw-ring-color' as string]: agent.color }}
      title={`${agent.name} — ${agent.role}`}
    >
      <span aria-hidden>{agent.avatar}</span>
    </div>
  )
}

/** Indikator "sedang berpikir" ala Claude. */
function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1" aria-label="Sedang berpikir">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
          style={{ animationDelay: `${i * 140}ms`, animationDuration: '900ms' }}
        />
      ))}
    </div>
  )
}

/** Kursor berkedip saat token masih mengalir. */
function StreamingCaret() {
  return (
    <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-[2px] animate-blink bg-claude align-middle" />
  )
}

/** Satu baris pesan agent. */
function MessageRow({
  message,
  agent,
  onOpenWorkspace,
}: {
  message: Message
  agent?: Agent
  onOpenWorkspace: (id: string) => void
}) {
  const [copied, setCopied] = React.useState(false)
  // Tombol Workspace hanya muncul bila pesan ini benar-benar menghasilkan file.
  const fileCount = message.artifactIds?.length ?? 0

  const copy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard tidak tersedia */
    }
  }, [message.content])

  return (
    <article className="group relative flex gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-white/[0.02]">
      <AgentAvatar agent={agent} />
      <div className="min-w-0 flex-1">
        <header className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-foreground">{message.agentName}</span>
          <span className="text-[11px] text-muted-foreground">{message.role}</span>
          <Badge variant="muted" className="h-5 px-1.5 text-[10px] font-normal">
            {PHASE_LABELS[message.phase]}
          </Badge>
          {message.usage ? (
            <span className="text-[10px] tabular-nums text-muted-foreground/70">
              {message.usage.total} tok
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            {fileCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[11px]"
                onClick={() => onOpenWorkspace(message.id)}
                title="Buka hasil kerja di Workspace"
              >
                <Workflow className="h-3 w-3" />
                {fileCount} file
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={copy} aria-label="Copy message">
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
        </header>

        {message.streaming && !message.content ? (
          <ThinkingDots />
        ) : (
          <Markdown content={message.content} />
        )}

        {message.streaming && message.content ? <StreamingCaret /> : null}
      </div>
    </article>
  )
}

/** Tampilan saat belum ada pesan. */
function EmptyState({ task }: { task: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-claude/10">
        <Sparkles className="h-6 w-6 text-claude" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">Belum ada percakapan</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Tulis brief di kolom unten lalu tekan <span className="font-medium text-foreground">Mulai Workflow</span>.
          {task ? <> Brief aktif: <span className="italic">“{truncate(task, 60)}”</span></> : null}
        </p>
      </div>
    </div>
  )
}

/* ======================================================================== */
/*  Panel utama                                                            */
/* ======================================================================== */

export interface ClaudeStyleChatProps {
  messages: Message[]
  agents: Agent[]
  artifacts: Artifact[]
  activeArtifactId: string | null
  task: string
  onSelectArtifact: (id: string | null) => void
  /** Status "sesuai / perlu revisi" per path file. */
  reviews?: Record<string, ReviewResult>
  /** Kirim permintaan revisi ke agent pemilik file. */
  onRequestRevision?: (artifact: Artifact) => void
}

/**
 * Panel kanan: tab Chat + Workspace.
 * Menggabungkan percakapan streaming dengan penampil artefak ala Claude.
 */
export function ClaudeStyleChat({
  messages,
  agents,
  artifacts,
  activeArtifactId,
  task,
  onSelectArtifact,
  reviews,
  onRequestRevision,
}: ClaudeStyleChatProps) {
  const [tab, setTab] = React.useState('chat')
  const endRef = React.useRef<HTMLDivElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = React.useState(true)

  const byId = React.useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents])

  // Auto-scroll selama streaming, kecuali user sudah scroll ke atas.
  React.useEffect(() => {
    if (pinned) endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, pinned])

  const onScroll = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
  }, [])

  /** Buka deliverable yang dihasilkan pesan ini (bukan blok kode sembarang). */
  const openWorkspace = React.useCallback(
    (messageId: string) => {
      const source = messages.find((m) => m.id === messageId)
      // 1) Preferensi: file yang benar-benar dihasilkan pesan tsb.
      const own = source?.artifactIds
        ?.map((id) => artifacts.find((a) => a.id === id))
        .filter((a): a is Artifact => Boolean(a))[0]
      // 2) Fallback: file terbaru bila pesan tidak punya deliverable.
      const target = own ?? artifacts[artifacts.length - 1]
      if (target) onSelectArtifact(target.id)
      setTab('workspace')
    },
    [artifacts, messages, onSelectArtifact],
  )

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <TabsList>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="workspace">
            Workspace
            {artifacts.length > 0 && (
              <span className="ml-1 rounded-full bg-claude/20 px-1.5 text-[10px] tabular-nums text-claude">
                {artifacts.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <span className="text-[11px] text-muted-foreground">
          {messages.length} pesan
        </span>
      </div>

      {/* ------------------------------ CHAT ------------------------------ */}
      <TabsContent value="chat" className="min-h-0 flex-1 data-[state=inactive]:hidden">
        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-full">
              <EmptyState task={task} />
            </div>
          ) : (
            <div className="divide-y divide-border/40 px-2 py-2">
              {messages.map((m) => (
                <MessageRow
                  key={m.id}
                  message={m}
                  agent={byId.get(m.agentId)}
                  onOpenWorkspace={openWorkspace}
                />
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {!pinned && messages.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setPinned(true)
                endRef.current?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="pointer-events-auto rounded-full border border-border bg-popover px-3 py-1 text-[11px] shadow-lg transition-colors hover:bg-accent"
            >
              ↓ Kembali ke pesan terbaru
            </button>
          </div>
        )}
      </TabsContent>

      {/* --------------------------- WORKSPACE ---------------------------- */}
      <TabsContent value="workspace" className="min-h-0 flex-1 data-[state=inactive]:hidden">
        <ArtifactViewer
          artifacts={artifacts}
          activeId={activeArtifactId}
          onSelect={(id) => onSelectArtifact(id)}
          reviews={reviews}
          onRequestRevision={onRequestRevision}
        />
      </TabsContent>
    </Tabs>
  )
}