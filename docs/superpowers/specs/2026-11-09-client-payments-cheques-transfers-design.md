# Client payments: post-dated cheques and bank transfers

Date: 2026-11-09. Approved in chat by Tamer the same day ("ممتاز"). Thawani card payments come later on the same records.

## Why

Clients pay Peak in more ways than one. Instalments are often post-dated cheques: staff receive them, record them, and before each one is deposited the client gets a WhatsApp message and an email so the money is in the account. Others pay by bank transfer and send a receipt. Until now the system only knew "a payment was recorded on an invoice": nothing held a cheque before it cleared, nothing reminded anyone, and a client could see bank details but not say "I paid".

## The model

One table, `client_payment_records`, holds money that is promised or claimed but not yet in the books. A record belongs to one invoice. It becomes a real `payments` row (through the existing `createPayment`, so journals, invoice status and commissions behave as today) only when the money is confirmed:

| method   | states                                              | becomes a payment when |
|----------|-----------------------------------------------------|------------------------|
| cheque   | `received` → `deposited` → `cleared` / `bounced`; `returned` (handed back, never deposited) | `cleared` |
| transfer | `pending` → `confirmed` / `rejected`               | `confirmed` |

- A cheque's date (`dueDate`) is its deposit date. Several cheques on one invoice are the instalment schedule for a cheque client; no separate plan is needed. (The Flexi plan design of 2026-11-02 can later link its instalments to these records.)
- Amounts are in the invoice currency. All open records on an invoice (received, deposited, pending) may not add up to more than the outstanding amount, so a confirmed record never fails `createPayment`'s outstanding check.
- `cleared` records the payment dated the clearing date with method `Cheque` and the cheque number in the note; `confirmed` records it dated the transfer date with method `Bank transfer` and the reference. The record keeps `paymentId`. Reversing that payment in finance puts the record back (cheque → `deposited`, transfer → `pending`), so the two can never disagree.
- `bounced` needs a reason, raises a high-priority follow-up on the invoice's contact for its owner, and tells the client.
- Attachments (cheque image, transfer receipt) live in the record's own file table, PDF/PNG/JPEG/WebP only, checked by their bytes as portal files are.

## Reminders before deposit

- Per company setting: on/off (**on by default**: the owner asked for it as standard practice; a company can turn it off), days before (default 3), and a second message on the deposit day.
- An hourly sweep sends, for each `received` cheque, the `before` message when `today ≥ dueDate − days` and the `due` message on the date itself, each once per cheque and channel. A cheque recorded inside the window gets the `before` message straight away on the next sweep; a cheque past its date gets nothing (it is staff's to deposit).
- Channels: WhatsApp from the company's connected number (Green API, logged in the WhatsApp inbox like portal alerts) and email. Recipient: the invoice's contact phone and email, else the client record's. A channel with no address or no provider is logged as `skipped`; a failed send is retried after an hour. Practice companies never send.
- Unlike portal lock-screen alerts, these messages carry the cheque number, amount and date: that is their purpose, and they go to the client's own number and inbox.
- The same message log holds the event messages: cheque bounced, transfer confirmed, transfer rejected (with the reason).
- Portal users also see upcoming cheques under "Needs you" (within 7 days) and get a push through the existing `money` alert group; the portal's own WhatsApp digest skips cheque events because the sweep above already sent one.

## Portal (client)

- Invoice page: under the bank details, "I've made a transfer": amount (defaults to the outstanding amount less what is already pending), date, reference, receipt file. It creates a `pending` record; the account manager and finance roles are notified. The page lists this invoice's cheques and transfers with their state; a rejected transfer shows the reason.
- Billing page: "Your cheques" (upcoming and recent) above the invoices.
- DTOs carry no staff ids, staff notes or other contacts' records.

## Staff app

- Invoice detail: a "Cheques and transfers" block: add a cheque (number, bank, amount, date, image), move it along (deposited, cleared, bounced, returned), confirm or reject a transfer, see the messages sent.
- Finance → Cheques page: cheques to deposit (by date, this week first), pending transfers to confirm, bounced cheques, and the reminder setting.
- Who: Admin, Manager, Accountant (`companyManagementRoles`, the same as recording payments).

## Data

Migration `168_client_payments`:

```
client_payment_records (id, companyId, invoiceId, method, status, amount, currency,
  chequeNumber, bankName, dueDate, reference, paidOn, note, reason, paymentId,
  createdByUserId, createdByPortalUserId, statusAt, createdAt, updatedAt)
client_payment_files (id, recordId, companyId, fileName, mimeType, sizeBytes, content, uploaderKind, userId, portalUserId, createdAt)
client_payment_messages (recordId, stage, channel, status, error, sentAt, PRIMARY KEY (recordId, stage, channel))
client_payment_settings (companyId PRIMARY KEY, remindersEnabled, daysBefore, onTheDay)
```

## Out of scope

Thawani (next, on the same records: method `card`, confirmed by its webhook only), automatic matching with bank statements, cheques from Peak to vendors.
