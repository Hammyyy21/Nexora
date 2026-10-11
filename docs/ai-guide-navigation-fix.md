# AI Guide navigation and React root lifecycle

## Findings

The two defects have independent causes.

- Main navigation only handled Design, Code, and Components; AI Guide had no navigation action. The existing chat caption toggled component-local open state. `App` rendered one `CommandBar` inside the hidden design shell and a second inside the conditional library shell. Switching to Components therefore exposed a fresh, closed conversation with an empty input; switching away destroyed that instance. Regression tests failed before the fix on the missing navigation action and duplicate chat inputs.
- The exact “Attempted to synchronously unmount a root while React was already rendering” warning was reproduced in a temporary test using the installed `@react-three/drei/web/Html.js` under StrictMode (with scene hooks mocked). `Html` creates a React DOM root for each label in a layout effect, then calls `currentRoot.unmount()` in its cleanup. StrictMode effect replay and label removal exercise this path. The reproduction was removed after diagnosis; the replacement has StrictMode cleanup tests.
- The hardware Canvas already remained mounted across workspace changes. Navigation hid its design shell with `display: none` and `inert`, and paused its frame loop. No navigation-driven hardware Canvas replacement was found. Catalog preview Canvases intentionally remount on preview reset or closing details. They do not contain the problematic `Html` labels.
- The application creates its DOM root once in `main.tsx`. Monaco creates editor instances and disposes subscriptions, editors, and models in effect cleanup; it does not create React roots. No application portals or additional explicit DOM-root creation were found.
- CSS inspection found chat responses positioned above their command area, inside shells with `overflow: hidden`. The hidden design chat was also inert in Components. The shared chat now lives outside both shells. Browser hit testing and the exact reported click failure could not be reproduced here: binding the Vite server to loopback is denied, and Playwright's browser executable is absent. No CSS interception is claimed as a verified cause.

## Changes

| Files | Change |
| --- | --- |
| `src/app/App.tsx` | Mount one existing CommandBar outside the workspace shells. |
| `src/ai/store.ts` | Own shared conversation open state. |
| `src/components/layout/TopBar.tsx` | Add an AI Guide action that opens the existing conversation, with expanded/control semantics. It does not replace the current workspace. |
| `src/components/layout/CommandBar.tsx` | Use shared open state, expose an accessible conversation region, and focus the existing input when opened. |
| `src/catalog/navigation.ts` | Preserve component selection when entering Code, including components without associated firmware. |
| `src/catalog/catalog.css` | Show the Guide action's expanded state. |
| `src/three/ComponentLabels.tsx` | Render labels in the application DOM root and project animated scene positions each frame without scheduling React renders. |
| `src/three/ComponentMesh.tsx` | Remove per-component drei Html roots. |
| `src/three/HardwareScene.tsx` | Connect the DOM labels and scene projection while retaining the existing Canvas. |
| `src/styles/index.css` | Position the noninteractive label layer. |
| `tests/guide-navigation.test.tsx` | Cover guide opening, single chat/input identity, repeated navigation, scene/editor retention, selection, project, camera request, and unsaved firmware. |
| `tests/component-labels.test.tsx` | Cover animated projection, missing/behind-camera geometry, zero-size hiding, label visibility, and StrictMode teardown. |
| `tests/ai-guide.test.tsx` | Cover pending UI, duplicate submission prevention, and recovery from a structured FastAPI timeout. |
| `tests/e2e/ai-guide.spec.ts` | Add desktop/mobile browser click, focus, persistence, label-toggle, console-error, and screenshot checks. |

No lifecycle delays, warning suppression, or duplicate guide implementation were added. Existing camera-preservation tests exercise camera position and OrbitControls target across resizes and zero-size hiding. Existing chat tests cover submission, structured answers, offline/no-key fallback, rate limits, malformed responses, request aborts, and preventing AI responses/errors from executing local commands.

## Validation

- `npm ci --offline --ignore-scripts`: passed; dependencies installed from the lockfile.
- `npm test`: 121 tests passed across 13 files.
- `backend/.venv/bin/python -m unittest discover -s backend/tests -v`: 14 tests passed, including provider errors, timeout recovery, no-key fallback, and real SDK serialization with mocked HTTP. No paid provider request was made.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run test:e2e -- tests/e2e/ai-guide.spec.ts`: blocked before tests started by `listen EPERM` on `127.0.0.1:5173`. A separate launch probe also found the Playwright Chromium executable missing. Browser validation and screenshots remain outstanding.

A final targeted TypeScript/lint check and the strengthened editor-retention test also passed. Prettier checking found existing compact rules at the end of `src/styles/index.css`; these unrelated rules were left unchanged.

Remaining output: Vitest reports multiple Three.js instances and Motion's reduced-motion notice; Vite reports large Three.js/Monaco chunks. The original root-unmount warning is absent from the passing regression suite. Browser-wide warning clearance has not been verified.
