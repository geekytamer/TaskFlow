'use client';

/**
 * Settings → Roles → one role. Standard and group roles open read-only with a
 * way forward (Duplicate); a role converted from the old permissions waits
 * for review (Activate). Save sends the whole role; a refusal from the server
 * (higher than you, nobody left to manage roles, ...) is shown next to Save in
 * one sentence.
 */
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Copy, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useCompany } from '@/context/company-context';
import { usePermissions } from '@/context/permissions-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import {
  activateRole,
  deleteRole,
  duplicateRole,
  getRole,
  saveRole,
  type Catalogue,
  type RoleDetail,
} from '@/services/authzService';
import { draftFrom, editorReducer, initialEditor, isDirty, toInput } from '../lib/role-draft';
import { RoleForm } from './role-form';
import {
  AccessHeader,
  EngineNotice,
  ErrorState,
  InlineError,
  ListSkeleton,
  countLabel,
  errorText,
  roleLabel,
  shortDate,
  useCatalogue,
  useLeaveGuard,
  useMe,
  useTr,
} from './shared';
import { beyondMe } from '../lib/beyond';

export function RoleBadges({ role }: { role: { kind: string; needsReview: boolean } }) {
  const { tr } = useTr();
  return (
    <>
      {role.kind === 'system' && <Badge variant="secondary">{tr('Standard', 'قياسي')}</Badge>}
      {role.kind === 'group' && <Badge variant="secondary">{tr('Group role', 'دور المجموعة')}</Badge>}
      {role.needsReview && (
        <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300">
          {tr('Needs review', 'بحاجة إلى مراجعة')}
        </Badge>
      )}
    </>
  );
}

/**
 * Save / Discard, floating at the bottom of the screen while there are changes
 * (the page scrolls with the window, so a sticky footer would not stay put).
 * On phones it sits above the tab bar. A refusal shows here, in one sentence.
 */
export function SaveBar({ dirty, saving, error, onSave, onReset, saveLabel }: {
  saveLabel?: string;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onReset: () => void;
}) {
  const { tr } = useTr();
  if (!dirty && !error) return null;
  return (
    <>
      {/* Room at the end of the page so the bar never covers the last row. */}
      <div aria-hidden="true" className="h-24" />
      <div
        role="region"
        aria-label={tr('Unsaved changes', 'تغييرات غير محفوظة')}
        className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl rounded-lg border bg-popover p-3 text-popover-foreground shadow-[0_8px_24px_rgb(0_0_0/0.18)] md:bottom-6 md:start-[calc(var(--sidebar-width,16rem)+1.5rem)] md:end-6"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {error
            ? <InlineError message={error} className="flex-1" />
            : <p className="flex-1 text-sm text-muted-foreground">{tr('You have unsaved changes.', 'لديك تغييرات غير محفوظة.')}</p>}
          <div className="flex shrink-0 justify-end gap-2">
            <Button variant="ghost" onClick={onReset} disabled={saving || !dirty}>{tr('Discard', 'تجاهل')}</Button>
            <Button onClick={onSave} disabled={saving || !dirty} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {saveLabel ?? tr('Save role', 'حفظ الدور')}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

export function RoleEditorPage({ roleId }: { roleId: string }) {
  const { tr, lang } = useTr();
  const { isRtl } = useI18n();
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? null;
  const { canAdmin, holdingGroupId } = usePermissions();
  const canManage = canAdmin('people.manage_roles');
  const me = useMe();
  const { currencyCode } = useCompanyCurrency();
  const { catalogue, error: catalogueError, retry: retryCatalogue } = useCatalogue();

  const [role, setRole] = React.useState<RoleDetail | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);
  const [state, dispatch] = React.useReducer(editorReducer, undefined, () => initialEditor());
  const [saving, setSaving] = React.useState(false);
  const [busy, setBusy] = React.useState<'duplicate' | 'activate' | 'delete' | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [nameError, setNameError] = React.useState<string | null>(null);

  const fieldKeys = React.useMemo(() => catalogue?.fields.map((f) => f.key) ?? [], [catalogue]);

  React.useEffect(() => {
    if (!companyId || !catalogue) return;
    let active = true;
    setLoadError(null);
    getRole(companyId, roleId)
      .then((r) => {
        if (!active) return;
        setRole(r);
        dispatch({ type: 'load', draft: draftFrom(r, fieldKeys) });
      })
      .catch((e: unknown) => { if (active) setLoadError(errorText(e, tr('Could not load this role.', 'تعذّر تحميل هذا الدور.'))); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, roleId, catalogue, nonce]);

  const dirty = isDirty(state);
  useLeaveGuard(dirty);
  // The server refuses any save, copy or activation of a role that gives more
  // than the editor holds (HIGHER_THAN_YOU): such a role opens read-only.
  const aboveMe = role ? beyondMe(me, role.grants, role.fields).length > 0 : false;
  const readOnly = !role || role.readOnly || !canManage || aboveMe;
  const aboveReason = tr('Has access you don\'t have yourself.', 'فيه وصول لا تملكه أنت.');

  const onSave = async () => {
    if (!companyId || !role) return;
    if (!state.draft.name.trim()) {
      setNameError(tr('Give the role a name.', 'أعطِ الدور اسمًا.'));
      document.getElementById('role-name')?.focus();
      return;
    }
    setNameError(null);
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveRole(companyId, role.id, toInput(state.draft));
      setRole((r) => (r ? { ...r, ...saved } : r));
      dispatch({ type: 'saved', draft: draftFrom(saved, fieldKeys) });
      toast({ title: tr('Role saved', 'تم حفظ الدور') });
    } catch (e) {
      setSaveError(errorText(e, tr('The role could not be saved.', 'تعذّر حفظ الدور.')));
    } finally {
      setSaving(false);
    }
  };

  const onDuplicate = async () => {
    if (!companyId || !role) return;
    setBusy('duplicate');
    setActionError(null);
    try {
      const copy = await duplicateRole(companyId, role.id);
      router.push(`/settings/roles/${copy.id}`);
    } catch (e) {
      setActionError(errorText(e, tr('The role could not be copied.', 'تعذّر نسخ الدور.')));
    } finally {
      setBusy(null);
    }
  };

  const onActivate = async () => {
    if (!companyId || !role) return;
    setBusy('activate');
    setActionError(null);
    try {
      const updated = await activateRole(companyId, role.id);
      setRole((r) => (r ? { ...r, ...updated } : r));
      toast({ title: tr('Role activated', 'تم تفعيل الدور') });
    } catch (e) {
      setActionError(errorText(e, tr('The role could not be activated.', 'تعذّر تفعيل الدور.')));
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async () => {
    if (!companyId || !role) return;
    const ok = await confirm({
      title: tr('Delete this role?', 'حذف هذا الدور؟'),
      description: tr(`"${role.name}" will be removed. Nobody holds it.`, `سيُحذف «${roleLabel(role, lang)}». لا أحد يحمله.`),
      confirmText: tr('Delete role', 'حذف الدور'),
      cancelText: tr('Cancel', 'إلغاء'),
      destructive: true,
    });
    if (!ok) return;
    setBusy('delete');
    setActionError(null);
    try {
      await deleteRole(companyId, role.id);
      router.push('/settings/roles');
    } catch (e) {
      setActionError(errorText(e, tr('The role could not be deleted.', 'تعذّر حذف الدور.')));
      setBusy(null);
    }
  };

  const Back = isRtl ? ArrowRight : ArrowLeft;
  const title = role ? roleLabel(role, lang) : tr('Role', 'الدور');

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Link href="/settings/roles" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Back className="h-4 w-4" aria-hidden="true" />
        {tr('All roles', 'كل الأدوار')}
      </Link>
      <AccessHeader
        title={title}
        actions={role && canManage ? (
          <>
            {role.needsReview && (
              <Button
                onClick={onActivate}
                disabled={busy !== null || dirty || aboveMe}
                title={dirty ? tr('Save or discard your changes first.', 'احفظ تغييراتك أو تجاهلها أولًا.') : aboveMe ? aboveReason : undefined}
                className="gap-1.5"
              >
                {busy === 'activate' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                {tr('Activate', 'تفعيل')}
              </Button>
            )}
            {role.kind !== 'group' && (
              <Button
                variant="outline"
                onClick={onDuplicate}
                disabled={busy !== null || dirty || aboveMe}
                title={dirty ? tr('Save or discard your changes first.', 'احفظ تغييراتك أو تجاهلها أولًا.') : aboveMe ? aboveReason : undefined}
                className="gap-1.5"
              >
                {busy === 'duplicate' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {tr('Duplicate', 'نسخ')}
              </Button>
            )}
            {role.kind === 'custom' && role.peopleCount === 0 && (
              <Button variant="ghost" onClick={onDelete} disabled={busy !== null} className="gap-1.5 text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {tr('Delete', 'حذف')}
              </Button>
            )}
          </>
        ) : undefined}
      />
      <EngineNotice />
      <InlineError message={actionError} className="mb-4" />

      {(catalogueError || loadError) && (
        <ErrorState
          message={catalogueError ?? loadError ?? ''}
          onRetry={() => { retryCatalogue(); setNonce((n) => n + 1); }}
        />
      )}
      {!role && !catalogueError && !loadError && <ListSkeleton rows={6} />}

      {role && catalogue && (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <RoleBadges role={role} />
            <span>
              {countLabel(role.peopleCount, 'people', lang)}
            </span>
          </div>
          <ReadOnlyReason role={role} canManage={canManage} aboveMe={aboveMe} />
          <RoleForm
            catalogue={catalogue as Catalogue}
            state={state}
            dispatch={dispatch}
            readOnly={readOnly}
            currency={currencyCode}
            me={me}
            groupScope={Boolean(holdingGroupId)}
            nameError={nameError}
          />
          <Holders role={role} />
          {!readOnly && (
            <SaveBar
              dirty={dirty}
              saving={saving}
              error={saveError}
              onSave={onSave}
              onReset={() => { dispatch({ type: 'reset' }); setSaveError(null); setNameError(null); }}
            />
          )}
        </>
      )}
    </div>
  );
}

function ReadOnlyReason({ role, canManage, aboveMe }: { role: RoleDetail; canManage: boolean; aboveMe: boolean }) {
  const { tr } = useTr();
  let text: string | null = null;
  if (role.kind === 'system') {
    text = tr(
      'Standard roles follow TaskFlow\'s templates and can\'t be changed. Duplicate this role to make your own version.',
      'الأدوار القياسية تتبع قوالب TaskFlow ولا يمكن تعديلها. انسخ هذا الدور لتصنع نسختك الخاصة.',
    );
  } else if (role.kind === 'group') {
    text = tr(
      'This role comes from the group. The group\'s administrators change it; here it is read-only.',
      'هذا الدور يأتي من المجموعة. يغيّره مسؤولو المجموعة؛ وهو هنا للعرض فقط.',
    );
  } else if (canManage && aboveMe) {
    text = tr(
      'This role gives access you don\'t have yourself, so you can\'t change, copy or activate it. Ask an Admin.',
      'يمنح هذا الدور وصولًا لا تملكه أنت، فلا يمكنك تعديله أو نسخه أو تفعيله. اطلب ذلك من مدير النظام.',
    );
  } else if (!canManage) {
    text = tr('You can see this role but not change it.', 'يمكنك رؤية هذا الدور دون تعديله.');
  }
  return (
    <>
      {role.needsReview && (
        <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          {tr(
            'This role was converted from the old permissions. Check it, then Activate: until then it gives nobody anything.',
            'حُوِّل هذا الدور من الصلاحيات القديمة. راجعه ثم فعّله: حتى ذلك الحين لا يمنح أحدًا شيئًا.',
          )}
        </p>
      )}
      {text && <p className="mb-6 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">{text}</p>}
    </>
  );
}

function Holders({ role }: { role: RoleDetail }) {
  const { tr, lang } = useTr();
  return (
    <section aria-labelledby="holders-heading" className="mt-8">
      <h2 id="holders-heading" className="mb-2 text-sm font-semibold text-muted-foreground">{tr('Who has it', 'من يحمله')}</h2>
      {role.people.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tr('Nobody holds this role yet.', 'لا أحد يحمل هذا الدور بعد.')}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {role.people.map((p) => (
            <li key={`${p.userId}-${p.isMain}-${p.endsAt ?? ''}`}>
              <Link
                href={`/settings/people/${encodeURIComponent(p.userId)}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="font-medium">{p.name ?? p.email ?? p.userId}</span>
                <span className="text-xs text-muted-foreground">
                  {p.isMain ? tr('Main role', 'الدور الأساسي') : tr('Add-on', 'إضافة')}
                  {p.endsAt ? ` · ${tr('until', 'حتى')} ${shortDate(p.endsAt, lang)}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
