'use client';

/**
 * The role form: name, then one row per area with a level picker
 * (None / View / Edit / Full / Custom), a scope picker where the area has
 * owned records, Custom's individual actions with limits, and the six
 * sensitive-information switches. State lives in the caller's reducer
 * (lib/role-draft.ts), so the role page and the group template page share it.
 */
import * as React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AreaGroup, Catalogue, CatalogueArea, Scope } from '@/services/authzService';
import {
  areaHasScope,
  areaScope,
  limitedActions,
  shownLevel,
  type EditorAction,
  type EditorState,
  type LevelChoice,
} from '../lib/role-draft';
import { Segmented } from './segmented';
import { beyondMe, within, type Holder } from '../lib/beyond';
import { countLabel, pick, useTr, type Tr } from './shared';

const GROUP_ORDER: AreaGroup[] = ['core', 'operations', 'finance', 'crm', 'hr'];
const GROUP_LABEL: Record<AreaGroup, [string, string]> = {
  core: ['General', 'عام'],
  operations: ['Operations', 'العمليات'],
  finance: ['Finance', 'المالية'],
  crm: ['Clients and marketing', 'العملاء والتسويق'],
  hr: ['People and HR', 'الموظفون والموارد البشرية'],
};

export const scopeName = (scope: Scope, tr: Tr) => ({
  own: tr('Own', 'الخاصة'),
  team: tr('My team', 'فريقي'),
  company: tr('Company', 'الشركة'),
  group: tr('Group', 'المجموعة'),
}[scope]);

function scopeHelp(scope: Scope, area: CatalogueArea, tr: Tr, lang: 'en' | 'ar') {
  switch (scope) {
    case 'own':
      return area.ownership ? pick(area.ownership, lang) : tr('Only records they own or that are shared with them.', 'السجلات التي يملكها أو التي شوركت معه فقط.');
    case 'team':
      return tr('Their own records and those of everyone who reports to them.', 'سجلاته وسجلات كل من يتبع له وظيفيًا.');
    case 'company':
      return tr('Every record in this company.', 'كل السجلات في هذه الشركة.');
    case 'group':
      return tr('Every record in every company of the group.', 'كل السجلات في كل شركات المجموعة.');
  }
}

export function RoleForm({
  catalogue,
  state,
  dispatch,
  readOnly,
  currency,
  nameError,
  me,
  groupScope,
}: {
  catalogue: Catalogue;
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  readOnly: boolean;
  /** The currency amount limits are in ("OMR"), or a phrase for templates. */
  currency: string;
  nameError?: string | null;
  /** What the editor holds; choices beyond it are not offered (null: no limit, super admin). */
  me: Holder | null;
  /** Offer the "group" scope (the company belongs to a holding group, or this is a group template). */
  groupScope: boolean;
}) {
  const { tr, lang } = useTr();
  const groups = GROUP_ORDER
    .map((g) => ({ group: g, areas: catalogue.areas.filter((a) => a.group === g) }))
    .filter((g) => g.areas.length);
  const notMine = tr('You don\'t have this yourself, so you can\'t give it.', 'لا تملك هذا بنفسك، فلا يمكنك منحه.');

  return (
    <div className="space-y-8">
      <section aria-labelledby="role-name-heading" className="space-y-4">
        <h2 id="role-name-heading" className="sr-only">{tr('Name', 'الاسم')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="role-name">{tr('Name', 'الاسم')}</Label>
            <Input
              id="role-name"
              value={state.draft.name}
              readOnly={readOnly}
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? 'role-name-error' : undefined}
              onChange={(e) => dispatch({ type: 'text', field: 'name', value: e.target.value })}
            />
            {nameError && <p id="role-name-error" className="text-sm text-destructive">{nameError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role-name-ar">{tr('Name in Arabic', 'الاسم بالعربية')}</Label>
            <Input
              id="role-name-ar"
              dir="rtl"
              value={state.draft.nameAr}
              readOnly={readOnly}
              onChange={(e) => dispatch({ type: 'text', field: 'nameAr', value: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="role-description">{tr('What this role is for', 'الغرض من هذا الدور')}</Label>
          <Textarea
            id="role-description"
            rows={2}
            value={state.draft.description}
            readOnly={readOnly}
            placeholder={readOnly ? '' : tr('For example: approves purchases and pays suppliers', 'مثال: يعتمد المشتريات ويدفع للموردين')}
            onChange={(e) => dispatch({ type: 'text', field: 'description', value: e.target.value })}
          />
        </div>
      </section>

      {groups.map(({ group, areas }) => (
        <section key={group} aria-labelledby={`area-group-${group}`}>
          <h2 id={`area-group-${group}`} className="mb-1 text-sm font-semibold text-muted-foreground">
            {tr(...GROUP_LABEL[group])}
          </h2>
          <div className="divide-y rounded-lg border">
            {areas.map((area) => (
              <AreaRow
                key={area.key}
                area={area}
                state={state}
                dispatch={dispatch}
                readOnly={readOnly}
                currency={currency}
                me={me}
                groupScope={groupScope}
                notMine={notMine}
              />
            ))}
          </div>
        </section>
      ))}

      <section aria-labelledby="sensitive-heading">
        <h2 id="sensitive-heading" className="text-sm font-semibold text-muted-foreground">
          {tr('Sensitive information', 'المعلومات الحساسة')}
        </h2>
        <p className="mb-2 mt-0.5 text-sm text-muted-foreground">
          {tr('Without "See", these values show as Hidden everywhere.', 'بدون «عرض» تظهر هذه القيم «مخفية» في كل مكان.')}
        </p>
        <div className="divide-y rounded-lg border">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-4 py-2 text-xs font-medium text-muted-foreground" aria-hidden="true">
            <span />
            <span className="w-11 text-center">{tr('See', 'عرض')}</span>
            <span className="w-11 text-center">{tr('Change', 'تعديل')}</span>
          </div>
          {catalogue.fields.map((f) => {
            const value = state.draft.fields[f.key] ?? { view: false, edit: false };
            const name = pick(f.label, lang);
            // Turning a switch off is always allowed; on, only what I have.
            const canView = value.view || beyondMe(me, [], [{ key: f.key, view: true, edit: false }]).length === 0;
            const canEdit = value.edit || beyondMe(me, [], [{ key: f.key, view: true, edit: true }]).length === 0;
            return (
              <div key={f.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-4 py-3">
                <span className="text-sm">{name}</span>
                <Switch
                  checked={value.view}
                  disabled={readOnly || !canView}
                  title={!canView ? notMine : undefined}
                  aria-label={`${tr('See', 'عرض')}: ${name}`}
                  onCheckedChange={(on) => dispatch({ type: 'field', key: f.key, which: 'view', on })}
                />
                <Switch
                  checked={value.edit}
                  disabled={readOnly || !canEdit}
                  title={!canEdit ? notMine : undefined}
                  aria-label={`${tr('Change', 'تعديل')}: ${name}`}
                  onCheckedChange={(on) => dispatch({ type: 'field', key: f.key, which: 'edit', on })}
                />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const formatAmount = (n: number, lang: 'en' | 'ar') => n.toLocaleString(lang === 'ar' ? 'ar' : 'en-US');

function AreaRow({ area, state, dispatch, readOnly, currency, me, groupScope, notMine }: {
  area: CatalogueArea;
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  readOnly: boolean;
  currency: string;
  me: Holder | null;
  groupScope: boolean;
  notMine: string;
}) {
  const { tr, lang } = useTr();
  const level = shownLevel(state, area);
  // A role that arrives Custom shows its count; the actions open on request
  // (or when Custom is picked), so a long role stays scannable.
  const open = state.customOpen.includes(area.key);
  const name = pick(area.label, lang);
  const held = area.actions.filter((a) => a.key in state.draft.grants).length;
  const scope = areaScope(state.draft, area);
  const showScope = areaHasScope(area) && level !== 'none' && area.actions.some((a) => a.scoped && a.key in state.draft.grants);
  const limited = limitedActions(state.draft, area);
  const unitOf = (limit: 'amount' | 'percent' | null) => (limit === 'percent' ? '%' : currency);
  // The scopes offered: "group" only where a holding group exists (or the role already has it).
  const scopes = area.scopes.filter((sc) => sc !== 'group' || groupScope || scope === 'group');

  /** The preset's grants as the role would hold them, checked against what I hold. */
  const presetWithin = (preset: 'view' | 'edit' | 'full') => beyondMe(me, area.levels[preset].map((key) => {
    const action = area.actions.find((a) => a.key === key);
    return { key, ...(action?.scoped && scope ? { scope } : {}) };
  })).length === 0;

  const options: Array<{ value: LevelChoice; label: string; disabled?: boolean; reason?: string }> = [
    { value: 'none', label: tr('None', 'لا شيء') },
    { value: 'view', label: tr('View', 'عرض') },
    { value: 'edit', label: tr('Edit', 'تعديل') },
    { value: 'full', label: tr('Full', 'كامل') },
    { value: 'custom', label: tr('Custom', 'مخصص') },
  ];
  // Presets nest (view ⊆ edit ⊆ full). Where two give the same actions (an
  // area with only view actions), offer only the wider one, as the server
  // reads it, so the picker never shows a choice that changes nothing.
  const distinct = options
    .filter((o) => {
      if (o.value === 'view') return area.levels.view.length !== area.levels.edit.length;
      if (o.value === 'edit') return area.levels.edit.length !== area.levels.full.length;
      return true;
    })
    .map((o) => (o.value === 'view' || o.value === 'edit' || o.value === 'full') && o.value !== level && !presetWithin(o.value)
      ? { ...o, disabled: true, reason: notMine }
      : o);

  /** A scope is offered when every scoped action the area holds stays within what I hold at it. */
  const scopeWithin = (sc: Scope) => beyondMe(me, area.actions
    .filter((a) => a.scoped && state.draft.grants[a.key])
    .map((a) => ({ key: a.key, scope: sc, limit: state.draft.grants[a.key].limit }))).length === 0;

  return (
    <div className="px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">{name}</p>
          {level === 'custom' && (
            <p className="text-xs text-muted-foreground">
              {tr(`${held} of ${countLabel(area.actions.length, 'actions', 'en')}`, `${held} من ${countLabel(area.actions.length, 'actions', 'ar')}`)}
              {' · '}
              <button
                type="button"
                aria-expanded={open}
                onClick={() => dispatch(open ? { type: 'collapse', area } : { type: 'level', area, level: 'custom' })}
                className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {open ? tr('Hide actions', 'إخفاء الإجراءات') : tr('Show actions', 'عرض الإجراءات')}
              </button>
            </p>
          )}
          {/* Ruling S: limits are always visible, never hidden under a preset. */}
          {!open && limited.map((a) => (
            <p key={a.key} className="text-xs text-muted-foreground">
              {tr(
                `${pick(a.label, 'en')} — up to ${formatAmount(state.draft.grants[a.key].limit!, 'en')} ${unitOf(a.limit)}`,
                `${pick(a.label, 'ar')} — حتى ${formatAmount(state.draft.grants[a.key].limit!, 'ar')} ${unitOf(a.limit)}`,
              )}
            </p>
          ))}
        </div>
        <Segmented
          value={level}
          onChange={(value) => dispatch({ type: 'level', area, level: value })}
          options={distinct}
          label={tr(`${name}: level`, `${name}: المستوى`)}
          disabled={readOnly}
        />
      </div>

      {showScope && scope && (
        <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <Label htmlFor={`scope-${area.key}`} className="shrink-0 text-xs text-muted-foreground">
            {tr('Whose records', 'سجلات من')}
          </Label>
          <Select value={scope} onValueChange={(v) => dispatch({ type: 'scope', area, scope: v as Scope })} disabled={readOnly}>
            <SelectTrigger id={`scope-${area.key}`} className="h-8 w-full text-xs sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scopes.map((sc) => {
                const ok = sc === scope || scopeWithin(sc);
                return (
                  <SelectItem key={sc} value={sc} disabled={!ok} className="text-xs">
                    {scopeName(sc, tr)}{ok ? '' : ` — ${tr('beyond your own', 'أوسع مما لديك')}`}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{scopeHelp(scope, area, tr, lang)}</p>
        </div>
      )}

      {level === 'custom' && open && (
        <ul className="mt-3 space-y-2 border-s ps-3" aria-label={tr(`${name}: actions`, `${name}: الإجراءات`)}>
          {area.actions.map((action) => {
            const grant = state.draft.grants[action.key];
            const id = `action-${action.key}`;
            const canAdd = Boolean(grant) || within(me, { key: action.key, ...(action.scoped && scope ? { scope } : {}) });
            const myLimit = me?.grant(action.key)?.limit;
            return (
              <li key={action.key} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id={id}
                    checked={Boolean(grant)}
                    disabled={readOnly || !canAdd}
                    title={!canAdd ? notMine : undefined}
                    className="mt-0.5"
                    onCheckedChange={(on) => dispatch({ type: 'toggle', area, key: action.key, on: on === true })}
                  />
                  <Label htmlFor={id} className={`text-sm font-normal leading-snug ${canAdd ? '' : 'text-muted-foreground'}`}>
                    {pick(action.label, lang)}
                    {!canAdd && <span className="block text-xs">{notMine}</span>}
                  </Label>
                </div>
                {action.limit && grant && (
                  <LimitInput
                    actionKey={action.key}
                    value={grant.limit}
                    unit={unitOf(action.limit)}
                    readOnly={readOnly}
                    myLimit={myLimit}
                    onChange={(limit) => dispatch({ type: 'limit', key: action.key, limit })}
                    label={pick(action.label, lang)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function LimitInput({ actionKey, value, unit, readOnly, onChange, label, myLimit }: {
  actionKey: string;
  value: number | undefined;
  unit: string;
  readOnly: boolean;
  onChange: (limit: number | null) => void;
  label: string;
  /** My own ceiling on this action: the role may not go above it (or have none). */
  myLimit: number | undefined;
}) {
  const { tr, lang } = useTr();
  const [text, setText] = React.useState(value === undefined ? '' : String(value));
  // Follow outside changes (Reset, a level change) without rewriting what is
  // being typed ("5." is 5 and must stay "5."; "-3" stays to show the hint).
  React.useEffect(() => {
    setText((current) => {
      const typed = current.trim() === '' ? undefined : Number(current);
      if (typed !== undefined && (Number.isNaN(typed) || typed < 0) && value === undefined) return current;
      return typed === value ? current : value === undefined ? '' : String(value);
    });
  }, [value]);
  const id = `limit-${actionKey}`;
  const hintId = `${id}-hint`;
  const typed = text.trim() === '' ? undefined : Number(text);
  let hint: string | null = null;
  if (typed !== undefined && (Number.isNaN(typed) || typed < 0)) {
    hint = tr('Enter 0 or more. Leave empty for no limit.', 'أدخل صفرًا أو أكثر. اتركه فارغًا لعدم وضع حد.');
  } else if (myLimit !== undefined && (typed === undefined || typed > myLimit)) {
    const mine = `${myLimit.toLocaleString(lang === 'ar' ? 'ar' : 'en-US')} ${unit}`;
    hint = tr(`Your own limit is ${mine}; this can't be higher.`, `حدك أنت ${mine}؛ لا يمكن أن يكون أعلى.`);
  }
  return (
    <div className="space-y-1 ps-6 sm:ps-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <label htmlFor={id}>{tr('Up to', 'حتى')}</label>
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          max={myLimit}
          step="any"
          value={text}
          readOnly={readOnly}
          placeholder={tr('No limit', 'بلا حد')}
          aria-label={tr(`${label}: up to`, `${label}: حتى`)}
          aria-invalid={Boolean(hint)}
          aria-describedby={hint ? hintId : undefined}
          className="h-8 w-28 text-xs tabular-nums"
          onChange={(e) => {
            setText(e.target.value);
            const n = e.target.value.trim() === '' ? null : Number(e.target.value);
            onChange(n);
          }}
        />
        <span>{unit}</span>
      </div>
      {hint && <p id={hintId} className="max-w-xs text-xs text-destructive">{hint}</p>}
    </div>
  );
}
