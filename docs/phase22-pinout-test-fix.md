# Nexora Phase 2.2 physical-pin test fix

Cause: `tests/verified-pinouts.test.ts` used `wire1` in a round-trip import/export test.
The existing project parser requires wire IDs matching `wire-[A-Za-z0-9-]{1,80}`.

Fix: Use `wire-physical-persistence` in the positive test; add a negative regression
test confirming malformed IDs are rejected on project import. No production code
changes.

Install from ~/Desktop:
  unzip -o ~/Downloads/Nexora_Phase22_Pinout_Test_Fix.zip -d ~/Desktop

Verify:
  cd ~/Desktop/Nexora
  npm test
  npm run lint
  npm run build
