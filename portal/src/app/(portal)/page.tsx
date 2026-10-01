import { Dashboard } from '@/components/dashboard';
import { getAudience } from '@/lib/audience';
import { getCampaigns } from '@/lib/campaigns';
import { getAssignments, getPayouts } from '@/lib/influencer';
import { getMessages } from '@/lib/messages';
import { requireMe } from '@/lib/portal';
import { getProposals } from '@/lib/requests';
import { currentLang } from '@/lib/session';

export default async function Home() {
  const audience = getAudience();
  const me = await requireMe(audience);
  const lang = await currentLang();
  if (audience !== 'client') {
    const [assignments, payouts, messages] = await Promise.all([getAssignments(), getPayouts(), getMessages()]);
    const soon = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const work = assignments.filter((a) => a.status === 'confirmed').flatMap((a) => a.deliverables.map((d) => ({ ...d, campaign: a.campaign.name })));
    const attention = [
      ...work
        .filter((d) => d.latestSubmission?.feedback?.decision === 'changes_requested' && d.status === 'in_progress')
        .map((d) => ({ key: `changes-${d.id}`, kind: 'changes' as const, title: d.title, detail: d.campaign, href: `/assignments#work-${d.id}` })),
      ...work
        .filter((d) => (d.status === 'planned' || (d.status === 'in_progress' && !d.latestSubmission)) && d.dueDate && new Date(d.dueDate).getTime() <= soon)
        .map((d) => ({ key: `due-${d.id}`, kind: 'due' as const, title: d.title, detail: d.campaign, dueDate: d.dueDate, href: `/assignments#work-${d.id}` })),
      // Derived, not tracked: the team wrote last, so there is something to read.
      ...(messages.length > 0 && messages[messages.length - 1].author.kind === 'team'
        ? [{ key: 'replied', kind: 'replied' as const, title: '', detail: messages[messages.length - 1].body.slice(0, 120), href: '/messages' }]
        : []),
    ];
    return <Dashboard me={me} lang={lang} audience={audience} assignments={assignments} attention={attention} payouts={payouts.slice(0, 3)} />;
  }

  const [proposals, campaigns] = await Promise.all([getProposals(), getCampaigns()]);
  const waiting = proposals.find((p) => p.status === 'sent');
  return (
    <Dashboard
      me={me}
      lang={lang}
      audience={audience}
      waiting={waiting ? { id: waiting.id, title: waiting.title } : undefined}
      campaigns={campaigns}
    />
  );
}
