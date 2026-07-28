'use client';

import * as React from 'react';
import { useI18n } from '@/context/i18n-context';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { DocumentsPanel } from './documents-panel';

export function DocumentsPage() {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);

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
