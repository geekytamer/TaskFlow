'use client';

import * as React from 'react';
import { useTour, useSeenTours } from './tour-context';
import { useI18n } from '@/context/i18n-context';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HelpCircle, Play, CheckCircle2 } from 'lucide-react';
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

// Help button shown in sidebar footer — opens dropdown to pick a tour
export function TourHelpButton() {
  const { startTour } = useTour();
  const { language: locale } = useI18n();
  const seenTours = useSeenTours();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          data-tutorial="tour-help-button"
        >
          <HelpCircle className="h-4 w-4" />
          <span className="group-data-[collapsible=icon]:hidden">
            {locale === 'ar' ? 'الدليل التفاعلي' : 'Interactive Guide'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {locale === 'ar' ? 'اختر جولة' : 'Choose a tour'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {TOURS.map(tour => {
          const seen = seenTours.includes(tour.id);
          return (
            <DropdownMenuItem
              key={tour.id}
              className="gap-2 cursor-pointer"
              onClick={() => startTour(tour.id)}
            >
              {seen
                ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                : <Play className="h-3.5 w-3.5 text-primary shrink-0" />
              }
              <span>{locale === 'ar' ? tour.ar : tour.en}</span>
              {!seen && (
                <span className="ml-auto text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  {locale === 'ar' ? 'جديد' : 'New'}
                </span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
