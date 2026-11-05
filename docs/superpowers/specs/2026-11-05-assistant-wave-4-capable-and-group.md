# Assistant Wave 4: capable, and at home in a group

On 2026-11-05 the owner asked to "make the agent as capable as possible, keeping in mind integrity and safety of data with permissions and roles", and said the assistant "in a group looks bad", proposing "a context switcher in the assistant to select [the] authorized list of companies for the user, that includes the group itself". Photos and voice move to Wave 5. Nothing is deployed until the owner says so.

These are my decisions, per the owner's standing "decide, don't ask".

## Why the group view looks bad

When the app's selected company is a group, every page that isn't group-aware is drawn once per member company (`GroupPageFrame` → `PerCompany`). `/assistant` was one of those pages, so the whole chat appeared once for each company.

## A. The assistant's own context switcher

- **What it lists:** a picker in the assistant's header (on the page and in the panel) showing the companies the person can open. Each group they can open comes first as "Whole group", followed by its companies; standalone companies come after.
- **Default:** the app's selected company. Choosing in the assistant does **not** change the app's company. The choice is remembered per person.
- **One context per conversation:** a conversation belongs to one context (a company, or a whole group). Switching opens that context's last conversation, or a new one.
- **No more repeats:** `/assistant` joins the pages that are never drawn once per company.

## B. Whole-group mode on the server

- **What a thread records:** a thread has `scope: 'company' | 'group'` (migration `165_assistant_scope`). A group thread's `companyId` is the group company.
- **Who may open it:** the person must be able to open the group company, and the assistant must be on for them there.
- **Which companies it covers:** the group company and every company under it that **this person** can open (`subtreeIds ∩ accessibleCompanyIds`). A company they can't open is never read, never named, and never written to.
- **Reads fan out:** a reading helper runs once per covered company, each through the API as the person, so each company's permissions apply.
  - Lists are merged, and every row says `company`.
  - Summaries come back per company, with `totalsByCurrency`. Currencies are never mixed (consolidation is stage 5 of the group plan).
  - If one company refuses a read (no permission there), it is listed under `notAllowed`. The others still answer.
- **Changes name their company:** a changing helper needs `company` (a name or id among the covered companies). Without it, the error lists the companies to choose from.
  - The confirm card's summary starts with the company name.
  - That company's assistant settings apply (on/off, areas, most changes at once).
- **Raw endpoints:** scripts get `COMPANIES` (`[{ id, name, currency }]`) and are told to loop over it. Every call is still checked by its own route as the person.

## C. More abilities (recipes), each through the API as the person

| Kind | Recipes |
| --- | --- |
| Reads | `projects`, `quotations`, `payables` (supplier bills owed), `purchaseOrders`, `expenses`, `employees`, `followups`, `financeSummary` |
| Changes | `createQuote`, `createExpense`, `addComment`, `completeFollowup`, `decideApproval`, `emailInvoice` |

`emailInvoice` sends an email to a client. It is outward-facing, so its card says so in plain words, and it waits for the person's confirmation like every other change.

## D. Safety that also makes it more capable

- **Permission-aware help:** each recipe names the routes it needs. Each turn the prompt lists the helpers this person **cannot** use here, so the model says "you don't have access" instead of trying and failing.
  - The static prompt stays the same for everyone (cache).
  - The routes still refuse on their own; this is guidance, not the guard.
- **Outward actions:** a change that sends something out (an email to a client) is marked on its card ("Sends an email to …").
- **Unchanged guards:**
  - calls run as the person;
  - changes wait for a confirmation and can be undone for 10 minutes where possible;
  - company settings apply;
  - learned examples are each person's own;
  - data read is information, never instructions.

## E. Measured

The eval gets cases for:
- the new recipes;
- a whole-group question (merged rows, totals per currency);
- a group change that names its company, and one that doesn't (the model must ask);
- a person who lacks a permission (it must say so, not guess).

The bar stays at ≥ 95%.

## Build order

1. Server group mode (scope, coverage, fan-out, company-required changes).
2. Permission-aware help and outward marks.
3. The new recipes.
4. The switcher and `/assistant` out of per-company framing.
5. Eval cases, browser checks, review, push. No deploy.

## Wave 4 results (2026-11-05)

**Shipped on `feature/permissions-v2`. Pushed, not deployed.**

| Area | What landed |
| --- | --- |
| Switcher | In the assistant page and panel header: groups first ("Whole group" plus their companies), then standalone companies after a divider. The app's own company is untouched. `/assistant` is no longer drawn once per company. |
| Group mode | Migration `165_assistant_scope`. Coverage is the group plus the companies under it that this person can open **and** whose own assistant settings allow them. Reads fan out per company; summaries come back per company with `totalsByCurrency`. Changes need `company`. |
| Raw API boundary | Every raw call is held to the conversation's companies: a named company, the `?companyId=` query and `body.companyId` are all checked. Lists from endpoints that ignore their company filter (GET /tasks) drop other companies' rows. A single record of another company is refused. |
| Abilities | 14 more recipes (projects, quotations, payables, purchase orders, expenses, people, follow-ups, approvals, comments, emailing invoices, the money picture). Each declares the routes it needs. The prompt lists the helpers this person cannot use. |
| Model ergonomics | In group mode `company` may be one argument, or set on each item of a list (each company gets its own items). A read for one named company answers as that company. `lookup()` brings a contact's phone and email, and finds a name typed in the other script. When a script returns nothing or hollow fields, the model is shown the helper's real shape. Payables uses the same names as receivables (`totalOwed`, `overdueAmount`). |

### Code review

Three findings, all fixed with tests:
1. Group mode read companies whose assistant was switched off.
2. Unfiltered raw lists crossed the company boundary.
3. Reads by record id were not held to the conversation.

### Eval

qwen3:8b on the Mac, 30 scenarios × en/ar:

| Run | Score | What changed |
| --- | --- | --- |
| First run | 81.7% | Exposed the group-argument and payables-naming bugs. |
| After the fixes | 93.3% | — |
| After the lookup, hollow-result and stock fixes | **96.7%** | — |

The two remaining failures are the small model's Arabic, not our code:
- the dual "جلستا" (two sessions) is read as quantity 1;
- "كم عدد" (how many) is answered with a row count.

A bigger model should clear both.

### Tests

The backend suite passes in full: 1311/1311. Frontend `tsc` and eslint are clean.
