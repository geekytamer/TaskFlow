import { t, type Key, type Lang } from '@/lib/i18n';
import type { ProposalStatus, RequestStatus } from '@/lib/requests';

type Tone = 'action' | 'done' | 'quiet';

const TONES: Record<Tone, string> = {
  action: 'bg-accent/10 text-accent',
  done: 'bg-ink text-white',
  quiet: 'bg-line text-ink-soft',
};

const REQUEST_TONE: Record<RequestStatus, Tone> = { in_review: 'quiet', proposal_ready: 'action', accepted: 'done', closed: 'quiet' };
const PROPOSAL_TONE: Record<ProposalStatus, Tone> = { sent: 'action', accepted: 'done', declined: 'quiet', expired: 'quiet' };

export function StatusBadge(
  props: { lang: Lang } & ({ request: RequestStatus } | { proposal: ProposalStatus }),
) {
  const [tone, key] = 'request' in props
    ? [REQUEST_TONE[props.request], `req.status.${props.request}`]
    : [PROPOSAL_TONE[props.proposal], `prop.status.${props.proposal}`];
  return (
    <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}>
      {t(props.lang, key as Key)}
    </span>
  );
}
