# Design workspace UX update

Implemented 2026-10-10 as an incremental update. No dependencies or backend services were added.

## Component access

**+ Add Component** and **Choose Board** sit in a persistent toolbar above the Design panels. They remain outside the Explorer and Inspector scroll areas and remain available in Focus Mode.

The component drawer reuses `filterCatalog`, catalog definitions and the existing `beginPlacement` action. It provides name/manufacturer/part-number search, category filtering, sourced specifications, expandable descriptions, manufacturer references and unsupported-placement explanations. Add to Design closes the drawer, opens the Workspace panel and starts the existing translucent preview. Numeric placement, reset, cancel and confirmation remain unchanged. Confirmed instances synchronize with the scene, tree and inspector. Search and selected catalog details survive drawer closure during the session. The full Components workspace remains available.

Choose Board provides two supported concept templates:

- Smart Cooling Controller: the original 92 × 64 mm concept PCB and illustrative artwork.
- Blank 92 × 64 mm PCB: the same outline/mounting geometry without demo routing or silkscreen. Illustrative connection paths are suppressed.

Board changes preserve component instances, transforms and C source, participate in undo/redo, and persist as validated project metadata. A blank board marks the recorded build outdated. This is not arbitrary board import, resizing, electrical rewiring, or a verified PCB design. Catalog development boards remain separate visual components. The existing PCB silkscreen branding was also corrected to CircuitForge.

## Design panel navigation

Desktop retains the three-column layout. **Focus Mode** presents a single panel with **Explorer / Workspace / Inspector** tabs. Below 1100 px the same single-panel layout is automatic. Arrow Left/Right, Home and End navigate the tab strip; ordinary Tab moves through controls.

Horizontal trackpad scrolling and touch swipes are accepted **only in the labeled navigation strip**. Gestures inside the 3D canvas, editors, forms, drawers and lists do not bubble into a navigation handler. Horizontal intent thresholds and a wheel cooldown prevent accidental multi-panel changes. Panels snap between fixed positions with a 260 ms transition. System reduced-motion preferences and the application's reduced-motion setting disable these transitions.

All three Design panels remain mounted. Inactive Focus Mode panels are inert and hidden from assistive technology. Scene rendering pauses when the Workspace panel is offscreen. Switching panels does not change selection, project transforms, viewing mode, pending placement, firmware tab, panel size or C drafts. The Demo Assistant remains below the panels.

Camera layout resizing now changes projection without issuing a new fit request. User orbit position and OrbitControls target are retained. Explicit Fit, Focus, view-mode and placement requests still animate the camera. Initial framing tolerates zero-size viewports and React StrictMode's effect replay.

## Inspector

- **Overview:** descriptions, purpose and related catalog/code actions.
- **Electrical:** curated voltage/current/resistance/power specifications where present, with source links. Missing values are explicitly unknown; these are not live readings.
- **Connections:** curated interfaces, unknown pin assignments and existing illustrative connection metadata. Replaced endpoints and blank boards do not retain misleading demo paths.
- **Advanced · Transform & appearance:** expandable controls for position, rotation, reset, material, color, opacity and visibility.

Inspector tabs and the Advanced disclosure retain session state during panel navigation. Existing animation and focus controls remain available.

## Validation

- `npm test`: **108 passed across 10 files**.
- `npm run lint`: passed.
- `npm run build`: TypeScript and Vite production build passed. Existing large rendering/Monaco chunk warnings remain nonfatal.
- `npx playwright test --list`: 12 scenarios across 4 files.
- `npm run test:e2e`: attempted, blocked before browser execution by `listen EPERM: operation not permitted 127.0.0.1:5173`.

Ten additional unit/UI/controller tests cover the drawer, filtering, supported/canceled placement, unsupported reasons, tab switching, wheel/touch isolation, compact mode, scene identity, selection/project/firmware preservation, Inspector tabs, template persistence/undo/invalidation, camera position/target preservation, deferred framing and StrictMode recovery. Existing tests were updated to expand Advanced before editing properties.

The new Playwright scenarios target **1920×1080, 1440×900, 1366×768**, and mobile **390×844**, including orbit/zoom/pan, placement, navigation and code retention. They have not executed in this sandbox. **Rendered layouts at these sizes, real touch behavior, WebGL interaction, visual transitions and runtime console cleanliness remain unverified here. No screenshots were captured.** Mocked-renderer tests and camera-controller tests do not replace browser acceptance.

Run locally:

```sh
npm ci
npm run dev
```

For browser verification:

```sh
npx playwright install chromium
npm run test:e2e
```

The browser suite writes screenshots to `test-results/`. Before a live demonstration, also check gestures on the actual trackpad/touch device and confirm that the viewport remains comfortable with firmware and placement controls open together.

## Files

Added `src/workspace/layout.ts`, `DesignNavigation.tsx`, `DesignDrawer.tsx`, `boardTemplates.ts`, and `design.css`; `tests/design-ux.test.tsx`, `tests/camera-preservation.test.tsx`, and `tests/e2e/design-ux.spec.ts`.

Updated application composition; TopBar, ProjectSidebar, InspectorPanel and WorkspaceToolbar; CameraController, HardwareScene and HardwareBoard; workspace state/types, project validation, catalog navigation and firmware hardware-validity derivation. Updated relevant existing interface/browser tests, README, architecture and validation notes. Catalog definitions and compiled firmware artifacts were preserved.
