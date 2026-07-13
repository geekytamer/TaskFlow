'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import {
  getEmployees, getAttendance, upsertAttendance,
  type Employee, type AttendanceRecord, type AttendanceStatus,
} from '@/services/hrService';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const STATUSES: AttendanceStatus[] = ['present', 'absent', 'leave', 'holiday'];

export function AttendancePage() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const companyId = selectedCompany?.id;

  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [records, setRecords] = React.useState<Record<string, AttendanceRecord>>({});
  const [loading, setLoading] = React.useState(true);

  const statusLabel: Record<AttendanceStatus, string> = {
    present: tr('Present', 'حاضر'),
    absent: tr('Absent', 'غائب'),
    leave: tr('Leave', 'إجازة'),
    holiday: tr('Holiday', 'عطلة'),
  };

  const load = React.useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [emps, recs] = await Promise.all([
        getEmployees(companyId),
        getAttendance(companyId, { from: date, to: date }),
      ]);
      setEmployees(emps.filter((e) => e.status === 'Active'));
      const map: Record<string, AttendanceRecord> = {};
      recs.forEach((r) => { map[r.employeeId] = r; });
      setRecords(map);
    } catch {
      setEmployees([]); setRecords({});
    } finally {
      setLoading(false);
    }
  }, [companyId, date]);

  React.useEffect(() => { load(); }, [load]);

  const setStatus = async (employeeId: string, status: AttendanceStatus) => {
    if (!companyId) return;
    const prev = records[employeeId];
    const hours = status === 'present' ? (prev?.hours || 8) : 0;
    // Optimistic.
    setRecords((p) => ({ ...p, [employeeId]: { ...(prev as any), employeeId, date, status, hours } }));
    try {
      const rec = await upsertAttendance(companyId, { employeeId, date, status, hours });
      setRecords((p) => ({ ...p, [employeeId]: rec }));
    } catch (e: any) {
      toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message });
      load();
    }
  };

  const setHours = async (employeeId: string, hours: number) => {
    if (!companyId) return;
    const status = records[employeeId]?.status || 'present';
    try {
      const rec = await upsertAttendance(companyId, { employeeId, date, status, hours });
      setRecords((p) => ({ ...p, [employeeId]: rec }));
    } catch (e: any) {
      toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">{tr('Attendance', 'الحضور')}</h1>
        <p className="text-muted-foreground mt-1">
          {tr('Record daily attendance for your team.', 'سجّل الحضور اليومي لفريقك.')}
        </p>
      </div>

      <div className="flex items-end gap-3 rounded-lg border bg-card p-4">
        <div className="grid gap-1.5">
          <Label className="text-xs">{tr('Date', 'التاريخ')}</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : employees.length === 0 ? (
        <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          {tr('No active employees.', 'لا يوجد موظفون نشطون.')}
        </p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr('Employee', 'الموظف')}</TableHead>
                <TableHead className="w-[200px]">{tr('Status', 'الحالة')}</TableHead>
                <TableHead className="w-[120px]">{tr('Hours', 'الساعات')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e) => {
                const rec = records[e.id];
                return (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div className="font-medium">{e.name}</div>
                      {e.jobTitle && <div className="text-xs text-muted-foreground">{e.jobTitle}</div>}
                    </TableCell>
                    <TableCell>
                      <Select value={rec?.status || ''} onValueChange={(v) => setStatus(e.id, v as AttendanceStatus)}>
                        <SelectTrigger><SelectValue placeholder={tr('Not recorded', 'غير مسجّل')} /></SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" min={0} max={24}
                        value={rec?.hours ?? ''}
                        disabled={!rec || rec.status !== 'present'}
                        onChange={(ev) => setRecords((p) => ({ ...p, [e.id]: { ...(rec as any), hours: Number(ev.target.value) } }))}
                        onBlur={(ev) => rec && setHours(e.id, Number(ev.target.value))}
                        className="w-20"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
