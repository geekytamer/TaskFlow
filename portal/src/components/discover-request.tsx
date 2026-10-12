'use client';

import { useState } from 'react';
import { t, type Lang } from '@/lib/i18n';
import { button } from './ui';

/** "Request through Peak": one tap; the account manager gets a follow-up to arrange it. */
export function DiscoverRequest({ lang, id, requested }: { lang: Lang; id: string; requested: boolean }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>(requested ? 'done' : 'idle');

  async function send() {
    setState('busy');
    try {
      const res = await fetch(`/api/discover/${encodeURIComponent(id)}/request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      setState(res.ok ? 'done' : 'failed');
    } catch {
      setState('failed');
    }
  }

  if (state === 'done') {
    return <p role="status" className="text-sm font-medium text-success">{t(lang, 'disc.requested')}</p>;
  }
  return (
    <div className="space-y-1">
      <button type="button" onClick={send} disabled={state === 'busy'} className={button.secondary}>
        {state === 'busy' ? t(lang, 'disc.requesting') : t(lang, 'disc.request')}
      </button>
      {state === 'failed' && <p role="alert" className="text-xs text-danger">{t(lang, 'disc.requestFailed')}</p>}
    </div>
  );
}
