# Writing a document like in Word — design (2026-11-07)

Owner's ask (Arabic, 2026-11-07): when making a new document such as an MoU,
write on it like in Word instead of only filling boxes. Owner said "Yes, build
it"; decisions below are mine (standing "decide, don't ask").

## Today (before)

The composer showed fill-in boxes per `{{field.*}}`, a notes box and a read-only
preview. Changing a clause for one document meant changing the template, which
changes every later document.

## Decisions

- **Where the text lives.** A template's wording is its longest run of top-level
  `heading`/`text` blocks (`writableRange`). That run becomes one editable body
  per document; logo, letterhead, signatures, line items and anything else
  around it stay as the template made them. Ties go to the first run.
- **Stored as editor JSON, never HTML**, in the document's field values under
  `document.body` (no migration: field values are already a per-document map and
  are frozen with the document on finalize). The server accepts it only as a
  `{type:'doc', content:[…]}` object, up to 400 000 characters (other fields keep
  their 20 000 limit).
- **Printing.** `DocRenderer` swaps the run for the body, one `richText` block per
  top-level paragraph/heading/list/table, so screen pages still break between
  paragraphs and the PDF (which prints the same page) follows. A missing or
  broken body prints the template as before. The body is drawn by a small JSON →
  React renderer (`rich-text.tsx`) that knows only the node and mark types the
  editor makes: text is always text, so a stored body cannot carry script.
- **Fields stay smart.** In the text a field is a `token` node shown as a chip:
  its value once known (client, company, date, filled box), otherwise its name.
  Clicking a chip jumps to its box. Typing `{{field.x}}` becomes a field. "New
  field" adds one by name in any language (`field.<latin slug>` or `field.f_N`);
  the name is kept on the token. The boxes on the left are the fields in the
  text (plus any outside it): deleting a field from the text removes its box.
- **Notes.** On a written page the notes box goes away; what was in it is written
  in where the template had `{{document.notes}}`. Templates with no wording to
  write over keep the old boxes-and-notes composer.
- **Old drafts** open converted from their frozen template, with their filled-in
  values; finalized documents are unchanged (they can't be edited anyway).
- **Editor**: TipTap 3 (ProseMirror), pinned 3.33.0. Toolbar: undo/redo, title /
  heading / clause heading / normal, bold, italic, underline, strikethrough,
  bulleted and numbered lists, align right/centre/left/justify, line, table (add
  and delete rows/columns), insert field, new field. The page is drawn at the
  template's paper size and margins, theme font and colour, in the document's
  direction. "Template wording" puts the template text back (asks first).
- **Search and the assistant** read the written text in place of the template's
  wording (`documentText` mirrors `writableRange`). The server's token context
  now also has `document.date` and `document.number`, which were blank.

## Not in this stage

Download as Word (.docx), tracked changes between versions, images inside the
text, page headers/footers in the editor.

## Tests

Frontend: the MoU's wording becomes the body with logo and signatures kept;
line breaks/paragraphs/empty text; broken body prints the template; longest run;
field names and keys; the renderer prints written text with fields, keeps HTML as
text and drops unknown nodes. Backend: written text read in place of the
template wording, broken body falls back; a long body is saved, HTML or a
non-doc is refused, the 400 000 cap holds, other fields keep their limit.
Browser: an old MoU draft opened converted, a field filled updates its chip,
typed text, a new field, saved, reopened, table, print page with signatures on
page 2.
