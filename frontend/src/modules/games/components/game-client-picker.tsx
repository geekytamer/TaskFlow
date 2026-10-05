'use client';

import * as React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getContacts } from '@/services/contactService';
import { setGameClient, type Game } from '@/services/gamesService';

type Tr = (en: string, ar: string) => string;
const NONE = '__none__';

/**
 * The brand a game was run for. Its client portal users then read the game's
 * report (status, interactions, top fans, results) without being added as viewers.
 */
export function GameClientPicker({ companyId, game, tr, onChange, onError }: {
  companyId: string; game: Game; tr: Tr; onChange: (g: Game) => void; onError: (e: unknown) => void;
}) {
  const id = React.useId();
  const [clients, setClients] = React.useState<Array<{ id: string; name: string }> | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    getContacts(companyId, 'Client')
      .then((list) => { if (live) setClients(list.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name))); })
      .catch((error) => { if (live) { setClients([]); onError(error); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const value = game.clientContactId ?? NONE;
  // A linked client the list cannot show (not loaded yet, or no longer a client) still reads by name.
  const options = clients ?? [];
  const missing = game.clientContactId && !options.some((c) => c.id === game.clientContactId)
    ? [{ id: game.clientContactId, name: game.clientName ?? tr('Unknown client', 'عميل غير معروف') }] : [];

  return (
    <section className="space-y-2 rounded-md border p-4">
      <Label htmlFor={`${id}-client`}>{tr('Brand (client)', 'العلامة التجارية (العميل)')}</Label>
      <Select
        value={value}
        disabled={busy || clients === null}
        onValueChange={async (next) => {
          setBusy(true);
          try { onChange(await setGameClient(companyId, game.id, next === NONE ? null : next)); } catch (error) { onError(error); } finally { setBusy(false); }
        }}
      >
        <SelectTrigger id={`${id}-client`} className="sm:max-w-sm"><SelectValue placeholder={tr('Loading clients…', 'جارٍ تحميل العملاء…')} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{tr('Not linked', 'غير مرتبطة')}</SelectItem>
          {[...missing, ...options].map((c) => <SelectItem key={c.id} value={c.id}><span dir="auto">{c.name}</span></SelectItem>)}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {tr(
          'People with client portal access for this brand see the game and its report: interactions, top fans and final results. Never moderation notes or exclusions.',
          'يرى مستخدمو بوابة العملاء لهذه العلامة المسابقة وتقريرها: التفاعلات وأكثر المتابعين تفاعلاً والنتائج النهائية. ولا يرون ملاحظات الإشراف أو الاستبعادات.',
        )}
      </p>
    </section>
  );
}
