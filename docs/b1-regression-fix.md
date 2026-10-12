Nexora Milestone B1 targeted regression fix

Fixes
- Legacy/demo projects lacking boardConfiguration no longer crash PCBComponentEditor.
- SVG <title> tooltips render as single strings, exposing pad IDs and net details.
- Adds a focused regression test for legacy editor rendering.

Install
  cd ~/Desktop/Nexora
  git status --short
  unzip -o ~/Downloads/Nexora_Milestone_B1_Regression_Fix.zip -d ~/Desktop

Verify
  npm test -- --testTimeout=15000
  npm run lint
  npm run build
  npx playwright test tests/e2e/engineering-workspace-v2.spec.ts

The patch overwrites ONLY the three source/test files listed above. Back up/commit local edits to those paths first.
