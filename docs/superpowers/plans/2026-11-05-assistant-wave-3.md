# Assistant Wave 3 ("everywhere") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The assistant is one click (or ⌘J) away on every page, knows what is on screen ("this task"), and its answer appears as it is written.

**Architecture:**
- **Streaming.**
  - The model call streams (OpenAI `stream: true`). The agent passes only *answer* text on: never code or thinking, cut at the first code fence, without the "» " suggestion lines.
  - Each request gets its own server-sent events (SSE) stream, `GET /assistant/stream/:requestId`, owned by the person who asked. It sends the step ("Reading tasks…"), the answer so far, and "done".
  - The `/live` hub stays signals-only (its rule: topic names, never data).
  - Polling the thread stays as the fallback.
- **Page context.**
  - A provider in the app layout holds the record on screen (`{ kind, id, title }`), registered by record pages with `useAssistantSubject`.
  - Each chat message carries `{ path, subject }`. The server stores it on the message and puts one line in the prompt's per-turn part: "On their screen now: task "…" (id …); 'this' means it". It is data, trimmed and single-line.
- **Panel.**
  - `AssistantPage` gets a `variant: 'page' | 'panel'`.
  - `AssistantPanel` is a side sheet in the app layout, opened from a header button, ⌘J/Ctrl+J, or "Ask about this" on a record.
  - The panel and the full page share the remembered conversation.

**Tech Stack:** TypeScript, Express (SSE), Node fetch streams, Next.js, shadcn/ui.

## Global Constraints

- The stream is per request and per person. A stranger's request id gets a 404. No data goes over `/live`.
- Text mode only streams. Native tool-call mode keeps the non-streaming call, because tool-call deltas are not worth parsing for small models.
- The page context is information, never instructions. Titles are cut to 120 characters and stripped of newlines and backticks.
- Tests: `npx -y -p node@24 npm test`. Read the pass/fail counts before committing.
- Bilingual, right-to-left aware, phone-width safe.

## Decisions

- **Not over `/live`:** reply text is data, and `/live` promises never to carry data.
- **The stream sends the whole answer so far, not pieces.** A late joiner, or a reconnect, just takes the latest. Updates are throttled to about 12 a second.
- **Answer-only streaming:** the first visible characters decide. Starting with a code fence or `<think>` means hidden. Otherwise the text streams up to any later code fence.
- **The panel is a sheet, not a new component tree:** `AssistantPage` already holds the whole chat (files, cards, review cards, undo). A `variant` changes only its frame.
- **"Ask about this"** goes on the task details sheet, the project page and the contact page. Invoices open outside the app layout (`/invoice/[id]`), so they get the panel's general "this" through the path only when it is inside the app.
- **Where the panel button and shortcut appear:** only when the server has a model, and not on `/assistant` itself.

---

### Task 1: The model streams; the agent passes only answer text

**Files:** `backend/src/assistant/model.ts`, `backend/src/assistant/agent.ts`. Test: `backend/test/assistant-stream.test.js`.

- `ChatFn` becomes `(messages, tools, onDelta?: (piece: string) => void) => Promise<{ content; tool_calls? }>`.
- `openAiChat`: with `onDelta` and no tools, it sends `stream: true` and reads `response.body` as lines of `data: {…}`. It skips `[DONE]`, adds `choices[0].delta.content` to the content, calls `onDelta(piece)`, and returns `{ content }`. Without `onDelta` it works as before.
- `runAgent(…, hooks?: { onReply?(textSoFar: string): void })` wraps each chat call with an answer gate:
  - **Deciding:** it gathers pieces until 3 non-space characters have arrived.
  - **Hidden:** if those start with a code fence or `<think`, nothing from this call is shown.
  - **Shown:** otherwise `onReply` gets `visible(buffer)`. That is the text before the first code fence, without `<think>…</think>` and without lines starting with "» ", trimmed.
- Tests:
  - `openAiChat` against a local HTTP server that sends 3 SSE chunks and `[DONE]` gives the joined content and 3 pieces.
  - A scripted streaming chat answering "Hello **world**\n» Next?" gives `onReply` calls ending in "Hello **world**".
  - One answering with a code block first gives no `onReply` call.
  - "Let me check.\n```js …" gives "Let me check.".

### Task 2: The per-request stream

**Files:** `backend/src/routes/assistant.ts`, `backend/src/authz/route-registry.ts` (+ `KNOWN_UNGATED` if asked). Test: append to `assistant-stream.test.js`.

- `streams: Map<requestId, { userId; clients: Set<Response>; step?; reply?; done?: boolean; at }>`.
- `GET /assistant/stream/:requestId` (`authMiddleware`; `self`):
  - It creates or joins the entry; an entry that belongs to someone else gives a 404.
  - It writes SSE headers (`X-Accel-Buffering: no`), then the current `step` and `reply` if any, then `done` if already done. It sends a heartbeat every 15 s, and closes on `done`.
  - Entries are swept 2 minutes after they are done.
- `stepper` emits `{ type: 'step', step }`. `advance` passes `hooks.onReply`, which emits `{ type: 'reply', text }` (throttled to 80 ms, the last one always sent). When the turn ends, `turn()` emits `{ type: 'done', error? }` for the request id in the body.
- Test: open the stream over raw HTTP, POST the chat (scripted streaming model), and collect events up to `done`. They include a step, a reply ending in the answer and no code, and done. A second user asking for the same request id gets a 404.

### Task 3: What is on screen reaches the prompt

**Files:** `backend/src/routes/assistant.ts`, `backend/src/assistant/agent.ts`. Test: append.

- `/assistant/chat` reads `body.context` as `{ path?: string (≤200, starts with /), subject?: { kind (≤40, [a-z-]), id (≤80), title (≤120) } }`. Anything else is ignored. The result is stored as `ui.context` on the user message.
- In `advance`: `onScreen` comes from the last visible user message's `ui.context` and goes into `AgentContext.onScreen`.
- In `contextPrompt`: `On their screen now: ${kind} "${title}" (id ${id}) at ${path}. "This", "it" or "here" means that record; use its id directly.`. With only a path: `They are on the page ${path}.`
- Test: chat with a task subject. The system prompt the model sees contains `On their screen now: task "Call the supplier"`. A title with a newline and backticks arrives flattened.

### Task 4: Frontend — stream, context, panel, "Ask about this"

**Files:**
- Create:
  - `frontend/src/modules/assistant/assistant-context.tsx` (provider, `useAssistantSubject`, `useAssistantPanel`);
  - `frontend/src/modules/assistant/components/assistant-panel.tsx` (sheet, header button, ⌘J);
  - `frontend/src/modules/assistant/components/ask-about-this.tsx`.
- Modify:
  - `assistantService.ts` (`streamAssistant`, `context` on ask);
  - `assistant-page.tsx` (`variant`, the stream instead of progress polling, the live reply, the subject chip, context-aware examples);
  - `app/(app)/layout.tsx` (the provider, the panel, the header button);
  - `task-details-sheet.tsx`, `projects/[id]/page.tsx`, `contact-detail-page.tsx` (`AskAboutThis`).

**Behaviour:**
- **Streaming in the chat:** `streamAssistant(requestId, onEvent, signal)` reads the SSE over `fetch` with the token header (like `/live`). While working, the page shows the step line and the reply so far, as a reply bubble with a soft caret. When the stream fails it falls back to polling progress. `untilDone` keeps polling the thread, every 1.5 s, which is the source of truth.
- **The panel:**
  - It opens from the right (from the left in Arabic), full width on phones and 28rem on wider screens.
  - Its header has the thread title, "New", and "Open full screen" (`/assistant`).
  - It scrolls its own messages, with the composer pinned to the bottom.
  - If a subject is set: a chip "About: {title}" (removable for this question), and examples about it ("Summarize this", "What is left to do?", "Who is it assigned to?").
- **Header button:** a `Bot` icon next to the bell, with the tooltip "Assistant (⌘J)". It is hidden when the server has no model, and on `/assistant`.
- **"Ask about this":** an outline button with a Bot icon that registers the subject and opens the panel focused.

### Task 5: Verify, review, record

- Run the backend suite and the frontend `tsc`/`eslint`.
- **Browser:**
  1. Open a project, click "Ask about this", ask "what's left to do here?", and watch the answer stream.
  2. Use the panel at phone width and in Arabic.
  3. ⌘J toggles the panel.
- Rerun the eval (≥ 95%; the prompt changes only when a page context is sent).
- Run `code-review` on the wave; fix the findings; report the outcomes.
- Add Wave 3 results to the spec; update the memory; push.
