'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTour, useSeenTours } from './tour-context';
import { useI18n } from '@/context/i18n-context';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { HelpCircle, Play } from 'lucide-react';
import { TOURS } from './tour-steps';

// Welcome modal shown on first ever visit
export function WelcomeTourModal() {
  const { startTour } = useTour();
  const { language: locale } = useI18n();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    try {
      const dismissed = localStorage.getItem('taskflow_welcome_dismissed');
      if (!dismissed) setOpen(true);
    } catch {}
  }, []);

  const dismiss = () => {
    try { localStorage.setItem('taskflow_welcome_dismissed', '1'); } catch {}
    setOpen(false);
  };

  const startAndDismiss = () => {
    dismiss();
    startTour('overview');
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) dismiss(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {locale === 'ar' ? '👋 مرحباً بك في TaskFlow' : '👋 Welcome to TaskFlow'}
          </DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {locale === 'ar'
            ? 'TaskFlow هو نظام متكامل لإدارة موارد الشركة وعلاقات العملاء — من العملاء المحتملين والفرص وحتى الفواتير والتقارير المالية.'
            : 'TaskFlow is an all-in-one ERP + CRM — from leads and opportunities all the way through to invoices, projects, and financial reports.'}
        </p>
        <p className="text-muted-foreground text-sm mt-1">
          {locale === 'ar'
            ? 'هل تريد جولة سريعة لاكتشاف كيف يعمل النظام؟'
            : 'Would you like a quick tour to see how everything works?'}
        </p>
        <div className="flex gap-3 pt-2">
          <Button className="flex-1 gap-2" onClick={startAndDismiss}>
            <Play className="h-4 w-4" />
            {locale === 'ar' ? 'نعم، ابدأ الجولة' : 'Yes, show me around'}
          </Button>
          <Button variant="outline" onClick={dismiss}>
            {locale === 'ar' ? 'لاحقاً' : 'Maybe later'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Sidebar entry — opens the guide page. It used to be a dropdown listing every
// tour, which stopped scaling once the guide covered the whole system: a flat
// list of 38 names with no grouping, no progress and nowhere to search.
export function TourHelpButton() {
  const { language: locale } = useI18n();
  const pathname = usePathname();
  const active = pathname === '/guide';

  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className={`w-full justify-start gap-2 ${active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
      data-tutorial="tour-help-button"
    >
      <Link href="/guide">
        <HelpCircle className="h-4 w-4" />
        <span className="group-data-[collapsible=icon]:hidden">
          {locale === 'ar' ? 'الدليل التفاعلي' : 'Interactive Guide'}
        </span>
      </Link>
    </Button>
  );
}
