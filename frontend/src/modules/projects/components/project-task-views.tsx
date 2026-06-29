'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GanttChartIcon, LayoutGrid, TableIcon } from 'lucide-react';
import { ProjectTable } from './project-table';
import { GanttChart } from './gantt-chart';
import type { Project } from '../types';
import { KanbanBoard } from './kanban-board';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useI18n } from '@/context/i18n-context';

interface ProjectTaskViewsProps {
    project: Project;
}

export function ProjectTaskViews({ project }: ProjectTaskViewsProps) {
    const { language } = useI18n();
    const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
    return (
        <Tabs defaultValue="table" className="flex flex-col flex-1 h-full">
            <TabsList className="mb-4 self-start">
            <TabsTrigger value="table"><TableIcon className="me-2 h-4 w-4" />{tr('Table', 'جدول')}</TabsTrigger>
            <TabsTrigger value="kanban"><LayoutGrid className="me-2 h-4 w-4" />{tr('Kanban', 'لوحة كانبان')}</TabsTrigger>
            <TabsTrigger value="gantt"><GanttChartIcon className="me-2 h-4 w-4" />{tr('Gantt', 'مخطط جانت')}</TabsTrigger>
            </TabsList>
            <TabsContent value="table" className="flex-1 overflow-hidden">
                <ProjectTable projectId={project.id} />
            </TabsContent>
             <TabsContent value="kanban" className="flex-1 overflow-x-auto">
                <KanbanBoard projectId={project.id} />
            </TabsContent>
            <TabsContent value="gantt" className="w-full">
                <GanttChart projectId={project.id} />
            </TabsContent>
      </Tabs>
    )
}
