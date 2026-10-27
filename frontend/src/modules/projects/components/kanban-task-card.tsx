'use client';

import * as React from 'react';
import { getCurrentLocale } from '@/lib/locale';
import type { Task } from '@/modules/projects/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getCompanyPeople, type PersonSummary } from '@/services/userService';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { CheckCircle2, ListChecks } from 'lucide-react';
import { PRIORITY_DOT, formatTaskDates, partsProgress, priorityName, statusName, taskSpanDays } from '@/modules/projects/lib/task-meta';


interface KanbanTaskCardProps {
    task: Task;
}

export function KanbanTaskCard({ task }: KanbanTaskCardProps) {
    const [users, setUsers] = React.useState<PersonSummary[]>([]);
    const { selectedCompany } = useCompany();
    const { language } = useI18n();
    const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
    const progress = partsProgress(task);
    const partOf = (userId: string) => task.parts?.find((p) => p.userId === userId);

    React.useEffect(() => {
        async function loadUsers() {
            const companyId = selectedCompany?.id || task.companyId;
            if (!companyId) {
                setUsers([]);
                return;
            }
            try {
                const companyUsers = await getCompanyPeople(companyId);
                const assigned = companyUsers.filter(u => task.assignedUserIds?.includes(u.id));
                setUsers(assigned);
            } catch (error) {
                console.error('Failed to load task assignees', error);
                setUsers([]);
            }
        }
        loadUsers();
    }, [selectedCompany, task.assignedUserIds, task.companyId]);

    return (
        <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="p-3 pb-2">
                <div className="flex justify-between items-start">
                     <h4 className="font-semibold text-sm">{task.title}</h4>
                     <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger>
                                <div className={`h-3 w-3 rounded-full ${PRIORITY_DOT[task.priority]}`} />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{tr(`${priorityName(task.priority, 'en')} priority`, `أولوية ${priorityName(task.priority, 'ar')}`)}</p>
                            </TooltipContent>
                        </Tooltip>
                     </TooltipProvider>
                </div>
            </CardHeader>
            <CardContent className="p-3 pt-0">
                <div className="flex flex-wrap gap-1 mb-3">
                    {progress.total > 0 && (
                        <Badge variant="outline" className="gap-1 font-medium" title={tr('Parts finished', 'الأجزاء المنجزة')}>
                            <CheckCircle2 className="h-3 w-3" />
                            {progress.done}/{progress.total}
                        </Badge>
                    )}
                    {(task.checklist?.total ?? 0) > 0 && (
                        <Badge variant="outline" className="gap-1 font-medium" title={tr('Checklist', 'قائمة التحقق')}>
                            <ListChecks className="h-3 w-3" />
                            {task.checklist!.done}/{task.checklist!.total}
                        </Badge>
                    )}
                    {task.tags.map(tag => (
                        <Badge key={tag} variant="secondary">{tag}</Badge>
                    ))}
                </div>
                <div className="flex justify-between items-center">
                    <p className="text-xs text-muted-foreground">
                        {task.dueDate && (
                            <bdi>
                                {formatTaskDates(task, getCurrentLocale())}
                                {taskSpanDays(task) > 1 && ` · ${tr(`${taskSpanDays(task)} days`, `${taskSpanDays(task)} أيام`)}`}
                            </bdi>
                        )}
                    </p>
                    <div className="flex -space-x-2 rtl:space-x-reverse">
                        {users.map(user => (
                             <TooltipProvider key={user.id}>
                                <Tooltip>
                                    <TooltipTrigger className="relative">
                                        <Avatar className="h-6 w-6 border-2 border-background">
                                            <AvatarImage src={user.avatar} />
                                            <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        {partOf(user.id)?.status === 'Done' && (
                                            <CheckCircle2 className="absolute -bottom-1 -end-1 h-3.5 w-3.5 rounded-full bg-background text-emerald-500" aria-label={tr('Part done', 'أنهى جزءه')} />
                                        )}
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>{user.name}{partOf(user.id)?.label ? ` · ${partOf(user.id)!.label}` : ''}{partOf(user.id) ? ` · ${statusName(partOf(user.id)!.status, language)}` : ''}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
