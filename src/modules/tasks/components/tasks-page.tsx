import { GanttChart } from '@/modules/tasks/components/gantt-chart';
import { CreateTaskSheet } from '@/modules/tasks/components/create-task-sheet';

export function TasksPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between pb-4">
        <div>
          <h1 className="text-3xl font-bold font-headline">Task Gantt Chart</h1>
          <p className="text-muted-foreground">
            View your project timeline and task dependencies.
          </p>
        </div>
        <CreateTaskSheet />
      </div>
      <GanttChart />
    </div>
  );
}
