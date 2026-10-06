import { CreditLimitError, type DataStore } from '../data/store';
import { isoDate, nextRun, type RecurringBillContent, type RecurringDocument, type RecurringInvoiceContent } from './recurring';

/** A schedule that fell far behind (server off for months) catches up this many runs per pass. */
const MAX_CATCH_UP = 12;

export interface RecurringRunResult { created: number; held: number; failed: number }

const addDays = (date: string, days: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days));
};

/**
 * Creates every recurring invoice and bill due on or before `now`. Each run
 * date is claimed before anything is created, so a second process or a rerun
 * never duplicates a document. A run that cannot be created (a locked period,
 * a missing client) is recorded as failed and the owner is told; the schedule
 * moves on. An issued invoice that would break the client's credit limit is
 * created as a draft instead ("held"). `only` limits the pass to one schedule
 * (right after it is saved, so a schedule starting today does not wait).
 */
export function runDueRecurring(store: DataStore, now: Date = new Date(), only?: { id: string }): RecurringRunResult {
  const today = isoDate(now);
  const result: RecurringRunResult = { created: 0, held: 0, failed: 0 };
  for (const schedule of store.recurring.due(today).filter((s) => !only || s.id === only.id)) {
    let runDate = schedule.nextRunDate;
    for (let i = 0; i < MAX_CATCH_UP && runDate <= today; i += 1) {
      if (schedule.endDate && runDate > schedule.endDate) break;
      if (store.recurring.claim(schedule.id, runDate)) {
        const outcome = createOne(store, schedule, runDate);
        store.recurring.finish(schedule.id, runDate, outcome.status, outcome.documentId, outcome.message);
        result[outcome.status === 'created' ? 'created' : outcome.status] += 1;
        tell(store, schedule, runDate, outcome);
      }
      runDate = nextRun(runDate, schedule.frequency, schedule.startDate);
    }
    const ended = Boolean(schedule.endDate && runDate > schedule.endDate);
    store.recurring.advance(schedule.id, runDate, !ended);
  }
  return result;
}

type Outcome = { status: 'created' | 'held' | 'failed'; documentId: string | null; message: string | null };

function createOne(store: DataStore, schedule: RecurringDocument, runDate: string): Outcome {
  const issueDate = addDays(runDate, 0);
  const dueDate = addDays(runDate, schedule.paymentTermsDays);
  try {
    if (schedule.kind === 'invoice') {
      const content = schedule.content as RecurringInvoiceContent;
      const make = (status: 'Draft' | 'Sent') => store.createInvoice({
        companyId: schedule.companyId, clientId: schedule.partyId, issueDate, dueDate, status, total: 0,
        lineItems: content.lineItems, taxRate: content.taxRate, currency: content.currency, templateId: content.templateId,
        notes: content.notes,
      });
      if (schedule.mode === 'draft') return { status: 'created', documentId: make('Draft').id, message: null };
      try {
        return { status: 'created', documentId: store.withinCreditLimit(schedule.partyId, () => make('Sent')).id, message: null };
      } catch (error) {
        if (!(error instanceof CreditLimitError)) throw error;
        return { status: 'held', documentId: make('Draft').id, message: error.message };
      }
    }
    const content = schedule.content as RecurringBillContent;
    const supplier = store.getSupplierById(schedule.partyId);
    if (!supplier || supplier.companyId !== schedule.companyId) throw new Error('The supplier no longer exists.');
    const bill = store.createVendorBill({
      companyId: schedule.companyId, supplierId: supplier.id, vendorName: supplier.name, issueDate, dueDate,
      amount: content.amount, taxRate: content.taxRate, expenseAccountId: content.expenseAccountId, notes: content.notes,
      status: schedule.mode === 'issue' ? 'Approved' : 'Draft',
    });
    return { status: 'created', documentId: bill.id, message: null };
  } catch (error) {
    return { status: 'failed', documentId: null, message: error instanceof Error ? error.message : String(error) };
  }
}

function tell(store: DataStore, schedule: RecurringDocument, runDate: string, outcome: Outcome) {
  const what = schedule.kind === 'invoice' ? 'invoice' : 'bill';
  const title = outcome.status === 'created'
    ? `Recurring ${what} "${schedule.name}" created for ${runDate}`
    : outcome.status === 'held'
      ? `Recurring invoice "${schedule.name}" kept as a draft: over the credit limit`
      : `Recurring ${what} "${schedule.name}" could not be created for ${runDate}`;
  try {
    store.notify({
      companyId: schedule.companyId, userIds: [schedule.createdByUserId], type: 'recurring_document', title,
      body: outcome.message ?? undefined, link: schedule.kind === 'invoice' ? '/finance?tab=invoices' : '/finance?tab=payables',
      entityType: 'recurring_document', entityId: schedule.id,
    });
  } catch { /* a notification never blocks the run */ }
}
