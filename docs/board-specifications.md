# Board specifications and model framing

Board Specifications is available in Choose Board and in Inspector for the carrier PCB or a catalog development board. Choose Board includes comparison selectors and manufacturer source links before selecting or placing a board. Development boards keep the existing catalog insertion behavior: they are populated assembly components, not replacement blank carrier surfaces. Compute Module 4 remains comparison-only because the catalog represents a family, not an insertable exact variant.

## Records and sources

`src/workspace/boardSpecifications.ts` supplies all two board templates and seven board-category catalog entries. Source and status belong to individual fields. Manufacturer records are partial; absent values are **Not specified**, retained unsupported catalog claims are **Unverified**, template geometry is a **Concept design value**, and edited blank-board values are **User configured**. The concept templates are not manufacturer products.

| Record | Added supported facts | Primary references |
| --- | --- | --- |
| Cooling demo | Existing 92 × 64 × 1.6 mm model; four Ø2.6 mm holes at X ±41.5, Z ±27.5 mm | Existing `HardwareBoard` geometry and demo component record; concept values |
| Blank PCB | Same initial geometry; configurable dimensions, material, layers, hole coordinates/diameters, edge clearance and rectangular restricted regions | Local user configuration; no fabrication certification |
| Pico | 51 × 21 × 1 mm; RP2040; VSYS / GPIO levels; 3V3 output guidance; buses, connectors and mounting-hole count/diameter | [Pico datasheet](https://datasheets.raspberrypi.com/pico/pico-datasheet.pdf), overview, mechanical specification, powerchain |
| Pico 2 | 51 × 21 × 1 mm; RP2350A; VSYS / GPIO levels; 3V3 output guidance; buses, connectors and mounting-hole count/diameter | [Pico 2 datasheet](https://datasheets.raspberrypi.com/pico/pico-2-datasheet.pdf), §§1, 3, 5 |
| Uno Rev3 | 68.6 × 53.4 mm; processors, 5 V logic, input options, current limits, expansion, I/O capabilities | [Arduino technical specs](https://store.arduino.cc/products/arduino-uno-rev3), [A000066 manual](https://docs.arduino.cc/resources/datasheets/A000066-datasheet.pdf) |
| ESP32-DevKitC-32E | 48.26 × 27.94 mm; module, power alternatives, headers and reserved flash signals | [V4 guide](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html), [dimension drawing](https://dl.espressif.com/dl/schematics/esp32_devkitc_v4_dimensions.pdf) |
| NUCLEO-F401RE | Controller/debugger, USB and external power options, conditional USB current limits, expansion and separation restrictions | [UM1724](https://www.st.com/resource/en/user_manual/um1724-stm32-nucleo64-boards-mb1136-stmicroelectronics.pdf), §§7.3–7.5 and headers |
| Raspberry Pi 5 | 85 × 56 mm reference outline, processor, input supply, ports, peripherals | [Product specifications](https://www.raspberrypi.com/products/raspberry-pi-5/), [mechanical drawing](https://pip.raspberrypi.com/documents/RP-008347-DS-1-raspberry-pi-5-mechanical-drawing.pdf) |
| Compute Module 4 family | 55 × 40 mm outline; processor; carrier connectors; variant caveat | [Product brief](https://pip.raspberrypi.com/documents/RP-008169-DS-cm4-product-brief.pdf) |

Manufacturer facts were reviewed 2026-10-10. Pi 5 drawing dimensions are explicitly approximate reference dimensions, not production data. PCB thickness is distinct from populated assembly height. Materials, layers, stackups, tolerances and fabrication clearance rules remain unspecified where not verified. Nucleo outline dimensions, manufacturer mounting coordinates, and numerical connector positions were not transcribed/verified in this update. Missing manufacturer geometry is never inferred from the generic visualization. Board previews use sourced length/width where available; unsourced height/geometry remains approximate.

## Geometry, state and electrical checks

Blank configuration is an optional validated extension of schema v2, retaining the existing v1/v2 loader and storage key. Older projects need no rewrite. Existing transforms, schematic connections, project identity and firmware drafts remain intact. Apply configuration and board selection use the existing undo/redo history. Configuration is retained when switching from blank to demo and back; demo geometry stays fixed.

The board-local origin is its geometric center at mid-thickness, with length along X, width along Z and Y up. One scene unit is 10 mm. The blank renderer and placement checks read the same configuration. Placement checks project the full rotated component box into board coordinates, enforce the outline, rounded corners, user edge clearance, holes, and configured restricted rectangles. Free workspace mode reports these as warnings. Suggestions reuse those checks, including projected footprints for tilted components/boards. The existing 2.2 mm suggestion spacing is only a visual heuristic, not a copper, antenna or manufacturing rule.

Development boards expose symbolic SUPPLY/GND/IO-A/IO-B terminals in the existing schematic, with no physical pin or rail mapping implied. Differing verified nominal board logic voltages on a shared signal net trigger review. Existing electrical interface and supply checks remain separate from geometric assessment. Unknown pin tolerance, unmodeled power interfaces and incomplete ratings prevent full electrical validation. Proximity never establishes communication. Board-data gaps appear in Engineering Insights and remain available to existing AI context generation.

## Fit to Model

A labeled frame-icon button sits at the right of the top viewport viewing row next to Assembly, Exploded, X-Ray and Connections. Duplicate fit controls in Workspace preferences were removed. The viewing modes scroll at narrow widths while Fit to Model remains labeled; compact tools drawers start below the row. Focus Mode retains the row. F runs fit only inside the focused viewport, and existing typing exclusions remain.

The existing camera request mechanism and controller are reused. Fit combines transformed component bounds with rendered package geometry (excluding grid, selection rings and gizmos), uses the actual camera field of view and viewport aspect ratio, retains viewing mode and viewing direction, supports orthographic zoom without replacing the projection, and expands the far plane if needed. Missing geometry falls back to component bounds; an empty scene uses a small safe frame. Reduced-motion transitions use zero duration. Orbit, pan, zoom and user interruption retain their existing behavior; layout changes do not trigger unsolicited fitting or remount the canvas.

## Files changed

- Records/UI: `src/workspace/boardSpecifications.ts`, `BoardSpecificationsPanel.tsx`, `board-specifications.css`, `DesignDrawer.tsx`, `WorkspaceSettings.tsx`, `design.css`; `src/components/layout/InspectorPanel.tsx`.
- State/geometry: `src/types/workspace.ts`, `src/store/useWorkspaceStore.ts`, `src/lib/project.ts`, `transforms.ts`; `src/catalog/instances.ts`, `CatalogModel.tsx`; `src/three/HardwareBoard.tsx`; `src/engineering/placement.ts`, `insights.ts`, `electrical.ts`; `src/schematic/model.ts`.
- Camera/toolbar: `src/lib/camera.ts`, `src/three/CameraController.tsx`, `ComponentMesh.tsx`, `src/components/workspace/WorkspaceToolbar.tsx`, `src/app/App.tsx`, `src/hooks/useKeyboard.ts`.
- Tests: `tests/board-specifications.test.tsx`, `camera.test.ts`, `camera-preservation.test.tsx`, `focused-workspace.test.tsx`, `tests/e2e/board-specifications.spec.ts`, `tests/e2e/firmware.spec.ts`.
- Documentation: this file.

Browser tests capture screenshots at 1440, 768 and 390 pixels into `test-results/` when run with an available browser and local server. This session's browser verification was blocked by the sandbox rejecting localhost listen, the missing Playwright Chromium executable, and the installed Chrome process exiting on launch. No new screenshots were produced. Unit/UI tests cover the new behavior; actual browser layout remains to be visually verified.

Validation completed: `npm test` — 210 tests across 26 files; `npm run lint` — passed; `npm run build` — passed (existing large-chunk warning); `backend/.venv/bin/python -m unittest discover -s backend/tests -v` — 24 tests passed. The three new Playwright scenarios were discovered successfully but could not execute under this session's browser/server restrictions.
