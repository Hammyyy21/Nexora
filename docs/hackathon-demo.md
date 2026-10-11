# Hackathon MVP walkthrough

Start the backend and frontend in separate terminals from the repository root:

```sh
backend/.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --workers 1
npm run dev
```

Open http://127.0.0.1:5173. Install dependencies first if needed: `npm ci`; `python3 -m venv backend/.venv`; `backend/.venv/bin/python -m pip install -r backend/requirements.txt`. The backend reads `backend/.env`; copy `backend/.env.example` there and configure `OPENAI_API_KEY` locally for live AI. The default model is `gpt-6.1-sol`. No key is required for offline demonstrations.

1. Open Projects → Open a connected demonstration project → IoT Environmental Monitor. Each button creates and saves a new independent copy. Importable snapshots also live in `assets/projects/`.
2. Inspect the 3D assembly. Use Fit to Model, rotate the camera, select a component and inspect its position/specifications. Choose Board exposes ten new configurable presets, plus the existing boards. Pico and ESP32-DevKitC V4 remain manufacturer development-board components, with sourced dimensions and partial specs; the carrier remains a separate PCB.
3. Add Component → search TMP102 → Add to Design. Click Area 1 (or a highlighted 3D area), inspect XYZ/reason, then Confirm visual placement. Manual fields remain available.
4. Open Schematic. Click the new sensor's SDA (demo), then the controller's SDA (demo). Repeat for SCL, VDD and GND. Demo terminals are explicitly conceptual; documented physical terminals use separate `pin:` identities. Remove wires with their Remove buttons. The Connections 3D view shows the actual recorded links.
5. Workspace → Design review shows geometry and electrical results, correction suggestions and component selection. Expand Power & thermal calculation inputs to change instance-specific values. The board's Inspector configuration controls example supply voltage/current budget and minimum spacing. The Robotics example deliberately exceeds its demo budget; Cooling includes an incomplete power path and a sample thermal estimate. These are arithmetic and topology checks, not hardware safety certification.
6. AI Guide → “Add a temperature sensor.” Review the proposed placement, Apply, then Undo/Redo. Also try “Connect the temperature sensor to the controller”, “Suggest better positions for these components”, “Check my circuit for problems”, and “Show me the specifications of this board”. Live AI uses the validated registry. Demo mode supports these specific examples through the same preview workflow; it does not impersonate a live model.
7. “Generate basic firmware for this controller.” Edit the preview, then Apply to replace C. Undo restores the prior source. Generated C is a starter requiring target drivers and review; no compiler or shell executes it.
8. Save, switch projects, reopen, and reload the browser. Connections, board settings, engineering inputs and edited source persist.

Auto response mode is brief for ordinary actions; Detailed remains available for explanations. Backend tests mock model output. The integration keeps the existing structured proposal response approach documented in [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), using the supported [GPT-6.1 Sol model](https://developers.openai.com/api/docs/models/gpt-6.1-sol).

Checks: `npm test`, `npm run lint`, `npm run build`, `backend/.venv/bin/python -m unittest discover -s backend/tests -v`, `npm run test:e2e`. Browser tests require permission to launch Chromium and listen on localhost.

## Validation in this workspace

- Full frontend suite: 238 tests passed. Follow-up action/UI and board specification suites passed after the final validation and display changes.
- Backend: 27 tests passed, including mocked structured model responses, connection endpoint rejection, and firmware payload bounds.
- ESLint and production build passed. Existing large bundle warnings remain.
- Browser E2E was attempted but Vite could not bind localhost (`EPERM`). A server-free browser fallback also found the Playwright Chromium executable absent, so browser screenshots and full rendered workflows remain unverified here.
- The configured `gpt-6.1-sol` live smoke request was attempted and returned `UPSTREAM_UNAVAILABLE`; no live-model success is claimed. Offline proposal examples and mocked live responses passed.
