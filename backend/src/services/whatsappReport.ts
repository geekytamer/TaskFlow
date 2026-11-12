/**
 * How the team answers on WhatsApp over a period: per person, how many
 * customer waits they answered and how fast (working hours of the inbox),
 * and per day, messages in and out.
 */

import type { DataStore } from '../data/store';
import { workingHoursBetween } from '../conversations/sla';

export interface WhatsappReport {
  from: string;
  to: string;
  totals: {
    inbound: number;
    outbound: number;
    chats: number;
    newChats: number;
    answered: number;
    unanswered: number;
    /** Working hours, median of first replies to a customer's wait. */
    medianReplyHours: number | null;
    openNow: number;
    lateNow: number;
  };
  people: Array<{
    userId: string;
    name: string;
    answered: number;
    messagesSent: number;
    medianReplyHours: number | null;
    openAssigned: number;
    lateAssigned: number;
  }>;
  days: Array<{ day: string; inbound: number; outbound: number }>;
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return Math.round((s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2) * 100) / 100;
};

/** Messages a person wrote (not auto replies, campaigns or portal alerts). */
const byPerson = (m: { direction: string; actorUserId: string | null; contextEntityType: string | null; status: string }) =>
  m.direction === 'outbound' && !!m.actorUserId && m.status !== 'failed'
  && !['auto_reply', 'whatsapp_campaign', 'portal_alert'].includes(m.contextEntityType ?? '');

export function whatsappReport(store: DataStore, companyId: string, days: number, now = new Date(), chats?: Array<{ assigneeUserId?: string; status: string; sla?: string }>): WhatsappReport {
  const to = now;
  const from = new Date(now.getTime() - days * 86400000);
  const rule = store.conversations.settings(companyId);
  // A week before the window too, so a wait that began just before it is not counted as unanswered noise.
  const rows = store.listWhatsappReportRows(companyId, new Date(from.getTime() - 7 * 86400000).toISOString());
  const firstAt = store.whatsappChatStarts(companyId);

  const inWindow = (at: string) => at >= from.toISOString() && at <= to.toISOString();
  const replyHours = new Map<string, number[]>();
  const answeredBy = new Map<string, number>();
  const sentBy = new Map<string, number>();
  const allReplies: number[] = [];
  let unanswered = 0;
  const chatsSeen = new Set<string>();
  const dayMap = new Map<string, { inbound: number; outbound: number }>();
  for (let d = 0; d < days; d += 1) {
    const day = new Date(from.getTime() + (d + 1) * 86400000).toISOString().slice(0, 10);
    dayMap.set(day, { inbound: 0, outbound: 0 });
  }
  let inbound = 0;
  let outbound = 0;

  // Walk each chat in time order: a wait starts at a customer's message after our last reply,
  // and ends at the next message a person wrote.
  let chat = '';
  let waitingSince: string | null = null;
  const closeChat = () => {
    if (waitingSince && inWindow(waitingSince)) unanswered += 1;
    waitingSince = null;
  };
  for (const m of rows) {
    if (m.chatId !== chat) {
      closeChat();
      chat = m.chatId;
    }
    if (inWindow(m.at)) {
      chatsSeen.add(m.chatId);
      const day = dayMap.get(m.at.slice(0, 10));
      if (m.direction === 'inbound') {
        inbound += 1;
        if (day) day.inbound += 1;
      } else if (m.status !== 'failed') {
        outbound += 1;
        if (day) day.outbound += 1;
      }
      if (byPerson(m)) sentBy.set(m.actorUserId!, (sentBy.get(m.actorUserId!) ?? 0) + 1);
    }
    if (m.direction === 'inbound') {
      if (!waitingSince) waitingSince = m.at;
    } else if (byPerson(m) && waitingSince) {
      if (inWindow(waitingSince)) {
        const hours = workingHoursBetween(waitingSince, m.at, rule);
        allReplies.push(hours);
        const list = replyHours.get(m.actorUserId!) ?? [];
        list.push(hours);
        replyHours.set(m.actorUserId!, list);
        answeredBy.set(m.actorUserId!, (answeredBy.get(m.actorUserId!) ?? 0) + 1);
      }
      waitingSince = null;
    }
  }
  closeChat();

  const chatList = chats ?? [];
  const people = new Set<string>([...answeredBy.keys(), ...sentBy.keys(), ...chatList.map((c) => c.assigneeUserId).filter((x): x is string => !!x)]);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    totals: {
      inbound,
      outbound,
      chats: chatsSeen.size,
      newChats: [...chatsSeen].filter((id) => inWindow(firstAt.get(id) ?? '')).length,
      answered: allReplies.length,
      unanswered,
      medianReplyHours: median(allReplies),
      openNow: chatList.filter((c) => c.status === 'open').length,
      lateNow: chatList.filter((c) => c.status === 'open' && c.sla === 'red').length,
    },
    people: [...people]
      .map((userId) => ({
        userId,
        name: store.getUserById(userId)?.name ?? '—',
        answered: answeredBy.get(userId) ?? 0,
        messagesSent: sentBy.get(userId) ?? 0,
        medianReplyHours: median(replyHours.get(userId) ?? []),
        openAssigned: chatList.filter((c) => c.assigneeUserId === userId && c.status === 'open').length,
        lateAssigned: chatList.filter((c) => c.assigneeUserId === userId && c.status === 'open' && c.sla === 'red').length,
      }))
      .sort((a, b) => b.answered - a.answered || a.name.localeCompare(b.name)),
    days: [...dayMap.entries()].map(([day, v]) => ({ day, ...v })),
  };
}
