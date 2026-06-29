'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Globe, Lock } from 'lucide-react';
import { getClients } from '@/services/financeService';
import type { Client } from '@/modules/finance/types';
import { canViewProject } from '@/modules/projects/lib/access';

export function ProjectList() {
  const { selectedCompany, projects, currentUser, currentRole, loading } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [clients, setClients] = React.useState<Client[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    const loadClients = async () => {
      if (!selectedCompany) {
        setClients([]);
        return;
      }
      if (currentRole === 'Employee') {
        setClients([]);
        return;
      }
      try {
        const data = await getClients(selectedCompany.id);
        if (!cancelled) setClients(data);
      } catch {
        if (!cancelled) setClients([]);
      }
    };
    loadClients();
    return () => {
      cancelled = true;
    };
  }, [currentRole, selectedCompany]);

  const visibleProjects = React.useMemo(() => {
    if (!currentUser || !selectedCompany) return [];
    return projects.filter(
      (p) =>
        p.companyId === selectedCompany.id &&
        canViewProject(p, currentUser.id, currentRole)
    ).sort((a,b) => a.name.localeCompare(b.name));
  }, [projects, currentUser, currentRole, selectedCompany]);
  
  if (loading) {
      return (
           <div className="flex w-max gap-4 pb-4">
               {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className='w-[280px] h-[130px]' />
               ))}
           </div>
      )
  }

  return (
    <div>
        <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex w-max gap-4 pb-4">
                {visibleProjects.map((project) => (
                    <a href={`/projects/${project.id}`} key={project.id}>
                        {(() => {
                            const client = clients.find((entry) => entry.id === project.clientId);
                            return (
                        <Card
                            className='w-[280px] h-[130px] cursor-pointer hover:border-primary transition-colors flex flex-col'
                        >
                            <CardHeader className="flex-1">
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{backgroundColor: project.color}} />
                                    <CardTitle className="truncate text-lg">{project.name}</CardTitle>
                                </div>
                                <CardDescription className="line-clamp-2 h-10 whitespace-normal">{project.description}</CardDescription>
                            </CardHeader>
                            <div className="px-6 pb-4">
                                <div className="flex flex-wrap gap-2">
                                    <Badge variant={project.visibility === 'Private' ? 'secondary' : 'outline'}>
                                    {project.visibility === 'Private' ? <Lock className="me-1 h-3 w-3" /> : <Globe className="me-1 h-3 w-3" />}
                                    {project.visibility === 'Private' ? tr('Private', 'خاص') : tr('Public', 'عام')}
                                    </Badge>
                                    {client && <Badge variant="outline">{client.name}</Badge>}
                                </div>
                            </div>
                        </Card>
                            );
                        })()}
                    </a>
                ))}
            </div>
            <ScrollBar orientation="horizontal" />
        </ScrollArea>
    </div>
  );
}
