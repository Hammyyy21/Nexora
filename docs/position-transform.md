# Position & Transform

The existing scene had canonical transforms, millimeter scale (10 mm per world unit), numeric Inspector edits, project persistence, and undo snapshots. It had no selected-object translation gizmo or transient gesture state. Calling the existing edit action for every pointer move would create a snapshot for every event. Existing placement only enforced finite coordinates within ±20 units; catalog staging was already off-board.

The floating viewport panel reuses selection and project state. XYZ fields commit valid finite values on Enter/blur; Escape discards a field draft. Drag Mode uses the installed Three.js standard-library TransformControls directly, with world-axis translation and standard plane/free handles. This creates no nested React roots. Its native listeners and geometry are disposed in effect cleanup, including StrictMode replay. Inspector and the five right-side tools keep their existing interfaces.

Drag previews are transient. Pointer release commits once, preserving orientation and dimensions; cancellation, selection/view changes, hiding the object, and library navigation restore the canonical object and prior OrbitControls state. The gesture's release click cannot select through the gizmo. A new pointer gesture clears that latch. Wheel input cannot re-enable camera controls while a transform is active. Mode offsets are subtracted before committing Exploded positions, with insignificant subtraction noise removed on unchanged axes.

`placementMode` is an optional, saved project setting. Missing values retain Free workspace behavior for legacy files. Board-constrained placement checks all eight rotated component-bound corners in board-local coordinates against the existing PCB dimensions and surface. Visible component overlaps produce advisory world-axis bounds warnings, not mesh-accurate collision or electrical validation. The PCB, housing, and components with `fixed: true` are locked. Numeric Inspector edits and catalog placement confirmation share the same placement validation.

## Modified files

- `src/components/workspace/PositionTransform.tsx`, `position-transform.css`: floating controls, mm fields, validation, responsive styling.
- `src/app/App.tsx`: mounts the panel inside the existing viewport outside Canvas.
- `src/three/ComponentTransformControls.tsx`, `transformBinding.ts`: gizmo ownership, native drag events, cancellation, camera locking, cleanup.
- `src/three/ComponentMesh.tsx`, `HardwareScene.tsx`, `CameraController.tsx`: immediate previews, release-click protection, scene integration, camera guard.
- `src/lib/transforms.ts`: units, canonical conversion, placement assessment, fixed-object rules.
- `src/store/useWorkspaceStore.ts`: transient gesture state, single-commit history, validated moves.
- `src/lib/project.ts`, `src/types/workspace.ts`: backward-compatible placement/fixed flags and validated save/load.
- `src/hooks/useKeyboard.ts`: isolates floating-panel shortcuts.
- `package.json`, `package-lock.json`: declares the already installed `three-stdlib` as a direct dependency.
- `tests/transforms.test.ts`, `position-panel.test.tsx`, `component-transform.test.tsx`, `camera-preservation.test.tsx`, `focused-workspace.test.tsx`, `tests/e2e/transforms.spec.ts`: regression coverage.
- `README.md`, this document: interaction and validation notes.

## Validation

Completed: `npm test` (160 tests across 18 files), `npm run lint`, `npm run build`, and Prettier checks on changed source/tests/manifests. No React-root lifecycle warning occurred in the regression tests.

Vitest covers real native mouse events through TransformControls and OrbitControls without a WebGL renderer: X/Y/Z movement, camera lock and restored orbit/zoom/pan, canonical Assembly/Exploded/X-Ray positions, collision/bounds handling, cancellation, undo/redo, persistence, panel inputs, tool navigation, and StrictMode cleanup. Existing AI submission/error, editor, Explorer, and Inspector regressions remain in the full suite.

The Playwright regression includes 3D picking, numeric-to-mesh updates, gizmo dragging, mode changes, tools, reload, and 1920/1366/390 px screenshots. This environment prevents Vite from binding `127.0.0.1:5173` (`listen EPERM`), so browser assertions and screenshots require an unrestricted local run: `npm run test:e2e -- tests/e2e/transforms.spec.ts`.

Known existing notices are the test environment's multiple Three.js imports and reduced-motion notice, plus large Three.js/Monaco production chunks. No warning suppression or delayed React-root cleanup was added.
