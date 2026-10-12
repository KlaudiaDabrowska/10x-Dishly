## Repository-wide commit rules

Before creating or amending any commit, read and follow [commit conventions](.agents/AGENTS.md). These conventions apply to every commit in this repository, regardless of which files are changed.

## Dishly UI contract

- Treat `src/styles/global.css` as the applied token source. The original tweakcn `cagops` values are preserved in
  `context/changes/unify-dashboard-design-system/theme-source.json`, and documented mappings and accessibility
  corrections live in `theme-contract.md` beside it.
- Reuse primitives from `src/components/ui` and existing feature components before creating another component. Add a
  missing primitive through the existing shadcn setup in `components.json`, then review the generated diff.
- In product views, use semantic roles such as `background`, `foreground`, `primary`, `muted`, `card`, `border`, and
  `ring`. Do not add literal colours, palette colour utilities, inline styles, or arbitrary Tailwind values there.
- Keep controls on the shared Button scale (`min-h-11`, `rounded-lg`) and surfaces on the shared Card/Alert scale
  (`rounded-xl`, `shadow-surface`). Use the documented spacing scale instead of one-off dimensions.
- Exercise shared states in `tools/ui-preview`. Store change-specific visual evidence and its viewport/state matrix
  under `context/changes/<change-id>/`; do not create a public product route for fixtures.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 5 (10xDevs 4.0 UI)

**For UI work on a view that already renders, use `/10x-ui`.** It runs the visual
change through the same chain as any other change (`/10x-new` → `/10x-research` →
`/10x-plan` → `/10x-implement` → `/10x-impl-review`) and carries the rules:
when to start and which view, the audit into charges, the design-system contract as
this repo realises it, the component states, the screenshot gate, and the rule that
keeps the next agent on the contract. Its `references/` hold the quality checklist.

Building a view for the first time is not a `/10x-ui` job — build it through the
ordinary chain, then come back to it with `/10x-ui`.

<!-- END @przeprogramowani/10x-cli -->
