import type { RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import { asRecord } from '../validation';
import { FlexiError, type FlexiApplication } from '../finance/flexi';
import type { StaffRequest } from './staff-routes';
import { downloadHeaders } from './files';
import { afterStaffMessage, fileDto } from './thread';
import { companyCurrency } from './common';

/**
 * Peak Flexi review for staff: list applications, open their papers, approve
 * with a balance and terms or reject with a reason, and see a contact's
 * balance. Gated by FLEXI_REVIEW. The client hears each decision as a message
 * from the reviewer in their portal conversation.
 */
export function registerStaffFlexiRoutes(
  router: Router,
  store: DataStore,
  authMiddleware: RequestHandler,
  authorize: (req: StaffRequest) => string,
  wrap: (fn: (req: StaffRequest, res: Response) => unknown) => RequestHandler,
): void {
  const guard = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (error) {
      if (error instanceof FlexiError) throw new HttpError(error.status, error.message);
      throw error;
    }
  };

  const dto = (app: FlexiApplication) => ({
    ...app,
    contactName: store.getContactById(app.contactId)?.name ?? '',
    currency: companyCurrency(store, app.companyId),
    reviewerName: app.reviewedBy ? store.getUserById(app.reviewedBy)?.name ?? null : null,
    currentBalance: store.flexi.balanceOf(app.contactId).balance,
    files: store.thread.filesOf('flexi_application', app.id).map(fileDto),
  });

  const load = (companyId: string, id: string) => {
    const app = store.flexi.get(id);
    if (!app || app.companyId !== companyId) throw new HttpError(404, 'Application not found.');
    return app;
  };

  /** Tells the client, in their own conversation, what was decided. */
  const tellClient = (app: FlexiApplication, userId: string, body: string) => {
    const thread = store.conversations.generalThread(app.companyId, app.contactId);
    store.conversations.addMessage({
      threadId: thread.id, channel: 'portal', direction: 'out', visibility: 'external',
      authorType: 'staff', authorUserId: userId, authorPortalUserId: null, body,
    });
    afterStaffMessage(store, { companyId: app.companyId, contactId: app.contactId, userId });
  };

  router.get('/companies/:companyId/flexi-applications', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    if (status && !['new', 'approved', 'rejected', 'withdrawn'].includes(status)) throw new HttpError(400, 'Unknown status.');
    res.json(store.flexi.list(companyId, { status: status as never }).map(dto));
  }));

  router.get('/companies/:companyId/flexi-applications/:id', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    res.json(dto(load(companyId, req.params.id)));
  }));

  router.get('/companies/:companyId/flexi-applications/:id/files/:fileId/content', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const app = load(companyId, req.params.id);
    const file = store.thread.getFile(req.params.fileId);
    if (!file || file.parentType !== 'flexi_application' || file.parentId !== app.id) throw new HttpError(404, 'File not found.');
    res.set(downloadHeaders(file)).send(store.thread.fileContent(file.id));
  }));

  router.post('/companies/:companyId/flexi-applications/:id/approve', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const app = load(companyId, req.params.id);
    const body = asRecord(req.body, 'body');
    const userId = req.user!.id;
    const approved = guard(() => store.transaction(() => {
      const done = store.flexi.approve(app.id, { amount: body.amount, upfrontPct: body.upfrontPct, maxMonths: body.maxMonths, reviewNote: body.reviewNote, reviewerId: userId });
      tellClient(done, userId, `Your Peak Flexi balance is ready: ${done.approvedAmount} ${companyCurrency(store, companyId)}. Down payment ${done.upfrontPct}%, the rest over up to ${done.maxMonths} months.\nرصيدك في بيك فلكسي جاهز: ${done.approvedAmount} ${companyCurrency(store, companyId)}. دفعة مقدمة ${done.upfrontPct}% والباقي على ${done.maxMonths} أشهر كحد أقصى.`);
      return done;
    }));
    res.json(dto(approved));
  }));

  router.post('/companies/:companyId/flexi-applications/:id/reject', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const app = load(companyId, req.params.id);
    const body = asRecord(req.body, 'body');
    const userId = req.user!.id;
    const rejected = guard(() => store.transaction(() => {
      const done = store.flexi.reject(app.id, { reviewNote: body.reviewNote, reviewerId: userId });
      tellClient(done, userId, `We could not approve your Peak Flexi request: ${done.reviewNote}\nما قدرنا نوافق على طلب بيك فلكسي: ${done.reviewNote}`);
      return done;
    }));
    res.json(dto(rejected));
  }));

  router.get('/companies/:companyId/contacts/:contactId/flexi', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const contact = store.getContactById(req.params.contactId);
    if (!contact || contact.companyId !== companyId) throw new HttpError(404, 'Contact not found.');
    res.json({ balance: store.flexi.balanceOf(contact.id), currency: companyCurrency(store, companyId), applications: store.flexi.list(companyId, { contactId: contact.id }).map(dto) });
  }));
}
