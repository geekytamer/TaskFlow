'use client';

/**
 * Settings → Roles: every role of the company as a card ("Accountant ·
 * 4 people"). Standard roles are read-only with Duplicate; group roles are
 * read-only; converted roles wait for review (Activate). A new role always
 * starts from an existing one ("Start from…").
 */
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Loader2, Plus, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useCompany } from '@/context/company-context';
import { usePermissions } from '@/context/permissions-context';
import { useToast } from '@/hooks/use-toast';
import { activateRole, duplicateRole, listRoles, type Role } from '@/services/authzService';
import { RoleBadges } from './role-editor';
import { AccessHeader, EmptyState, EngineNotice, ErrorState, InlineError, ListSkeleton, errorText, roleLabel, useTr } from './shared';

export function RolesPage() {
  const { tr, lang } = useTr();
  const router = useRouter();
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? null;
  const canManage = usePermissions().canAdmin('people.manage_roles');

  const [roles, setRoles] = React.useState<Role[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [cardError, setCardError] = React.useState<{ id: string; message: string } | null>(null);
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    if (!companyId) return;
    let active = true;
    setRoles(null);
    setError(null);
    listRoles(companyId)
      .then((r) => { if (active) setRoles(r); })
      .catch((e: unknown) => { if (active) setError(errorText(e, tr('Could not load the roles.', 'تعذّر تحميل الأدوار.'))); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, nonce]);

  const duplicate = async (role: Role) => {
    if (!companyId) return;
    setBusy(role.id);
    setCardError(null);
    try {
      const copy = await duplicateRole(companyId, role.id);
      router.push(`/settings/roles/${copy.id}`);
    } catch (e) {
      setCardError({ id: role.id, message: errorText(e, tr('The role could not be copied.', 'تعذّر نسخ الدور.')) });
      setBusy(null);
    }
  };

  const activate = async (role: Role) => {
    if (!companyId) return;
    setBusy(role.id);
    setCardError(null);
    try {
      const updated = await activateRole(companyId, role.id);
      setRoles((list) => list?.map((r) => (r.id === role.id ? { ...r, ...updated } : r)) ?? list);
      toast({ title: tr('Role activated', 'تم تفعيل الدور') });
    } catch (e) {
      setCardError({ id: role.id, message: errorText(e, tr('The role could not be activated.', 'تعذّر تفعيل الدور.')) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <AccessHeader
        title={tr('Roles', 'الأدوار')}
        description={tr(
          'A role is a set of what someone may see and do. Everyone has one main role and can have add-ons.',
          'الدور مجموعة مما يمكن للشخص رؤيته وفعله. لكل شخص دور أساسي ويمكن أن تكون له إضافات.',
        )}
        actions={canManage && roles ? (
          <Button onClick={() => setCreating(true)} className="gap-1.5">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {tr('New role', 'دور جديد')}
          </Button>
        ) : undefined}
      />
      <EngineNotice />

      {error && <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} />}
      {!roles && !error && <ListSkeleton rows={4} />}
      {roles && roles.length === 0 && (
        <EmptyState title={tr('No roles yet', 'لا توجد أدوار بعد')}>
          {tr('The standard roles appear here once the company is set up.', 'تظهر الأدوار القياسية هنا بعد إعداد الشركة.')}
        </EmptyState>
      )}
      {roles && roles.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => (
            <li key={role.id} className="flex flex-col rounded-lg border bg-card p-4 transition-colors focus-within:border-ring hover:border-foreground/20">
              <Link
                href={`/settings/roles/${role.id}`}
                className="group rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <h2 className="font-semibold group-hover:underline group-hover:underline-offset-4">
                  {roleLabel(role, lang)}
                  <span className="font-normal text-muted-foreground">
                    {' · '}
                    {tr(
                      `${role.peopleCount} ${role.peopleCount === 1 ? 'person' : 'people'}`,
                      `${role.peopleCount} ${role.peopleCount === 1 ? 'شخص' : 'أشخاص'}`,
                    )}
                  </span>
                </h2>
                {role.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{role.description}</p>}
              </Link>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <RoleBadges role={role} />
              </div>
              {canManage && (role.needsReview || role.kind === 'system') && (
                <div className="mt-auto flex flex-wrap gap-2 pt-3">
                  {role.needsReview && (
                    <Button size="sm" onClick={() => activate(role)} disabled={busy !== null} className="gap-1.5">
                      {busy === role.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                      {tr('Activate', 'تفعيل')}
                    </Button>
                  )}
                  {role.kind === 'system' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => duplicate(role)}
                      disabled={busy !== null}
                      className="gap-1.5"
                      aria-label={tr(`Duplicate ${role.name}`, `نسخ ${roleLabel(role, 'ar')}`)}
                    >
                      {busy === role.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                      {tr('Duplicate', 'نسخ')}
                    </Button>
                  )}
                </div>
              )}
              {cardError?.id === role.id && <InlineError message={cardError.message} className="mt-2" />}
            </li>
          ))}
        </ul>
      )}

      {roles && companyId && (
        <NewRoleDialog
          open={creating}
          onOpenChange={setCreating}
          roles={roles.filter((r) => r.kind !== 'group')}
          companyId={companyId}
          onCreated={(role) => router.push(`/settings/roles/${role.id}`)}
        />
      )}
    </div>
  );
}

function NewRoleDialog({ open, onOpenChange, roles, companyId, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: Role[];
  companyId: string;
  onCreated: (role: Role) => void;
}) {
  const { tr, lang } = useTr();
  const [sourceId, setSourceId] = React.useState<string>('');
  const [name, setName] = React.useState('');
  const [nameAr, setNameAr] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setSourceId(roles.find((r) => r.key === 'employee')?.id ?? roles[0]?.id ?? '');
    setName('');
    setNameAr('');
    setError(null);
  }, [open, roles]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(tr('Give the role a name.', 'أعطِ الدور اسمًا.'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const role = await duplicateRole(companyId, sourceId, { name: name.trim(), ...(nameAr.trim() ? { nameAr: nameAr.trim() } : {}) });
      onCreated(role);
    } catch (err) {
      setError(errorText(err, tr('The role could not be created.', 'تعذّر إنشاء الدور.')));
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{tr('New role', 'دور جديد')}</DialogTitle>
            <DialogDescription>
              {tr('Start from the role closest to what you need, then adjust it.', 'ابدأ من أقرب دور لما تحتاجه، ثم عدّله.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-role-name">{tr('Name', 'الاسم')}</Label>
            <Input id="new-role-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-role-name-ar">{tr('Name in Arabic (optional)', 'الاسم بالعربية (اختياري)')}</Label>
            <Input id="new-role-name-ar" dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{tr('Start from…', 'ابدأ من…')}</legend>
            <RadioGroup value={sourceId} onValueChange={setSourceId} className="gap-1">
              {roles.map((r) => (
                <Label
                  key={r.id}
                  htmlFor={`source-${r.id}`}
                  className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                >
                  <RadioGroupItem id={`source-${r.id}`} value={r.id} />
                  <span className="flex-1">{roleLabel(r, lang)}</span>
                  {r.kind === 'system' && <span className="text-xs text-muted-foreground">{tr('Standard', 'قياسي')}</span>}
                </Label>
              ))}
            </RadioGroup>
          </fieldset>
          <InlineError message={error} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tr('Cancel', 'إلغاء')}</Button>
            <Button type="submit" disabled={saving || !sourceId} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {tr('Create and edit', 'إنشاء وتعديل')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
