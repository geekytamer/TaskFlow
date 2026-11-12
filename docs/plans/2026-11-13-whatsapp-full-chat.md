# WhatsApp bundle 1 — a full chat

Owner (2026-11-13): "I want the WhatsApp and messages section to be strong";
chose bundle 1 of five. Decisions taken without questions.

## What the bundle gives

1. Send photos, files, audio and short video (both providers).
2. Photos, audio and video shown inside the chat, not as a link.
3. Reply to one specific message (quote), both ways.
4. Messages arrive at once (live signal) instead of every 5 s.
5. A phone notification for a new customer message.

## Decisions

- **Files we send are kept by us.** New table `whatsapp_media` (bytes in the
  database, like the rest of the app's files). A sent message's `mediaUrl` is
  `wa-file:<id>`; the bytes are read through
  `GET /companies/:id/whatsapp/files/:fileId`, with the same private-chat rule
  as Cloud media. Cap: 16 MB per file (Meta's limit for audio/video; photos
  5 MB on Cloud). Upload is base64 in JSON, like record attachments.
- **Green API** sends by upload (`sendFileByUpload` on the media host:
  `media.green-api.com`, or `NNNN.media.greenapi.com` derived from a custom
  api host; `GREEN_API_MEDIA_HOST` overrides). No public URL of ours needed.
- **Cloud API** uploads to `/{phoneNumberId}/media`, then sends by id. The
  24-hour rule applies to files as to text.
- **Message kinds**: `text | image | video | audio | document | file`
  (`file` stays for old rows). New columns `mimeType`, `replyToExternalId`
  (migration `174_whatsapp_full_chat`).
- **Reply**: stored as the quoted message's provider id. Sent as
  `quotedMessageId` (Green) / `context.message_id` (Cloud); read from
  `quotedMessage.stanzaId` (Green) / `context.id` (Cloud). The chat shows the
  quoted line above the reply when that message is in the thread.
- **Green inbound** now keeps captions and the real kind (image/video/audio/
  document) instead of "file" with an empty body.
- **Live**: both webhooks publish topic `whatsapp` to the company; the inbox
  and the bell listen. Polling stays only as a slow safety net (60 s).
  The signal carries no data; screens re-read through the gated routes.
- **Phone notification** for an inbound message: to the private chat's owner;
  else the linked contact's owner if they can read WhatsApp; else everyone
  who can. At most one push per person per chat every 2 minutes; respects
  each person's "messages" preference, preview setting and quiet hours.
  Opens `/whatsapp?chat=<chatId>`.
- **Voice**: recorded in the browser and sent as audio. Format picked by what
  the browser can record that WhatsApp accepts (ogg/opus, then mp4); a browser
  that can only record webm gets a clear message on Cloud API.

## Not in this bundle

Reactions, group chats, keeping our own copy of inbound Green API files
(their links expire on Green's side), message search inside a chat.
