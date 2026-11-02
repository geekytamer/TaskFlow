'use client';

/**
 * A panel that works on one company, shown for each company of a group in
 * view: one section per company, each inside that company, so everything in
 * it (lists, dialogs, actions) works with that company's own data and rules.
 * On a single company it renders the panel once, as before.
 */
import * as React from 'react';
import { useCompanyScope } from '@/context/company-scope-context';
import { InCompany } from './in-company';

/**
 * Inside one company's section of a group page: the section's position, so the
 * first keeps the page title and the rest drop the repeat. Null outside.
 */
const SectionContext = React.createContext<number | null>(null);
export const useInCompanySection = () => React.useContext(SectionContext);

export function PerCompany({ children }: { children: React.ReactNode }) {
  const { inTree, companyIds, companyName } = useCompanyScope();
  if (!inTree) return <>{children}</>;
  return (
    <div className="space-y-8">
      {companyIds.map((id, index) => (
        <section key={id} aria-label={companyName(id)} className="space-y-3">
          <h2 className="border-b pb-1 text-sm font-semibold text-muted-foreground">{companyName(id)}</h2>
          <SectionContext.Provider value={index}>
            <InCompany companyId={id}>{children}</InCompany>
          </SectionContext.Provider>
        </section>
      ))}
    </div>
  );
}
