import type { Express } from 'express';
import { HttpError } from '../http';
import { workspaceSummary } from '../workspace/staff-view';
import type { Owner } from '../workspace/workspace-store';
import type { RouteContext } from './context';
import { type AuthedRequest, handler } from './shared';

/**
 * An influencer's work outside Peak, for staff. The only staff routes that read
 * the creator workspace: Peak's contacts, pipeline, campaigns, search and
 * reports never do. Admin and Manager only.
 */
export function registerWorkspaceRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyRoles, withActor } = ctx;

  const influencerOf = (req: AuthedRequest) => {
    const contact = store.getContactById(req.params.id);
    if (!contact) throw new HttpError(404, 'Contact not found.');
    requireCompanyRoles(req, contact.companyId, ['Admin', 'Manager']);
    return { contact, owner: { companyId: contact.companyId, ownerContactId: contact.id } as Owner };
  };

  app.get(
    '/contacts/:id/workspace',
    authMiddleware,
    handler((req, res) => {
      const { owner } = influencerOf(req);
      res.json(workspaceSummary(store, owner));
    }),
  );

  /** Turns one of the influencer's contacts into a Peak lead. Repeating it returns the same contact. */
  app.post(
    '/contacts/:id/workspace/contacts/:wsContactId/peak-contact',
    authMiddleware,
    handler((req, res) => {
      const { contact: influencer, owner } = influencerOf(req);
      const peakContactId = store.transaction(() => {
        const source = store.workspace.contact(owner, req.params.wsContactId);
        if (!source) throw new HttpError(404, 'Not found.');
        if (source.peakContactId && store.getContactById(source.peakContactId)) return source.peakContactId;
        const created = withActor(req, () => store.createContact({
          companyId: influencer.companyId,
          kind: 'Organization',
          name: source.company ?? source.name,
          contactPerson: source.company ? source.name : undefined,
          email: source.email ?? undefined,
          phone: source.phone ?? undefined,
          roles: ['Lead'],
          ownerUserId: req.user!.id,
        }));
        store.workspace.setPeakContact(owner, source.id, created.id);
        return created.id;
      });
      res.json({ peakContactId });
    }),
  );
}
