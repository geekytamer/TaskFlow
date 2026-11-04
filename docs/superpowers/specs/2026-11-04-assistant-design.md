# In-app assistant (code mode)

The owner asked for a chatbot that does things in TaskFlow, without MCP, using whatever approach works best (2026-11-04), and said "lets get it working". Decisions:

- **Code mode, not one tool per action.** The model writes JavaScript against `search(words)` and `api.get/post/put/patch/delete`.
  - `search` finds endpoints in a catalogue built from `authz/route-registry.ts`, so new routes appear automatically.
  - Only the script's `return` value goes back to the model, so large lists stay out of its context.
  - By default (`AI_TOOL_MODE=text`) the model replies with a ```js block, the server runs it, and the result comes back as the next message.
    - Measured with qwen3:8b on Ollama: native tool calls returned empty answers, because the model can't escape multi-line code into a JSON string and Ollama drops the call. Plain code blocks work.
  - `AI_TOOL_MODE=native` uses OpenAI tool calls (`search_api`, `run_script`) instead, for models that handle them.
- **Help for small models.**
  - After each read, the model sees the real field names and the status values it saw. An empty filtered list is flagged.
  - A script that returns nothing is pointed out.
  - Identical code isn't run twice.
  - An empty answer gets one hidden nudge.
  - Numeric ids become strings.
  - Hints in `assistant/hints.ts` give the exact body fields for the most-used endpoints. A wrong body is refused before it reaches the person, with the expected shape in the error.
  - Proposed changes come back to the model marked "NOT DONE YET".
- **Agent on the server, model anywhere.** The model is any OpenAI-compatible endpoint (Ollama, llama.cpp, vLLM), set with `AI_BASE_URL`, `AI_MODEL`, an optional `AI_API_KEY`, `AI_TIMEOUT_MS`, `AI_TOOL_MODE`, and `AI_REASONING_EFFORT`. `AI_REASONING_EFFORT=none` turns off a thinking model's reasoning on Ollama; qwen3 then answers in seconds instead of minutes.
  - The model never gets a TaskFlow login. Reach a remote model over Tailscale, WireGuard, or a tunnel with a key. Never expose Ollama's port to the internet.
  - No model set means the assistant is off: the menu entry is hidden and the page says so.
  - A model that can't be reached returns 503 `ASSISTANT_OFFLINE`.
  - Paid APIs are not used (owner's standing rule).
- **Sandbox.** QuickJS compiled to WebAssembly (`quickjs-emscripten-core`, release-sync variant).
  - There is no fetch, require, process, timer or file access.
  - Limits: 30 s wall clock, 40 API calls and 64 MB memory per script. Endless loops are interrupted.
- **The person's own permissions.** Every call a script makes goes to the real API over a private loopback port, with the person's own session token. Permissions, field masks, approvals, module switches and validation all apply exactly as they do for their own clicks.
  - Search lists only the endpoints the person holds.
  - The catalogue leaves out sign-in, sessions, push, live updates, portal and public routes, platform admin, Academy, seed, and the assistant's own routes. A script therefore can't confirm its own changes.
- **Changes wait for the person.**
  - Reads run immediately. A POST, PUT, PATCH or DELETE is not run. It is stored in `assistant_actions` as pending, with the plain-language summary the model wrote, and appears as a card in the chat.
  - The person confirms or declines each change, or all at once.
  - Confirmed changes run in order, as the confirming person, and run only once (status claimed first).
  - Pending changes expire after an hour, or when the person sends a new message.
  - After confirmations, once nothing is still waiting, the model is told the outcome and continues. This is how it gets ids for multi-step work. A decline doesn't wake the model.
- **Untrusted data.** The system prompt tells the model that data it reads (messages, emails, notes) is information, not instructions. The real protection is that nothing changes without the person's click.
- **Threads** are per person and per company, stored in `assistant_threads` (model messages as JSON). There is one active request per thread (409 while busy).
- **Language.** The model answers in the language the person writes in. The UI is bilingual.
- **Screen.** `/assistant`, in the Workspace menu after Inbox, has:
  - example prompts
  - history in a side sheet
  - action cards with a details view (method, path and body)
  - "Confirm all" when several changes are waiting
- Migration `161_assistant`.

## Next

- A `taskflow` CLI and an Agent Skill (`SKILL.md` plus per-area reference pages), built from the same catalogue, for local agents such as OpenCode or Goose on Ollama. This needs personal access tokens.
- Streaming replies and step progress.
- Curated request-body examples for the most-used endpoints, to help small models.

## Measured locally (2026-11-04, qwen3:8b on a 16 GB Mac, thinking off)

- About 7 to 15 s for a task to be proposed.
- Read questions take 7 to 50 s, depending on how many attempts the model needs.
- Arabic and English both work.
- The model still guesses filters and status values sometimes. The guards above catch most of this.
- A larger model (Qwen3-Coder 30B-A3B class, on a GPU host) should do noticeably better. Production needs a model host before `AI_BASE_URL` is set; until then the assistant stays hidden.
