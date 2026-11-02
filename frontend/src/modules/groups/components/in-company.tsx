'use client';

/**
 * Renders its children as if one company were selected: the company, its
 * permissions and its scope. Create dialogs and row actions inside work on
 * that company with its own rules, unchanged, while the page around them
 * shows the whole group.
 */
import * as React from 'react';
import { CompanyContext, type CompanyContextType } from '@/context/company-context';
import { CompanyScopeProvider } from '@/context/company-scope-context';
import { PermissionsProvider } from '@/context/permissions-context';

export function InCompany({ companyId, children }: { companyId: string; children: React.ReactNode }) {
  const outer = React.useContext(CompanyContext);
  const company = outer?.companies.find((c) => c.id === companyId) ?? null;
  const value = React.useMemo<CompanyContextType | null>(() => {
    if (!outer || !company) return null;
    const role = outer.currentUser?.companyRoles?.find((r) => r.companyId === company.id)?.role ?? outer.currentUser?.role ?? null;
    return { ...outer, selectedCompany: company, currentRole: role };
  }, [outer, company]);
  if (!outer || !company || !value) return null;
  // Already this company: nothing to change.
  if (outer.selectedCompany?.id === company.id) return <>{children}</>;
  return (
    <CompanyContext.Provider value={value}>
      <CompanyScopeProvider>
        <PermissionsProvider>{children}</PermissionsProvider>
      </CompanyScopeProvider>
    </CompanyContext.Provider>
  );
}
