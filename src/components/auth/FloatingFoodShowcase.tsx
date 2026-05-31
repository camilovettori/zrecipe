'use client'

import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Environment, Float, useGLTF } from '@react-three/drei'
import * as THREE from 'three'

const PRIMARY_MODEL = '/models/croissant.glb'
const SECONDARY_MODEL = '/models/chocolate_donut.glb'
const ALLOWED_PRIMARY_MODELS = new Set([PRIMARY_MODEL, '/models/french_baguette.glb', '/models/donut_2.0.glb'])

;[PRIMARY_MODEL, SECONDARY_MODEL].forEach((path) => {
  useGLTF.preload(path)
})

function tuneMaterial(material: THREE.Material) {
  const tuned = material as THREE.Material & {
    envMapIntensity?: number
    roughness?: number
    metalness?: number
  }

  tuned.needsUpdate = true

  if (typeof tuned.envMapIntensity === 'number') {
    tuned.envMapIntensity = 1.55
  }

  if (typeof tuned.roughness === 'number') {
    tuned.roughness = Math.min(tuned.roughness, 0.68)
  }

  if (typeof tuned.metalness === 'number') {
    tuned.metalness = Math.min(tuned.metalness, 0.08)
  }
}

function prepareScene(scene: THREE.Group, scaleTarget: number, yaw: number, pitch = 0.02) {
  const cloned = scene.clone(true)

  cloned.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh
      mesh.castShadow = true
      mesh.receiveShadow = true

      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(tuneMaterial)
      } else if (mesh.material) {
        tuneMaterial(mesh.material)
      }
    }
  })

  const box = new THREE.Box3().setFromObject(cloned)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1

  cloned.position.sub(center)
  cloned.scale.setScalar(scaleTarget / maxDim)
  cloned.rotation.set(pitch, yaw, 0)

  return cloned
}

function FoodObject({
  path,
  scaleTarget,
  yaw,
  pitch,
  onLoaded,
}: {
  path: string
  scaleTarget: number
  yaw: number
  pitch?: number
  onLoaded?: () => void
}) {
  const { scene } = useGLTF(path) as { scene: THREE.Group }
  const preparedScene = useMemo(
    () => prepareScene(scene, scaleTarget, yaw, pitch),
    [pitch, scaleTarget, scene, yaw]
  )

  useEffect(() => {
    onLoaded?.()
  }, [onLoaded])

  return <primitive object={preparedScene} />
}

class ModelErrorBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch() {
    this.props.onError()
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

function FloatingObject({
  path,
  position,
  scaleTarget,
  yaw,
  pitch,
  floatIntensity,
  floatSpeed,
  rotationSpeed,
  onLoaded,
}: {
  path: string
  position: [number, number, number]
  scaleTarget: number
  yaw: number
  pitch?: number
  floatIntensity: number
  floatSpeed: number
  rotationSpeed: number
  onLoaded?: () => void
}) {
  const [hasFailed, setHasFailed] = useState(false)
  const groupRef = useRef<THREE.Group | null>(null)
  const loadedOnce = useRef(false)

  const handleLoaded = useCallback(() => {
    if (!loadedOnce.current) {
      loadedOnce.current = true
      onLoaded?.()
    }
  }, [onLoaded])

  const handleError = useCallback(() => {
    setHasFailed(true)
  }, [])

  useFrame(({ clock }) => {
    if (!groupRef.current) return

    const elapsed = clock.getElapsedTime()
    groupRef.current.rotation.y += rotationSpeed
    groupRef.current.position.y = position[1] + Math.sin(elapsed * floatSpeed) * floatIntensity
  })

  return (
    <Float speed={0.55} rotationIntensity={0.1} floatIntensity={0.2}>
      <group ref={groupRef} position={position}>
        {!hasFailed && (
          <ModelErrorBoundary key={path} onError={handleError}>
            <Suspense fallback={null}>
              <FoodObject
                path={path}
                scaleTarget={scaleTarget}
                yaw={yaw}
                pitch={pitch}
                onLoaded={handleLoaded}
              />
            </Suspense>
          </ModelErrorBoundary>
        )}
      </group>
    </Float>
  )
}

interface FloatingFoodShowcaseProps {
  modelPath?: string
}

export default function FloatingFoodShowcase({
  modelPath = PRIMARY_MODEL,
}: FloatingFoodShowcaseProps) {
  const [hasLoadedModel, setHasLoadedModel] = useState(false)

  const primaryModel = useMemo(
    () => (ALLOWED_PRIMARY_MODELS.has(modelPath) ? modelPath : PRIMARY_MODEL),
    [modelPath]
  )

  const handleLoaded = useCallback(() => {
    setHasLoadedModel(true)
  }, [])

  return (
    <div className="relative mt-5 hidden h-[300px] max-w-[540px] lg:block">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[300px] rounded-full bg-[radial-gradient(circle_at_45%_45%,rgba(16,185,129,0.30),rgba(20,184,166,0.13)_38%,transparent_70%)] blur-3xl" />
      <div className="pointer-events-none absolute bottom-9 left-10 right-14 h-px bg-gradient-to-r from-transparent via-emerald-100/24 to-transparent" />
      <div className="pointer-events-none absolute bottom-3 left-14 right-20 h-16 rounded-[999px] bg-black/30 blur-2xl" />

      <div
        className={`absolute inset-0 transition-opacity duration-700 ${
          hasLoadedModel ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <Canvas
          className="h-full w-full"
          camera={{ position: [0, 0.25, 4.1], fov: 32 }}
          dpr={[1, 1.6]}
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0)
            gl.outputColorSpace = THREE.SRGBColorSpace
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = 1.18
          }}
        >
          <ambientLight intensity={1.72} />
          <directionalLight position={[3.5, 4.2, 5]} intensity={2.45} color="#fff4e4" />
          <pointLight position={[-2.5, 1.6, 2.2]} intensity={0.95} color="#6ee7b7" />
          <Environment preset="studio" />
          <ContactShadows
            position={[0, -1.18, 0]}
            opacity={0.28}
            scale={7}
            blur={2.6}
            far={2.2}
          />

          <Suspense fallback={null}>
            <FloatingObject
              path={primaryModel}
              position={[-0.46, -0.06, 0.2]}
              scaleTarget={2.75}
              yaw={-0.32}
              pitch={0.04}
              floatIntensity={0.035}
              floatSpeed={0.82}
              rotationSpeed={0.0009}
              onLoaded={handleLoaded}
            />
            <FloatingObject
              path={SECONDARY_MODEL}
              position={[0.96, 0.46, -0.62]}
              scaleTarget={1.28}
              yaw={0.58}
              pitch={0.08}
              floatIntensity={0.045}
              floatSpeed={0.9}
              rotationSpeed={0.00075}
              onLoaded={handleLoaded}
            />
          </Suspense>
        </Canvas>
      </div>

      {!hasLoadedModel && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_58%)]" />
      )}
    </div>
  )
}
