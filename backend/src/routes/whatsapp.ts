import { HttpError } from '../http';
import { asRecord, optionalString, requiredString } from '../validation';
import { greenApi, toChatId, GreenApiError } from '../services/greenApi';
import type { RouteContext } from './context';
import { companyManagementRoles, handler } from './shared';
import type { Express } from 'express';

/** WhatsApp (Green API) integration. */
export function registerWhatsappRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyRoles, allowsRule, logger } = ctx;

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
      const idInstance = requiredString(body.idInstance, 'idInstance');
      const apiToken = requiredString(body.apiToken, 'apiToken');
      try {
        const instance = store.upsertWhatsappInstance(req.params.companyId, {
          idInstance,
          apiToken,
          apiHost: optionalString(body.apiHost) || undefined,
          phoneNumber: optionalString(body.phoneNumber) || undefined,
          displayName: optionalString(body.displayName) || undefined,
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
      const { instance, creds } = requireWhatsapp(req.params.companyId);
      const body = asRecord(req.body ?? {}, 'body');
      const publicBaseUrl =
        optionalString(body.baseUrl) ||
        process.env.PUBLIC_BASE_URL ||
        `${req.protocol}://${req.get('host')}`;
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
      const { instance, creds } = requireWhatsapp(req.params.companyId);
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
        const sent = await wrapGreenApi(() => greenApi.sendMessage(creds, chatId, message));
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
        throw error;
      }
    }),
  );

  app.get(
    '/companies/:companyId/whatsapp/messages',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const { chatId, contactId, phone, limit } = req.query as Record<string, string | undefined>;
      // Privacy enforcement when filtering by chat
      if (chatId) {
        const settings = store.getWhatsappChatSettings(req.params.companyId, chatId);
        const viewer = req.user ? { userId: req.user.id, seesPrivate: allowsRule(req, req.params.companyId, 'WHATSAPP_PRIVATE_READ') } : undefined;
        if (!store.canViewWhatsappChat(settings, viewer)) {
          throw new HttpError(403, 'You do not have access to this private chat.');
        }
      }
      const messages = store.listWhatsappMessages(req.params.companyId, {
        chatId: chatId || undefined,
        contactId: contactId || undefined,
        phone: phone || undefined,
        limit: limit ? Number(limit) : undefined,
      });
      res.json(messages);
    }),
  );

  app.get(
    '/companies/:companyId/whatsapp/chats',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const viewer = req.user ? { userId: req.user.id, seesPrivate: allowsRule(req, req.params.companyId, 'WHATSAPP_PRIVATE_READ') } : undefined;
      res.json(store.listWhatsappChats(req.params.companyId, viewer));
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
      const viewer = req.user ? { userId: req.user.id, seesPrivate: allowsRule(req, req.params.companyId, 'WHATSAPP_PRIVATE_READ') } : undefined;
      // Only owner or Admin/Manager can change a private chat's settings.
      if (current.visibility === 'private' && !store.canViewWhatsappChat(current, viewer)) {
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
      // the provider keeps retrying the delivery.
      if (!instance || !store.isModuleEnabled(instance.companyId, 'whatsapp')) {
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
            try {
              store.scheduleAutomaticFollowup({
                companyId: instance.companyId,
                contactId: savedMessage.contactId,
                trigger: 'InboundWhatsapp',
                sourceType: 'whatsapp_message',
                sourceId: savedMessage.id,
                summary: 'New WhatsApp message — reply needed.',
                nextAction: 'Reply to the inbound WhatsApp message.',
                offsetDays: 0,
                category: 'WhatsApp',
              });
            } catch (error) {
              logger.error('Failed to schedule InboundWhatsapp follow-up', error);
            }
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

  app.get(
    '/companies/:companyId/invoices',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.listInvoices(req.params.companyId));
    }),
  );
}
