# Documents hub — design (2026-11-06)

Owner's ask (Arabic, 2026-11-06): one Documents section where you make templates,
a library holding every document and attachment, the assistant able to read and find
documents on request, and one place to create any kind of document (quotation, MoU,
anything needed). Owner said "Yes, start"; decisions below are mine (standing
"decide, don't ask").

## Today

- `/documents` has two tabs: **Templates** (invoice/quote designs + document
  templates with fields) and **Documents** (documents made from a template).
- Files uploaded on a record live in `record_attachments` (bytes in a `content`
  BLOB, 20 MB cap), reachable only from that record's support panel. No page lists
  them all; nothing can be uploaded that isn't tied to a record.
- The assistant cannot see files.

## Stages (each its own PR)

1. **Library** (this spec, built first): one list of every file and generated
   document the person may open, search + filters, direct upload with folders.
2. **Create**: a "New document" chooser (quotation → the existing quote dialog;
   MoU / contract / letter / service offer → document from a template or blank);
   starter templates in Arabic and English.
3. **Services & prices** under Sales (non-stock items behind the sales module),
   "save as service" on a manual line, "+ new client" in the quote dialog.
4. **Assistant reads documents**: text extraction (PDF, DOCX, images by OCR) into a
   searchable index; the assistant answers with a link, under the same visibility.

## Stage 1 — Library

### Data

- Reuse `record_attachments`. A file uploaded straight to the library is an
  attachment on the company record (`entityType = 'company'`, `entityId =
  companyId`) — that entity type already exists.
- Migration `166_library_folder`: `ALTER TABLE record_attachments ADD COLUMN folder
  TEXT`. (165 is taken by the unmerged assistant PR #34.) Folder is a free label,
  trimmed, ≤ 80 chars, null = no folder. No folder table (YAGNI): the folder list is
  the distinct labels in use.

### API

- `GET /companies/:companyId/library?q=&source=&folder=` — permission
  `documents.view` (legacy: Admin/Manager/Accountant), documents module on.
  Returns `{ items, truncated }`, newest first, at most 500 items; `truncated`
  says more exist so the page can say "showing the newest 500 — search to narrow".
  Item: `{ id, kind: 'attachment' | 'document', name, mimeType, sizeBytes, folder,
  hasContent, url, entityType, entityId, recordLabel, route, uploadedByName,
  createdAt }`.
  - Generated documents (`documents` table) come in as `kind: 'document'`, route
    `/documents?tab=documents`.
  - `q` matches file name, note, folder, record label (case-insensitive).
  - `source` filters by entity type (`company` = uploaded to the library).
- `POST …/records/company/:companyId/attachments` (existing) also takes `folder`.
- `PATCH /record-attachments/:id` — new: rename / move to folder (`fileName`,
  `folder`); permission `documents.edit`, and the same record access as reading it.

### Who sees what (the important part)

A row is listed only if the person could open it from its own record, never more:

- documents module on, `documents.view` (route gate);
- the record's module on (`RECORD_ENTITY_MODULES`);
- task → `canViewTask`; project → `canViewProject`; contact/client/supplier →
  visible contact; opportunity/campaign/commission → their visibility areas;
- every other entity → the record module's `.view` key (legacy: management roles);
  HR (`employee`) needs `hr.view`, payroll runs `payroll.view`;
- `company` (library uploads) → `documents.view` is enough.

Download keeps using `GET /record-attachments/:id/content`, which already runs the
record's own check.

### Page

Documents gets a third tab, **Library / المكتبة**, shown first. Search box,
"source" filter (Library uploads, Tasks, Projects, Clients, Invoices, …), folder
filter, Upload button (file + optional folder, 20 MB), table: name (icon by type),
from (record label linking to the record), folder, uploaded by, date, size, actions
(open, download, move to folder, delete when allowed). Arabic and English. Empty
state explains that files attached anywhere show up here.

### Tests

Backend: library lists company uploads and record files; hides a private task's
file from an employee who can't see the task; hides files of a module switched off;
hides HR files from someone without `hr.view`; `q`/`source`/`folder` filters;
upload with folder; PATCH moves folder and refuses without `documents.edit`;
500-cap sets `truncated`. Run under legacy, shadow and v2.
