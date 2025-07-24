'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GanttChartIcon, TableIcon } from 'lucide-react';
import { ProjectTable } from './project-table';
import { GanttChart } from './gantt-chart';
import type { Project } from '../types';

interface ProjectTaskViewsProps {
    project: Project;
}

export function ProjectTaskViews({ project }: ProjectTaskViewsProps) {
    return (
        <Tabs defaultValue="table" className="flex flex-col flex-1 h-full">
            <TabsList className="mb-4 self-start">
            <TabsTrigger value="table"><TableIcon className="mr-2 h-4 w-4" />Table</TabsTrigger>
            <TabsTrigger value="gantt"><GanttChartIcon className="mr-2 h-4 w-4" />Gantt</TabsTrigger>
            </TabsList>
            <TabsContent value="table" className="flex-1 overflow-hidden">
                <ProjectTable projectId={project.id} />
            </TabsContent>
            <TabsContent value="gantt" className="flex-1 -mt-6">
                <GanttChart projectId={project.id} />
            </TabsContent>
      </Tabs>
    )
}
