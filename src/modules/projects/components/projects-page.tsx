import { GanttChart } from '@/modules/projects/components/gantt-chart';
import { CreateTaskSheet } from '@/modules/projects/components/create-task-sheet';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';

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
            <Button variant="outline"><PlusCircle className="mr-2 h-4 w-4" />New Project</Button>
            <CreateTaskSheet />
        </div>
      </div>
      <GanttChart />
    </div>
  );
}
