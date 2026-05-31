'use client'

import { useEffect, useRef, useState } from 'react'

interface AuthHeroModelProps {
  modelPath: string
}

type OrbitControlsInstance = {
  update: () => void
  dispose: () => void
  enablePan: boolean
  enableZoom: boolean
  enableDamping: boolean
  dampingFactor: number
  autoRotate: boolean
  autoRotateSpeed: number
}

export default function AuthHeroModel({ modelPath }: AuthHeroModelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let animationFrame = 0
    let resizeObserver: ResizeObserver | null = null
    let controls: OrbitControlsInstance | null = null

    if (typeof window === 'undefined' || !window.matchMedia('(min-width: 1024px)').matches) {
      return
    }

    const boot = async () => {
      const THREE = await import('three')
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')

      if (cancelled) return

      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
      camera.position.set(0, 0.25, 6.5)

      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
      })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setClearColor(0x000000, 0)

      const ambient = new THREE.AmbientLight(0xffffff, 1.8)
      const key = new THREE.DirectionalLight(0xffffff, 2.8)
      key.position.set(3, 4, 5)
      scene.add(ambient, key)

      const loader = new GLTFLoader()
      const modelGroup = new THREE.Group()
      scene.add(modelGroup)

      let modelReady = false

      loader.load(
        modelPath,
        (gltf) => {
          if (cancelled) return
          const model = gltf.scene
          const box = new THREE.Box3().setFromObject(model)
          const size = box.getSize(new THREE.Vector3())
          const maxDim = Math.max(size.x, size.y, size.z) || 1
          const scale = 2.6 / maxDim
          model.scale.setScalar(scale)
          const centeredBox = new THREE.Box3().setFromObject(model)
          const center = centeredBox.getCenter(new THREE.Vector3())
          model.position.sub(center)
          modelGroup.add(model)
          modelReady = true
          setReady(true)
        },
        undefined,
        () => {
          if (!cancelled) setReady(false)
        }
      )

      const resize = () => {
        const { width, height } = container.getBoundingClientRect()
        renderer.setSize(width, height, false)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
      }

      resize()
      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(container)

      controls = new OrbitControls(camera, renderer.domElement)
      controls.enablePan = false
      controls.enableZoom = false
      controls.enableDamping = true
      controls.dampingFactor = 0.06
      controls.autoRotate = true
      controls.autoRotateSpeed = 0.5

      const clock = new THREE.Clock()

      const animate = () => {
        animationFrame = window.requestAnimationFrame(animate)
        const elapsed = clock.getElapsedTime()
        modelGroup.position.y = Math.sin(elapsed * 1.1) * 0.02
        modelGroup.rotation.y += 0.005
        if (modelReady) {
          controls?.update()
          renderer.render(scene, camera)
        }
      }

      animate()

      return () => {
        renderer.dispose()
      }
    }

    void boot()

    return () => {
      cancelled = true
      window.cancelAnimationFrame(animationFrame)
      controls?.dispose()
      resizeObserver?.disconnect()
    }
  }, [modelPath])

  return (
    <div className="hidden lg:block">
      <div
        ref={containerRef}
        className={`relative mx-auto mt-10 h-[250px] w-full max-w-[250px] transition-opacity duration-500 ${
          ready ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="absolute inset-0 rounded-[28px] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_55%)]" />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      </div>
      {!ready && <div className="mx-auto mt-10 h-[250px] w-full max-w-[250px]" />}
    </div>
  )
}
