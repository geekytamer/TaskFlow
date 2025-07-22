import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import type { Task } from '@/modules/tasks/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const priorityColors: Record<Task['priority'], string> = {
  High: 'bg-red-500',
  Medium: 'bg-yellow-500',
  Low: 'bg-green-500',
};

function TaskNode({ data }: NodeProps<Task>) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card className="w-80 shadow-lg border-2 border-transparent hover:border-primary transition-colors duration-200 cursor-pointer">
            <Handle type="target" position={Position.Left} className="!bg-primary" />
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base truncate">{data.title}</CardTitle>
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
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.description}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default memo(TaskNode);
