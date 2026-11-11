import { HttpError } from '../http';
import { asRecord, optionalString, requiredString } from '../validation';
import { greenApi, toChatId, GreenApiError } from '../services/greenApi';
import { metaWhatsapp, CloudApiError, renderTemplate, verifyCloudSignature } from '../services/metaWhatsapp';
import { conversationWindow, sendWhatsappText, toSendError, WhatsappSendError } from '../services/whatsappSender';
import { ingestCloudWebhook } from '../services/whatsappCloudWebhook';
import type { DataStore } from '../data/store';
import type { RouteContext } from './context';
import { scopeOf } from '../authz/can';
import { companyManagementRoles, handler } from './shared';
import type { Express } from 'express';

/** Messages Meta's Cloud API does not offer (Green API only). */
const CLOUD_UNSUPPORTED = 'Not available on the official WhatsApp Cloud API.';

function scheduleInboundFollowup(store: DataStore, logger: RouteContext['logger'], companyId: string, messageId: string, contactId: string) {
  try {
    store.scheduleAutomaticFollowup({
      companyId,
      contactId,
      trigger: 'InboundWhatsapp',
      sourceType: 'whatsapp_message',
      sourceId: messageId,
      summary: 'New WhatsApp message — reply needed.',
      nextAction: 'Reply to the inbound WhatsApp message.',
      offsetDays: 0,
      category: 'WhatsApp',
    });
  } catch (error) {
    logger.error('Failed to schedule InboundWhatsapp follow-up', error);
  }
}

/** WhatsApp integration: Green API (QR-linked number) or Meta's Cloud API. */
export function registerWhatsappRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyRoles, viewerOf, canSee, logger } = ctx;

  const requireCloud = (companyId: string) => {
    const instance = store.getWhatsappInstanceForCompany(companyId);
    if (!instance) throw new HttpError(404, 'WhatsApp instance is not configured for this company.');
    if (instance.provider !== 'cloud') throw new HttpError(400, 'Only for the official WhatsApp Cloud API.');
    const creds = store.getWhatsappCloudCredentials(companyId);
    if (!creds) throw new HttpError(500, 'WhatsApp credentials missing.');
    return { instance, creds };
  };

  const wrapCloud = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof CloudApiError) {
        throw new HttpError(error.status >= 400 && error.status < 600 ? error.status : 502, error.message);
      }
      throw error;
    }
  };

  const isCloud = (companyId: string) => store.getWhatsappInstanceForCompany(companyId)?.provider === 'cloud';

  const requireWhatsapp = (companyId: string) => {
    const instance = store.getWhatsappInstanceForCompany(companyId);
    if (!instance) throw new HttpError(404, 'WhatsApp instance is not configured for this company.');
    const creds = store.getWhatsappCredentials(companyId);
    if (!creds) throw new HttpError(500, 'WhatsApp credentials missing.');
    return { instance, creds };
  };

  const wrapGreenApi = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof GreenApiError) {
        throw new HttpError(error.status >= 400 && error.status < 600 ? error.status : 502, error.message);
      }
      throw error;
    }
  };

  app.get(
    '/companies/:companyId/whatsapp/instance',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin']);
      const instance = store.getWhatsappInstanceForCompany(req.params.companyId);
      res.json(instance || null);
    }),
  );

  app.put(
    '/companies/:companyId/whatsapp/instance',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin']);
      const body = asRecord(req.body, 'body');
      const provider = optionalString(body.provider) === 'cloud' ? 'cloud' : 'green';
      const idInstance = requiredString(body.idInstance, provider === 'cloud' ? 'phoneNumberId' : 'idInstance');
      try {
        const instance = store.upsertWhatsappInstance(req.params.companyId, {
          provider,
          idInstance,
          apiToken: optionalString(body.apiToken) || undefined,
          apiHost: optionalString(body.apiHost) || undefined,
          phoneNumber: optionalString(body.phoneNumber) || undefined,
          displayName: optionalString(body.displayName) || undefined,
          wabaId: optionalString(body.wabaId) || undefined,
          appSecret: optionalString(body.appSecret) || undefined,
        });
        res.json(instance);
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not save WhatsApp instance.');
      }
    }),
  );

  app.delete(
    '/companies/:companyId/whatsapp/instance',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin']);
      const removed = store.deleteWhatsappInstance(req.params.companyId);
      res.json({ success: removed });
    }),
  );

  app.get(
    '/companies/:companyId/whatsapp/state',
    authMiddleware,
    handler(async (req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin']);
      if (isCloud(req.params.companyId)) {
        const { creds } = requireCloud(req.params.companyId);
        try {
          const number = await metaWhatsapp.getPhoneNumber(creds);
          const updated = store.updateWhatsappInstanceState(
            req.params.companyId,
            'authorized',
            number.display_phone_number || undefined,
            number.verified_name || undefined,
          );
          res.json(updated);
        } catch (error) {
          // A rejected token or number id: not connected. Other failures say nothing about the link.
          if (error instanceof CloudApiError && (error.status === 401 || error.status === 400 || error.code === 190)) {
            store.updateWhatsappInstanceState(req.params.companyId, 'notAuthorized');
          }
          throw error instanceof CloudApiError ? new HttpError(error.status >= 400 && error.status < 600 ? error.status : 502, error.message) : error;
        }
        return;
      }
      const { creds } = requireWhatsapp(req.params.companyId);
      const state = await wrapGreenApi(() => greenApi.getStateInstance(creds));
      const updated = store.updateWhatsappInstanceState(req.params.companyId, state);
      res.json(updated || { state });
    }),
  );

  app.get(
    '/companies/:companyId/whatsapp/qr',
    authMiddleware,
    handler(async (req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin']);
      if (isCloud(req.params.companyId)) throw new HttpError(400, CLOUD_UNSUPPORTED);
      const { creds } = requireWhatsapp(req.params.companyId);
      const qr = await wrapGreenApi(() => greenApi.getQrCode(creds));
      res.json(qr);
    }),
  );

  app.post(
    '/companies/:companyId/whatsapp/configure-webhook',
    authMiddleware,
    handler(async (req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin']);
      const body = asRecord(req.body ?? {}, 'body');
      const publicBaseUrl =
        optionalString(body.baseUrl) ||
        process.env.PUBLIC_BASE_URL ||
        `${req.protocol}://${req.get('host')}`;
      if (isCloud(req.params.companyId)) {
        // Meta takes the webhook in its own dashboard: hand back what to paste there.
        const { instance } = requireCloud(req.params.companyId);
        res.json({
          success: true,
          manual: true,
          webhookUrl: `${publicBaseUrl.replace(/\/$/, '')}/whatsapp/cloud-webhook/${instance.webhookToken}`,
          verifyToken: instance.webhookToken,
        });
        return;
      }
      const { instance, creds } = requireWhatsapp(req.params.companyId);
      const webhookUrl = `${publicBaseUrl.replace(/\/$/, '')}/whatsapp/webhook/${instance.webhookToken}`;
      await wrapGreenApi(() => greenApi.configureWebhook(creds, webhookUrl, instance.webhookToken));
      res.json({ success: true, webhookUrl });
    }),
  );

  app.post(
    '/companies/:companyId/whatsapp/logout',
    authMiddleware,
    handler(async (req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin']);
      if (isCloud(req.params.companyId)) throw new HttpError(400, CLOUD_UNSUPPORTED);
      const { creds } = requireWhatsapp(req.params.companyId);
      const result = await wrapGreenApi(() => greenApi.logout(creds));
      const refreshed = store.updateWhatsappInstanceState(req.params.companyId, 'notAuthorized');
      res.json({ ...result, instance: refreshed });
    }),
  );

  app.post(
    '/companies/:companyId/whatsapp/send',
    authMiddleware,
    handler(async (req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const instance = store.getWhatsappInstanceForCompany(req.params.companyId);
      if (!instance) throw new HttpError(404, 'WhatsApp instance is not configured for this company.');
      const body = asRecord(req.body, 'body');
      const phone = requiredString(body.phone, 'phone');
      const message = requiredString(body.message, 'message');
      const contactId = optionalString(body.contactId) || undefined;
      const contextEntityType = optionalString(body.contextEntityType) || undefined;
      const contextEntityId = optionalString(body.contextEntityId) || undefined;
      const chatId = toChatId(phone);
      const actorUserId = req.user?.id;
      const actorName = req.user?.name;
      try {
        const sent = await sendWhatsappText(store, req.params.companyId, phone, message);
        const stored = store.createWhatsappMessage({
          companyId: req.params.companyId,
          instanceId: instance.id,
          direction: 'outbound',
          externalId: sent.idMessage,
          chatId,
          phone,
          contactId,
          type: 'text',
          body: message,
          status: 'sent',
          contextEntityType,
          contextEntityId,
          actorUserId,
          actorName,
          sentAt: new Date(),
        });
        res.status(201).json(stored);
      } catch (error) {
        // A closed 24-hour window is refused before Meta: nothing was sent, nothing to record.
        if (error instanceof WhatsappSendError && error.reason === 'windowClosed') {
          throw new HttpError(409, error.message, { code: 'windowClosed' });
        }
        store.createWhatsappMessage({
          companyId: req.params.companyId,
          instanceId: instance.id,
          direction: 'outbound',
          chatId,
          phone,
          contactId,
          type: 'text',
          body: message,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          contextEntityType,
          contextEntityId,
          actorUserId,
          actorName,
        });
        if (error instanceof WhatsappSendError) throw new HttpError(error.status, error.message);
        throw error;
      }
    }),
  );

  /** Cloud API: can free text go to this chat now, or only a template? */
  app.get(
    '/companies/:companyId/whatsapp/window',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const raw = String(req.query.chatId || req.query.phone || '');
      if (!raw) throw new HttpError(400, 'chatId is required.');
      const chatId = raw.endsWith('@c.us') ? raw : toChatId(raw);
      res.json(conversationWindow(store, req.params.companyId, chatId));
    }),
  );

  /** Cloud API: the company's approved message templates. */
  app.get(
    '/companies/:companyId/whatsapp/templates',
    authMiddleware,
    handler(async (req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const { creds } = requireCloud(req.params.companyId);
      res.json(await wrapCloud(() => metaWhatsapp.listTemplates(creds)));
    }),
  );

  /** Cloud API: sends an approved template (works outside the 24-hour window). */
  app.post(
    '/companies/:companyId/whatsapp/send-template',
    authMiddleware,
    handler(async (req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const { instance, creds } = requireCloud(req.params.companyId);
      const body = asRecord(req.body, 'body');
      const phone = requiredString(body.phone, 'phone');
      const name = requiredString(body.name, 'name');
      const language = requiredString(body.language, 'language');
      const variables = Array.isArray(body.variables) ? body.variables.map((v) => String(v ?? '').trim()) : [];
      if (variables.some((v) => !v)) throw new HttpError(400, 'Every template variable needs a value.');
      const contactId = optionalString(body.contactId) || undefined;
      const chatId = toChatId(phone);
      // The stored text is the approved body with its variables filled, so the chat reads naturally.
      const templates = await wrapCloud(() => metaWhatsapp.listTemplates(creds));
      const template = templates.find((t) => t.name === name && t.language === language);
      if (!template) throw new HttpError(404, 'This template is not approved for this number.');
      if (variables.length !== template.variableCount) {
        throw new HttpError(400, `This template takes ${template.variableCount} variable(s).`);
      }
      const text = [template.headerText, renderTemplate(template.bodyText, variables), template.footerText]
        .filter(Boolean)
        .join('\n\n');
      const base = {
        companyId: req.params.companyId,
        instanceId: instance.id,
        direction: 'outbound' as const,
        chatId,
        phone,
        contactId,
        type: 'text' as const,
        body: text,
        contextEntityType: 'whatsapp_template',
        contextEntityId: `${name}:${language}`,
        actorUserId: req.user?.id,
        actorName: req.user?.name,
      };
      try {
        const sent = await metaWhatsapp.sendTemplate(creds, chatId, { name, language, variables });
        res.status(201).json(store.createWhatsappMessage({ ...base, externalId: sent.idMessage, status: 'sent', sentAt: new Date() }));
      } catch (error) {
        store.createWhatsappMessage({ ...base, status: 'failed', error: error instanceof Error ? error.message : String(error) });
        const mapped = toSendError(error);
        if (mapped instanceof WhatsappSendError) throw new HttpError(mapped.status, mapped.message);
        throw mapped;
      }
    }),
  );

  /** Cloud API: an inbound photo/file, fetched from Meta with the company's token. */
  app.get(
    '/companies/:companyId/whatsapp/media/:mediaId',
    authMiddleware,
    handler(async (req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const { creds } = requireCloud(req.params.companyId);
      const mediaId = req.params.mediaId;
      if (!/^\d{1,40}$/.test(mediaId)) throw new HttpError(400, 'Invalid media id.');
      // Only media that arrived in a chat this person may read.
      const message = store.findWhatsappMessageByMedia(req.params.companyId, `cloud-media:${mediaId}`);
      if (!message) throw new HttpError(404, 'Media not found.');
      if (!canSee(req, 'whatsapp_chats', req.params.companyId, message.chatId)) {
        throw new HttpError(403, 'You do not have access to this private chat.');
      }
      const file = await wrapCloud(() => metaWhatsapp.downloadMedia(creds, mediaId));
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(file.data);
    }),
  );

  app.get(
    '/companies/:companyId/whatsapp/messages',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const { chatId, contactId, phone, limit } = req.query as Record<string, string | undefined>;
      // Privacy: a private chat is its owner's (authz/visible.ts); asking for
      // one by id is refused, and every other filter leaves its messages out.
      if (chatId && !canSee(req, 'whatsapp_chats', req.params.companyId, chatId)) {
        throw new HttpError(403, 'You do not have access to this private chat.');
      }
      const messages = store.listWhatsappMessages(req.params.companyId, {
        chatId: chatId || undefined,
        contactId: contactId || undefined,
        phone: phone || undefined,
        limit: limit ? Number(limit) : undefined,
        viewer: viewerOf(req),
      });
      res.json(messages);
    }),
  );

  app.get(
    '/companies/:companyId/whatsapp/chats',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.listWhatsappChats(req.params.companyId, viewerOf(req)));
    }),
  );

  app.get(
    '/companies/:companyId/whatsapp/chats/:chatId/settings',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.getWhatsappChatSettings(req.params.companyId, req.params.chatId));
    }),
  );

  app.patch(
    '/companies/:companyId/whatsapp/chats/:chatId/settings',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const current = store.getWhatsappChatSettings(req.params.companyId, req.params.chatId);
      // Changing a private chat's settings: its owner, or whatsapp.view at
      // company scope (Admin/Manager today). Never a share or a team reach:
      // reading a chat does not let anyone make it public or take it over.
      const scope = scopeOf(viewerOf(req), 'whatsapp.view', req.params.companyId);
      const mayChange = current.ownerUserId === req.user!.id || scope === 'company' || scope === 'group';
      if (current.visibility === 'private' && !mayChange) {
        throw new HttpError(403, 'Only the chat owner or a manager can change these settings.');
      }
      const visibilityRaw = optionalString(body.visibility);
      const visibility =
        visibilityRaw === 'private' || visibilityRaw === 'shared'
          ? (visibilityRaw as 'private' | 'shared')
          : undefined;
      const ownerProvided = Object.prototype.hasOwnProperty.call(body, 'ownerUserId');
      const ownerValue = ownerProvided ? (body.ownerUserId === null ? null : optionalString(body.ownerUserId) || null) : undefined;

      // Default ownership for a fresh private toggle = current user
      const effectiveOwner =
        visibility === 'private' && !ownerProvided && !current.ownerUserId
          ? req.user?.id ?? null
          : ownerValue;

      const updated = store.setWhatsappChatSettings(req.params.companyId, req.params.chatId, {
        visibility,
        ownerUserId: effectiveOwner as any,
      });
      res.json(updated);
    }),
  );

  app.post(
    '/companies/:companyId/whatsapp/chats/:chatId/read',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const updated = store.markWhatsappChatRead(req.params.companyId, req.params.chatId);
      res.json({ updated });
    }),
  );

  app.post(
    '/companies/:companyId/whatsapp/chats/:chatId/sync-history',
    authMiddleware,
    handler(async (req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      // Meta keeps no history to fetch: the inbox fills from the webhook.
      if (isCloud(req.params.companyId)) {
        res.json({ inserted: 0, fetched: 0, unsupported: true });
        return;
      }
      const { instance, creds } = requireWhatsapp(req.params.companyId);
      const count = Math.min(Math.max(Number(req.query.count) || 100, 1), 100);
      const raw = await wrapGreenApi(() =>
        greenApi.getChatHistory(creds, req.params.chatId, count),
      );
      const inserted = store.importWhatsappHistory(
        req.params.companyId,
        instance.id,
        req.params.chatId,
        raw,
      );
      res.json({ inserted, fetched: raw.length });
    }),
  );

  /**
   * Helper for the "new chat" composer: validates a phone number actually
   * has WhatsApp, returns its chatId, and triggers a history backfill.
   */
  app.post(
    '/companies/:companyId/whatsapp/open-chat',
    authMiddleware,
    handler(async (req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      if (isCloud(req.params.companyId)) {
        // No number check or history on the Cloud API: just open the chat.
        const body = asRecord(req.body, 'body');
        const chatId = toChatId(requiredString(body.phone, 'phone'));
        res.json({ chatId, phone: chatId.replace(/@c\.us$/, ''), imported: 0 });
        return;
      }
      const { instance, creds } = requireWhatsapp(req.params.companyId);
      const body = asRecord(req.body, 'body');
      const phone = requiredString(body.phone, 'phone');
      const chatId = toChatId(phone);
      try {
        const check = await wrapGreenApi(() => greenApi.checkWhatsapp(creds, phone));
        if (!check.existsWhatsapp) {
          throw new HttpError(400, 'This phone number is not on WhatsApp.');
        }
      } catch (error) {
        if (error instanceof HttpError) throw error;
        // If checkWhatsapp fails we still allow opening the chat.
      }
      let imported = 0;
      try {
        const raw = await greenApi.getChatHistory(creds, chatId, 50);
        imported = store.importWhatsappHistory(
          req.params.companyId,
          instance.id,
          chatId,
          raw,
        );
      } catch {
        /* history fetch is best-effort */
      }
      res.json({ chatId, phone: chatId.replace(/@c\.us$/, ''), imported });
    }),
  );

  /**
   * Public webhook receiver — Green API calls this for every event on the
   * configured instance. We identify the company by the webhook token in the
   * URL. Always respond 200 quickly so Green API does not retry.
   */
  app.post(
    '/whatsapp/webhook/:webhookToken',
    handler((req, res) => {
      const token = req.params.webhookToken;
      const instance = store.getWhatsappInstanceByWebhookToken(token);
      // A switched-off WhatsApp module takes in nothing. Still answer 200, or
      // the provider keeps retrying the delivery. A Cloud API number has its own webhook.
      if (!instance || instance.provider !== 'green' || !store.isModuleEnabled(instance.companyId, 'whatsapp')) {
        res.status(200).json({ ok: true, ignored: true });
        return;
      }
      try {
        const payload = req.body as any;
        const typeWebhook = payload?.typeWebhook;
        if (typeWebhook === 'stateInstanceChanged') {
          const next = String(payload?.stateInstance || 'unknown');
          store.updateWhatsappInstanceState(
            instance.companyId,
            (['notAuthorized','authorized','blocked','sleepMode','starting','yellowCard'].includes(next)
              ? next
              : 'unknown') as any,
          );
        } else if (typeWebhook === 'incomingMessageReceived') {
          const senderData = payload?.senderData || {};
          const messageData = payload?.messageData || {};
          const textBody =
            messageData?.textMessageData?.textMessage ||
            messageData?.extendedTextMessageData?.text ||
            '';
          const fileUrl = messageData?.fileMessageData?.downloadUrl;
          const fileName = messageData?.fileMessageData?.fileName;
          const messageType: import('../types').WhatsAppMessageType =
            fileUrl ? 'file' : 'text';
          const savedMessage = store.createWhatsappMessage({
            companyId: instance.companyId,
            instanceId: instance.id,
            direction: 'inbound',
            externalId: String(payload?.idMessage || ''),
            chatId: String(senderData?.chatId || ''),
            phone: String(senderData?.chatId || '').replace(/@c\.us$/, ''),
            type: messageType,
            body: textBody || '',
            mediaUrl: fileUrl || undefined,
            fileName: fileName || undefined,
            status: 'delivered',
            receivedAt: new Date((Number(payload?.timestamp) || Date.now() / 1000) * 1000),
          });
          // Auto-follow-up: if the inbound message is linked to a known
          // contact, schedule a same-day reply reminder.
          if (savedMessage.contactId) {
            scheduleInboundFollowup(store, logger, instance.companyId, savedMessage.id, savedMessage.contactId);
          }
        } else if (
          typeWebhook === 'outgoingMessageStatus' ||
          typeWebhook === 'outgoingAPIMessageReceived' ||
          typeWebhook === 'outgoingMessageReceived'
        ) {
          const externalId = String(payload?.idMessage || '');
          const status = String(payload?.status || '').toLowerCase();
          if (externalId && status) {
            const mapped: import('../types').WhatsAppMessageStatus =
              status === 'read'
                ? 'read'
                : status === 'delivered'
                  ? 'delivered'
                  : status === 'failed' || status === 'noaccount' || status === 'notinwhitelist'
                    ? 'failed'
                    : 'sent';
            store.updateWhatsappMessageStatus(externalId, mapped);
          }
        }
      } catch (err) {
        logger.error('WhatsApp webhook handler error', err);
      }
      res.status(200).json({ ok: true });
    }),
  );

  /**
   * Meta's webhook check: Meta sends the verify token it was given (the
   * company's webhook token) and expects the challenge echoed back.
   */
  app.get(
    '/whatsapp/cloud-webhook/:webhookToken',
    handler((req, res) => {
      const instance = store.getWhatsappInstanceByWebhookToken(req.params.webhookToken);
      if (
        instance &&
        instance.provider === 'cloud' &&
        req.query['hub.mode'] === 'subscribe' &&
        req.query['hub.verify_token'] === instance.webhookToken &&
        typeof req.query['hub.challenge'] === 'string'
      ) {
        res.type('text/plain').send(req.query['hub.challenge']);
        return;
      }
      res.status(403).end();
    }),
  );

  /**
   * Meta Cloud API events. Signed with the app secret (X-Hub-Signature-256):
   * an unsigned or wrongly signed call is refused. Valid deliveries get 200
   * at once, even when ignored, so Meta does not retry.
   */
  app.post(
    '/whatsapp/cloud-webhook/:webhookToken',
    handler((req, res) => {
      const instance = store.getWhatsappInstanceByWebhookToken(req.params.webhookToken);
      if (!instance || instance.provider !== 'cloud') {
        res.status(404).end();
        return;
      }
      const creds = store.getWhatsappCloudCredentials(instance.companyId);
      const raw = (req as typeof req & { rawBody?: Buffer }).rawBody;
      if (!creds?.appSecret || !verifyCloudSignature(creds.appSecret, raw, String(req.headers['x-hub-signature-256'] ?? ''))) {
        res.status(401).json({ message: 'Invalid signature.' });
        return;
      }
      if (!store.isModuleEnabled(instance.companyId, 'whatsapp')) {
        res.status(200).json({ ok: true, ignored: true });
        return;
      }
      try {
        const result = ingestCloudWebhook(store, instance, req.body);
        for (const linked of result.linkedInbound) {
          scheduleInboundFollowup(store, logger, instance.companyId, linked.id, linked.contactId);
        }
        if (instance.state !== 'authorized' && (result.messages > 0 || result.statuses > 0)) {
          store.updateWhatsappInstanceState(instance.companyId, 'authorized');
        }
      } catch (err) {
        logger.error('WhatsApp Cloud webhook handler error', err);
      }
      res.status(200).json({ ok: true });
    }),
  );

  app.get(
    '/companies/:companyId/invoices',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.listInvoices(req.params.companyId));
    }),
  );
}
