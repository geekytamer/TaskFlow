'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { useLiveRefresh } from '@/lib/live';
import { getTeamUnread } from '@/services/teamChatService';

/** Unread staff-chat messages in the selected company; follows new messages live. */
export function useTeamUnread(enabled = true) {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const [count, setCount] = React.useState(0);

  const refresh = React.useCallback(async () => {
    if (!companyId || !enabled) { setCount(0); return; }
    setCount(await getTeamUnread(companyId).catch(() => 0));
  }, [companyId, enabled]);

  React.useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);
  useLiveRefresh(['team-chat'], refresh, enabled);

  return count;
}
