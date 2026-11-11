'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import {
  getWhatsappTemplates,
  renderWhatsappTemplate,
  sendWhatsappTemplate,
  type WhatsAppTemplate,
} from '@/services/whatsappService';
import { Loader2, Send } from 'lucide-react';

/**
 * Sends one of the company's approved WhatsApp templates (Cloud API). The
 * only way to write to a customer more than 24 hours after their last message.
 */
export function WhatsappTemplateDialog({
  open,
  onOpenChange,
  companyId,
  phone,
  contactId,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  phone: string;
  contactId?: string;
  onSent?: () => void;
}) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [templates, setTemplates] = React.useState<WhatsAppTemplate[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [selectedKey, setSelectedKey] = React.useState('');
  const [variables, setVariables] = React.useState<string[]>([]);
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    setTemplates(null);
    setLoadError(null);
    getWhatsappTemplates(companyId)
      .then((list) => {
        if (!alive) return;
        setTemplates(list);
        // Prefer a template in the reader's language.
        const first = list.find((t) => t.language.startsWith(language)) || list[0];
        setSelectedKey(first ? `${first.name}|${first.language}` : '');
      })
      .catch((error: any) => alive && setLoadError(error?.message || 'Error'));
    return () => {
      alive = false;
    };
  }, [open, companyId, language]);

  const selected = templates?.find((t) => `${t.name}|${t.language}` === selectedKey);

  React.useEffect(() => {
    setVariables(Array.from({ length: selected?.variableCount ?? 0 }, () => ''));
  }, [selected?.name, selected?.language, selected?.variableCount]);

  const ready = Boolean(selected) && variables.every((v) => v.trim());

  const handleSend = async () => {
    if (!selected || !ready) return;
    setSending(true);
    try {
      await sendWhatsappTemplate(companyId, {
        phone,
        name: selected.name,
        language: selected.language,
        variables: variables.map((v) => v.trim()),
        contactId,
      });
      toast({ title: tr('Template sent', 'تم إرسال القالب') });
      onOpenChange(false);
      onSent?.();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not send', 'تعذّر الإرسال'), description: error?.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tr('Send an approved template', 'إرسال قالب معتمد')}</DialogTitle>
          <DialogDescription>
            {tr(
              'More than 24 hours have passed since this customer last wrote. WhatsApp only allows templates approved by Meta until they reply.',
              'مرّت أكثر من ٢٤ ساعة على آخر رسالة من هذا العميل. واتساب يسمح فقط بالقوالب التي وافقت عليها ميتا حتى يردّ العميل.',
            )}
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : !templates ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {tr(
              'No approved templates yet. Create one in WhatsApp Manager on Meta and wait for approval.',
              'لا توجد قوالب معتمدة بعد. أنشئ قالباً من مدير واتساب في ميتا وانتظر الموافقة عليه.',
            )}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="wa-template">{tr('Template', 'القالب')}</Label>
              <select
                id="wa-template"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                    {t.name} ({t.language})
                  </option>
                ))}
              </select>
            </div>
            {variables.map((value, i) => (
              <div key={i} className="space-y-1">
                <Label htmlFor={`wa-var-${i}`}>
                  {tr('Value', 'القيمة')} {`{{${i + 1}}}`}
                </Label>
                <Input
                  id={`wa-var-${i}`}
                  value={value}
                  onChange={(e) => setVariables((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                />
              </div>
            ))}
            {selected && (
              <div className="rounded-lg bg-[#d9fdd3] p-3 text-sm whitespace-pre-wrap text-slate-900 dark:bg-[#005c4b] dark:text-[#e9edef]">
                {selected.headerText && <p className="mb-1 font-semibold">{selected.headerText}</p>}
                <p>{renderWhatsappTemplate(selected.bodyText, variables)}</p>
                {selected.footerText && <p className="mt-1 text-xs opacity-70">{selected.footerText}</p>}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tr('Cancel', 'إلغاء')}
          </Button>
          <Button onClick={handleSend} disabled={!ready || sending}>
            {sending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Send className="me-2 h-4 w-4" />}
            {tr('Send', 'إرسال')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
