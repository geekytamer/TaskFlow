import { GanttChart } from '@/modules/projects/components/gantt-chart';
import { CreateTaskSheet } from '@/modules/projects/components/create-task-sheet';
import { CreateProjectSheet } from '@/modules/projects/components/create-project-sheet';

export function ProjectsPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between pb-4">
        <div>
          <h1 className="text-3xl font-bold font-headline">Project Gantt Chart</h1>
          <p className="text-muted-foreground">
            View your project timeline and task dependencies.
          </p>
        </div>
        <div className="flex items-center gap-2">
            <CreateProjectSheet />
            <CreateTaskSheet />
        </div>
      </div>
      <GanttChart />
    </div>
  );
}
