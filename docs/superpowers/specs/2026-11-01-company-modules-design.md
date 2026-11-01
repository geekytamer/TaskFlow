# Company modules: choosing what each company uses

The owner wants each company to see only the sections it works with: a factory
has no influencers, an agency has no manufacturing.

## What was already there

Since 2026-09-14 (migration 082) the super admin could switch catalogue modules
off per company (`companies.disabledModules`). Off means hidden in the app and
refused by the server for everyone there, admins included; group grants are kept.

## What this adds

- **Features beyond the permission catalogue** can be switched too: `inbox`
  (Inbox and staff chats), `followups`, `academy`, `influencers` (influencers,
  client and influencer portals, Discover, games, referrals) and `flexi`.
  They hold no permissions, so the server finds them from the route path
  (`FEATURE_MODULES` in `backend/src/permissions/company-modules.ts`) and checks
  them in `requireCompanyAccess`, which every route passes through, record
  routes included. A refusal is a 403 with `code: 'MODULE_OFF'` and the module.
- **Academy off** means no training locks in that company (server and app); the
  Academy itself stays the user's own across companies.
- **Areas and presets** come from the server catalogue (`moduleAreas`,
  `modulePresets`): Everything, Factory, Marketing agency, Trading, Services.
  The picker in New company and Edit company starts from a preset and lets each
  area or module be ticked on or off.
- The super admin can now open any company's edit dialog from System
  administration without being a member (it answered 403 before).
- The Switch component works right-to-left (its thumb left the track in Arabic).

## Decisions

- **No new column.** A company stores only what is off, so existing companies
  keep everything and a module added later is on everywhere by default. The
  preset is not stored: the picker shows whichever preset the list matches, or
  "Custom", so it can never disagree with the switches.
- **Only the super admin chooses modules**, as before. Company admins cannot
  switch their own modules.
- **Follow-ups need CRM**: the page needs both. Turning CRM off also hides it.
- **Client and influencer portal apps** themselves are not gated yet; with
  influencers off no portal users can be invited from the staff app.
