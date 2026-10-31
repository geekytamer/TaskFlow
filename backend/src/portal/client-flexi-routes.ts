import type { RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import { asRecord } from '../validation';
import { FlexiError, type FlexiApplication } from '../finance/flexi';
import { companyCurrency, raiseFollowup, type SessionRequest } from './common';
import { fileDto, parseFileIds } from './thread';

/**
 * A client's Peak Flexi balance and their applications for it. Everything is
 * scoped to the session's own contact; staff decide in TaskFlow.
 */
export function registerClientFlexiRoutes(
  router: Router,
  store: DataStore,
  companyId: string,
  requireClientSession: RequestHandler,
): void {
  const guard = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (error) {
      if (error instanceof FlexiError) throw new HttpError(error.status, error.message);
      throw error;
    }
  };

  /** What the client sees: the decision and its reason, never who made it. */
  const dto = (app: FlexiApplication) => ({
    id: app.id,
    kind: app.kind,
    status: app.status,
    requestedAmount: app.requestedAmount,
    approvedAmount: app.approvedAmount,
    reviewNote: app.status === 'rejected' ? app.reviewNote : null,
    createdAt: app.createdAt,
    reviewedAt: app.reviewedAt,
    files: store.thread.filesOf('flexi_application', app.id).map(fileDto),
  });

  router.get('/client/flexi', requireClientSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    const { clientId: _clientId, ...balance } = store.flexi.balanceOf(session.contactId);
    const open = store.flexi.openFor(session.contactId);
    const last = store.flexi.latestFor(session.contactId);
    res.json({ balance, currency: companyCurrency(store, companyId), open: open ? dto(open) : null, last: last ? dto(last) : null });
  });

  router.post('/client/flexi/applications', requireClientSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    const contact = store.getContactById(session.contactId);
    if (!contact) throw new HttpError(404, 'Not found.');
    const body = asRecord(req.body, 'body');
    const fileIds = parseFileIds(body.fileIds);
    const staff = store.getUsersByCompany(companyId)
      .filter((u) => (u.companyRoles ?? []).some((r) => r.companyId === companyId && (r.role === 'Admin' || r.role === 'Manager')));
    const app = guard(() => store.transaction(() => store.runAsActor({ name: `Portal: ${session.name} (${contact.name})` }, () => {
      const created = store.flexi.submit({
        companyId, contactId: contact.id, kind: body.kind as never, crNumber: body.crNumber, requestedAmount: body.requestedAmount,
        note: body.note, fileIds, createdBy: session.portalUserId,
      });
      const what = created.kind === 'activation' ? 'Peak Flexi application' : 'Peak Flexi increase request';
      const followup = raiseFollowup(store, {
        companyId, entityType: 'contact', entityId: contact.id,
        title: `Review the ${what} from ${contact.name}`, priority: 'high', dueDays: 1, ownerUserId: contact.ownerUserId,
        notes: `${session.name}`, sourceTrigger: 'portal_flexi', sourceType: 'flexi_application', sourceId: created.id,
      });
      if (staff.length) {
        store.notify({
          companyId,
          userIds: staff.map((u) => u.id),
          type: 'followup_assigned',
          title: `${what}: ${contact.name}`,
          body: session.name,
          data: { tKey: 'notif.followupAssigned.t', name: `${what}: ${contact.name}` },
          link: `/crm/flexi?id=${created.id}`,
          entityType: 'follow_up',
          entityId: followup.id,
        });
      }
      return created;
    })));
    res.status(201).json(dto(app));
  });

  router.post('/client/flexi/applications/:id/withdraw', requireClientSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    res.json(dto(guard(() => store.flexi.withdraw(req.params.id, session.contactId))));
  });
}
