'use client';

import * as React from 'react';
import { Plus, Shield, Trash2, Users, Lock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { actionLabel, moduleLabel } from '@/modules/permissions/lib/labels';
import { usePermissions } from '@/context/permissions-context';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  createPermissionGroup,
  deletePermissionGroup,
  fetchCatalogue,
  fetchPermissionGroups,
  setGroupImplications,
  setGroupPermissions,
  updatePermissionGroup,
  type PermissionGroup,
  type PermissionModule,
} from '@/services/permissionService';

const ACTION_ORDER = ['read', 'create', 'write', 'delete'];


export function PermissionsPage() {
  const { selectedCompany } = useCompany();
  const { refresh: refreshMyPermissions } = usePermissions();
  const { toast } = useToast();
  const { t } = useI18n();
  const confirm = useConfirm();

  const [modules, setModules] = React.useState<PermissionModule[]>([]);
  const [groups, setGroups] = React.useState<PermissionGroup[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState('');

  const companyId = selectedCompany?.id;

  /**
   * Ticking two boxes quickly used to lose one of them: each handler computed
   * the new set from the same render-time snapshot, so the second request
   * overwrote the first. Toggles now derive from a ref holding the latest
   * state, and the requests are chained so they reach the server in order.
   */
  const groupsRef = React.useRef(groups);
  React.useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  const saveChain = React.useRef<Promise<unknown>>(Promise.resolve());
  const inFlight = React.useRef(0);

  const selected = groups.find((g) => g.id === selectedId) ?? null;

  const load = React.useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [cat, list] = await Promise.all([fetchCatalogue(), fetchPermissionGroups(companyId)]);
      setModules(cat.modules);
      groupsRef.current = list;
      setGroups(list);
      setSelectedId((current) => current ?? list[0]?.id ?? null);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: t('perm.err.load'),
        description: error instanceof Error ? error.message : t('perm.err.unknown'),
      });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  /**
   * Permissions reaching this group through inheritance. Odoo makes you guess
   * why a user holds a right; showing inherited grants distinctly, with the
   * group they came from, is the whole point of this panel.
   */
  const inherited = React.useMemo(() => {
    if (!selected) return new Map<string, string>();
    const out = new Map<string, string>();
    const seen = new Set<string>();
    const walk = (groupId: string, viaName: string | null) => {
      if (seen.has(groupId)) return; // implication cycles are allowed to exist
      seen.add(groupId);
      const group = groups.find((g) => g.id === groupId);
      if (!group) return;
      if (viaName) group.permissions.forEach((p) => { if (!out.has(p)) out.set(p, viaName); });
      group.impliedGroupIds.forEach((childId) => {
        const child = groups.find((g) => g.id === childId);
        walk(childId, viaName ?? child?.name ?? group.name);
      });
    };
    walk(selected.id, null);
    return out;
  }, [selected, groups]);

  const updatePermissions = (change: (current: string[]) => string[]) => {
    if (!selected) return;
    const groupId = selected.id;

    const current = groupsRef.current.find((g) => g.id === groupId);
    if (!current) return;
    const updated = change(current.permissions);

    const optimistic = groupsRef.current.map((g) =>
      (g.id === groupId ? { ...g, permissions: updated } : g));
    groupsRef.current = optimistic;
    setGroups(optimistic);

    inFlight.current += 1;
    setSaving(true);
    saveChain.current = saveChain.current
      .then(() => setGroupPermissions(groupId, updated))
      .then(() => {
        refreshMyPermissions();
      })
      .catch(async (error: unknown) => {
        await load(); // roll the optimistic edit back to server truth
        toast({
          variant: 'destructive',
          title: t('perm.err.save'),
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      })
      .finally(() => {
        inFlight.current -= 1;
        if (inFlight.current === 0) setSaving(false);
      });
  };

  const togglePermission = (key: string, next: boolean) =>
    updatePermissions((current) => (next
      ? [...current.filter((p) => p !== key), key]
      : current.filter((p) => p !== key)));

  /** Grants every action of a module to the group, or clears them all. */
  const toggleModule = (keys: string[], grant: boolean) =>
    updatePermissions((current) => (grant
      ? [...new Set([...current, ...keys])]
      : current.filter((p) => !keys.includes(p))));

  const toggleInheritance = async (childId: string, next: boolean) => {
    if (!selected) return;
    const ids = next
      ? [...selected.impliedGroupIds, childId]
      : selected.impliedGroupIds.filter((id) => id !== childId);
    setSaving(true);
    try {
      await setGroupImplications(selected.id, ids);
      await load();
      refreshMyPermissions();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: t('perm.err.inheritance'),
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Saves one text field of a group when it loses focus.
   *
   * The fields are uncontrolled. An uncontrolled input follows its
   * defaultValue only until someone edits it; after that it keeps its own text.
   * An edit that ends where it started — type a character, delete it — saved
   * nothing and reloaded nothing, so switching groups left that field showing
   * the previous group's value, and the next blur saved it onto the newly
   * selected group. The fields are now keyed by group id (see CardContent
   * below), which remounts them clean on every switch. A refused save, such as
   * a duplicate name, restores the saved value and says why instead of failing
   * silently.
   */
  const saveGroupField = async (
    input: HTMLInputElement | HTMLTextAreaElement,
    groupId: string,
    field: 'name' | 'nameAr' | 'description',
    saved: string,
  ) => {
    const next = field === 'name' ? input.value.trim() : input.value;
    if (field === 'name' && !next) {
      input.value = saved;
      return;
    }
    if (next === saved) return;
    const update = field === 'name'
      ? { name: next }
      : field === 'nameAr'
        ? { nameAr: next }
        : { description: next };
    try {
      await updatePermissionGroup(groupId, update);
      toast({ title: t('perm.saved') });
      load();
    } catch (error) {
      input.value = saved;
      toast({
        variant: 'destructive',
        title: t('perm.err.save'),
        description: error instanceof Error ? error.message : t('perm.err.unknown'),
      });
    }
  };

  const handleCreate = async () => {
    if (!companyId || !newName.trim()) return;
    setCreating(true);
    try {
      const group = await createPermissionGroup(companyId, { name: newName.trim() });
      setNewName('');
      await load();
      setSelectedId(group.id);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: t('perm.err.create'),
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (group: PermissionGroup) => {
    const ok = await confirm({
      title: t('perm.deleteTitle', undefined, { name: group.name }),
      description: group.isSystem
        ? t('perm.deleteBuiltIn', undefined, { name: group.name })
        : t('perm.deleteNoMembers'),
      confirmText: t('common.delete', 'Delete'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await deletePermissionGroup(group.id);
      setSelectedId(null);
      await load();
      refreshMyPermissions();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: t('perm.err.delete'),
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const byGroup = React.useMemo(() => {
    const map = new Map<string, PermissionModule[]>();
    modules.forEach((m) => {
      if (!map.has(m.group)) map.set(m.group, []);
      map.get(m.group)!.push(m);
    });
    return map;
  }, [modules]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t('perm.loading')}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('perm.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('perm.subtitle')}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          {/* ── Group list ─────────────────────────────────────────── */}
          <Card className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('perm.groups')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 px-2">
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setSelectedId(group.id)}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    group.id === selectedId ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    {group.isSystem ? (
                      <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <Shield className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{group.name}</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {group.memberCount}
                  </span>
                </button>
              ))}

              <Separator className="my-2" />
              <div className="flex gap-2 px-1 pb-1">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  placeholder={t('perm.newGroupName')}
                  className="h-8 text-sm"
                />
                <Button size="sm" className="h-8 shrink-0" onClick={handleCreate} disabled={creating || !newName.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── Editor ─────────────────────────────────────────────── */}
          {selected ? (
            <div className="flex flex-col gap-6">
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 text-base">
                      {selected.name}
                      {selected.isSystem && <Badge variant="secondary">{t('perm.builtIn')}</Badge>}
                      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selected.memberCount === 1
                        ? t('perm.memberCountOne')
                        : t('perm.memberCount', undefined, { count: selected.memberCount })}
                      {' · '}
                      {selected.permissions.length === 1
                        ? t('perm.directCountOne')
                        : t('perm.directCount', undefined, { count: selected.permissions.length })}
                      {inherited.size > 0
                        && ` · ${t('perm.inheritedCount', undefined, { count: inherited.size })}`}
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t('perm.deleteGroup')}
                          disabled={selected.memberCount > 0}
                          onClick={() => handleDelete(selected)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {selected.memberCount > 0 && (
                      <TooltipContent>
                        {t('perm.deleteBlockedMembers', undefined, { count: selected.memberCount })}
                      </TooltipContent>
                    )}
                  </Tooltip>
                </CardHeader>
                {/* Keyed by group: an edited uncontrolled field ignores later defaultValues, so remount per group. */}
                <CardContent key={selected.id} className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="group-name">{t('perm.name')}</Label>
                    <Input
                      id="group-name"
                      defaultValue={selected.name}
                      maxLength={80}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      onBlur={(e) => saveGroupField(e.currentTarget, selected.id, 'name', selected.name)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="group-name-ar">{t('perm.nameAr')}</Label>
                    <Input
                      id="group-name-ar"
                      dir="rtl"
                      defaultValue={selected.nameAr ?? ''}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      onBlur={(e) => saveGroupField(e.currentTarget, selected.id, 'nameAr', selected.nameAr ?? '')}
                    />
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="group-desc">{t('perm.description')}</Label>
                    <Textarea
                      id="group-desc"
                      rows={2}
                      defaultValue={selected.description ?? ''}
                      onBlur={(e) => saveGroupField(e.currentTarget, selected.id, 'description', selected.description ?? '')}
                    />
                  </div>
                </CardContent>
              </Card>

              {groups.length > 1 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t('perm.inheritsFrom')}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {t('perm.inheritsHint', undefined, { name: selected.name })}
                    </p>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-x-6 gap-y-2">
                    {groups.filter((g) => g.id !== selected.id).map((g) => (
                      <label key={g.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <Checkbox
                          checked={selected.impliedGroupIds.includes(g.id)}
                          onCheckedChange={(v) => toggleInheritance(g.id, v === true)}
                        />
                        {g.name}
                      </label>
                    ))}
                  </CardContent>
                </Card>
              )}

              {[...byGroup.entries()].map(([groupKey, groupModules]) => (
                <Card key={groupKey}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t(`perm.group.${groupKey}`, groupKey)}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {groupModules.map((module) => {
                      const sorted = [...module.actions].sort((a, b) => {
                        const ai = ACTION_ORDER.indexOf(a);
                        const bi = ACTION_ORDER.indexOf(b);
                        if (ai !== -1 && bi !== -1) return ai - bi;
                        if (ai !== -1) return -1;
                        if (bi !== -1) return 1;
                        return a.localeCompare(b);
                      });
                      return (
                        <div key={module.key} className="grid gap-2 sm:grid-cols-[170px_1fr] sm:items-start">
                          {(() => {
                            const keys = sorted.map((action) => `${module.key}:${action}`);
                            const held = keys.filter((k) => selected.permissions.includes(k) || inherited.has(k));
                            const state = held.length === 0 ? false : held.length === keys.length ? true : 'indeterminate';
                            const onlyInherited = keys.every((k) => inherited.has(k) && !selected.permissions.includes(k));
                            return (
                              <label className="flex cursor-pointer items-center gap-2 pt-0.5 text-sm font-medium">
                                <Checkbox
                                  checked={state}
                                  disabled={onlyInherited}
                                  aria-label={t('perm.moduleAll', undefined, { module: moduleLabel(module.key, t) })}
                                  onCheckedChange={() => toggleModule(keys, state !== true)}
                                />
                                {moduleLabel(module.key, t)}
                              </label>
                            );
                          })()}
                          <div className="flex flex-wrap gap-x-5 gap-y-2">
                            {sorted.map((action) => {
                              const key = `${module.key}:${action}`;
                              const isDirect = selected.permissions.includes(key);
                              const via = inherited.get(key);
                              const checkbox = (
                                <label
                                  key={key}
                                  className="flex cursor-pointer items-center gap-1.5 text-sm"
                                >
                                  <Checkbox
                                    checked={isDirect || Boolean(via)}
                                    disabled={!isDirect && Boolean(via)}
                                    onCheckedChange={(v) => togglePermission(key, v === true)}
                                    className={!isDirect && via ? 'opacity-50' : undefined}
                                  />
                                  <span className={!isDirect && via ? 'text-muted-foreground' : undefined}>
                                    {actionLabel(action, t)}
                                  </span>
                                </label>
                              );
                              return via && !isDirect ? (
                                <Tooltip key={key}>
                                  <TooltipTrigger asChild>{checkbox}</TooltipTrigger>
                                  <TooltipContent>{t('perm.inheritedFrom', undefined, { name: via })}</TooltipContent>
                                </Tooltip>
                              ) : (
                                checkbox
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="flex h-48 items-center justify-center">
              <p className="text-sm text-muted-foreground">{t('perm.selectGroup')}</p>
            </Card>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
