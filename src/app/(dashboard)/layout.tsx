import type { Metadata } from 'next'
import DashboardShell from './DashboardShell'

// Authenticated app pages must never be indexed — keep search engines
// out of every route under this layout.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>
}
