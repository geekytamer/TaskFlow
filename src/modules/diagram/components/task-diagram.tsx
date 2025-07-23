'use client';

import React, { useCallback, useMemo } from 'react';
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

import { placeholderTasks } from '@/modules/projects/data';
import type { Task } from '@/modules/projects/types';
import { taskStatuses } from '@/modules/projects/types';
import TaskNode from './task-node';
import { useCompany } from '@/context/company-context';

const nodeTypes = {
  taskNode: TaskNode,
};

// In a real app, you would get the current company's tasks
const getNodesAndEdges = (companyId: string) => {
  const initialNodes: Node<Task>[] = [];
  const initialEdges: Edge[] = [];

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

  const companyTasks = placeholderTasks.filter(task => task.companyId === companyId);

  companyTasks.forEach(task => {
    if (task.status in tasksByStatus) {
      tasksByStatus[task.status].push(task);
    }
    if (task.dependencies) {
      task.dependencies.forEach(depId => {
        initialEdges.push({
          id: `e-${depId}-${task.id}`,
          source: depId,
          target: task.id,
          animated: true,
          style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
        });
      });
    }
  });

  taskStatuses.forEach(status => {
    tasksByStatus[status].forEach((task, index) => {
      initialNodes.push({
        id: task.id,
        type: 'taskNode',
        position: { x: statusColumns[status] * 350, y: index * 150 + 50 },
        data: task,
        draggable: true,
      });
    });
  });

  return { initialNodes, initialEdges };
};


export function TaskDiagram() {
  const { selectedCompany } = useCompany();
  const { initialNodes, initialEdges } = useMemo(() => getNodesAndEdges(selectedCompany?.id || '1'), [selectedCompany]);
  
  const [nodes, setNodes] = React.useState<Node<Task>[]>(initialNodes);
  const [edges, setEdges] = React.useState<Edge[]>(initialEdges);

   React.useEffect(() => {
    const { initialNodes, initialEdges } = getNodesAndEdges(selectedCompany?.id || '1');
    setNodes(initialNodes);
    setEdges(initialEdges);
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
