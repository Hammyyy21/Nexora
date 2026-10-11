# Phase 3: Hardware library and customization

Implemented on 2026-10-10. CircuitForge remains a browser-local React/Three.js studio. No backend, live AI dependency, electrical simulator, or live compiler was added.

## What is available

- **Design / Code / Components** navigation. Code expands the existing Firmware Explorer inside the design workspace. Navigating to Components keeps the design canvas and editors mounted, pauses scene rendering, and preserves edits.
- Local search by name, manufacturer and part number; category/subcategory, manufacturer, interface and visual-placement filters. Filter preferences persist separately from project saves.
- Component cards, detailed beginner explanations, collapsible technical specifications, manufacturer links, source dates, partial-record indicators, and generic interactive previews.
- Comparison of up to three products from the same subcategory. Missing values are Unknown; clocks are not treated as benchmark rankings.
- Staged visual insertion, numeric position/rotation controls, reset/cancel/confirm, project-tree selection, inspector editing, and undo/redo.
- Explicit visual replacement confirmation, conservative integration findings, target selection and firmware invalidation without source modification.
- Contextual local Demo Guide commands through the existing Demo Assistant, and an explanation action inside component details.

At initial inspection, the repository already contained the bottom Firmware Explorer and its C, Assembly and Machine Code views. It did not contain top-level Code/Components navigation, a catalog, a separate AI Guide, or a global Beginner/Advanced mode. This implementation adds navigation and catalog-specific Advanced details; it extends the local assistant rather than introducing a live AI service.

## Actual catalog: 29 entries

| Category | Count | Entries |
| --- | ---: | --- |
| Processors | 7 | RP2040, RP2350 family, ATmega328P, STM32F103C8, STM32F401CC, Intel Core i5-12400, AMD Ryzen 5 5600G |
| Boards | 7 | Pico, Pico 2, Raspberry Pi 5 4GB, Compute Module 4 family, NUCLEO-F401RE, Arduino Uno Rev3, ESP32-DevKitC-32E |
| Memory | 4 | Kingston KVR32N22S8/8 DDR4, KVR48U40BS8-16 DDR5, Microchip 23LC1024 SRAM, 24LC256 EEPROM |
| Storage | 2 | Winbond W25Q128JVSIQ SPI NOR, Samsung 970 EVO Plus MZ-V7S1T0 |
| Power | 2 | Infineon IRLZ44NPbF, TI LM1117 family |
| Sensors | 3 | TI TMP102, Bosch BME280, Sensirion SHT31-DIS-B |
| Connectivity | 1 | Espressif ESP32-WROOM-32E module |
| Other Hardware | 3 | TI DRV8833, Raspberry Pi 5 Active Cooler, Raspberry Pi Touch Display 2 7-inch |

Every entry links manufacturer material. Individual numerical specifications include units and source URLs. All records are labeled **partial**, because only a selected set of facts was checked; none claims complete electrical characterization. Product/device/family identity is explicit. Unknown voltages, footprints, dimensions and interfaces remain unknown. For SHT31, the source page's inconsistent minimum supply values are called out rather than selecting an invented value.

The category structure also exposes currently empty categories (for example LPDDR5, desktop motherboards, batteries and resistors) with an empty state. These are not populated products or supported integrations.

## Models and placement

**Manufacturer-exact models: 0. Package-accurate models: 0. Generic procedural previews: 29.** The models use reusable local geometry and existing material/texture helpers. Pin counts, board sizes, markings and geometry are illustrative. Verified physical dimensions, where supplied, are separate from `visualSize`, which is an arbitrary scene size. No third-party CAD assets were downloaded or licensed for redistribution.

**24 entries support visual insertion.** RP2350, Compute Module 4 and LM1117 family records, plus the two desktop processors, remain catalog/preview/comparison-only. Their buttons include explanations. Supported insertion does not assert electrical or physical compatibility.

Demo workflow:

1. Open Components, search `TMP102`, and choose View Details.
2. Orbit/zoom the preview, inspect sources and integration findings, then Add to Design.
3. The translucent preview appears beside the existing assembly. Change numeric position/rotation, or reset/cancel. It does not enter project data or undo history until confirmed.
4. Confirm visual placement. The instance gets a stable UUID, appears in the tree and inspector, and can be moved, recolored, hidden, saved, undone or redone.
5. Select the original MCU and choose Explore replacements. Compare RP2040 and STM32F103C8, then inspect a candidate.
6. Choose Replace selected component, review the explicit visual-only confirmation, then apply. Original demo MCU, sensor and MOSFET roles support type-matched replacement. Added catalog instances support replacement within their existing type and subcategory. Unrelated substitutions are rejected.
7. Open Code. An MCU with the recorded Cortex-M3 architecture still makes the build **Outdated** because board configuration changed. Another architecture gives **Incompatible target**. C source is preserved. Added processors do not silently become the firmware target; select a target explicitly.

Replacement retains the instance ID and transform. Existing illustrative connection paths to replaced objects are suppressed; inserted objects have no inferred wires. Undo can restore the original object and its corresponding demo build status.

Placement currently uses numerical controls. Drag-and-drop insertion, transform gizmos, snapping, collision detection, PCB routing, pin mapping and physical-fit validation are not implemented. A project is limited to 64 total objects. Added parts can be removed through undo or a project reset; a dedicated delete workflow is not included.

## Deterministic compatibility

`compatibility.ts` evaluates component type, processor socket, memory generation, footprint, firmware architecture, supply range and required interfaces. Explicit integration-profile flags cover pin availability/assignment, mounting/clearance, and board drivers/power-budget review. Each rule provides a result, explanation and evidence; the aggregate includes unverified constraints and a next action.

A known hard violation returns **Incompatible**. Any critical missing fact returns **Not Yet Verified**. **Compatible** requires every rule in the integration profile to pass. The bundled concept board has no verified netlist, pin assignment or footprint contract, so the library does not claim any fully verified drop-in integrations. An unlisted peripheral interface is treated as unknown rather than proof of absence. Visual-Only is a separate placement capability, never a synonym for Compatible.

The unit test for Compatible uses an explicitly complete synthetic integration profile to test the engine. It is not evidence that TMP102 is compatible with the demo board.

## State and persistence

- Catalog definitions are immutable inputs to instance creation. Project modifications never edit catalog definitions.
- The workspace Zustand store owns confirmed instances, preview placement, selection, firmware-target identity and bounded undo/redo history.
- The library store owns navigation, filters, comparison, detail context and catalog presentation. Invalid library preferences fall back safely.
- The firmware store continues to own project-keyed drafts and saved baselines independently. Build state is derived from source revision and selected hardware; no compiled-validity flag is blindly persisted.
- Existing version-1 demo files still load unchanged. Adding/replacing hardware or selecting a firmware target writes version 2. The importer validates up to 64 instances, original required IDs, catalog identities, transforms, appearance and target identity, and reconstructs catalog metadata from authoritative definitions. Unsupported versions or malformed projects report errors.
- The legacy `nexora.project.v1` save key and firmware key remain to preserve existing saves after the CircuitForge rename. Save is explicit. Reload starts the bundled project; **Load local save** restores the saved configuration and selection. JSON export/import is also supported.

## Demo Guide commands

`Explain this component`, `Show compatible options`, `Compare these processors`, `What is RAM?`, `Show microcontrollers`, `Focus on selected hardware`, and `View related code` perform validated local actions or explain missing context. Comparison uses items already selected in the library. Existing camera/view and firmware commands remain supported. The guide uses curated descriptions and cautions, with no benchmarks or generated specifications. Firmware generation requests explicitly report the future capability boundary.

## Provider integration boundary

`CatalogProvider` exposes async `search` and `get` methods with optional cancellation. `localProvider` implements it now. `mergeCatalogs` deduplicates normalized products by manufacturer, part number and product kind while retaining additional source references. Specifications, architecture, package, voltage and datasheet fields support missing values; source attribution and licensing notes are retained.

Future Mouser/DigiKey adapters require server-side credentials, provider authorization, response validation, quotas, caching, retry/backoff, and attribution/license enforcement. They should return normalized partial catalog records, never secrets. KiCad/CAD asset integration requires a reviewed license, units/orientation checks, supported conversion to optimized GLB, package/pin validation and asset provenance. No external provider integration or scraper was implemented in Phase 3.

## Files

Added:

- `src/catalog/types.ts`, `parts.ts`, `catalog.ts`: schema, sourced local data, categories/search/comparison/provider utilities.
- `src/catalog/compatibility.ts`, `instances.ts`: engineering rules, build implications and instance creation.
- `src/catalog/store.ts`, `navigation.ts`: library state and workspace navigation.
- `src/catalog/ComponentsWorkspace.tsx`, `catalog.css`: catalog, details, comparison and presentation.
- `src/catalog/CatalogModel.tsx`, `ComponentPreview.tsx`, `Placement.tsx`: procedural representations, isolated preview and staged placement.
- `tests/catalog.test.ts`, `catalog-workspace.test.tsx`, `catalog-preview.test.tsx`, `tests/e2e/catalog.spec.ts`.
- `docs/phase3.md`.

Modified:

- `src/app/App.tsx`, `src/components/layout/TopBar.tsx`, `InspectorPanel.tsx`, `ProjectSidebar.tsx`.
- `src/types/workspace.ts`, `src/store/useWorkspaceStore.ts`, `src/lib/project.ts`, `src/lib/assistant.ts`, `src/hooks/useKeyboard.ts`.
- `src/three/HardwareScene.tsx`, `ComponentPackages.tsx`, `CameraController.tsx`, `Connections.tsx`.
- `src/firmware/FirmwareExplorer.tsx`, `firmware.css`, `tests/firmware.test.tsx`, `tests/workspace.test.ts`.
- `README.md`, `docs/architecture.md`, `docs/validation.md`.

Phase 3 adds no npm dependencies and does not modify the recorded firmware artifacts.

## Run and validate

```sh
npm ci
npm run dev
```

Node.js 20.19+ (or 22.12+) is required. To validate:

```sh
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

See [the validation record](validation.md) for actual results and the browser-execution limitation. Unit tests with mocked renderers verify control state and recovery, not actual WebGL rendering. Browser acceptance and screenshots remain outstanding in the restricted environment.

Recommended next phase: execute the browser suite on the presentation machine first; then add one exact board/processor integration profile with validated supply, footprint, pin map and board-support firmware, plus properly licensed CAD. Backend compilation should be isolated and reproducible before enabling any live Compile action. AI services, authorized external catalog APIs and electrical simulation remain separate later integrations.
