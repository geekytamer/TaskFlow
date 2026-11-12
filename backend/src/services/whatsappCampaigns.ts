/**
 * Campaigns (one approved template to many contacts) and automatic replies
 * (welcome / away). Campaigns go only through Meta's Cloud API, at a safe
 * pace; auto replies answer a message the customer just sent.
 */

import type { DataStore } from '../data/store';
import type { WhatsAppCampaign, WhatsAppMessage } from '../types';
import { metaWhatsapp, renderTemplate, type CloudTemplate } from './metaWhatsapp';
import { sendWhatsappText } from './whatsappSender';
import { isWorkingTime } from '../conversations/sla';

/** Per pass (every few seconds) and per campaign. */
export const CAMPAIGN_BATCH = 3;
/** An away message at most once per chat in this window. */
export const AWAY_REPEAT_MS = 12 * 60 * 60 * 1000;

/** "stop" in the languages the customers write. Whole message only, so "don't stop" is not an opt-out. */
const STOP_WORDS = new Set(['stop', 'unsubscribe', 'إيقاف', 'ايقاف', 'توقف', 'الغاء', 'إلغاء', 'الغاء الاشتراك', 'إلغاء الاشتراك', 'stop please']);
export function isStopMessage(body: string): boolean {
  return STOP_WORDS.has(body.trim().toLowerCase().replace(/[.!؟?\s]+$/u, '').replace(/\s+/g, ' '));
}

/** The variables of one recipient. */
export function variablesFor(campaign: WhatsAppCampaign, recipient: { name?: string }, fallbackName: string): string[] {
  return campaign.variables.map((v) => (v.source === 'name' ? (recipient.name?.trim() || fallbackName) : v.value));
}

const busy = new Set<string>();

/**
 * One pass: each running campaign sends its next few recipients. A campaign
 * already sending (a slow pass) is skipped, never sent twice.
 */
export async function runCampaignPass(store: DataStore, log: { warn: (...a: unknown[]) => void } = console): Promise<{ sent: number; companies: string[] }> {
  let sent = 0;
  const companies = new Set<string>();
  for (const campaign of store.listRunningWhatsappCampaigns()) {
    if (busy.has(campaign.id)) continue;
    busy.add(campaign.id);
    try {
      const n = await sendNextBatch(store, campaign);
      sent += n;
      if (n > 0) companies.add(campaign.companyId);
    } catch (error) {
      log.warn('[whatsapp] campaign pass failed', campaign.id, error);
    } finally {
      busy.delete(campaign.id);
    }
  }
  return { sent, companies: [...companies] };
}

const templateCache = new Map<string, { at: number; template?: CloudTemplate }>();

async function templateOf(store: DataStore, campaign: WhatsAppCampaign): Promise<CloudTemplate | undefined> {
  const key = `${campaign.companyId}|${campaign.templateName}|${campaign.templateLanguage}`;
  const hit = templateCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.template;
  const creds = store.getWhatsappCloudCredentials(campaign.companyId);
  if (!creds) return undefined;
  const template = (await metaWhatsapp.listTemplates(creds)).find((t) => t.name === campaign.templateName && t.language === campaign.templateLanguage);
  templateCache.set(key, { at: Date.now(), template });
  return template;
}
export function forgetTemplateCache(): void {
  templateCache.clear();
}

async function sendNextBatch(store: DataStore, campaign: WhatsAppCampaign): Promise<number> {
  const instance = store.getWhatsappInstanceForCompany(campaign.companyId);
  const creds = store.getWhatsappCloudCredentials(campaign.companyId);
  // The number was disconnected or moved off the Cloud API: stop rather than fail every row.
  if (!instance || instance.provider !== 'cloud' || !creds || !store.isModuleEnabled(campaign.companyId, 'whatsapp')) {
    store.setWhatsappCampaignStatus(campaign.companyId, campaign.id, 'paused');
    return 0;
  }
  const batch = store.nextWhatsappRecipients(campaign.id, CAMPAIGN_BATCH);
  if (batch.length === 0) {
    store.setWhatsappCampaignStatus(campaign.companyId, campaign.id, 'done');
    return 0;
  }
  const template = await templateOf(store, campaign);
  if (!template) {
    // Meta withdrew or never approved it: nothing can go; say why on every row left.
    for (const r of store.nextWhatsappRecipients(campaign.id, 100000)) store.markWhatsappRecipient(r.id, { status: 'failed', error: 'The template is no longer approved.' });
    store.setWhatsappCampaignStatus(campaign.companyId, campaign.id, 'done');
    return 0;
  }
  let sent = 0;
  for (const recipient of batch) {
    // Re-read: the campaign may have been paused or cancelled meanwhile.
    if (store.getWhatsappCampaign(campaign.companyId, campaign.id)?.status !== 'running') break;
    if (store.isWhatsappOptedOut(campaign.companyId, recipient.phone)) {
      store.markWhatsappRecipient(recipient.id, { status: 'skipped', error: 'Opted out' });
      continue;
    }
    const chatId = `${recipient.phone}@c.us`;
    const variables = variablesFor(campaign, recipient, '');
    const body = [template.headerText, renderTemplate(template.bodyText, variables), template.footerText].filter(Boolean).join('\n\n');
    const base = {
      companyId: campaign.companyId, instanceId: instance.id, direction: 'outbound' as const, chatId, phone: recipient.phone,
      contactId: recipient.contactId, type: 'text' as const, body, contextEntityType: 'whatsapp_campaign', contextEntityId: campaign.id,
      actorUserId: campaign.createdByUserId, actorName: campaign.createdByName,
    };
    try {
      if (variables.some((v) => !v.trim())) throw new Error('A template value is empty for this contact.');
      const result = await metaWhatsapp.sendTemplate(creds, chatId, { name: template.name, language: template.language, variables });
      const message = store.createWhatsappMessage({ ...base, externalId: result.idMessage, status: 'sent', sentAt: new Date() });
      store.markWhatsappRecipient(recipient.id, { status: 'sent', messageId: message.id });
      sent += 1;
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      const message = store.createWhatsappMessage({ ...base, status: 'failed', error: text });
      store.markWhatsappRecipient(recipient.id, { status: 'failed', messageId: message.id, error: text });
    }
  }
  return sent;
}

/**
 * A customer's new message: record a "stop", then the welcome (their very
 * first message) or the away reply (outside working hours, once per 12 h).
 * Returns what was sent, if anything.
 */
export async function afterInboundMessage(store: DataStore, message: WhatsAppMessage, now = new Date()): Promise<'welcome' | 'away' | 'optout' | undefined> {
  const { companyId, chatId } = message;
  if (isStopMessage(message.body || '')) {
    store.setWhatsappOptOut(companyId, message.phone, true, 'Asked to stop');
    return 'optout';
  }
  const auto = store.getWhatsappAutomation(companyId);
  let kind: 'welcome' | 'away' | undefined;
  let text = '';
  if (auto.welcomeEnabled && auto.welcomeText.trim() && store.countWhatsappMessages(companyId, chatId) === 1) {
    kind = 'welcome';
    text = auto.welcomeText.trim();
  } else if (auto.awayEnabled && auto.awayText.trim() && !isWorkingTime(now.getTime(), store.conversations.settings(companyId))) {
    const last = store.lastWhatsappAutoReplyAt(companyId, chatId, 'away');
    if (!last || now.getTime() - last.getTime() >= AWAY_REPEAT_MS) {
      kind = 'away';
      text = auto.awayText.trim();
    }
  }
  if (!kind) return undefined;
  const base = {
    companyId, direction: 'outbound' as const, chatId, phone: message.phone, contactId: message.contactId, type: 'text' as const, body: text,
    contextEntityType: 'auto_reply', contextEntityId: kind, actorName: 'Auto-reply',
  };
  try {
    const sent = await sendWhatsappText(store, companyId, message.phone, text);
    // Recorded, but it neither assigns the chat nor hands the turn to the customer.
    store.createWhatsappMessage({ ...base, instanceId: sent.instanceId, externalId: sent.idMessage, status: 'sent', sentAt: new Date() });
  } catch (error) {
    const instance = store.getWhatsappInstanceForCompany(companyId);
    if (instance) store.createWhatsappMessage({ ...base, instanceId: instance.id, status: 'failed', error: error instanceof Error ? error.message : String(error) });
  }
  return kind;
}
