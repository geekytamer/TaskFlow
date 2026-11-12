# WhatsApp bundle 5 — the numbers, and one inbox

Last of the five bundles (owner: go on without check-ins, 2026-11-13).

## What the bundle gives

1. **Response report** (`/whatsapp/report`, 7 / 30 / 90 days): typical
   first reply, customer messages, waits answered and still unanswered,
   open and late chats now; per person the same; messages per day.
2. **One inbox**: the inbox switch (Clients · WhatsApp · Team) is on both
   the client inbox and the WhatsApp page, with WhatsApp's unread count, so
   the three are one place to work from.

## Decisions

- A **wait** starts at a customer's message after our last reply and ends at
  the next message a person wrote. Auto replies, campaign messages and
  portal alerts do not end it and do not count as anyone's reply.
- Times are **working hours** (the inbox's days and hours), the same rule as
  the "Late" flag, so a message at night answered at 8:05 counts minutes.
  A median, not an average, so one forgotten chat does not hide the norm.
- The report compares people, so it needs company-wide reach on
  `whatsapp.view` (Admins and Managers today), checked in the handler.
- The WhatsApp unread badge has one source (`use-whatsapp-unread`), live,
  shared by the sidebar and the inbox switch.
- Not merged into one list: WhatsApp chats and client threads keep their
  own lists and rules (privacy, 24-hour window, providers); the switch
  joins them without mixing their data.
