# Client Portal UX, Brand Games Report and Analytics — Design Note

Date: 2026-10-05. Branch `feature/client-portal-ux` (from `feature/peak-portal`).
Spec: `../specs/2026-10-05-client-portal-ux-and-games-report-design.md`. Plan: `2026-10-05-client-portal-ux-games-analytics.md`.
Screenshots: `screens/2026-10-05/` (00 = before; the rest after, at 375px and 1280px, English and Arabic).

## Why

An impeccable critique of the client portal (two independent assessments) scored it 20/40.
The look was calm and nothing leaked, but the work did not flow. The main problems:

- A client could not find out how to pay an invoice.
- A proposal sent without a request could not be found again.
- The overview showed three equal calls to action.
- The phone menu hid Billing and Games behind a sideways scroll.
- There were no loading or error states.
- A brand's own restricted game answered "Page not found".

## What changed

**Shell.**
- Desktop has a sidebar with every page, and the account, language and sign out at its foot.
- Phones have a slim top bar and a bottom bar with Home, Campaigns, Influencers, Messages and More. More is a sheet holding the remaining pages and the account.
- Counts appear only where a record waits on the reader: content to review, proposals to answer, assignments to reply to.
- Every portal route has a loading skeleton, an error page with a working Try again, and a 404 that stays inside the shell.
- Backend reads time out after 10 seconds. Before this, a slow backend left a blank page with no feedback; this was found by pausing the backend.

**Look.**
- Peak's own brand, taken from a screenshot of peak-creative.agency (the site itself is blocked by this environment's network policy):
  - near-black ground (#050505) with slightly lifted panels (#0f0e0d)
  - Peak orange (#ee7103) for actions, selection and state
  - white type, warm hairlines, and one soft orange glow from the top corner
- Finish and structure follow Stripe Dashboard and Mercury: figures in tabular numerals, 44px controls, one radius scale.
- Every token was contrast-checked: secondary text is at least 7:1 and input borders at least 3:1. White on Peak orange is only 3:1, so text on orange buttons is near-black (6.7:1). This differs slightly from the website.
- Chart colours are re-validated for the dark surface; all four series reach 3:1.
- Fonts stay Manrope and IBM Plex Sans Arabic until Peak's typefaces are confirmed.
- Peak's logo, recoloured for the dark ground (grey shapes to the portal's white, orange kept), ships in `portal/public/brand`: the full logo for the sidebar and sign-in, the P-mark alone for phone headers. Deployments point at them with `PORTAL_LOGO_URL` and `PORTAL_MARK_URL` (set in `deploy/portal/ecosystem.portal.cjs`); without them the company's own logo is used.
- Short names (people, campaigns) use `<bdi>`, so Latin names sit at the right edge in Arabic. `dir="auto"` stays on prose.
- In Arabic, time on every chart runs right to left.

**Screens.**
- Home: one ranked "Needs you" list (overdue money, then proposals, then content to review) with a single primary button. Below it:
  - outstanding and overdue totals per currency
  - campaigns running or planned
  - the latest message from the team
  - progress bars per campaign
- Influencers:
  - Clients tick several creators and request them together; the shortlist lives in the URL.
  - Filters fold away on phones.
  - Rows show followers, average views and engagement.
- Requests and proposals: one page with proposals waiting for an answer first, including ones that did not start as a request.
- Campaigns:
  - A summary of how many pieces are to review, in progress and live, with content to review listed first.
  - Approving takes an explicit second step, and the row then says the team was told.
- Billing:
  - Outstanding and overdue totals, and an Unpaid/All switch.
  - Each open invoice has **How to pay**: the bank accounts and instructions printed on that invoice's issued template, with copy buttons for the reference, IBAN and account number, and a pointer to send proof in Messages.
- Messages: the thread opens on the latest 30 messages. The WhatsApp alerts card sits below the composer and folds to one line once on.
- Referrals: the list comes first, and the form opens from a button once the client has sent any.

**Brand games report (new).**
- Staff link a game to a client in the staff games page. This is migration `099_game_client_link`, a nullable `games.clientContactId`.
- That client's portal users see the game without being viewers. The games page lists "Your games" first, and each game opens as a report:
  - status, players, interactions by type
  - a daily stacked chart: validated palette, worded legend, table view
  - the game posts
  - top fans
  - once final: winners, a results CSV (formula-safe, UTF-8 BOM) and a PDF summary rendered like receipts
- Removed comments never count. Interactions by excluded accounts are left out of the totals too, so the gap never hints at an exclusion.

**Analytics (new, both portals).**
- Clients can filter by period and campaign. The page shows:
  - verified results and views by week
  - figures by influencer (no money) and by platform
  - cost per 1,000 views and per engagement, from the client's own invoices net of credit notes, over each campaign's lifetime results
- Influencers see:
  - followers, reach, views and engaged accounts with a followers line, drawn from one account
  - audience by country, age and gender
  - each Peak post at 24h, 7 days and 30 days, with averages
  - payouts by month: paid in the month paid, pending in the month due

## Secrecy

Every new client- or influencer-readable answer is an allow-listed DTO with a poison test, and each guard was mutation-checked: broken, seen to fail, restored.

| Guard | Test | Mutation |
| --- | --- | --- |
| Brand report: ownership, exclusions, no staff board | `brand-games.test.js` | drop client check, drop exclusion filter, return staff board: red each |
| Results CSV formula neutralising | `brand-games.test.js` | remove neutraliser: red |
| Client analytics: ownership, no money per creator, confirmed creators only | `portal-analytics.test.js` | each: red |
| Influencer analytics: own accounts, own posts | `portal-analytics.test.js` | each: red |
| How to pay: only instructions and bank fields | `portal-billing.test.js` | spread the whole account: red |

Never returned:
- integrity flags
- exclusion kinds, reasons or handles
- award reasons and who gave them
- staff names
- source account ids and errors
- likers-capture gaps
- rates, costs, prices, budgets
- template terms and signatures
- other clients' or influencers' figures

## Decisions taken on the owner's behalf

- Cost per result divides each campaign's invoices by all its results, not only those in the chosen period. Dividing a whole invoice by part of what it bought would mislead.
- The weekly chart shows views only, because two scales on one axis is ruled out. Engagements are in the figures and tables.
- Charts are HTML bars and an SVG line with native tooltips plus a table view. There is no chart library.
- The WhatsApp alerts card moved below the message composer.
- Influencer growth follows the account with the longest history when more than one is connected.

## Verification

- Backend 459/459.
- Portal 34/34.
- Typecheck for the portal and staff app, and eslint on `frontend/src/modules/games`.
- Client portal production build.
- The impeccable detector found nothing.
- Every changed screen was driven in a browser at 375px and 1280px in English and Arabic, including empty, loading, error and full states, the approve confirmation, the staff brand picker, the influencer portal and the public lobby.
- A fresh-context code review found 6 issues; all are fixed with tests.

## Open

- Peak's typefaces: colours and logo are in; fonts stay Manrope and IBM Plex Sans Arabic until confirmed.
- Impeccable can write a `DESIGN.md` from the built system once the brand values are in.
