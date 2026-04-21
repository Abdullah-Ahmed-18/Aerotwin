'use client';

import { useState, useEffect, useMemo } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css'; // Required for React Flow to work!

import ConfigurationSidebar, { Checkpoint } from '@/components/ConfigurationSidebar';
import PassengerNode from '@/components/PassengerNode';

export default function Dashboard() {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);

  type FlowNodeData = {
    title: string;
    idCode: string;
    type: string;
    flowType: 'departure' | 'arrival';
  };

  // React Flow State
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Register our custom glowing node
  const nodeTypes = useMemo(() => ({ passengerNode: PassengerNode }), []);

  const flowOverlays = useMemo(() => {
    const BASE_WIDTH = 520;
    const PER_CHECKPOINT_WIDTH = 240;
    const BASE_HEIGHT = 190;
    const PER_CHECKPOINT_HEIGHT = 26;
    const LANE_GAP = 18;
    const LEFT = 24;
    const TOP = 138;

    const departureCount = checkpoints.filter((cp) => cp.flowType !== 'arrival').length;
    const arrivalCount = checkpoints.filter((cp) => cp.flowType === 'arrival').length;

    const departureHeight = Math.max(BASE_HEIGHT, BASE_HEIGHT + Math.max(0, departureCount - 3) * PER_CHECKPOINT_HEIGHT);
    const arrivalHeight = Math.max(BASE_HEIGHT, BASE_HEIGHT + Math.max(0, arrivalCount - 3) * PER_CHECKPOINT_HEIGHT);
    const departureWidth = Math.max(BASE_WIDTH, BASE_WIDTH + Math.max(0, departureCount - 1) * PER_CHECKPOINT_WIDTH);
    const arrivalWidth = Math.max(BASE_WIDTH, BASE_WIDTH + Math.max(0, arrivalCount - 1) * PER_CHECKPOINT_WIDTH);

    const buildOverlay = (
      flowType: 'departure' | 'arrival',
      top: number,
      height: number,
      widthPx: number,
      borderClass: string,
      bgClass: string,
      titleClass: string,
      title: string,
      subtitle: string
    ) => {
      return {
        flowType,
        left: LEFT,
        top,
        width: `min(calc(100% - 48px), ${widthPx}px)`,
        height,
        borderClass,
        bgClass,
        titleClass,
        title,
        subtitle
      };
    };

    return [
      buildOverlay(
        'departure',
        TOP,
        departureHeight,
        departureWidth,
        'border-blue-200',
        'bg-blue-50/45',
        'text-blue-700',
        'Departure Lane',
        'Outside Airport -> Boarding Gate'
      ),
      buildOverlay(
        'arrival',
        TOP + departureHeight + LANE_GAP,
        arrivalHeight,
        arrivalWidth,
        'border-emerald-200',
        'bg-emerald-50/50',
        'text-emerald-700',
        'Arrival Lane',
        'Boarding Gate -> Outside Airport'
      )
    ];
  }, [checkpoints]);

  // Sync sidebar 'checkpoints' with React Flow 'nodes' and 'edges'
  useEffect(() => {
    const departureCheckpoints = checkpoints.filter(cp => cp.flowType !== 'arrival');
    const arrivalCheckpoints = checkpoints.filter(cp => cp.flowType === 'arrival');

    // 1. Update Nodes (while preserving their dragged X/Y positions)
    setNodes((currentNodes) => {
      const updatedNodes = [...currentNodes];

      departureCheckpoints.forEach((cp, index) => {
        const existingNode = updatedNodes.find((n) => n.id === cp.id);
        if (!existingNode) {
          updatedNodes.push({
            id: cp.id,
            type: 'passengerNode',
            position: { x: index * 350 + 120, y: 180 },
            data: { title: cp.title, idCode: cp.idCode, type: cp.type, flowType: cp.flowType }
          });
        }
      });

      arrivalCheckpoints.forEach((cp, index) => {
        const existingNode = updatedNodes.find((n) => n.id === cp.id);
        if (!existingNode) {
          // Keep arrival checkpoint visual order aligned with configured order.
          updatedNodes.push({
            id: cp.id,
            type: 'passengerNode',
            position: { x: index * 350 + 120, y: 520 },
            data: { title: cp.title, idCode: cp.idCode, type: cp.type, flowType: cp.flowType }
          });
        }
      });

      // Remove nodes if deleted from sidebar
      return updatedNodes.filter((n) => checkpoints.some((cp) => cp.id === n.id));
    });

    // 2. Auto-draw Edges based on nextCheckpointIds (supports forking)
    const newEdges: Edge[] = [];
    checkpoints.forEach((checkpoint) => {
      if (checkpoint.nextCheckpointIds && checkpoint.nextCheckpointIds.length > 0) {
        checkpoint.nextCheckpointIds.forEach((targetId) => {
          // Check if the target checkpoint exists
          const targetCheckpoint = checkpoints.find(cp => cp.id === targetId);
          const targetExists = Boolean(targetCheckpoint);
          const sameFlow = targetCheckpoint?.flowType === checkpoint.flowType;
          if (targetExists) {
            newEdges.push({
              id: `e-${checkpoint.id}-${targetId}`,
              source: checkpoint.id,
              target: targetId,
              type: 'smoothstep', // Gives it that clean, curved routing
              animated: true,     // Flowing animation effect
              style: {
                stroke: checkpoint.flowType === 'arrival' ? '#10B981' : '#3B82F6',
                strokeWidth: 2,
                opacity: sameFlow ? 1 : 0.25
              },
              markerEnd: {
                type: 'arrowclosed',
                color: checkpoint.flowType === 'arrival' ? '#10B981' : '#3B82F6'
              },
              hidden: !sameFlow
            });
          }
        });
      }
    });
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
      <main className="react-flow-touch-area flex-1 relative bg-[#FAFCFF]">

        {/* Top Left Card (Overlaid on canvas) */}
        <div className="absolute top-6 left-6 bg-white border border-slate-200 shadow-sm rounded-lg p-3 pr-6 z-10">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            Flow Diagram
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span className="text-sm font-bold text-slate-800">Departure</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span className="text-sm font-bold text-slate-800">Arrival</span>
            </div>
          </div>
        </div>

        {flowOverlays.map((overlay) => (
          <div
            key={overlay.flowType}
            className={`absolute rounded-2xl border ${overlay.borderClass} ${overlay.bgClass} z-0 pointer-events-none`}
            style={{
              left: overlay.left,
              top: overlay.top,
              width: overlay.width,
              height: overlay.height
            }}
          >
            <div className={`absolute left-4 top-3 text-[11px] font-bold uppercase tracking-wider ${overlay.titleClass}`}>
              {overlay.title}
            </div>
            <div className={`absolute left-4 top-7 text-[10px] font-semibold uppercase tracking-wide opacity-80 ${overlay.titleClass}`}>
              {overlay.subtitle}
            </div>
          </div>
        ))}

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
          panOnDrag
          panOnScroll
          selectionOnDrag={false}
          zoomOnPinch
          zoomOnDoubleClick={false}
          preventScrolling={false}
          fitView
        >
          <Background color="#CBD5E1" gap={24} size={2} />
          <Controls className="bg-white border-slate-200 shadow-sm rounded" showInteractive={false} />
        </ReactFlow>

      </main>
    </div>
  );
}