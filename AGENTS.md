# Repository Guidelines

## Project Status

Nexora is a React 19 / TypeScript frontend built with Vite. Three.js, React Three Fiber, and drei render procedural hardware; Zustand owns serializable workspace state. GSAP coordinates 3D animation, Motion handles interface transitions, and Tailwind CSS plus design-system CSS provide styling. A FastAPI backend in `backend/` provides short hardware explanations and validated, approval-gated proposals for adding, moving and removing visual components, selecting components, and creating projects. Electrical simulation, autonomous edits without approval, firmware compilation, and hosted databases remain out of scope. See `docs/ai-integration.md` for server setup and tests.

## Project Structure & Module Organization

When adding the initial implementation, use a small, predictable layout:

- `src/`: application source, grouped by feature or module.
- `tests/`: automated tests, mirroring source modules where practical.
- `assets/`: static images, fonts, and other application resources.
- `docs/`: architecture notes and contributor documentation.

Create directories only when they contain useful files. Keep configuration files and dependency manifests at the repository root.

## Build, Test, and Development Commands

Use Node.js 20.19+ and `npm ci`. Commands: `npm run dev`, `npm run build`, `npm test`, `npm run test:e2e`, `npm run lint`, and `npm run format`. See `README.md` for prerequisites. Keep package-lock.json synchronized. Run TypeScript/build, relevant tests, and lint for functional changes.

## Coding Style & Naming Conventions

Use TypeScript strict mode, Prettier, and ESLint with React Hooks rules. Keep indentation consistent within each file. Use descriptive names, cohesive modules, and the same naming pattern across related files. Avoid unrelated formatting changes in functional patches.

## Testing Guidelines

Vitest and React Testing Library cover state and interface behavior in `tests/*.test.{ts,tsx}`. Playwright covers the demo and responsive layouts in `tests/e2e/`. Test canonical transforms separately from WebGL. Keep tests deterministic; do not imply circuit correctness from visual tests. No coverage threshold is imposed.

## Commit & Pull Request Guidelines

No existing Git conventions can be inferred. Use concise, imperative commit subjects, such as `Add initial application scaffold`. Keep commits focused. Pull requests should describe the change, link relevant issues, and record validation performed or explain why checks were unavailable. Include screenshots for visible interface changes.

## Security & Configuration

Never commit credentials or local environment files. Provide placeholder configuration in `.env.example` when needed, and ignore generated artifacts and installed dependencies.
