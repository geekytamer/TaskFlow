'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useI18n } from '@/context/i18n-context';
import { assistantStatusOnce } from '@/services/assistantService';
import { useAssistantPanel } from '../assistant-context';
import { AssistantPage } from './assistant-page';

/** Whether this server has a model (asked once per page load). */
function useAssistantAvailable() {
  const [on, setOn] = React.useState(false);
  React.useEffect(() => { void assistantStatusOnce().then((s) => setOn(s.enabled)); }, []);
  return on;
}

/**
 * The assistant beside any page: a side sheet with the same conversation as
 * /assistant. ⌘J (Ctrl+J) toggles it; it is not offered on /assistant itself.
 */
export function AssistantPanel() {
  const { open, setOpen } = useAssistantPanel();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const available = useAssistantAvailable();
  const onAssistantPage = usePathname()?.startsWith('/assistant') ?? false;

  React.useEffect(() => {
    if (!available || onAssistantPage) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setOpen((was) => !was);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [available, onAssistantPage, setOpen]);

  React.useEffect(() => { if (onAssistantPage) setOpen(false); }, [onAssistantPage, setOpen]);

  if (!available || onAssistantPage) return null;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side={language === 'ar' ? 'left' : 'right'} className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetTitle className="sr-only">{tr('Assistant', 'المساعد')}</SheetTitle>
        <SheetDescription className="sr-only">{tr('Ask about what is on screen, or ask for something to be done.', 'اسأل عما على الشاشة، أو اطلب تنفيذ شيء.')}</SheetDescription>
        {open ? <AssistantPage variant="panel" /> : null}
      </SheetContent>
    </Sheet>
  );
}

/** The header button that opens the panel. */
export function AssistantButton() {
  const { setOpen } = useAssistantPanel();
  const { language } = useI18n();
  const available = useAssistantAvailable();
  const onAssistantPage = usePathname()?.startsWith('/assistant') ?? false;
  if (!available || onAssistantPage) return null;
  const label = language === 'ar' ? 'المساعد (⌘J)' : 'Assistant (⌘J)';
  return (
    <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={label} title={label} onClick={() => setOpen(true)}>
      <Bot className="h-5 w-5" />
    </Button>
  );
}
