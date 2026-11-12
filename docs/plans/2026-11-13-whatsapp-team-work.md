# WhatsApp bundle 2 — team work

Second of the five bundles the owner approved (2026-11-13). Decisions taken
without questions.

## What the bundle gives

1. **Who answers**: a chat is assigned to one person.
2. **Where it stands**: open (ours to answer), waiting for the customer, done.
3. **Internal notes** inside the chat, never sent to the customer.
4. **Labels** on a chat.
5. **Quick replies**: saved texts inserted by typing `/`.
6. **Tabs** in the list: Open, Mine, Unassigned, Late, Done.

## Decisions

- **Stored on the chat's settings row** (`whatsapp_chat_settings`):
  `assigneeUserId`, `status` (`open | waiting | done`, default `open`),
  `labels` (JSON array), `statusChangedAt`. Migration
  `175_whatsapp_team_work`, which also creates `whatsapp_notes` and
  `whatsapp_quick_replies`. A chat with no row is open and unassigned.
- **The status moves by itself**, so nobody has to keep it:
  a customer's message makes the chat **open** again (also from done);
  our reply makes an open chat **waiting**; "done" is set by a person.
  Automatic portal alerts do not move it.
- **First to reply takes the chat**: replying to an unassigned chat assigns
  it to the person who replied. Anyone who may edit chats can reassign.
- **Assignee must be able to read WhatsApp** (`GET .../whatsapp/team` lists
  who can). Assigning someone else sends them a `whatsapp_assigned`
  notification (in-app/phone by their preferences).
- **Phone notification order** becomes: private chat's owner → the assignee →
  the contact's owner → everyone who reads WhatsApp.
- **Late** reuses the inbox's response-time rule (company working hours and
  target, `conversations/sla.ts`): an open chat whose customer has been
  waiting past the target is red, past half of it amber. `waitingSince` is
  the customer's first message after our last successful one.
- **Notes** follow the chat's privacy (a private chat's notes are its
  owner's). A note is deleted by its author or by someone with company-wide
  reach. Notes never go through a provider.
- **Labels**: up to 10 per chat, 30 characters each; suggestions are the
  labels already used in the company (no separate label list to manage).
- **Quick replies** are per company: a short code (`price`, `address`…) and
  a text. Typing `/` at the start of the message box lists them; the text is
  put in the box for the person to review, never sent on its own.
- **Private chats keep their rule**: only the owner or a company-wide
  manager changes a private chat's settings, including these new ones.
- **Live**: every change is under `/companies/:id/whatsapp/…`, so the
  existing live signal already tells other open inboxes to re-read.

## Not in this bundle

Automatic assignment rules (round-robin), per-person response reports
(bundle 5), merging with the email/portal inbox (bundle 5).
