'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { VendorBillDocument } from '@/modules/finance/components/vendor-bill-document';
import { getVendorBillPrintDocument, type VendorBillDocumentPayload } from '@/services/financeService';
import { useI18n } from '@/context/i18n-context';

/**
 * Print view for a vendor bill. Unlike the customer invoice page this is not
 * shareable — it only renders for the holder of a one-time ticket, which in
 * practice is the headless browser generating the PDF.
 */
export default function VendorBillPrintPage() {
  const params = useParams();
  const { setLanguage, language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const id = params?.id as string;
  const [data, setData] = React.useState<VendorBillDocumentPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  // Read from location rather than useSearchParams so the production build
  // does not need a Suspense boundary here.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const lang = new URLSearchParams(window.location.search).get('lang');
    if (lang === 'ar' || lang === 'en') setLanguage(lang);
  }, [setLanguage]);

  React.useEffect(() => {
    if (!id || typeof window === 'undefined') return;
    const ticket = new URLSearchParams(window.location.search).get('t') || '';
    if (!ticket) {
      setError(tr('This page needs a valid print link.', 'تحتاج هذه الصفحة إلى رابط طباعة صالح.'));
      setLoading(false);
      return;
    }
    let cancelled = false;
    getVendorBillPrintDocument(id, ticket)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e?.message || tr('Could not load bill.', 'تعذر تحميل الفاتورة.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">{tr('Loading bill…', 'جارٍ تحميل الفاتورة…')}</div>;
  }
  if (error || !data) {
    return <div className="p-8 text-center text-red-500">{error || tr('Bill not found.', 'الفاتورة غير موجودة.')}</div>;
  }
  return (
    <div className="min-h-screen bg-white">
      <VendorBillDocument data={data} />
    </div>
  );
}
