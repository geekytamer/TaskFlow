# Two-language names (Arabic + English) — design

Date: 2026-11-10 · Owner approved in chat ("عجبني سوي نفذ") · Branch `feature/bilingual-names`

## Why

Found by using Peak's live data: every record has one name, typed in Arabic or in English. An
English quote prints Arabic service names ("تهيئة فردية"), and someone working in Arabic cannot
find a contact that was typed in English (and the reverse). Search also treats أحمد / احمد and
مؤسسة / مؤسسه as different words.

## Decisions

1. **Two explicit fields per record: `nameAr` and `nameEn`** (both optional, at least one
   required). The existing `name` column stays and is always filled, so every screen not touched
   here keeps working. Follows the `nameAr` convention already used by permission groups,
   holding groups and games. Rejected: a generic translations table (too much machinery for the
   need), automatic translation on save (unreviewed text on customer documents).
2. **`name` keeps its side.** On save, `name` = the value on the side `name` was already written
   in (Arabic script or not), falling back to the other side. A new record's side is the side the
   person filled first (the form shows their interface language first). So a company that works in
   Arabic keeps Arabic in `name` everywhere it is still read raw.
3. **Backfill, no data lost.** Migration copies each existing `name` into `nameAr` when it contains
   Arabic letters, otherwise into `nameEn`.
4. **Display rule** (one helper each side): language field → other language field → `name`.
5. **Document lines carry both.** Quote / sales order / invoice lines get optional
   `descriptionAr` / `descriptionEn`, filled when an item or service is picked. A document prints
   the line in its language (quote language from PR #49, else the reader's). Typing over a line's
   description by hand drops the pair: hand-written text prints as written in both languages.
   The pair travels quote → sales order → invoice like `description` does.
6. **Client name on documents** follows the same rule (`{{client.name}}` resolves by document
   language).
7. **Search ignores Arabic spelling variants and matches both names.** One normaliser (strip
   diacritics and tatweel; أ إ آ ٱ → ا; ى → ي; ة → ه; ؤ → و; ئ → ي; lower-case Latin) used by the
   global search (⌘K), the contacts list, the client picker, and the item picker on quote lines,
   which becomes a searchable combobox (it is a plain select today).
8. **"اقترح ترجمة / Suggest translation"** next to the two name fields. Uses the in-app assistant
   model (qwen3 on the owner's Mac through the SSH tunnel; `AI_BASE_URL` / `AI_MODEL`). No paid API.
   It only fills the empty other-language field; the person reviews or edits, then saves. Nothing is
   saved automatically. People and company names are *transliterated* (lilas restaurant → ليلاس
   ريستورانت), services and products are *translated*; the model can get names wrong, which is why
   every suggestion is reviewed. When the model is offline (Mac off, tunnel down) the button says so
   and the field stays manual. (Correction: an earlier message said auto-translation needed paid AI;
   it does not.)
9. **Bulk suggestions for services:** on Sales → Services & prices, "Suggest missing names" lists
   every service missing one side with the model's suggestion; the person ticks / edits and saves.

## Scope

Phase 1 (this branch): inventory items and services (one table, `inventory_items`), contacts and
clients, quote / sales order / invoice lines, the printed documents, search, the suggest button and
the bulk services screen. Also fixes a bug found on the way: editing a contact's name never updated
the linked `clients` row, so the old name stayed on that copy.

Phase 2 (later): employees and users, projects, suppliers on purchase orders, payslip names.

## Pieces

| Piece | Where | What it does |
|---|---|---|
| `scriptSide(text)` / `pickName(rec, lang)` / `resolveNames(input, existing)` | `backend/src/names.ts` | which side a text is in; display rule; `name` from the two sides on save |
| migration `170_bilingual_names` | `store.ts` | adds `nameAr`, `nameEn` to `inventory_items`, `contacts`, `clients`; backfills |
| store create/update | `store.ts` | accept and return `nameAr` / `nameEn`; contact rename syncs its client row |
| line items | `normalizeSalesOrderItems`, invoice line parse | keep `descriptionAr` / `descriptionEn` |
| `normalizeSearch(text)` | `backend/src/search-normalize.ts`, `frontend/src/lib/search-normalize.ts` | same rules both sides |
| `POST /companies/:companyId/name-suggestion` | `backend/src/routes/name-suggestion.ts` | `{ text, from: 'ar'|'en', kind: 'name'|'term' }` → `{ suggestion }`; 503 `ASSISTANT_OFFLINE` |
| `BilingualNameFields` | `frontend/src/components/bilingual-name-fields.tsx` | the two inputs + suggest button, used by services, items, contacts, client dialog |
| `displayName(rec, language)` | `frontend/src/lib/display-name.ts` | the display rule for lists, pickers, documents |
| document lines | `doc-renderer.tsx` | description and client name by document language |

## Errors and edge cases

- Both name fields empty → 400 "Enter the name in Arabic or English".
- A side typed in the wrong script (Latin in the Arabic field) is accepted as typed; the backfill
  only decides the starting side.
- Suggestion: empty text → 400; model timeout or offline → 503 with `ASSISTANT_OFFLINE`; the model
  reply is trimmed to one line, at most 200 characters, and never saved by the server.
- Old lines without the pair print `description` as today.

## Testing

- Backend: backfill (Arabic → `nameAr`, Latin → `nameEn`); `name` keeps its side on edit; create
  with only one side; both empty → 400; contact rename updates its client row; line pair survives
  quote → sales order → invoice; search finds "احمد" for "أحمد" and the English name from Arabic UI;
  suggestion route offline → 503 (model stubbed), online → trimmed suggestion.
- Frontend: `displayName` fallbacks; normaliser cases; renderer prints `descriptionEn` on an
  English quote and `descriptionAr` on an Arabic one, hand-written description unchanged.
- Production check after deploy: Peak's services backfilled to `nameAr`; an English print of a
  quote with an English name added shows it.
