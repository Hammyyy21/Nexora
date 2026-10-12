# Primary PCB Layout navigation

The PCB Layout preview no longer needs to be reached by selecting PCB1 and opening the Inspector.

## Workflow

- Select **PCB Layout** beside **Design** in the main navigation. The PCB is shown in a larger 2D workspace.
- Select a component via its footprint/pad on the canvas or a reference shortcut above the canvas. The selected component is focused in the Inspector, where **PCB placement**, **Edit footprint envelope**, and copper pad editing already live.
- **Board Settings** selects PCB1 and opens the existing Inspector controls. **Add Component** opens the existing parts drawer; **Schematic** and **3D Design** switch back to their established workspaces.
- Copper filters, dashed unrouted airwires, pad counts, and deterministic clearance warnings still come from the existing `PCBLayoutPreview` and `buildPCBConnectivity` model. The preview does not create or validate routed copper.
- PCB Layout reuses the active project and selection in Zustand. It adds no new persisted data or project schema changes. The 3D scene is hidden rather than unmounted, preserving scene identity, controls, and edits when switching back.
- Keyboard: the global navigation already supports Arrow Left/Right and Home/End; footprint reference shortcuts are ordinary accessible buttons. Board footprint/pad elements are also clickable via SVG and accept Enter/Space where supported.

## Tests

`tests/pcb-primary-navigation.test.tsx` exercises primary navigation, component-to-Inspector selection, switching to Schematic and back without losing the 3D scene, and legacy projects lacking board configuration. `tests/focused-workspace.test.tsx` reflects the newly added primary tab.

## Limitations

This is a navigation and editing-access improvement, not a PCB trace editor. Copper pads are user-configured and schematic net airwires are advisory. No traces, vias, copper pours, Gerbers, simulation, or fabrication-grade DRC are supplied by this change.
