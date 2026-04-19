'use client';

import * as React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompany } from '@/context/company-context';
import { getActivityEvents } from '@/services/financeService';
import type { ActivityEvent } from '@/modules/finance/types';

type ActivityFeedProps = {
  title?: string;
  entityType?: ActivityEvent['entityType'];
  entityId?: string;
  limit?: number;
  emptyMessage?: string;
};

export function ActivityFeed({
  title = 'Recent Activity',
  entityType,
  entityId,
  limit = 8,
  emptyMessage = 'No activity recorded yet.',
}: ActivityFeedProps) {
  const { selectedCompany } = useCompany();
  const [events, setEvents] = React.useState<ActivityEvent[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!selectedCompany) {
        setEvents([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await getActivityEvents(selectedCompany.id, {
          entityType,
          entityId,
          limit,
        });
        if (!cancelled) setEvents(data);
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedCompany, entityType, entityId, limit]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {loading &&
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-2 rounded-lg border p-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          {!loading && events.length === 0 && (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          )}
          {!loading &&
            events.map((event) => (
              <div key={event.id} className="rounded-lg border p-3">
                <div className="font-medium">{event.summary}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {(event.actorName || 'System')} • {event.entityType.replace('_', ' ')} • {formatDistanceToNow(event.createdAt, { addSuffix: true })}
                </div>
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
