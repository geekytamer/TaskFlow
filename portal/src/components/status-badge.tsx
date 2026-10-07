import { t, type Key, type Lang } from '@/lib/i18n';
import type { CampaignStatus, DeliverableView } from '@/lib/campaigns';
import type { ProposalStatus, RequestStatus } from '@/lib/requests';
import type { CommissionStatus, ReferralStatus } from '@/lib/referrals';
import type { InvoiceStatus } from '@/lib/billing';
import type { AssignmentStatus, InfluencerDeliverableStatus, Payout } from '@/lib/influencer-types';
import type { DealStatus } from '@/lib/workspace-types';

type Tone = 'action' | 'done' | 'quiet' | 'warn';

const TONES: Record<Tone, string> = {
  action: 'bg-accent/10 text-accent',
  done: 'bg-success/10 text-success',
  quiet: 'bg-ink/[0.06] text-ink-soft',
  // Something late or wrong; green would read as good news.
  warn: 'bg-danger/10 text-danger',
};

const REQUEST_TONE: Record<RequestStatus, Tone> = { in_review: 'quiet', proposal_ready: 'action', accepted: 'done', closed: 'quiet' };
const PROPOSAL_TONE: Record<ProposalStatus, Tone> = { sent: 'action', accepted: 'done', declined: 'quiet', expired: 'quiet' };
const CAMPAIGN_TONE: Record<CampaignStatus, Tone> = {
  planned: 'quiet', active: 'action', on_hold: 'warn', completed: 'done', cancelled: 'quiet', archived: 'quiet',
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

const DEAL_TONE: Record<DealStatus, Tone> = { lead: 'quiet', confirmed: 'action', delivered: 'quiet', paid: 'done', cancelled: 'quiet' };

const INVOICE_TONE: Record<InvoiceStatus, Tone> = { due: 'quiet', overdue: 'warn', partly_paid: 'quiet', paid: 'done' };

type Subject =
  | { request: RequestStatus }
  | { proposal: ProposalStatus }
  | { campaign: CampaignStatus }
  | { deliverable: DeliverableView }
  | { referral: ReferralStatus }
  | { commission: CommissionStatus }
  | { assignment: AssignmentStatus }
  | { work: InfluencerDeliverableStatus }
  | { payout: Payout['status'] }
  | { invoice: InvoiceStatus }
  | { deal: DealStatus };

function toneAndKey(subject: Subject): [Tone, string] {
  if ('request' in subject) return [REQUEST_TONE[subject.request], `req.status.${subject.request}`];
  if ('proposal' in subject) return [PROPOSAL_TONE[subject.proposal], `prop.status.${subject.proposal}`];
  if ('campaign' in subject) return [CAMPAIGN_TONE[subject.campaign], `camp.status.${subject.campaign}`];
  if ('referral' in subject) return [REFERRAL_TONE[subject.referral], `ref.status.${subject.referral}`];
  if ('assignment' in subject) return [ASSIGNMENT_TONE[subject.assignment], `asg.status.${subject.assignment}`];
  if ('deal' in subject) return [DEAL_TONE[subject.deal], `deal.status.${subject.deal}`];
  if ('invoice' in subject) return [INVOICE_TONE[subject.invoice], `bill.status.${subject.invoice}`];
  if ('payout' in subject) return [PAYOUT_TONE[subject.payout], `pay.status.${subject.payout}`];
  if ('work' in subject) return [WORK_TONE[subject.work], `idl.status.${subject.work}`];
  if ('commission' in subject) return [COMMISSION_TONE[subject.commission], `com.status.${subject.commission}`];
  return [DELIVERABLE_TONE[subject.deliverable], `del.status.${subject.deliverable}`];
}

export function StatusBadge(props: { lang: Lang } & Subject) {
  const [tone, key] = toneAndKey(props);
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>
      {t(props.lang, key as Key)}
    </span>
  );
}
