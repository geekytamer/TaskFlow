'use client';

import * as React from 'react';
import { useI18n } from '@/context/i18n-context';
import {
  loadWhatsappMedia,
  whatsappMediaKind,
  type WhatsAppMessage,
} from '@/services/whatsappService';
import { Download, FileText, ImageOff, Loader2 } from 'lucide-react';

/**
 * A message's attachment, shown in the chat: the photo itself, a player for
 * audio and video, a file chip for the rest. Loads when it scrolls into view.
 */
export function WhatsappMessageMedia({ companyId, message }: { companyId: string; message: WhatsAppMessage }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const kind = whatsappMediaKind(message);
  const holder = React.useRef<HTMLDivElement>(null);
  const [inView, setInView] = React.useState(false);
  const [src, setSrc] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  const mediaUrl = message.mediaUrl!;

  React.useEffect(() => {
    const el = holder.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A file chip needs no bytes until it is clicked.
  const wantsBytes = kind !== 'document';
  React.useEffect(() => {
    if (!inView || !wantsBytes) return;
    let alive = true;
    setFailed(false);
    loadWhatsappMedia(companyId, mediaUrl)
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [inView, wantsBytes, companyId, mediaUrl]);

  const open = async () => {
    try {
      const url = await loadWhatsappMedia(companyId, mediaUrl);
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      if (kind === 'document' && message.fileName) a.download = message.fileName;
      a.click();
    } catch {
      setFailed(true);
    }
  };

  const fileChip = (
    <button
      type="button"
      onClick={open}
      className="flex max-w-full items-center gap-2 rounded-lg bg-black/5 px-3 py-2 text-start hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15"
    >
      <FileText className="h-5 w-5 shrink-0 opacity-70" />
      <span className="min-w-0 flex-1 truncate text-sm">{message.fileName || tr('File', 'ملف')}</span>
      <Download className="h-4 w-4 shrink-0 opacity-60" />
    </button>
  );

  let content: React.ReactNode;
  if (failed) {
    // The provider no longer has the file (old links expire) or it could not be read.
    content = (
      <div className="flex items-center gap-2 rounded-lg bg-black/5 px-3 py-2 text-xs opacity-70 dark:bg-white/10">
        <ImageOff className="h-4 w-4" />
        {tr('This file is no longer available', 'هذا الملف لم يعد متاحاً')}
      </div>
    );
  } else if (kind === 'document') {
    content = fileChip;
  } else if (!src) {
    content = (
      <div className={`flex items-center justify-center rounded-lg bg-black/5 dark:bg-white/10 ${kind === 'audio' ? 'h-12 w-56' : 'h-40 w-56'}`}>
        <Loader2 className="h-5 w-5 animate-spin opacity-50" />
      </div>
    );
  } else if (kind === 'image') {
    content = (
      <button type="button" onClick={open} className="block" title={tr('Open photo', 'فتح الصورة')}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={message.body || message.fileName || tr('Photo', 'صورة')}
          className="max-h-72 max-w-full rounded-lg object-contain"
          onError={() => setFailed(true)}
        />
      </button>
    );
  } else if (kind === 'audio') {
    content = <audio controls preload="metadata" src={src} className="h-10 w-60 max-w-full" onError={() => setFailed(true)} />;
  } else {
    content = <video controls preload="metadata" src={src} className="max-h-72 max-w-full rounded-lg" onError={() => setFailed(true)} />;
  }

  return (
    <div ref={holder} className="mb-1">
      {content}
    </div>
  );
}
