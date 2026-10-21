'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, BellOff, Check, CheckCheck, MoreVertical, Pencil, Plus, Search, Send, Settings2, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useLiveRefresh } from '@/lib/live';
import { cn } from '@/lib/utils';
import {
  createGroupChat, deleteTeamMessage, editTeamMessage, getTeamMembers, getTeamMessages, leaveTeamChat, listTeamChats,
  markTeamChatRead, openDirectChat, sendTeamMessage, updateTeamChat,
  type TeamChat, type TeamChatMemberView, type TeamChatMessage, type TeamMember,
} from '@/services/teamChatService';
import { InboxModeSwitch } from './inbox-mode-switch';

/** Fills the space between the top bar and, on phones, the bottom tab bar. */
export const INBOX_HEIGHT = 'h-[calc(100dvh-10rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-7rem)]';
const EDIT_WINDOW_MS = 15 * 60 * 1000;

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';

function Avatar({ name, group, className }: { name: string; group?: boolean; className?: string }) {
  return (
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary', className)} aria-hidden>
      {group ? <Users className="h-4 w-4" /> : initials(name)}
    </span>
  );
}

export function TeamChatPage({ showClients }: { showClients: boolean }) {
  const { language } = useI18n();
  const ar = language === 'ar';
  const tr = (en: string, arText: string) => (ar ? arText : en);
  const { selectedCompany, currentUser } = useCompany();
  const companyId = selectedCompany?.id ?? '';
  const me = currentUser?.id ?? '';
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const chatId = params.get('team');

  const [chats, setChats] = React.useState<TeamChat[] | null>(null);
  const [query, setQuery] = React.useState('');
  const [creating, setCreating] = React.useState(false);

  const loadChats = React.useCallback(async () => {
    if (!companyId) return;
    setChats(await listTeamChats(companyId).catch(() => []));
  }, [companyId]);
  React.useEffect(() => { setChats(null); void loadChats(); }, [loadChats]);
  useLiveRefresh(['team-chat'], loadChats);

  const open = (id: string | null) => router.replace(id ? `${pathname}?tab=team&team=${encodeURIComponent(id)}` : `${pathname}?tab=team`);

  const titleOf = React.useCallback((chat: TeamChat) =>
    chat.kind === 'group' ? chat.name ?? '' : chat.members.find((m) => m.userId !== me)?.name ?? tr('Colleague', 'زميل'),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [me, ar]);

  const time = (iso: string) => {
    const d = new Date(iso);
    const today = new Date().toDateString() === d.toDateString();
    return new Intl.DateTimeFormat(ar ? 'ar-OM' : 'en-GB', today ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' }).format(d);
  };

  const shown = (chats ?? []).filter((c) => !query.trim() || titleOf(c).toLowerCase().includes(query.trim().toLowerCase()));
  const active = chats?.find((c) => c.id === chatId) ?? null;

  return (
    <div className={cn('flex w-full min-w-0 overflow-hidden border-y bg-background sm:rounded-lg sm:border', INBOX_HEIGHT, 'min-h-[24rem]')}>
      <aside className={cn('flex min-h-0 w-full shrink-0 flex-col border-e lg:w-80', chatId && 'hidden lg:flex')}>
        <div className="space-y-2 border-b p-3">
          <InboxModeSwitch mode="team" showClients={showClients} />
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute start-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('Search chats', 'ابحث في المحادثات')} className="h-8 ps-8 text-sm" aria-label={tr('Search chats', 'ابحث في المحادثات')} />
            </div>
            <Button size="sm" className="h-8 gap-1" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />{tr('New', 'جديدة')}
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {chats === null ? (
            <p className="p-4 text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>
          ) : shown.length === 0 ? (
            <div className="space-y-3 p-6 text-center text-sm text-muted-foreground">
              <p>{query ? tr('No chats match.', 'لا توجد محادثات مطابقة.') : tr('No chats yet. Start one with a colleague or a team.', 'لا توجد محادثات بعد. ابدأ محادثة مع زميل أو مجموعة.')}</p>
              {!query && <Button size="sm" variant="outline" onClick={() => setCreating(true)}>{tr('Start a chat', 'ابدأ محادثة')}</Button>}
            </div>
          ) : (
            <ul>
              {shown.map((chat) => {
                const last = chat.lastMessage;
                const preview = last
                  ? last.deletedAt
                    ? tr('Message deleted', 'رسالة محذوفة')
                    : `${last.authorUserId === me ? tr('You: ', 'أنت: ') : chat.kind === 'group' ? `${chat.members.find((m) => m.userId === last.authorUserId)?.name.split(' ')[0] ?? ''}: ` : ''}${last.body}`
                  : tr('No messages yet', 'لا توجد رسائل بعد');
                return (
                  <li key={chat.id}>
                    <button
                      type="button"
                      onClick={() => open(chat.id)}
                      aria-current={chat.id === chatId ? 'true' : undefined}
                      className={cn('flex w-full items-center gap-3 border-b px-3 py-2.5 text-start transition-colors hover:bg-muted/60', chat.id === chatId && 'bg-muted')}
                    >
                      <Avatar name={titleOf(chat)} group={chat.kind === 'group'} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className={cn('truncate text-sm', chat.unread ? 'font-semibold' : 'font-medium')}><bdi>{titleOf(chat)}</bdi></span>
                          {chat.muted && <BellOff className="h-3 w-3 shrink-0 text-muted-foreground" aria-label={tr('Muted', 'مكتومة')} />}
                          <span className="ms-auto shrink-0 text-[11px] text-muted-foreground">{time(chat.lastMessageAt ?? chat.createdAt)}</span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-2">
                          <span className={cn('truncate text-xs', chat.unread ? 'text-foreground' : 'text-muted-foreground')}><bdi>{preview}</bdi></span>
                          {!!chat.unread && (
                            <span className="ms-auto flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                              {chat.unread > 99 ? '99+' : chat.unread}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <section className={cn('min-w-0 flex-1 flex-col', chatId ? 'flex' : 'hidden lg:flex')} aria-label={tr('Chat', 'المحادثة')}>
        {chatId ? (
          <ChatView
            key={chatId}
            companyId={companyId}
            chatId={chatId}
            me={me}
            fallbackTitle={active ? titleOf(active) : ''}
            titleOf={titleOf}
            onBack={() => open(null)}
            onLeft={() => { open(null); void loadChats(); }}
            onChanged={loadChats}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
            {tr('Pick a chat, or start a new one.', 'اختر محادثة أو ابدأ محادثة جديدة.')}
          </div>
        )}
      </section>

      <NewChatDialog
        open={creating}
        onOpenChange={setCreating}
        companyId={companyId}
        me={me}
        onOpened={(chat) => { setCreating(false); void loadChats(); open(chat.id); }}
      />
    </div>
  );
}

function ChatView({
  companyId, chatId, me, fallbackTitle, titleOf, onBack, onLeft, onChanged,
}: {
  companyId: string; chatId: string; me: string; fallbackTitle: string;
  titleOf: (chat: TeamChat) => string;
  onBack: () => void; onLeft: () => void; onChanged: () => void;
}) {
  const { language } = useI18n();
  const ar = language === 'ar';
  const tr = (en: string, arText: string) => (ar ? arText : en);
  const { toast } = useToast();
  const confirm = useConfirm();
  const [chat, setChat] = React.useState<TeamChat | null>(null);
  const [members, setMembers] = React.useState<TeamChatMemberView[]>([]);
  const [messages, setMessages] = React.useState<TeamChatMessage[] | null>(null);
  const [gone, setGone] = React.useState(false);
  const [more, setMore] = React.useState(false);
  const [editing, setEditing] = React.useState<TeamChatMessage | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());
  const end = React.useRef<HTMLDivElement>(null);
  const readUpTo = React.useRef<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const r = await getTeamMessages(companyId, chatId);
      setChat(r.chat);
      setMembers(r.members);
      // Keep older pages already loaded; replace the newest page.
      setMessages((prev) => {
        if (!prev || prev.length <= r.messages.length) return r.messages;
        const firstNew = r.messages[0]?.createdAt;
        return [...prev.filter((m) => firstNew && m.createdAt < firstNew), ...r.messages];
      });
      setMore((prev) => prev || r.messages.length >= 50);
      setNow(Date.now());
    } catch {
      setGone(true);
    }
  }, [companyId, chatId]);

  React.useEffect(() => { void load(); }, [load]);
  useLiveRefresh(['team-chat'], load);
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  // Reading the chat marks it read, once per newest message from someone else.
  React.useEffect(() => {
    if (!messages?.length) return;
    const newestOther = [...messages].reverse().find((m) => m.authorUserId !== me);
    if (!newestOther || readUpTo.current === newestOther.id || document.visibilityState !== 'visible') return;
    const mine = members.find((m) => m.userId === me);
    readUpTo.current = newestOther.id;
    if (mine?.lastReadAt && mine.lastReadAt >= newestOther.createdAt) return;
    void markTeamChatRead(companyId, chatId).then(onChanged).catch(() => undefined);
  }, [messages, members, me, companyId, chatId, onChanged]);

  React.useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages?.length]);

  const loadOlder = async () => {
    const first = messages?.[0];
    if (!first) return;
    const r = await getTeamMessages(companyId, chatId, first.createdAt).catch(() => null);
    if (!r) return;
    setMessages((prev) => [...r.messages, ...(prev ?? [])]);
    setMore(r.messages.length >= 50);
  };

  const nameOf = (userId: string) => members.find((m) => m.userId === userId)?.name ?? tr('Former member', 'عضو سابق');
  const title = chat ? titleOf(chat) : fallbackTitle;
  const editable = (m: TeamChatMessage) => m.authorUserId === me && !m.deletedAt && now - Date.parse(m.createdAt) < EDIT_WINDOW_MS;

  const send = async (body: string, mentionIds: string[]) => {
    if (editing) {
      await editTeamMessage(companyId, chatId, editing.id, body);
      setEditing(null);
    } else {
      await sendTeamMessage(companyId, chatId, body, mentionIds);
    }
    await load();
    onChanged();
  };

  const remove = async (m: TeamChatMessage) => {
    const ok = await confirm({
      title: tr('Delete this message?', 'حذف هذه الرسالة؟'),
      description: tr('Everyone in the chat will see that a message was deleted.', 'سيرى أعضاء المحادثة أن رسالة حُذفت.'),
      confirmText: tr('Delete', 'حذف'),
      cancelText: tr('Cancel', 'إلغاء'),
    });
    if (!ok) return;
    try { await deleteTeamMessage(companyId, chatId, m.id); await load(); onChanged(); }
    catch (e) { toast({ variant: 'destructive', title: e instanceof Error ? e.message : tr('Could not delete', 'تعذّر الحذف') }); }
  };

  if (gone) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
        <p>{tr('This chat is not available.', 'هذه المحادثة غير متاحة.')}</p>
        <Button variant="outline" size="sm" onClick={onBack}>{tr('Back to chats', 'العودة للمحادثات')}</Button>
      </div>
    );
  }

  const others = members.filter((m) => m.userId !== me);
  const lastMine = messages ? [...messages].reverse().find((m) => m.authorUserId === me && !m.deletedAt) : undefined;
  const seenBy = lastMine ? others.filter((m) => m.lastReadAt && m.lastReadAt >= lastMine.createdAt) : [];
  const dayOf = (iso: string) => new Date(iso).toDateString();
  const dayLabel = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86_400_000);
    if (d.toDateString() === today.toDateString()) return tr('Today', 'اليوم');
    if (d.toDateString() === yesterday.toDateString()) return tr('Yesterday', 'أمس');
    return new Intl.DateTimeFormat(ar ? 'ar-OM' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  };
  const clock = (iso: string) => new Intl.DateTimeFormat(ar ? 'ar-OM' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

  return (
    <>
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden" onClick={onBack} aria-label={tr('Back to chats', 'العودة للمحادثات')}>
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <Avatar name={title} group={chat?.kind === 'group'} className="h-8 w-8" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold"><bdi>{title || '…'}</bdi></p>
          {chat?.kind === 'group' && (
            <p className="truncate text-xs text-muted-foreground">{members.map((m) => (m.userId === me ? tr('You', 'أنت') : m.name.split(' ')[0])).join('، ')}</p>
          )}
        </div>
        {chat && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSettingsOpen(true)} aria-label={tr('Chat settings', 'إعدادات المحادثة')}>
            <Settings2 className="h-4 w-4" />
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {more && (
          <div className="flex justify-center pb-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void loadOlder()}>{tr('Older messages', 'رسائل أقدم')}</Button>
          </div>
        )}
        {messages === null ? (
          <p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{tr('Say hello 👋', 'ابدأ بالتحية 👋')}</p>
        ) : (
          messages.map((m, i) => {
            const mine = m.authorUserId === me;
            const prev = messages[i - 1];
            const newDay = !prev || dayOf(prev.createdAt) !== dayOf(m.createdAt);
            const showAuthor = chat?.kind === 'group' && !mine && (newDay || prev?.authorUserId !== m.authorUserId);
            return (
              <React.Fragment key={m.id}>
                {newDay && (
                  <div className="flex justify-center py-2">
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">{dayLabel(m.createdAt)}</span>
                  </div>
                )}
                <div className={cn('group flex items-end gap-1', mine ? 'justify-end' : 'justify-start')}>
                  {mine && editable(m) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-60 hover:opacity-100 md:opacity-0 md:group-hover:opacity-100" aria-label={tr('Message options', 'خيارات الرسالة')}>
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={mine ? 'end' : 'start'}>
                        <DropdownMenuItem onClick={() => setEditing(m)} className="gap-2"><Pencil className="h-3.5 w-3.5" />{tr('Edit', 'تعديل')}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void remove(m)} className="gap-2 text-destructive"><Trash2 className="h-3.5 w-3.5" />{tr('Delete', 'حذف')}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <div
                    id={`team-message-${m.id}`}
                    className={cn(
                      'max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm',
                      mine ? 'rounded-ee-sm bg-primary text-primary-foreground' : 'rounded-ss-sm bg-muted text-foreground',
                      m.deletedAt && 'italic opacity-70',
                    )}
                  >
                    {showAuthor && <p className="mb-0.5 text-[11px] font-semibold text-primary"><bdi>{nameOf(m.authorUserId)}</bdi></p>}
                    {m.deletedAt ? tr('Message deleted', 'رسالة محذوفة') : <bdi>{m.body}</bdi>}
                    <span className={cn('ms-2 inline-flex items-center gap-1 align-bottom text-[10px]', mine ? 'text-primary-foreground/75' : 'text-muted-foreground')}>
                      {m.editedAt && !m.deletedAt && tr('edited', 'معدّلة')}
                      {clock(m.createdAt)}
                      {mine && m.id === lastMine?.id && (seenBy.length > 0 ? <CheckCheck className="h-3 w-3" aria-label={tr('Seen', 'شوهدت')} /> : <Check className="h-3 w-3" aria-label={tr('Sent', 'أُرسلت')} />)}
                    </span>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
        {lastMine && seenBy.length > 0 && chat?.kind === 'group' && (
          <p className="text-end text-[11px] text-muted-foreground">{tr(`Seen by ${seenBy.length}`, `شاهدها ${seenBy.length}`)}</p>
        )}
        <div ref={end} />
      </div>

      <Composer
        key={editing?.id ?? 'new'}
        members={others}
        initial={editing?.body ?? ''}
        editing={!!editing}
        onCancelEdit={() => setEditing(null)}
        onSend={send}
      />

      {chat && (
        <ChatSettings
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          chat={chat}
          me={me}
          companyId={companyId}
          onChanged={() => { void load(); onChanged(); }}
          onLeft={onLeft}
        />
      )}
    </>
  );
}

function Composer({
  members, initial, editing, onCancelEdit, onSend,
}: {
  members: TeamChatMemberView[]; initial: string; editing: boolean;
  onCancelEdit: () => void; onSend: (body: string, mentionIds: string[]) => Promise<void>;
}) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [text, setText] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [mentioned, setMentioned] = React.useState<Record<string, string>>({});
  const area = React.useRef<HTMLTextAreaElement>(null);

  // "@" followed by letters at the end of what is typed opens the people list.
  const at = /(?:^|\s)@([^\s@]*)$/.exec(text);
  const suggestions = at ? members.filter((m) => m.name.toLowerCase().includes(at[1].toLowerCase())).slice(0, 5) : [];

  const pick = (m: TeamChatMemberView) => {
    setText((t) => t.replace(/@([^\s@]*)$/, `@${m.name} `));
    setMentioned((x) => ({ ...x, [m.userId]: m.name }));
    area.current?.focus();
  };

  const submit = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const mentionIds = Object.entries(mentioned).filter(([, name]) => body.includes(`@${name}`)).map(([id]) => id);
      await onSend(body, mentionIds);
      setText('');
      setMentioned({});
    } catch (e) {
      toast({ variant: 'destructive', title: e instanceof Error ? e.message : tr('Could not send', 'تعذّر الإرسال') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative border-t p-2">
      {suggestions.length > 0 && (
        <ul className="absolute bottom-full start-2 mb-1 w-64 overflow-hidden rounded-md border bg-popover shadow-md" role="listbox">
          {suggestions.map((m) => (
            <li key={m.userId}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(m); }} className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-muted">
                <Avatar name={m.name} className="h-6 w-6 text-[10px]" /><bdi>{m.name}</bdi>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <div className="mb-1 flex items-center justify-between rounded-md bg-muted px-2 py-1 text-xs">
          <span>{tr('Editing your message', 'تعديل رسالتك')}</span>
          <button type="button" className="font-medium text-primary" onClick={onCancelEdit}>{tr('Cancel', 'إلغاء')}</button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          ref={area}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter starts a new line.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (suggestions.length > 0) pick(suggestions[0]);
              else void submit();
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder={tr('Write a message… (@ to mention)', 'اكتب رسالة… (@ للإشارة لزميل)')}
          className="max-h-32 min-h-[2.5rem] resize-none text-sm"
          aria-label={tr('Message', 'الرسالة')}
        />
        <Button size="icon" className="h-10 w-10 shrink-0" onClick={() => void submit()} disabled={busy || !text.trim()} aria-label={tr('Send', 'إرسال')}>
          <Send className="h-4 w-4 rtl:-scale-x-100" />
        </Button>
      </div>
    </div>
  );
}

function PeoplePicker({
  people, selected, onToggle, multi,
}: { people: TeamMember[]; selected: Set<string>; onToggle: (id: string) => void; multi: boolean }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [q, setQ] = React.useState('');
  const shown = people.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="space-y-2">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search colleagues', 'ابحث عن زميل')} className="h-9" />
      <ul className="max-h-64 overflow-y-auto rounded-md border">
        {shown.length === 0 && <li className="p-3 text-sm text-muted-foreground">{tr('Nobody matches.', 'لا يوجد أحد مطابق.')}</li>}
        {shown.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onToggle(p.id)} className={cn('flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-muted', selected.has(p.id) && 'bg-primary/10')}>
              <Avatar name={p.name} className="h-7 w-7 text-[10px]" />
              <bdi className="flex-1">{p.name}</bdi>
              {multi && selected.has(p.id) && <Check className="h-4 w-4 text-primary" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewChatDialog({
  open, onOpenChange, companyId, me, onOpened,
}: { open: boolean; onOpenChange: (v: boolean) => void; companyId: string; me: string; onOpened: (chat: TeamChat) => void }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [people, setPeople] = React.useState<TeamMember[]>([]);
  const [mode, setMode] = React.useState<'direct' | 'group'>('direct');
  const [name, setName] = React.useState('');
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open || !companyId) return;
    setMode('direct'); setName(''); setPicked(new Set());
    getTeamMembers(companyId).then((list) => setPeople(list.filter((p) => p.id !== me))).catch(() => setPeople([]));
  }, [open, companyId, me]);

  const startDirect = async (id: string) => {
    setBusy(true);
    try { onOpened(await openDirectChat(companyId, id)); }
    catch (e) { toast({ variant: 'destructive', title: e instanceof Error ? e.message : tr('Could not start the chat', 'تعذّر بدء المحادثة') }); }
    finally { setBusy(false); }
  };
  const createGroup = async () => {
    setBusy(true);
    try { onOpened(await createGroupChat(companyId, name.trim(), [...picked])); }
    catch (e) { toast({ variant: 'destructive', title: e instanceof Error ? e.message : tr('Could not create the group', 'تعذّر إنشاء المجموعة') }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tr('New chat', 'محادثة جديدة')}</DialogTitle>
          <DialogDescription>{tr('Only the people in a chat can read it.', 'لا يقرأ المحادثة إلا أعضاؤها.')}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {(['direct', 'group'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={cn('flex-1 rounded-md px-3 py-1.5 text-sm font-medium', mode === m ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
              {m === 'direct' ? tr('A colleague', 'زميل') : tr('A group', 'مجموعة')}
            </button>
          ))}
        </div>
        {mode === 'direct' ? (
          <PeoplePicker people={people} selected={new Set()} multi={false} onToggle={(id) => { if (!busy) void startDirect(id); }} />
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">{tr('Group name', 'اسم المجموعة')}</Label>
              <Input id="group-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={tr('e.g. Sales team', 'مثال: فريق المبيعات')} />
            </div>
            <PeoplePicker people={people} selected={picked} multi onToggle={(id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} />
            <DialogFooter>
              <Button onClick={() => void createGroup()} disabled={busy || !name.trim() || picked.size === 0}>
                {tr(`Create group (${picked.size + 1})`, `إنشاء المجموعة (${picked.size + 1})`)}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChatSettings({
  open, onOpenChange, chat, me, companyId, onChanged, onLeft,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; chat: TeamChat; me: string; companyId: string;
  onChanged: () => void; onLeft: () => void;
}) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const confirm = useConfirm();
  const owner = chat.kind === 'group' && chat.createdBy === me;
  const [name, setName] = React.useState(chat.name ?? '');
  const [people, setPeople] = React.useState<TeamMember[]>([]);
  const [adding, setAdding] = React.useState(false);
  const muted = React.useRef(false);
  const [mutedState, setMutedState] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(chat.name ?? '');
    setAdding(false);
    listTeamChats(companyId).then((all) => {
      const mine = all.find((c) => c.id === chat.id);
      muted.current = !!mine?.muted;
      setMutedState(!!mine?.muted);
    }).catch(() => undefined);
    if (owner) getTeamMembers(companyId).then(setPeople).catch(() => setPeople([]));
  }, [open, chat, companyId, owner]);

  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); onChanged(); }
    catch (e) { toast({ variant: 'destructive', title: e instanceof Error ? e.message : tr('That did not work', 'لم تنجح العملية') }); }
  };

  const memberIds = new Set(chat.members.map((m) => m.userId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{chat.kind === 'group' ? tr('Group settings', 'إعدادات المجموعة') : tr('Chat settings', 'إعدادات المحادثة')}</DialogTitle>
          <DialogDescription className="sr-only">{tr('Mute, members and name', 'الكتم والأعضاء والاسم')}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label htmlFor="mute" className="text-sm">{tr('Mute notifications', 'كتم الإشعارات')}</Label>
            <p className="text-xs text-muted-foreground">{tr('You still hear when someone mentions you.', 'يصلك التنبيه إذا أشار إليك أحد.')}</p>
          </div>
          <Switch id="mute" checked={mutedState} onCheckedChange={(v) => { setMutedState(v); void run(() => updateTeamChat(companyId, chat.id, { muted: v })); }} />
        </div>

        {chat.kind === 'group' && (
          <div className="space-y-3">
            {owner && (
              <div className="flex gap-2">
                <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label={tr('Group name', 'اسم المجموعة')} />
                <Button variant="outline" disabled={!name.trim() || name.trim() === chat.name} onClick={() => void run(() => updateTeamChat(companyId, chat.id, { name: name.trim() }))}>
                  {tr('Rename', 'إعادة التسمية')}
                </Button>
              </div>
            )}
            <div>
              <p className="mb-1 text-sm font-medium">{tr(`Members (${chat.members.length})`, `الأعضاء (${chat.members.length})`)}</p>
              <ul className="max-h-48 overflow-y-auto rounded-md border">
                {chat.members.map((m) => (
                  <li key={m.userId} className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-0">
                    <Avatar name={m.name} className="h-7 w-7 text-[10px]" />
                    <bdi className="flex-1">{m.name}{m.userId === me ? ` (${tr('you', 'أنت')})` : ''}{m.userId === chat.createdBy ? ` · ${tr('started the group', 'أنشأ المجموعة')}` : ''}</bdi>
                    {owner && m.userId !== me && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => void run(() => updateTeamChat(companyId, chat.id, { removeMemberIds: [m.userId] }))}>
                        {tr('Remove', 'إزالة')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            {owner && (adding ? (
              <PeoplePicker
                people={people.filter((p) => !memberIds.has(p.id))}
                selected={new Set()}
                multi={false}
                onToggle={(id) => void run(() => updateTeamChat(companyId, chat.id, { addMemberIds: [id] }))}
              />
            ) : (
              <Button variant="outline" size="sm" onClick={() => setAdding(true)}><Plus className="me-1 h-4 w-4" />{tr('Add people', 'إضافة أعضاء')}</Button>
            ))}
            {!owner && (
              <Button
                variant="outline"
                className="w-full text-destructive"
                onClick={async () => {
                  const ok = await confirm({ title: tr('Leave this group?', 'مغادرة المجموعة؟'), description: tr('You will stop seeing its messages.', 'لن تصلك رسائلها بعد ذلك.'), confirmText: tr('Leave', 'مغادرة'), cancelText: tr('Cancel', 'إلغاء') });
                  if (!ok) return;
                  try { await leaveTeamChat(companyId, chat.id); onOpenChange(false); onLeft(); }
                  catch (e) { toast({ variant: 'destructive', title: e instanceof Error ? e.message : tr('Could not leave', 'تعذّرت المغادرة') }); }
                }}
              >
                {tr('Leave group', 'مغادرة المجموعة')}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
