# Nexora: first-run Projects dialog and design UX tests

The project's intended first-run behavior is to show the **Nexora projects** dashboard before editing an existing design or creating a new one.

The two remaining `tests/design-ux.test.tsx` failures were stale setup assumptions: they clicked editor tools without first dismissing the startup dashboard. Consequently the assertions counted the Projects dashboard as a second dialog after the component drawer or Choose Board opened.

This test-only patch adds `enterDesignWorkspace()`, which uses the actual UI to open the existing Smart Cooling Controller project when the dashboard is shown. The two affected tests call it immediately after rendering the app. The original assertions about Add Component, validation, placement, and Choose Board remain unchanged.

Production code is not modified. Run on macOS:

```sh
cd ~/Desktop/Nexora
npm test
npm run build
```

The test runner could not be executed in the source-editing environment because the uploaded dependencies included macOS native binaries and the package registry was inaccessible. No claim is made that the complete suite passes until `npm test` succeeds on your Mac.
