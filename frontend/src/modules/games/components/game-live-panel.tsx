'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  addGameSource,
  collectNow,
  importLikers,
  listGameAccounts,
  removeGameSource,
  setParticipants,
  type Game,
  type GameAccount,
  type GameSource,
  type ImportResult,
} from '@/services/gamesService';
import { AlertTriangle, RefreshCw, Trash2, Upload } from 'lucide-react';

type Tr = (en: string, ar: string) => string;
const num = new Intl.NumberFormat('en');

const ago = (tr: Tr, iso: string | null) => {
  if (!iso) return tr('not read yet', 'لم تُقرأ بعد');
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return tr('just now', 'الآن');
  if (mins < 60) return tr(`${mins} min ago`, `قبل ${mins} دقيقة`);
  const h = Math.round(mins / 60);
  return h < 48 ? tr(`${h} h ago`, `قبل ${h} ساعة`) : new Date(iso).toLocaleDateString();
};

const kindLabel = (tr: Tr, k: GameSource['kind']) => ({
  post: tr('Comments and replies on a post', 'التعليقات والردود على منشور'),
  tags: tr('Posts that tag the account', 'منشورات تشير إلى الحساب'),
  import: tr('Likers list (imported)', 'قائمة المعجبين (مستوردة)'),
})[k];

/**
 * Where a game's points come from. Followers games: connected accounts' posts,
 * tags, and likers lists staff import (Meta gives likes only as totals).
 * Creators games: the chosen influencers' own tagged posts and follower growth.
 */
export function GameLivePanel({ companyId, game, tr, locked, onChange, onError, onCollected }: {
  companyId: string; game: Game; tr: Tr; locked: boolean;
  onChange: (g: Game) => void; onError: (e: unknown) => void; onCollected: () => void;
}) {
  const id = React.useId();
  const [accounts, setAccounts] = React.useState<GameAccount[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [adding, setAdding] = React.useState<{ kind: GameSource['kind']; accountId: string; permalink: string }>({ kind: 'post', accountId: '', permalink: '' });
  const [importFor, setImportFor] = React.useState<string | null>(null);
  const [pasted, setPasted] = React.useState('');
  const [imported, setImported] = React.useState<ImportResult | null>(null);
  const [errors, setErrors] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!game.instagram) return;
    listGameAccounts(companyId).then(setAccounts).catch(() => setAccounts([]));
  }, [companyId, game.instagram]);

  const run = async (fn: () => Promise<Game | void>) => {
    setBusy(true);
    try {
      const next = await fn();
      if (next) onChange(next);
    } catch (error) { onError(error); } finally { setBusy(false); }
  };

  const lastRead = [...game.sources.map((s) => s.lastCollectedAt), ...game.participants.map((p) => p.stats?.updatedAt ?? null)]
    .filter(Boolean).sort().pop() ?? null;
  const hasInputs = game.audience === 'creators' ? game.participants.length > 0 : game.sources.some((s) => s.kind !== 'import');
  const needsLink = adding.kind !== 'tags';
  const needsAccount = adding.kind !== 'import';
  const canAdd = (!needsAccount || adding.accountId) && (!needsLink || /^https?:\/\/(www\.)?instagram\.com\//i.test(adding.permalink.trim()));
  const waitingFinal = game.status === 'ended' && !game.frozenAt && hasInputs;

  return (
    <section className="space-y-4 rounded-md border p-3" aria-labelledby={`${id}-h`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id={`${id}-h`} className="text-sm font-semibold">
            {game.audience === 'creators' ? tr('Participating influencers', 'المؤثرون المشاركون') : tr('Live data', 'البيانات المباشرة')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {hasInputs ? tr(`Last read ${ago(tr, lastRead)} · read hourly and when Instagram notifies us`, `آخر قراءة ${ago(tr, lastRead)} · كل ساعة وعند إشعار إنستغرام`) : tr('Nothing connected yet.', 'لا شيء متصل بعد.')}
          </p>
        </div>
        {game.instagram && hasInputs && !game.frozenAt && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => {
            const res = await collectNow(companyId, game.id);
            setErrors(res.errors);
            onCollected();
            return res;
          })}>
            <RefreshCw className={`me-1.5 h-4 w-4 ${busy ? 'animate-spin' : ''}`} />{tr('Read now', 'اقرأ الآن')}
          </Button>
        )}
      </div>

      {!game.instagram && (
        <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
          {tr('Instagram is not set up on this server yet, so only imported likers lists and awarded points count.', 'لم يُضبط إنستغرام على هذا الخادم بعد، لذا تُحتسب قوائم المعجبين المستوردة والنقاط الممنوحة فقط.')}
        </p>
      )}
      {waitingFinal && (
        <p className="rounded-md bg-amber-500/10 p-2 text-xs">
          {tr('Ended. Results freeze after one final read, so deleted comments do not count (at most 48 hours).', 'انتهت. تُجمَّد النتائج بعد قراءة أخيرة كي لا تُحتسب التعليقات المحذوفة (خلال 48 ساعة كحد أقصى).')}
        </p>
      )}
      {errors.length > 0 && (
        <ul className="space-y-1 rounded-md border border-destructive/40 p-2 text-xs text-destructive">
          {errors.map((e) => <li key={e} className="flex gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{e}</li>)}
        </ul>
      )}

      {game.audience === 'followers' && (
        <>
          {game.sources.length > 0 && (
            <ul className="divide-y rounded-md border">
              {game.sources.map((s) => (
                <li key={s.id} className="space-y-2 p-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{kindLabel(tr, s.kind)}</span>
                    {s.username && <span className="text-muted-foreground" dir="ltr"> · @{s.username}</span>}
                    {s.permalink && <a className="block truncate text-xs text-primary underline-offset-2 hover:underline" dir="ltr" href={s.permalink} target="_blank" rel="noopener noreferrer">{s.permalink}</a>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="tabular-nums">{num.format(s.interactions)} {s.kind === 'import' ? tr('likes', 'إعجاب') : tr('counted', 'محتسبة')}</Badge>
                    <span className="me-auto text-xs text-muted-foreground">{ago(tr, s.lastCollectedAt)}</span>
                    {s.kind === 'import' && !locked && (
                      <Button size="sm" variant="outline" onClick={() => { setImportFor(importFor === s.id ? null : s.id); setPasted(''); setImported(null); }}>
                        <Upload className="me-1 h-3.5 w-3.5" />{tr('Import likers', 'استيراد المعجبين')}
                      </Button>
                    )}
                    {!locked && (
                      <Button size="icon" variant="ghost" className="h-11 w-11" aria-label={tr('Remove source', 'إزالة المصدر')} disabled={busy}
                        onClick={() => { if (window.confirm(tr('Remove this source and the points it brought in?', 'إزالة هذا المصدر والنقاط التي جلبها؟'))) void run(() => removeGameSource(companyId, game.id, s.id)); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {s.accountStatus && s.accountStatus !== 'active' && (
                    <p className="flex gap-1.5 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {tr(`@${s.username ?? ''} must reconnect Instagram from the influencer portal before this source can be read.`, `يجب على @${s.username ?? ''} إعادة ربط إنستغرام من بوابة المؤثرين لقراءة هذا المصدر.`)}
                    </p>
                  )}
                  {s.lastError && <p className="flex gap-1.5 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{s.lastError}</p>}
                  {importFor === s.id && (
                    <div className="space-y-2 rounded-md bg-muted/50 p-2">
                      <Label htmlFor={`${id}-paste`} className="text-xs">
                        {tr('Open the post’s likes on Instagram, copy the list (or export a CSV) and paste it here. One handle per line; @handles and profile links work. Importing again replaces the list.', 'افتح قائمة الإعجابات للمنشور في إنستغرام وانسخها (أو صدّر ملف CSV) والصقها هنا. اسم مستخدم في كل سطر؛ تعمل الصيغة @ وروابط الملفات. الاستيراد مجددًا يستبدل القائمة.')}
                      </Label>
                      <Textarea id={`${id}-paste`} rows={6} dir="ltr" className="font-mono text-xs" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'@sara.k\nomar_1\nhttps://www.instagram.com/laila_m/'} />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-xs text-primary">
                          <input type="file" accept=".csv,.txt,text/plain,text/csv" className="sr-only" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) setPasted(await file.text());
                          }} />
                          <Upload className="h-3.5 w-3.5" />{tr('Or choose a CSV/TXT file', 'أو اختر ملف CSV/TXT')}
                        </label>
                        <Button size="sm" disabled={busy || !pasted.trim()} onClick={() => run(async () => {
                          const res = await importLikers(companyId, game.id, s.id, pasted);
                          setImported(res.imported);
                          onCollected();
                          return res;
                        })}>{tr('Import', 'استيراد')}</Button>
                      </div>
                      {imported && (
                        <p className="text-xs" role="status">
                          {tr(`${num.format(imported.total)} likers · ${imported.added} new · ${imported.removed} removed`, `${num.format(imported.total)} معجب · ${imported.added} جديد · ${imported.removed} أزيل`)}
                          {imported.skippedCount > 0 && (
                            <span className="block text-muted-foreground">
                              {tr(`Skipped ${imported.skippedCount} lines that are not handles: `, `تُجوهل ${imported.skippedCount} سطر ليست أسماء مستخدمين: `)}
                              <span dir="ltr">{imported.skipped.join(', ')}</span>
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!locked && (
            <form className="flex flex-wrap items-end gap-2 rounded-md bg-muted/40 p-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const g = await addGameSource(companyId, game.id, {
                    kind: adding.kind, ...(needsAccount ? { accountId: adding.accountId } : {}), ...(needsLink ? { permalink: adding.permalink.trim() } : {}),
                  });
                  setAdding((a) => ({ ...a, permalink: '' }));
                  return g;
                });
              }}>
              <div className="min-w-[200px] flex-1 space-y-1">
                <Label htmlFor={`${id}-kind`} className="text-xs">{tr('Add a source', 'أضف مصدرًا')}</Label>
                <Select value={adding.kind} onValueChange={(v) => setAdding((a) => ({ ...a, kind: v as GameSource['kind'] }))}>
                  <SelectTrigger id={`${id}-kind`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {game.instagram && <SelectItem value="post">{kindLabel(tr, 'post')}</SelectItem>}
                    {game.instagram && <SelectItem value="tags">{kindLabel(tr, 'tags')}</SelectItem>}
                    <SelectItem value="import">{kindLabel(tr, 'import')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {needsAccount && (
                <div className="min-w-[200px] flex-1 space-y-1">
                  <Label htmlFor={`${id}-acct`} className="text-xs">{tr('Connected account', 'الحساب المتصل')}</Label>
                  <Select value={adding.accountId} onValueChange={(v) => setAdding((a) => ({ ...a, accountId: v }))}>
                    <SelectTrigger id={`${id}-acct`}><SelectValue placeholder={accounts.length ? tr('Choose', 'اختر') : tr('None connected', 'لا يوجد')} /></SelectTrigger>
                    <SelectContent>{accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id} disabled={a.status !== 'active'}>
                        @{a.username}{a.contactName ? ` · ${a.contactName}` : ''}{a.status !== 'active' ? ` · ${tr('must reconnect', 'يجب إعادة الربط')}` : ''}
                      </SelectItem>
                    ))}</SelectContent>
                  </Select>
                </div>
              )}
              {needsLink && (
                <div className="min-w-[260px] flex-[2] space-y-1">
                  <Label htmlFor={`${id}-link`} className="text-xs">{tr('Post link', 'رابط المنشور')}</Label>
                  <Input id={`${id}-link`} dir="ltr" inputMode="url" placeholder="https://www.instagram.com/p/…" value={adding.permalink} onChange={(e) => setAdding((a) => ({ ...a, permalink: e.target.value }))} />
                </div>
              )}
              <Button type="submit" className="h-10 min-w-20" disabled={busy || !canAdd}>{tr('Add', 'إضافة')}</Button>
            </form>
          )}
          {game.instagram && accounts.length === 0 && !locked && (
            <p className="text-xs text-muted-foreground">{tr('Posts and tags need an Instagram account connected from the influencer portal (Profile → Connected accounts).', 'تحتاج المنشورات والوسوم إلى حساب إنستغرام متصل من بوابة المؤثرين (الملف الشخصي ← الحسابات المتصلة).')}</p>
          )}
        </>
      )}

      {game.audience === 'creators' && (
        <CreatorsSection companyId={companyId} game={game} tr={tr} locked={locked} accounts={accounts} busy={busy} run={run} />
      )}
    </section>
  );
}

function CreatorsSection({ companyId, game, tr, locked, accounts, busy, run }: {
  companyId: string; game: Game; tr: Tr; locked: boolean; accounts: GameAccount[]; busy: boolean; run: (fn: () => Promise<Game | void>) => Promise<void>;
}) {
  const id = React.useId();
  const current = game.participants.map((p) => p.contactId);
  const [picked, setPicked] = React.useState<string[]>(current);
  React.useEffect(() => setPicked(game.participants.map((p) => p.contactId)), [game.participants]);
  const people = [...new Map([
    ...game.participants.map((p) => [p.contactId, { contactId: p.contactId, name: p.name, username: p.username }] as const),
    ...accounts.map((a) => [a.contactId, { contactId: a.contactId, name: a.contactName, username: a.username }] as const),
  ]).values()];
  const changed = [...picked].sort().join() !== [...current].sort().join();

  return (
    <div className="space-y-3">
      {!game.tag && <p className="text-xs text-destructive">{tr('Set the game tag (Edit) so we know which posts count.', 'حدّد وسم اللعبة (تعديل) لنعرف أي المنشورات تُحتسب.')}</p>}
      {game.tag && <p className="text-xs text-muted-foreground">{tr('Counts posts in the game window whose caption includes ', 'تُحتسب المنشورات خلال فترة اللعبة التي يتضمن نصها ')}<b dir="ltr">{game.tag}</b>.</p>}
      {game.participants.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-2 text-start font-medium">{tr('Influencer', 'المؤثر')}</th>
                <th className="p-2 text-end font-medium">{tr('Posts', 'المنشورات')}</th>
                <th className="p-2 text-end font-medium">{tr('Views', 'المشاهدات')}</th>
                <th className="p-2 text-end font-medium">{tr('Shares', 'المشاركات')}</th>
                <th className="p-2 text-end font-medium">{tr('Engagement', 'التفاعل')}</th>
                <th className="p-2 text-end font-medium">{tr('New followers', 'متابعون جدد')}</th>
              </tr>
            </thead>
            <tbody className="divide-y tabular-nums">
              {game.participants.map((p) => (
                <tr key={p.contactId}>
                  <td className="p-2">
                    <span dir="auto">{p.name ?? '—'}</span>
                    {p.username && <span className="block text-xs text-muted-foreground" dir="ltr">@{p.username}</span>}
                    {p.accountStatus !== 'active' && <span className="block text-xs text-destructive">{p.accountStatus === 'needs_reconnect' ? tr('Must reconnect Instagram', 'يجب إعادة ربط إنستغرام') : tr('Instagram not connected', 'إنستغرام غير متصل')}</span>}
                  </td>
                  {p.stats ? (
                    <>
                      <td className="p-2 text-end">{num.format(p.stats.posts)}</td>
                      <td className="p-2 text-end">{num.format(p.stats.views)}</td>
                      <td className="p-2 text-end">{num.format(p.stats.shares)}</td>
                      <td className="p-2 text-end">{num.format(p.stats.engagement)}</td>
                      <td className="p-2 text-end">{p.stats.followerGrowth > 0 ? '+' : ''}{num.format(p.stats.followerGrowth)}</td>
                    </>
                  ) : <td colSpan={5} className="p-2 text-end text-xs text-muted-foreground">{tr('not read yet', 'لم تُقرأ بعد')}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!locked && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium">{tr('Who takes part (influencers with Instagram connected)', 'من يشارك (مؤثرون متصلون بإنستغرام)')}</legend>
          {people.length === 0 && <p className="text-xs text-muted-foreground">{tr('No influencer has connected Instagram yet.', 'لم يربط أي مؤثر إنستغرام بعد.')}</p>}
          <div className="grid gap-1 sm:grid-cols-2">
            {people.map((p) => (
              <label key={p.contactId} htmlFor={`${id}-${p.contactId}`} className="flex min-h-11 items-center gap-2 rounded-md px-2 text-sm hover:bg-muted">
                <Checkbox id={`${id}-${p.contactId}`} checked={picked.includes(p.contactId)}
                  onCheckedChange={(v) => setPicked((all) => (v === true ? [...all, p.contactId] : all.filter((x) => x !== p.contactId)))} />
                <span dir="auto">{p.name ?? '—'}</span>
                {p.username && <span className="text-xs text-muted-foreground" dir="ltr">@{p.username}</span>}
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <Button size="sm" disabled={busy || !changed} onClick={() => run(() => setParticipants(companyId, game.id, picked))}>{tr('Save participants', 'حفظ المشاركين')}</Button>
          </div>
        </fieldset>
      )}
    </div>
  );
}
