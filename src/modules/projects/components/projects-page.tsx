import { GanttChart } from '@/modules/projects/components/gantt-chart';
import { CreateTaskSheet } from '@/modules/projects/components/create-task-sheet';
import { CreateProjectSheet } from '@/modules/projects/components/create-project-sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProjectTable } from '@/modules/projects/components/project-table';
import { GanttChartIcon, TableIcon } from 'lucide-react';

export function ProjectsPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between pb-4">
        <div>
          <h1 className="text-3xl font-bold font-headline">Projects</h1>
          <p className="text-muted-foreground">
            Visualize and manage your team's work across projects.
          </p>
        </div>
        <div className="flex items-center gap-2">
            <CreateProjectSheet />
            <CreateTaskSheet />
        </div>
      </div>
      <Tabs defaultValue="gantt" className="flex flex-col flex-1">
        <TabsList className="mb-4 self-start">
          <TabsTrigger value="gantt"><GanttChartIcon className="mr-2 h-4 w-4" />Gantt</TabsTrigger>
          <TabsTrigger value="table"><TableIcon className="mr-2 h-4 w-4" />Table</TabsTrigger>
        </TabsList>
        <TabsContent value="gantt" className="flex-1 -m-4">
          <GanttChart />
        </TabsContent>
        <TabsContent value="table" className="flex-1 overflow-hidden">
          <ProjectTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
