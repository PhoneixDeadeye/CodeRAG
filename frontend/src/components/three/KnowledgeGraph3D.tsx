import { useRef, useMemo, useState, useCallback } from 'react'
import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber'
import { Float, Text, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

interface GraphNode {
  id: string
  label: string
  type: 'file' | 'class' | 'function' | 'module'
  x: number
  y: number
  z: number
  connections: string[]
}

interface KnowledgeGraph3DProps {
  nodes?: GraphNode[]
  className?: string
  onNodeClick?: (node: GraphNode) => void
}

const TYPE_COLORS: Record<string, string> = {
  file: '#00d4ff',
  class: '#ff6b6b',
  function: '#ffd93d',
  module: '#6bcb77',
}

function GraphNodeMesh({
  node,
  onClick,
}: {
  node: GraphNode
  onClick?: (node: GraphNode) => void
}) {
  const mesh = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const color = TYPE_COLORS[node.type] || '#00aaff'

  useFrame((state) => {
    if (!mesh.current) return
    const time = state.clock.getElapsedTime()
    mesh.current.scale.setScalar(hovered ? 1.4 : 1 + Math.sin(time + node.x) * 0.05)
  })

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      onClick?.(node)
    },
    [node, onClick]
  )

  return (
    <group position={[node.x, node.y, node.z]}>
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.3}>
        <mesh
          ref={mesh}
          onClick={handleClick}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={hovered ? 0.8 : 0.4}
            transparent
            opacity={0.9}
          />
        </mesh>
        {hovered && (
          <Text
            position={[0, 0.3, 0]}
            fontSize={0.12}
            color="white"
            anchorX="center"
            anchorY="middle"
          >
            {node.label}
          </Text>
        )}
      </Float>
    </group>
  )
}

function GraphEdges({ nodes }: { nodes: GraphNode[] }) {
  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>()
    nodes.forEach((n) => map.set(n.id, n))
    return map
  }, [nodes])

  const edges = useMemo(() => {
    const result: { from: THREE.Vector3; to: THREE.Vector3 }[] = []
    nodes.forEach((node) => {
      node.connections.forEach((targetId) => {
        const target = nodeMap.get(targetId)
        if (target) {
          result.push({
            from: new THREE.Vector3(node.x, node.y, node.z),
            to: new THREE.Vector3(target.x, target.y, target.z),
          })
        }
      })
    })
    return result
  }, [nodes, nodeMap])

  return (
    <group>
      {edges.map((edge, i) => {
        const geometry = new THREE.BufferGeometry().setFromPoints([edge.from, edge.to])
        return (
          <line key={i} geometry={geometry}>
            <lineBasicMaterial
              color="#1a4a7a"
              transparent
              opacity={0.3}
            />
          </line>
        )
      })}
    </group>
  )
}

// Generate sample nodes if none provided
function generateSampleNodes(): GraphNode[] {
  const types: GraphNode['type'][] = ['file', 'class', 'function', 'module']
  const labels = [
    'main.py', 'App.tsx', 'database.py', 'auth.py', 'config.py',
    'RAGEngine', 'UserService', 'ChatView', 'FileExplorer', 'Router',
    'get_embed', 'query_db', 'render', 'validate', 'transform',
    'core', 'api', 'services', 'components', 'utils',
  ]

  return labels.map((label, i) => {
    const angle = (i / labels.length) * Math.PI * 2
    const radius = 2 + Math.random() * 2
    const height = (Math.random() - 0.5) * 3

    const connections: string[] = []
    const numConnections = 1 + Math.floor(Math.random() * 3)
    for (let j = 0; j < numConnections; j++) {
      const targetIdx = Math.floor(Math.random() * labels.length)
      if (targetIdx !== i) {
        connections.push(`node-${targetIdx}`)
      }
    }

    return {
      id: `node-${i}`,
      label,
      type: types[i % types.length],
      x: Math.cos(angle) * radius,
      y: height,
      z: Math.sin(angle) * radius,
      connections,
    }
  })
}

export default function KnowledgeGraph3D({
  nodes: externalNodes,
  className = '',
  onNodeClick,
}: KnowledgeGraph3DProps) {
  const nodes = useMemo(() => externalNodes || generateSampleNodes(), [externalNodes])

  return (
    <div className={`knowledge-graph-3d ${className}`} style={{
      width: '100%',
      height: '100%',
      minHeight: '400px',
      borderRadius: '12px',
      overflow: 'hidden',
      background: 'var(--bg-primary, #0a0a1a)',
    }}>
      <Canvas
        camera={{ position: [0, 2, 6], fov: 55 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[5, 5, 5]} intensity={0.5} color="#0088ff" />
        <pointLight position={[-5, -3, -5]} intensity={0.3} color="#00d4ff" />

        <GraphEdges nodes={nodes} />
        {nodes.map((node) => (
          <GraphNodeMesh key={node.id} node={node} onClick={onNodeClick} />
        ))}

        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={3}
          maxDistance={12}
          autoRotate
          autoRotateSpeed={0.5}
        />
      </Canvas>
    </div>
  )
}
