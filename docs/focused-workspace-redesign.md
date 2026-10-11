# Focused workspace redesign

## Root causes and changes

The Design layout permanently allocated separate Explorer and Inspector columns plus firmware and chat rows below the viewport. Its Focus Mode translated between whole workspace panels, and the scene stopped rendering when the Workspace panel was inactive. Navigation state, firmware height, chat visibility and responsive behavior consequently described different layouts.

The application now renders a permanent hardware viewport beside one tools panel. Explorer, Workspace, Inspector, Code and AI use a compact horizontal tab strip and the same panel. All five tool contents remain mounted; inactive content is hidden and inert. Collapse removes the panel's layout footprint without destroying its children. The existing hardware Canvas, firmware editors and chat retain their identity through tab changes.

The panel supports pointer and keyboard resizing, expansion, focus restoration on close and locally persisted active tab, width, collapsed state and Focus Mode. Focus Mode hides viewport annotations. At 900 px and below, the panel overlays the canvas with a dismissible backdrop. Horizontal tab scrolling and resizing stay separate from scene gestures. No permanent content remains below the canvas.

Explorer retains selection and visibility controls, plus the existing component and board drawers. Workspace contains viewing modes, camera tools, lighting intensity and display preferences. Inspector retains its sections and transforms. Code and AI reuse the existing components and stores. The top navigation shortcuts open those same tool panels; no second code editor or chat interface is mounted. Selected components expose View Code and Ask AI actions.

## Modified files

| File | Purpose |
| --- | --- |
| `src/app/App.tsx` | Permanent viewport and one tools dock; remove permanent side columns and bottom sections. |
| `src/workspace/layout.ts` | Five tabs, validated local preferences, bounded width, collapse and expansion state. |
| `src/workspace/DesignNavigation.tsx` | Scrollable tab strip, roving keyboard focus, collapse and Focus Mode controls. |
| `src/workspace/ToolsPanel.tsx` (new) | Shared dock, pointer/keyboard resize, responsive backdrop and selected-component actions. |
| `src/workspace/WorkspaceSettings.tsx` (new) | Viewing modes, camera tools, lighting and display preferences. |
| `src/workspace/design.css` | Replace translated panel layout with desktop dock and narrow-screen overlay; adapt existing code/chat UI. |
| `src/components/layout/TopBar.tsx` | Route existing navigation/preferences shortcuts into the dock. |
| `src/components/layout/ProjectSidebar.tsx` | Collapse the shared dock instead of toggling a removed left column. |
| `src/components/layout/InspectorPanel.tsx` | Collapse the shared dock instead of toggling a removed right column. |
| `src/components/layout/CommandBar.tsx` | Docked chat presentation, empty-state guidance and active-panel focus/scroll handling. |
| `src/firmware/FirmwareExplorer.tsx` | Docked editor presentation and shared width expansion; retain source/editor lifetime. |
| `src/catalog/navigation.ts` | Route Code to the panel; preserve the current tool when returning to Design; dismiss the overlay when opening the catalog. |
| `src/hooks/useKeyboard.ts` | Isolate tool-panel and tab-strip shortcuts from scene controls. |
| `src/lib/assistant.ts` | Existing local close-firmware command collapses the shared Code dock. |
| `src/store/useWorkspaceStore.ts` | Add session lighting intensity. |
| `src/three/HardwareScene.tsx` | Keep rendering for every tool panel; apply lighting intensity. |
| `tests/focused-workspace.test.tsx` (new) | Five tabs, contextual actions, resize/persistence, drafts, preferences, local commands and pending AI replies. |
| `tests/scene-lifecycle.test.tsx` (new) | Render-loop and Canvas identity across all tools, focus, collapse and catalog navigation. |
| `tests/design-ux.test.tsx` | Update design workflows, compact drawer and keyboard navigation regressions. |
| `tests/interface.test.tsx` | Update Explorer/Inspector and guide interactions for explicit tool selection. |
| `tests/guide-navigation.test.tsx` | Preserve chat/editor/scene identity while inactive panels are hidden. |
| `tests/firmware.test.tsx` | Update code navigation, shared resizing, expansion and shortcut-isolation tests. |
| `tests/e2e/design-ux.spec.ts` | Desktop/laptop/mobile dock, scene gestures, resize, persistence, editor, placement and console checks. |
| `tests/e2e/ai-guide.spec.ts` | Shared AI panel navigation and label cleanup paths. |
| `tests/e2e/catalog.spec.ts` | Keep catalog/placement/replacement tests aligned with docked tools. |
| `tests/e2e/firmware.spec.ts` | Docked editor workflows, artifacts, resizing and responsive checks. |
| `tests/e2e/workspace.spec.ts` | Update project, inspector, preferences and scene workflows for the dock. |
| `README.md`, `docs/architecture.md` | Document panel locations, controls, persistence and component lifetime. |
| `docs/focused-workspace-redesign.md` (new) | This validation record. |

## Test results

- Frontend suite: 128 tests across 15 files passed. Coverage includes actual camera/OrbitControls target preservation on viewport resizing, bounded layout persistence, all five tool tabs, selection/inspector synchronization, code editing and unsaved state, chat drafts/history, a pending AI request across navigation, connectivity/error handling, scripted commands against the existing workspace store, and scene/label lifecycle checks.
- `npm run lint`: passed.
- `npm run build`: passed (TypeScript and Vite production build).
- Additional `npx tsc -b`: passed after browser-test updates.
- `npm run test:e2e -- tests/e2e/design-ux.spec.ts tests/e2e/ai-guide.spec.ts`: blocked before tests started; Vite failed with `listen EPERM` on `127.0.0.1:5173`.

## Remaining blockers and warnings

- Browser validation is outstanding. Updated browser tests cover 1920×1080, 1440×900, 1366×768 and 390×844, plus the existing tablet checks. They define screenshots but none were generated here. Real pointer gestures, responsive layout and browser-wide console clearance cannot be claimed as verified in this environment.
- The checked-in AI service is read-only and has no validated design-proposal approval/execution pipeline. The redesign preserves the configured backend connection and existing local scripted commands; it does not invent an approval workflow or change the configured model. Approved AI design modifications therefore cannot be exercised against this implementation.
- Vitest still reports multiple Three.js instances and Motion's reduced-motion notice. Vite still reports large Three.js/Monaco chunks. No React root-unmount warning appeared in the passing regression suite; no warning suppression or delayed unmount was added.
