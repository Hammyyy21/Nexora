# Nexora Engineering Workspace v2 — Technical Contract

## Scope and assurance

Nexora's current board editor and Engineering Review support interactive **conceptual** hardware designs. A passing geometry or electrical rule is **not** a complete safety, fabrication, simulation, or manufacturing certification. User-configured footprints and demo values do not become manufacturer-verified data.

## One authoritative project

`src/types/workspace.ts` defines the serializable `Project`, `HardwareComponent`, and `SchematicConnection` records. `src/store/useWorkspaceStore.ts` owns the active project and its undo/redo history. The component ID is the stable identity; the human-readable `reference` is a designator and must be unique for **new duplicates**. Earlier imports with overlapping designators remain readable for backward compatibility.

- `src/workspace/boardSpecifications.ts` holds the configurable board schema and validation.
- `src/workspace/boardGeometry.ts` implements board outlines, layers, local coordinates, footprint geometry, snapping, and outline checks.
- `src/workspace/pcbOperations.ts` applies atomic clone-on-write PCB operations. A failed operation cannot partially mutate the caller.
- `src/lib/transforms.ts` evaluates position, surface, keep-out, mounting-hole, outline, and approximate collision constraints.
- `src/engineering/insights.ts` computes current design findings from the *current* project; no cached placement verdict is serialized.

### Coordinates and editing

PCB dimensions, footprints, hole centers, grid spacing, restricted regions, and edge clearances are expressed in **millimeters**. 3D workspace positions and object dimensions use **1 scene unit = 10 mm**. The board-local horizontal plane is X/Z; Y represents height/surface. The PCB instance transform places that local frame in the 3D scene. `coordinates.origin` and axis direction configure local editing/snapping, not physical relocation of existing objects. Bottom-side placement changes side/orientation and positions an object at the appropriate face.

Four supported board outlines are rectangle, circle, rounded rectangle, and polygon. Copper/mechanical `stackup` entries describe intended layers, **not** physical routed copper. User-supplied dimensions and footprints are configurable design inputs, not measurements of real packages.

A board resize or outline edit preserves existing component positions. `boardPlacementIssues()` re-evaluates current placements and gives a count in the editing notice. `reviewDesign()` independently produces current findings for out-of-outline placement, wrong-side/overlap, holes, and keep-outs, including fixed electrical components. Users can undo/redo and reload a design without losing intentional off-board placement; board-rule warnings remain visible until corrected.

### Schematic topology

`src/schematic/model.ts` stores wires as typed endpoints `{componentId, portId}`. Each port may be a legacy symbolic/demo terminal or a separately verified `pin:` physical terminal. These namespaces must **never** be silently mapped to each other. The electrical-net engine groups connected endpoints and exposes stable net identifiers via `workspaceNets()` in `src/ai/snapshot.ts`. Finding navigation resolves a component from the actual wire endpoint objects; it does not parse the colon-delimited display key. A schematic wire does not imply a routed physical PCB trace.

### Project persistence and migration

`src/lib/project.ts` validates imported JSON, supported component identities, dimensions, transformations, footprint data, pin endpoints, and wire IDs. `src/workspace/migrations.ts` upgrades schema versions 1 and 2 to 3, maintaining component IDs, original transforms, firmware, and logical terminal names. JSON import/export and browser-local persistence use this canonical project. The legacy local-storage key `nexora.project.v1` remains unchanged so older local saves are retained. Existing project limits include 64 components and 128 schematic wires; these are current product limits, not engineering limits.

Duplicate operations allocate a new stable component ID and a unique designator such as `U3-COPY1`, `U3-COPY2`; copying a copy derives from the original designator. New duplicates do **not** inherit wires. Catalog and conceptual copy references are preserved by import/export.

### AI evidence and safe action lifecycle

`src/ai/snapshot.ts` builds a typed, size-bounded active-project snapshot from authoritative state: board configuration, component IDs/specifications, schematic wires/nets, engineering findings, and firmware context. Its omissions are recorded, and recognizably sensitive source strings are redacted. `backend/workspace_models.py` strictly validates model input. **No other user's projects, API keys, browser storage, or local filesystem** should be exposed to the model.

`src/ai/actions.ts` parses and validates model-proposed operations; the AI Guide previews proposed changes, and the user must explicitly approve. Approval checks the current project revision, including edit/undo cycles; stale proposals are rejected and actions are revalidated. Operations update the same project model and undo history; the assistant cannot execute arbitrary code or shell commands. Firmware text suggestions are not a compiled build or guaranteed to match physical wiring.

## Verification and next milestone

Run on the development Mac:

```sh
npm test -- --testTimeout=15000
npm run lint
npm run build
npx playwright test tests/e2e/engineering-workspace-v2.spec.ts
backend/.venv/bin/python -m unittest discover -s backend/tests -v
```

Additional regressions live in `tests/workspace-stabilization.test.ts`. Verify board resizing, warning navigation, unique duplicate references, saved project round trips, and undo/redo manually as well.

**Routing milestone prerequisites:** typed pads/footprints associated with physical pins; explicit copper-layer geometry; net identity independent of display labels; robust undoable layout transactions; DRC rules with measured/configured provenance; independent output checks before manufacturing. Do not treat 3D representation or conceptual schematic lines as routed traces.
