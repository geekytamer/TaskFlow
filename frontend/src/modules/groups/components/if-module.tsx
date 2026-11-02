'use client';

/**
 * Renders its children only where the current company (a group section's own
 * company, inside PerCompany) has `module` switched on; elsewhere a quiet note.
 */
import * as React from 'react';
import { usePermissions } from '@/context/permissions-context';
import { useI18n } from '@/context/i18n-context';
import { useInCompanySection } from './per-company';

export function IfModule({ module, children }: { module: string; children: React.ReactNode }) {
  const { moduleOn } = usePermissions();
  const inSection = useInCompanySection() !== null;
  const { language } = useI18n();
  if (moduleOn(module)) return <>{children}</>;
  if (!inSection) return null;
  return <p className="text-sm text-muted-foreground">{language === 'ar' ? 'هذه الوحدة متوقفة في هذه الشركة.' : 'Switched off in this company.'}</p>;
}
