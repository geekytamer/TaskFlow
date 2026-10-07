'use client';

import * as React from 'react';
import Link from 'next/link';
import { Briefcase, Loader2, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { getInfluencerWorkspace, makePeakContact, type InfluencerWorkspace } from '@/services/workspaceService';

const KIND: Record<string, [string, string]> = { brand: ['Brand', 'علامة تجارية'], agency: ['Agency', 'وكالة'], manager: ['Manager', 'مدير أعمال'], other: ['Other', 'أخرى'] };
const STATUS: Record<string, [string, string]> = {
  lead: ['Lead', 'محتملة'], confirmed: ['Confirmed', 'مؤكدة'], delivered: ['Delivered', 'سُلِّمت'], paid: ['Paid', 'مدفوعة'], cancelled: ['Cancelled', 'ملغاة'],
};

const money = (n: number, currency: string, lang: string) =>
  new Intl.NumberFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 3 }).format(n);

/**
 * "Work outside Peak": what the influencer records in their own workspace
 * (their clients and what each pays). Shown here and nowhere else in the staff app.
 */
export function WorkspaceSection({ contactId }: { contactId: string }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [data, setData] = React.useState<InfluencerWorkspace | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [making, setMaking] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    getInfluencerWorkspace(contactId).then(setData).catch(() => setFailed(true));
  }, [contactId]);
  React.useEffect(load, [load]);

  async function promote(wsContactId: string) {
    setMaking(wsContactId);
    try {
      await makePeakContact(contactId, wsContactId);
      toast({ title: tr('Added to Peak contacts as a lead', 'أُضيفت إلى جهات اتصال بيك كعميل محتمل') });
      load();
    } catch (error) {
      toast({ variant: 'destructive', title: tr('Could not add the contact', 'تعذّرت إضافة جهة الاتصال'), description: (error as Error)?.message });
    } finally {
      setMaking(null);
    }
  }

  if (failed) return null;

  const totals = new Map<string, InfluencerWorkspace['byBrand']>();
  for (const row of data?.byBrand ?? []) totals.set(row.brandId ?? '', [...(totals.get(row.brandId ?? '') ?? []), row]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Briefcase className="h-4 w-4" />
          {tr('Work outside Peak', 'العمل خارج بيك')}
        </CardTitle>
        <CardDescription>
          {tr('What this influencer records in their own workspace: their clients and what each pays.', 'ما يسجّله هذا المؤثر في مساحة عمله: عملاؤه وما يدفعه كل منهم.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{tr('Loading…', 'جارٍ التحميل…')}</div>
        ) : data.contacts.length === 0 && data.deals.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            {tr('Nothing recorded yet. It appears here once they add clients or deals in their portal.', 'لم يُسجَّل شيء بعد. يظهر هنا عندما يضيف عملاء أو صفقات في بوابته.')}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr('Client', 'العميل')}</TableHead>
                    <TableHead>{tr('Type', 'النوع')}</TableHead>
                    <TableHead className="text-end">{tr('Deals', 'الصفقات')}</TableHead>
                    <TableHead className="text-end">{tr('Total agreed', 'إجمالي المتفق عليه')}</TableHead>
                    <TableHead className="text-end">{tr('Peak contact', 'جهة اتصال بيك')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.contacts.map((c) => {
                    const rows = totals.get(c.id) ?? [];
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="font-medium"><bdi dir="auto">{c.name}</bdi></div>
                          {(c.company || c.email) && <div className="text-xs text-muted-foreground"><bdi dir="auto">{[c.company, c.email].filter(Boolean).join(' · ')}</bdi></div>}
                        </TableCell>
                        <TableCell>
                          {tr(...(KIND[c.kind] ?? KIND.other))}
                          {c.archived && <Badge variant="outline" className="ms-2">{tr('Archived', 'مؤرشفة')}</Badge>}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">{rows.reduce((n, r) => n + r.deals, 0) || '—'}</TableCell>
                        <TableCell className="text-end tabular-nums">
                          {rows.length ? rows.map((r) => <div key={r.currency}>{money(r.total, r.currency, language)}</div>) : '—'}
                        </TableCell>
                        <TableCell className="text-end">
                          {c.peakContactId ? (
                            <Link href={`/contacts/${c.peakContactId}`} className="text-sm text-primary hover:underline">{tr('Open', 'فتح')}</Link>
                          ) : (
                            <Button size="sm" variant="outline" disabled={making === c.id} onClick={() => promote(c.id)}>
                              {making === c.id ? <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" /> : <UserPlus className="me-1 h-3.5 w-3.5" />}
                              {tr('Make a Peak contact', 'إضافة إلى بيك')}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {data.deals.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground">{tr('Recent deals', 'أحدث الصفقات')}</h4>
                <ul className="divide-y rounded-md border">
                  {data.deals.slice(0, 10).map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium"><bdi dir="auto">{d.title}</bdi></div>
                        <div className="truncate text-xs text-muted-foreground">
                          <bdi dir="auto">{[d.brandName, d.startDate].filter(Boolean).join(' · ') || '—'}</bdi>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {d.amount != null && <span className="tabular-nums">{money(d.amount, d.currency, language)}</span>}
                        <Badge variant="secondary">{tr(...(STATUS[d.status] ?? STATUS.lead))}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
