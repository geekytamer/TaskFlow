import { memo, useEffect, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import type { Task } from '@/modules/projects/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getProjectById } from '@/services/projectService';
import type { Project } from '@/modules/projects/types';

const priorityColors: Record<Task['priority'], string> = {
  High: 'bg-red-500',
  Medium: 'bg-yellow-500',
  Low: 'bg-green-500',
};

function TaskNode({ data }: NodeProps<Task>) {
  const [project, setProject] = useState<Project | undefined>(undefined);
  
  useEffect(() => {
    async function loadProject() {
        if(data.projectId) {
            const p = await getProjectById(data.projectId);
            setProject(p);
        }
    }
    loadProject();
  }, [data.projectId]);

  const borderColor = data.color || project?.color || 'transparent';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card 
            className="w-80 shadow-lg border-2 hover:border-primary transition-colors duration-200 cursor-pointer"
            style={{ borderColor }}
            >
            <Handle type="target" position={Position.Left} className="!bg-primary" />
            <CardHeader className="p-4 pb-2">
                <div className="flex items-center gap-2">
                    {project && <div className="h-3 w-3 rounded-full flex-shrink-0" style={{backgroundColor: project.color}} />}
                    <CardTitle className="text-base truncate">{data.title}</CardTitle>
                </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 flex items-center gap-2">
              <div
                  className={cn(
                    'h-3 w-3 rounded-full',
                    priorityColors[data.priority]
                  )}
                />
              <Badge variant="secondary">{data.status}</Badge>
              {data.tags.slice(0, 2).map(tag => <Badge key={tag} variant="outline">{tag}</Badge>)}
            </CardContent>
            <Handle type="source" position={Position.Right} className="!bg-primary" />
          </Card>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="max-w-xs">
            <p className="font-bold">{data.title}</p>
            {project && <p className="text-sm text-muted-foreground">Project: {project.name}</p>}
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.description}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default memo(TaskNode);
