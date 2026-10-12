# Milestone B1 — PCB layers, footprints and pads

This release introduces **user-configurable pad geometry** and a **2D board layout preview**. It does **not** route copper, simulate behavior, define real fabrication footprints, verify a component package, or produce manufacturer-ready files.

## Design data and units

- `BoardConfiguration.stackup`: user-defined copper and mechanical layers, stable IDs, side, visibility. Existing legacy boards are normalized to copper layers on load. Renaming layers is safe, but removing one referenced by a pad creates an Engineering Review finding; the user's pad data is preserved.
- `HardwareComponent.footprint`: optional `Footprint.pads[]`. The original footprint envelope remains valid. Each pad has a stable ID, local X/Z position in **millimeters**, positive dimensions, a circle or rectangle shape, and a copper `layerId`. A `portId` is optional; if supplied it must match a real `logicalPorts()` identifier for that component, including the **literal** `pin:` physical namespace when documented. No demo/physical terminal aliases are inferred.
- Pad coordinates are relative to the component's local frame, transformed by the component's 3D rotation/position and the board's inverse transform to display them in board-local X/Z space. The preview respects the shape and layer visibility; it does not draw a copper trace between schematic-connected endpoints.
- User-authored pads and approximate component footprints are not manufacturer-verified source data. A specific documented pin *identifier* does not verify the pad's dimensions, location, or package.

## UI

Select the PCB in **Inspector** to open **PCB Layout · Footprints & Pads**. The SVG preview shows the board outline, mounting holes, restricted regions, existing component envelopes, and pads on visible copper layers. Use the layer filter to isolate layers and click a component envelope to edit it.

Select a movable component, then open **PCB placement → Edit footprint envelope**. Add a copper pad, edit its local position/size/shape, assign an existing copper layer and (optionally) an explicit schematic terminal. Click **Apply footprint** to commit as one undoable project edit; cancel simply leaves the current saved footprint unchanged. Configure layer count, layer names and visibility on the PCB's settings panel.

## Validation and persistence

`validFootprint` validates the bounded pad list, geometry, unique IDs and allowed fields. Editing rejects non-copper or missing layer IDs and unknown terminal IDs. JSON imports also reject invalid pad references rather than guessing a mapping. Edits use the same `applyPCBOperation` transaction and project undo/redo/local save/JSON machinery. Changes to copper layer count do not erase pad assignments; missing layers appear in Engineering Review. Pad corners outside the board also raise a finding.

`buildWorkspaceSnapshot` includes up to eight pads per component with explicit `omitted.pads` counts, under the existing 96 KB context limit. The backend schema validates those pads and does not grant the AI additional execution privileges.

## Next steps

B2: stable physical pad/net binding and DRC for pad spacing and shorts. B3: copper traces and vias with net-aware editing, undo, measured clearances and layer transitions. B4: copper fills, interactive routing, manufacturing-format import/export and independent EDA verification. None is implemented by B1.
