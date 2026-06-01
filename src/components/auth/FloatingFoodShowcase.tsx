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
import { ContactShadows, Environment } from '@react-three/drei'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

useGLTF.preload('/models/croissant.glb')

function prepareMesh(scene: THREE.Group): THREE.Group {
  const cloned = scene.clone(true)

  cloned.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh
      mesh.castShadow = true
      mesh.receiveShadow = true
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const mat of mats) {
        const m = mat as THREE.MeshStandardMaterial
        if (m.envMapIntensity !== undefined) m.envMapIntensity = 1.45
        if (m.roughness !== undefined) m.roughness = Math.min(m.roughness, 0.65)
        if (m.metalness !== undefined) m.metalness = Math.min(m.metalness, 0.06)
        m.needsUpdate = true
      }
    }
  })

  const box = new THREE.Box3().setFromObject(cloned)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  cloned.position.sub(center)
  cloned.scale.setScalar(1.82 / maxDim)
  cloned.rotation.set(0.05, -0.28, 0)

  return cloned
}

function CroissantModel({ onLoaded }: { onLoaded?: () => void }) {
  const { scene } = useGLTF('/models/croissant.glb') as { scene: THREE.Group }
  const groupRef = useRef<THREE.Group>(null)
  const mesh = useMemo(() => prepareMesh(scene), [scene])

  useEffect(() => { onLoaded?.() }, [onLoaded])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.getElapsedTime()
    groupRef.current.rotation.y += 0.004
    groupRef.current.position.y = Math.sin(t * 0.76) * 0.055
  })

  return (
    <group ref={groupRef}>
      <primitive object={mesh} />
    </group>
  )
}

class ModelErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() {}
  render() { return this.state.failed ? null : this.props.children }
}

export default function FloatingFoodShowcase() {
  const [loaded, setLoaded] = useState(false)
  const handleLoaded = useCallback(() => setLoaded(true), [])

  return (
    <div className="relative h-[220px] w-full select-none">
      {/* Centered spotlight glow — 280×280, 30% opacity emerald */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          width: 280,
          height: 280,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(29,158,117,0.30) 0%, rgba(16,185,129,0.10) 45%, transparent 70%)',
          filter: 'blur(18px)',
        }}
      />

      {/* Ground shadow */}
      <div className="pointer-events-none absolute bottom-3 left-1/3 right-1/3 h-4 rounded-full bg-black/40 blur-xl" />

      {/* Canvas — fades in when model is ready */}
      <div className={`absolute inset-0 transition-opacity duration-700 ${loaded ? 'opacity-100' : 'opacity-0'}`}>
        <Canvas
          className="h-full w-full"
          camera={{ position: [0, 0.12, 3.9], fov: 32 }}
          dpr={[1, 1.5]}
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0)
            gl.outputColorSpace = THREE.SRGBColorSpace
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = 1.16
          }}
        >
          <ambientLight intensity={1.65} />
          <directionalLight position={[3, 4.5, 5]} intensity={2.3} color="#fff4e4" />
          <pointLight position={[-2, 1.5, 2.5]} intensity={0.85} color="#6ee7b7" />
          <Environment preset="studio" />
          <ContactShadows
            position={[0, -0.93, 0]}
            opacity={0.22}
            scale={5}
            blur={2.2}
            far={1.4}
          />
          <ModelErrorBoundary>
            <Suspense fallback={null}>
              <CroissantModel onLoaded={handleLoaded} />
            </Suspense>
          </ModelErrorBoundary>
        </Canvas>
      </div>
    </div>
  )
}
