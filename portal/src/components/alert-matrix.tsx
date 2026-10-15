'use client';

import { useState } from 'react';
import { ALERT_GROUPS_FOR, setChannel, type AlertChannels, type AlertGroup, type AlertSettings } from '@/lib/alert-types';
import { t, type Key, type Lang } from '@/lib/i18n';
import { panel } from './ui';

type Status = 'idle' | 'saving' | 'saved' | 'failed';

/**
 * Which kinds of update reach the phone and WhatsApp, plus whether phone
 * notifications show message text. Each change saves on its own and rolls back
 * if the save fails. The WhatsApp column applies once WhatsApp alerts are on.
 */
export function AlertMatrix({ lang, audience, initial }: { lang: Lang; audience: 'client' | 'influencer'; initial: AlertSettings }) {
  const [groups, setGroups] = useState(initial.groups);
  const [preview, setPreview] = useState(initial.preview);
  const [status, setStatus] = useState<Status>('idle');
  const showWhatsApp = initial.available;
  const whatsappOn = initial.whatsapp;
  const rows = ALERT_GROUPS_FOR[audience];

  async function save(body: { groups?: Partial<Record<AlertGroup, Partial<AlertChannels>>>; preview?: boolean }, rollback: () => void) {
    setStatus('saving');
    try {
      const res = await fetch('/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(String(res.status));
      const saved = (await res.json()) as AlertSettings;
      if (saved.groups) setGroups(saved.groups);
      if (typeof saved.preview === 'boolean') setPreview(saved.preview);
      setStatus('saved');
    } catch {
      rollback();
      setStatus('failed');
    }
  }

  function toggle(group: AlertGroup, channel: keyof AlertChannels, on: boolean) {
    const before = groups;
    setGroups(setChannel(groups, group, channel, on));
    void save({ groups: { [group]: { [channel]: on } } }, () => setGroups(before));
  }

  function togglePreview(on: boolean) {
    setPreview(on);
    void save({ preview: on }, () => setPreview(!on));
  }

  const channelName = (channel: keyof AlertChannels) => t(lang, channel === 'push' ? 'matrix.phone' : 'matrix.whatsapp');
  const cell = (group: AlertGroup, channel: keyof AlertChannels) => (
    <td className="px-2 py-1 text-center">
      <label className="inline-flex h-11 w-11 cursor-pointer items-center justify-center">
        <input type="checkbox" className="h-5 w-5 cursor-pointer accent-[var(--accent)]"
          checked={groups[group][channel]}
          aria-label={t(lang, 'matrix.control').replace('{group}', t(lang, `group.${group}` as Key)).replace('{channel}', channelName(channel))}
          onChange={(e) => toggle(group, channel, e.target.checked)} />
      </label>
    </td>
  );

  return (
    <section aria-labelledby="matrix-title" className={`${panel} space-y-4 p-5`}>
      <div>
        <h2 id="matrix-title" className="font-semibold">{t(lang, 'matrix.title')}</h2>
        <p className="mt-0.5 max-w-prose text-sm leading-relaxed text-ink-soft">{t(lang, 'matrix.body')}</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-xs font-semibold text-ink-soft">
            <th scope="col" className="py-2 text-start font-semibold">{t(lang, 'matrix.kind')}</th>
            <th scope="col" className="w-16 px-2 py-2 text-center font-semibold">{t(lang, 'matrix.phone')}</th>
            {showWhatsApp && <th scope="col" className="w-20 px-2 py-2 text-center font-semibold">{t(lang, 'matrix.whatsapp')}</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((g) => (
            <tr key={g}>
              <th scope="row" className="py-1 text-start font-medium">{t(lang, `group.${g}` as Key)}</th>
              {cell(g, 'push')}
              {showWhatsApp && cell(g, 'whatsapp')}
            </tr>
          ))}
        </tbody>
      </table>
      {showWhatsApp && !whatsappOn && <p className="text-xs text-ink-soft">{t(lang, 'matrix.waOff')}</p>}

      <div className="flex items-start justify-between gap-4 border-t border-line pt-4">
        <div className="min-w-0">
          <label id="alert-preview-label" htmlFor="alert-preview" className="text-sm font-medium">{t(lang, 'matrix.preview')}</label>
          <p id="alert-preview-hint" className="mt-0.5 text-sm leading-relaxed text-ink-soft">{t(lang, 'matrix.previewHint')}</p>
        </div>
        <button id="alert-preview" type="button" role="switch" aria-checked={preview} aria-labelledby="alert-preview-label" aria-describedby="alert-preview-hint"
          onClick={() => togglePreview(!preview)}
          className={`relative mt-0.5 inline-flex h-7 w-12 before:absolute before:-inset-2 before:content-[''] shrink-0 items-center rounded-full transition-colors duration-150 ${preview ? 'bg-accent' : 'bg-ink/20'}`}>
          <span aria-hidden="true" className={`absolute top-1 h-5 w-5 rounded-full bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-[inset-inline-start] duration-150 ${preview ? 'start-6' : 'start-1'}`} />
        </button>
      </div>

      <p role="status" className={`text-sm ${status === 'failed' ? 'text-danger' : 'text-ink-soft'}`}>
        {status === 'saved' ? t(lang, 'matrix.saved') : status === 'failed' ? t(lang, 'push.failed') : ''}
      </p>
    </section>
  );
}
