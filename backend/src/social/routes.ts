import crypto from 'node:crypto';
import express, { Router, type RequestHandler, type Response } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { SessionRequest } from '../portal/common';
import { sealToken } from './crypto';
import type { MetaClient } from './meta-client';
import { syncAccount } from './sync';

export interface SocialOptions {
  client: MetaClient;
  /** Meta app secret: verifies the data-deletion callback's signature. */
  appSecret: string;
  /** Registered with Meta: where Instagram sends the influencer back with a code. */
  redirectUri: string;
  /** The influencer portal page to land on afterwards. */
  portalReturnUrl: string;
  /** Meta's webhook subscription check (META_WEBHOOK_VERIFY_TOKEN). Webhooks are refused without it. */
  webhookVerifyToken?: string;
  /** Called after a valid webhook marked game sources for collection. */
  onSourcesDirty?: () => void;
}

/** What the influencer sees of a connection. Never the token, sealed or not. */
const accountDto = (store: DataStore, a: ReturnType<DataStore['social']['getAccount']> & object) => ({
  id: a.id, platform: a.platform, username: a.username, status: a.status, lastSyncAt: a.lastSyncAt,
  followers: store.social.latestSnapshot(a.id)?.followers ?? null,
});

/** Influencer-audience routes, mounted inside the portal router. */
export function registerSocialPortalRoutes(router: Router, store: DataStore, companyId: string, requireInfluencer: RequestHandler, options: SocialOptions): void {
  router.get('/influencer/social', requireInfluencer, (req: SessionRequest, res: Response) => {
    res.json(store.social.accountsFor(companyId, req.portal!.contactId).filter((a) => a.status !== 'revoked').map((a) => accountDto(store, a)));
  });

  router.post('/influencer/social/instagram/connect', requireInfluencer, (req: SessionRequest, res: Response) => {
    const s = req.portal!;
    const state = store.social.newState({ companyId, contactId: s.contactId, portalUserId: s.portalUserId });
    res.json({ url: options.client.authorizeUrl(state, options.redirectUri) });
  });

  router.post('/influencer/social/:id/disconnect', requireInfluencer, (req: SessionRequest, res: Response) => {
    const account = store.social.getAccount(req.params.id);
    if (!account || account.companyId !== companyId || account.contactId !== req.portal!.contactId) throw new HttpError(404, 'Not found.');
    store.social.disconnect(account.id);
    res.json({ ok: true });
  });
}

/** Public routes Meta calls: the sign-in callback and the data-deletion request. */
export function createSocialPublicRouter(store: DataStore, options: SocialOptions): Router {
  const router = Router();
  const back = (res: Response, error?: string) =>
    res.redirect(302, `${options.portalReturnUrl}?connected=instagram${error ? `&error=${error}` : ''}`);

  router.get('/instagram/callback', async (req, res, next) => {
    try {
      const claim = typeof req.query.state === 'string' ? store.social.consumeState(req.query.state) : undefined;
      if (!claim) throw new HttpError(400, 'This sign-in link has expired. Start again from your profile.');
      if (typeof req.query.code !== 'string' || !req.query.code) return back(res, 'cancelled');
      const tokens = await options.client.exchangeCode(req.query.code, options.redirectUri);
      const profile = await options.client.profile(tokens.accessToken);
      if (profile.accountType === 'PERSONAL') return back(res, 'personal_account');
      const holder = store.social.ownerOfExternal(profile.id);
      // One Instagram account belongs to one influencer; moving it is a staff decision, not a sign-in side effect.
      if (holder && holder.contactId !== claim.contactId && holder.status !== 'revoked') return back(res, 'taken');
      const account = store.social.upsertAccount({
        companyId: claim.companyId, contactId: claim.contactId, externalId: profile.id, username: profile.username,
        accountType: profile.accountType, tokenSealed: sealToken(tokens.accessToken), expiresAt: tokens.expiresAt.toISOString(),
      });
      await syncAccount(store, options.client, account);
      back(res);
    } catch (error) {
      // The state check answers 400 itself; anything Meta-side sends the influencer back with a message.
      if (error instanceof HttpError) return next(error);
      back(res, 'failed');
    }
  });

  // Meta sends form data: signed_request = <signature>.<payload>, both base64url, HMAC-SHA256 with the app secret.
  router.post('/meta/data-deletion', express.urlencoded({ extended: false }), (req, res) => {
    const signed = typeof req.body?.signed_request === 'string' ? req.body.signed_request : '';
    const [sig, payload] = signed.split('.');
    const expected = crypto.createHmac('sha256', options.appSecret).update(payload ?? '').digest();
    const given = Buffer.from(sig ?? '', 'base64url');
    if (!payload || given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      return res.status(400).json({ message: 'Invalid signature.' });
    }
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { user_id?: string };
    if (!data.user_id) return res.status(400).json({ message: 'No user.' });
    store.social.purgeExternal(String(data.user_id));
    const code = crypto.randomBytes(8).toString('hex');
    res.json({ url: `${new URL(options.portalReturnUrl).origin}/data-deletion?code=${code}`, confirmation_code: code });
    // The status page (portal app/data-deletion) states the deletion is complete; it is done synchronously above.
  });

  // Meta's subscription check: echo the challenge only for our verify token.
  router.get('/meta/webhook', (req, res) => {
    const token = options.webhookVerifyToken;
    if (token && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === token && typeof req.query['hub.challenge'] === 'string') {
      return res.type('text/plain').send(req.query['hub.challenge']);
    }
    res.status(403).end();
  });

  // Comment and mention events. The payload is not trusted for content: a valid
  // event only marks that account's game sources, and the collector re-reads Meta.
  router.post('/meta/webhook', (req, res) => {
    const raw = (req as typeof req & { rawBody?: Buffer }).rawBody;
    const header = String(req.headers['x-hub-signature-256'] ?? '');
    const given = Buffer.from(header.replace(/^sha256=/, ''), 'hex');
    const expected = raw ? crypto.createHmac('sha256', options.appSecret).update(raw).digest() : Buffer.alloc(0);
    if (!options.webhookVerifyToken || !raw || !header.startsWith('sha256=') || given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      return res.status(401).json({ message: 'Invalid signature.' });
    }
    const entries = Array.isArray(req.body?.entry) ? (req.body.entry as Array<{ id?: unknown }>) : [];
    let marked = 0;
    for (const entry of entries) {
      const account = typeof entry.id === 'string' ? store.social.ownerOfExternal(entry.id) : undefined;
      if (account && account.status === 'active') marked += store.games.markAccountDirty(account.id);
    }
    res.status(200).end();
    if (marked > 0) options.onSourcesDirty?.();
  });
  return router;
}
