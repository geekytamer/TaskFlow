'use client';

import React, { useCallback, useMemo, useEffect, useState } from 'react';
import ReactFlow, {
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  addEdge,
  MiniMap,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { getTasks } from '@/services/projectService';
import type { Task } from '@/modules/projects/types';
import { taskStatuses } from '@/modules/projects/types';
import TaskNode from './task-node';
import { useCompany } from '@/context/company-context';
import { Skeleton } from '@/components/ui/skeleton';

const nodeTypes = {
  taskNode: TaskNode,
};

type TaskNodeData = Task & { parentTitle?: string };

const getNodesAndEdges = (companyTasks: Task[]) => {
  const initialNodes: Node<Task>[] = [];
  const initialEdges: Edge[] = [];
  const taskMap = new Map(companyTasks.map((t) => [t.id, t]));

  const statusColumns: Record<string, number> = {
    'To Do': 0,
    'In Progress': 1,
    'Done': 2,
  };

  const tasksByStatus: Record<string, Task[]> = {
    'To Do': [],
    'In Progress': [],
    'Done': [],
  };

  companyTasks.forEach(task => {
    if (task.status in tasksByStatus) {
      tasksByStatus[task.status].push(task);
    }
    if (task.dependencies) {
      task.dependencies.forEach(depId => {
        initialEdges.push({
          id: `dep-${depId}-${task.id}`,
          source: depId,
          target: task.id,
          animated: true,
          type: 'smoothstep',
          style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
        });
      });
    }
    if (task.parentTaskId) {
      initialEdges.push({
        id: `parent-${task.parentTaskId}-${task.id}`,
        source: task.parentTaskId,
        target: task.id,
        animated: false,
        type: 'smoothstep',
        style: { stroke: 'hsl(var(--muted-foreground))', strokeWidth: 2, strokeDasharray: '4 2' },
      });
    }
  });

  taskStatuses.forEach(status => {
    tasksByStatus[status].forEach((task, index) => {
      const parentTitle = task.parentTaskId ? taskMap.get(task.parentTaskId)?.title : undefined;
      initialNodes.push({
        id: task.id,
        type: 'taskNode',
        position: { x: statusColumns[status] * 350, y: index * 150 + 50 },
        data: { ...task, parentTitle } as TaskNodeData,
        draggable: true,
      });
    });
  });

  return { initialNodes, initialEdges };
};


export function TaskDiagram() {
  const { selectedCompany } = useCompany();
  const [nodes, setNodes] = useState<Node<Task>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTasks() {
      if (!selectedCompany) return;
      setLoading(true);
      const allTasks = await getTasks();
      const companyTasks = allTasks.filter(task => task.companyId === selectedCompany.id);
      const { initialNodes, initialEdges } = getNodesAndEdges(companyTasks);
      setNodes(initialNodes);
      setEdges(initialEdges);
      setLoading(false);
    }
    loadTasks();
  }, [selectedCompany]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes]
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: 'hsl(var(--primary))' } }, eds)),
    [setEdges]
  );
  
  if (loading) {
    return <Skeleton className="w-full h-full" />;
  }

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        className="bg-background rounded-lg"
      >
        <Controls />
        <MiniMap nodeStrokeWidth={3} zoomable pannable />
        <Background gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}
