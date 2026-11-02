'use client';

/**
 * A group opened whole, on a page that doesn't merge companies: the page is
 * shown once per company, each section working on its own company. Pages
 * that merge (GROUP_AWARE_PAGES), settings and single records pass through.
 */
import * as React from 'react';
import { usePathname } from 'next/navigation';
import { useCompanyScope } from '@/context/company-scope-context';
import { framePerCompany, GROUP_AWARE_PAGES } from '@/modules/groups/lib/group-aware';
import { PerCompany } from './per-company';
import { ScopeBar } from './scope-bar';

const OWN_SCOPE_BAR = new Set(['/', '/tasks', '/projects']);

export function GroupPageFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const { isGroup, inTree } = useCompanyScope();
  // Merged pages get the scope control here, except those with their own (dashboard, tasks, projects).
  if (isGroup && GROUP_AWARE_PAGES.has(pathname) && !OWN_SCOPE_BAR.has(pathname)) {
    return (
      <div className="space-y-4">
        <ScopeBar className="justify-end" />
        {children}
      </div>
    );
  }
  if (!isGroup || !framePerCompany(pathname)) return <>{children}</>;
  // "This company only": the group company's own page, with the way back to the whole group.
  if (!inTree) {
    return (
      <div className="space-y-4">
        <ScopeBar className="justify-end" />
        {children}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <ScopeBar className="justify-end" />
      <PerCompany>{children}</PerCompany>
    </div>
  );
}
