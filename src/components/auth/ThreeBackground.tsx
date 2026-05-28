'use client'

import { Suspense, useRef, useMemo, forwardRef, createRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, OrbitControls, Environment } from '@react-three/drei'
import * as THREE from 'three'

// ─── Model catalogue ──────────────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_COUNT  = 16
const FLOAT_FREQ  = 0.4
const FLOAT_AMP   = 0.6
const MIN_DIST    = 3.0   // fixed minimum separation between any two model centres
const CENTER_EXCL = 4.0   // login-card exclusion radius
const DRAG        = 0.96
const MAX_VEL     = 0.06
const BND = { x: 12, y: 8, zMin: -6, zMax: 3 }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomPosition(): [number, number, number] {
  let x: number, y: number
  do {
    x = (Math.random() - 0.5) * 20
    y = (Math.random() - 0.5) * 12
  } while (Math.sqrt(x * x + y * y) < CENTER_EXCL + 1)
  const z = Math.random() * 4 - 3
  return [x, y, z]
}

// ─── Per-item physics state ───────────────────────────────────────────────────

interface ItemSim {
  pos:         THREE.Vector3
  vel:         THREE.Vector3
  rotSpeed:    THREE.Vector3
  floatOffset: number
}

// ─── FoodItem — pure renderer, driven by parent refs ─────────────────────────

interface FoodItemProps {
  modelPath:       string
  displaySize:     number
  initialRotation: [number, number, number]
}

const FoodItem = forwardRef<THREE.Group, FoodItemProps>(function FoodItem(
  { modelPath, displaySize, initialRotation },
  ref
) {
  const { scene } = useGLTF(modelPath)

  const [cloned, normalizedScale] = useMemo(() => {
    const clone  = scene.clone(true)
    const box    = new THREE.Box3().setFromObject(clone)
    const size   = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    return [clone, maxDim > 0 ? displaySize / maxDim : displaySize]
  }, [scene, displaySize])

  return (
    <group ref={ref} rotation={initialRotation} scale={normalizedScale}>
      <primitive object={cloned} />
    </group>
  )
})

// ─── Scene — owns all physics state and runs the simulation ──────────────────

function Scene() {
  const items = useMemo(
    () =>
      Array.from({ length: ITEM_COUNT }, (_, i) => {
        const model = MODELS[i % MODELS.length]
        const speed = 0.2 + Math.random() * 0.3
        return {
          id:              i,
          modelPath:       model.path,
          displaySize:     model.displaySize * (0.8 + Math.random() * 0.4),
          position:        randomPosition(),
          initialRotation: [
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
          ] as [number, number, number],
          rotX:        (Math.random() - 0.5) * speed * 0.01,
          rotY:        (Math.random() > 0.5 ? 1 : -1) * speed * 0.008,
          rotZ:        (Math.random() - 0.5) * speed * 0.005,
          floatOffset: Math.random() * Math.PI * 2,
        }
      }),
    []
  )

  // One THREE.Group ref per item — all owned here, not per-child
  const groupRefs = useMemo(
    () => Array.from({ length: ITEM_COUNT }, () => createRef<THREE.Group>()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // Mutable simulation state — lazily initialised once
  const simRef = useRef<ItemSim[] | null>(null)
  if (simRef.current === null) {
    simRef.current = items.map(item => ({
      pos:         new THREE.Vector3(...item.position),
      vel:         new THREE.Vector3(
                     (Math.random() - 0.5) * 0.004,
                     (Math.random() - 0.5) * 0.002,
                     (Math.random() - 0.5) * 0.002,
                   ),
      rotSpeed:    new THREE.Vector3(item.rotX, item.rotY, item.rotZ),
      floatOffset: item.floatOffset,
    }))
  }

  // Scratch vector — avoids heap allocation in the hot loop
  const scratch = useRef(new THREE.Vector3())

  useFrame(({ clock }) => {
    const t   = clock.getElapsedTime()
    const sim = simRef.current!
    const N   = sim.length

    // ── 1. Advance positions ───────────────────────────────────────────────
    for (let i = 0; i < N; i++) {
      sim[i].pos.addScaledVector(sim[i].vel, 1)
    }

    // ── 2. Pairwise collision — 50% correction per frame ──────────────────
    // Direct positional push resolves overlap in ~2 frames.
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        scratch.current.subVectors(sim[j].pos, sim[i].pos)
        const dist = scratch.current.length()
        if (dist < MIN_DIST && dist > 0.001) {
          const overlap = MIN_DIST - dist
          scratch.current.normalize()
          const push = overlap * 0.5
          sim[i].pos.addScaledVector(scratch.current, -push)
          sim[j].pos.addScaledVector(scratch.current,  push)
          // Velocity nudge prevents models drifting back into contact
          const velPush = overlap * 0.012
          sim[i].vel.addScaledVector(scratch.current, -velPush)
          sim[j].vel.addScaledVector(scratch.current,  velPush)
        }
      }
    }

    // ── 3. Centre exclusion — snap instantly to exclusion boundary ─────────
    for (let i = 0; i < N; i++) {
      const px = sim[i].pos.x
      const py = sim[i].pos.y
      const distFromCenter = Math.sqrt(px * px + py * py)
      if (distFromCenter < CENTER_EXCL && distFromCenter > 0.001) {
        // Scale position directly to the boundary (full correction, one frame)
        const scale = CENTER_EXCL / distFromCenter
        sim[i].pos.x = px * scale
        sim[i].pos.y = py * scale
        // Reflect any inward velocity component outward
        scratch.current.set(px, py, 0).normalize()
        const dot = sim[i].vel.dot(scratch.current)
        if (dot < 0) {
          sim[i].vel.addScaledVector(scratch.current, -dot * 1.6)
        }
      }
    }

    // ── 4. Boundary clamping ───────────────────────────────────────────────
    for (let i = 0; i < N; i++) {
      const p = sim[i].pos
      const v = sim[i].vel
      if (p.x >  BND.x)    { p.x =  BND.x;    if (v.x > 0) v.x *= -0.6 }
      if (p.x < -BND.x)    { p.x = -BND.x;    if (v.x < 0) v.x *= -0.6 }
      if (p.y >  BND.y)    { p.y =  BND.y;     if (v.y > 0) v.y *= -0.6 }
      if (p.y < -BND.y)    { p.y = -BND.y;     if (v.y < 0) v.y *= -0.6 }
      if (p.z >  BND.zMax) { p.z =  BND.zMax;  if (v.z > 0) v.z *= -0.6 }
      if (p.z <  BND.zMin) { p.z =  BND.zMin;  if (v.z < 0) v.z *= -0.6 }
    }

    // ── 5. Drag + velocity cap ─────────────────────────────────────────────
    for (let i = 0; i < N; i++) {
      sim[i].vel.multiplyScalar(DRAG)
      if (sim[i].vel.lengthSq() > MAX_VEL * MAX_VEL) {
        sim[i].vel.normalize().multiplyScalar(MAX_VEL)
      }
    }

    // ── 6. Write positions + rotations to THREE.Group refs ────────────────
    for (let i = 0; i < N; i++) {
      const group = groupRefs[i].current
      if (!group) continue
      const s      = sim[i]
      const floatY = Math.sin(t * FLOAT_FREQ + s.floatOffset) * FLOAT_AMP
      group.position.set(s.pos.x, s.pos.y + floatY, s.pos.z)
      group.rotation.x += s.rotSpeed.x
      group.rotation.y += s.rotSpeed.y
      group.rotation.z += s.rotSpeed.z
    }
  })

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} />
      <Environment preset="city" />
      <Suspense fallback={null}>
        {items.map((item, i) => (
          <FoodItem
            key={item.id}
            ref={groupRefs[i]}
            modelPath={item.modelPath}
            displaySize={item.displaySize}
            initialRotation={item.initialRotation}
          />
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

// ─── Canvas wrapper ───────────────────────────────────────────────────────────

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
