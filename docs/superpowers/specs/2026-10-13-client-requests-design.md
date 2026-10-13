# Client portal requests — review and fix

Date: 2026-10-13. Owner asked to find the weaknesses and fix them without consulting.

## Weaknesses found

1. **Peak could not answer a request.** The staff proposals page was removed in 59a078d; proposals are the only answer a client sees. Production had 1 request and 0 proposals ever. Requests stayed "In review" forever.
2. No place for requests: each was only an opportunity titled "Portal request: …" among the pipeline.
3. The brief was a plain-text blob in the opportunity notes, visible only inside its edit form, easy to overwrite.
4. Shortlisted influencers were plain names, not linked.
5. Files the client attached could not be opened by staff (names only).
6. The new-request alert opened Follow-ups, not the request.
7. No way to decline: no "we can't take this on" with a reason the client reads.
8. Client side: the Requests list showed only title, status and date; a request page had no sense of progress, and a closed request gave no reason.

## Decisions (built)

- Staff page **CRM → Client requests** (`/crm/client-requests`, Admin/Manager, `contacts:portal.manage`): tabs by status (Open, Needs a proposal, Proposal with client, Accepted, Closed, All), each row with client, sender, age, budget, dates, counts of influencers, files and proposals, and the owner.
- Request panel: the brief laid out, the shortlist linked (roster → contact; Discover → directory, marked "Not on the roster yet"), client files downloadable, proposals with their status, **Write proposal** (lines, valid until, note; Send to client or Save draft; Send on drafts), and **Can't take this on** with a reason (opportunity → Lost; client sees "closed" and Peak's note; alert event `request`); Reopen.
- New-request notifications open the request (`/crm/client-requests?open=<id>`).
- Client portal: list rows show budget, dates, influencer count and the next step; request page shows a Sent → Proposal → Your decision progress line and Peak's note when closed.
- Migration `130_request_close_reason` (closedReason, closedAt, closedByUserId on portal_campaign_requests).
