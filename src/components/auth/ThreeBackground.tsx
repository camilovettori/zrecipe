'use client'

import { Suspense, useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, OrbitControls, Environment } from '@react-three/drei'
import * as THREE from 'three'

// displaySize = target longest dimension in world units after bounding-box normalisation.
// The FoodItem component computes each model's actual extents at runtime and scales it
// to exactly this size, so it doesn't matter what unit/scale the GLB was exported at.
const MODELS = [
  { path: '/models/chocolate_donut.glb',        displaySize: 3.5 },
  { path: '/models/croissant.glb',              displaySize: 3.0 },
  { path: '/models/donut_2.0.glb',              displaySize: 3.5 },
  { path: '/models/egg_box.glb',                displaySize: 4.0 },
  { path: '/models/french_baguette.glb',        displaySize: 4.5 },
  { path: '/models/ham__cheese_sandwich.glb',   displaySize: 3.5 },
  { path: '/models/sugar_bag_scan_lowpoly.glb', displaySize: 3.0 },
  { path: '/models/3d_scanned_yeast_plait.glb', displaySize: 3.0 },
]

MODELS.forEach(({ path }) => useGLTF.preload(path))

// Returns a random position that avoids the centre ±3.5 units (login card area).
function randomPosition(): [number, number, number] {
  let x: number, y: number
  do {
    x = (Math.random() - 0.5) * 20   // –10 to 10
    y = (Math.random() - 0.5) * 12   // –6 to 6
  } while (Math.abs(x) < 3.5 && Math.abs(y) < 3.5)
  const z = Math.random() * 4 - 3    // –3 to 1
  return [x, y, z]
}

interface FoodItemProps {
  modelPath: string
  displaySize: number
  position: [number, number, number]
  initialRotation: [number, number, number]
  rotX: number
  rotY: number
  rotZ: number
  floatOffset: number
}

function FoodItem({
  modelPath,
  displaySize,
  position,
  initialRotation,
  rotX,
  rotY,
  rotZ,
  floatOffset,
}: FoodItemProps) {
  const { scene } = useGLTF(modelPath)

  // Clone the scene and compute a normalisation scale so the model's longest
  // axis equals exactly `displaySize` world units regardless of export scale.
  const [cloned, normalizedScale] = useMemo(() => {
    const clone = scene.clone(true)
    const box = new THREE.Box3().setFromObject(clone)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    return [clone, maxDim > 0 ? displaySize / maxDim : displaySize]
  }, [scene, displaySize])

  const ref = useRef<THREE.Group>(null)
  const baseY = position[1]

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime()
    ref.current.rotation.x += rotX
    ref.current.rotation.y += rotY
    ref.current.rotation.z += rotZ
    ref.current.position.y = baseY + Math.sin(t * 0.4 + floatOffset) * 0.6
  })

  return (
    <group ref={ref} position={position} rotation={initialRotation} scale={normalizedScale}>
      <primitive object={cloned} />
    </group>
  )
}

function Scene() {
  const items = useMemo(
    () =>
      // 16 items = every model appears exactly twice
      Array.from({ length: 16 }, (_, i) => {
        const model = MODELS[i % MODELS.length]
        const speed = 0.2 + Math.random() * 0.3
        return {
          id: i,
          modelPath: model.path,
          // ±20 % size variation per instance to add visual variety
          displaySize: model.displaySize * (0.8 + Math.random() * 0.4),
          position: randomPosition(),
          initialRotation: [
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
          ] as [number, number, number],
          rotX: (Math.random() - 0.5) * speed * 0.01,
          rotY: (Math.random() > 0.5 ? 1 : -1) * speed * 0.008,
          rotZ: (Math.random() - 0.5) * speed * 0.005,
          floatOffset: Math.random() * Math.PI * 2,
        }
      }),
    []
  )

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} />
      <Environment preset="city" />
      <Suspense fallback={null}>
        {items.map((item) => (
          <FoodItem key={item.id} {...item} />
        ))}
      </Suspense>
      <OrbitControls
        autoRotate
        autoRotateSpeed={0.3}
        enableZoom={false}
        enablePan={false}
        enableRotate={false}
      />
    </>
  )
}

export default function ThreeBackground() {
  return (
    <div className="fixed inset-0 z-0">
      <Canvas
        camera={{ position: [0, 0, 10], fov: 60 }}
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1a1025 50%, #0a1a0d 100%)',
        }}
      >
        <Scene />
      </Canvas>
    </div>
  )
}
