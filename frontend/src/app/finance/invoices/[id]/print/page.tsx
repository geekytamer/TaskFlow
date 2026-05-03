'use client';

import * as React from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useCompany } from '@/context/company-context';
import { InvoiceDocument } from '@/modules/finance/components/invoice-document';
import { getInvoice, getClients, getInvoiceTemplates } from '@/services/financeService';
import type { Invoice, Client, InvoiceTemplate } from '@/modules/finance/types';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PrintInvoicePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string;
  const shouldAutoPrint = searchParams.get('print') === '1';
  const { selectedCompany } = useCompany();
  const [invoice, setInvoice] = React.useState<Invoice | null>(null);
  const [client, setClient] = React.useState<Client | null>(null);
  const [template, setTemplate] = React.useState<InvoiceTemplate | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!id || !selectedCompany) return;
    
    async function loadData() {
      try {
        setLoading(true);
        const inv = await getInvoice(id);
        if (!inv || inv.companyId !== selectedCompany?.id) {
          setError('Invoice not found or does not belong to the selected company.');
          return;
        }
        setInvoice(inv);

        const [clients, templates] = await Promise.all([
          getClients(selectedCompany.id),
          getInvoiceTemplates(selectedCompany.id)
        ]);

        const c = clients.find(c => c.id === inv.clientId) || null;
        setClient(c);

        const t = templates.find(t => t.id === inv.templateId) || 
                  templates.find(t => t.isDefault) || 
                  templates[0] || 
                  null;
        setTemplate(t);
      } catch (err: any) {
        setError(err.message || 'Error loading invoice');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id, selectedCompany]);

  React.useEffect(() => {
    if (!shouldAutoPrint || loading || !invoice || !selectedCompany) return;

    const printWhenReady = () => {
      const handleAfterPrint = () => {
        if (window.opener) {
          window.close();
        }
      };

      window.addEventListener('afterprint', handleAfterPrint);

      const images = Array.from(document.images);
      const imagePromises = images.map((image) => {
        if (image.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => resolve(), { once: true });
        });
      });

      Promise.all([
        document.fonts?.ready ?? Promise.resolve(),
        ...imagePromises,
      ]).then(() => {
        window.print();
      });

      return () => {
        window.removeEventListener('afterprint', handleAfterPrint);
      };
    };

    const timer = window.setTimeout(printWhenReady, 150);
    return () => window.clearTimeout(timer);
  }, [shouldAutoPrint, loading, invoice, selectedCompany]);

  if (!selectedCompany) {
    return <div className="p-8 text-center text-slate-500">Company not selected. Please go back to the app and select a company.</div>;
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading invoice...</div>;
  }

  if (error || !invoice) {
    return <div className="p-8 text-center text-red-500">{error || 'Invoice not found'}</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8 print:bg-white print:p-0">
      <style>{`
        @media print {
          html, body {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .invoice-print-shell {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>
      <div className="no-print mx-auto mb-6 flex max-w-[760px] flex-col items-center gap-4 rounded-lg bg-white p-4 shadow-sm sm:flex-row sm:justify-between">
        <p className="text-sm text-slate-500">
          {shouldAutoPrint
            ? 'The print dialog should open automatically. Use Pages per sheet = 1 and disable browser headers/footers for a clean PDF.'
            : 'Use Pages per sheet = 1 and disable browser headers/footers in the print dialog for a clean PDF.'}
        </p>
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print / Save PDF
        </Button>
      </div>

      <div className="invoice-print-shell mx-auto w-full max-w-[190mm] print:max-w-none">
        <InvoiceDocument
          invoice={invoice}
          client={client || undefined}
          company={selectedCompany}
          template={template || undefined}
        />
      </div>
    </div>
  );
}
