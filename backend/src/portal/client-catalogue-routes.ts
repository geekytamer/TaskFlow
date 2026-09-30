import type { Request, RequestHandler, Response, Router } from 'express';
import { HttpError } from '../http';
import type { Contact } from '../types';
import { CATALOGUE_LIMIT, matchesFilter, priceFor, toCatalogueEntry, type CatalogueFilter } from './catalogue';
import type { PricingProfile } from './catalogue-store';
import type { PortalSession } from './portal-store';

export interface ClientCatalogueDeps {
  /** Contacts holding the Influencer role in this company, ordered by name. */
  listInfluencers(companyId: string): Contact[];
  getContact(contactId: string): Contact | undefined;
  listedIds(companyId: string): string[];
  isListed(companyId: string, contactId: string): boolean;
  pricingProfile(contactId: string): PricingProfile | undefined;
  currency(companyId: string): string;
}

type SessionRequest = Request & { portal?: PortalSession };

const queryString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 100) : undefined;

function parseFilter(query: Request['query']): CatalogueFilter {
  const minFollowers = Number.parseInt(String(query.minFollowers ?? ''), 10);
  return {
    q: queryString(query.q),
    platform: queryString(query.platform),
    niche: queryString(query.niche),
    availability: queryString(query.availability),
    minFollowers: Number.isFinite(minFollowers) && minFollowers > 0 ? minFollowers : undefined,
  };
}

/**
 * The catalogue exists only for the client audience: the paths are fixed to
 * `/client/...`, so an influencer session never matches them at all.
 */
export function registerClientCatalogueRoutes(
  router: Router,
  deps: ClientCatalogueDeps,
  companyId: string,
  requireClientSession: RequestHandler,
): void {
  const pricing = (req: SessionRequest) => {
    const profile = deps.pricingProfile(req.portal!.contactId);
    const currency = deps.currency(companyId);
    return (contact: Contact) => priceFor(contact.rateCardAmount, profile, currency);
  };

  router.get('/client/catalogue', requireClientSession, (req: SessionRequest, res: Response) => {
    const listed = new Set(deps.listedIds(companyId));
    const price = pricing(req);
    const filter = parseFilter(req.query);
    const matches = deps.listInfluencers(companyId)
      .filter((contact) => listed.has(contact.id))
      .map((contact) => toCatalogueEntry(contact, price(contact)))
      .filter((entry) => matchesFilter(entry, filter));
    res.json({ items: matches.slice(0, CATALOGUE_LIMIT), total: matches.length });
  });

  router.get('/client/catalogue/:contactId', requireClientSession, (req: SessionRequest, res: Response) => {
    const contact = deps.getContact(req.params.contactId);
    const listed = contact
      && contact.companyId === companyId
      && contact.roles?.includes('Influencer')
      && deps.isListed(companyId, contact.id);
    if (!contact || !listed) throw new HttpError(404, 'Not found.');
    res.json(toCatalogueEntry(contact, pricing(req)(contact)));
  });
}
