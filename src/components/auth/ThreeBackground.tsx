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
const MIN_DIST    = 3.0   // minimum visual separation between any two model centres
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

// ─── Per-item simulation state ────────────────────────────────────────────────

interface ItemSim {
  basePos:     THREE.Vector3  // XYZ without the float-Y sine — used for velocity integration
  vel:         THREE.Vector3
  rotSpeed:    THREE.Vector3
  floatOffset: number
}

// ─── FoodItem — pure renderer ─────────────────────────────────────────────────

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

// ─── Scene — all physics state lives here, single useFrame ───────────────────

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

  // One THREE.Group ref per item — all owned here
  const groupRefs = useMemo(
    () => Array.from({ length: ITEM_COUNT }, () => createRef<THREE.Group>()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // Mutable simulation state — lazily initialised once
  const simRef = useRef<ItemSim[] | null>(null)
  if (simRef.current === null) {
    simRef.current = items.map(item => ({
      basePos:     new THREE.Vector3(...item.position),
      vel:         new THREE.Vector3(
                     (Math.random() - 0.5) * 0.004,
                     (Math.random() - 0.5) * 0.002,
                     (Math.random() - 0.5) * 0.002,
                   ),
      rotSpeed:    new THREE.Vector3(item.rotX, item.rotY, item.rotZ),
      floatOffset: item.floatOffset,
    }))
  }

  const scratch = useRef(new THREE.Vector3())

  useFrame(({ clock }) => {
    const t   = clock.getElapsedTime()
    const sim = simRef.current!
    const N   = sim.length

    // ── 1. Advance base positions by velocity ─────────────────────────────
    for (let i = 0; i < N; i++) {
      sim[i].basePos.addScaledVector(sim[i].vel, 1)
      sim[i].vel.multiplyScalar(DRAG)
      if (sim[i].vel.lengthSq() > MAX_VEL * MAX_VEL) {
        sim[i].vel.normalize().multiplyScalar(MAX_VEL)
      }
    }

    // ── 2. Write visual positions (basePos + floatY) to group refs ────────
    // Collision runs on these visual positions in steps 3–4.
    for (let i = 0; i < N; i++) {
      const group = groupRefs[i].current
      if (!group) continue
      const floatY = Math.sin(t * FLOAT_FREQ + sim[i].floatOffset) * FLOAT_AMP
      group.position.set(sim[i].basePos.x, sim[i].basePos.y + floatY, sim[i].basePos.z)
      group.rotation.x += sim[i].rotSpeed.x
      group.rotation.y += sim[i].rotSpeed.y
      group.rotation.z += sim[i].rotSpeed.z
    }

    // ── 3. Pairwise collision on actual visual positions ───────────────────
    // Checking group.position catches overlaps caused by the float Y offset
    // that sim.basePos comparisons would miss.
    for (let i = 0; i < N; i++) {
      const gi = groupRefs[i].current
      if (!gi) continue
      for (let j = i + 1; j < N; j++) {
        const gj = groupRefs[j].current
        if (!gj) continue
        const dist = gi.position.distanceTo(gj.position)
        if (dist < MIN_DIST && dist > 0.001) {
          const overlap = MIN_DIST - dist
          // Direction from i → j
          scratch.current.subVectors(gj.position, gi.position).normalize()
          const push = overlap * 0.5
          gi.position.addScaledVector(scratch.current, -push)
          gj.position.addScaledVector(scratch.current,  push)
          // Velocity nudge prevents models drifting back together
          const velPush = overlap * 0.012
          sim[i].vel.addScaledVector(scratch.current, -velPush)
          sim[j].vel.addScaledVector(scratch.current,  velPush)
        }
      }
    }

    // ── 4. Centre exclusion + boundary clamping on visual positions ────────
    for (let i = 0; i < N; i++) {
      const group = groupRefs[i].current
      if (!group) continue
      const p = group.position
      const v = sim[i].vel

      // Snap model to exclusion boundary in one frame
      const ox = p.x
      const oy = p.y
      const distFromCenter = Math.sqrt(ox * ox + oy * oy)
      if (distFromCenter < CENTER_EXCL && distFromCenter > 0.001) {
        const scale = CENTER_EXCL / distFromCenter
        p.x = ox * scale
        p.y = oy * scale
        // Reflect any inward velocity component
        scratch.current.set(ox, oy, 0).normalize()
        const dot = v.dot(scratch.current)
        if (dot < 0) v.addScaledVector(scratch.current, -dot * 1.6)
      }

      // World boundary
      if (p.x >  BND.x)    { p.x =  BND.x;    if (v.x > 0) v.x *= -0.6 }
      if (p.x < -BND.x)    { p.x = -BND.x;    if (v.x < 0) v.x *= -0.6 }
      if (p.y >  BND.y)    { p.y =  BND.y;     if (v.y > 0) v.y *= -0.6 }
      if (p.y < -BND.y)    { p.y = -BND.y;     if (v.y < 0) v.y *= -0.6 }
      if (p.z >  BND.zMax) { p.z =  BND.zMax;  if (v.z > 0) v.z *= -0.6 }
      if (p.z <  BND.zMin) { p.z =  BND.zMin;  if (v.z < 0) v.z *= -0.6 }
    }

    // ── 5. Sync corrected visual positions back to basePos ────────────────
    // Strips the float-Y offset so velocity integration next frame is correct.
    for (let i = 0; i < N; i++) {
      const group = groupRefs[i].current
      if (!group) continue
      const floatY = Math.sin(t * FLOAT_FREQ + sim[i].floatOffset) * FLOAT_AMP
      sim[i].basePos.set(group.position.x, group.position.y - floatY, group.position.z)
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
