'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/context/i18n-context';
import type { CrmActivity } from '@/services/crmService';
import { Phone, MessageCircle, Mail, Users, FileText, Clock, StickyNote, Zap, CalendarClock } from 'lucide-react';

const CATEGORY_ICON: Record<string, React.ElementType> = {
  'Call': Phone,
  'WhatsApp': MessageCircle,
  'Email': Mail,
  'Meeting': Users,
  'Proposal Sent': FileText,
  'Follow-up': Clock,
  'Note': StickyNote,
  'Other': Zap,
};

const CATEGORY_COLOR: Record<string, string> = {
  'Call': 'bg-blue-100 text-blue-700',
  'WhatsApp': 'bg-green-100 text-green-700',
  'Email': 'bg-purple-100 text-purple-700',
  'Meeting': 'bg-orange-100 text-orange-700',
  'Proposal Sent': 'bg-yellow-100 text-yellow-700',
  'Follow-up': 'bg-pink-100 text-pink-700',
  'Note': 'bg-gray-100 text-gray-700',
  'Other': 'bg-slate-100 text-slate-700',
};

function fmt(d: Date) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  activities: CrmActivity[];
  loading?: boolean;
}

export function ActivityFeed({ activities, loading }: Props) {
  const { t } = useI18n();

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">{t('crm.noActivities')}</p>
    );
  }

  return (
    <div className="space-y-3">
      {activities.map((a) => {
        const Icon = CATEGORY_ICON[a.category ?? 'Other'] ?? Zap;
        const colorClass = CATEGORY_COLOR[a.category ?? 'Other'] ?? 'bg-slate-100 text-slate-700';
        return (
          <div key={a.id} className="flex gap-3 p-3 rounded-lg border bg-card">
            <div className={`flex-none flex items-center justify-center w-8 h-8 rounded-full ${colorClass}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {a.category && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colorClass}`}>
                    {t(`crm.cat${(a.category).replace(/\s+/g, '')}`)}
                  </span>
                )}
                {a.durationMinutes != null && (
                  <span className="text-xs text-muted-foreground">{a.durationMinutes} min</span>
                )}
                <span className="text-xs text-muted-foreground ms-auto">{fmt(a.createdAt)}</span>
              </div>
              <p className="text-sm mt-1">{a.summary}</p>
              {a.outcome && <p className="text-xs text-muted-foreground mt-0.5">{t('crm.outcomeLabel')}: {a.outcome}</p>}
              {a.nextAction && (
                <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                  <CalendarClock className="h-3 w-3 shrink-0" />
                  <span>{a.nextAction}</span>
                  {a.nextActionDueDate && (
                    <span className="ml-auto font-medium">{fmt(a.nextActionDueDate)}</span>
                  )}
                </div>
              )}
              {a.actorName && <p className="text-xs text-muted-foreground mt-1">{a.actorName}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
