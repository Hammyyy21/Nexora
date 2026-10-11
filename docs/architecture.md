# Architecture

`src/data/demoProject.ts` is the authoritative model: stable component IDs, package types, dimensions, editable transforms, materials, visibility, grouping, descriptions, and exploded offsets. Three.js renders this same model used by the explorer and inspector. Mode animation never writes back to its canonical positions.

- `src/app/`: application composition and responsive workspace.
- `src/components/layout/`: top bar, explorer, inspector, preferences, and Demo Assistant.
- `src/components/workspace/`: viewing modes, tools, camera presets, and viewport guidance.
- `src/three/`: procedural packages, PCB geometry/textures, animated component groups, camera coordination, connections, and WebGL boundary.
- `src/store/`: serializable Zustand state and explicit workspace actions. Component transforms and visibility live inside `currentProject.components`, avoiding duplicate dictionaries that could drift out of sync.
- `src/lib/`: strict import validation, persistence, downloads, derived transforms, and deterministic command handling.
- `tests/`: state/logic and React integration tests; `tests/e2e/` covers the major browser demo and screen sizes.

## Rendering

A PCB with extruded mounting holes and a locally generated texture provides silkscreen, traces, and vias. Individual packages provide metallic pins, terminals, contact tongues, capacitor vents, and a seven-blade fan. No external visual assets are loaded.

GSAP animates component group positions from their current values to derived targets. Killing previous tweens makes rapid mode switching reversible. Material opacity transitions distinguish Assembly, X-Ray, and Connections; user colors and opacity remain canonical. X-Ray exposes a translucent protective tray and service cover.

Camera requests animate camera position and OrbitControls target together. Pointer/wheel input cancels the active timeline in the capture phase. Camera fit is calculated from visible component positions and dimensions, including exploded offsets; explicit fit/focus requests recalculate framing; layout resizing preserves the camera position and target. Picking checks the [React Three Fiber event delta](https://r3f.docs.pmnd.rs/api/events) to reject drag gestures. Labels are HTML overlays; selection also uses an emissive tint and geometry outline.

The connection graph names its endpoints by stable IDs. Curves derive from edited component positions; hidden endpoints suppress their path. Moving dots are decorative path markers with no claim about calculated signal timing or current direction. Reduced motion fixes these dots in place.

Quality preferences reduce pixel ratio and disable shadows. Rendering pauses while the document is hidden. No React state updates occur per animation frame. The renderer uses no postprocessing or network environment textures.

## Persistence and errors

A save stores only the validated serializable project. Import whitelists editable values, preserving canonical metadata and dimensions. Local storage failures produce visible feedback and suggest JSON export. Reset is undoable; imported/loaded states enter undo history. Settings and camera animation frames do not.

WebGL failures display a fallback while leaving the explorer and file tools usable. Context loss produces a notice. The inspector has an explicit empty state; invalid assistant commands explain supported scope. The native modal traps focus, supports Escape, and restores focus to its trigger.

## Extension boundaries

A future AI provider should return typed, validated design operations and identify its provenance separately from the Demo Assistant. An electrical analysis service should provide independently validated circuit data; visual connections currently have no electrical meaning. Manufacturing exports require accurate package libraries, tolerances, and geometry validation before use.

## Firmware integration

`src/firmware/` owns the firmware view in the Code tool panel, lazy local Monaco integration, immutable compiled demo artifacts, and a separate serializable Zustand draft store. It consumes stable component IDs from the existing workspace store; source keystrokes do not update the scene's store or request camera movement. The canvas remains mounted as the panel resizes. Project-keyed source drafts and explicit saved baselines persist independently of hardware JSON; hardware reset/import preserves them. See [firmware details and build provenance](firmware.md).

## Hardware library integration

`src/catalog/` separates manufacturer catalog records, project instance creation, deterministic compatibility, library navigation/state, procedural previews, placement and comparison UI. `parts.ts` contains the attributed local dataset. Missing engineering facts remain unknown. No catalog definition is mutated when an instance is moved or replaced.

The existing workspace store now supports staged placement and confirmed version-2 instances alongside legacy version-1 projects. Canonical instance transforms still drive tree, inspector, camera and scene together. Replacement preserves stable instance identity but suppresses old illustrative wiring. The derived firmware target status warns about mismatched architectures while the source store remains untouched.

Design and Code share the existing canvas/editor tree; the Components workspace hides that tree and pauses its frame loop. Preview canvases are local to open detail views, use on-demand rendering, and have independent error boundaries with retry. Catalog filters use separate validated local preferences. The async provider interface currently has only a local implementation; credentials and authorized provider calls belong in a future backend.

See [Phase 3 implementation and boundaries](phase3.md).

## Design panel layout

`src/workspace/` owns the five-tab right tools panel, horizontal tab strip, scoped resize controls, component/board drawer and concept board templates. The hardware Canvas remains a sibling of the tools panel and never moves between tab panels. All tool contents stay mounted with inactive content hidden and inert, preserving editor instances, chat drafts and inspector state. Active tab, width, collapsed state and Focus Mode persist under `nexora.workspace-layout.v1`. At 900 px and below, CSS places the panel over the canvas with a dismissible backdrop. Resizing and tool keyboard events do not reach scene controls. Focus Mode hides viewport annotations; it does not stop the scene render loop. The drawer continues to consume the existing catalog and project placement actions.

Board template identity is optional validated project metadata, with undo/redo and derived firmware invalidation. CameraController remembers the last explicit camera request so viewport resizes cannot reset a user's orbit. Its mount cleanup accounts for StrictMode replay. See [workspace UX](workspace-ux.md) for behavior and validation limits.
