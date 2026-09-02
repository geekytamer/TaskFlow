'use client';

import * as React from 'react';
import { Loader2, ShieldCheck, Lock } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/context/i18n-context';
import { usePermissions } from '@/context/permissions-context';
import { actionLabels, moduleLabel } from '@/modules/permissions/lib/labels';
import {
  fetchPermissionGroups,
  fetchUserGroups,
  setUserGroups,
  type PermissionGroup,
} from '@/services/permissionService';

interface UserGroupsSheetProps {
  userId: string;
  userName: string;
  companyId: string;
  companyName: string;
  canEdit: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/**
 * Resolves what a selection of groups actually grants, following inheritance,
 * so the effect of a change is visible before it is saved. Mirrors the
 * recursive CTE the server uses; the server remains authoritative.
 */
function resolveEffective(groups: PermissionGroup[], selectedIds: string[]): Set<string> {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const out = new Set<string>();
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return; // implication cycles are permitted to exist
    seen.add(id);
    const group = byId.get(id);
    if (!group) return;
    group.permissions.forEach((p) => out.add(p));
    group.impliedGroupIds.forEach(walk);
  };
  selectedIds.forEach(walk);
  return out;
}

export function UserGroupsSheet({
  userId,
  userName,
  companyId,
  companyName,
  canEdit,
  open,
  onOpenChange,
  onSaved,
}: UserGroupsSheetProps) {
  const { toast } = useToast();
  const { language, t } = useI18n();
  const { refresh: refreshMyPermissions } = usePermissions();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);

  const [groups, setGroups] = React.useState<PermissionGroup[]>([]);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [initial, setInitial] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open || !companyId) return;
    let active = true;
    setLoading(true);
    Promise.all([fetchPermissionGroups(companyId), fetchUserGroups(companyId, userId)])
      .then(([all, mine]) => {
        if (!active) return;
        const ids = mine.groups.map((g) => g.id);
        setGroups(all);
        setSelected(ids);
        setInitial(ids);
      })
      .catch((error: unknown) => {
        if (!active) return;
        toast({
          variant: 'destructive',
          title: tr('Could not load groups', 'تعذر تحميل المجموعات'),
          description: error instanceof Error ? error.message : tr('Unknown error', 'خطأ غير معروف'),
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, companyId, userId]);

  const effective = React.useMemo(
    () => resolveEffective(groups, selected),
    [groups, selected],
  );

  const byModule = React.useMemo(() => {
    const map = new Map<string, string[]>();
    [...effective].sort().forEach((key) => {
      const [module, action] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
      if (!map.has(module)) map.set(module, []);
      map.get(module)!.push(action);
    });
    return map;
  }, [effective]);

  const dirty =
    selected.length !== initial.length || selected.some((id) => !initial.includes(id));

  const handleSave = async () => {
    setSaving(true);
    try {
      await setUserGroups(companyId, userId, selected);
      setInitial(selected);
      refreshMyPermissions();
      toast({
        title: tr('Groups updated', 'تم تحديث المجموعات'),
        description: tr(
          `${userName} now has ${effective.size} permissions in ${companyName}.`,
          `${userName} لديه الآن ${effective.size} صلاحية في ${companyName}.`,
        ),
      });
      onSaved?.();
      onOpenChange(false);
    } catch (error: unknown) {
      // The server refuses changes that would leave the company with nobody
      // able to administer it, and refuses self-demotion. Surface its wording.
      toast({
        variant: 'destructive',
        title: tr('Could not update groups', 'تعذر تحديث المجموعات'),
        description: error instanceof Error ? error.message : tr('Unknown error', 'خطأ غير معروف'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{tr('Permission groups', 'مجموعات الصلاحيات')}</SheetTitle>
          <SheetDescription>
            {tr(
              `Which groups ${userName} belongs to in ${companyName}. Their access is the union of every group selected.`,
              `المجموعات التي ينتمي إليها ${userName} في ${companyName}. صلاحياته هي مجموع كل المجموعات المختارة.`,
            )}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {tr('Loading…', 'جارٍ التحميل…')}
          </div>
        ) : (
          <ScrollArea className="-mx-6 flex-1 px-6">
            <div className="flex flex-col gap-2 py-4">
              {groups.map((group) => (
                <label
                  key={group.id}
                  className={`flex items-start gap-3 rounded-md border p-3 text-sm ${
                    canEdit ? 'cursor-pointer hover:bg-muted/50' : 'opacity-70'
                  }`}
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={selected.includes(group.id)}
                    disabled={!canEdit}
                    onCheckedChange={(value) =>
                      setSelected((prev) =>
                        (value === true
                          ? [...prev, group.id]
                          : prev.filter((id) => id !== group.id)))}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-medium">
                      {group.isSystem ? (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {language === 'ar' && group.nameAr ? group.nameAr : group.name}
                      {group.isSystem && (
                        <Badge variant="secondary" className="font-normal">
                          {t('perm.builtIn', 'Built-in')}
                        </Badge>
                      )}
                    </span>
                    {group.description && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {group.description}
                      </span>
                    )}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {tr(
                        `${group.permissions.length} permissions`,
                        `${group.permissions.length} صلاحية`,
                      )}
                      {group.impliedGroupIds.length > 0
                        && ` · ${tr('inherits', 'ترث')} ${group.impliedGroupIds.length}`}
                    </span>
                  </span>
                </label>
              ))}

              {groups.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr('This company has no permission groups.', 'لا توجد مجموعات صلاحيات لهذه الشركة.')}
                </p>
              )}

              <Separator className="my-3" />

              <div>
                <p className="text-sm font-medium">
                  {tr('Resulting access', 'الصلاحيات الناتجة')}
                  <span className="ms-2 font-normal text-muted-foreground">
                    {tr(`${effective.size} permissions`, `${effective.size} صلاحية`)}
                  </span>
                </p>
                {effective.size === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {tr(
                      'No access. This person will not be able to open any module.',
                      'لا صلاحيات. لن يتمكن هذا الشخص من فتح أي وحدة.',
                    )}
                  </p>
                ) : (
                  <div className="mt-2 flex flex-col gap-1">
                    {[...byModule.entries()].map(([module, actions]) => (
                      <div key={module} className="flex gap-2 text-xs">
                        <span className="w-28 shrink-0 font-medium">{moduleLabel(module, t)}</span>
                        <span className="text-muted-foreground">
                          {actionLabels(actions, t).join(', ')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}

        <SheetFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tr('Close', 'إغلاق')}
          </Button>
          {canEdit && (
            <Button onClick={handleSave} disabled={!dirty || saving || loading}>
              {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {tr('Save groups', 'حفظ المجموعات')}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
