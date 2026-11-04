# Intercompany (group stage 4)

Builds on "A group is a company" (2026-11-02), § Group finance. The owner said "do them all" and wants decisions made without questions; the decisions are recorded here.

## What it does

Companies in the same group tree trade with each other in a way both sets of books agree on.

1. **Sister companies as partners.** In a company's client and supplier pickers, every other company in its tree can be chosen as "Group company". On first use the system creates a client record (and a supplier record when buying) for that sister, marked `intercompanyCompanyId`. One record per sister per side; it keeps the name it was made with (rename it like any client or supplier). Ordinary clients and suppliers can't be marked intercompany by hand.
2. **Their own accounts.** Each company gets two system accounts:
   - **1160 Due from group companies** (Asset)
   - **2050 Due to group companies** (Liability)

   An invoice to a sister posts its receivable to 1160 instead of 1100. A bill from a sister posts its payable to 2050 instead of 2000. Payments clear the same accounts. Every one of those journal lines records `partnerCompanyId`.
3. **Invoice → bill.** When an intercompany invoice is issued (it posts to the ledger), the sister gets a matching vendor bill:
   - It is a Draft, for the same gross amount and VAT rate.
   - The bill number is the invoice number, the supplier is the sender's intercompany supplier record, and it is due on the same date.
   - The two are linked both ways (`invoices.mirrorBillId` ↔ `vendor_bills.mirrorInvoiceId`).

   The sister's accountant approves the bill as usual, choosing the expense account and going through approvals.
4. **Purchase order → sales order.** A purchase order to a sister, once it is Ordered, creates a Draft sales order in the sister with the same lines (as manual lines, since items are per company). The two are linked both ways (`purchase_orders.mirrorSalesOrderId` ↔ `sales_orders.mirrorPurchaseOrderId`).
5. **Payment on one side offers the other.** When a payment is recorded on one side (invoice payment in the seller, or bill payment in the buyer), the other side shows it under **Intercompany → To match** with one button: "Record matching payment". It records the payment on the linked document with the same amount and date. Nothing posts automatically in another company's books without someone there pressing the button.
6. **Intercompany page** (Finance → Intercompany), per company:
   - **Balances with each sister:** our 1160 minus 2050 with that sister, next to the sister's own figure for us. A difference is shown with the documents that explain it: unmirrored invoices, bills still in Draft, and payments not matched.
   - **To match:** the payments described in point 5.

## Rules

- **Currency:** an intercompany invoice must be in the receiving company's base currency, because vendor bills are kept in base currency. The sender can still invoice in a foreign currency at its own rate. The API refuses any other currency with a message naming the currency to use.
- **Who can act:** mirroring creates documents in another company as the system, and the activity trail says "from <company> invoice INV-12". Matching a payment needs the same permission as recording that payment in that company.
- **Changes after mirroring:** deleting or voiding an invoice whose bill is still Draft deletes the bill. Once the bill is approved, the invoice can't be deleted (409: "Peak has approved the matching bill"). The same applies to purchase orders and sales orders.
- **Old data:** documents created before this stage are not mirrored retroactively.
- **Credit notes:** a credit note on an intercompany invoice creates nothing automatically. Its amount shows as a difference on the balances page until it is matched by hand. Mirrored credit notes are left for later.

## Not in this stage

Consolidated reports and eliminations (stage 5). Intercompany loans and journal entries. Mirroring credit notes.

## Proof

- Backend tests:
  - an invoice A → B creates B's bill
  - posting goes to 1160 and 2050 with the partner recorded
  - the currency rule is enforced
  - a payment shows under To match, and recording it clears both sides
  - balances agree after a full cycle
  - delete rules
  - a purchase order → sales order
  - authorization under all three permission engines
- Browser: one full cycle across two companies of a local group, in English and Arabic.

## Review fixes (2026-11-04)

An independent review found 1 Critical, 4 Important and 6 Minor issues. All are fixed and each has a regression test in `backend/test/intercompany.test.js`.

- **Credit notes post to 1160.** A credit note made from an invoice, or from a customer return, used to post to 1100 because it read the client from the request instead of from the invoice.
- **Reversing a matched payment** clears the other side's link, so that payment is offered for matching again. A link pointing at a deleted payment counts as unmatched.
- **Both sides recorded the same payment** (the usual habit): matching now links this side's existing unmatched payment of the same amount instead of recording a second one.
- **A match never records more than is still open.** After a credit note, the rest stays as a difference. Balances explain credit notes (`credit_note`) and bills whose amount differs from the invoice (`amount_mismatch`).
- **A mirrored bill's amount, VAT and supplier** can't be edited (409). The fix for a wrong amount is a credit note from the seller.
- **A company that leaves the group** is an ordinary client or supplier again: it posts to 1100 and 2000.
- **A held match is checked when approved:** the receipt must still exist and must not already be matched.
- **Undoing documents:**
  - An invoice moved back to Draft deletes its Draft bill (an approved bill stops it), and issuing it again makes a new bill.
  - A purchase order that is cancelled or moved back to Draft deletes its Draft sales order (a confirmed one stops it).
- **Currency and wording on the page:** amounts show the currency of the side that owns them, and "its books say…" keeps the direction of the balance.
- **Not built:** manual journal lines to 1160 or 2050 with a partner, and mirrored credit notes. Both are left for later; until then those differences show on the page.
