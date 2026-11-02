'use client';

/** For fanOut's `skip`: leave out, without asking, companies where `module` is switched off. */
import * as React from 'react';
import { useCompany } from '@/context/company-context';
import type { MissingReason } from '@/lib/fan-out';

export function useModuleSkip(): (module: string) => (companyId: string) => MissingReason | null {
  const { companies } = useCompany();
  return React.useCallback(
    (module: string) => (companyId: string) =>
      companies.find((c) => c.id === companyId)?.disabledModules?.includes(module) ? 'off' : null,
    [companies],
  );
}
