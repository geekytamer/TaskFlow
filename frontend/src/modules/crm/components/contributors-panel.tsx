'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import {
  contributionRoles,
  deleteContribution,
  getContributions,
  setContribution,
  type Contribution,
  type ContributionRole,
  type ContributionSourceType,
} from '@/services/crmService';
import { getUsersByCompany } from '@/services/userService';
import type { User } from '@/modules/users/types';
import { PlusCircle, Trash2, Users } from 'lucide-react';

interface ContributorsPanelProps {
  companyId: string;
  sourceType: ContributionSourceType;
  sourceId: string;
  /** Read-only display when the current user can't edit. */
  readOnly?: boolean;
  /** Compact rendering for embedding inside a side panel. */
  compact?: boolean;
}

/**
 * Reusable contributors widget. Lists everyone sharing commission on a
 * given source entity (opportunity / project / task / invoice) and lets
 * a manager add or adjust contributions. Σweights ≤ 100% is enforced
 * by the backend; we surface that error inline if it fires.
 */
export function ContributorsPanel({
  companyId,
  sourceType,
  sourceId,
  readOnly = false,
  compact = false,
}: ContributorsPanelProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [items, setItems] = React.useState<Contribution[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Contribution | null>(null);
  const [form, setForm] = React.useState({
    userId: '',
    role: 'Contributor' as ContributionRole,
    weightPercent: '100',
    roleNote: '',
  });

  const load = React.useCallback(async () => {
    if (!companyId || !sourceId) return;
    setLoading(true);
    try {
      const [rows, allUsers] = await Promise.all([
        getContributions(companyId, { sourceType, sourceId }),
        getUsersByCompany(companyId),
      ]);
      setItems(rows);
      setUsers(allUsers);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: error?.message,
      });
    } finally {
      setLoading(false);
    }
  }, [companyId, sourceType, sourceId, toast, t]);

  React.useEffect(() => {
    load();
  }, [load]);

  const used = items.reduce((sum, c) => sum + (c.weightPercent || 0), 0);
  const remaining = Math.max(0, 100 - used);

  const openAdd = () => {
    setEditing(null);
    setForm({
      userId: '',
      role: defaultRoleFor(sourceType),
      weightPercent: String(remaining || 100),
      roleNote: '',
    });
    setOpen(true);
  };

  const openEdit = (row: Contribution) => {
    setEditing(row);
    setForm({
      userId: row.userId,
      role: row.role,
      weightPercent: String(row.weightPercent),
      roleNote: row.roleNote || '',
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.userId) {
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: t('contributors.userRequired'),
      });
      return;
    }
    const user = users.find((u) => u.id === form.userId);
    try {
      await setContribution(companyId, {
        userId: form.userId,
        userName: user?.name,
        sourceType,
        sourceId,
        role: form.role,
        weightPercent: Number(form.weightPercent) || 0,
        roleNote: form.role === 'Other' ? form.roleNote || undefined : undefined,
      });
      setOpen(false);
      await load();
      toast({ title: t('contributors.saved') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: error?.message,
      });
    }
  };

  const handleRemove = async (row: Contribution) => {
    if (!window.confirm(t('contributors.removeConfirm').replace('{name}', row.userName || row.userId))) {
      return;
    }
    try {
      await deleteContribution(row.id);
      await load();
      toast({ title: t('contributors.removed') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: error?.message,
      });
    }
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">{t('contributors.title')}</h4>
          <Badge variant="outline" className="text-[10px]">
            {used.toFixed(0)}% / 100%
          </Badge>
        </div>
        {!readOnly && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" onClick={openAdd} className="h-7 gap-1 text-xs">
                <PlusCircle className="h-3.5 w-3.5" />
                {t('contributors.add')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editing ? t('contributors.editTitle') : t('contributors.addTitle')}
                </DialogTitle>
                <DialogDescription>{t('contributors.formDescription')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1">
                  <Label>{t('contributors.user')}</Label>
                  <Select
                    value={form.userId}
                    onValueChange={(v) => setForm((p) => ({ ...p, userId: v }))}
                    disabled={!!editing}
                  >
                    <SelectTrigger><SelectValue placeholder={t('contributors.pickUser')} /></SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} {!u.commissionEligible && (
                            <span className="text-xs text-muted-foreground"> · {t('contributors.notEligible')}</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t('contributors.role')}</Label>
                  <Select
                    value={form.role}
                    onValueChange={(v) => setForm((p) => ({ ...p, role: v as ContributionRole }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {contributionRoles.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.role === 'Other' && (
                  <div className="space-y-1">
                    <Label>{t('contributors.roleNote')}</Label>
                    <Input
                      value={form.roleNote}
                      onChange={(e) => setForm((p) => ({ ...p, roleNote: e.target.value }))}
                      placeholder={t('contributors.roleNotePlaceholder')}
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label>
                    {t('contributors.weight')} <span className="text-xs text-muted-foreground">({t('contributors.remaining').replace('{n}', String(remaining))})</span>
                  </Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={form.weightPercent}
                    onChange={(e) => setForm((p) => ({ ...p, weightPercent: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
                <Button onClick={handleSave}>{t('common.save')}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {loading && (
        <div className="text-xs text-muted-foreground">{t('common.loading')}</div>
      )}

      {!loading && items.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          {t('contributors.empty')}
        </p>
      )}

      {!loading && items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((row) => (
            <li key={row.id} className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {row.userName || row.userId}{' '}
                  <span className="text-xs text-muted-foreground">· {row.role}</span>
                  {row.roleNote && (
                    <span className="text-xs text-muted-foreground"> · {row.roleNote}</span>
                  )}
                </div>
              </div>
              <Badge variant="outline" className="text-xs">{row.weightPercent}%</Badge>
              {!readOnly && (
                <>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEdit(row)}>
                    <span className="text-xs">⋯</span>
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => handleRemove(row)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function defaultRoleFor(sourceType: ContributionSourceType): ContributionRole {
  switch (sourceType) {
    case 'opportunity': return 'Sales';
    case 'project':     return 'Project Lead';
    case 'task':        return 'Contributor';
    case 'invoice':     return 'Account Manager';
    default:            return 'Contributor';
  }
}
