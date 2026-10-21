import { Router, type Response } from 'express';
import { HttpError, canAccessCompany } from '../http';
import type { LiveHub } from '../live/hub';
import { sendToPrincipal, type PushConfig, type PushPayload } from '../push/push';
import { companyInQuietHours, holdPush } from '../push/quiet-hours';
import { EDIT_WINDOW_MS, MAX_BODY, type TeamChatRow } from './team-chat-store';
import { asRecord, requiredString } from '../validation';
import type { RouteContext } from '../routes/context';
import { handler, type AuthedRequest } from '../routes/shared';

const PREVIEW_CHARS = 140;

/**
 * Staff chats (teamchat/team-chat-store.ts). Anyone in a company can chat with
 * colleagues of that company; a chat is readable only by its members, whatever
 * their role. A chat that is not yours answers 404, so its existence stays private.
 * Like the client inbox (conversations/staff-routes.ts) this is a router of its
 * own: access is by membership, not by a role permission, so it has no entry
 * in the permission catalogue.
 */
export function createTeamChatRouter(
  ctx: Pick<RouteContext, 'store' | 'authMiddleware' | 'requireCompanyAccess' | 'logger'>,
  deps: { live: LiveHub; push?: PushConfig },
): Router {
  const app = Router();
  const { store, authMiddleware, requireCompanyAccess, logger } = ctx;
  const chats = store.teamChats;

  const colleague = (companyId: string, userId: unknown) => {
    if (typeof userId !== 'string') return undefined;
    const user = store.getUserById(userId);
    return user && canAccessCompany(user, companyId) ? user : undefined;
  };

  const memberChat = (req: AuthedRequest, companyId: string, chatId: string): TeamChatRow => {
    requireCompanyAccess(req, companyId);
    const chat = chats.get(chatId);
    if (!chat || chat.companyId !== companyId || !chats.isMember(chat.id, req.user!.id)) {
      throw new HttpError(404, 'Chat not found.');
    }
    return chat;
  };

  const view = (chat: TeamChatRow) => ({
    ...chat,
    members: chats.members(chat.id).map((m) => {
      const user = store.getUserById(m.userId);
      return { userId: m.userId, name: user?.name ?? '', avatar: user?.avatar ?? null, lastReadAt: m.lastReadAt };
    }),
  });

  const tellMembers = (chat: TeamChatRow) =>
    deps.live.publish({ userIds: chats.members(chat.id).map((m) => m.userId), topics: ['team-chat'] });

  const parseBody = (value: unknown) => {
    const body = typeof value === 'string' ? value.trim() : '';
    if (!body) throw new HttpError(400, 'Write a message first.');
    if (body.length > MAX_BODY) throw new HttpError(400, `Messages are limited to ${MAX_BODY} characters.`);
    return body;
  };

  const notifyPhones = async (chat: TeamChatRow, authorId: string, body: string, mentions: string[]) => {
    if (!deps.push) return;
    const author = store.getUserById(authorId);
    const title = chat.kind === 'group' ? `${author?.name ?? ''} · ${chat.name ?? ''}` : author?.name ?? '';
    const now = Date.now();
    for (const member of chats.members(chat.id)) {
      if (member.userId === authorId) continue;
      // Muting a chat silences it, except when someone mentions you by name.
      if (member.muted && !mentions.includes(member.userId)) continue;
      try {
        const prefs = store.getNotificationPrefs(member.userId);
        if (!prefs.messages.push) continue;
        const payload: PushPayload = {
          title,
          body: prefs.pushPreview ? body.slice(0, PREVIEW_CHARS) : '',
          url: `/inbox?team=${chat.id}`,
          tag: `team:${chat.id}`,
          renotify: true,
        };
        if (companyInQuietHours(store, chat.companyId, now)) {
          holdPush(store, 'staff', member.userId, chat.companyId, payload);
          continue;
        }
        await sendToPrincipal(store, deps.push.send, 'staff', member.userId, payload);
      } catch (error) {
        logger.warn('[team-chat] could not push a message', error);
      }
    }
  };

  /** Colleagues of this company, for starting a chat. Names only: no contact details. */
  app.get('/companies/:companyId/team-members', authMiddleware, handler((req, res) => {
    const { companyId } = req.params;
    requireCompanyAccess(req, companyId);
    res.json(
      store.listUsers()
        .filter((u) => canAccessCompany(u, companyId))
        .map((u) => ({ id: u.id, name: u.name, avatar: u.avatar ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }));

  app.get('/companies/:companyId/team-chats', authMiddleware, handler((req, res) => {
    const { companyId } = req.params;
    requireCompanyAccess(req, companyId);
    res.json(chats.listForUser(companyId, req.user!.id).map((c) => ({ ...view(c), unread: c.unread, muted: c.muted, lastMessage: c.lastMessage })));
  }));

  app.get('/companies/:companyId/team-chats/unread-count', authMiddleware, handler((req, res) => {
    const { companyId } = req.params;
    requireCompanyAccess(req, companyId);
    res.json({ count: chats.unreadTotal(companyId, req.user!.id) });
  }));

  app.post('/companies/:companyId/team-chats', authMiddleware, handler((req, res: Response) => {
    const { companyId } = req.params;
    requireCompanyAccess(req, companyId);
    const me = req.user!.id;
    const body = asRecord(req.body, 'body');
    if (body.kind === 'direct') {
      const other = colleague(companyId, body.userId);
      if (!other || other.id === me) throw new HttpError(400, 'Choose a colleague from this company.');
      const { chat, created } = chats.openDirect(companyId, me, other.id);
      if (created) tellMembers(chat);
      return res.status(created ? 201 : 200).json(view(chat));
    }
    if (body.kind === 'group') {
      const name = requiredString(body.name, 'name', { min: 1 }).trim();
      if (!name || name.length > 60) throw new HttpError(400, 'Give the group a name of up to 60 characters.');
      const ids = Array.isArray(body.memberIds) ? body.memberIds : [];
      const members = ids.map((id) => colleague(companyId, id));
      if (members.length === 0 || members.some((m) => !m)) throw new HttpError(400, 'Every member must be a colleague from this company.');
      const chat = chats.createGroup(companyId, me, name, members.map((m) => m!.id).filter((id) => id !== me));
      tellMembers(chat);
      return res.status(201).json(view(chat));
    }
    throw new HttpError(400, 'kind must be direct or group.');
  }));

  app.patch('/companies/:companyId/team-chats/:chatId', authMiddleware, handler((req, res) => {
    const { companyId, chatId } = req.params;
    requireCompanyAccess(req, companyId);
    const chat = memberChat(req, companyId, chatId);
    const me = req.user!.id;
    const body = asRecord(req.body, 'body');
    if (body.muted !== undefined) chats.setMuted(chat.id, me, body.muted === true);
    const manages = body.name !== undefined || body.addMemberIds !== undefined || body.removeMemberIds !== undefined;
    if (manages) {
      // A group is run by whoever started it; a direct chat has nothing to manage.
      if (chat.kind !== 'group' || chat.createdBy !== me) throw new HttpError(403, 'Only the person who started this group can change it.');
      if (body.name !== undefined) {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name || name.length > 60) throw new HttpError(400, 'Give the group a name of up to 60 characters.');
        chats.rename(chat.id, name);
      }
      if (body.addMemberIds !== undefined) {
        const adds = (Array.isArray(body.addMemberIds) ? body.addMemberIds : []).map((id) => colleague(companyId, id));
        if (adds.some((m) => !m)) throw new HttpError(400, 'Every member must be a colleague from this company.');
        chats.addMembers(chat.id, adds.map((m) => m!.id));
      }
      if (body.removeMemberIds !== undefined) {
        const removes = (Array.isArray(body.removeMemberIds) ? body.removeMemberIds : []).filter((id): id is string => typeof id === 'string' && id !== me);
        // The removed hear it too, so their screen drops the chat.
        deps.live.publish({ userIds: removes, topics: ['team-chat'] });
        chats.removeMembers(chat.id, removes);
      }
    }
    const updated = chats.get(chat.id)!;
    tellMembers(updated);
    res.json(view(updated));
  }));

  app.post('/companies/:companyId/team-chats/:chatId/leave', authMiddleware, handler((req, res) => {
    const { companyId, chatId } = req.params;
    requireCompanyAccess(req, companyId);
    const chat = memberChat(req, companyId, chatId);
    if (chat.kind !== 'group') throw new HttpError(400, 'A direct chat cannot be left.');
    chats.removeMembers(chat.id, [req.user!.id]);
    tellMembers(chat);
    res.json({ success: true });
  }));

  app.get('/companies/:companyId/team-chats/:chatId/messages', authMiddleware, handler((req, res) => {
    const { companyId, chatId } = req.params;
    requireCompanyAccess(req, companyId);
    const chat = memberChat(req, companyId, chatId);
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    res.json({ chat: view(chat), members: view(chat).members, messages: chats.messages(chat.id, { before, limit }) });
  }));

  app.post('/companies/:companyId/team-chats/:chatId/messages', authMiddleware, handler((req, res) => {
    const { companyId, chatId } = req.params;
    requireCompanyAccess(req, companyId);
    const chat = memberChat(req, companyId, chatId);
    const body = asRecord(req.body, 'body');
    const text = parseBody(body.body);
    const memberIds = new Set(chats.members(chat.id).map((m) => m.userId));
    const mentions = (Array.isArray(body.mentionIds) ? body.mentionIds : []).filter((id): id is string => typeof id === 'string' && memberIds.has(id));
    const message = chats.post(chat, req.user!.id, text, mentions);
    tellMembers(chat);
    void notifyPhones(chat, req.user!.id, text, mentions);
    res.status(201).json(message);
  }));

  const ownRecentMessage = (req: AuthedRequest, chat: TeamChatRow, messageId: string) => {
    const message = chats.rawMessage(messageId);
    if (!message || message.chatId !== chat.id || message.deletedAt) throw new HttpError(404, 'Message not found.');
    if (message.authorUserId !== req.user!.id) throw new HttpError(403, 'Only the author can change a message.');
    if (Date.now() - Date.parse(message.createdAt) > EDIT_WINDOW_MS) throw new HttpError(409, 'Messages can be changed for 15 minutes after sending.');
    return message;
  };

  app.patch('/companies/:companyId/team-chats/:chatId/messages/:messageId', authMiddleware, handler((req, res) => {
    const { companyId, chatId, messageId } = req.params;
    requireCompanyAccess(req, companyId);
    const chat = memberChat(req, companyId, chatId);
    ownRecentMessage(req, chat, messageId);
    const updated = chats.edit(messageId, parseBody(asRecord(req.body, 'body').body));
    tellMembers(chat);
    res.json(updated);
  }));

  app.delete('/companies/:companyId/team-chats/:chatId/messages/:messageId', authMiddleware, handler((req, res) => {
    const { companyId, chatId, messageId } = req.params;
    requireCompanyAccess(req, companyId);
    const chat = memberChat(req, companyId, chatId);
    ownRecentMessage(req, chat, messageId);
    const removed = chats.remove(messageId);
    tellMembers(chat);
    res.json(removed);
  }));

  app.post('/companies/:companyId/team-chats/:chatId/read', authMiddleware, handler((req, res) => {
    const { companyId, chatId } = req.params;
    requireCompanyAccess(req, companyId);
    const chat = memberChat(req, companyId, chatId);
    chats.markRead(chat.id, req.user!.id);
    // The others' "seen" marks update.
    tellMembers(chat);
    res.json({ success: true });
  }));
  return app;
}
