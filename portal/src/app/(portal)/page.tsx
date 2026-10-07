import { ClientHome } from '@/components/client-home';
import { Dashboard } from '@/components/dashboard';
import { rankNeedsYou } from '@/lib/needs-you';
import { sumByCurrency } from '@/lib/money';
import { getAudience } from '@/lib/audience';
import { getCampaigns } from '@/lib/campaigns';
import { getAssignments, getPayouts } from '@/lib/influencer';
import { getInvoices } from '@/lib/billing';
import { getMessages } from '@/lib/messages';
import { getCalendar } from '@/lib/workspace';
import { getSocialAccounts } from '@/lib/social';
import { ConnectNudge } from '@/components/connect-nudge';
import { requireMe } from '@/lib/portal';
import { getProposals } from '@/lib/requests';
import { currentLang } from '@/lib/session';

export default async function Home() {
  const audience = getAudience();
  const me = await requireMe(audience);
  const lang = await currentLang();
  if (audience !== 'client') {
    const today = new Date().toISOString().slice(0, 10);
    const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [assignments, payouts, messages, calendar] = await Promise.all([
      getAssignments(), getPayouts(), getMessages(), getCalendar(today, weekAhead).catch(() => null),
    ]);
    const social = await getSocialAccounts().catch(() => null);
    const nudge = social && !social.some((a) => a.status === 'active' || a.status === 'needs_reconnect') ? <ConnectNudge lang={lang} /> : null;
    const soon = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const work = assignments.filter((a) => a.status === 'confirmed').flatMap((a) => a.deliverables.map((d) => ({ ...d, campaign: a.campaign.name, assignmentId: a.id })));
    const attention = [
      ...work
        .filter((d) => d.latestSubmission?.feedback?.decision === 'changes_requested' && d.status === 'in_progress')
        .map((d) => ({ key: `changes-${d.id}`, kind: 'changes' as const, title: d.title, detail: d.campaign, href: `/deals/peak-${d.assignmentId}#work-${d.id}` })),
      ...work
        .filter((d) => (d.status === 'planned' || (d.status === 'in_progress' && !d.latestSubmission)) && d.dueDate && new Date(d.dueDate).getTime() <= soon)
        .map((d) => ({ key: `due-${d.id}`, kind: 'due' as const, title: d.title, detail: d.campaign, dueDate: d.dueDate, href: `/deals/peak-${d.assignmentId}#work-${d.id}` })),
      // Their own deliverables, overdue or due this week (Peak's are above).
      ...(calendar ? [...calendar.overdue, ...calendar.items] : [])
        .filter((i) => i.source === 'own' && !i.done)
        .map((i) => ({ key: `own-${i.id}`, kind: 'due' as const, title: i.title, detail: i.dealTitle, dueDate: i.dueDate, href: `/deals/${i.dealId}` })),
      // Derived, not tracked: the team wrote last, so there is something to read.
      ...(messages.length > 0 && messages[messages.length - 1].author.kind === 'team'
        ? [{ key: 'replied', kind: 'replied' as const, title: '', detail: messages[messages.length - 1].body.slice(0, 120), href: '/messages' }]
        : []),
    ];
    return <Dashboard me={me} lang={lang} audience={audience} assignments={assignments} attention={attention} payouts={payouts.slice(0, 3)} nudge={nudge} />;
  }

  const [proposals, campaigns, invoices, messages] = await Promise.all([getProposals(), getCampaigns(), getInvoices(), getMessages()]);
  const now = Date.now();
  const unpaid = invoices.filter((i) => i.status !== 'paid' && i.outstanding > 0);
  const overdue = unpaid.filter((i) => i.status === 'overdue');
  const items = rankNeedsYou({
    overdue: overdue.map((i) => ({ id: i.id, number: i.number, outstanding: i.outstanding, currency: i.currency, daysLate: i.dueDate ? Math.max(1, Math.floor((now - Date.parse(i.dueDate)) / 86_400_000)) : 1 })),
    proposals: proposals.filter((p) => p.status === 'sent').map((p) => ({ id: p.id, title: p.title })),
    reviews: campaigns.map((c) => ({ campaignId: c.id, name: c.name, count: c.deliverables.awaitingReview })),
  });
  const owed = sumByCurrency(unpaid.map((i) => ({ currency: i.currency, amount: i.outstanding })));
  const late = sumByCurrency(overdue.map((i) => ({ currency: i.currency, amount: i.outstanding })));
  const balances = owed.map((b) => ({ currency: b.currency, outstanding: b.amount, overdue: late.find((l) => l.currency === b.currency)?.amount ?? 0 }));
  const lastTeamMessage = [...messages].reverse().find((m) => m.author.kind === 'team') ?? null;
  return (
    <ClientHome lang={lang} firstName={me.user.name.split(/\s+/)[0]} items={items} campaigns={campaigns} balances={balances} lastTeamMessage={lastTeamMessage} />
  );
}
