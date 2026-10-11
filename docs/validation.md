# Validation record

## Current result: Workspace UX update

Validated 2026-10-10: **108 tests passed across 10 files**, ESLint passed, and the TypeScript/Vite production build passed. The existing nonfatal large-bundle warnings remain. The browser suite now defines 12 scenarios, including the requested 1920×1080, 1440×900 and 1366×768 layouts and mobile touch navigation.

`npm run test:e2e` was attempted again, but the sandbox still blocks Vite binding `127.0.0.1:5173` with `listen EPERM`. No browser scenarios ran and no new screenshots were captured. Actual rendered layout, WebGL interaction, native gestures and console cleanliness remain unverified. See [workspace UX results, test scope and run commands](workspace-ux.md).

## Previous result: Phase 3

Validated on 2026-10-10:

| Command | Result |
| --- | --- |
| `npm test` | **98 passed across 8 files** |
| `npm run lint` | Passed |
| `npm run build` | TypeScript and Vite production build passed |
| `npx playwright test --list` | 8 browser scenarios discovered across 3 files |
| `npm run test:e2e` | Blocked before test execution: Vite `listen EPERM: operation not permitted 127.0.0.1:5173` |

Phase 3 added 29 tests beyond the prior 69: catalog integrity, manufacturer/part-number/property filtering, source metadata, comparison rules, conservative compatibility, staged and unsupported insertion, cancel/reset/confirm, replacement confirmation/cancellation, target invalidation, retained C, undo/redo, persistence, schema migration/validation, library preference recovery, Demo Guide actions, navigation, and isolated preview recovery. The full previous regression suite remains passing.

The preview tests mock the renderer. Other interface tests mock WebGL and Monaco. These validate interface/state contracts and failure recovery, **not actual rendered 3D or Monaco behavior**. The three new browser scenarios cover preview orbit/zoom/reset, confirmed and canceled placement, tree/inspector synchronization, undo/redo, local saves, comparison, processor replacement, preserved firmware edits, and responsive catalog filtering. All eight browser scenarios remain unexecuted here; no Phase 3 screenshots were captured.

Nonfatal output: Vitest logs a multiple-Three.js-instances warning in two mocked interface suites and Motion's reduced-motion notice. Vite warns about large bundles: Three.js/rendering approximately 1,155 KB minified / 323 KB gzip, lazy Monaco approximately 3,672 KB / 948 KB gzip. Production runtime and console behavior must still be checked on the presentation machine.

No npm dependencies or compiled firmware artifacts were changed in Phase 3. Prettier was run on the changed source and test files. See [Phase 3 implementation and limitations](phase3.md).

## Previous firmware integration validation

Firmware integration validated on 2026-10-10 with Node.js 20.20.2 and npm 10.8.2.

## Passed

- `npm ci --offline --cache /private/tmp/nexora-npm-cache`: clean lockfile install, including Monaco and its dependencies. The portable lockfile uses npm registry URLs, not temporary tarball paths. Use normal `npm ci` on a connected development machine.
- `npm test`: **69 tests across five files**. All 43 pre-existing workspace, camera, and interface tests remain passing. Added 24 firmware state/provenance/export/command/UI tests and two editor-initialization recovery tests.
- `npm run lint`: passed.
- `npm run build`: TypeScript and Vite production build passed. Monaco and its worker are local assets loaded lazily on first firmware open.
- `python3 scripts/build-demo-firmware.py`: Apple Clang 16.0.0 compiled Cortex-M3 Thumb-2 C and assembly; reassembled `.text` matches all 22 bytes from the C object. The extractor validates ELF32/ARM/little-endian metadata and rejects unresolved `.text` relocations. Tests verify source and binary SHA-256 and exact compiler assembly provenance.
- `npx playwright test --list`: five browser scenarios discovered (two existing, three firmware scenarios).
- Prettier run on changed TypeScript, CSS, test, and manifest files.

Tests cover source edits and saved baselines, storage recovery and failure, reload persistence, build invalidation, immutable compiled exports, stable component associations, passive empty states, assistant commands, panel/tab state, keyboard resize bounds, expand/restore, viewport mode controls, keyboard isolation, copy errors, and a plain-text fallback after Monaco initialization failure. UI tests mock the WebGL scene and Monaco; they do not establish real browser rendering or editor behavior.

Vite reports its nonfatal large-chunk warning: the existing rendering bundle is approximately 1.15 MB minified / 322 KB gzip; the lazy Monaco bundle is approximately 3.67 MB / 948 KB gzip. These assets are local; opening the firmware panel incurs the editor's initial load. Motion logs its expected reduced-motion notice during testing.

## Browser validation blocked

`npm run test:e2e` was attempted. Vite cannot bind `127.0.0.1:5173` in this execution sandbox (`listen EPERM`), so browser tests never execute. No runtime screenshots were captured in this environment.

Consequently, **real Monaco initialization, rendered syntax highlighting, canvas resizing, orbit/zoom/pan, scene picking, visual transitions, browser console cleanliness, responsive appearance, and performance remain unverified here**. Automated state, camera math, and UI tests are not substitutes for those checks. The unchanged 3D implementation and passing regression suite support the integration but do not establish full browser acceptance.

## Run locally

```sh
npm ci
npx playwright install chromium
npm run test:e2e
npm run dev
```

The existing E2E scenarios exercise WebGL, orbit/zoom/pan, direct component picking, tree/inspector synchronization, all four viewing modes, camera focus, local project files, preferences, and responsive layouts. Firmware scenarios add real Monaco editing, clipboard/download contents, stale artifacts, pointer resize, expand/restore, retained canvas identity, reload persistence, component-to-code navigation, assistant commands, responsive panel screenshots, and an intentionally failed editor chunk. Screenshots are written to ignored `test-results/` when these scenarios can run.

For the hackathon, inspect the combined viewport and panel on the actual laptop, rapidly resize the panel, verify editor search/bracket matching/undo, and test camera interaction while the panel is open. These manual checks remain outstanding.

## Feature boundaries

The compiler was used offline to build the bundled example, not integrated into the frontend. No arbitrary user C is compiled or executed. The sample contains RAM adapters rather than board drivers and is not flashable. Live AI firmware generation, target-specific compilation, board support, flashing, electrical simulation, authentication, and cloud services are deferred. See [firmware provenance and file manifest](firmware.md).

## CircuitForge rename verification

Re-ran `npm test` (69 passed), `npm run lint` (passed), and `npm run build` (passed) after the branding update. Re-attempted `npm run test:e2e`; local server binding is still blocked by `listen EPERM`. A source scan confirms that remaining Nexora references are the two intentionally retained localStorage keys and historical cache documentation. Existing saved projects and firmware drafts use the same keys and schemas.

## Phase 4 Step 1 AI integration

Verified on 2026-10-10:

- `python3 -m unittest discover -s backend/tests -v`: **14 passed**, using Python 3.10.5 and the installed versions pinned in `backend/requirements.txt`. Includes real OpenAI SDK request serialization and structured response parsing with mocked HTTP, no-key fallback, shared catalog grounding, invalid inputs, unsupported references, refusal/incomplete outputs, origin restrictions, local/provider rate limits, concurrent-request limits, timeouts, and sanitized unexpected/provider errors.
- `npm test`: **116 passed across 11 files**, including eight new AI client/state/UI tests plus all existing scene-state, catalog, navigation, persistence and firmware regressions.
- `npm run lint`: passed.
- `npm run build`: passed TypeScript and Vite production bundling. Existing large Three/Monaco chunk warnings remain.
- `npm run test:e2e`: attempted; Vite failed to bind `127.0.0.1:5173` with `listen EPERM`. Browser tests did not execute. No new browser-rendering or live socket verification is claimed.
- API key configuration checked without printing secrets: no key configured. **No live OpenAI request made**; provider credentials, quota and model availability remain unverified. Tests used existing installed Python dependencies, not a fresh network installation.
- Source/build scan found no `OPENAI_API_KEY` identifier in `src/` or `dist/`; the key is read only by backend configuration.

Nonfatal test warnings: existing duplicate Three imports/reduced-motion notices, and a Starlette TestClient deprecation notice for its currently working HTTPX adapter. No failures or uncaught test errors remain.

See [AI setup, API contract, changed files and security boundaries](ai-integration.md). The backend is a loopback development service; authenticated public deployment, shared quotas, autonomous actions, generation, compilation and a database are not implemented.
