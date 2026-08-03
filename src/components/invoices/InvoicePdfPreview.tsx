'use client'

import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { FileWarning, Loader2 } from 'lucide-react'

type PdfViewport = { width: number; height: number }
type PdfRenderTask = { promise: Promise<void>; cancel: () => void }
type PdfPage = {
  getViewport: (options: { scale: number }) => PdfViewport
  render: (options: {
    canvasContext: CanvasRenderingContext2D
    viewport: PdfViewport
  }) => PdfRenderTask
}
type PdfDocument = {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfPage>
  destroy: () => Promise<void>
}

type Props = {
  file: File
  zoom: number
  onZoomChange: (zoom: number) => void
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 3

function clampZoom(value: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(value.toFixed(2))))
}

export default function InvoicePdfPreview({ file, zoom, onZoomChange }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([])
  const documentRef = useRef<PdfDocument | null>(null)
  const dragRef = useRef({ active: false, x: 0, y: 0, left: 0, top: 0 })
  const [pageCount, setPageCount] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const updateWidth = () => setContainerWidth(viewport.clientWidth)
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const data = await file.arrayBuffer()
        const document = await pdfjs.getDocument({ data }).promise as unknown as PdfDocument
        if (cancelled) {
          await document.destroy()
          return
        }
        documentRef.current = document
        canvasRefs.current = Array(document.numPages).fill(null)
        setPageCount(document.numPages)
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to preview this PDF')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
      const document = documentRef.current
      documentRef.current = null
      if (document) void document.destroy()
    }
  }, [file])

  useEffect(() => {
    const document = documentRef.current
    if (!document || pageCount === 0 || containerWidth === 0) return

    let cancelled = false
    const tasks: PdfRenderTask[] = []

    const renderPages = async () => {
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        if (cancelled) return
        const canvas = canvasRefs.current[pageNumber - 1]
        if (!canvas) continue

        const page = await document.getPage(pageNumber)
        const baseViewport = page.getViewport({ scale: 1 })
        const fitScale = Math.max(0.1, (containerWidth - 32) / baseViewport.width)
        const displayScale = fitScale * zoom
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
        const renderViewport = page.getViewport({ scale: displayScale * pixelRatio })
        const displayViewport = page.getViewport({ scale: displayScale })
        const context = canvas.getContext('2d')
        if (!context) continue

        canvas.width = Math.floor(renderViewport.width)
        canvas.height = Math.floor(renderViewport.height)
        canvas.style.width = `${Math.floor(displayViewport.width)}px`
        canvas.style.height = `${Math.floor(displayViewport.height)}px`

        const task = page.render({ canvasContext: context, viewport: renderViewport })
        tasks.push(task)
        try {
          await task.promise
        } catch (renderError) {
          if (!cancelled && !(renderError instanceof Error && renderError.name === 'RenderingCancelledException')) {
            setError('Unable to render this PDF preview')
          }
        }
      }
    }

    void renderPages()
    return () => {
      cancelled = true
      tasks.forEach((task) => task.cancel())
    }
  }, [containerWidth, pageCount, zoom])

  useEffect(() => {
    if (zoom === 1 && viewportRef.current) {
      viewportRef.current.scrollTo({ left: 0, top: 0, behavior: 'smooth' })
    }
  }, [zoom])

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const direction = event.deltaY > 0 ? -0.1 : 0.1
    onZoomChange(clampZoom(zoom + direction))
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !viewportRef.current) return
    const viewport = viewportRef.current
    dragRef.current = {
      active: true,
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    }
    viewport.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || !viewportRef.current) return
    viewportRef.current.scrollLeft = dragRef.current.left - (event.clientX - dragRef.current.x)
    viewportRef.current.scrollTop = dragRef.current.top - (event.clientY - dragRef.current.y)
  }

  const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    if (viewportRef.current?.hasPointerCapture(event.pointerId)) {
      viewportRef.current.releasePointerCapture(event.pointerId)
    }
    setDragging(false)
  }

  return (
    <div
      ref={viewportRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      className={dragging ? 'h-full w-full cursor-grabbing overflow-auto' : 'h-full w-full cursor-grab overflow-auto'}
      aria-label="Invoice PDF preview. Use the mouse wheel to zoom and drag to pan."
    >
      {loading && (
        <div className="flex h-full items-center justify-center text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Rendering invoice...
        </div>
      )}
      {error && (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center text-amber-700">
          <FileWarning className="mb-2 h-8 w-8" />
          <p className="text-sm font-medium">Preview unavailable</p>
          <p className="mt-1 text-xs text-slate-500">{error}</p>
        </div>
      )}
      {!error && pageCount > 0 && (
        <div className="flex w-max min-w-full flex-col items-center gap-4 p-4">
          {Array.from({ length: pageCount }, (_, index) => (
            <canvas
              key={index}
              ref={(canvas) => { canvasRefs.current[index] = canvas }}
              className="shrink-0 bg-white shadow-sm"
              aria-label={`Invoice page ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
