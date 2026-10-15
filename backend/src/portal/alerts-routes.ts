import type { RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import { ALERT_GROUPS, baselineAlerts, normalisePhone, type AlertGroup, type GroupPrefs } from './alerts';
import type { SessionRequest } from './common';

/** A portal user's own alert settings. `available` says whether the company's WhatsApp is connected. */
export function registerAlertRoutes(router: Router, store: DataStore, companyId: string, requireSession: RequestHandler): void {
  const view = (portalUserId: string) => {
    const p = store.alerts.prefs(portalUserId);
    return { available: Boolean(store.getWhatsappInstanceForCompany(companyId)), whatsapp: p.whatsapp, phone: p.phone, lang: p.lang, groups: p.groups, preview: p.preview };
  };

  router.get('/:audience/alerts', requireSession, (req: SessionRequest, res: Response) => {
    res.json(view(req.portal!.portalUserId));
  });

  /** Only known groups and channels, only booleans; anything else is refused. Fields left out keep their value. */
  const mergeGroups = (raw: unknown, current: GroupPrefs): GroupPrefs => {
    if (raw === undefined) return current;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'Alert settings are not valid.');
    const next: GroupPrefs = JSON.parse(JSON.stringify(current));
    for (const [group, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!(ALERT_GROUPS as readonly string[]).includes(group) || !value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Alert settings are not valid.');
      for (const [channel, on] of Object.entries(value as Record<string, unknown>)) {
        if ((channel !== 'push' && channel !== 'whatsapp') || typeof on !== 'boolean') throw new HttpError(400, 'Alert settings are not valid.');
        next[group as AlertGroup][channel] = on;
      }
    }
    return next;
  };

  const save: RequestHandler = (req: SessionRequest, res: Response) => {
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const user = store.portal.getUser(req.portal!.portalUserId)!;
    const before = store.alerts.prefs(user.id);
    if (body.preview !== undefined && typeof body.preview !== 'boolean') throw new HttpError(400, 'Alert settings are not valid.');
    const groups = mergeGroups(body.groups, before.groups);
    const preview = body.preview ?? before.preview;
    const whatsapp = body.whatsapp === undefined ? before.whatsapp : body.whatsapp === true;
    const lang = body.lang === undefined ? before.lang : body.lang === 'ar' ? 'ar' : 'en';
    const phone = body.phone === undefined ? before.phone : body.phone === '' || body.phone === null ? null : normalisePhone(body.phone);
    if (body.phone && !phone) throw new HttpError(400, 'Enter the number with its country code, for example +971 50 123 4567.');
    if (whatsapp && !phone) throw new HttpError(400, 'Add your WhatsApp number to turn alerts on.');
    if (whatsapp && !before.whatsapp && !store.getWhatsappInstanceForCompany(companyId)) throw new HttpError(409, 'WhatsApp alerts are not available yet.');
    store.alerts.setPrefs({ portalUserId: user.id, whatsapp, phone, lang, groups, preview });
    // Turning alerts on starts from now: what already happened is not re-announced.
    if (whatsapp && !before.whatsapp) baselineAlerts(store, user);
    res.json(view(user.id));
  };
  router.post('/:audience/alerts', requireSession, save);
  router.put('/:audience/alerts', requireSession, save);
}
