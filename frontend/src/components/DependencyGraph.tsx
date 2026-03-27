import React, { useCallback, useEffect, useState } from 'react';
import { analyzeFileDependencies } from '../lib/api';
import { logger } from '../lib/logger';
import ReactFlow, {
    type Node,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    MarkerType,
    Position,
    MiniMap,
    BackgroundVariant,
} from 'reactflow';
// @ts-ignore - CSS import handled by Vite bundler, not TypeScript
import 'reactflow/dist/style.css';
import {
    X, RefreshCw, Crosshair,
    FileCode, Share2,
    Zap, Database, Network,
    Activity, FileJson, FileText, Settings,
    Cpu, Layers, Box, Terminal,
    Search
} from 'lucide-react';
import clsx from 'clsx';

// Define Edge type locally since reactflow v11+ has different type exports
interface Edge {
    id: string;
    source: string;
    target: string;
    animated?: boolean;
    style?: React.CSSProperties;
    markerEnd?: { type: MarkerType; color: string };
    label?: string;
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

// Get file icon based on extension using Lucide
const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    switch (ext) {
        case 'ts':
        case 'tsx':
        case 'js':
        case 'jsx':
            return FileCode;
        case 'py':
            return Cpu;
        case 'json':
            return FileJson;
        case 'md':
            return FileText;
        case 'yaml':
        case 'yml':
            return Settings;
        case 'sql':
            return Database;
        case 'css':
        case 'scss':
            return Layers;
        default:
            return Box;
    }
};

// Custom node component with premium styling
const FileNode = ({ data }: { data: { label: string; fullPath?: string; isMain: boolean; nodeType?: string; onClick?: () => void } }) => {
    const IconComponent = data.isMain ? Zap : getFileIcon(data.label);

    return (
        <div
            onClick={data.onClick}
            className={clsx(
                "group relative px-5 py-4 rounded-2xl border transition-all duration-500 cursor-pointer min-w-[180px]",
                data.isMain
                    ? "bg-gradient-to-br from-primary via-indigo-600 to-indigo-800 border-primary/50 text-white shadow-[0_10px_40px_rgba(79,70,229,0.3)] scale-110 z-10"
                    : "glass-strong border-white/5 text-gray-300 hover:border-primary/40 hover:bg-white/5"
            )}
        >
            {/* Glow effect on main node */}
            {data.isMain && (
                <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-2xl -z-10 animate-pulse" />
            )}

            <div className="flex items-center gap-3">
                <div className={clsx(
                    "p-2 rounded-xl flex items-center justify-center transition-colors shadow-inner",
                    data.isMain
                        ? "bg-white/10 text-white"
                        : data.nodeType === 'import'
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                )}>
                    <IconComponent className="w-4 h-4" />
                </div>
                <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold font-mono truncate">{data.label}</span>
                    <span className="text-[9px] text-text-muted font-bold uppercase tracking-widest mt-0.5 truncate">
                        {data.isMain ? 'Active File' : data.nodeType}
                    </span>
                </div>
            </div>

            {/* Hover details */}
            <div className="absolute top-full left-0 mt-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                <div className="glass-strong border border-white/10 px-3 py-1.5 rounded-lg shadow-2xl">
                    <span className="text-[10px] text-gray-400 font-mono whitespace-nowrap">{data.fullPath}</span>
                </div>
            </div>

            {/* Indicators */}
            {!data.isMain && (
                <div className={clsx(
                    "absolute top-2 right-2",
                    data.nodeType === 'import' ? "text-emerald-400/50" : "text-indigo-400/50"
                )}>
                    {data.nodeType === 'import' ? <ArrowRight className="w-3 h-3 rotate-45" /> : <ArrowLeft className="w-3 h-3 rotate-[225deg]" />}
                </div>
            )}
        </div>
    );
};

// Internal Arrow icons for node indicator
const ArrowRight = ({ className, style }: { className?: string, style?: React.CSSProperties }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
);
const ArrowLeft = ({ className, style }: { className?: string, style?: React.CSSProperties }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
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

    const [stats, setStats] = useState({ imports: 0, importedBy: 0 });

    const fetchDependencies = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data: DependencyData = await analyzeFileDependencies(filePath);

            const fileName = filePath.split('/').pop() || filePath;
            const importCount = data.imports.length;
            const importedByCount = data.imported_by?.length || 0;

            setStats({ imports: importCount, importedBy: importedByCount });

            const centerY = Math.max(importCount, importedByCount) * 40;

            const newNodes: Node[] = [
                {
                    id: 'main',
                    type: 'fileNode',
                    position: { x: 400, y: centerY },
                    data: { label: fileName, fullPath: filePath, isMain: true },
                    sourcePosition: Position.Right,
                    targetPosition: Position.Left,
                },
            ];

            const newEdges: Edge[] = [];

            // Add import nodes (dependencies)
            data.imports.forEach((imp, index) => {
                const nodeId = `import-${index}`;
                const yOffset = (index - (importCount - 1) / 2) * 100;
                newNodes.push({
                    id: nodeId,
                    type: 'fileNode',
                    position: { x: 800, y: centerY + yOffset },
                    data: {
                        label: imp.split('/').pop()?.split('.')[0] || imp,
                        fullPath: imp,
                        isMain: false,
                        nodeType: 'import',
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
                    style: { stroke: '#10b981', strokeWidth: 2, opacity: 0.6 },
                    markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
                });
            });

            // Add imported_by nodes
            if (data.imported_by) {
                data.imported_by.forEach((imp, index) => {
                    const nodeId = `importedby-${index}`;
                    const yOffset = (index - (importedByCount - 1) / 2) * 100;
                    newNodes.push({
                        id: nodeId,
                        type: 'fileNode',
                        position: { x: 0, y: centerY + yOffset },
                        data: {
                            label: imp.split('/').pop() || imp,
                            fullPath: imp,
                            isMain: false,
                            nodeType: 'importedBy',
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
                        style: { stroke: '#818cf8', strokeWidth: 2, opacity: 0.6 },
                        markerEnd: { type: MarkerType.ArrowClosed, color: '#818cf8' },
                    });
                });
            }

            setNodes(newNodes);
            setEdges(newEdges);
        } catch (err) {
            setError('Architectural analysis failed. Ensure the server is active.');
            logger.error(err);
        } finally {
            setLoading(false);
        }
    }, [filePath, onFileClick, setNodes, setEdges]);

    useEffect(() => {
        fetchDependencies();
    }, [fetchDependencies]);

    return (
        <div className="fixed inset-0 z-50 bg-[#0a0c10]/95 backdrop-blur-xl flex flex-col animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-[#0a0c10]/60 backdrop-blur-2xl">
                <div className="flex items-center gap-5">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                            <Network className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-base font-black text-white tracking-tight">System Architecture</h2>
                            <span className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Dependency Visualizer</span>
                        </div>
                    </div>
                    <div className="h-8 w-px bg-white/5 hidden md:block"></div>
                    <div className="hidden md:flex items-center gap-2 px-4 py-1.5 bg-white/5 border border-white/5 rounded-full">
                        <Terminal className="w-3.5 h-3.5 text-text-muted" />
                        <span className="text-xs text-text-secondary font-mono truncate max-w-[400px]">{filePath}</span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="px-4 py-1.5 bg-white/5 border border-white/5 rounded-full flex gap-4 mr-4">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                            <span className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">{stats.imports} Deps</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                            <span className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">{stats.importedBy} Users</span>
                        </div>
                    </div>
                    <button
                        onClick={fetchDependencies}
                        disabled={loading}
                        className="p-2.5 hover:bg-white/5 rounded-xl transition-all text-text-secondary hover:text-white disabled:opacity-20 active:scale-90"
                        title="Refresh Analysis"
                    >
                        <RefreshCw className={clsx("w-5 h-5", loading && "animate-spin")} />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2.5 hover:bg-rose-500/10 rounded-xl transition-all text-text-secondary hover:text-rose-400 active:scale-90"
                        title="Close Overlay"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Graph Area */}
            <div className="flex-1 relative overflow-hidden bg-[radial-gradient(circle_at_center,_#1a1d26_0%,_#0a0c10_100%)]">
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                        <div className="text-center space-y-6 animate-fade-in">
                            <div className="relative">
                                <Activity className="w-16 h-16 text-primary animate-pulse mx-auto opacity-50" />
                                <RefreshCw className="w-24 h-24 text-primary animate-spin absolute inset-0 -translate-x-4 -translate-y-4 opacity-20" />
                            </div>
                            <div className="space-y-2">
                                <p className="text-white text-xl font-black tracking-tight">Analyzing Archetype...</p>
                                <p className="text-text-muted text-xs font-bold uppercase tracking-[0.2em]">Tracing dependencies & references</p>
                            </div>
                        </div>
                    </div>
                ) : error ? (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                        <div className="text-center space-y-6 max-w-md px-8 glass-strong p-10 rounded-[2.5rem] border-rose-500/20 shadow-2xl">
                            <div className="w-20 h-20 mx-auto rounded-3xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                                <AlertCircle className="w-10 h-10 text-rose-500" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-white text-xl font-bold">Analysis Terminated</h3>
                                <p className="text-text-secondary text-sm leading-relaxed">{error}</p>
                            </div>
                            <button
                                onClick={fetchDependencies}
                                className="w-full py-3.5 bg-rose-500/20 hover:bg-rose-500/30 rounded-2xl text-rose-400 font-bold text-sm transition-all active:scale-95 border border-rose-500/20 shadow-xl shadow-rose-500/5 flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Attempt Re-index
                            </button>
                        </div>
                    </div>
                ) : nodes.length === 1 ? (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                        <div className="text-center space-y-6 max-w-md px-8 glass-strong p-10 rounded-[2.5rem] border-white/5">
                            <div className="w-20 h-20 mx-auto rounded-3xl bg-white/5 flex items-center justify-center border border-white/10 group">
                                <Crosshair className="w-10 h-10 text-text-muted group-hover:text-primary transition-colors duration-500" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-white text-xl font-bold">Isolated Module</h3>
                                <p className="text-text-secondary text-sm leading-relaxed">
                                    No direct dependencies or active references detected for this archetype within the current codebase.
                                </p>
                            </div>
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
                        fitViewOptions={{ padding: 0.4 }}
                        attributionPosition="bottom-left"
                        minZoom={0.1}
                        maxZoom={1.5}
                        className="transition-opacity duration-1000"
                    >
                        <Background color="#ffffff" gap={40} size={1} variant={BackgroundVariant.Dots} className="opacity-[0.03]" />
                        <Controls
                            showInteractive={false}
                            className="!left-8 !bottom-24 !bg-[#161b22] !border-white/10 !rounded-2xl !shadow-2xl overflow-hidden !m-0"
                        />
                        <MiniMap
                            nodeColor={(node) => {
                                if (node.id === 'main') return '#4f46e5';
                                if (node.id.startsWith('import-')) return '#10b981';
                                return '#818cf8';
                            }}
                            maskColor="rgba(10, 12, 16, 0.9)"
                            className="!bg-[#161b22] !border-white/10 !rounded-2xl !right-8 !bottom-24 !shadow-2xl"
                        />
                    </ReactFlow>
                )}
            </div>

            {/* Help Footer */}
            <div className="px-8 py-4 border-t border-white/5 bg-[#0a0c10] flex items-center justify-between z-20">
                <div className="flex items-center gap-6">
                    {[
                        { icon: Share2, text: 'Click nodes to open' },
                        { icon: Search, text: 'Scroll to Zoom' },
                        { icon: Layers, text: 'Drag to Pan' }
                    ].map((item, i) => (
                        <div key={i} className="flex items-center gap-2 group cursor-default">
                            <item.icon className="w-3.5 h-3.5 text-text-muted group-hover:text-white transition-colors" />
                            <span className="text-[10px] text-text-muted group-hover:text-gray-300 font-bold uppercase tracking-widest">{item.text}</span>
                        </div>
                    ))}
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/5">
                        <span className="text-[10px] text-text-muted font-bold tracking-widest uppercase">Engine 2.0</span>
                    </div>
                    <span className="text-[10px] text-text-muted font-mono opacity-50">v1.2.0-stable</span>
                </div>
            </div>
        </div>
    );
};

const AlertCircle = ({ className, style }: { className?: string, style?: React.CSSProperties }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
);

