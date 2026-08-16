'use client';

import * as React from 'react';
import { DocRenderer } from '@/modules/finance/doc/doc-renderer';
import { templateToDoc } from '@/modules/finance/doc/template-to-doc';
import { isInvoiceDoc } from '@/modules/finance/doc/validation';
import type { Client, Invoice, InvoiceLineItem } from '@/modules/finance/types';
import type { Company } from '@/modules/companies/types';
import type { VendorBillDocumentPayload } from '@/services/financeService';

/**
 * A vendor bill drawn by the same document engine as invoices and delivery
 * notes, so a company designs its bill layout once in Finance > Bill Templates
 * and the preview, the print page and the server-side PDF all follow it.
 *
 * The engine speaks invoices, so the bill is adapted into that shape: the
 * vendor takes the counterparty slot a client would occupy, and the bill's
 * lines become line items.
 */
export function VendorBillDocument({ data }: { data: VendorBillDocumentPayload }) {
  const { bill, company, vendor, lines, currency, template } = data;

  const taxRate = Number(bill.taxRate || 0);
  const gross = Number(bill.amount || 0);
  const net = taxRate > 0 ? Number((gross / (1 + taxRate / 100)).toFixed(2)) : gross;

  // The engine derives the total as subtotal + tax. Ordered lines are only
  // safe to show when they reproduce the bill's own total that way; otherwise
  // the document would add up to something the bill does not say, so it falls
  // back to a single line carrying the net amount.
  const lineItems: InvoiceLineItem[] = React.useMemo(() => {
    const summed = lines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0);
    const reconciles = lines.length > 0 && Math.abs(summed * (1 + taxRate / 100) - gross) < 0.01;
    if (reconciles) {
      return lines.map((line) => ({
        itemType: 'Manual' as const,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitCost,
        amount: line.lineTotal,
      }));
    }
    return [
      {
        itemType: 'Manual' as const,
        description: bill.notes || `Amount payable to ${vendor?.name || bill.vendorName}`,
        quantity: 1,
        unitPrice: net,
        amount: net,
      },
    ];
  }, [bill.notes, bill.vendorName, gross, lines, net, taxRate, vendor?.name]);

  const asInvoice = {
    ...bill,
    invoiceNumber: bill.billNumber,
    clientId: vendor?.id || '',
    lineItems,
    taxRate,
    currency,
    total: gross,
    // Payment figures carry across so a partly-settled bill still shows what is
    // left rather than reading as though nothing has been paid.
    paidAmount: bill.paidAmount,
    outstandingAmount: bill.outstandingAmount,
  } as unknown as Invoice;

  const counterparty = {
    id: vendor?.id || '',
    name: vendor?.name || bill.vendorName,
    address: vendor?.address,
    email: vendor?.email,
  } as unknown as Client;

  const custom = template?.doc;
  const doc = isInvoiceDoc(custom) ? custom : templateToDoc(template);

  return (
    <DocRenderer
      doc={doc}
      invoice={asInvoice}
      client={counterparty}
      company={(company as unknown as Company) ?? null}
      template={template}
    />
  );
}
