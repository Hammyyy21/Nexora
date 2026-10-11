# Nexora Phase 2 — logical schematic foundation

This increment introduces an interactive **Schematic** workspace alongside the existing 3D Design workspace. It intentionally does **not** claim to have real physical pinout verification, layout copper routing or electrical rule checks.

## What works

- **Schematic** in the main navigation, next to **Design**. Switching does not unmount the existing 3D editor.
- Auto-arranged schematic symbols for existing project instances with **conceptual logical terminals**; fixed mechanical structures are excluded.
- Click a logical terminal, then a second terminal to create a connection. Use **Cancel wire** to abort, or **Remove** in the connection list to delete a wire.
- Wired terminals form connected **logical nets**. Nets are named `NET-1`, etc. for display and are not manufacturer signal names.
- Click a symbol title to select the corresponding component in the 3D project. Shared selection and project state survive navigation.
- Undo and redo work on wire creation/removal. Project JSON export, import and local save/persistence include the logical connections.
- Import rejects unknown component/terminal IDs, self-links, duplicate wires, duplicate IDs, excessive wires and malformed records.
- When a component is removed through the approved AI action path, attached logical wires are also removed. On catalog replacement, dangling wires are pruned.
- Existing design review identifies recorded conceptual wires but **still warns** that electrical verification has not been performed.
- Existing firmware, AI, Inspector, Project Dashboard, BOM, 3D transforms and scene persistence are preserved.

## How to check in the browser

1. Start frontend and backend as usual. Open Smart Cooling Controller.
2. Click **Schematic** in the main navigation. A schematic symbol is shown for each supported electronic instance.
3. Click **U3 → DATA**, then **U1 → IO-A**. Check that the green wire and Connections list appear.
4. Click **Undo**, then **Redo**. Observe the wire disappear and reappear.
5. Click a schematic symbol title, switch to **Design**, and confirm that the same component is selected.
6. Save and reopen the project or export/import JSON. The logical wire should persist.
7. Delete the wire using the Connections list; verify it can be undone.

## Intentional limitations

The catalog currently has approximate 3D visualizations and does not carry comprehensive manufacturer-pin metadata. Terminal labels such as `IO-A` and `DATA` are **symbolic placeholders**. They must not be used as exact MCU package pin numbers. A logical wire is not an electrically validated connection.

- No verified datasheet-to-pad mapping, footprint library, electrical-rule checking, voltage/current analysis or board routing.
- No drag-to-position schematic symbols: the first iteration auto-arranges cards. 3D object transforms remain unchanged.
- No SPICE, firmware/circuit co-simulation or electrical manufacturing exports.
- AI does not yet author or inspect logical wires. Existing AI component actions still operate on the shared project, and deletion cleans up wires.

Future iterations should add **verified, source-linked pin definitions** per catalog part, schematic symbol layout editing, explicit net naming, rule validation, and synchronized 2D PCB copper routing.

## Verification

Developer environment: TypeScript `tsc -b` and ESLint passed. Direct Node smoke checks covered logical connection creation, duplicate rejection, import/export validation, undo/redo, AI delete cleanup, project switching and interactive React click-to-wire. The full Vite/Vitest run and production bundle still require verification on the user's Mac because the uploaded `node_modules` contain macOS-only Rollup native dependencies.

Run on Mac:

```
npm test
npm run lint
npm run build
```
