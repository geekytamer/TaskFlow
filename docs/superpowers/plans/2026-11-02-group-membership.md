# People belong to the group; companies grant access

Status: proposal, awaiting the owner's company placement (below).

## The model: four separate facts

| Fact | Rule |
|---|---|
| **Group** | Every company belongs to exactly one group. A standalone company is a group of one, with no group chrome. |
| **Member** | Every person belongs to exactly one group. One login for the whole group. |
| **Access** | Per company, a role. Or one group-wide role covering every company, including ones added later. |
| **Employer** | At most one company, for HR, payroll, WPS, gratuity and sponsorship. Independent of access. |

Today `users.companyIds` carries membership, access and (implicitly)
employment at once, and a group borrows its people from its companies.

## Who does what

- **Owner and group administrators**: add and remove people, give access in any
  company of the group, set the employer, place companies in the group.
- **Company administrators**: give or withdraw access to their own company for
  existing members; invite a new person, who joins the group with access to that
  company only. Nothing outside their company.
- **Removing someone from the group** is one action: all access ends at once;
  their records stay; their HR record is marked as left.

## Screens

- **Group → People**: everyone once — name, employer, the companies they reach
  with the role in each, a company filter, Add person.
- **Person**: Access (one row per company with a role, or group-wide),
  Employment (employer, link to the HR record), Remove from group.
- **Company → Users**: members with access here; Give access (pick a member);
  Invite (creates a member with access here).

## What the data says (staging copy of production, 2026-11-02)

- 23 people, 13 companies. 7 people (30%) already work in 2–4 companies.
- Al-Yarubi Group holds 3 companies (Global Industrial Gate, Peak Creative
  Agency, Smart Hammer). Four companies outside it share staff with it: My
  Company, Peak Technologies, شركة البراق, مصنع القطرات الصافية. Six share no
  staff: Global Industrial Gate - NANOOXY, Tuba Dairy Factory, اكادمية موابغ,
  تطبيق نوابغ, طريق بحر الخليج Gulf Sea Way, مصنع ما وراء البحار.
- If ungrouped companies became groups of their own, 6 people would belong to
  2–3 groups, which the model forbids. **Companies must be placed first.**
- Employment cannot be derived: 1 HR record, none linked to a login. Employer
  starts empty and is shown as a to-do; payroll is unaffected (it runs on HR
  records per company, not on logins).

## Migration: no one's access changes

1. Place every company in a group (the owner's input).
2. Every person becomes a member of their group; each existing company
   membership becomes an access grant with the same role.
3. Compare every person's effective permissions per company before and after,
   on the production copy. Zero differences, or it does not ship.

Lands on `feature/permissions-v2` (not merged), so production sees one
migration, not two.

## Build order

1. Model, migration and the before/after comparison (backend).
2. Group → People and the Person page.
3. Company → Users: give access, invite.
4. Employer linked to the HR record and payroll.

## Decided

- One group per person. An outside accountant serving two groups would get one
  login per group; revisit only if it happens.
- A company administrator can invite, but only into their own company.
