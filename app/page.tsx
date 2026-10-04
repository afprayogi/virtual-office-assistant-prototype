import OfficeDashboard from '@/components/OfficeDashboard'
import { PanelErrorBoundary } from '@/components/PanelErrorBoundary'

export default function Home() {
  return (
    <PanelErrorBoundary label="Dashboard">
      <OfficeDashboard />
    </PanelErrorBoundary>
  )
}