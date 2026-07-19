'use client'

import { useEffect, useState } from 'react'
import { Maximize2, X } from 'lucide-react'

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
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!expanded) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [expanded])

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setExpanded(true)
          }
        }}
        className="group relative aspect-video w-full cursor-pointer overflow-hidden rounded-xl bg-slate-100"
        aria-label="Expand product demo video"
      >
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
        <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-slate-950/45 text-white shadow-sm backdrop-blur transition-colors group-hover:bg-slate-950/65">
          <Maximize2 className="h-4 w-4" />
        </span>
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
          onClick={() => setExpanded(false)}
        >
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Close product demo video"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="w-full max-w-[80vw] overflow-hidden rounded-2xl bg-black shadow-2xl max-sm:max-w-full"
            onClick={(event) => event.stopPropagation()}
          >
            <video
              autoPlay
              controls
              playsInline
              preload="metadata"
              className="aspect-video h-auto w-full"
            >
              <source src="/videos/video1.webm" type="video/webm" />
              <source src="/videos/video1-compressed.mp4" type="video/mp4" />
            </video>
          </div>
        </div>
      )}
    </>
  )
}
