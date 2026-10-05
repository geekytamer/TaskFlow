# TaskFlow Audit — Notes

Date: 2026-10-05. Branch `fix/taskflow-audit` (from `feature/client-portal-ux`). Spec for quotations: `../specs/2026-10-05-taskflow-quotations-design.md`.

## What the owner reported, and what changed

| Report | Cause | Change |
| --- | --- | --- |
| Quotations missing from opportunities and before invoicing | No quotation record existed (CRM proposals are a separate thing). | Sales quotations: `QT-0001`, client, lines with discounts, VAT, valid-until, Draft/Sent/Accepted/Declined plus derived Expired. Accepted quotes become a confirmed sales order or a draft invoice, once. Opportunities list their own quotes. Printable as a quotation with a QR. Migration `100_quotations`. |
| Quotations before purchase orders | Awarding an RFQ quote changed only its status. | An awarded quote becomes a draft PO with per-line unit costs; PO and RFQ link to each other (migration `102_rfq_purchase_order`). |
| Every QR opened "Invoice not found" | The renderer always encoded `/invoice/:id`. | Each document encodes its own page (invoice, delivery, quotation, document); supplier bills print no code. `/public/resolve/:id` lets an old `/invoice/:id` QR redirect to the right page. |
| Documents page did not support variables | Composer only saved notes; starter layouts printed fixed placeholder text. | `{{field.*}}` variables become fill-in boxes; notes accept any variable with an Insert variable menu; starter letters, memos, certificates and custom documents print the document's own wording. Drafts are editable, finals frozen. |
| Some inventory items could not be deleted | Delete refused stock on hand or any history. | Unused items are deleted; items with history are archived (migration `101_inventory_archive`) and restorable; stock is written off only after a second confirmation, as recorded adjustments. |
| Cascades | Audit of every delete. | See below. |
| Custom roles sometimes missing for the super admin | A super admin outside a company got a 403 reading its groups, and the form swallowed it. | Super admins read and manage any company's groups; failed loads are shown; custom roles appear in the role picker. |
| Creating users could touch other companies | A user whose primary role was Admin could manage users in any company (a deliberate shortcut); `GET /users` listed everyone. | Removed. Only the super admin works across companies, and only in the super admin view. Lists are scoped, and other companies' assignments are hidden and preserved. |

## Security fixes found on the way

- `DELETE /attendance/:id` deleted before checking the company.
- A document could link another company's client or invoice and show it on its public page. Links are now checked, and the public payload carries only printable fields.
- `POST /seed` (wipes every company) and shared positions were open to any company Admin. They are now super-admin only.
- Group assignment now requires the user to belong to that company.
- Found in review: a company admin could edit, and so take over, anyone in another company through `PUT /users/:id`, the super admin included. That path existed before this work. Now:
  - A company admin edits only people already in a company they manage, and never the super admin.
  - Name, email and password change only when the admin manages every company the person is in.
  - A user in no company can be deleted only by the super admin.

Each has a test, and the guards were mutation-checked (broken, seen to fail, restored): the public quotation DTO, the public document client allow-list, the cross-company document link, and the removed Admin shortcut.

## Delete integrity

- **Users:** removed from task assignees, project members, sessions, follow-up assignments, ownership links and unpaid contribution shares. Refused while they own private tasks.
- **Tasks and projects:** take their dependencies, comments, time, contributions and attachments. A billed task blocks.
- **Contacts:** refused while quotations, orders, campaigns, commissions, vendor requests or portal logins use them. Their follow-ups, attachments, pricing and catalogue entries go with them.
- **Employees** on payroll runs are kept. **Payroll runs** in a locked period, **filed VAT returns**, and **ledger accounts** used by a budget cannot be deleted.
- **Warehouses** move their items to the default warehouse, so they are not re-created on the next start-up. A draft count blocks the delete.
- **Campaign deliverables** take their briefs, submissions, reviews and results. A billed deliverable blocks.
- **Refusals explain themselves:** refusals from the data layer now answer 400 with their message instead of "Internal server error". Integration and configuration failures still answer 500 and are logged.
- **Archived items** take no stock movements and go on no new purchase orders. Receiving stock for one ordered before it was archived restores it.
- **Purchase-order approval:** an approved order goes back for approval when any line changes, even if the total stays the same.

## Other bugs fixed

- A partial invoice edit failed (`NOT NULL invoiceNumber`): omitted fields wiped saved ones.
- Invoice custom-column values were never saved.
- The staff app dropped line discounts it read back from sales orders and invoices.
- Sales-order invoices lost line discounts.
- Opportunity edits could not clear notes or the close date. A stage change made through an edit now goes through the stage move: it closes the deal, schedules the follow-up and pays commissions.
- Numbering settings had no labels for deliveries and requisitions.
- A games test broke on any day after 2026-10-05.

## Missing CRUD added

- Edit inventory items (stock and cost stay with adjustments and receipts).
- Edit draft purchase orders (approval re-evaluated).
- Edit draft sales orders.
- Edit draft invoices.
- RFQ quote to purchase order.
- Approve and pay payroll runs.
- Re-link a quotation's contact.

## Decisions taken on the owner's behalf

- **Expired quotations:** Expired is derived from the valid-until date and never stored, so extending the date revives the quote.
- **A converted quote is final:** one that became a sales order or an invoice cannot change, and the other conversion is refused.
- **Invoicing a quote's order:** invoicing a sales order made from a quotation keeps the quotation's VAT and currency.
- **Quote from an opportunity:** the client comes from the opportunity's contact. Accepting the quote does not move the opportunity to Won; that stays a separate step because it drives commissions.
- **Archived items:** cannot go on new sales lines until restored. Items used in a recipe still ask for the recipe to change first.
- **Inventory edits:** item edit and restore are Admin/Manager only, matching the permission model where Accountants have no `inventory:write`.
- **Finalized documents:** a finalized document cannot be reopened. Create a new one instead.

## Still open (found, not done)

These were reported by the audit but are left for a later pass:
- Purchase requisitions have a full API but no screens.
- The credit note list and delete have no screen.
- Journal entries cannot be reversed.
- Expenses, vendor bills, positions and work orders have no edit.
- Recipes, RFQs, proposals, budgets, departments and leave types have edit APIs without screens.
- Attendance cannot be deleted from its page.
- Any assignee may delete a task. This was a deliberate earlier choice and is left as is.
- The invoice edit API accepts any status; only the screen limits editing to drafts.

## Verification

Backend: the full suite, including new tests for quotations, public resolve, document fields, inventory removal, user scope, delete integrity and record edits. Staff app: typecheck and eslint on every changed module. Browser screenshots were taken of quotations (en/ar print), documents with variables, the user form with custom roles, the RFQ order panel and the PO edit form.
