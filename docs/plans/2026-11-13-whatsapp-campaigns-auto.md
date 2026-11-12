# WhatsApp bundle 4 — bulk and automatic messages

Fourth of the five bundles (owner: go on without check-ins, 2026-11-13).

## What the bundle gives

1. **Campaigns**: one approved template to a chosen list of contacts, sent
   at a safe pace, with a live report: sent, delivered, read, replied, failed.
2. **Opt-out**: a customer who writes "stop" / "إيقاف" is never in a
   campaign again (and can be put back by a manager).
3. **Welcome message** to a number's very first message.
4. **Away message** outside working hours (the inbox's working days and
   hours), at most once per chat every 12 hours.

## Decisions

- **Campaigns need the official Cloud API.** Bulk sending from a QR-linked
  number (Green API) is the fastest way to get it banned, so it is refused
  with that reason. Templates are what Meta allows outside the 24-hour
  window, so a campaign always sends an approved template.
- **Audience** is picked from the company's contacts with a phone: by role
  (Client, Lead, Supplier…), by tag, or by hand; phones are cleaned and
  deduplicated, opted-out numbers are dropped. The list is frozen when the
  campaign is created (`whatsapp_campaign_recipients`), so the report never
  changes under the reader. Up to 2000 recipients.
- **Variables**: each `{{n}}` of the template is either fixed text or the
  contact's name.
- **Pacing**: a background pass every 5 s sends up to 3 messages per running
  campaign (~36 a minute), one campaign's send at a time; a failed send is
  recorded on its row and the campaign goes on. Start, pause, resume,
  cancel. A server restart resumes running campaigns where they stopped.
- **Report** reads each recipient's message status (delivered/read come
  from Meta's webhook) and "replied" = an inbound message in that chat after
  the send.
- **Rights**: creating, starting and stopping campaigns, the auto-reply
  texts and opt-outs need `whatsapp.manage` (Admins today); reading reports
  needs `whatsapp.view`.
- **Auto replies** are recorded in the chat as "Auto-reply", never assign
  the chat or change its status, and are sent only for a customer's new
  message (not redeliveries). Welcome wins over away when both apply.
  Allowed on both providers (they answer a message the customer just sent).
- Migration `176_whatsapp_campaigns_auto`: `whatsapp_campaigns`,
  `whatsapp_campaign_recipients`, `whatsapp_optouts`,
  `whatsapp_automation`.
