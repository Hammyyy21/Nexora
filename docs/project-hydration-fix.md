# Project hydration lifecycle regression fix

## Symptom

After adding multi-project management, some pre-existing frontend integration tests failed. In particular, navigation re-instantiated the current project, camera request counts changed, component selection could be replaced by a stale saved selection, and firmware copy controls were hidden for an unexpected selection.

## Root cause and change

`hydrateActiveProject` activated the stored project every time `App` mounted. Activation clones the project and resets camera/selection/history state by design, but this is correct only when **switching** or **restoring** a project, not when opening an already initialized first-run workspace or rerunning effects under React StrictMode.

The fix:

- Records whether project storage existed when the module initialized.
- Performs project hydration only once per application lifetime.
- Does not overwrite an already initialized first-run workspace.
- Restores genuinely persisted project content/selection/chat when it differs from the live workspace.
- Avoids triggering camera resets and object-identity changes when restoration is unnecessary.

## Validation

- Direct Node + jsdom TypeScript smoke checks passed for first-run state preservation and persisted-project restoration, including duplicate hydration calls.
- TypeScript type checking and ESLint passed.
- Backend: 17 tests passed.
- **Vitest/Vite not executed here:** the uploaded `node_modules` contains macOS-only native packages and the container cannot fetch Linux replacements.

## Validate on macOS

From `~/Desktop/Nexora`:

```sh
npm test
npm run build
```

If failures remain, send the new Vitest failure summary and stack traces. Do not delete or reset local browser storage to fix a test failure: this may destroy saved project work.
