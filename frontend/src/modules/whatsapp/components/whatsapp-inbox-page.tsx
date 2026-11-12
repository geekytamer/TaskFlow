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
import { usePermissions } from '@/context/permissions-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import {
  getWhatsappChats,
  getWhatsappInstance,
  getWhatsappMessages,
  getWhatsappWindow,
  getWhatsappTeam,
  getWhatsappQuickReplies,
  type WhatsAppQuickReply,
  markWhatsappChatRead,
  sendWhatsappMedia,
  WHATSAPP_MAX_FILE_BYTES,
  openWhatsappChat,
  sendWhatsappMessage,
  syncWhatsappChatHistory,
  updateWhatsappChatSettings,
  type WhatsAppChatSummary,
  type WhatsAppInstance,
  type WhatsAppMessage,
  type WhatsAppWindow,
} from '@/services/whatsappService';
import { isApiError } from '@/lib/api-client';
import { WhatsappTemplateDialog } from './whatsapp-template-dialog';
import { WhatsappMessageMedia } from './whatsapp-message-media';
import { WhatsappChatPanel } from './whatsapp-chat-panel';
import { WhatsappQuickRepliesDialog } from './whatsapp-quick-replies-dialog';
import { useLiveRefresh } from '@/lib/live';
import { useSearchParams } from 'next/navigation';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import {
  Check,
  CheckCheck,
  CornerUpLeft,
  FileText,
  History,
  Mic,
  Paperclip,
  Square,
  X,
  Lock,
  MessageSquarePlus,
  Phone,
  RefreshCw,
  Search,
  Send,
  UserPlus,
  Users,
  PanelRight,
  Zap,
  ListTodo,
  CalendarClock,
  Megaphone,
  BarChart3,
} from 'lucide-react';
import { InboxModeSwitch } from '@/modules/teamchat/components/inbox-mode-switch';
import { INBOX_PERMISSION } from '@/modules/conversations/lib/inbox';
import { MessageToWorkDialog } from './message-to-work-dialog';
import { ContactDetailSheet } from './contact-detail-sheet';

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
  const { user } = useAuthGuard();
  const locale = language === 'ar' ? 'ar' : 'en-US';
  // Everyone's chats (company scope), not only one's own.
  const isManager = usePermissions().can('whatsapp.view', { scope: 'company' });
  const [contactSheetOpen, setContactSheetOpen] = React.useState(false);

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

  const [chatWindow, setChatWindow] = React.useState<WhatsAppWindow | null>(null);
  const [templateOpen, setTemplateOpen] = React.useState(false);
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);

  /** A file picked, pasted or recorded, waiting to be sent with the typed text as its caption. */
  const [attachment, setAttachment] = React.useState<{ file: Blob; name: string; preview?: string } | null>(null);
  const [replyTo, setReplyTo] = React.useState<WhatsAppMessage | null>(null);
  const [recording, setRecording] = React.useState(false);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();

  /** Which chats the list shows: everything open, mine, nobody's, late, done, or all. */
  type ListTab = 'open' | 'mine' | 'unassigned' | 'late' | 'done' | 'all';
  const [listTab, setListTab] = React.useState<ListTab>('open');
  // The details panel starts open where there is room for it beside the chat.
  const [panelOpen, setPanelOpen] = React.useState(() => typeof window === 'undefined' || window.innerWidth >= 1280);
  const [team, setTeam] = React.useState<Array<{ id: string; name: string }>>([]);
  const [quickReplies, setQuickReplies] = React.useState<WhatsAppQuickReply[]>([]);
  const [quickRepliesOpen, setQuickRepliesOpen] = React.useState(false);
  const [slashIndex, setSlashIndex] = React.useState(0);
  /** A message being turned into a task or a follow-up. */
  const [toWork, setToWork] = React.useState<{ kind: 'task' | 'followup'; message: WhatsAppMessage } | null>(null);
  const perms = usePermissions();
  const canTasks = perms.moduleOn('tasks');
  const canClientInbox = perms.can(INBOX_PERMISSION) && perms.moduleOn('contacts');
  // The report compares people: for those who see every chat.
  const canReport = perms.can('whatsapp.view', { scope: 'company' });

  const threadRef = React.useRef<HTMLDivElement>(null);
  const composerRef = React.useRef<HTMLTextAreaElement>(null);
  const companyId = selectedCompany?.id;

  const activeChat = chats.find((c) => c.chatId === activeChatId) || null;
  /** Messages of the open chat by provider id, to show what a reply answers. */
  const byExternalId = React.useMemo(() => {
    const map = new Map<string, WhatsAppMessage>();
    for (const m of messages) if (m.externalId) map.set(m.externalId, m);
    return map;
  }, [messages]);

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
        const list = await getWhatsappMessages(companyId, { chatId, limit: 500 });
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

  const loadQuickReplies = React.useCallback(() => {
    if (!companyId) return;
    getWhatsappQuickReplies(companyId).then(setQuickReplies).catch(() => undefined);
  }, [companyId]);

  React.useEffect(() => {
    loadInstance();
    loadChats();
    loadQuickReplies();
    if (companyId) getWhatsappTeam(companyId).then(setTeam).catch(() => setTeam([]));
  }, [loadInstance, loadChats, loadQuickReplies, companyId]);

  // New messages arrive through the live signal; this slow poll is only a safety net.
  React.useEffect(() => {
    if (!companyId) return;
    const id = window.setInterval(() => {
      loadChats();
    }, 60000);
    return () => window.clearInterval(id);
  }, [companyId, loadChats]);

  // A notification opens its chat: /whatsapp?chat=<chatId>
  const wantedChat = searchParams?.get('chat');
  React.useEffect(() => {
    if (wantedChat) setActiveChatId(wantedChat);
  }, [wantedChat]);

  React.useEffect(() => setSlashIndex(0), [composing]);

  // Switching chats drops what was being attached or answered there.
  React.useEffect(() => {
    setAttachment((prev) => {
      if (prev?.preview) URL.revokeObjectURL(prev.preview);
      return null;
    });
    setReplyTo(null);
  }, [activeChatId]);

  // When opening a chat: mark read, sync history once, load thread
  React.useEffect(() => {
    if (!activeChatId || !companyId) return;
    loadMessages(activeChatId);
    markWhatsappChatRead(companyId, activeChatId).catch(() => undefined);

    // Meta's Cloud API keeps no history to fetch.
    if (instance?.state === 'authorized' && instance.provider !== 'cloud' && !historyAttemptedFor.has(activeChatId)) {
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
  }, [activeChatId, companyId, instance?.state, instance?.provider, historyAttemptedFor, loadMessages, loadChats]);

  // Cloud API: free text only within 24 hours of the customer's last message.
  const isCloud = instance?.provider === 'cloud';
  const lastInboundKey = messages.filter((m) => m.direction === 'inbound').length;
  React.useEffect(() => {
    if (!isCloud || !activeChatId || !companyId) {
      setChatWindow(null);
      return;
    }
    let alive = true;
    getWhatsappWindow(companyId, activeChatId)
      .then((w) => alive && setChatWindow(w))
      .catch(() => alive && setChatWindow(null));
    return () => {
      alive = false;
    };
  }, [isCloud, activeChatId, companyId, lastInboundKey]);
  const windowClosed = isCloud && chatWindow?.open === false;

  // Live: a message or a status change re-reads the list and the open chat at once.
  useLiveRefresh(['whatsapp'], () => {
    loadChats();
    if (activeChatId && companyId) {
      loadMessages(activeChatId, { silent: true });
      // The chat is on screen: what just arrived is read.
      markWhatsappChatRead(companyId, activeChatId).catch(() => undefined);
    }
  });

  // Safety net for the open chat if the live stream drops.
  React.useEffect(() => {
    if (!activeChatId || !companyId) return;
    const id = window.setInterval(() => {
      loadMessages(activeChatId, { silent: true });
    }, 60000);
    return () => window.clearInterval(id);
  }, [activeChatId, companyId, loadMessages]);

  const attach = (file: Blob, name: string) => {
    if (file.size > WHATSAPP_MAX_FILE_BYTES) {
      toast({ variant: 'destructive', title: tr('The file is larger than 16 MB', 'الملف أكبر من ١٦ ميغابايت'), description: tr('WhatsApp does not accept larger files.', 'واتساب لا يقبل ملفات أكبر من ذلك.') });
      return;
    }
    setAttachment((prev) => {
      if (prev?.preview) URL.revokeObjectURL(prev.preview);
      return { file, name, preview: file.type.startsWith('image/') || file.type.startsWith('audio/') ? URL.createObjectURL(file) : undefined };
    });
    composerRef.current?.focus();
  };

  const clearAttachment = () =>
    setAttachment((prev) => {
      if (prev?.preview) URL.revokeObjectURL(prev.preview);
      return null;
    });

  // Voice: recorded in a format WhatsApp can play where the browser allows it.
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const type = (recorder.mimeType || mime || 'audio/webm').split(';')[0];
        const blob = new Blob(chunks, { type: recorder.mimeType || type });
        if (blob.size === 0) return;
        const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
        attach(blob, `voice-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      toast({ variant: 'destructive', title: tr('Microphone not available', 'الميكروفون غير متاح'), description: tr('Allow microphone access for this site, then try again.', 'اسمح لهذا الموقع باستخدام الميكروفون ثم حاول مجدداً.') });
    }
  };
  const stopRecording = () => recorderRef.current?.state === 'recording' && recorderRef.current.stop();

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
    if (!companyId || !activeChat || (!composing.trim() && !attachment)) return;
    const text = composing.trim();
    const sendingFile = attachment;
    const answering = replyTo;
    setSending(true);
    setComposing('');
    try {
      if (sendingFile) {
        await sendWhatsappMedia(companyId, {
          phone: activeChat.phone,
          file: sendingFile.file,
          fileName: sendingFile.name,
          caption: text || undefined,
          contactId: activeChat.contactId,
          replyToExternalId: answering?.externalId,
        });
        clearAttachment();
      } else {
        await sendWhatsappMessage(companyId, {
          phone: activeChat.phone,
          message: text,
          contactId: activeChat.contactId,
          replyToExternalId: answering?.externalId,
        });
      }
      setReplyTo(null);
      await loadMessages(activeChat.chatId, { silent: true });
      await loadChats();
    } catch (error: any) {
      setComposing(text);
      // The 24-hour window closed (Cloud API): offer a template instead of an error.
      if (isApiError(error) && (error.details as { code?: string } | undefined)?.code === 'windowClosed') {
        setChatWindow((prev) => ({ ...(prev || { provider: 'cloud' }), open: false }));
        setTemplateOpen(true);
        return;
      }
      toast({
        variant: 'destructive',
        title: t('whatsapp.sendFailedTitle'),
        description: error?.message || t('whatsapp.sendFailedDescription'),
      });
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

  const handleTogglePrivacy = async () => {
    if (!companyId || !activeChat) return;
    const next = activeChat.visibility === 'private' ? 'shared' : 'private';
    try {
      await updateWhatsappChatSettings(companyId, activeChat.chatId, {
        visibility: next,
        // If toggling to private and there's no owner yet, server defaults to current user
        ownerUserId: next === 'private' ? user?.id : null,
      });
      await loadChats();
      toast({
        title:
          next === 'private'
            ? t('whatsapp.privacyEnabledToast')
            : t('whatsapp.privacyDisabledToast'),
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('whatsapp.privacyFailedTitle'),
        description: error?.message,
      });
    }
  };

  const handleContactCreated = async () => {
    // Refresh chats so the newly created contact links by phone
    await loadChats();
    setContactSheetOpen(false);
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

  const inTab = React.useCallback(
    (c: WhatsAppChatSummary, tab: ListTab) => {
      switch (tab) {
        case 'open':
          return c.status === 'open';
        case 'mine':
          return c.assigneeUserId === user?.id && c.status !== 'done';
        case 'unassigned':
          return !c.assigneeUserId && c.status !== 'done';
        case 'late':
          return c.status === 'open' && c.sla === 'red';
        case 'done':
          return c.status === 'done';
        default:
          return true;
      }
    },
    [user?.id],
  );
  const tabCounts = React.useMemo(() => {
    const counts: Record<ListTab, number> = { open: 0, mine: 0, unassigned: 0, late: 0, done: 0, all: chats.length };
    for (const c of chats) for (const tab of ['open', 'mine', 'unassigned', 'late', 'done'] as ListTab[]) if (inTab(c, tab)) counts[tab] += 1;
    return counts;
  }, [chats, inTab]);
  /** Labels already used in the company: suggestions, so the team spells them the same way. */
  const knownLabels = React.useMemo(() => Array.from(new Set(chats.flatMap((c) => c.labels || []))).sort(), [chats]);

  const filteredChats = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    // A search looks through every chat; otherwise the tab decides. The open chat stays in view.
    if (!q) return chats.filter((c) => inTab(c, listTab) || c.chatId === activeChatId);
    return chats.filter((c) =>
      [c.contactName, c.phone, c.lastMessageBody, ...(c.labels || [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [chats, search, listTab, inTab, activeChatId]);

  // Typing "/" at the start of the message lists the saved replies.
  const slashQuery = /^\/(\S*)$/.exec(composing)?.[1]?.toLowerCase();
  const slashMatches = slashQuery === undefined
    ? []
    : quickReplies.filter((r) => r.shortcut.toLowerCase().startsWith(slashQuery) || r.body.toLowerCase().includes(slashQuery)).slice(0, 6);
  const applyQuickReply = (reply: WhatsAppQuickReply) => {
    setComposing(reply.body);
    setSlashIndex(0);
    requestAnimationFrame(() => composerRef.current?.focus());
  };

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
        {/* One inbox: clients, WhatsApp and the team, side by side. */}
        <div className="border-b p-2">
          <InboxModeSwitch mode="whatsapp" showClients={canClientInbox} />
        </div>
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
            {canReport && (
              <Button variant="ghost" size="icon" asChild title={tr('Response report', 'تقرير الردود')}>
                <a href="/whatsapp/report" aria-label={tr('Response report', 'تقرير الردود')}>
                  <BarChart3 className="h-4 w-4" />
                </a>
              </Button>
            )}
            <Button variant="ghost" size="icon" asChild title={tr('Campaigns', 'الحملات')}>
              <a href="/whatsapp/campaigns" aria-label={tr('Campaigns', 'الحملات')}>
                <Megaphone className="h-4 w-4" />
              </a>
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
          <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5" role="tablist" aria-label={tr('Filter chats', 'تصفية المحادثات')}>
            {([
              ['open', tr('Open', 'مفتوحة')],
              ['mine', tr('Mine', 'محادثاتي')],
              ['unassigned', tr('Unassigned', 'بلا مسؤول')],
              ['late', tr('Late', 'متأخرة')],
              ['done', tr('Done', 'منتهية')],
              ['all', tr('All', 'الكل')],
            ] as Array<[ListTab, string]>).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={listTab === tab}
                onClick={() => setListTab(tab)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                  listTab === tab ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                } ${tab === 'late' && tabCounts.late > 0 && listTab !== 'late' ? 'text-red-600 dark:text-red-400' : ''}`}
              >
                {label}
                {tab !== 'all' && tabCounts[tab] > 0 && <span className="ms-1 opacity-80">{tabCounts[tab]}</span>}
              </button>
            ))}
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
                    <span className="flex min-w-0 items-center gap-1">
                      <span className="truncate text-sm font-semibold">{display}</span>
                      {chat.visibility === 'private' && (
                        <Lock className="h-3 w-3 shrink-0 text-amber-600" />
                      )}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatChatPreviewTime(chat.lastMessageAt, locale, t)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-muted-foreground">
                      {chat.lastMessageDirection === 'outbound' && (
                        <span className="text-muted-foreground/70">{t('whatsapp.youPrefix')} </span>
                      )}
                      {chat.lastMessageKind && (
                        <span>
                          {{ image: tr('📷 Photo', '📷 صورة'), video: tr('🎥 Video', '🎥 فيديو'), audio: tr('🎤 Voice message', '🎤 رسالة صوتية'), document: tr('📄 File', '📄 ملف') }[chat.lastMessageKind]}
                          {chat.lastMessageBody ? ' · ' : ''}
                        </span>
                      )}
                      {chat.lastMessageBody || (!chat.lastMessageKind && (
                        <span className="italic opacity-70">{t('whatsapp.noMessages')}</span>
                      ))}
                    </p>
                    {chat.unreadCount > 0 && (
                      <Badge className="bg-emerald-500 hover:bg-emerald-500 px-2">
                        {chat.unreadCount}
                      </Badge>
                    )}
                  </div>
                  {(chat.assigneeName || chat.labels?.length > 0 || chat.sla === 'red' || chat.sla === 'amber' || chat.status === 'done') && (
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                      {chat.sla === 'red' && <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">{tr('Late', 'متأخرة')}</span>}
                      {chat.sla === 'amber' && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">{tr('Reply soon', 'قارب الموعد')}</span>}
                      {chat.status === 'done' && <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{tr('Done', 'منتهية')}</span>}
                      {chat.assigneeName && <span className="truncate text-muted-foreground">· {chat.assigneeUserId === user?.id ? tr('Me', 'أنا') : chat.assigneeName}</span>}
                      {chat.labels?.slice(0, 3).map((label) => (
                        <span key={label} className="rounded-full border px-1.5 py-0.5 text-muted-foreground">{label}</span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Right pane: thread */}
      <section className="flex min-w-0 flex-1 flex-col">
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
            {/* Thread header — click to open contact panel */}
            <header className="flex items-center gap-3 border-b bg-card px-4 py-3">
              <button
                onClick={() => setContactSheetOpen(true)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 text-start transition hover:bg-muted/50"
                title={
                  activeChat.contactId
                    ? t('whatsapp.viewContact')
                    : t('whatsapp.createContactFromChat')
                }
              >
                <Avatar label={activeChat.contactName || activeChat.phone} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">
                      {activeChat.contactName || formatPhone(activeChat.phone)}
                    </span>
                    {activeChat.visibility === 'private' && (
                      <Lock className="h-3.5 w-3.5 text-amber-600" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatPhone(activeChat.phone)}</span>
                    {!activeChat.contactId && (
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                        {t('whatsapp.notLinked')}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
              {!activeChat.contactId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setContactSheetOpen(true)}
                  title={t('whatsapp.createContactFromChat')}
                >
                  <UserPlus className="h-4 w-4 2xl:me-2" />
                  {/* Icon only until there is room, so the customer's name keeps its space. */}
                  <span className="hidden 2xl:inline">{t('whatsapp.createContact')}</span>
                </Button>
              )}
              {(isManager || activeChat.ownerUserId === user?.id) && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleTogglePrivacy}
                  title={
                    activeChat.visibility === 'private'
                      ? t('whatsapp.makeShared')
                      : t('whatsapp.makePrivate')
                  }
                >
                  {activeChat.visibility === 'private' ? (
                    <Users className="h-4 w-4" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                </Button>
              )}
              {!isCloud && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLoadEarlier}
                  disabled={syncingHistory}
                  title={t('whatsapp.loadEarlier')}
                >
                  <History className={`h-4 w-4 2xl:me-2 ${syncingHistory ? 'animate-spin' : ''}`} />
                  <span className="hidden 2xl:inline">{t('whatsapp.loadEarlier')}</span>
                </Button>
              )}
              <Button
                variant={panelOpen ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setPanelOpen((v) => !v)}
                title={tr('Chat details: who answers, status, labels, notes', 'تفاصيل المحادثة: المسؤول والحالة والتصنيفات والملاحظات')}
                aria-pressed={panelOpen}
              >
                <PanelRight className="h-4 w-4" />
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
              className="relative flex-1 overflow-y-auto bg-[#efeae2] px-4 py-4 dark:bg-[#0b141a] dark:![background-image:none]"
              style={{
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
                    <span className="rounded-md bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm dark:bg-[#182229] dark:text-slate-400">
                      {formatDateLabel(group.messages[0].sentAt || group.messages[0].receivedAt || group.messages[0].createdAt, locale, t)}
                    </span>
                  </div>
                  {group.messages.map((m) => {
                    const out = m.direction === 'outbound';
                    const quoted = m.replyToExternalId ? byExternalId.get(m.replyToExternalId) : undefined;
                    return (
                      <div key={m.id} className={`group/msg flex items-center gap-1 ${out ? 'flex-row-reverse' : ''}`}>
                        <div
                          className={`relative max-w-[72%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm shadow-sm ${
                            out
                              ? 'rounded-ee-sm bg-[#d9fdd3] text-slate-900 dark:bg-[#005c4b] dark:text-[#e9edef]'
                              : 'rounded-ss-sm bg-white text-slate-900 dark:bg-[#202c33] dark:text-[#e9edef]'
                          }`}
                        >
                          {m.replyToExternalId && (
                            <div className="mb-1 rounded-md border-s-4 border-emerald-500 bg-black/5 px-2 py-1 text-xs dark:bg-white/10">
                              <div className="font-medium text-emerald-700 dark:text-emerald-300">
                                {quoted ? (quoted.direction === 'outbound' ? tr('You', 'أنت') : activeChat.contactName || formatPhone(activeChat.phone)) : tr('Earlier message', 'رسالة سابقة')}
                              </div>
                              {quoted && <div className="line-clamp-2 opacity-80">{quoted.body || quoted.fileName || t('whatsapp.attachment')}</div>}
                            </div>
                          )}
                          {m.mediaUrl && companyId && <WhatsappMessageMedia companyId={companyId} message={m} />}
                          {m.body ? (
                            <span>{m.body}</span>
                          ) : !m.mediaUrl ? (
                            <span className="italic opacity-60">({t('whatsapp.emptyMessage')})</span>
                          ) : null}
                          <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                            {out && m.actorName && (
                              <span className="me-1 italic opacity-80">
                                {t('whatsapp.bySender')} {m.actorName}
                              </span>
                            )}
                            <span>{formatTime(m.sentAt || m.receivedAt || m.createdAt, locale)}</span>
                            {out && <StatusTicks status={m.status} />}
                          </div>
                          {m.status === 'failed' && m.error && (
                            <div className="mt-1 text-[10px] text-red-600">{m.error}</div>
                          )}
                        </div>
                        <div className="flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/msg:opacity-100 [@media(hover:none)]:opacity-60">
                          {m.externalId && m.status !== 'failed' && (
                            <button
                              type="button"
                              onClick={() => {
                                setReplyTo(m);
                                composerRef.current?.focus();
                              }}
                              className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
                              title={tr('Reply', 'رد')}
                              aria-label={tr('Reply to this message', 'الرد على هذه الرسالة')}
                            >
                              <CornerUpLeft className="h-4 w-4" />
                            </button>
                          )}
                          {!out && canTasks && (
                            <button
                              type="button"
                              onClick={() => setToWork({ kind: 'task', message: m })}
                              className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
                              title={tr('Make a task', 'إنشاء مهمة')}
                              aria-label={tr('Make a task from this message', 'إنشاء مهمة من هذه الرسالة')}
                            >
                              <ListTodo className="h-4 w-4" />
                            </button>
                          )}
                          {!out && activeChat.contactId && (
                            <button
                              type="button"
                              onClick={() => setToWork({ kind: 'followup', message: m })}
                              className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
                              title={tr('Make a follow-up', 'إنشاء متابعة')}
                              aria-label={tr('Make a follow-up from this message', 'إنشاء متابعة من هذه الرسالة')}
                            >
                              <CalendarClock className="h-4 w-4" />
                            </button>
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
              {windowClosed && instance.state === 'authorized' && (
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                  <span>
                    {tr(
                      'More than 24 hours since the customer last wrote: only an approved template can be sent.',
                      'مرّت أكثر من ٢٤ ساعة على آخر رسالة من العميل: يمكن إرسال قالب معتمد فقط.',
                    )}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setTemplateOpen(true)}>
                    <FileText className="me-2 h-4 w-4" />
                    {tr('Send template', 'إرسال قالب')}
                  </Button>
                </div>
              )}
              {slashQuery !== undefined && (
                <div className="mb-2 overflow-hidden rounded-md border bg-popover text-sm shadow-sm" role="listbox" aria-label={tr('Quick replies', 'الردود الجاهزة')}>
                  {slashMatches.map((reply, i) => (
                    <button
                      key={reply.id}
                      type="button"
                      role="option"
                      aria-selected={i === slashIndex}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyQuickReply(reply)}
                      className={`flex w-full items-start gap-2 px-3 py-1.5 text-start ${i === slashIndex ? 'bg-muted' : 'hover:bg-muted/60'}`}
                    >
                      <code className="shrink-0 text-xs text-primary" dir="auto">/{reply.shortcut}</code>
                      <span className="line-clamp-1 text-xs text-muted-foreground">{reply.body}</span>
                    </button>
                  ))}
                  {slashMatches.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">{tr('No quick reply matches.', 'لا يوجد رد جاهز مطابق.')}</div>
                  )}
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setQuickRepliesOpen(true)}
                    className="w-full border-t px-3 py-1.5 text-start text-xs text-primary hover:bg-muted/60"
                  >
                    {tr('Manage quick replies…', 'إدارة الردود الجاهزة…')}
                  </button>
                </div>
              )}
              {replyTo && (
                <div className="mb-2 flex items-center gap-2 rounded-md border-s-4 border-emerald-500 bg-muted px-3 py-1.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{tr('Replying to', 'رد على')} {replyTo.direction === 'outbound' ? tr('your message', 'رسالتك') : activeChat.contactName || formatPhone(activeChat.phone)}</div>
                    <div className="truncate text-muted-foreground">{replyTo.body || replyTo.fileName || t('whatsapp.attachment')}</div>
                  </div>
                  <button type="button" onClick={() => setReplyTo(null)} className="rounded p-1 hover:bg-background" aria-label={tr('Cancel reply', 'إلغاء الرد')}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {attachment && (
                <div className="mb-2 flex items-center gap-3 rounded-md bg-muted px-3 py-2 text-xs">
                  {attachment.preview && attachment.file.type.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={attachment.preview} alt="" className="h-12 w-12 rounded object-cover" />
                  ) : attachment.preview ? (
                    <audio controls src={attachment.preview} className="h-9 w-52 max-w-full" />
                  ) : (
                    <FileText className="h-6 w-6 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{attachment.name}</div>
                    <div className="text-muted-foreground">
                      {(attachment.file.size / 1024 / 1024).toFixed(attachment.file.size > 1024 * 1024 ? 1 : 2)} MB
                      {!attachment.file.type.startsWith('audio/') && ` · ${tr('what you type goes as its caption', 'ما تكتبه يُرسل تعليقاً عليه')}`}
                    </div>
                  </div>
                  <button type="button" onClick={clearAttachment} className="rounded p-1 hover:bg-background" aria-label={tr('Remove file', 'إزالة الملف')}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,video/mp4,video/3gpp,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) attach(file, file.name);
                    e.target.value = '';
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={instance.state !== 'authorized' || sending || windowClosed || recording}
                  title={tr('Attach a photo or file', 'إرفاق صورة أو ملف')}
                  aria-label={tr('Attach a photo or file', 'إرفاق صورة أو ملف')}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => {
                    if (quickReplies.length === 0) setQuickRepliesOpen(true);
                    else {
                      setComposing('/');
                      composerRef.current?.focus();
                    }
                  }}
                  disabled={instance.state !== 'authorized' || sending}
                  title={tr('Quick replies (type /)', 'الردود الجاهزة (اكتب /)')}
                  aria-label={tr('Quick replies', 'الردود الجاهزة')}
                >
                  <Zap className="h-4 w-4" />
                </Button>
                <Textarea
                  ref={composerRef}
                  onPaste={(e) => {
                    // A copied screenshot or photo becomes an attachment.
                    const pasted = Array.from(e.clipboardData?.files || [])[0];
                    if (pasted) {
                      e.preventDefault();
                      attach(pasted, pasted.name || `pasted-${Date.now()}.png`);
                    }
                  }}
                  rows={1}
                  value={composing}
                  onChange={(e) => setComposing(e.target.value)}
                  onKeyDown={(e) => {
                    if (slashMatches.length > 0) {
                      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        setSlashIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + slashMatches.length) % slashMatches.length);
                        return;
                      }
                      if (e.key === 'Enter' || e.key === 'Tab') {
                        e.preventDefault();
                        applyQuickReply(slashMatches[Math.min(slashIndex, slashMatches.length - 1)]);
                        return;
                      }
                    }
                    if (e.key === 'Escape' && slashQuery !== undefined) {
                      setComposing('');
                      return;
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={t('whatsapp.composerPlaceholder')}
                  className="min-h-[40px] max-h-32 resize-none"
                  disabled={instance.state !== 'authorized' || sending || windowClosed}
                />
                {isCloud && !windowClosed && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setTemplateOpen(true)}
                    disabled={instance.state !== 'authorized'}
                    title={tr('Send template', 'إرسال قالب')}
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                )}
                {!composing.trim() && !attachment ? (
                  <Button
                    variant={recording ? 'destructive' : 'ghost'}
                    size="icon"
                    className="shrink-0"
                    onClick={recording ? stopRecording : startRecording}
                    disabled={instance.state !== 'authorized' || sending || windowClosed}
                    title={recording ? tr('Stop recording', 'إيقاف التسجيل') : tr('Record a voice message', 'تسجيل رسالة صوتية')}
                    aria-label={recording ? tr('Stop recording', 'إيقاف التسجيل') : tr('Record a voice message', 'تسجيل رسالة صوتية')}
                  >
                    {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>
                ) : null}
                <Button
                  onClick={handleSend}
                  disabled={(!composing.trim() && !attachment) || sending || recording || instance.state !== 'authorized' || windowClosed}
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

      {activeChat && panelOpen && companyId && (
        <WhatsappChatPanel
          companyId={companyId}
          chat={activeChat}
          team={team}
          knownLabels={knownLabels}
          currentUserId={user?.id}
          canManageAll={isManager}
          onChanged={loadChats}
          onClose={() => setPanelOpen(false)}
        />
      )}

      {toWork && companyId && activeChat && (
        <MessageToWorkDialog
          open={Boolean(toWork)}
          onOpenChange={(open) => !open && setToWork(null)}
          kind={toWork.kind}
          companyId={companyId}
          userId={user?.id}
          message={toWork.message.body || toWork.message.fileName || ''}
          chatId={activeChat.chatId}
          who={activeChat.contactName || formatPhone(activeChat.phone)}
          contactId={activeChat.contactId}
        />
      )}

      {companyId && (
        <WhatsappQuickRepliesDialog
          open={quickRepliesOpen}
          onOpenChange={setQuickRepliesOpen}
          companyId={companyId}
          replies={quickReplies}
          onChanged={loadQuickReplies}
        />
      )}

      {isCloud && companyId && activeChat && (
        <WhatsappTemplateDialog
          open={templateOpen}
          onOpenChange={setTemplateOpen}
          companyId={companyId}
          phone={activeChat.phone}
          contactId={activeChat.contactId}
          onSent={() => {
            loadMessages(activeChat.chatId, { silent: true });
            loadChats();
          }}
        />
      )}

      <ContactDetailSheet
        open={contactSheetOpen}
        onOpenChange={setContactSheetOpen}
        companyId={companyId}
        contactId={activeChat?.contactId}
        fallbackPhone={activeChat?.phone}
        onContactCreated={handleContactCreated}
      />
    </div>
  );
}
