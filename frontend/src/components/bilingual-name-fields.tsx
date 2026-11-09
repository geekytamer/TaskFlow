'use client';

import * as React from 'react';
import { Languages, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/context/i18n-context';
import { isApiError } from '@/lib/api-client';
import { suggestName } from '@/services/nameSuggestionService';

export type BilingualNames = { nameAr: string; nameEn: string };

/** Starting values for the two fields from a saved record (falls back to `name` by its letters). */
export function namesOf(record?: { name?: string; nameAr?: string; nameEn?: string } | null): BilingualNames {
  if (!record) return { nameAr: '', nameEn: '' };
  const arabic = /[؀-ۿ]/.test(record.name ?? '');
  return {
    nameAr: record.nameAr ?? (arabic ? record.name ?? '' : ''),
    nameEn: record.nameEn ?? (!arabic ? record.name ?? '' : ''),
  };
}

/**
 * What a form sends: both sides ("" clears one) and `name` from the side the
 * person works in, so a new record's `name` starts in their language.
 */
export function namesPayload(names: BilingualNames, language: string) {
  const nameAr = names.nameAr.trim();
  const nameEn = names.nameEn.trim();
  const name = language === 'ar' ? nameAr || nameEn : nameEn || nameAr;
  return { name, nameAr, nameEn };
}

/**
 * The two name inputs, the person's own language first, and "Suggest
 * translation" on the empty one. The suggestion only fills the field; the
 * person reviews it and saves the form themselves.
 */
export function BilingualNameFields({
  value,
  onChange,
  companyId,
  kind,
  idPrefix = 'name',
  required = true,
}: {
  value: BilingualNames;
  onChange: (next: BilingualNames) => void;
  companyId?: string;
  /** "name" for people and businesses (written as they sound), "term" for services and products. */
  kind: 'name' | 'term';
  idPrefix?: string;
  required?: boolean;
}) {
  const { language } = useI18n();
  const { toast } = useToast();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [busy, setBusy] = React.useState<'ar' | 'en' | null>(null);

  const suggest = async (target: 'ar' | 'en') => {
    const from = target === 'ar' ? 'en' : 'ar';
    const text = (from === 'ar' ? value.nameAr : value.nameEn).trim();
    if (!companyId || !text) return;
    setBusy(target);
    try {
      const suggestion = await suggestName(companyId, { text, from, kind });
      onChange({ ...value, [target === 'ar' ? 'nameAr' : 'nameEn']: suggestion });
      toast({ title: tr('Suggestion filled in — check it before you save', 'تمت تعبئة الاقتراح — راجعه قبل الحفظ') });
    } catch (error) {
      const offline = isApiError(error) && error.status === 503;
      toast({
        variant: 'destructive',
        title: offline ? tr('The assistant is offline', 'المساعد غير متاح حاليًا') : tr('No suggestion this time', 'تعذر الاقتراح هذه المرة'),
        description: tr('Type the name yourself.', 'اكتب الاسم بنفسك.'),
      });
    } finally {
      setBusy(null);
    }
  };

  const field = (side: 'ar' | 'en') => {
    const key = side === 'ar' ? 'nameAr' : 'nameEn';
    const other = side === 'ar' ? value.nameEn : value.nameAr;
    const canSuggest = Boolean(companyId) && !value[key].trim() && Boolean(other.trim());
    return (
      <div className="space-y-1" key={side}>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${idPrefix}-${side}`}>{side === 'ar' ? 'الاسم بالعربي' : 'Name in English'}</Label>
          {canSuggest && (
            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={busy !== null} onClick={() => suggest(side)}>
              {busy === side ? <Loader2 className="me-1 h-3 w-3 animate-spin" /> : <Languages className="me-1 h-3 w-3" />}
              {tr('Suggest translation', 'اقترح ترجمة')}
            </Button>
          )}
        </div>
        <Input
          id={`${idPrefix}-${side}`}
          dir={side === 'ar' ? 'rtl' : 'ltr'}
          lang={side}
          value={value[key]}
          maxLength={200}
          required={required && !other.trim()}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        />
      </div>
    );
  };

  const order: Array<'ar' | 'en'> = language === 'ar' ? ['ar', 'en'] : ['en', 'ar'];
  return <div className="grid gap-3 sm:grid-cols-2">{order.map(field)}</div>;
}
