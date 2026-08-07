---
applyTo: "**/*.{ts,tsx,jsx,html,css,scss}"
---

# UI/UX — Elix Star Live (UI frozen)

## HARD OVERRIDE

This app’s visuals are **final**. Workspace rules
(`strict-ui-protection-do-not-modify-design`, `no-layout-ui-changes`,
`owner-no-ui-without-permission`, `freeze-screen-visuals-during-cleanup`)
**always win** over any design checklist below.

**Do not** change layout, spacing, padding/margin/gap, sizes, typography, colors,
opacity, shadows, borders, radius, alignment, flex, z-index, icons, wrappers, or
visible JSX structure unless the user **explicitly** requests that visual change
in the same message.

**Default:** preserve rendered output 100%. Fix logic, wiring, typing, crashes,
and non-visual accessibility only.

## Allowed without a visual ask

- Bug fixes and handlers that keep the same look
- `aria-label` / non-visual a11y attributes
- Performance work that does not change pixels
- Wiring forms/buttons/routes using existing UI patterns

## Forbidden without an explicit visual ask

- Choosing or changing color schemes, typography systems, spacing, or layout
- Creating/refactoring components for appearance
- Product-level design decisions (style, hierarchy, brand)
- Restyling, modernizing, or “improving” visuals
- Applying generic SaaS/landing design advice to existing screens

## If the user explicitly requests a visual change

- Do **only** what they named
- Prefer existing Elix tokens and patterns already in the repo
- Minimal diff; do not redesign surrounding screens
- Create camera page and other owner-locked files stay locked unless named

## Advisory notes (report or explicit visual asks only)

These are **not** permission to restyle frozen UI:

- Contrast / keyboard / reduced-motion — report or non-visual fixes only
- Async buttons: disable + loading using **existing** UI affordances
- Forms: visible labels and nearby errors using **existing** patterns
- Navigation: preserve appearance; fix broken behavior only
