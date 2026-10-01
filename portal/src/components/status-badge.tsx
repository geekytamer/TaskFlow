import { t, type Key, type Lang } from '@/lib/i18n';
import type { CampaignStatus, DeliverableView } from '@/lib/campaigns';
import type { ProposalStatus, RequestStatus } from '@/lib/requests';
import type { CommissionStatus, ReferralStatus } from '@/lib/referrals';
import type { AssignmentStatus, InfluencerDeliverableStatus, Payout } from '@/lib/influencer-types';

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

const ASSIGNMENT_TONE: Record<AssignmentStatus, Tone> = { awaiting_reply: 'action', confirmed: 'done', declined: 'quiet', cancelled: 'quiet', completed: 'quiet' };
const WORK_TONE: Record<InfluencerDeliverableStatus, Tone> = { planned: 'quiet', in_progress: 'quiet', submitted: 'quiet', approved: 'done', published: 'done', cancelled: 'quiet' };

const PAYOUT_TONE: Record<Payout['status'], Tone> = { pending: 'quiet', approved: 'action', paid: 'done' };

type Subject =
  | { request: RequestStatus }
  | { proposal: ProposalStatus }
  | { campaign: CampaignStatus }
  | { deliverable: DeliverableView }
  | { referral: ReferralStatus }
  | { commission: CommissionStatus }
  | { assignment: AssignmentStatus }
  | { work: InfluencerDeliverableStatus }
  | { payout: Payout['status'] };

function toneAndKey(subject: Subject): [Tone, string] {
  if ('request' in subject) return [REQUEST_TONE[subject.request], `req.status.${subject.request}`];
  if ('proposal' in subject) return [PROPOSAL_TONE[subject.proposal], `prop.status.${subject.proposal}`];
  if ('campaign' in subject) return [CAMPAIGN_TONE[subject.campaign], `camp.status.${subject.campaign}`];
  if ('referral' in subject) return [REFERRAL_TONE[subject.referral], `ref.status.${subject.referral}`];
  if ('assignment' in subject) return [ASSIGNMENT_TONE[subject.assignment], `asg.status.${subject.assignment}`];
  if ('payout' in subject) return [PAYOUT_TONE[subject.payout], `pay.status.${subject.payout}`];
  if ('work' in subject) return [WORK_TONE[subject.work], `idl.status.${subject.work}`];
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
