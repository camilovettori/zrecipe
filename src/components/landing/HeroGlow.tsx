'use client'

import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { MeshDistortMaterial } from '@react-three/drei'
import type { Mesh } from 'three'

// Deliberately minimal: two low-poly icosahedrons with drei's built-in
// distort material (no GLB downloads, no environment map, no physics/
// collision loop) — the whole "ambient blob" look comes from the CSS
// blur filter applied by HeroGlowLayer, not from shader complexity.

interface BlobProps {
  position: [number, number, number]
  color: string
  speed: number
  distort: number
  scale: number
}

function Blob({ position, color, speed, distort, scale }: BlobProps) {
  const ref = useRef<Mesh>(null)

  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    const t = clock.getElapsedTime()
    mesh.position.y = position[1] + Math.sin(t * 0.3 + position[0]) * 0.4
    mesh.rotation.x = t * 0.05
    mesh.rotation.y = t * 0.08
  })

  return (
    <mesh ref={ref} position={position} scale={scale}>
      <icosahedronGeometry args={[1.6, 4]} />
      <MeshDistortMaterial
        color={color}
        distort={distort}
        speed={speed}
        transparent
        opacity={0.45}
        roughness={0.4}
      />
    </mesh>
  )
}

export default function HeroGlow() {
  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 40 }}
      gl={{ alpha: true, antialias: false }}
      dpr={[1, 1.5]}
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 4, 5]} intensity={0.5} />
      <Blob position={[-2.3, 0.6, -2]} color="#059669" speed={1.2} distort={0.35} scale={1.4} />
      <Blob position={[2.4, -0.7, -3]} color="#f59e0b" speed={0.9} distort={0.3} scale={1.1} />
    </Canvas>
  )
}
