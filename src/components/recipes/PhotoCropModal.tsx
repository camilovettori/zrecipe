'use client'

import { useCallback, useState } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import { X, ZoomIn, ZoomOut } from 'lucide-react'

interface Props {
  file: File
  onCancel: () => void
  onSave: (croppedFile: File) => void
}

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<File> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.src = imageSrc
    img.onload = () => resolve(img)
    img.onerror = reject
  })
  const canvas = document.createElement('canvas')
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, pixelCrop.width, pixelCrop.height
  )
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error('Canvas empty')); return }
        resolve(new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.9
    )
  })
}

export default function PhotoCropModal({ file, onCancel, onSave }: Props) {
  const objectUrl = URL.createObjectURL(file)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [saving, setSaving] = useState(false)

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const handleSave = async () => {
    if (!croppedAreaPixels) return
    setSaving(true)
    try {
      const cropped = await getCroppedImg(objectUrl, croppedAreaPixels)
      URL.revokeObjectURL(objectUrl)
      onSave(cropped)
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-800">Crop photo</h2>
          <button
            type="button"
            onClick={() => { URL.revokeObjectURL(objectUrl); onCancel() }}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Cropper area */}
        <div className="relative h-72 bg-slate-900 sm:h-80">
          <Cropper
            image={objectUrl}
            crop={crop}
            zoom={zoom}
            aspect={4 / 3}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            showGrid={false}
            style={{ containerStyle: { borderRadius: 0 } }}
          />
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-3 px-5 py-3">
          <ZoomOut className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-emerald-600"
          />
          <ZoomIn className="h-4 w-4 shrink-0 text-slate-400" />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={() => { URL.revokeObjectURL(objectUrl); onCancel() }}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save photo'}
          </button>
        </div>
      </div>
    </div>
  )
}
