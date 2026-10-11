# CircuitForge frontend prototype

## Product

A premium, desktop-first engineering workspace for exploring and manipulating a Smart Cooling Controller. The initial release is a browser-local concept viewer, with no backend or electrical calculation engine.

## Implemented scope

- React/TypeScript/Vite application shell with dark design system and responsive panels.
- Procedural PCB, chip packages, connector contacts, capacitors, fan, mounting holes, traces, and protective housing.
- Shared component data, synchronized explorer/picking/inspector, visibility and appearance editing.
- Assembly, reversible Exploded view, X-Ray, and illustrative Connections.
- Orbit, pan, zoom, focus, fit, front/top/isometric camera presets.
- Keyboard shortcuts, tooltips, preferences, reduced motion, loading/failure states.
- Deterministic local Demo Assistant with explicit unsupported-command feedback.
- Local save/load, validated JSON import/export, viewport PNG, bounded undo/redo.
- Vitest and Testing Library tests plus Playwright demonstration and responsive checks.

## Decisions

| Area | Choice |
| --- | --- |
| Frontend | React 19, TypeScript, Vite |
| 3D | Three.js, React Three Fiber, drei; local procedural geometry |
| Animation | GSAP for transforms/materials/camera; Motion and CSS for UI |
| State | Zustand; canonical project separate from transient viewing state |
| Styling | Tailwind CSS and scoped global design-system classes |
| Data | Bundled demo and explicit localStorage save; validated versioned JSON |
| QA | Vitest, React Testing Library, Playwright, ESLint, TypeScript |

## Deliberate boundaries

No live AI, electrical verification, schematics, actual signal simulation, manufacturing exports, firmware, cloud storage, authentication, or database. Orthographic projection and arbitrary project/component creation remain future work. Performance targets need measurement on target demo hardware; software WebGL test results cannot establish hardware FPS.

## Next phase

Add a typed design-operation interface and a real AI integration with preview/accept controls. Introduce vetted component libraries and editable connection data before adding any electrically meaningful analysis.

## Acceptance status

The implementation, production build, lint, and 43 automated unit/UI/camera tests are complete. Real-browser acceptance remains open because this environment blocks localhost servers and Chromium startup. See [validation](validation.md) before treating the prototype as rehearsed for a live demonstration.
