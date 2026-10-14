> **Phases 2–4 MVP:** Connected demo projects, ten additional configurable PCB presets, deterministic electrical/geometry/power/thermal review, smart placement, and approval-gated AI connections and firmware are available. Start with the [current demo and setup guide](docs/hackathon-demo.md). Earlier phase notes below describe the original implementation.

> **Nexora Project Studio update (2026-10):** Create and manage multiple hardware
> designs using **Projects** in the top bar. Templates include blank, cooling,
> microcontrollers, IoT, robotics, power, displays and data logging. The **AI** tab
> now offers approved add/move/remove/select/create proposals and Auto/Concise/Detailed
> response settings. See [Project Studio and AI design actions](docs/multi-project-ai-actions.md).
> These are visual concept tools, not circuit simulation or verified engineering.

# Nexora

> **Architecture at a glance:** [System diagram, tech stack, and core features](docs/architecture-overview.md).

A browser-local, interactive 3D hardware design studio. The bundled **Smart Cooling Controller** includes a procedural PCB, 14 selectable objects, editable properties, four viewing modes, a deterministic Demo Assistant, an integrated Firmware Explorer, and a Components workspace with 29 curated hardware records.

## Run locally

Use Node.js **20.19+** (or 22.12+) and npm. The local studio and Demo Assistant need no API keys. The optional online AI Guide uses a separate Python backend; see [secure AI setup](docs/ai-integration.md).

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite (normally http://127.0.0.1:5173).

```sh
npm run build       # TypeScript checks and production bundle in dist/
npm run preview     # Serve the production bundle locally
npm test            # Vitest state, persistence, command, and UI tests
npm run test:watch  # Interactive Vitest runner
npm run lint       # ESLint, TypeScript, and React Hooks rules
npm run format     # Prettier formatting
```

Browser tests need Playwright Chromium:

```sh
npx playwright install chromium
npm run test:e2e
```

Playwright starts the dev server automatically, or reuses it on port 5173. Screenshots and failure traces are written to ignored `test-results/`. Browser rendering requires WebGL; hardware acceleration is recommended for the live demo. The E2E configuration supports software WebGL for automated environments.

## A two-minute demo

1. Orbit with left-drag, zoom with the wheel, and pan with right-drag.
2. Select **Microcontroller** in the explorer or click its package in Select mode. The camera focuses and the inspector opens.
3. Edit its position, rotation, color, material, opacity, or visibility. Try Undo and Redo.
4. Choose **Exploded**, **X-Ray**, and **Connections**. Connections are illustrative animations, not computed current flow. Select a connected component to emphasize its paths.
5. Enter **“Highlight the temperature sensor”** in the Demo Assistant, or use a suggestion.
6. Save with **Save project**. Open the adjacent arrow for **Load local save**, JSON export, and JSON import.
7. Use the toolbar camera icon to export a PNG of the viewport (interface and HTML labels are excluded).

The Demo Assistant uses local pattern matching, with a short visual acknowledgement. It does not call an AI model. Supported commands include “Show exploded view”, “Switch to assembly”, “Switch to X-ray mode”, “Show connections”, “Focus on the microcontroller”, “Highlight the temperature sensor”, “Show all components”, and “Reset camera”. Unsupported commands explain the future integration boundary.

## Keyboard controls

| Shortcut | Action |
| --- | --- |
| V / O / H | Select / Orbit / Pan tool |
| F | Focus selection, or fit model if nothing is selected |
| 0 | Reset to isometric camera |
| G / L | Toggle grid / labels |
| Escape | Clear selection / close preferences |
| Cmd/Ctrl Z | Undo |
| Cmd/Ctrl Shift Z | Redo |
| Cmd/Ctrl S | Save locally |

Shortcuts are disabled while editing an input. Both Select and Orbit support left-drag rotation; Orbit suppresses component picking. Pan maps left-drag to panning. A pointer press or wheel event cancels camera animation before taking control.

## Project files and scope

A local save is explicit and uses the legacy `nexora.project.v1` localStorage key so existing saves survive the Nexora rebrand. Reload starts the bundled demonstration; **Load local save** restores saved edits. Export JSON for a portable copy. Import accepts schema versions 1 and 2, preserves the demo's 14 required IDs, and supports up to 64 total objects with validated catalog identities. Editable transforms, appearance, visibility, and project name are validated. Bundled geometry and metadata remain authoritative. Files larger than 250 KB, invalid colors, duplicate IDs, missing fields, and out-of-bounds transforms are rejected.

Undo/redo covers component additions, visual replacements, firmware-target changes, edits, visibility, imports, loads, reset, and Show all. Selection is included in project saves; view modes, camera motion and display preferences are transient. The 50-entry undo history is not saved.

Selecting a component opens **Position & Transform** in the viewport. Enter X/Y/Z in millimeters and press Enter or leave the field to apply. **Drag Mode** adds colored translation axes and plane handles; OrbitControls pause during a gesture and Escape cancels it. Each completed drag is one undo step. Coordinates always describe the canonical assembly position, including in Exploded view. **Free workspace** retains existing off-board placement; **Within PCB bounds** checks the rotated component footprint and board surface. Approximate overlap warnings do not establish electrical connectivity. PCB/housing and imported fixed components cannot be moved. See [transform implementation and validation](docs/position-transform.md).

This phase has **no electrical simulation, AI project generation, schematic generation, circuit calculations, BOM pricing, live compilation, flashing, authentication, cloud synchronization, or database**. The Firmware Explorer includes an offline-compiled Cortex-M3 demonstration with verified assembly and machine bytes; it is not a flashable application. Dimensions are concept geometry, not manufacturing CAD. Scene units equal 10 mm; component rotations in project data are degrees. Camera views are perspective, including top/front presets. The model uses local procedural geometry and generated textures; it downloads no models, fonts, or HDR environments.

## Architecture and contribution

See [architecture](docs/architecture.md), [project plan](docs/project-plan.md), and [repository guidelines](AGENTS.md). The application uses React, TypeScript, Vite, Three.js, React Three Fiber, drei, GSAP, Motion, Zustand, Tailwind CSS, and Lucide. Native accessible inputs and a modal dialog cover the current UI without adding a large primitive library.

## Firmware Explorer

Open the right-side **Code** tab or ask **“Open firmware”** in **AI**. Unlock **Edit C**, edit and save/download source, and inspect the read-only Assembly and Machine Code tabs. Editing C marks the recorded outputs outdated; there is no live compiler. Drag the right-panel divider or use Expand, and select the MCU, sensor, or MOSFET in Explorer to navigate its related code. Drafts, selected code tab, active tool panel, panel width, and collapsed state persist on this device independently of hardware project saves.

See [firmware usage, provenance, architecture, and changed files](docs/firmware.md). The demo is ARM Cortex-M3/Thumb-2, compiled with Apple Clang 16.0.0. It requires real board startup and drivers before hardware use.

## Current verification

See [the current AI integration validation record](docs/validation.md#phase-4-step-1-ai-integration) for backend and frontend test/build results. The execution sandbox blocked local server binding and Chromium launch, so the Playwright demo and visual/WebGL checks remain unverified. See the [validation record](docs/validation.md) for evidence, limits, and local verification commands.

## Components workspace

Use **Components** in the main navigation to search the 29-entry local catalog, view manufacturer references, inspect generic procedural previews, and compare up to three related products. **24 entries support visual placement** with numeric position/rotation, reset, cancel and confirmation. Select a component in Design and use **Explore replacements** to review visual alternatives. Replacing a firmware target flags recorded artifacts without changing C source.

The catalog covers Processors (7), Boards (7), Memory (4), Storage (2), Power (2), Sensors (3), Connectivity (1), and Other Hardware (3). All records are partial and all models are generic; no manufacturer-exact CAD or electrically verified drop-in replacements are claimed. Physical placement does not connect a circuit.

**Code** opens the existing editor directly. The local assistant now supports “Show microcontrollers”, “Explain this component”, “Show compatible options”, “Compare these processors”, “What is RAM?”, “Focus on selected hardware”, and “View related code”.

See [Phase 3 workflows, provenance, compatibility rules, file manifest and future adapters](docs/phase3.md).

## Design navigation and component access

Use **+ Add Component** above the viewport to open the searchable catalog drawer and start a visual placement. **Choose Board** selects the original cooling-controller concept PCB or a blank, unrouted version of the same 92 × 64 mm outline.

Desktop keeps the three-column layout; **Focus Mode** enlarges one panel. Use **Explorer / Workspace / Inspector** tabs, arrow keys, or horizontal gestures on the labeled navigation strip. Compact screens use this single-panel layout automatically. Canvas drags remain camera gestures. Inspector details now use **Overview / Electrical / Connections**, with transforms and appearance under **Advanced**.

See [workspace UX behavior, changed files and actual verification results](docs/workspace-ux.md).

## Optional online AI Guide

[Phase 4 setup and API reference](docs/ai-integration.md) covers the FastAPI backend, server-only OpenAI credentials, shared catalog grounding, structured errors and tests. The AI Guide gives read-only explanations; the explicitly labeled Demo Assistant remains available offline. AI replies cannot change the 3D scene, generate projects or compile firmware.

## Focused workspace

The canvas stays mounted beside one resizable tools panel. **Explorer**, **Workspace**, **Inspector**, **Code**, and **AI** share this panel; changing tabs retains selection, code, chat, and camera position. Explorer contains Add Component and Choose Board. Workspace contains viewing modes, camera tools, lighting and display preferences. Use **Hide tools** for the largest viewport, or **Focus Mode** to hide viewport annotations. Below 901 px, tools open over the canvas as a dismissible right drawer. Arrow keys, Home and End navigate the tab strip; the divider supports arrow keys, Home and End for resizing.
