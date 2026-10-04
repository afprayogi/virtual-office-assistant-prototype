import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Virtual Office Multi-Agent Workspace',
  description:
    'Kantor virtual 2D dengan orkestrator multi-agent multi-model (ChatDev) bergaya Claude Desktop.',
}

export const viewport: Viewport = {
  themeColor: '#1F1E1D',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${inter.variable} ${mono.variable} dark`}>
      <body className="min-h-screen bg-background font-sans">{children}</body>
    </html>
  )
}