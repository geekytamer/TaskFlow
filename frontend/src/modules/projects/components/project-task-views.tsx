'use client';

import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GanttChartIcon, LayoutGrid, ListTree } from 'lucide-react';
import { TaskList } from './task-list';
import { GanttChart } from './gantt-chart';
import type { Project } from '../types';
import { KanbanBoard } from './kanban-board';
import { useI18n } from '@/context/i18n-context';

interface ProjectTaskViewsProps {
    project: Project;
}

const VIEWS = ['list', 'kanban', 'gantt'] as const;
type ViewValue = (typeof VIEWS)[number];

export function ProjectTaskViews({ project }: ProjectTaskViewsProps) {
    const { language } = useI18n();
    const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
    const storageKey = `project-view:${project.id}`;

    const [view, setView] = React.useState<ViewValue>('list');

    // Restore the last-used view for this project.
    React.useEffect(() => {
        try {
            const stored = localStorage.getItem(storageKey) as ViewValue | null;
            if (stored && (VIEWS as readonly string[]).includes(stored)) {
                setView(stored);
            } else {
                setView('list');
            }
        } catch {
            setView('list');
        }
    }, [storageKey]);

    const handleChange = (value: string) => {
        setView(value as ViewValue);
        try {
            localStorage.setItem(storageKey, value);
        } catch {}
    };

    return (
        <Tabs value={view} onValueChange={handleChange} className="flex flex-col flex-1 h-full">
            <TabsList className="mb-4 self-start">
            <TabsTrigger value="list"><ListTree className="me-2 h-4 w-4" />{tr('List', 'قائمة')}</TabsTrigger>
            <TabsTrigger value="kanban"><LayoutGrid className="me-2 h-4 w-4" />{tr('Kanban', 'لوحة كانبان')}</TabsTrigger>
            <TabsTrigger value="gantt"><GanttChartIcon className="me-2 h-4 w-4" />{tr('Gantt', 'مخطط جانت')}</TabsTrigger>
            </TabsList>
            <TabsContent value="list" className="flex-1 overflow-auto">
                <TaskList projectId={project.id} />
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
