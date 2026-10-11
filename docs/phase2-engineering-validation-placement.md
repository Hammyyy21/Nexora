# Nexora Phase 2.1 — Design review and placement suggestions

This additive patch builds on **Nexora Phase 2 — Schematic Foundation**. No backend files, API keys, storage schema, or catalog definitions are changed.

## What changed

- `Workspace → Design review`: now includes conservative checks for logical supply-to-ground and signal-to-rail nets, disconnected sensor data, missing sensor supply/ground connections, unconnected fan connections, sensor-to-controller signal topology, common MOSFET control path review, incomplete catalog interface mapping, possible datasheet-voltage range conflicts **where both parts provide comparable values**, and components without modeled terminals. Selecting a finding selects the implicated component.
- `Schematic → Electrical review`: presents contextual electrical findings next to the logical wire list and nets. Some warnings are deliberately advisory: alternate topologies can be valid.
- `Design → Add Component`: while a component preview is active, the 3D board shows up to three **clickable highlighted placement regions**. The placement toolbar also shows corresponding candidate coordinate buttons and live placement warnings. Positions use the existing mm-to-scene scale and reuse existing placement checks. It is possible to place a component elsewhere by entering XYZ coordinates.
- Suggested footprints are ranked using board boundaries and approximate 2D footprint clearance, excluding overlapping board regions. Rounded visual keepouts and distance to *already logically wired* components are only approximate heuristics. No new physical-placement restrictions were imposed.
- New automated tests: `tests/engineering-validation.test.ts` and `tests/placement-recommendations.test.tsx`.

## What this **does not** verify

- Manufacturer-accurate pin maps or footprints, physical GPIO mappings, device driver support, actual buses, firmware operation, real communication range or performance
- Current consumption / battery and supply sizing, component voltage compatibility unless catalog data is explicit and applicable, thermal dissipation, EMC/EMI or antenna keepouts
- Real PCB spacing, mounting holes, routing/trace lengths, manufacturability, circuit simulation or electrical safety

**Electrical connectivity is topological only** (the Schematic Foundation's symbolic terminals). Moving two objects closer in 3D does not electrically connect them. All placements, even recommended areas, still require real datasheet, mechanical and electrical engineering review.

## Verification on Mac

From `~/Desktop/Nexora`:

```sh
npm test
npm run lint
npm run build
```

Smoke test:

1. Open a **Blank PCB** project and choose **Add Component → TMP102**.
2. Confirm highlighted board regions appear. Click **Area 1** to change the preview's XYZ location. Modify X manually afterwards to prove suggestions are optional; cancel to ensure no project changes.
3. Place the component, save, reopen, and verify the placement persisted.
4. Open **Schematic**, wire a sensor DATA terminal to a controller signal terminal, and inspect **Electrical review**. A corresponding missing-signal warning should disappear, while unverified pinout notices remain.
5. Open **Workspace → Engineering tools → Design review**. Verify that findings update after adding/removing schematic wires and moving components; Select component navigates to the right object.

In this environment, TypeScript and ESLint passed and a direct Node smoke test verified template recommendations and electrical-report changes. Full Vitest/Vite build requires the Mac's native Rollup/Esbuild dependencies.
