/**
 * components/OfficeDashboard.tsx
 * ---------------------------------------------------------------------------
 * Komponen root dashboard yang merangkai seluruh panel:
 *
 *   ┌──────────┬────────────────────────┬──────────────────┐
 *   │ Sidebar  │  Virtual Office Canvas  │  Claude Chat /   │
 *   │ Roster   │  (kantor 2D)            │  Workspace       │
 *   ├──────────┴────────────────────────┴──────────────────┤
 *   │  WorkflowBar (fase + brief + kontrol)  │   Terminal   │
 *   └──────────────────────────────────────────────────────┘
 * ---------------------------------------------------------------------------
 */
'use client'

import * as React from 'react'
import { Building2, PanelBottomClose, PanelBottomOpen, Route, Sparkles } from 'lucide-react'
import type { RoutingStrategy } from '@/config/routing'
import type { Artifact } from '@/types/agent'
import { TASKS } from '@/lib/orchestrator/taskRegistry'
import { notify } from '@/lib/toastStore'
import { ClaudeStyleChat } from '@/components/chat/ClaudeStyleChat'
import { VirtualOfficeCanvas } from '@/components/office/VirtualOfficeCanvas'
import { AgentRoster } from '@/components/panels/AgentRoster'
import { HitlPrompt } from '@/components/panels/HitlPrompt'
import { TerminalLog } from '@/components/panels/TerminalLog'
import { WorkflowBar } from '@/components/panels/WorkflowBar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/toast'
import { useOfficeSocket } from '@/lib/useOfficeSocket'
import { useOfficeStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function OfficeDashboard() {
  const socket = useOfficeSocket()

  // Status gateway OmniRoute: probe sekali saat mount, lalu refresh manual.
  const [gateway, setGateway] = React.useState<{
    reachable: boolean
    baseUrl: string
    compression: string
    combo: string
  } | null>(null)

  const probeGateway = React.useCallback(async () => {
    try {
      const res = await fetch('/api/health')
      const json = (await res.json()) as { gateway: typeof gateway }
      setGateway(json.gateway)
    } catch {
      setGateway(null)
    }
  }, [])

  React.useEffect(() => {
    void probeGateway()
    const timer = window.setInterval(() => void probeGateway(), 15000)
    return () => window.clearInterval(timer)
  }, [probeGateway])

  /**
   * Minta agent merevisi file yang user pilih.
   *
   * TaskId diambil dari hasil pengecekan (`reviews`) karena `Artifact` tidak
   * menyimpannya sendiri. Kalau file belum pernah dicek, cari lewat judul
   * task di registry.
   */
  const requestRevision = React.useCallback(
    (artifact: Artifact) => {
      const review = useOfficeStore.getState().reviews[artifact.path]
      const taskId = review?.taskId ?? TASKS.find((t) => t.title === artifact.taskTitle)?.id
      if (!taskId) {
        notify.warn('⚠️', 'Tidak bisa menemukan task', artifact.path)
        return
      }
      const note =
        window.prompt(
          `Apa yang perlu diperbaiki di "${artifact.path}"?\n\n` +
            `Catatanmu akan dikirim ke ${artifact.agentName} untuk direvisi.`,
          review?.verdict === 'perlu-revisi' ? review.summary : '',
        ) ?? ''
      socket.requestRevision(artifact.agentId, taskId, note || 'Perbaiki agar lebih lengkap dan sesuai criteria.')
    },
    [socket],
  )

  const agents = useOfficeStore((s) => s.agents)
  const messages = useOfficeStore((s) => s.messages)
  const artifacts = useOfficeStore((s) => s.artifacts)
  const logs = useOfficeStore((s) => s.logs)
  const task = useOfficeStore((s) => s.task)
  const phase = useOfficeStore((s) => s.phase)
  const status = useOfficeStore((s) => s.status)
  const hitlEnabled = useOfficeStore((s) => s.hitlEnabled)
  const pendingHitl = useOfficeStore((s) => s.pendingHitl)
  const selectedAgentId = useOfficeStore((s) => s.selectedAgentId)
  const activeArtifactId = useOfficeStore((s) => s.activeArtifactId)
  const bubbles = useOfficeStore((s) => s.bubbles)
  const finishedAt = useOfficeStore((s) => s.finishedAt)
  const celebratedAt = useOfficeStore((s) => s.celebratedAt)
const reviews = useOfficeStore((s) => s.reviews)

  const setTask = useOfficeStore((s) => s.setTask)
  const setHitlEnabled = useOfficeStore((s) => s.setHitlEnabled)
  const selectAgent = useOfficeStore((s) => s.selectAgent)
  const setActiveArtifact = useOfficeStore((s) => s.setActiveArtifact)
  const updateAgentModel = useOfficeStore((s) => s.updateAgentModel)
  const reset = useOfficeStore((s) => s.reset)

  const [bottomOpen, setBottomOpen] = React.useState(true)

  /* ------------------------------- handlers ------------------------------ */

  const handleStart = React.useCallback(() => {
    const brief = task.trim()
    if (!brief) return
    reset()
    socket.start(brief, agents, hitlEnabled)
  }, [task, agents, hitlEnabled, socket, reset])

  const handleRouting = React.useCallback(
    (agentId: string, strategy: RoutingStrategy, modelId: string) => {
      updateAgentModel(agentId, { strategy, modelId })
    },
    [updateAgentModel],
  )

  // Sinkronkan roster ke server setiap konfigurasi routing berubah.
  const modelSignature = agents.map((a) => `${a.id}:${a.model.strategy}:${a.model.modelId}`).join('|')
  React.useEffect(() => {
    if (socket.connected) socket.updateAgents(agents)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelSignature, socket.connected])

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? agents[0]

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Notifikasi selesai / hasil kerja / permintaan persetujuan. */}
      <Toaster />

      {/* ------------------------------ header ------------------------------ */}
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-claude/15">
          <Sparkles className="h-4 w-4 text-claude" />
        </div>
        <div>
          <h1 className="text-[14px] font-semibold leading-tight">Virtual Office</h1>
          <p className="text-[10.5px] leading-tight text-muted-foreground">
            Multi-Agent Workspace · ChatDev workflow
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Status gateway OmniRoute */}
          <button
            type="button"
            onClick={() => void probeGateway()}
            title={gateway ? `${gateway.baseUrl} · compress=${gateway.compression} · combo=${gateway.combo}` : 'Memeriksa gateway…'}
            className="rounded-md px-1 transition-opacity hover:opacity-80"
          >
            <Badge variant={gateway?.reachable ? 'success' : gateway ? 'warn' : 'muted'} className="gap-1 text-[10px]">
              <Route className="h-3 w-3" />
              {gateway === null
                ? 'OmniRoute…'
                : gateway.reachable
                  ? `OmniRoute · ${gateway.compression}`
                  : 'OmniRoute offline → simulasi'}
            </Badge>
          </button>
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Building2 className="h-3 w-3" />
            {agents.length} agent aktif
          </Badge>
          <Badge variant={socket.connected ? 'success' : 'warn'} className="text-[10px]">
            {socket.connected ? 'Terhubung' : 'Terputus'}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setBottomOpen((v) => !v)}
            title={bottomOpen ? 'Sembunyikan panel bawah' : 'Tampilkan panel bawah'}
          >
            {bottomOpen ? <PanelBottomClose className="h-4 w-4" /> : <PanelBottomOpen className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {/* ------------------------------- main ------------------------------- */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar kiri */}
        <aside className="w-72 shrink-0 border-r border-border">
          <AgentRoster
            agents={agents}
            selectedAgentId={selectedAgentId}
            onSelectAgent={selectAgent}
            onChangeRouting={handleRouting}
          />
        </aside>

        {/* Panel tengah: kantor virtual */}
        <main className="flex min-w-0 flex-1 flex-col overflow-auto p-3">
          <VirtualOfficeCanvas
            agents={agents}
            bubbles={bubbles}
            finishedAt={finishedAt}
            celebratedAt={celebratedAt}
            selectedAgentId={selectedAgentId}
            onSelectAgent={selectAgent}
            className="mx-auto max-w-full"
          />

          {/* Kartu detail agent terpilih */}
          {selectedAgent && (
            <div className="mx-auto mt-3 flex w-full max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-4 py-3">
              <span className="text-base" aria-hidden>{selectedAgent.avatar}</span>
              <div>
                <p className="text-[12.5px] font-semibold">{selectedAgent.name}</p>
                <p className="text-[10.5px] text-muted-foreground">{selectedAgent.role}</p>
              </div>
              <Stat label="Routing" value={selectedAgent.model.strategy} />
              <Stat
                label="Model terpakai"
                value={selectedAgent.telemetry?.model ?? (selectedAgent.model.strategy === 'pinned' ? selectedAgent.model.modelId : 'auto')}
              />
              <Stat label="Latency" value={`${selectedAgent.telemetry?.latencyMs ?? 0} ms`} />
              {selectedAgent.telemetry?.tokensSaved ? (
                <Stat label="Token dihemat" value={`~${selectedAgent.telemetry.tokensSaved}`} />
              ) : null}
              <Stat label="Requests" value={String(selectedAgent.usage.requests)} />
              <Stat label="Prompt tokens" value={String(selectedAgent.usage.prompt)} />
              <Stat label="Completion tokens" value={String(selectedAgent.usage.completion)} />
              <Stat label="Status" value={selectedAgent.status} />
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() => socket.nudge(selectedAgent.id)}
              >
                Minta respon
              </Button>
            </div>
          )}
        </main>

        {/* Panel kanan: chat + workspace */}
        <aside className="relative w-[420px] shrink-0 border-l border-border">
          <ClaudeStyleChat
            messages={messages}
            agents={agents}
            artifacts={artifacts}
            activeArtifactId={activeArtifactId}
            task={task}
            onSelectArtifact={setActiveArtifact}
            reviews={reviews}
            onRequestRevision={requestRevision}
          />
        </aside>
      </div>

      {/* ------------------------------ bottom ------------------------------ */}
      <div
        className={cn(
          'grid shrink-0 border-t border-border transition-[grid-template-rows] duration-200',
          bottomOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="grid h-[210px] grid-cols-1 lg:grid-cols-[1fr_400px]">
            <div className="min-w-0 border-r border-border">
              <WorkflowBar
                task={task}
                phase={phase}
                status={status}
                hitlEnabled={hitlEnabled}
                connected={socket.connected}
                pdfCount={artifacts.filter((a) => a.kind === 'pdf').length}
                codeCount={artifacts.filter((a) => a.kind === 'code' || a.kind === 'html').length}
                onTaskChange={setTask}
                onStart={handleStart}
                onInterrupt={socket.interrupt}
                onReset={reset}
                onHitlToggle={setHitlEnabled}
              />
            </div>
            <div className="min-w-0">
              <TerminalLog logs={logs} onClear={() => useOfficeStore.setState({ logs: [] })} />
            </div>
          </div>
        </div>
      </div>

      <HitlPrompt request={pendingHitl} onRespond={socket.respondHitl} />
    </div>
  )
}

/** Label + nilai kecil untuk kartu statistik agent. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-[11px]">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-mono text-foreground">{value}</p>
    </div>
  )
}

export default OfficeDashboard