# Nexora Inspector layout alignment fix

This patch was prepared from the user-uploaded Nexora_UI_Source.zip.

## Root cause
The previous index.css alignment override applied padding to the full Inspector content, while the Board Specifications component maintained its own unindented rows and added another 10 px inset to the highlighted dimension group. The combination made titles and labels appear at different left edges.

## Changes
- `src/styles/index.css`: removes the ineffective previous inspector-wide override.
- `src/workspace/design.css`: uses 16 px horizontal insets for the tools heading and selected-component caption.
- `src/workspace/board-specifications.css`: uses 16 px horizontal insets for board headings and rows, counterbalances the dimension highlight without extra label indentation, and aligns the editable board configuration panel. A 12 px inset applies on narrow screens.

No TypeScript components, project state, component catalogs, or backend code were changed.

## Installation
Back up your existing source files before extracting this archive into `~/Desktop`.

## Validation
TypeScript check and ESLint passed using the available project dependencies. PostCSS parsing and jsdom computed-style gutter checks passed. Full Vitest and browser verification were not available in the Linux test environment because the supplied dependencies include macOS Rollup native binaries; run `npm test`, `npm run lint` and `npm run build` on your Mac.
