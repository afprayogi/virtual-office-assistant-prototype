'use client'

import * as React from 'react'

interface Props {
  children: React.ReactNode
  label?: string
}

interface State {
  error: Error | null
  info: string
}

/**
 * Error boundary untuk panel tertentu.
 *
 * Tanpa ini, satu exception saat render membuat seluruh halaman Navigasi Error
 * Next.js tanpa informasi apa pun. Boundary ini isolating masalahnya ke panel
 * yang bermasalah dan menampilkan detail yang bisa ditindaklanjuti.
 */
export class PanelErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null, info: '' }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Tetap catat ke console agar mudah ditelusuri di browser.
    console.error(`[${this.props.label ?? 'Panel'}]`, error, info.componentStack)
    this.setState({ info: (info.componentStack ?? '').slice(0, 600) })
  }

  render(): React.ReactNode {
    const { error, info } = this.state
    if (!error) return this.props.children

    return (
      <div className="m-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
        <p className="text-[13px] font-semibold text-destructive">
          Panel “{this.props.label ?? 'tidak dikenal'}” gagal dirender
        </p>
        <p className="mt-1 font-mono text-[11px] text-destructive/80">{error.message}</p>
        {info && (
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/20 p-2 font-mono text-[10px] text-muted-foreground">
            {info}
          </pre>
        )}
        <button
          type="button"
          onClick={() => this.setState({ error: null, info: '' })}
          className="mt-3 rounded-md border border-border px-2.5 py-1 text-[11px] transition-colors hover:bg-accent"
        >
          Coba render ulang
        </button>
      </div>
    )
  }
}