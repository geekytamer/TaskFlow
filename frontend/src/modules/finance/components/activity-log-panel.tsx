'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompany } from '@/context/company-context';
import { useToast } from '@/hooks/use-toast';
import { downloadReportExport, getActivityEvents } from '@/services/financeService';
import { getUsersByCompany } from '@/services/userService';
import type { ActivityEvent } from '@/modules/finance/types';
import type { User } from '@/modules/users/types';
import { Download } from 'lucide-react';
import { useI18n } from '@/context/i18n-context';

const entityTypes: Array<ActivityEvent['entityType']> = [
  'client',
  'project',
  'task',
  'supplier',
  'inventory_item',
  'purchase_order',
  'invoice',
  'vendor_bill',
];

export function ActivityLogPanel() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [events, setEvents] = React.useState<ActivityEvent[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [entityType, setEntityType] = React.useState<'all' | ActivityEvent['entityType']>('all');
  const [actorUserId, setActorUserId] = React.useState<string>('all');
  const [entityId, setEntityId] = React.useState('');

  const load = React.useCallback(async () => {
    if (!selectedCompany) {
      setEvents([]);
      setUsers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [eventData, userData] = await Promise.all([
        getActivityEvents(selectedCompany.id, {
          entityType: entityType === 'all' ? undefined : entityType,
          actorUserId: actorUserId === 'all' ? undefined : actorUserId,
          entityId: entityId.trim() || undefined,
          limit: 100,
        }),
        getUsersByCompany(selectedCompany.id),
      ]);
      setEvents(eventData);
      setUsers(userData);
    } catch (error: any) {
      setEvents([]);
      setUsers([]);
      toast({
        variant: 'destructive',
        title: tr('Activity log unavailable', 'سجل النشاط غير متاح'),
        description: error?.message || tr('Could not load activity log.', 'تعذّر تحميل سجل النشاط.'),
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, entityType, actorUserId, entityId, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const actorNameMap = React.useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((user) => map.set(user.id, user.name));
    return map;
  }, [users]);

  const handleExport = async () => {
    if (!selectedCompany) return;
    try {
      await downloadReportExport(selectedCompany.id, 'activity-log');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Export failed', 'فشل التصدير'),
        description: error?.message || tr('Could not export activity log.', 'تعذّر تصدير سجل النشاط.'),
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!selectedCompany) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          {tr('Select a company to view the activity log.', 'اختر شركة لعرض سجل النشاط.')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_220px_220px_auto]">
        <div className="space-y-1">
          <Label>{tr('Record Id', 'معرّف السجل')}</Label>
          <Input
            value={entityId}
            onChange={(event) => setEntityId(event.target.value)}
            placeholder={tr('Filter by record id', 'التصفية حسب معرّف السجل')}
          />
        </div>
        <div className="space-y-1">
          <Label>{tr('Entity Type', 'نوع العنصر')}</Label>
          <Select value={entityType} onValueChange={(value) => setEntityType(value as typeof entityType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr('All entities', 'جميع العناصر')}</SelectItem>
              {entityTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type.replace('_', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{tr('Actor', 'المنفّذ')}</Label>
          <Select value={actorUserId} onValueChange={setActorUserId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr('All users', 'جميع المستخدمين')}</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <Button variant="outline" onClick={load}>{tr('Apply', 'تطبيق')}</Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="me-2 h-4 w-4" />
            {tr('Export CSV', 'تصدير CSV')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{tr('Activity Log', 'سجل النشاط')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tr('When', 'الوقت')}</TableHead>
                  <TableHead>{tr('Actor', 'المنفّذ')}</TableHead>
                  <TableHead>{tr('Entity', 'العنصر')}</TableHead>
                  <TableHead>{tr('Record', 'السجل')}</TableHead>
                  <TableHead>{tr('Action', 'الإجراء')}</TableHead>
                  <TableHead>{tr('Summary', 'الملخّص')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>{format(event.createdAt, 'MMM d, yyyy h:mm a')}</TableCell>
                    <TableCell>{event.actorName || actorNameMap.get(event.actorUserId || '') || tr('System', 'النظام')}</TableCell>
                    <TableCell>{event.entityType.replace('_', ' ')}</TableCell>
                    <TableCell className="font-mono text-xs">{event.entityId}</TableCell>
                    <TableCell>{event.action}</TableCell>
                    <TableCell>{event.summary}</TableCell>
                  </TableRow>
                ))}
                {events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                      {tr('No activity matches the current filters.', 'لا يوجد نشاط مطابق لعوامل التصفية الحالية.')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
