import type { RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import { asRecord } from '../validation';
import { downloadHeaders, readUpload } from '../portal/files';
import { companyCurrency, type SessionRequest } from '../portal/common';
import type { PortalSession } from '../portal/portal-store';
import { calendarItems } from './calendar';
import { moneySummary } from './money';
import { PEAK_PREFIX, peakDeal, peakDeals } from './peak-mirror';
import { checkDealDates, currency, day, parseContact, parseDeal, parseDeliverable, parseExpense, parsePayment, text } from './validation';
import type { Owner, WsContact, WsDeal, WsDeliverable, WsExpense, WsFileMeta, WsPayment } from './workspace-store';

/**
 * The influencer's own workspace through the portal. Every id is looked up
 * within the session's own influencer; anyone else's id is 404.
 */

export const contactDto = (c: WsContact) => ({
  id: c.id, name: c.name, kind: c.kind, company: c.company, email: c.email, phone: c.phone, notes: c.notes, archived: Boolean(c.archivedAt),
});

export const deliverableDto = (d: WsDeliverable) => ({
  id: d.id, title: d.title, platform: d.platform, dueDate: d.dueDate, status: d.status, postUrl: d.postUrl,
});

export const paymentDto = (p: WsPayment) => ({ id: p.id, dealId: p.dealId, amount: p.amount, currency: p.currency, receivedOn: p.receivedOn, note: p.note });
export const expenseDto = (e: WsExpense) => ({ id: e.id, dealId: e.dealId, category: e.category, amount: e.amount, currency: e.currency, spentOn: e.spentOn, note: e.note });

const fileDto = (f: WsFileMeta) => ({ id: f.id, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes, createdAt: f.createdAt });

export function dealDto(store: DataStore, o: Owner, d: WsDeal) {
  const brand = d.wsContactId ? store.workspace.contact(o, d.wsContactId) : undefined;
  const next = store.workspace.deliverables(o, d.id).find((x) => x.status === 'todo' && x.dueDate);
  return {
    id: d.id, source: 'own' as const, title: d.title, amount: d.amount, currency: d.currency, status: d.status,
    startDate: d.startDate, endDate: d.endDate, notes: d.notes,
    brand: brand ? { id: brand.id, name: brand.name, archived: Boolean(brand.archivedAt) } : null,
    nextDue: next ? { title: next.title, dueDate: next.dueDate } : null,
    updatedAt: d.updatedAt,
  };
}

export const ownerOf = (companyId: string, session: PortalSession): Owner => ({ companyId, ownerContactId: session.contactId });

export function registerWorkspacePortalRoutes(router: Router, store: DataStore, companyId: string, requireInfluencerSession: RequestHandler): void {
  const ws = store.workspace;
  const base = '/influencer/workspace';
  const owner = (req: SessionRequest) => ownerOf(companyId, req.portal!);
  const notFound = () => new HttpError(404, 'Not found.');
  const body = (req: SessionRequest) => asRecord(req.body ?? {}, 'body');
  const defaultCurrency = (o: Owner) => ws.settings(o).defaultCurrency ?? companyCurrency(store, companyId);

  /** A brand the deal may point at: this influencer's, and not archived. */
  const brandFor = (o: Owner, wsContactId: string | null | undefined) => {
    if (!wsContactId) return;
    const brand = ws.contact(o, wsContactId);
    if (!brand) throw notFound();
    if (brand.archivedAt) throw new HttpError(400, 'That contact is archived.');
  };

  const route = (method: 'get' | 'post', path: string, fn: (req: SessionRequest, res: Response, o: Owner) => void) =>
    router[method](`${base}${path}`, requireInfluencerSession, (req: SessionRequest, res: Response) => fn(req, res, owner(req)));

  // ── Contacts ──
  route('get', '/contacts', (_req, res, o) => res.json(ws.contacts(o).map(contactDto)));

  route('post', '/contacts', (req, res, o) => {
    const input = parseContact(body(req));
    res.status(201).json(contactDto(ws.addContact(o, input as Parameters<typeof ws.addContact>[1])));
  });

  route('get', '/contacts/:id', (req, res, o) => {
    const contact = ws.contact(o, req.params.id);
    if (!contact) throw notFound();
    res.json({
      ...contactDto(contact),
      log: ws.notes(o, contact.id).map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt })),
      deals: ws.deals(o).filter((d) => d.wsContactId === contact.id).map((d) => dealDto(store, o, d)),
    });
  });

  route('post', '/contacts/:id', (req, res, o) => {
    const updated = ws.updateContact(o, req.params.id, parseContact(body(req), true));
    if (!updated) throw notFound();
    res.json(contactDto(updated));
  });

  route('post', '/contacts/:id/archive', (req, res, o) => {
    if (!ws.contact(o, req.params.id)) throw notFound();
    ws.archiveContact(o, req.params.id);
    res.status(204).end();
  });

  route('post', '/contacts/:id/notes', (req, res, o) => {
    const note = ws.addNote(o, req.params.id, text(body(req).body, 'body', 4000));
    if (!note) throw notFound();
    res.status(201).json({ id: note.id, body: note.body, createdAt: note.createdAt });
  });

  // ── Deals ──
  const influencer = (o: Owner) => {
    const contact = store.getContactById(o.ownerContactId);
    if (!contact || contact.companyId !== companyId) throw notFound();
    return contact;
  };
  const sortKey = (d: { startDate: string | null; updatedAt: string }) => d.startDate ?? d.updatedAt.slice(0, 10);

  /** Own deals and Peak deals in one list, newest first; `?source=own|peak` narrows it. */
  route('get', '/deals', (req, res, o) => {
    const source = req.query.source;
    const own = source === 'peak' ? [] : ws.deals(o).map((d) => dealDto(store, o, d));
    const peak = source === 'own' ? [] : peakDeals(store, companyId, influencer(o), companyCurrency(store, companyId)).map(({ assignment: _a, ...d }) => d);
    res.json([...own, ...peak].sort((a, b) => sortKey(b).localeCompare(sortKey(a))));
  });

  route('post', '/deals', (req, res, o) => {
    const input = parseDeal(body(req));
    brandFor(o, input.wsContactId);
    checkDealDates(input);
    const deal = ws.addDeal(o, { ...input, currency: input.currency ?? defaultCurrency(o) } as Parameters<typeof ws.addDeal>[1]);
    res.status(201).json(dealDto(store, o, deal));
  });

  route('get', '/deals/:id', (req, res, o) => {
    if (req.params.id.startsWith(PEAK_PREFIX)) {
      const assignment = store.getCampaignAssignmentById(req.params.id.slice(PEAK_PREFIX.length));
      const deal = assignment && assignment.companyId === companyId && assignment.contactId === o.ownerContactId
        ? peakDeal(store, assignment, influencer(o), companyCurrency(store, companyId)) : undefined;
      if (!deal) throw notFound();
      res.json(deal);
      return;
    }
    const deal = ws.deal(o, req.params.id);
    if (!deal) throw notFound();
    const payments = ws.payments(o, deal.id);
    res.json({
      ...dealDto(store, o, deal),
      deliverables: ws.deliverables(o, deal.id).map(deliverableDto),
      files: ws.files(o, deal.id).map(fileDto),
      payments: payments.map(paymentDto),
      expenses: ws.expenses(o).filter((e) => e.dealId === deal.id).map(expenseDto),
      received: Math.round(payments.reduce((sum, p) => sum + p.amount, 0) * 1000) / 1000,
    });
  });

  route('post', '/deals/:id', (req, res, o) => {
    const current = ws.deal(o, req.params.id);
    if (!current) throw notFound();
    const patch = parseDeal(body(req), true);
    if (patch.wsContactId && patch.wsContactId !== current.wsContactId) brandFor(o, patch.wsContactId);
    checkDealDates({ ...current, ...patch });
    res.json(dealDto(store, o, ws.updateDeal(o, current.id, patch)!));
  });

  route('post', '/deals/:id/delete', (req, res, o) => {
    if (!ws.deleteDeal(o, req.params.id)) throw notFound();
    res.status(204).end();
  });

  // ── Deliverables ──
  route('post', '/deals/:id/deliverables', (req, res, o) => {
    const input = parseDeliverable(body(req));
    const created = ws.addDeliverable(o, req.params.id, input as Parameters<typeof ws.addDeliverable>[2]);
    if (!created) throw notFound();
    res.status(201).json(deliverableDto(created));
  });

  route('post', '/deliverables/:id', (req, res, o) => {
    const updated = ws.updateDeliverable(o, req.params.id, parseDeliverable(body(req), true));
    if (!updated) throw notFound();
    res.json(deliverableDto(updated));
  });

  route('post', '/deliverables/:id/delete', (req, res, o) => {
    if (!ws.deleteDeliverable(o, req.params.id)) throw notFound();
    res.status(204).end();
  });

  // ── Files ──
  route('post', '/deals/:id/files', (req, res, o) => {
    if (!ws.deal(o, req.params.id)) throw notFound();
    const upload = readUpload(body(req));
    const file = ws.addFile(o, req.params.id, { fileName: upload.fileName, mimeType: upload.type, content: upload.content })!;
    res.status(201).json(fileDto(file));
  });

  route('get', '/files/:id/content', (req, res, o) => {
    const file = ws.fileContent(o, req.params.id);
    if (!file) throw notFound();
    res.set(downloadHeaders(file.meta)).send(file.content);
  });

  route('post', '/files/:id/delete', (req, res, o) => {
    if (!ws.deleteFile(o, req.params.id)) throw notFound();
    res.status(204).end();
  });

  // ── Payments and expenses ──
  route('post', '/deals/:id/payments', (req, res, o) => {
    const deal = ws.deal(o, req.params.id);
    if (!deal) throw notFound();
    const input = parsePayment(body(req));
    if (input.currency !== deal.currency) throw new HttpError(400, `This deal is in ${deal.currency}; record the payment in ${deal.currency}.`);
    res.status(201).json(paymentDto(ws.addPayment(o, deal.id, input)!));
  });

  route('post', '/payments/:id/delete', (req, res, o) => {
    if (!ws.deletePayment(o, req.params.id)) throw notFound();
    res.status(204).end();
  });

  route('get', '/expenses', (_req, res, o) => res.json(ws.expenses(o).map(expenseDto)));

  route('post', '/expenses', (req, res, o) => {
    const created = ws.addExpense(o, parseExpense(body(req)));
    if (!created) throw notFound();
    res.status(201).json(expenseDto(created));
  });

  route('post', '/expenses/:id/delete', (req, res, o) => {
    if (!ws.deleteExpense(o, req.params.id)) throw notFound();
    res.status(204).end();
  });

  /** `from` and `to` (YYYY-MM-DD), at most 93 days apart; this month when not given. */
  route('get', '/calendar', (req, res, o) => {
    const now = new Date();
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const from = req.query.from === undefined ? first.toISOString().slice(0, 10) : day(req.query.from, 'from');
    const to = req.query.to === undefined ? last.toISOString().slice(0, 10) : day(req.query.to, 'to');
    if (!from || !to || to < from) throw new HttpError(400, 'Give from and to as dates, from first.');
    if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 93) throw new HttpError(400, 'Ask for at most 93 days at a time.');
    res.json(calendarItems(store, companyId, influencer(o), from, to));
  });

  route('get', '/money', (req, res, o) => {
    const raw = req.query.year === undefined ? String(new Date().getUTCFullYear()) : String(req.query.year);
    if (!/^\d{4}$/.test(raw)) throw new HttpError(400, 'year must be like 2026.');
    res.json(moneySummary(store, companyId, influencer(o), Number(raw)));
  });

  // ── Settings ──
  route('get', '/settings', (_req, res, o) => res.json({ defaultCurrency: defaultCurrency(o) }));

  route('post', '/settings', (req, res, o) => {
    ws.setSettings(o, { defaultCurrency: currency(body(req).defaultCurrency, 'defaultCurrency') });
    res.json({ defaultCurrency: defaultCurrency(o) });
  });
}
