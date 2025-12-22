import { TaskDiagram } from '@/modules/diagram/components/task-diagram';

export function DiagramPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="pb-4">
        <h1 className="text-3xl font-bold font-headline">Task Diagram</h1>
        <p className="text-muted-foreground">
          Visualize task dependencies and workflow for the selected company.
        </p>
      </div>
      <div className="flex-1 rounded-lg border bg-card text-card-foreground shadow-sm">
        <TaskDiagram />
      </div>
    </div>
  );
}
