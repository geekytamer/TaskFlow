# Assistant: from working to legendary

On 2026-11-05 the owner asked "how can we improve it and make it legendary". This roadmap builds on the first version, specified in `2026-11-04-assistant-design.md`: code mode, the QuickJS sandbox, calls made as the person, and confirm cards. These decisions are mine, per the owner's standing "decide, don't ask"; the reasons are given inline.

## What "legendary" means here

The bar, in one sentence: **say it, snap it or forward it, from any page or from WhatsApp, in Arabic or English, and it is done right, with one tap to confirm and one tap to undo.**

The roadmap is done when all of the following hold:

- **Correct.** At least 90% of the eval set (see Wave 1) succeeds end to end with the production model, in both Arabic and English. The score is tracked on every change.
- **Fast.**
  - The first words of a reply appear in under 2 s.
  - A simple read is answered in under 8 s.
  - A proposed change appears in under 10 s.
- **Safe.**
  - Nothing changes without the person's tap.
  - Every change is logged with who, what, when, and "via assistant".
  - A change made in the last 10 minutes can be undone.
- **Everywhere.**
  - On every page, through the side panel, aware of what is on screen.
  - In the phone app.
  - On WhatsApp.
- **Free to run.** It uses only self-hosted open models, per the owner's no-API-spend rule.

## Approaches considered

1. **Keep code mode and add *recipes* plus *learned examples* (chosen).**
   - The model keeps the whole API for long-tail questions.
   - The 25–30 most common jobs become tested one-line helpers, so a small model cannot get them wrong.
   - Requests that succeeded become examples for the next similar request.
2. **Switch to one tool per action (classic function calling).** Small models are more reliable on the actions covered, but everything else is lost. The recipes in (1) already give this reliability where it matters.
3. **Fine-tune a model on the TaskFlow API (LoRA on Qwen).** This needs a dataset we do not have yet. The learned examples from (1) *are* that dataset, so (3) becomes a later, cheap step instead of a guess now.

## Waves

The waves are ordered so that each one makes the next one safe to ship. Each wave gets its own plan, and lands as its own PR.

### Wave 1: never wrong (measure, then raise the floor)

- **Eval suite** (`backend/test/assistant-eval/`).
  - About 60 real requests in Arabic and English: reads, single changes, batches, documents, files, multi-step work and refusals. Each has a checker that looks at the result: rows returned, which proposal was made with which body, or the reply naming the right count.
  - It runs on a seeded database against any model given by `AI_BASE_URL`.
  - It reports the success rate, steps per request and time per request, and keeps a history file so regressions show.
  - It is not part of `npm test`, because it needs a model. Run it with `npm run eval:assistant`.
  - The unit tests keep using a scripted model.
- **Recipes** (`backend/src/assistant/recipes/`).
  - Each recipe is a typed helper the sandbox exposes as `tf.<name>(args)` (not `do`, which is a reserved word in JavaScript). Examples:
    - `myTasks`, `overdueTasks`, `createTasks`, `logTime`
    - `overdueInvoices`, `receivables`, `recordPayment`
    - `createQuote`, `createInvoiceFromQuote`
    - `stockOf`, `lowStock`, `createPO`
    - `whoIsOnLeave`, `requestLeave`, `pendingApprovals`
    - `salesThisMonth`, `topClients`
    - `findContact`, `createContact`, `makeDocument`
  - Each recipe:
    - runs the same API calls a script would, so permissions are unchanged;
    - returns small, named fields;
    - has its own unit test.
  - `findApi` lists matching recipes first, with their signature and one example.
- **Learned examples** (`assistant_examples` table).
  - When a turn ends well, the request and the code that worked are saved, per company. A turn ends well when its proposals were confirmed and done, or when it was a read the person did not retry or correct.
  - The 3 most similar saved examples are added to the prompt. Similarity starts as keyword overlap with Arabic and English normalisation, and moves to embeddings from a small local model once the GPU host exists.
  - Admins can see and delete these examples.
  - This is the future fine-tune dataset.
- **A prompt the model server can cache.** The static rules come first and the per-turn facts (date, company, files) last. Ollama and llama.cpp can then reuse the computed prefix (KV cache), which cuts time to first token sharply on long prompts.
- **Model routing.** `AI_MODEL_FAST` takes greetings, follow-ups and short replies; `AI_MODEL` takes everything else. With one model set, nothing changes.

### Wave 2: trust (people confirm what they understand)

- **Editable confirm cards.**
  - A new record shows as a small form, with the fields the model filled already filled in. The person can change any of them before confirming.
  - An edit shows a **before → after diff**, read from the record when the change is proposed.
  - A delete shows what will go, with its title, amount and links.
- **Undo for 10 minutes.**
  - When a change runs, its inverse is stored: delete what was created, restore the old fields of what was edited, or recreate what was deleted (where the API allows).
  - Done cards show "Undo". Undo uses the same confirm path.
- **Approvals awareness.** When a change will go to approval, the card says so ("needs Finance approval") and the follow-up message names the approver.
- **Admin controls** (Settings → Assistant, per company):
  - on/off, and which roles may use it;
  - which areas may be changed, as opposed to read only;
  - the most changes allowed per confirmation;
  - whether learned examples are on;
  - a log of every assistant action, filterable by person, area and status. This is `assistant_actions`, which already has who, what, when and the result.

### Wave 3: everywhere

- **The side panel on every page.**
  - It opens from the header or with ⌘J; ⌘K stays as search.
  - The page tells the panel what is on screen: the route, the open record (kind and id), the selected rows, and the active filters. "This invoice", "these tasks" and "everyone on this project" then work without a lookup.
  - `/assistant` stays as the full-screen version of the same thread.
- **Streaming.**
  - The reply text streams token by token, and the steps (reading, preparing) stream as events.
  - This uses the existing `/live` server-sent events (SSE) hub instead of polling `/assistant/progress`.
  - The background turns added on 2026-11-05 make this a change on the client side.
- **"Ask" on records.** Invoice, task, project and contact pages get a small "Ask about this" entry that opens the panel already in context.

### Wave 4: snap it, say it, forward it

- **Reading what is attached.** A self-hosted vision model (Qwen2.5-VL class) reads photos and PDFs and turns them into proposals, with the file attached to the result:
  - a supplier invoice becomes a vendor bill;
  - a receipt becomes an expense;
  - a business card becomes a contact;
  - a delivery note becomes a purchase receipt;
  - a price list or Excel file becomes a batch of items.
  - The fields are shown on the editable card from Wave 2, so a misread number gets fixed before it is saved.
- **Voice.**
  - A mic button records speech, and self-hosted `whisper.cpp` (large-v3-turbo) transcribes it, Arabic dialects included.
  - The transcript is sent as the message and shown so it can be corrected.
- **WhatsApp channel.**
  - Staff linked to a TaskFlow user can message the company's WhatsApp number. Text and voice notes both work.
  - Confirmations come back as WhatsApp reply buttons: "Confirm", "Show details", "Cancel".
  - The same threads, permissions and log apply.
  - This builds on the existing WhatsApp routes and the Conversations inbox. Unknown numbers get nothing.
- **Phone push.** When a background turn finishes while the person is away, or a proposal waits, they get a push notification with Confirm and Decline actions, using the existing Web Push and push-actions.

### Wave 5: it works while you sleep

- **Routines.**
  - Ask for one in plain words: "every Sunday at 8 send me the overdue invoices and who to call".
  - The routine stores the *script that worked*, not the question, so each run is deterministic and needs no model.
  - A run that would change something only proposes; the person confirms from push or WhatsApp.
  - Results go to the inbox, push or WhatsApp.
- **Watchers.** "Tell me when stock of X falls below 10" or "when a client pays" become saved conditions, checked by the existing sweep.
- **Morning brief per role.**
  - A manager gets approvals, overdue work and cash.
  - A salesperson gets follow-ups and quotes about to expire.
  - Warehouse staff get receipts due and low stock.
  - It is built from recipes, and is off by default.
- **Answers as charts and tables.**
  - New sandbox helpers: `chart({ type, series })` and `table(rows, columns)`.
  - They render in the chat with the existing chart library (recharts), with Excel and PDF export.
- **Group questions.** For a person with access to several companies, recipes take `companies: 'all'` ("receivables across the group"), each company read under its own permissions.

## Models and hardware (needed from Wave 1 on, to measure for real)

All self-hosted, behind Tailscale. The laptop's qwen3:8b stays the development model.

| Job | Model | Rough memory (4-bit) |
| --- | --- | --- |
| Agent (code) | Qwen3-Coder-30B-A3B | ~19 GB |
| Fast replies, routing | Qwen3-4B | ~3 GB |
| Reading photos and PDFs (Wave 4) | Qwen2.5-VL-7B | ~6 GB |
| Speech (Wave 4) | whisper large-v3-turbo | ~2 GB |

- Waves 1–3 fit on one 24 GB GPU.
- Wave 4 needs about 32 GB in total, or a second card.
- The memory figures are estimates for 4-bit quantized weights. They will be measured when the host is chosen.

## Guards that carry over

Every new surface runs through the same `advance()` and `assistant_actions` path:

- calls are made as the person;
- reads run, and changes wait for a confirmation;
- encoded-path checks and the catalogue exclusions apply;
- data the model reads is information, never instructions.

WhatsApp and routines add no new way to write.

## Order and first step

Waves 1 → 2 → 3 → 4 → 5. Wave 1 starts with the eval suite, because every later change is judged by it. Its plan will be written to `docs/superpowers/plans/2026-11-05-assistant-wave-1.md`.
