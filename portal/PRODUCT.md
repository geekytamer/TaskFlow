# Product

> Draft (2026-10-04), written from the repo's specs and the owner's stated decisions while they were away. Confirm or correct before relying on it.

## Register

product

## Users

- **Clients of Peak Media** (brand managers, marketing leads at Gulf companies, often on a phone, in Arabic or English): browse influencers, send campaign requests, answer proposals, follow campaigns, review content, pay invoices, message their account manager.
- **Influencers working with Peak** (creators, mostly on a phone, Arabic-first): accept assignments, read briefs, submit content, mark it published, follow payouts, keep their profile current.
- **Followers of brands** (public, no account): watch a game's leaderboard in the public lobby.

## Product Purpose

Give Peak's clients and influencers one place to do their side of the work, so account managers stop relaying everything by WhatsApp, while nothing internal (real rates, margins, notes, other clients) ever leaks across. Success: a client goes from request to paid invoice, and an influencer from invitation to payout, without leaving the portal.

## Brand Personality

Calm, exact, trustworthy. Plain language, no hype. The portal speaks for an agency handling money and reputations; it should feel as dependable as a bank statement and as quick as a messaging app.

## Brand Commitments

- Visual direction (owner's choice, 2026-10-05): both portals wear Peak's own brand (peak-creative.agency: its colours, typefaces and logo). Structure and finish follow the category's best, Stripe Dashboard and Mercury: standard controls, precise numbers, no decorative theme beyond the brand.

## Anti-references

- "AI slop" (the owner's words): generic SaaS cream backgrounds, gradient text, hero metrics, identical card grids, decorative motion.
- Influencer-marketplace dazzle (neon, follower-count bragging, confetti). Numbers are information, not spectacle.
- Machine-translated Arabic or Arabic as an afterthought: layouts that break or reverse in RTL.

## Design Principles

1. Secrecy by construction: the interface never hints at what the other side pays or earns.
2. One clear next action per screen; everything else is reading.
3. Arabic is a first language, not a translation: right-to-left, Arabic punctuation, Latin digits for money.
4. Phones first: every amount, button and status is reachable at 375px without sideways scrolling.
5. Derived truth: statuses come from real records, so the screen never contradicts what staff see.

## Accessibility & Inclusion

WCAG 2.2 AA. Text contrast at least 4.5:1, visible focus, labelled controls, `dir="auto"` on anything a person typed, reduced motion respected, no information carried by color alone.
