import DashboardLayout from './(dashboard)/layout'
import DashboardPage from './(dashboard)/dashboard/page'

export const dynamic = 'force-dynamic'

export default function Home() {
  return (
    <DashboardLayout>
      <DashboardPage />
    </DashboardLayout>
  )
}
