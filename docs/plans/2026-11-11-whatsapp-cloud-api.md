# WhatsApp Cloud API (Meta, official) — design

Owner asked (2026-11-11) for Meta's official WhatsApp Cloud API next to the
existing Green API link. Decisions taken without questions, per the owner's
"decide, don't ask" rule.

## Decisions

1. **One connection per company, with a provider.** `whatsapp_instances` gets
   `provider` (`green` | `cloud`, default `green`), `wabaId` and
   `appSecretEncrypted` (migration `173_whatsapp_cloud_api`). For `cloud`,
   `idInstance` holds the Phone Number ID and the encrypted token is the
   permanent System User access token. Existing rows stay `green`; nothing
   changes for them.
2. **Same inbox, same chat ids.** Cloud messages use the same
   `<digits>@c.us` chat id, so the inbox, contact matching, privacy, follow-ups
   and conversations keep working unchanged.
3. **One sending path.** `services/whatsappSender.ts` picks the provider and is
   used by the send route, the portal alerts sender and the test send.
4. **24-hour window.** Free text is allowed only within 24h of the customer's
   last message. Outside it the route answers 409 `windowClosed` *before*
   calling Meta, and the inbox offers an approved template instead.
   `GET .../whatsapp/window?chatId=` tells the composer.
5. **Templates.** `GET .../whatsapp/templates` reads approved templates from
   Meta (`/{wabaId}/message_templates`). `POST .../whatsapp/send-template`
   sends one with body variables; the stored message body is the template text
   with the variables filled, so the chat reads naturally.
6. **Webhook.** `GET/POST /whatsapp/cloud-webhook/:webhookToken`. The verify
   token Meta asks for is the company's webhook token. POSTs must carry a valid
   `X-Hub-Signature-256` made with the app secret (raw body kept); a bad
   signature is 401, anything else is answered 200 quickly. Handles text,
   image, document, audio, video, sticker, location, button and interactive
   replies, and status updates (sent/delivered/read/failed with Meta's reason).
   A status never moves backwards (read is not overwritten by a late
   delivered).
7. **Media.** Inbound media are fetched through
   `GET .../whatsapp/media/:mediaId` (the token never reaches the browser).
8. **Not available on Cloud** (answered clearly, no fake success): QR linking,
   logout, history sync (Meta has no history API) and the "is on WhatsApp"
   check. Open-chat skips them.
9. **Settings UI.** A provider switch in the WhatsApp settings card; the cloud
   form asks for Phone Number ID, WhatsApp Business Account ID, access token
   and app secret, then shows the webhook URL and verify token to paste into
   Meta's dashboard.

## Known limit

Portal alerts sent through Cloud reach only people who wrote within 24h; others
fail with Meta's reason stored on the message. An alerts template is a later
step.
