---
name: ui-ux-pro-max
description: >-
  Advisory UI/UX reference for Elix Star Live. Does NOT authorize visual redesign.
  Workspace UI freeze always wins: no layout, spacing, color, typography, or style
  changes unless the user explicitly requests that visual change in the same message.
  Use for accessibility/logic review notes or when the owner explicitly asks for
  design work. Stacks: React, Tailwind, Capacitor/mobile web.
---

# UI/UX Pro Max — Advisory only (Elix Star Live)

## HARD OVERRIDE (read first)

This repo’s UI is **final and frozen**. Workspace rules
(`strict-ui-protection-do-not-modify-design`, `no-layout-ui-changes`,
`owner-no-ui-without-permission`, `freeze-screen-visuals-during-cleanup`) **always
outrank** anything below.

**Forbidden unless the user explicitly asks for that visual change in the same message:**
- Creating/refactoring UI for appearance
- Choosing or changing color schemes, typography, spacing, or layout
- Product-level design decisions (style, hierarchy, brand)
- Restyling, modernizing, or “improving” visuals
- Changing navigation appearance, iconography, or component visual patterns

**Allowed without a visual ask:**
- Logic, wiring, typing, crash fixes, imports
- Performance that does not change rendered output
- Accessibility that does not change how anything looks (e.g. `aria-label` only)
- Reviewing / reporting UX issues without applying visual changes

**When the user does explicitly request a visual change:** apply only what they named; do not expand scope or redesign surrounding screens.

Skip this skill for: pure backend, API/DB, infrastructure, DevOps, payments wiring, and any task that is not UI-related.

## When to apply (narrow)

| Situation | Use this skill? |
|-----------|-----------------|
| User asked for a specific visual/UI change | Yes — only for that change |
| User asked for an accessibility/UX audit report | Yes — report only; do not restyle |
| Bug fix / wiring / production readiness | No redesign; preserve pixels |
| Agent feels like improving the look | **No** |

## Advisory checklist (report or explicit visual asks only)

Do **not** treat these as permission to edit frozen screens.

### Accessibility
- Contrast 4.5:1 (large text 3:1) — note issues; fix only if asked or if non-visual (aria)
- `aria-label` on icon-only controls (ok if no visual change)
- Tab order; `prefers-reduced-motion`
- Do not invent focus-ring / color restyles unless asked

### Touch & interaction (logic)
- Loading/disabled states for async actions if already represented in UI
- Do not enlarge targets / change gaps unless asked (that is layout)

### Performance (non-visual)
- Lazy load, avoid CLS from missing dimensions when fix is non-visual
- Do not restyle to “fix” performance

### Navigation (behavior only)
- Preserve existing routes, tab order, and appearance
- Fix broken handlers/routes without changing how nav looks

### Forms & feedback (behavior)
- Wire submit/errors using existing patterns
- Do not restyle form chrome unless asked

## Explicit design request only

If (and only if) the owner asks for design work, then and only then may you use product-type references (palettes, type scales, animation timing). Still:
- Prefer existing Elix tokens and patterns already in the app
- Minimal diff; no drive-by redesign of other screens
- Do not introduce new design systems or unused stacks

## Anti-patterns in this repo

- Applying “SaaS glass / Inter / new spacing” to existing screens
- Matching Create camera or other locked pages to another screen
- Using this skill to override owner UI freeze
