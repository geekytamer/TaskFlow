'use client';

/**
 * A group opened whole, on a page that doesn't merge companies: the page is
 * shown once per company, each section working on its own company. Pages
 * that merge (GROUP_AWARE_PAGES), settings and single records pass through.
 */
import * as React from 'react';
import { usePathname } from 'next/navigation';
import { useCompanyScope } from '@/context/company-scope-context';
import { framePerCompany } from '@/modules/groups/lib/group-aware';
import { PerCompany } from './per-company';
import { ScopeBar } from './scope-bar';

export function GroupPageFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const { inTree } = useCompanyScope();
  if (!inTree || !framePerCompany(pathname)) return <>{children}</>;
  return (
    <div className="space-y-4">
      <ScopeBar className="justify-end" />
      <PerCompany>{children}</PerCompany>
    </div>
  );
}
