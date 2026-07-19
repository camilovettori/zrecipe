'use client'

import { useEffect, useState } from 'react'

// The <video> tag itself is only mounted after the first client paint
// (same "mounted" gate used for the old Three.js hero scene) so the file
// is never part of the server-rendered HTML or an eager fetch during the
// critical rendering path. The wrapper reserves a fixed 16:9 box the
// whole time so nothing shifts when the video pops in.
//
// video1.webm (VP9, ~2.4MB) is offered first, video1-compressed.mp4
// (H.264, ~2.0MB) as the fallback for browsers without VP9 support —
// both are re-encodes of the original 20MB video1.mp4.
export default function HeroDemoVideo() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-100">
      {mounted && (
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          className="h-full w-full rounded-xl object-cover"
        >
          <source src="/videos/video1.webm" type="video/webm" />
          <source src="/videos/video1-compressed.mp4" type="video/mp4" />
        </video>
      )}
    </div>
  )
}
