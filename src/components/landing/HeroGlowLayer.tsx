'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

// Same LCP discipline as before: the Three.js chunk is only requested once
// `mounted` flips true in an effect (i.e. after the first client paint),
// so the hero headline/CTAs never wait on it. Unlike the old food-object
// scene, this is cheap enough to keep on mobile too — no device gating.
const HeroGlow = dynamic(() => import('./HeroGlow'), { ssr: false })

export default function HeroGlowLayer() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <div className="pointer-events-none absolute inset-0 -z-10" style={{ filter: 'blur(64px)' }}>
      <HeroGlow />
    </div>
  )
}
