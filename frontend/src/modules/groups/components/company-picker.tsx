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
 * The create control for a list: on a single company it renders `children`
 * as before; on a whole group it adds a company choice and renders `children`
 * inside that company, so the existing dialog creates there.
 */
export function CreateInCompany({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { selectedCompany } = useCompany();
  const { inTree, filter, companyName } = useCompanyScope();
  const choices = useCreateChoices(inTree ? permission : '');
  const { language } = useI18n();
  const preferred = filter.length === 1 ? filter[0] : selectedCompany?.id ?? '';
  const [target, setTarget] = React.useState<string>('');
  const chosen = choices.includes(target) ? target : choices.includes(preferred) ? preferred : choices[0] ?? '';
  if (!inTree) return <>{children}</>;
  if (!chosen) return null;
  return (
    <div className="flex items-center gap-2">
      {choices.length > 1 && (
        <Select value={chosen} onValueChange={setTarget}>
          <SelectTrigger className="h-9 w-[12rem]" aria-label={language === 'ar' ? 'الإضافة إلى' : 'Add to'}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {choices.map((id) => (
              <SelectItem key={id} value={id}>{(language === 'ar' ? 'إلى: ' : 'To: ') + companyName(id)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <InCompany companyId={chosen}>{children}</InCompany>
    </div>
  );
}
