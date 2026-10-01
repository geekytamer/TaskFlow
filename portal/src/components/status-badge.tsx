import { t, type Key, type Lang } from '@/lib/i18n';
import type { CampaignStatus, DeliverableView } from '@/lib/campaigns';
import type { ProposalStatus, RequestStatus } from '@/lib/requests';
import type { CommissionStatus, ReferralStatus } from '@/lib/referrals';

type Tone = 'action' | 'done' | 'quiet';

const TONES: Record<Tone, string> = {
  action: 'bg-accent/10 text-accent',
  done: 'bg-ink text-white',
  quiet: 'bg-line text-ink-soft',
};

const REQUEST_TONE: Record<RequestStatus, Tone> = { in_review: 'quiet', proposal_ready: 'action', accepted: 'done', closed: 'quiet' };
const PROPOSAL_TONE: Record<ProposalStatus, Tone> = { sent: 'action', accepted: 'done', declined: 'quiet', expired: 'quiet' };
const CAMPAIGN_TONE: Record<CampaignStatus, Tone> = {
  planned: 'quiet', active: 'done', on_hold: 'quiet', completed: 'quiet', cancelled: 'quiet', archived: 'quiet',
};
const DELIVERABLE_TONE: Record<DeliverableView, Tone> = {
  planned: 'quiet', in_progress: 'quiet', ready_for_review: 'action', approved: 'done', published: 'done', cancelled: 'quiet',
  you_approved: 'done', changes_requested: 'quiet',
};

const REFERRAL_TONE: Record<ReferralStatus, Tone> = { received: 'quiet', taken_forward: 'action', won: 'done', closed: 'quiet', not_pursued: 'quiet' };
const COMMISSION_TONE: Record<CommissionStatus, Tone> = { pending: 'quiet', approved: 'action', paid: 'done', voided: 'quiet' };

type Subject =
  | { request: RequestStatus }
  | { proposal: ProposalStatus }
  | { campaign: CampaignStatus }
  | { deliverable: DeliverableView }
  | { referral: ReferralStatus }
  | { commission: CommissionStatus };

function toneAndKey(subject: Subject): [Tone, string] {
  if ('request' in subject) return [REQUEST_TONE[subject.request], `req.status.${subject.request}`];
  if ('proposal' in subject) return [PROPOSAL_TONE[subject.proposal], `prop.status.${subject.proposal}`];
  if ('campaign' in subject) return [CAMPAIGN_TONE[subject.campaign], `camp.status.${subject.campaign}`];
  if ('referral' in subject) return [REFERRAL_TONE[subject.referral], `ref.status.${subject.referral}`];
  if ('commission' in subject) return [COMMISSION_TONE[subject.commission], `com.status.${subject.commission}`];
  return [DELIVERABLE_TONE[subject.deliverable], `del.status.${subject.deliverable}`];
}

export function StatusBadge(props: { lang: Lang } & Subject) {
  const [tone, key] = toneAndKey(props);
  return (
    <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}>
      {t(props.lang, key as Key)}
    </span>
  );
}
