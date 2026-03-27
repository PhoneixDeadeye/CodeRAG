import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function FloatingGrid() {
  const mesh = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (!mesh.current) return
    const time = state.clock.getElapsedTime()
    mesh.current.rotation.x = Math.PI * -0.5 + Math.sin(time * 0.1) * 0.05
    mesh.current.position.y = -2 + Math.sin(time * 0.2) * 0.1
  })

  return (
    <mesh ref={mesh} position={[0, -2, 0]} rotation={[-Math.PI * 0.5, 0, 0]}>
      <planeGeometry args={[40, 40, 40, 40]} />
      <meshStandardMaterial
        color="#0a0a1a"
        wireframe
        transparent
        opacity={0.15}
        emissive="#001133"
        emissiveIntensity={0.3}
      />
    </mesh>
  )
}

function AmbientParticles() {
  const points = useRef<THREE.Points>(null)
  const count = 500

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      pos[i3] = (Math.random() - 0.5) * 30
      pos[i3 + 1] = (Math.random() - 0.5) * 15
      pos[i3 + 2] = (Math.random() - 0.5) * 15
    }
    return pos
  }, [])

  useFrame((state) => {
    if (!points.current) return
    const time = state.clock.getElapsedTime()
    points.current.rotation.y = time * 0.01
    const posArray = points.current.geometry.attributes.position.array as Float32Array
    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      posArray[i3 + 1] += Math.sin(time + i * 0.1) * 0.001
    }
    points.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.02}
        color="#1a4a7a"
        transparent
        opacity={0.4}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

interface DashboardBackgroundProps {
  className?: string
}

export default function DashboardBackground({ className = '' }: DashboardBackgroundProps) {
  return (
    <div className={`dashboard-bg ${className}`} style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      zIndex: 0,
      pointerEvents: 'none',
    }}>
      <Canvas
        camera={{ position: [0, 2, 10], fov: 50 }}
        dpr={[1, 1]}
        gl={{
          antialias: false,
          alpha: true,
          powerPreference: 'low-power',
        }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.1} />
        <FloatingGrid />
        <AmbientParticles />
      </Canvas>
    </div>
  )
}
