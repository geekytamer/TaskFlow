'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { InvoiceDocument } from '@/modules/finance/components/invoice-document';
import { getPublicDelivery, type PublicInvoicePayload } from '@/services/publicService';
import { useI18n } from '@/context/i18n-context';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

export default function PublicDeliveryPage() {
  const params = useParams();
  const { setLanguage } = useI18n();
  const id = params?.id as string;
  const [data, setData] = React.useState<(PublicInvoicePayload & { deliveryNumber: string }) | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const lang = new URLSearchParams(window.location.search).get('lang');
    if (lang === 'ar' || lang === 'en') setLanguage(lang);
  }, [setLanguage]);

  React.useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    getPublicDelivery(id)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Could not load delivery note.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading delivery note…</div>;
  }
  if (error || !data) {
    return <div className="p-8 text-center text-red-500">{error || 'Delivery note not found.'}</div>;
  }

  return (
    <div
      className="min-h-screen bg-slate-50 p-4 sm:p-8 print:bg-white print:p-0"
      data-invoice-rendered="true"
    >
      <style>{`
        @media print {
          html, body { width: 100% !important; margin: 0 !important; padding: 0 !important; }
          .invoice-print-shell { width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="no-print mx-auto mb-6 flex max-w-[760px] flex-col items-center gap-4 rounded-lg bg-white p-4 shadow-sm sm:flex-row sm:justify-between">
        <p className="text-sm text-slate-500">
          Delivery note <span className="font-medium text-slate-700">{data.deliveryNumber}</span>
          {data.company?.name ? ` · ${data.company.name}` : ''}
        </p>
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Download / Print PDF
        </Button>
      </div>

      <div className="invoice-print-shell mx-auto w-full max-w-[190mm] print:max-w-none">
        <InvoiceDocument
          invoice={data.invoice}
          client={data.client}
          company={data.company || null}
          template={data.template}
        />
      </div>
    </div>
  );
}
