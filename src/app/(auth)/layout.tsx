import dynamic from 'next/dynamic'

// ssr:false keeps Three.js (WebGL) out of the server render entirely
const ThreeBackground = dynamic(
  () => import('@/components/auth/ThreeBackground'),
  { ssr: false }
)

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <ThreeBackground />
      <div className="page-fade-in relative z-10 flex min-h-screen items-center justify-center p-4">
        {children}
      </div>
    </div>
  )
}
