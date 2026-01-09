import React, { useCallback, useEffect, useState } from 'react';
import { analyzeFileDependencies } from '../lib/api';
import ReactFlow, {
    type Node,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    MarkerType,
    Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { X, RefreshCw } from 'lucide-react';

// Define Edge type locally since reactflow v11+ has different type exports
interface Edge {
    id: string;
    source: string;
    target: string;
    animated?: boolean;
    style?: React.CSSProperties;
    markerEnd?: { type: MarkerType; color: string };
}

interface DependencyGraphProps {
    filePath: string;
    onClose: () => void;
    onFileClick?: (filePath: string) => void;
}

interface DependencyData {
    current_file: string;
    imports: string[];
    imported_by?: string[];
}

// Custom node component
const FileNode = ({ data }: { data: { label: string; isMain: boolean; onClick?: () => void } }) => (
    <div
        onClick={data.onClick}
        className={`px-4 py-2 rounded-lg border-2 cursor-pointer transition-all hover:scale-105 ${data.isMain
            ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/30'
            : 'bg-slate-800 border-slate-600 text-slate-200 hover:border-blue-500'
            }`}
    >
        <div className="text-xs font-mono truncate max-w-[150px]">{data.label}</div>
    </div>
);

const nodeTypes = {
    fileNode: FileNode,
};

export const DependencyGraph: React.FC<DependencyGraphProps> = ({
    filePath,
    onClose,
    onFileClick,
}) => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);




    const fetchDependencies = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data: DependencyData = await analyzeFileDependencies(filePath);

            // Create nodes and edges
            const fileName = filePath.split('/').pop() || filePath;
            const newNodes: Node[] = [
                {
                    id: 'main',
                    type: 'fileNode',
                    position: { x: 250, y: 150 },
                    data: { label: fileName, isMain: true },
                    sourcePosition: Position.Right,
                    targetPosition: Position.Left,
                },
            ];

            const newEdges: Edge[] = [];

            // Add import nodes (dependencies)
            data.imports.forEach((imp, index) => {
                const nodeId = `import-${index}`;
                newNodes.push({
                    id: nodeId,
                    type: 'fileNode',
                    position: { x: 500, y: 50 + index * 60 },
                    data: {
                        label: imp.split('.').pop() || imp,
                        isMain: false,
                        onClick: () => onFileClick?.(imp)
                    },
                    sourcePosition: Position.Right,
                    targetPosition: Position.Left,
                });
                newEdges.push({
                    id: `edge-${nodeId}`,
                    source: 'main',
                    target: nodeId,
                    animated: true,
                    style: { stroke: '#3b82f6' },
                    markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
                });
            });

            // Add imported_by nodes if available
            if (data.imported_by) {
                data.imported_by.forEach((imp, index) => {
                    const nodeId = `importedby-${index}`;
                    newNodes.push({
                        id: nodeId,
                        type: 'fileNode',
                        position: { x: 0, y: 50 + index * 60 },
                        data: {
                            label: imp.split('/').pop() || imp,
                            isMain: false,
                            onClick: () => onFileClick?.(imp)
                        },
                        sourcePosition: Position.Right,
                        targetPosition: Position.Left,
                    });
                    newEdges.push({
                        id: `edge-${nodeId}`,
                        source: nodeId,
                        target: 'main',
                        animated: true,
                        style: { stroke: '#10b981' },
                        markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
                    });
                });
            }

            setNodes(newNodes);
            setEdges(newEdges);
        } catch (err) {
            setError('Failed to load dependencies. Make sure the file is indexed.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [filePath, onFileClick, setNodes, setEdges]);

    useEffect(() => {
        fetchDependencies();
    }, [fetchDependencies]);

    return (
        <div className="h-full flex flex-col glass-light">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50 glass">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-200">Dependency Graph</span>
                    <span className="text-xs text-slate-500 font-mono">{filePath}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={fetchDependencies}
                        className="p-2 hover:bg-slate-700/50 rounded-lg transition-all text-slate-400 hover:text-white"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-red-500/20 rounded-lg transition-all text-slate-400 hover:text-red-400"
                        title="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Graph */}
            <div className="flex-1">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-center space-y-4 animate-fade-in">
                            <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mx-auto" />
                            <p className="text-slate-400">Analyzing dependencies...</p>
                        </div>
                    </div>
                ) : error ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-center space-y-4">
                            <p className="text-red-400">{error}</p>
                            <button
                                onClick={fetchDependencies}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm"
                            >
                                Retry
                            </button>
                        </div>
                    </div>
                ) : (
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        nodeTypes={nodeTypes}
                        fitView
                        attributionPosition="bottom-left"
                    >
                        <Background color="#334155" gap={16} />
                        <Controls
                            showZoom={true}
                            showFitView={true}
                            showInteractive={false}
                        />
                    </ReactFlow>
                )}
            </div>

            {/* Legend */}
            <div className="px-4 py-2 border-t border-slate-700/50 flex items-center gap-6 text-[10px] text-slate-500">
                <span className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-blue-600 rounded" /> Current File
                </span>
                <span className="flex items-center gap-2">
                    <span className="w-8 h-0.5 bg-blue-500" /> Imports →
                </span>
                <span className="flex items-center gap-2">
                    <span className="w-8 h-0.5 bg-emerald-500" /> ← Imported By
                </span>
            </div>
        </div>
    );
};
