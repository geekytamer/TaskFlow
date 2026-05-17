'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import {
  getWhatsappChats,
  getWhatsappInstance,
  getWhatsappMessages,
  markWhatsappChatRead,
  openWhatsappChat,
  sendWhatsappMessage,
  syncWhatsappChatHistory,
  type WhatsAppChatSummary,
  type WhatsAppInstance,
  type WhatsAppMessage,
} from '@/services/whatsappService';
import {
  Check,
  CheckCheck,
  History,
  MessageSquarePlus,
  Phone,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react';

// --- visual helpers ---

const initialsFor = (label: string) => {
  const parts = label.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const avatarHue = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
};

const formatPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 11) {
    return `+${digits.slice(0, digits.length - 9)} ${digits.slice(-9, -6)} ${digits.slice(-6, -3)} ${digits.slice(-3)}`;
  }
  if (digits.length >= 8) {
    return `+${digits}`;
  }
  return phone;
};

const formatTime = (iso: string | Date | undefined, locale: string) => {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(d);
};

const formatDateLabel = (iso: string, locale: string, t: (k: string) => string) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return t('whatsapp.today');
  if (sameDay(d, yesterday)) return t('whatsapp.yesterday');
  const diffDays = (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 7) {
    return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(d);
  }
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
};

const formatChatPreviewTime = (iso: string, locale: string, t: (k: string) => string) => {
  const d = new Date(iso);
  const today = new Date();
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(d);
  }
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return t('whatsapp.yesterday');
  }
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(d);
};

interface MessageGroup {
  dateKey: string;
  messages: WhatsAppMessage[];
}

const groupMessagesByDate = (messages: WhatsAppMessage[]): MessageGroup[] => {
  const groups: MessageGroup[] = [];
  messages.forEach((m) => {
    const ts = m.sentAt || m.receivedAt || m.createdAt;
    const key = new Date(ts).toDateString();
    const last = groups[groups.length - 1];
    if (!last || last.dateKey !== key) {
      groups.push({ dateKey: key, messages: [m] });
    } else {
      last.messages.push(m);
    }
  });
  return groups;
};

const StatusTicks = ({ status }: { status: WhatsAppMessage['status'] }) => {
  if (status === 'pending') return <span className="text-[10px] opacity-70">⏱</span>;
  if (status === 'failed') return <span className="text-[10px] text-red-500">!</span>;
  if (status === 'sent') return <Check className="h-3.5 w-3.5 opacity-70" />;
  if (status === 'delivered') return <CheckCheck className="h-3.5 w-3.5 opacity-70" />;
  if (status === 'read') return <CheckCheck className="h-3.5 w-3.5 text-sky-500" />;
  return null;
};

const Avatar = ({ label, size = 40 }: { label: string; size?: number }) => {
  const hue = avatarHue(label || 'x');
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: `hsl(${hue}, 55%, 50%)`,
        fontSize: size * 0.4,
      }}
    >
      {initialsFor(label || '?')}
    </div>
  );
};

// --- main page ---

export function WhatsappInboxPage() {
  const { selectedCompany } = useCompany();
  const { t, language } = useI18n();
  const { toast } = useToast();
  const locale = language === 'ar' ? 'ar' : 'en-US';

  const [instance, setInstance] = React.useState<WhatsAppInstance | null>(null);
  const [chats, setChats] = React.useState<WhatsAppChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<WhatsAppMessage[]>([]);
  const [search, setSearch] = React.useState('');
  const [composing, setComposing] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [loadingChats, setLoadingChats] = React.useState(false);
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [syncingHistory, setSyncingHistory] = React.useState(false);
  const [newChatOpen, setNewChatOpen] = React.useState(false);
  const [newChatPhone, setNewChatPhone] = React.useState('');
  const [historyAttemptedFor, setHistoryAttemptedFor] = React.useState<Set<string>>(new Set());

  const threadRef = React.useRef<HTMLDivElement>(null);
  const composerRef = React.useRef<HTMLTextAreaElement>(null);
  const companyId = selectedCompany?.id;

  const activeChat = chats.find((c) => c.chatId === activeChatId) || null;

  // --- data loaders ---

  const loadInstance = React.useCallback(async () => {
    if (!companyId) return;
    try {
      const data = await getWhatsappInstance(companyId);
      setInstance(data);
    } catch {
      /* ignore */
    }
  }, [companyId]);

  const loadChats = React.useCallback(async () => {
    if (!companyId) return;
    setLoadingChats(true);
    try {
      const list = await getWhatsappChats(companyId);
      setChats(list);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('whatsapp.inboxLoadFailedTitle'),
        description: error?.message,
      });
    } finally {
      setLoadingChats(false);
    }
  }, [companyId, toast, t]);

  const loadMessages = React.useCallback(
    async (chatId: string, opts: { silent?: boolean } = {}) => {
      if (!companyId) return;
      if (!opts.silent) setLoadingMessages(true);
      try {
        const phone = chatId.replace(/@c\.us$/, '');
        const list = await getWhatsappMessages(companyId, { phone, limit: 500 });
        // server returns newest-first; we render oldest-first
        setMessages(list.slice().reverse());
      } catch (error: any) {
        if (!opts.silent) {
          toast({
            variant: 'destructive',
            title: t('whatsapp.threadLoadFailedTitle'),
            description: error?.message,
          });
        }
      } finally {
        if (!opts.silent) setLoadingMessages(false);
      }
    },
    [companyId, toast, t],
  );

  // --- effects ---

  React.useEffect(() => {
    loadInstance();
    loadChats();
  }, [loadInstance, loadChats]);

  // Poll chat list every 12s
  React.useEffect(() => {
    if (!companyId) return;
    const id = window.setInterval(() => {
      loadChats();
    }, 12000);
    return () => window.clearInterval(id);
  }, [companyId, loadChats]);

  // When opening a chat: mark read, sync history once, load thread
  React.useEffect(() => {
    if (!activeChatId || !companyId) return;
    loadMessages(activeChatId);
    markWhatsappChatRead(companyId, activeChatId).catch(() => undefined);

    if (instance?.state === 'authorized' && !historyAttemptedFor.has(activeChatId)) {
      setHistoryAttemptedFor((prev) => new Set(prev).add(activeChatId));
      syncWhatsappChatHistory(companyId, activeChatId, 100)
        .then((res) => {
          if (res.inserted > 0) {
            loadMessages(activeChatId, { silent: true });
            loadChats();
          }
        })
        .catch(() => undefined);
    }
  }, [activeChatId, companyId, instance?.state, historyAttemptedFor, loadMessages, loadChats]);

  // Poll active thread every 5s
  React.useEffect(() => {
    if (!activeChatId || !companyId) return;
    const id = window.setInterval(() => {
      loadMessages(activeChatId, { silent: true });
    }, 5000);
    return () => window.clearInterval(id);
  }, [activeChatId, companyId, loadMessages]);

  // Autoscroll to bottom when messages change
  React.useEffect(() => {
    if (!threadRef.current) return;
    const el = threadRef.current;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [activeChatId, messages.length]);

  // --- actions ---

  const handleSend = async () => {
    if (!companyId || !activeChat || !composing.trim()) return;
    const text = composing.trim();
    setSending(true);
    setComposing('');
    try {
      await sendWhatsappMessage(companyId, {
        phone: activeChat.phone,
        message: text,
        contactId: activeChat.contactId,
      });
      await loadMessages(activeChat.chatId, { silent: true });
      await loadChats();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('whatsapp.sendFailedTitle'),
        description: error?.message || t('whatsapp.sendFailedDescription'),
      });
      setComposing(text);
    } finally {
      setSending(false);
      composerRef.current?.focus();
    }
  };

  const handleLoadEarlier = async () => {
    if (!companyId || !activeChat) return;
    setSyncingHistory(true);
    try {
      const res = await syncWhatsappChatHistory(companyId, activeChat.chatId, 100);
      await loadMessages(activeChat.chatId, { silent: true });
      toast({
        title: t('whatsapp.historyLoadedTitle'),
        description: `+${res.inserted} ${t('whatsapp.historyLoadedDescription')}`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('whatsapp.historyFailedTitle'),
        description: error?.message || t('whatsapp.historyFailedDescription'),
      });
    } finally {
      setSyncingHistory(false);
    }
  };

  const handleOpenNewChat = async () => {
    if (!companyId || !newChatPhone.trim()) return;
    try {
      const res = await openWhatsappChat(companyId, newChatPhone.trim());
      setNewChatOpen(false);
      setNewChatPhone('');
      await loadChats();
      setActiveChatId(res.chatId);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('whatsapp.newChatFailedTitle'),
        description: error?.message || t('whatsapp.newChatFailedDescription'),
      });
    }
  };

  // --- filtered chat list ---

  const filteredChats = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) =>
      [c.contactName, c.phone, c.lastMessageBody]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [chats, search]);

  const messageGroups = React.useMemo(() => groupMessagesByDate(messages), [messages]);

  // --- gates ---

  if (!companyId) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-muted-foreground">
        {t('whatsapp.selectCompany')}
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-lg font-semibold">{t('whatsapp.inboxNotConfiguredTitle')}</p>
        <p className="max-w-md text-muted-foreground">{t('whatsapp.inboxNotConfiguredDescription')}</p>
        <a href="/settings" className="text-primary underline underline-offset-4">
          {t('whatsapp.goToSettings')}
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] overflow-hidden rounded-lg border bg-card shadow-sm">
      {/* Left rail: chat list */}
      <aside className="flex w-80 shrink-0 flex-col border-e bg-card">
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <div>
            <h2 className="text-base font-semibold">{t('whatsapp.inboxTitle')}</h2>
            <p className="text-xs text-muted-foreground">
              {instance.phoneNumber ? formatPhone(instance.phoneNumber) : t(`whatsapp.state.${instance.state}` as any)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={loadChats} title={t('whatsapp.refreshChats')}>
              <RefreshCw className={`h-4 w-4 ${loadingChats ? 'animate-spin' : ''}`} />
            </Button>
            <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" title={t('whatsapp.newChat')}>
                  <MessageSquarePlus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('whatsapp.newChatTitle')}</DialogTitle>
                  <DialogDescription>{t('whatsapp.newChatDescription')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-2">
                  <Label>{t('whatsapp.recipient')}</Label>
                  <Input
                    value={newChatPhone}
                    onChange={(e) => setNewChatPhone(e.target.value)}
                    placeholder="+971501234567"
                    autoFocus
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setNewChatOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button onClick={handleOpenNewChat} disabled={!newChatPhone.trim()}>
                    {t('whatsapp.openChat')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('whatsapp.searchChats')}
              className="ps-8 h-9"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredChats.length === 0 && !loadingChats && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {t('whatsapp.noChats')}
            </div>
          )}
          {filteredChats.map((chat) => {
            const isActive = chat.chatId === activeChatId;
            const display = chat.contactName || formatPhone(chat.phone);
            return (
              <button
                key={chat.chatId}
                onClick={() => setActiveChatId(chat.chatId)}
                className={`flex w-full items-start gap-3 border-b px-3 py-3 text-start transition hover:bg-muted/50 ${
                  isActive ? 'bg-muted' : ''
                }`}
              >
                <Avatar label={display} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{display}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatChatPreviewTime(chat.lastMessageAt, locale, t)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-muted-foreground">
                      {chat.lastMessageDirection === 'outbound' && (
                        <span className="text-muted-foreground/70">{t('whatsapp.youPrefix')} </span>
                      )}
                      {chat.lastMessageBody || (
                        <span className="italic opacity-70">{t('whatsapp.noMessages')}</span>
                      )}
                    </p>
                    {chat.unreadCount > 0 && (
                      <Badge className="bg-emerald-500 hover:bg-emerald-500 px-2">
                        {chat.unreadCount}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Right pane: thread */}
      <section className="flex flex-1 flex-col">
        {!activeChat && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[#f0f2f5] p-12 text-center dark:bg-muted/30">
            <Phone className="h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">{t('whatsapp.selectAChat')}</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {t('whatsapp.selectAChatDescription')}
            </p>
          </div>
        )}

        {activeChat && (
          <>
            {/* Thread header */}
            <header className="flex items-center gap-3 border-b bg-card px-4 py-3">
              <Avatar label={activeChat.contactName || activeChat.phone} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {activeChat.contactName || formatPhone(activeChat.phone)}
                </div>
                <div className="text-xs text-muted-foreground">{formatPhone(activeChat.phone)}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLoadEarlier}
                disabled={syncingHistory}
                title={t('whatsapp.loadEarlier')}
              >
                <History className={`me-2 h-4 w-4 ${syncingHistory ? 'animate-spin' : ''}`} />
                {t('whatsapp.loadEarlier')}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => loadMessages(activeChat.chatId)}
                disabled={loadingMessages}
                title={t('whatsapp.refresh')}
              >
                <RefreshCw className={`h-4 w-4 ${loadingMessages ? 'animate-spin' : ''}`} />
              </Button>
            </header>

            {/* Thread body */}
            <div
              ref={threadRef}
              className="relative flex-1 overflow-y-auto px-4 py-4"
              style={{
                backgroundColor: '#efeae2',
                backgroundImage:
                  'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.6) 0, transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.4) 0, transparent 40%)',
              }}
            >
              {messageGroups.length === 0 && !loadingMessages && (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  {t('whatsapp.threadEmpty')}
                </div>
              )}
              {messageGroups.map((group) => (
                <div key={group.dateKey} className="space-y-1">
                  <div className="my-3 flex justify-center">
                    <span className="rounded-md bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
                      {formatDateLabel(group.messages[0].sentAt || group.messages[0].receivedAt || group.messages[0].createdAt, locale, t)}
                    </span>
                  </div>
                  {group.messages.map((m) => {
                    const out = m.direction === 'outbound';
                    return (
                      <div key={m.id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`relative max-w-[72%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm shadow-sm ${
                            out
                              ? 'rounded-ee-sm bg-[#d9fdd3] text-slate-900'
                              : 'rounded-ss-sm bg-white text-slate-900'
                          }`}
                        >
                          {m.body || (m.mediaUrl ? (
                            <a
                              href={m.mediaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline underline-offset-2"
                            >
                              {m.fileName || t('whatsapp.attachment')}
                            </a>
                          ) : (
                            <span className="italic opacity-60">({t('whatsapp.emptyMessage')})</span>
                          ))}
                          <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                            <span>{formatTime(m.sentAt || m.receivedAt || m.createdAt, locale)}</span>
                            {out && <StatusTicks status={m.status} />}
                          </div>
                          {m.status === 'failed' && m.error && (
                            <div className="mt-1 text-[10px] text-red-600">{m.error}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Composer */}
            <footer className="border-t bg-card p-3">
              <div className="flex items-end gap-2">
                <Textarea
                  ref={composerRef}
                  rows={1}
                  value={composing}
                  onChange={(e) => setComposing(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={t('whatsapp.composerPlaceholder')}
                  className="min-h-[40px] max-h-32 resize-none"
                  disabled={instance.state !== 'authorized' || sending}
                />
                <Button
                  onClick={handleSend}
                  disabled={!composing.trim() || sending || instance.state !== 'authorized'}
                  size="icon"
                  className="shrink-0"
                  title={t('whatsapp.send')}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              {instance.state !== 'authorized' && (
                <p className="mt-2 text-xs text-amber-700">
                  {t('whatsapp.notLinkedWarning')}{' '}
                  <a href="/settings" className="underline">
                    {t('whatsapp.goToSettings')}
                  </a>
                </p>
              )}
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
