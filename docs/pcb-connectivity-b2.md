# Nexora — Milestone B2: net-aware PCB review + naming

**Scope:** Deterministic, conservative, *unrouted* PCB connectivity. No new physical copper or routing data is written. Existing schema-v3 projects, undo/redo, local saves, and imported JSON remain supported. No autonomous edits are added.

## Electrical net binding and airwires

- `src/workspace/pcbConnectivity.ts` maps each user-authored copper pad to a schematic net only when its `portId` is an existing terminal explicitly participating in `project.connections`. Terminal namespaces are never guessed. An assigned terminal without a schematic connection is still **unconnected**; a pad without `portId` is **unassigned**.
- Nets are calculated with the existing `electricalNets()` routine and stable IDs, matching the AI snapshot's IDs. A deterministic shortest-spanning-tree guide is built from the 2D centers of bound pads on each net. These dashed guides (airwires/ratsnest) **are not copper routes**, do not prove connectivity and do not eliminate the need for traces and vias.
- Airwires whose endpoints are on different copper layers are distinguished visually and described as requiring a layer transition; they are not treated as already connected. Top, bottom, and internal copper layer IDs remain separate.
- Pad positions and geometry use the existing 3D-to-board-local millimeter projection. No pads are inferred from a visual package model or automatically assigned to manufacturer pins.

## Advisory geometric checks

- Pad-to-pad copper gap is computed from the perimeters of the transformed pad polygons (circles are 24-sided approximations), *not* center-to-center distances. Only pads on the **same physical layer** are compared for possible shorts or narrow separation. Overlap on different layers is never by itself called a short.
- Two different, explicitly identified schematic nets touching are reported as a **possible short**; closer than **0.25 mm** is an *illustrative* clearance warning. Pads without known nets in close proximity are flagged as needing review, not declared safe or definitely shorted.
- Also report missing copper layers, copper/component-side mismatch, and missing/unconnected terminal assignments. Existing B1 board-outline and missing-layer checks still apply. Findings reach Engineering Review and AI inspection through the existing `reviewDesign()`/`inspectProject()` path and are *potential/missing-information* findings—not verified manufacturing defects.
- These checks exclude routing geometry, vias, drill-to-copper clearance, masks, plated holes, copper pours, impedance, controlled stackups and real fabrication design rules. They cannot establish a safe or manufacturable board.
- For responsiveness, detailed pad-gap review is limited to the first **256** pads and at most **128** close-pair findings. Ratsnest display is limited to the first **256** connections. Each limit surfaces an explicit *incomplete-review* warning instead of implying a clean DRC.

## Naming fix

- The 3D workspace title and explorer root now display `currentProject.name`, never the old demo label. The inspector overview and explorer's board-size summary also reflect the active project.
- Use the pencil next to the project name in the explorer (or Projects dashboard → Rename) to change the **project** name. Use **Inspector → Select PCB → Board name → Rename board** to independently rename the PCB component.
- Board name edits are included in existing history and serialization. `parseProject()` now preserves the saved PCB name rather than resetting it to a demo-board name. No storage key or schema changes were required.

## Suggested browser verification

1. Create/open a blank project named `PCB Testing`: top bar, 3D viewport and explorer root must all show `PCB Testing`. Rename it via the explorer, then rename the PCB independently. Save, reload and export/reimport to confirm both names remain different.
2. Add two supported parts, assign pads in their footprint editors, and connect those exact terminals through **Schematic**. Select the PCB; the 2D Inspector preview should show a dashed airwire labelled as **unrouted**. Remove the schematic wire: the airwire disappears and connectivity is reported as incomplete.
3. Create nearby pads on the same copper layer, with different schematic nets. Check Engineering Review for a potential copper short/clearance warning. Change one pad to bottom copper: the same 2D overlap must **not** be labelled a same-layer short.
4. Switch copper layer filters, undo/redo pad edits, save/reload, and ask the AI Guide to inspect the active project. Findings should remain bounded and should not be presented as fabrication certification.

## Verification

Local in-container: TypeScript compile and ESLint pass. A direct JS runtime smoke check passed for stable airwires, cross-layer guides, perimeter gap and JSON round-trip. Full Vitest/Playwright/Vite builds require the user's Mac installation because the supplied dependency archive omits Linux-native Rollup binaries.
