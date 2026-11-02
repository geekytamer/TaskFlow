'use client';

/**
 * Where a new record goes when a whole group is open: the companies in view
 * where the person may create it. The default is the one company the filter
 * shows, else the group company itself.
 */
import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { useCompanyScope } from '@/context/company-scope-context';
import { useI18n } from '@/context/i18n-context';
import { fetchMyPermissions } from '@/services/permissionService';
import { buildAccess } from '@/lib/permissions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InCompany } from './in-company';

/** Companies in view where `permission` is granted (checked per company), group company first. */
export function useCreateChoices(permission: string): string[] {
  const { companyIds } = useCompanyScope();
  const [allowed, setAllowed] = React.useState<string[]>([]);
  const key = companyIds.join(',');
  React.useEffect(() => {
    let active = true;
    if (!permission) { setAllowed([]); return () => { active = false; }; }
    Promise.all(key.split(',').filter(Boolean).map(async (id) => {
      try {
        const feed = await fetchMyPermissions(id);
        // Read the way the permissions context reads it, so the answer matches the dialog's own gate.
        return buildAccess(feed).can(permission) ? id : null;
      } catch {
        return null;
      }
    })).then((ids) => { if (active) setAllowed(ids.filter((x): x is string => Boolean(x))); });
    return () => { active = false; };
  }, [key, permission]);
  return allowed;
}

/**
 * The company a page's own create form writes to. On a single company it is
 * that company; on a whole group it is chosen with `<CreateTargetSelect>`
 * among the companies where the person may create.
 */
export function useCreateTarget(permission: string) {
  const { selectedCompany } = useCompany();
  const { inTree, filter } = useCompanyScope();
  const choices = useCreateChoices(inTree ? permission : '');
  const [picked, setPicked] = React.useState('');
  const preferred = filter.length === 1 ? filter[0] : selectedCompany?.id ?? '';
  const target = !inTree
    ? selectedCompany?.id ?? ''
    : choices.includes(picked) ? picked : choices.includes(preferred) ? preferred : choices[0] ?? '';
  return { inTree, choices, target, setTarget: setPicked };
}

export function CreateTargetSelect({ choices, target, setTarget }: { choices: string[]; target: string; setTarget: (id: string) => void }) {
  const { inTree, companyName } = useCompanyScope();
  const { language } = useI18n();
  if (!inTree || choices.length < 2) return null;
  return (
    <Select value={target} onValueChange={setTarget}>
      <SelectTrigger className="h-9 w-[12rem]" aria-label={language === 'ar' ? 'الإضافة إلى' : 'Add to'}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {choices.map((id) => (
          <SelectItem key={id} value={id}>{(language === 'ar' ? 'إلى: ' : 'To: ') + companyName(id)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The create control for a list whose dialog finds its company by itself: on
 * a single company it renders `children` as before; on a whole group it adds
 * the company choice and renders `children` inside that company.
 */
export function CreateInCompany({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { inTree, choices, target, setTarget } = useCreateTarget(permission);
  if (!inTree) return <>{children}</>;
  if (!target) return null;
  return (
    <div className="flex items-center gap-2">
      <CreateTargetSelect choices={choices} target={target} setTarget={setTarget} />
      <InCompany companyId={target}>{children}</InCompany>
    </div>
  );
}
