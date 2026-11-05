'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus2, FileSignature, FileText, Handshake, Megaphone, Receipt, ScrollText } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { usePermissions } from '@/context/permissions-context';
import { useToast } from '@/hooks/use-toast';
import { isModuleOn } from '@/modules/companies/lib/company-modules';
import { getDocumentTemplateType } from '@/modules/documents/document-template-types';
import {
  STARTER_TEMPLATES, brandSource, starterTemplateInput, type StarterKey, type StarterLang,
} from '@/modules/documents/starter-templates';
import type { InvoiceTemplate } from '@/modules/finance/types';
import { createInvoiceTemplate } from '@/services/financeService';

const STARTER_ICONS: Record<StarterKey, React.ComponentType<{ className?: string }>> = {
  mou: Handshake,
  service_agreement: FileSignature,
  influencer_agreement: Megaphone,
  to_whom_letter: ScrollText,
  blank: FilePlus2,
};

/**
 * One place to start any document (spec 2026-11-06-documents-hub-design, stage 2):
 * a priced quotation, one of the company's templates, or a ready-made one.
 */
export function NewDocumentDialog({
  open,
  onOpenChange,
  templates,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The company's templates of creatable types. */
  templates: InvoiceTemplate[];
  /** Start composing on this template (a ready-made one arrives already saved). */
  onPick: (template: InvoiceTemplate, installed: boolean) => void;
}) {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { can } = usePermissions();
  const { toast } = useToast();
  const router = useRouter();
  const [lang, setLang] = React.useState<StarterLang>(language === 'ar' ? 'ar' : 'en');
  const [busy, setBusy] = React.useState<StarterKey | null>(null);

  React.useEffect(() => { if (open) setLang(language === 'ar' ? 'ar' : 'en'); }, [open, language]);

  const canQuote = isModuleOn(selectedCompany, 'sales') && can('sales.create');
  const sorted = React.useMemo(
    () => [...templates].sort((a, b) => new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime()),
    [templates],
  );

  const install = async (key: StarterKey) => {
    if (!selectedCompany) return;
    setBusy(key);
    try {
      const saved = await createInvoiceTemplate(selectedCompany.id, starterTemplateInput(key, lang, brandSource(templates)));
      onOpenChange(false);
      onPick(saved, true);
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not add the template', 'تعذّر إضافة القالب'), description: error?.message });
    } finally {
      setBusy(null);
    }
  };

  const tile = 'flex w-full items-start gap-3 rounded-lg border p-3 text-start transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tr('New document', 'مستند جديد')}</DialogTitle>
          <DialogDescription>
            {tr('Pick what to write. Ready-made templates are saved to your templates, where you can change the wording and look.', 'اختر ما تريد كتابته. القوالب الجاهزة تُحفظ ضمن قوالبك، وتقدر تعدّل نصها وشكلها.')}
          </DialogDescription>
        </DialogHeader>

        {canQuote && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">{tr('Priced offer', 'عرض بأسعار')}</h3>
            <button
              type="button"
              className={tile}
              onClick={() => { onOpenChange(false); router.push('/sales?tab=quotations&new=1'); }}
            >
              <Receipt className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block font-medium">{tr('Quotation', 'عرض سعر')}</span>
                <span className="block text-sm text-muted-foreground">
                  {tr('Items or services with prices and VAT; turns into an invoice when the client accepts.', 'بنود أو خدمات بأسعار وضريبة؛ يتحول لفاتورة لما يوافق العميل.')}
                </span>
              </span>
            </button>
          </section>
        )}

        {sorted.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">{tr('Your templates', 'قوالبك')}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {sorted.map((template) => {
                const type = getDocumentTemplateType(template.docType ?? 'custom');
                return (
                  <button
                    key={template.id}
                    type="button"
                    className={tile}
                    onClick={() => { onOpenChange(false); onPick(template, false); }}
                  >
                    <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate font-medium"><bdi>{template.name}</bdi></span>
                      <span className="block text-sm text-muted-foreground">
                        {tr(type.label, type.labelAr)}{template.isDefault ? tr(' · default', ' · افتراضي') : ''}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{tr('Ready-made', 'قوالب جاهزة')}</h3>
            <div className="inline-flex rounded-md border p-0.5" role="group" aria-label={tr('Template language', 'لغة القالب')}>
              {(['ar', 'en'] as const).map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={lang === value ? 'secondary' : 'ghost'}
                  aria-pressed={lang === value}
                  onClick={() => setLang(value)}
                  className="h-7 px-3"
                >
                  {value === 'ar' ? 'العربية' : 'English'}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {STARTER_TEMPLATES.map((starter) => {
              const Icon = STARTER_ICONS[starter.key];
              return (
                <button
                  key={starter.key}
                  type="button"
                  className={tile}
                  disabled={busy !== null}
                  onClick={() => install(starter.key)}
                >
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <span>
                    <span className="block font-medium" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                      {busy === starter.key ? tr('Adding…', 'جارٍ الإضافة…') : starter.name[lang]}
                    </span>
                    <span className="block text-sm text-muted-foreground">{tr(starter.description.en, starter.description.ar)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
