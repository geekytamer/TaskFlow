import { GanttChart } from '@/components/tasks/gantt-chart';
import { CreateTaskSheet } from '@/components/tasks/create-task-sheet';

export default function TasksPage() {
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
