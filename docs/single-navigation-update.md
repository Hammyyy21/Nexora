# Nexora single navigation update

The separate Explorer / Workspace / Inspector / Code / AI tab strip is removed.
The existing workspace header now provides exactly one main navigation row:
**Design | Inspector | Workspace | Code | Components | AI Guide**.

- Design opens the existing Explorer project tree and component/board actions in the right-side panel.
- Inspector, Workspace, Code, and AI Guide use the same retained right panel and preserve their working state.
- Components retains the library view.
- Focus Mode and Show/Hide tools sit beside the main navigation, not on a second strip.
- The 3D scene stays mounted across tool switches.
- Keyboard Left/Right/Home/End navigates the six primary buttons; small viewports use horizontal scrolling.
- Existing project data, firmware, AI history, component transforms, and FastAPI remain unchanged.

## Install

From the Mac Desktop, extract the ZIP to Desktop. It contains only changed source and test files beneath `Nexora/`. Back up the existing project first; preserve `backend/.env`.

```sh
cd ~/Desktop/Nexora
npm test
npm run lint
npm run build
```

## Status

TypeScript (`tsc -b`) and ESLint passed in the Linux editing environment.
Full Vitest/Playwright tests were not executable here because the previously uploaded node_modules contains macOS-native Rollup binaries. Please run the full suite and visually verify viewport width, responsive header scrolling and the controls on your Mac.
