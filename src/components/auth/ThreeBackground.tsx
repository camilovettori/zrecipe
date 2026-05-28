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

const ITEM_COUNT   = 16
const FLOAT_FREQ   = 0.4   // sine float angular frequency
const FLOAT_AMP    = 0.6   // sine float amplitude (world units)
const CENTER_RAD   = 3.5   // radius of invisible card exclusion zone
const DRAG         = 0.96  // per-frame velocity damping
const MAX_VEL      = 0.06  // per-frame velocity cap
// World-space boundaries — models stay inside this box
const BND = { x: 12, y: 8, zMin: -6, zMax: 3 }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomPosition(): [number, number, number] {
  let x: number, y: number
  do {
    x = (Math.random() - 0.5) * 20   // –10 → 10
    y = (Math.random() - 0.5) * 12   // –6  → 6
  } while (Math.abs(x) < 3.5 && Math.abs(y) < 3.5)
  const z = Math.random() * 4 - 3    // –3  → 1
  return [x, y, z]
}

// ─── Per-item physics state (lives in useRef, never triggers re-render) ───────

interface ItemSim {
  pos:         THREE.Vector3  // drift position (float Y offset is applied at render time)
  vel:         THREE.Vector3  // drift velocity (world units / frame)
  rotSpeed:    THREE.Vector3  // rotation increment per frame (radians)
  floatOffset: number         // phase offset for the sine float
  radius:      number         // bounding-sphere radius used for collision
}

// ─── FoodItem — pure renderer, driven by parent refs ─────────────────────────

interface FoodItemProps {
  modelPath:       string
  displaySize:     number
  initialRotation: [number, number, number]
}

// forwardRef exposes the THREE.Group so Scene can drive position / rotation.
const FoodItem = forwardRef<THREE.Group, FoodItemProps>(function FoodItem(
  { modelPath, displaySize, initialRotation },
  ref
) {
  const { scene } = useGLTF(modelPath)

  const [cloned, normalizedScale] = useMemo(() => {
    const clone = scene.clone(true)
    const box   = new THREE.Box3().setFromObject(clone)
    const size  = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    return [clone, maxDim > 0 ? displaySize / maxDim : displaySize]
  }, [scene, displaySize])

  // No useFrame here — position/rotation are written directly to the group
  // from the parent Scene's single useFrame to enable collision detection.
  return (
    <group ref={ref} rotation={initialRotation} scale={normalizedScale}>
      <primitive object={cloned} />
    </group>
  )
})

// ─── Scene — owns all physics state and runs the simulation ──────────────────

function Scene() {
  // Item descriptors (stable for component lifetime)
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

  // One THREE.Group ref per item
  const groupRefs = useMemo(
    () => Array.from({ length: ITEM_COUNT }, () => createRef<THREE.Group>()),
    // ITEM_COUNT matches items.length — safe to omit items from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // Mutable simulation state — initialised lazily so Math.random() only runs once
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
      // Bounding-sphere radius ≈ half of longest model axis, slightly enlarged
      radius:      item.displaySize * 0.55,
    }))
  }

  // Reusable scratch vector — avoids per-frame heap allocation in the hot loop
  const scratch = useRef(new THREE.Vector3())

  useFrame(({ clock }) => {
    const t   = clock.getElapsedTime()
    const sim = simRef.current!
    const N   = sim.length

    // ── 1. Advance positions by velocity ──────────────────────────────────
    for (let i = 0; i < N; i++) {
      sim[i].pos.addScaledVector(sim[i].vel, 1)
    }

    // ── 2. Pairwise soft collision ─────────────────────────────────────────
    // Uses position-based correction (direct push) + a tiny velocity nudge.
    // No elastic bouncing — models gently drift away from each other.
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const diff    = scratch.current.subVectors(sim[i].pos, sim[j].pos)
        const dist    = diff.length()
        const minDist = sim[i].radius + sim[j].radius
        if (dist < minDist && dist > 0.001) {
          const overlap = minDist - dist
          diff.normalize()
          // Directly separate positions (half overlap each)
          const posFix = overlap * 0.15
          sim[i].pos.addScaledVector(diff,  posFix)
          sim[j].pos.addScaledVector(diff, -posFix)
          // Small velocity impulse so they keep separating after correction
          const velFix = overlap * 0.008
          sim[i].vel.addScaledVector(diff,  velFix)
          sim[j].vel.addScaledVector(diff, -velFix)
        }
      }
    }

    // ── 3. Centre-zone exclusion (login card area) ─────────────────────────
    for (let i = 0; i < N; i++) {
      const distFromCenter = sim[i].pos.length()
      const minDist        = CENTER_RAD + sim[i].radius
      if (distFromCenter < minDist && distFromCenter > 0.001) {
        const overlap = minDist - distFromCenter
        scratch.current.copy(sim[i].pos).normalize()
        sim[i].pos.addScaledVector(scratch.current,  overlap * 0.15)
        sim[i].vel.addScaledVector(scratch.current,  overlap * 0.008)
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

    // ── 6. Write results to Three.js groups ───────────────────────────────
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
