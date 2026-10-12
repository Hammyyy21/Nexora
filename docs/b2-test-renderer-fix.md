# B2 naming test renderer correction

## Root cause

The original B2 naming test mutated the current project in the Zustand store and
rendered `ViewportOverlay` and `ProjectSidebar` with `renderToStaticMarkup`.
React uses `useSyncExternalStore` server snapshots for server rendering. Zustand
returns the store initial state through `getInitialState`, so the server markup
retained the original Smart Cooling Controller title regardless of the test
mutation. This was a test renderer mismatch rather than evidence of a broken
browser project title.

## Change

The naming test now mounts both components with React Testing Library's browser
renderer, verifies the active project name in the viewport and Explorer, checks
that a board rename leaves the project name intact, then verifies that a project
name change updates both views reactively and leaves the board name unchanged.
Undo and persistence assertions remain.

No production application source files are changed.

## Mac verification

```sh
cd ~/Desktop/Nexora
npm test -- --testTimeout=15000
npm run lint
npm run build
npx playwright test tests/e2e/engineering-workspace-v2.spec.ts
```

The full browser test suite was not run in the packaging environment because
its Rollup Linux native binary is absent. TypeScript and ESLint passed.
