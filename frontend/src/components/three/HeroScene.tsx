import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, Stars } from '@react-three/drei'
import * as THREE from 'three'

function ParticleField() {
  const points = useRef<THREE.Points>(null)
  const count = 2000

  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      pos[i3] = (Math.random() - 0.5) * 20
      pos[i3 + 1] = (Math.random() - 0.5) * 20
      pos[i3 + 2] = (Math.random() - 0.5) * 20

      // Cyan to blue gradient
      const t = Math.random()
      col[i3] = 0.1 + t * 0.2       // R
      col[i3 + 1] = 0.6 + t * 0.3   // G
      col[i3 + 2] = 0.8 + t * 0.2   // B
    }
    return [pos, col]
  }, [])

  useFrame((state) => {
    if (!points.current) return
    const time = state.clock.getElapsedTime()
    points.current.rotation.y = time * 0.05
    points.current.rotation.x = Math.sin(time * 0.03) * 0.1
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
        <bufferAttribute
          attach="attributes-color"
          count={count}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

function GlowingSphere() {
  const mesh = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (!mesh.current) return
    const time = state.clock.getElapsedTime()
    mesh.current.scale.setScalar(1 + Math.sin(time * 0.5) * 0.1)
  })

  return (
    <Float speed={1.5} rotationIntensity={0.5} floatIntensity={0.5}>
      <mesh ref={mesh}>
        <icosahedronGeometry args={[1.5, 4]} />
        <meshStandardMaterial
          color="#00d4ff"
          wireframe
          transparent
          opacity={0.3}
          emissive="#0088cc"
          emissiveIntensity={0.4}
        />
      </mesh>
      {/* Inner glow */}
      <mesh>
        <icosahedronGeometry args={[1.2, 3]} />
        <meshStandardMaterial
          color="#0099ff"
          transparent
          opacity={0.1}
          emissive="#0066ff"
          emissiveIntensity={0.6}
        />
      </mesh>
    </Float>
  )
}

function ConnectingLines() {
  const lines = useRef<THREE.Group>(null)
  const lineCount = 30

  const lineData = useMemo(() => {
    const data = []
    for (let i = 0; i < lineCount; i++) {
      const start = new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
      )
      const end = new THREE.Vector3(
        start.x + (Math.random() - 0.5) * 4,
        start.y + (Math.random() - 0.5) * 4,
        start.z + (Math.random() - 0.5) * 4,
      )
      data.push({ start, end })
    }
    return data
  }, [])

  useFrame((state) => {
    if (!lines.current) return
    const time = state.clock.getElapsedTime()
    lines.current.rotation.y = time * 0.02
  })

  return (
    <group ref={lines}>
      {lineData.map((line, i) => {
        const points = [line.start, line.end]
        const geometry = new THREE.BufferGeometry().setFromPoints(points)
        return (
          <line key={i} geometry={geometry}>
            <lineBasicMaterial
              color="#00aaff"
              transparent
              opacity={0.15}
            />
          </line>
        )
      })}
    </group>
  )
}

interface HeroSceneProps {
  className?: string
}

export default function HeroScene({ className = '' }: HeroSceneProps) {
  return (
    <div className={`hero-scene-container ${className}`} style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    }}>
      <Canvas
        camera={{ position: [0, 0, 8], fov: 60 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[5, 5, 5]} intensity={0.5} color="#00d4ff" />
        <pointLight position={[-5, -5, -5]} intensity={0.3} color="#0088ff" />
        
        <GlowingSphere />
        <ParticleField />
        <ConnectingLines />
        <Stars
          radius={80}
          depth={50}
          count={1000}
          factor={2}
          saturation={0.5}
          fade
          speed={0.5}
        />
      </Canvas>
    </div>
  )
}
