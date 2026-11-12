import { HttpError } from '../http';
import { asRecord, optionalString, requiredString } from '../validation';
import { greenApi, toChatId, GreenApiError } from '../services/greenApi';
import { metaWhatsapp, CloudApiError, renderTemplate, verifyCloudSignature } from '../services/metaWhatsapp';
import { conversationWindow, sendWhatsappMedia, sendWhatsappText, toSendError, WhatsappSendError } from '../services/whatsappSender';
import { kindFromGreenType, MAX_MEDIA_BYTES, safeFileName } from '../services/whatsappKinds';
import { invoicePdf, PdfUnavailableError, quotationPdf } from '../pdf/document-pdf';
import { afterInboundMessage, variablesFor } from '../services/whatsappCampaigns';
import { whatsappReport } from '../services/whatsappReport';
import type { WhatsAppCampaignVariable, ContactRoleType } from '../types';
import { sendToPrincipal, type PushConfig, type PushPayload } from '../push/push';
import { companyInQuietHours, holdPush } from '../push/quiet-hours';
import type { LiveHub } from '../live/hub';
import type { WhatsAppChatStatus, WhatsAppMessage } from '../types';
import { ingestCloudWebhook } from '../services/whatsappCloudWebhook';
import type { DataStore } from '../data/store';
import type { RouteContext } from './context';
import { scopeOf } from '../authz/can';
import { companyManagementRoles, handler } from './shared';
import type { Express } from 'express';

/** A file we sent is stored as `wa-file:<id>` and read through the files route. */
export const WA_FILE_PREFIX = 'wa-file:';

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

/** One phone notification per (person, chat) inside this window. */
export const WHATSAPP_PUSH_WINDOW_MS = 2 * 60 * 1000;
const PUSH_PREVIEW_CHARS = 120;

/**
 * Who hears about a customer's message: a private chat's owner; else the
 * chat's assignee; else the linked contact's owner (each only while they can
 * read WhatsApp); else everyone who can.
 */
export function whatsappRecipients(store: DataStore, companyId: string, message: Pick<WhatsAppMessage, 'chatId' | 'contactId'>): string[] {
  const readers = store.listUserIdsWithPermission(companyId, 'whatsapp:read', companyManagementRoles);
  const settings = store.getWhatsappChatSettings(companyId, message.chatId);
  if (settings.visibility === 'private') return settings.ownerUserId ? [settings.ownerUserId] : [];
  if (settings.assigneeUserId && readers.includes(settings.assigneeUserId)) return [settings.assigneeUserId];
  const owner = message.contactId ? store.getContactById(message.contactId)?.ownerUserId : undefined;
  if (owner && readers.includes(owner)) return [owner];
  return readers;
}

/** The people a chat can be given to: those who read WhatsApp in the company. Names only. */
export function whatsappTeam(store: DataStore, companyId: string): Array<{ id: string; name: string }> {
  return store.listUserIdsWithPermission(companyId, 'whatsapp:read', companyManagementRoles)
    .map((id) => store.getUserById(id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .map((u) => ({ id: u.id, name: u.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Up to 10 labels of up to 30 characters, trimmed, no repeats (case kept, compared without it). */
export function parseLabels(value: unknown): string[] {
  if (!Array.isArray(value)) throw new HttpError(400, 'Labels must be a list.');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    const label = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!label) continue;
    if (label.length > 30) throw new HttpError(400, 'A label is limited to 30 characters.');
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  if (out.length > 10) throw new HttpError(400, 'A chat takes up to 10 labels.');
  return out;
}

const previewOf = (message: WhatsAppMessage): string => {
  if (message.body) return message.body.slice(0, PUSH_PREVIEW_CHARS);
  return ({ image: '📷', video: '🎥', audio: '🎤', document: '📄', file: '📎', text: '' } as Record<string, string>)[message.type] ?? '';
};

/** WhatsApp integration: Green API (QR-linked number) or Meta's Cloud API. */
export function registerWhatsappRoutes(app: Express, ctx: RouteContext, deps: { live?: LiveHub; push?: PushConfig } = {}): void {
  const { store, authMiddleware, requireCompanyRoles, viewerOf, canSee, logger } = ctx;

  /** A private chat is its owner's: its notes too. */
  const requireChat = (req: Parameters<typeof canSee>[0], companyId: string, chatId: string) => {
    if (!canSee(req, 'whatsapp_chats', companyId, chatId)) throw new HttpError(403, 'You do not have access to this private chat.');
  };

  /** Open inboxes re-read at once. Carries no data: each screen reads through its own gated route. */
  const tellInbox = (companyId: string) => deps.live?.publish({ companyId, topics: ['whatsapp'] });

  const lastPush = new Map<string, number>();
  /** A customer's message reaches the phone of whoever answers that chat. */
  const notifyPhones = async (companyId: string, message: WhatsAppMessage) => {
    if (!deps.push) return;
    const now = Date.now();
    const contactName = message.contactId ? store.getContactById(message.contactId)?.name : undefined;
    for (const userId of whatsappRecipients(store, companyId, message)) {
      const key = `${userId}|${companyId}|${message.chatId}`;
      if (now - (lastPush.get(key) ?? 0) < WHATSAPP_PUSH_WINDOW_MS) continue;
      try {
        const prefs = store.getNotificationPrefs(userId);
        if (!prefs.messages.push) continue;
        lastPush.set(key, now);
        const payload: PushPayload = {
          title: contactName || `+${message.phone}`,
          body: prefs.pushPreview ? previewOf(message) : '',
          url: `/whatsapp?chat=${encodeURIComponent(message.chatId)}`,
          tag: `whatsapp:${message.chatId}`,
          renotify: true,
        };
        if (companyInQuietHours(store, companyId, now)) {
          holdPush(store, 'staff', userId, companyId, payload);
          continue;
        }
        await sendToPrincipal(store, deps.push.send, 'staff', userId, payload);
      } catch (error) {
        logger.warn('[whatsapp] could not push a message', error);
      }
    }
    if (lastPush.size > 5000) for (const [k, at] of lastPush) if (now - at > WHATSAPP_PUSH_WINDOW_MS) lastPush.delete(k);
  };

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
      const replyToExternalId = optionalString(body.replyToExternalId) || undefined;
      const chatId = toChatId(phone);
      const actorUserId = req.user?.id;
      const actorName = req.user?.name;
      // A reply quotes a message of this same chat, nothing else.
      if (replyToExternalId && !store.findWhatsappMessageByExternalId(req.params.companyId, chatId, replyToExternalId)) {
        throw new HttpError(400, 'The message being replied to is not in this chat.');
      }
      try {
        const sent = await sendWhatsappText(store, req.params.companyId, phone, message, replyToExternalId);
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
          replyToExternalId,
          status: 'sent',
          contextEntityType,
          contextEntityId,
          actorUserId,
          actorName,
          sentAt: new Date(),
        });
        store.touchWhatsappChat(req.params.companyId, chatId, { direction: 'outbound', actorUserId });
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

  /**
   * Sends a photo, document, audio or video (base64 in JSON, up to 16 MB).
   * The bytes are kept so the chat can show what was sent.
   */
  app.post(
    '/companies/:companyId/whatsapp/send-media',
    authMiddleware,
    handler(async (req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const instance = store.getWhatsappInstanceForCompany(req.params.companyId);
      if (!instance) throw new HttpError(404, 'WhatsApp instance is not configured for this company.');
      const body = asRecord(req.body, 'body');
      const phone = requiredString(body.phone, 'phone');
      const fileName = safeFileName(body.fileName);
      const mimeType = (optionalString(body.mimeType) || 'application/octet-stream').toLowerCase();
      if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+(;.*)?$/.test(mimeType)) throw new HttpError(400, 'Invalid file type.');
      const raw = requiredString(body.dataBase64, 'dataBase64');
      const data = Buffer.from(raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw, 'base64');
      if (data.length === 0) throw new HttpError(400, 'The file is empty.');
      if (data.length > MAX_MEDIA_BYTES) throw new HttpError(413, 'The file is larger than 16 MB.');
      const caption = optionalString(body.caption) || undefined;
      const contactId = optionalString(body.contactId) || undefined;
      const replyToExternalId = optionalString(body.replyToExternalId) || undefined;
      const chatId = toChatId(phone);
      if (replyToExternalId && !store.findWhatsappMessageByExternalId(req.params.companyId, chatId, replyToExternalId)) {
        throw new HttpError(400, 'The message being replied to is not in this chat.');
      }
      const mediaId = store.saveWhatsappMedia({
        companyId: req.params.companyId, chatId, fileName, mimeType, content: data, uploadedByUserId: req.user?.id,
      });
      const base = {
        companyId: req.params.companyId,
        instanceId: instance.id,
        direction: 'outbound' as const,
        chatId,
        phone,
        contactId,
        body: caption ?? '',
        mediaUrl: `${WA_FILE_PREFIX}${mediaId}`,
        fileName,
        mimeType,
        replyToExternalId,
        actorUserId: req.user?.id,
        actorName: req.user?.name,
      };
      try {
        const sent = await sendWhatsappMedia(store, req.params.companyId, phone, { data, fileName, mimeType, caption, replyToExternalId });
        const stored = store.createWhatsappMessage({ ...base, type: sent.kind, externalId: sent.idMessage, status: 'sent', sentAt: new Date() });
        store.touchWhatsappChat(req.params.companyId, chatId, { direction: 'outbound', actorUserId: req.user?.id });
        res.status(201).json(stored);
      } catch (error) {
        // Refused before anything left (closed window, a format WhatsApp cannot play): keep nothing.
        if (error instanceof WhatsappSendError && (error.reason === 'windowClosed' || error.status === 415)) {
          store.deleteWhatsappMedia(req.params.companyId, mediaId);
          throw new HttpError(error.status, error.message, error.reason === 'windowClosed' ? { code: 'windowClosed' } : undefined);
        }
        store.createWhatsappMessage({ ...base, type: kindFromGreenType('', mimeType), status: 'failed', error: error instanceof Error ? error.message : String(error) });
        if (error instanceof WhatsappSendError) throw new HttpError(error.status, error.message);
        throw error;
      }
    }),
  );

  /**
   * Sends a quotation or an invoice as its PDF, to the document's contact by
   * default. Needs the right to print that document as well as to send.
   */
  app.post(
    '/companies/:companyId/whatsapp/send-document',
    authMiddleware,
    handler(async (req, res) => {
      const companyId = req.params.companyId;
      requireCompanyRoles(req, companyId, companyManagementRoles);
      const instance = store.getWhatsappInstanceForCompany(companyId);
      if (!instance) throw new HttpError(404, 'WhatsApp instance is not configured for this company.');
      const body = asRecord(req.body, 'body');
      const kind = optionalString(body.kind);
      const id = requiredString(body.id, 'id');
      let doc: { number: string; contactId?: string; clientId?: string; language?: string; entityType: 'quotation' | 'invoice' };
      let render: () => Promise<{ pdf: Buffer; fileName: string; language: string }>;
      if (kind === 'quotation') {
        const quote = store.getQuotationById(id);
        if (!quote || quote.companyId !== companyId) throw new HttpError(404, 'Quotation not found.');
        ctx.requirePermission(req, companyId, 'sales.view', companyManagementRoles);
        doc = { number: quote.quoteNumber, contactId: quote.contactId, clientId: quote.clientId, language: quote.language, entityType: 'quotation' };
        render = () => quotationPdf(store, quote, req.query.lang);
      } else if (kind === 'invoice') {
        const invoice = store.getInvoiceById(id);
        if (!invoice || invoice.companyId !== companyId) throw new HttpError(404, 'Invoice not found.');
        ctx.requirePermission(req, companyId, 'invoices.print', ['Admin', 'Manager', 'Accountant', 'Employee']);
        doc = { number: invoice.invoiceNumber, contactId: invoice.contactId, clientId: invoice.clientId, entityType: 'invoice' };
        render = () => invoicePdf(invoice, optionalString(body.language) || req.query.lang);
      } else {
        throw new HttpError(400, 'kind must be quotation or invoice.');
      }
      // To whom: the phone given, else the document's contact, else its client.
      const contact = (doc.contactId && store.getContactById(doc.contactId)) || (doc.clientId && store.getContactById(doc.clientId)) || undefined;
      const phone = optionalString(body.phone) || contact?.phone || '';
      if (!phone.replace(/\D/g, '')) throw new HttpError(400, 'This document has no contact phone. Enter a number to send to.');
      const chatId = toChatId(phone);
      const lang = doc.language || optionalString(body.language) || 'en';
      const caption = optionalString(body.caption)
        ?? (lang.startsWith('ar')
          ? `مرحباً، تجدون مرفقاً ${doc.entityType === 'quotation' ? 'عرض السعر' : 'الفاتورة'} رقم ${doc.number}.`
          : `Hello, please find attached ${doc.entityType} ${doc.number}.`);

      // Cloud: say "send a template first" before spending a PDF render.
      if (instance.provider === 'cloud' && !conversationWindow(store, companyId, chatId).open) {
        throw new HttpError(409, 'This customer has not written in the last 24 hours: send an approved template instead.', { code: 'windowClosed' });
      }
      let file: { pdf: Buffer; fileName: string };
      try {
        file = await render();
      } catch (error) {
        if (error instanceof PdfUnavailableError) throw new HttpError(503, error.message);
        throw error;
      }
      const mediaId = store.saveWhatsappMedia({ companyId, chatId, fileName: file.fileName, mimeType: 'application/pdf', content: file.pdf, uploadedByUserId: req.user?.id });
      const base = {
        companyId,
        instanceId: instance.id,
        direction: 'outbound' as const,
        chatId,
        phone,
        contactId: contact?.id,
        body: caption,
        mediaUrl: `${WA_FILE_PREFIX}${mediaId}`,
        fileName: file.fileName,
        mimeType: 'application/pdf',
        contextEntityType: doc.entityType,
        contextEntityId: id,
        actorUserId: req.user?.id,
        actorName: req.user?.name,
      };
      try {
        const sent = await sendWhatsappMedia(store, companyId, phone, { data: file.pdf, fileName: file.fileName, mimeType: 'application/pdf', caption });
        const stored = store.createWhatsappMessage({ ...base, type: 'document', externalId: sent.idMessage, status: 'sent', sentAt: new Date() });
        store.touchWhatsappChat(companyId, chatId, { direction: 'outbound', actorUserId: req.user?.id });
        store.createActivityEvent({
          companyId,
          actorUserId: req.user?.id,
          actorName: req.user?.name,
          entityType: doc.entityType,
          entityId: id,
          action: 'sent_whatsapp',
          summary: `${doc.entityType === 'quotation' ? 'Quotation' : 'Invoice'} ${doc.number} sent by WhatsApp to +${chatId.replace(/@c\.us$/, '')}.`,
          metadata: { chatId, messageId: stored.id },
        });
        res.status(201).json(stored);
      } catch (error) {
        if (error instanceof WhatsappSendError && error.reason === 'windowClosed') {
          store.deleteWhatsappMedia(companyId, mediaId);
          throw new HttpError(409, error.message, { code: 'windowClosed' });
        }
        store.createWhatsappMessage({ ...base, type: 'document', status: 'failed', error: error instanceof Error ? error.message : String(error) });
        if (error instanceof WhatsappSendError) throw new HttpError(error.status, error.message);
        throw error;
      }
    }),
  );

  /** A file we sent, for showing it in the chat. Same privacy rule as the chat itself. */
  app.get(
    '/companies/:companyId/whatsapp/files/:fileId',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const file = store.getWhatsappMedia(req.params.companyId, req.params.fileId);
      if (!file) throw new HttpError(404, 'File not found.');
      if (!canSee(req, 'whatsapp_chats', req.params.companyId, file.chatId)) {
        throw new HttpError(403, 'You do not have access to this private chat.');
      }
      res.setHeader('Content-Type', file.mimeType);
      // Never run as a page of ours, whatever the bytes are.
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.send(file.content);
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
        const stored = store.createWhatsappMessage({ ...base, externalId: sent.idMessage, status: 'sent', sentAt: new Date() });
        store.touchWhatsappChat(req.params.companyId, chatId, { direction: 'outbound', actorUserId: req.user?.id });
        res.status(201).json(stored);
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
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
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

      // Team work: who answers, where the chat stands, its labels.
      const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
      let assigneeUserId: string | null | undefined;
      if (has('assigneeUserId')) {
        assigneeUserId = body.assigneeUserId === null ? null : optionalString(body.assigneeUserId) || null;
        if (assigneeUserId && !whatsappTeam(store, req.params.companyId).some((u) => u.id === assigneeUserId)) {
          throw new HttpError(400, 'This person cannot read WhatsApp chats in this company.');
        }
      }
      let status: WhatsAppChatStatus | undefined;
      if (has('status')) {
        const raw = optionalString(body.status);
        if (raw !== 'open' && raw !== 'waiting' && raw !== 'done') throw new HttpError(400, 'Status must be open, waiting or done.');
        status = raw;
      }
      const labels = has('labels') ? parseLabels(body.labels) : undefined;

      const updated = store.setWhatsappChatSettings(req.params.companyId, req.params.chatId, {
        visibility,
        ownerUserId: effectiveOwner as any,
        assigneeUserId,
        status,
        labels,
      });
      // Handed to someone else: tell them (in the app, and on the phone by their preferences).
      if (assigneeUserId && assigneeUserId !== current.assigneeUserId && assigneeUserId !== req.user!.id) {
        const phone = req.params.chatId.replace(/@c\.us$/, '');
        const contactId = store.findContactIdByPhone(req.params.companyId, phone);
        const who = (contactId ? store.getContactById(contactId)?.name : undefined) || `+${phone}`;
        store.notify({
          companyId: req.params.companyId,
          userIds: [assigneeUserId],
          type: 'whatsapp_assigned',
          title: `You were assigned the WhatsApp chat with ${who}`,
          data: { tKey: 'notif.whatsappAssigned.t', contact: who, by: req.user?.name ?? '' },
          link: `/whatsapp?chat=${encodeURIComponent(req.params.chatId)}`,
          entityType: 'whatsapp_chat',
          entityId: req.params.chatId,
        });
      }
      res.json(updated);
    }),
  );

  // ---------------- automation, opt-outs, campaigns ----------------

  const requireManage = (req: Parameters<typeof requireCompanyRoles>[0], companyId: string) =>
    requireCompanyRoles(req, companyId, ['Admin']);

  app.get(
    '/companies/:companyId/whatsapp/automation',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.getWhatsappAutomation(req.params.companyId));
    }),
  );

  app.put(
    '/companies/:companyId/whatsapp/automation',
    authMiddleware,
    handler((req, res) => {
      requireManage(req, req.params.companyId);
      const body = asRecord(req.body, 'body');
      const text = (key: string) => {
        const value = typeof body[key] === 'string' ? (body[key] as string).trim() : '';
        if (value.length > 1000) throw new HttpError(400, 'An automatic message is limited to 1000 characters.');
        return value;
      };
      const next = {
        welcomeEnabled: body.welcomeEnabled === true,
        welcomeText: text('welcomeText'),
        awayEnabled: body.awayEnabled === true,
        awayText: text('awayText'),
      };
      if (next.welcomeEnabled && !next.welcomeText) throw new HttpError(400, 'Write the welcome message before turning it on.');
      if (next.awayEnabled && !next.awayText) throw new HttpError(400, 'Write the away message before turning it on.');
      res.json(store.setWhatsappAutomation(req.params.companyId, next));
    }),
  );

  app.get(
    '/companies/:companyId/whatsapp/optouts',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.listWhatsappOptOuts(req.params.companyId));
    }),
  );

  app.post(
    '/companies/:companyId/whatsapp/optouts',
    authMiddleware,
    handler((req, res) => {
      requireManage(req, req.params.companyId);
      const body = asRecord(req.body, 'body');
      const phone = requiredString(body.phone, 'phone');
      if (phone.replace(/\D/g, '').length < 7) throw new HttpError(400, 'Enter a full phone number.');
      store.setWhatsappOptOut(req.params.companyId, phone, body.optedOut !== false, optionalString(body.reason) || 'Added by staff');
      res.json({ success: true });
    }),
  );

  /** Contacts a campaign can reach: those with a phone, by role and tag, that the person may see. */
  const audienceOf = (req: Parameters<typeof viewerOf>[0], companyId: string, filter: { role?: string; tag?: string; contactIds?: string[] }) => {
    const roles = ['Client', 'Lead', 'Supplier', 'Influencer', 'Partner', 'Vendor'];
    const role = filter.role && roles.includes(filter.role) ? (filter.role as ContactRoleType) : undefined;
    let contacts = store.listContacts(companyId, role, viewerOf(req)).filter((c) => (c.phone || '').replace(/\D/g, '').length >= 7);
    if (filter.tag) contacts = contacts.filter((c) => (c.tags || []).some((t) => t.toLowerCase() === filter.tag!.toLowerCase()));
    if (filter.contactIds) {
      const wanted = new Set(filter.contactIds);
      contacts = contacts.filter((c) => wanted.has(c.id));
    }
    return contacts.map((c) => ({
      contactId: c.id,
      name: c.name,
      phone: (c.phone || '').replace(/\D/g, ''),
      optedOut: store.isWhatsappOptedOut(companyId, c.phone || ''),
    }));
  };

  app.get(
    '/companies/:companyId/whatsapp/audience',
    authMiddleware,
    handler((req, res) => {
      requireManage(req, req.params.companyId);
      res.json(audienceOf(req, req.params.companyId, { role: optionalString(req.query.role), tag: optionalString(req.query.tag) }));
    }),
  );

  const campaignView = (companyId: string, id: string) => {
    const campaign = store.getWhatsappCampaign(companyId, id);
    if (!campaign) throw new HttpError(404, 'Campaign not found.');
    const recipients = store.listWhatsappCampaignRecipients(id);
    const count = (fn: (r: (typeof recipients)[number]) => boolean) => recipients.filter(fn).length;
    const reached = (r: (typeof recipients)[number]) => r.status === 'sent' && r.delivery !== 'failed';
    return {
      ...campaign,
      stats: {
        total: recipients.length,
        queued: count((r) => r.status === 'queued'),
        sent: count(reached),
        delivered: count((r) => reached(r) && (r.delivery === 'delivered' || r.delivery === 'read')),
        read: count((r) => reached(r) && r.delivery === 'read'),
        replied: count((r) => r.replied),
        failed: count((r) => r.status === 'failed' || (r.status === 'sent' && r.delivery === 'failed')),
        skipped: count((r) => r.status === 'skipped'),
      },
      recipients,
    };
  };

  app.get(
    '/companies/:companyId/whatsapp/campaigns',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.listWhatsappCampaigns(req.params.companyId).map((c) => {
        const { recipients: _omit, ...view } = campaignView(req.params.companyId, c.id);
        return view;
      }));
    }),
  );

  app.get(
    '/companies/:companyId/whatsapp/campaigns/:campaignId',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(campaignView(req.params.companyId, req.params.campaignId));
    }),
  );

  /**
   * A draft: an approved template and a frozen list of contacts. Only on the
   * official Cloud API — bulk messages from a QR-linked number get it banned.
   */
  app.post(
    '/companies/:companyId/whatsapp/campaigns',
    authMiddleware,
    handler(async (req, res) => {
      const companyId = req.params.companyId;
      requireManage(req, companyId);
      const instance = store.getWhatsappInstanceForCompany(companyId);
      if (!instance || instance.provider !== 'cloud') {
        throw new HttpError(400, 'Campaigns need the official WhatsApp Cloud API: bulk messages from a QR-linked number get it banned.', { code: 'cloudRequired' });
      }
      const { creds } = requireCloud(companyId);
      const body = asRecord(req.body, 'body');
      const name = requiredString(body.name, 'name').trim().slice(0, 120);
      const templateName = requiredString(body.templateName, 'templateName');
      const templateLanguage = requiredString(body.templateLanguage, 'templateLanguage');
      const template = (await wrapCloud(() => metaWhatsapp.listTemplates(creds))).find((t) => t.name === templateName && t.language === templateLanguage);
      if (!template) throw new HttpError(404, 'This template is not approved for this number.');
      const rawVars = Array.isArray(body.variables) ? body.variables : [];
      if (rawVars.length !== template.variableCount) throw new HttpError(400, `This template takes ${template.variableCount} value(s).`);
      const variables: WhatsAppCampaignVariable[] = rawVars.map((v) => {
        const item = asRecord(v, 'variable');
        if (item.source === 'name') return { source: 'name' };
        const value = String(item.value ?? '').trim();
        if (!value) throw new HttpError(400, 'Every fixed value needs text.');
        return { source: 'text', value };
      });
      const audience = asRecord(body.audience ?? {}, 'audience');
      const contactIds = Array.isArray(audience.contactIds) ? audience.contactIds.map(String) : undefined;
      const people = audienceOf(req, companyId, { role: optionalString(audience.role), tag: optionalString(audience.tag), contactIds });
      if (people.length === 0) throw new HttpError(400, 'No contact with a phone matches this audience.');
      if (people.length > 2000) throw new HttpError(400, 'A campaign is limited to 2000 people.');
      const { campaign, dropped } = store.createWhatsappCampaign({
        companyId, name, templateName, templateLanguage, variables,
        recipients: people.map((p) => ({ contactId: p.contactId, name: p.name, phone: p.phone })),
        userId: req.user?.id, userName: req.user?.name,
      });
      // The first message as the first person will read it, for a last look before starting.
      const first = store.listWhatsappCampaignRecipients(campaign.id)[0];
      const preview = first
        ? [template.headerText, renderTemplate(template.bodyText, variablesFor(campaign, first, '')), template.footerText].filter(Boolean).join('\n\n')
        : '';
      res.status(201).json({ ...campaignView(companyId, campaign.id), dropped, preview });
    }),
  );

  for (const action of ['start', 'pause', 'cancel'] as const) {
    app.post(
      `/companies/:companyId/whatsapp/campaigns/:campaignId/${action}`,
      authMiddleware,
      handler((req, res) => {
        const companyId = req.params.companyId;
        requireManage(req, companyId);
        const campaign = store.getWhatsappCampaign(companyId, req.params.campaignId);
        if (!campaign) throw new HttpError(404, 'Campaign not found.');
        const allowed: Record<typeof action, string[]> = {
          start: ['draft', 'paused'],
          pause: ['running'],
          cancel: ['draft', 'running', 'paused'],
        };
        if (!allowed[action].includes(campaign.status)) throw new HttpError(409, `A ${campaign.status} campaign cannot be ${action === 'start' ? 'started' : action === 'pause' ? 'paused' : 'cancelled'}.`);
        if (action === 'start') {
          const instance = store.getWhatsappInstanceForCompany(companyId);
          if (!instance || instance.provider !== 'cloud') throw new HttpError(400, 'Campaigns need the official WhatsApp Cloud API.', { code: 'cloudRequired' });
        }
        const next = action === 'start' ? 'running' : action === 'pause' ? 'paused' : 'cancelled';
        if (next === 'cancelled') {
          for (const r of store.nextWhatsappRecipients(campaign.id, 100000)) store.markWhatsappRecipient(r.id, { status: 'skipped', error: 'Cancelled' });
        }
        store.setWhatsappCampaignStatus(companyId, campaign.id, next);
        const { recipients: _omit, ...view } = campaignView(companyId, campaign.id);
        res.json(view);
      }),
    );
  }

  /** How the team answers: per person and per day. Managers only (it compares people). */
  app.get(
    '/companies/:companyId/whatsapp/report',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      // Only for someone who reads every chat of the company (Admins and Managers today).
      const scope = scopeOf(viewerOf(req), 'whatsapp.view', req.params.companyId);
      if (scope !== 'company' && scope !== 'group') throw new HttpError(403, 'The response report is for those who see every chat.');
      const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
      // Current open / late counts come from the same list the inbox shows.
      const chats = store.listWhatsappChats(req.params.companyId).map((c) => ({ assigneeUserId: c.assigneeUserId, status: c.status, sla: c.sla }));
      res.json(whatsappReport(store, req.params.companyId, days, new Date(), chats));
    }),
  );

  /** Who can be given a chat: the people who read WhatsApp in this company. Names only. */
  app.get(
    '/companies/:companyId/whatsapp/team',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(whatsappTeam(store, req.params.companyId));
    }),
  );

  /** Staff notes inside a chat. Never sent to the customer; they follow the chat's privacy. */
  app.get(
    '/companies/:companyId/whatsapp/chats/:chatId/notes',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      requireChat(req, req.params.companyId, req.params.chatId);
      res.json(store.listWhatsappNotes(req.params.companyId, req.params.chatId));
    }),
  );

  app.post(
    '/companies/:companyId/whatsapp/chats/:chatId/notes',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      requireChat(req, req.params.companyId, req.params.chatId);
      const text = requiredString(asRecord(req.body, 'body').body, 'body').trim();
      if (text.length > 2000) throw new HttpError(400, 'A note is limited to 2000 characters.');
      res.status(201).json(store.createWhatsappNote({
        companyId: req.params.companyId, chatId: req.params.chatId, body: text, authorUserId: req.user?.id, authorName: req.user?.name,
      }));
    }),
  );

  app.delete(
    '/companies/:companyId/whatsapp/notes/:noteId',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const note = store.getWhatsappNote(req.params.companyId, req.params.noteId);
      if (!note) throw new HttpError(404, 'Note not found.');
      requireChat(req, req.params.companyId, note.chatId);
      // Its author, or someone who manages every chat of the company.
      const scope = scopeOf(viewerOf(req), 'whatsapp.view', req.params.companyId);
      if (note.authorUserId !== req.user!.id && scope !== 'company' && scope !== 'group') {
        throw new HttpError(403, 'Only the note\'s author or a manager can delete it.');
      }
      store.deleteWhatsappNote(req.params.companyId, note.id);
      res.json({ success: true });
    }),
  );

  /** Saved texts of the company, inserted in the message box by their short code. */
  app.get(
    '/companies/:companyId/whatsapp/quick-replies',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.listWhatsappQuickReplies(req.params.companyId));
    }),
  );

  const saveQuickReply = (req: Parameters<typeof requireCompanyRoles>[0], id?: string) => {
    const body = asRecord(req.body, 'body');
    const shortcut = requiredString(body.shortcut, 'shortcut').trim().replace(/^\/+/, '').toLowerCase();
    if (!/^[\p{L}\p{N}_-]{1,30}$/u.test(shortcut)) throw new HttpError(400, 'The short code is one word of letters or digits, up to 30 characters.');
    const text = requiredString(body.body, 'body').trim();
    if (text.length > 4000) throw new HttpError(400, 'A quick reply is limited to 4000 characters.');
    try {
      const saved = store.saveWhatsappQuickReply(req.params.companyId, { id, shortcut, body: text, userId: req.user?.id });
      if (!saved) throw new HttpError(404, 'Quick reply not found.');
      return saved;
    } catch (error) {
      if (error instanceof Error && error.message === 'shortcut_taken') throw new HttpError(409, 'Another quick reply already uses this short code.');
      throw error;
    }
  };

  app.post(
    '/companies/:companyId/whatsapp/quick-replies',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.status(201).json(saveQuickReply(req));
    }),
  );

  app.put(
    '/companies/:companyId/whatsapp/quick-replies/:replyId',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(saveQuickReply(req, req.params.replyId));
    }),
  );

  app.delete(
    '/companies/:companyId/whatsapp/quick-replies/:replyId',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      if (!store.deleteWhatsappQuickReply(req.params.companyId, req.params.replyId)) throw new HttpError(404, 'Quick reply not found.');
      res.json({ success: true });
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
          const fileData = messageData?.fileMessageData || {};
          const fileUrl = fileData.downloadUrl;
          const fileName = fileData.fileName;
          const fileMime = fileData.mimeType ? String(fileData.mimeType) : undefined;
          const messageType: import('../types').WhatsAppMessageType =
            fileUrl ? kindFromGreenType(messageData?.typeMessage, fileMime) : 'text';
          const quotedId = messageData?.quotedMessage?.stanzaId;
          // A redelivered event is the same message: no second follow-up, no second notification.
          const inboundChatId = String(senderData?.chatId || '');
          const inboundId = String(payload?.idMessage || '');
          const isNew = !inboundId || !store.findWhatsappMessageByExternalId(instance.companyId, inboundChatId, inboundId);
          const savedMessage = store.createWhatsappMessage({
            companyId: instance.companyId,
            instanceId: instance.id,
            direction: 'inbound',
            externalId: String(payload?.idMessage || ''),
            chatId: String(senderData?.chatId || ''),
            phone: String(senderData?.chatId || '').replace(/@c\.us$/, ''),
            type: messageType,
            body: textBody || (fileUrl ? String(fileData.caption || '') : ''),
            mediaUrl: fileUrl || undefined,
            fileName: fileName || undefined,
            mimeType: fileUrl ? fileMime : undefined,
            replyToExternalId: quotedId ? String(quotedId) : undefined,
            status: 'delivered',
            receivedAt: new Date((Number(payload?.timestamp) || Date.now() / 1000) * 1000),
          });
          // Auto-follow-up: if the inbound message is linked to a known
          // contact, schedule a same-day reply reminder.
          if (isNew && savedMessage.contactId) {
            scheduleInboundFollowup(store, logger, instance.companyId, savedMessage.id, savedMessage.contactId);
          }
          if (isNew) {
            // The customer wrote: the chat is ours to answer again, also when it was done.
            store.touchWhatsappChat(instance.companyId, savedMessage.chatId, { direction: 'inbound' });
            void notifyPhones(instance.companyId, savedMessage);
            void afterInboundMessage(store, savedMessage)
              .then((done) => done && tellInbox(instance.companyId))
              .catch((error) => logger.warn('[whatsapp] auto reply failed', error));
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
      tellInbox(instance.companyId);
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
        for (const message of result.inbound) {
          store.touchWhatsappChat(instance.companyId, message.chatId, { direction: 'inbound' });
          void notifyPhones(instance.companyId, message);
          void afterInboundMessage(store, message)
            .then((done) => done && tellInbox(instance.companyId))
            .catch((error) => logger.warn('[whatsapp] auto reply failed', error));
        }
        if (result.messages > 0 || result.statuses > 0) tellInbox(instance.companyId);
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
