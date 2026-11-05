'use client';

import * as React from 'react';
import { Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/context/i18n-context';
import { assistantStatusOnce, type AssistantSubject } from '@/services/assistantService';
import { useAssistantPanel, useAssistantSubject } from '../assistant-context';

/**
 * "Ask about this" on a record: tells the assistant which record is on screen
 * (while this is mounted) and opens the panel with the composer focused.
 * Renders nothing where the server has no model.
 */
export function AskAboutThis({ subject, className, size = 'sm' }: { subject: AssistantSubject | null; className?: string; size?: 'sm' | 'icon' }) {
  useAssistantSubject(subject);
  const { openAbout } = useAssistantPanel();
  const { language } = useI18n();
  const [available, setAvailable] = React.useState(false);
  React.useEffect(() => { void assistantStatusOnce().then((s) => setAvailable(s.enabled)); }, []);
  if (!available || !subject) return null;
  const label = language === 'ar' ? 'اسأل المساعد عن هذا' : 'Ask about this';
  return size === 'icon' ? (
    <Button type="button" variant="ghost" size="icon" className={className} aria-label={label} title={label} onClick={openAbout}>
      <Bot className="h-4 w-4" />
    </Button>
  ) : (
    <Button type="button" variant="outline" size="sm" className={className} onClick={openAbout}>
      <Bot className="h-4 w-4" />{label}
    </Button>
  );
}
