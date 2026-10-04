# Portal branch — five improvement iterations

Date: 2026-10-04. Branch `feature/peak-portal`. Each iteration: review, fix, verify (tests + browser where visible), commit, note the outcome here.

1. `code-review` (high) over the branch diff against `master`; fix confirmed findings.
2. `security-review`; fix confirmed findings (portals, public API, files, documents, money).
3. `impeccable` audit of both portals and the lobby (phone, Arabic/RTL, accessibility); fix.
4. `simplify` over the changed code; apply safe cleanups.
5. `superpowers:verification-before-completion` + `superpowers:finishing-a-development-branch`: full suites, production builds, docs and memory; stop before push (the user decides).

## Outcomes
1. **code-review** (`see commit after 77e2147`): 10 findings; 8 fixed with tests (stuck commission payouts, re-invited assignments, mixed-currency statement totals, cross-company referral owner, download status mapping, two N+1 scans, currency fetched via the catalogue); 2 not needed (submission version and referral cap races: handlers are synchronous in one process). Backend 396, portal 17.
2. **security-review**: no high-confidence vulnerabilities (confidence about 8/10). Checked: portal sessions and audience/company binding; contact scoping on every client and influencer route (files, messages, requests, proposals, campaigns, invoices, receipts, statements, assignments, payouts, referrals); allowlisted DTOs; staff record rules; the two dynamic SQL builders (fixed keys); escaped server HTML rendered with JavaScript off and all requests aborted; no `dangerouslySetInnerHTML`; file typing and sandboxed downloads; same-origin checks on every portal write. Noted, by design: the 0% markup profile shows the real rate (staff choice); reinvite links let a portal manager reset a portal password (part of the rule).
