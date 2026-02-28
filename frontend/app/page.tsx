'use client';

import { useState, useEffect, useMemo } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css'; // Required for React Flow to work!

import ConfigurationSidebar, { Checkpoint } from '@/components/ConfigurationSidebar';
import PassengerNode from '@/components/PassengerNode';

export default function Dashboard() {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);

  // React Flow State
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Register our custom glowing node
  const nodeTypes = useMemo(() => ({ passengerNode: PassengerNode }), []);

  // Sync sidebar 'checkpoints' with React Flow 'nodes' and 'edges'
  useEffect(() => {
    // 1. Update Nodes (while preserving their dragged X/Y positions)
    setNodes((currentNodes) => {
      const updatedNodes = [...currentNodes];

      checkpoints.forEach((cp, index) => {
        const existingNode = updatedNodes.find((n) => n.id === cp.id);
        if (!existingNode) {
          // Spawn new node 350px to the right of the previous one
          updatedNodes.push({
            id: cp.id,
            type: 'passengerNode',
            position: { x: index * 350 + 100, y: 250 },
            data: { title: cp.title, idCode: cp.idCode, type: cp.type }
          });
        }
      });

      // Remove nodes if deleted from sidebar
      return updatedNodes.filter((n) => checkpoints.some((cp) => cp.id === n.id));
    });

    // 2. Auto-draw Edges between sequential checkpoints
    const newEdges = [];
    for (let i = 1; i < checkpoints.length; i++) {
      newEdges.push({
        id: `e-${checkpoints[i - 1].id}-${checkpoints[i].id}`,
        source: checkpoints[i - 1].id,
        target: checkpoints[i].id,
        type: 'smoothstep', // Gives it that clean, curved routing
        animated: true,     // Flowing animation effect
        style: { stroke: '#94A3B8', strokeWidth: 2 }
      });
    }
    setEdges(newEdges);
  }, [checkpoints, setNodes, setEdges]);

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left Sidebar */}
      <aside className="w-[450px] border-r border-slate-200 bg-[#F4F7FB] flex flex-col shrink-0 overflow-hidden z-20">
        <div className="flex-1 overflow-hidden p-4 flex flex-col">
          <ConfigurationSidebar
            checkpoints={checkpoints}
            setCheckpoints={setCheckpoints}
          />
        </div>
      </aside>

      {/* Right Area: React Flow Canvas */}
      <main className="flex-1 relative bg-[#FAFCFF]">

        {/* Top Left Card (Overlaid on canvas) */}
        <div className="absolute top-6 left-6 bg-white border border-slate-200 shadow-sm rounded-lg p-3 pr-6 z-10">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            Flow Diagram
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#00C2FF]"></div>
            <span className="text-sm font-bold text-slate-800">
              Simulation Flow
            </span>
          </div>
        </div>

        {checkpoints.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <span className="text-slate-400 font-medium bg-white/60 px-4 py-2 rounded-lg border border-slate-200 backdrop-blur-sm shadow-sm">
              Create a checkpoint to begin flow diagram.
            </span>
          </div>
        )}

        {/* The Interactive Canvas */}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background color="#CBD5E1" gap={24} size={2} />
          <Controls className="bg-white border-slate-200 shadow-sm rounded" showInteractive={false} />
        </ReactFlow>

      </main>
    </div>
  );
}