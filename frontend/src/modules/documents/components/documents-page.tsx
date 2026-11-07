'use client';

import * as React from 'react';
import { useI18n } from '@/context/i18n-context';
import { usePermissions } from '@/context/permissions-context';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { DocumentsPanel } from './documents-panel';
import { LibraryPanel } from './library-panel';

export function DocumentsPage() {
  const { language } = useI18n();
  const { can } = usePermissions();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);

  // Everyone has the library; templates and created documents need documents.view.
  if (!can('documents.view')) {
    return (
      <SectionPageShell
        title={tr('Library', 'المكتبة')}
        description={tr('The files on your tasks and projects, in one place.', 'ملفات مهامك ومشاريعك في مكان واحد.')}
      >
        <Card><CardContent className="p-4 sm:p-6"><LibraryPanel /></CardContent></Card>
      </SectionPageShell>
    );
  }

  return (
    <SectionPageShell
      title={tr('Documents', 'المستندات')}
      description={tr(
        'Create reusable letterhead templates, design their content visually, and generate finished documents.',
        'أنشئ قوالب ترويسة قابلة لإعادة الاستخدام وصمّم محتواها بصرياً ثم أنشئ مستندات نهائية.',
      )}
    >
      <DocumentsPanel />
    </SectionPageShell>
  );
}
