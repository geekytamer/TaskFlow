# Al-Yarubi Group: structure check and approval setup (2026-11-04)

The owner asked me to review the converted roles, set up approvals, and make sure the group and company relationships are sound. Every change was rehearsed on a copy of production first. Backup before the change: `taskflow-pre-groupsetup-20261104-064115.db`. Script: `/root/group-setup.js`.

## Structure: checked
- **Tree:** Al-Yarubi Group (the group company) has GLOBAL INDUSTRIAL GATE, Peak Creative Agency and Smart Hammer under it. The holding group's companies are exactly that tree.
- **Membership:** every member of a group company has an active main role there. Role assignments outside a membership exist only for Academy practice companies, which is expected.
- **Converted roles ("Peak Manager" `ma`, "Influencer"):** activated 2026-11-03. Asking the new engine directly (on a copy) confirms that Younis Al-Khusaibi and Abdulaziz Adam keep inbox view and send, contacts, campaigns and tasks. No differences have been logged since the roles were activated.
- **Intercompany accounts:** 1160 and 2050 exist in all 20 companies (migration 159).

## Structure: fixed
- **Smart Hammer currency:** USD → OMR, the same as the group and its sisters. It had no financial records of any kind, so nothing is restated. Without this, intercompany invoices to it would have to be in USD, its balances couldn't be compared with its sisters', and approval bands would be in a different currency.
- **The owner** (Mohammed Khamis Al Yarubi, super admin) was Admin of the group, GIG and Peak but not of Smart Hammer. He is now Admin there too, and the group admin. A super admin still needs membership to act in a company.

## Approval policies
These are set on the group company and inherited by all 3 companies. Any of them can replace one with its own in Settings → Approvals.

| Document | When | Who decides |
|---|---|---|
| Supplier payment | 1,000 OMR and above | an Admin of the company |
| Purchase order | 1,000 OMR and above | an Admin |
| Expense | 200 OMR and above | an Admin |
| Credit note | every one | an Admin |
| Purchase requisition | every one | a Manager or an Admin |

For all of them, the person who asked can't approve their own (allowSelf off). Reminders go out after 24 hours and it escalates after 72.

**Not set, on purpose:**
- Invoices, quotations and vendor bills are left alone so sales and campaign bills don't slow down. Supplier payments are where the money leaves.
- Leave and payroll: no employee has a login or a recorded manager yet, so a "manager" step would get stuck.

**Real numbers behind the thresholds:** Peak's supplier payments average 575 OMR, and 19 of 82 were 1,000 OMR or more, so roughly 1 payment in 4 will wait for an Admin. GIG's only purchase order (9,030 OMR) would have needed approval.

**Rehearsal on a production copy:**
- The accountant's 1,500 OMR payment at Peak was held.
- It waited in an Admin's inbox, and the accountant could not approve it herself.
- Once an Admin approved it, the payment was recorded and the bill became Paid.
- A 300 OMR payment was recorded at once.

## Still open
- **Switch to the new permission engine:** due 2026-11-09, at the end of the comparison week. Run `npm run ops -- authz:compare` first.
- **Global Industrial Gate - NANOOXY** sits outside the group. If it belongs to GIG, it should be moved under the group.
- **Many standalone companies still use the USD default** (Tuba Dairy, Antimony, the Arabic-named ones). Check whether that is intended.
