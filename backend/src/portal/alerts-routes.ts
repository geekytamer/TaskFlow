import type { RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import { baselineAlerts, normalisePhone } from './alerts';
import type { SessionRequest } from './common';

/** A portal user's own alert settings. `available` says whether the company's WhatsApp is connected. */
export function registerAlertRoutes(router: Router, store: DataStore, companyId: string, requireSession: RequestHandler): void {
  const view = (portalUserId: string) => {
    const p = store.alerts.prefs(portalUserId);
    return { available: Boolean(store.getWhatsappInstanceForCompany(companyId)), whatsapp: p.whatsapp, phone: p.phone, lang: p.lang };
  };

  router.get('/:audience/alerts', requireSession, (req: SessionRequest, res: Response) => {
    res.json(view(req.portal!.portalUserId));
  });

  router.post('/:audience/alerts', requireSession, (req: SessionRequest, res: Response) => {
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const whatsapp = body.whatsapp === true;
    const lang = body.lang === 'ar' ? 'ar' : 'en';
    const phone = body.phone === undefined || body.phone === '' || body.phone === null ? null : normalisePhone(body.phone);
    if (body.phone && !phone) throw new HttpError(400, 'Enter the number with its country code, for example +971 50 123 4567.');
    if (whatsapp && !phone) throw new HttpError(400, 'Add your WhatsApp number to turn alerts on.');
    if (whatsapp && !store.getWhatsappInstanceForCompany(companyId)) throw new HttpError(409, 'WhatsApp alerts are not available yet.');
    const user = store.portal.getUser(req.portal!.portalUserId)!;
    const before = store.alerts.prefs(user.id);
    store.alerts.setPrefs({ portalUserId: user.id, whatsapp, phone, lang });
    // Turning alerts on starts from now: what already happened is not re-announced.
    if (whatsapp && !before.whatsapp) baselineAlerts(store, user);
    res.json(view(user.id));
  });
}
