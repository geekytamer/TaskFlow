'use client';

/**
 * Settings → Group → a role template. Same form as a company role; saving
 * changes the group's version only. Companies get it when the template is
 * pushed from the Group page.
 */
import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { getHoldingTemplate, saveHoldingTemplate, type HoldingTemplate } from '@/services/authzService';
import { draftFrom, editorReducer, initialEditor, isDirty, toInput } from '../lib/role-draft';
import { RoleForm } from './role-form';
import { SaveBar } from './role-editor';
import { AccessHeader, ErrorState, ListSkeleton, errorText, roleLabel, useCatalogue, useGroupBase, useLeaveGuard, useTr } from './shared';

export function TemplatePage({ groupId, templateKey }: { groupId: string; templateKey: string }) {
  const { tr, lang } = useTr();
  const { isRtl } = useI18n();
  const { toast } = useToast();
  const base = useGroupBase();
  const { catalogue, error: catalogueError, retry } = useCatalogue();
  const [template, setTemplate] = React.useState<HoldingTemplate | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);
  const [state, dispatch] = React.useReducer(editorReducer, undefined, () => initialEditor());
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [nameError, setNameError] = React.useState<string | null>(null);
  const fieldKeys = React.useMemo(() => catalogue?.fields.map((f) => f.key) ?? [], [catalogue]);

  React.useEffect(() => {
    if (!catalogue) return;
    let active = true;
    setError(null);
    getHoldingTemplate(groupId, templateKey)
      .then((t) => {
        if (!active) return;
        setTemplate(t);
        dispatch({ type: 'load', draft: draftFrom(t, fieldKeys) });
      })
      .catch((e: unknown) => { if (active) setError(errorText(e, tr('Could not load the template.', 'تعذّر تحميل القالب.'))); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, templateKey, catalogue, nonce]);

  const dirty = isDirty(state);
  useLeaveGuard(dirty);

  const save = async () => {
    if (!state.draft.name.trim()) {
      setNameError(tr('Give the template a name.', 'أعطِ القالب اسمًا.'));
      return;
    }
    setNameError(null);
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveHoldingTemplate(groupId, templateKey, toInput(state.draft));
      setTemplate(saved);
      dispatch({ type: 'saved', draft: draftFrom(saved, fieldKeys) });
      toast({ title: tr('Template saved. Push it from the Group page to update companies.', 'تم حفظ القالب. أرسله من صفحة المجموعة لتحديث الشركات.') });
    } catch (e) {
      setSaveError(errorText(e, tr('The template could not be saved.', 'تعذّر حفظ القالب.')));
    } finally {
      setSaving(false);
    }
  };

  const Back = isRtl ? ArrowRight : ArrowLeft;
  return (
    <div className="mx-auto w-full max-w-4xl">
      <Link href={`${base}?group=${encodeURIComponent(groupId)}`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Back className="h-4 w-4" aria-hidden="true" />
        {tr('Group', 'المجموعة')}
      </Link>
      <AccessHeader
        title={template ? roleLabel(template, lang) : tr('Template', 'القالب')}
        description={tr(
          'Changes stay in the group until you push the template to the companies.',
          'تبقى التغييرات في المجموعة حتى ترسل القالب إلى الشركات.',
        )}
      />
      {(catalogueError || error) && <ErrorState message={catalogueError ?? error ?? ''} onRetry={() => { retry(); setNonce((n) => n + 1); }} />}
      {!template && !catalogueError && !error && <ListSkeleton rows={6} />}
      {template && catalogue && (
        <>
          <RoleForm
            catalogue={catalogue}
            state={state}
            dispatch={dispatch}
            readOnly={false}
            // Limits apply in each company's own currency; group admins are not bound by a company's grants.
            currency={tr('in each company\'s currency', 'بعملة كل شركة')}
            nameError={nameError}
            me={null}
            groupScope
          />
          <SaveBar
            dirty={dirty}
            saving={saving}
            error={saveError}
            onSave={save}
            saveLabel={tr('Save template', 'حفظ القالب')}
            onReset={() => { dispatch({ type: 'reset' }); setSaveError(null); }}
          />
        </>
      )}
    </div>
  );
}
