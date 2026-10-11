# Nexora: Project studio and AI design proposals

## What's implemented

- **Projects**: open the project dashboard from the top bar; create one of eight starter
  templates, open, rename, duplicate, or delete projects. Visual-only starter assemblies use
  insertable parts from the checked-in catalog. Unsupported catalog devices aren't invented.
- **Local persistence**: `nexora.projects.v2` stores up to 50 distinct projects including
  board, components, canonical transforms and bounded per-project chat history. The existing
  firmware store already keys C source drafts by project ID. Browser storage is not cloud
  storage; export JSON before clearing your browser or switching machines.
- **Legacy migration**: on first load of the new workspace, a valid save from
  `nexora.project.v1` is imported into the new project collection without deleting the old
  save. If the existing data is malformed, the hub warns and refuses to overwrite it.
- **Import/export**: validated project JSON may be imported as a new project (new ID), and
  the current project is exportable from the existing file menu.
- **AI proposals**: FastAPI uses the installed OpenAI model to return a short answer plus
  up to five schema-bound actions. Add/move/remove/select/create are the only action types.
  For adds, it must use an insertable catalog ID; moves/removals must refer to existing
  object IDs. The backend checks identities, action combinations and finite coordinates.
  The frontend parses the action schema, revalidates the entire project against placement
  rules and presents a summary, Apply and Cancel. No request automatically applies edits.
- **Atomic editing**: an approved design change updates one project snapshot and one undo
  entry. If the project changes while an AI proposal is pending, it is invalidated. Scene,
  Inspector, Explorer, transform controls and saved data use the same project store.
- **Response length**: Auto (default), Concise and Detailed. The selected setting is
  stored as `nexora.ai-length.v1`. Responses are natural and short by default; full
  explanations are requested from the model rather than truncating the rendered text.

## Constraints and caveats

- Visual objects do NOT verify circuits, soldering, board layout, fit, pin mapping, power,
  electrical compatibility or firmware execution. Proposed connections and firmware patches
  aren't supported yet.
- AI proposal preview is a **textual action summary**, not a rendered transparent 3D ghost.
  The 3D scene updates only once a proposal is approved.
- `localStorage` is used for the versioned project collection. It has an approximately
  browser-dependent quota; quota failures are surfaced rather than hiding an edit.
- Changing projects intentionally resets undo history and selected component to that
  project's recorded selection. Each project's C drafts and chat history remain separate.
- No live OpenAI request is part of the automated tests; backend mocks verify protocol,
  authorization and response validation. Test live credentials on your own machine.
- On installation, retain `backend/.env` from your existing Mac setup. It is intentionally
  excluded from shared source archives.

## Manual acceptance sequence

1. Open **Projects** from the top bar, create an IoT & Smart Home project, and confirm the
   blank PCB, ESP32 board and BME280 concept parts appear.
2. Move a component in the 3D viewport, switch to another project, then reopen the IoT
   project. Its position and C source draft should remain unchanged.
3. Ask **AI**: "Add an RP2040 to this project." Review the proposal; cancel and confirm
   no change. Repeat and Apply; confirm one new object and a working Undo.
4. Ask "Move [actual selected component name] to x=2, y=1, z=1 scene units." Apply and
   confirm the coordinates update. This scene uses 10 mm per world unit.
5. Ask "Remove the PCB." Confirm that the action is rejected.
6. Test greeting replies in Auto/Concise and a detailed hardware explanation in Detailed.
7. Export a project and reimport its JSON as a separate project.

## Commands

```bash
cd ~/Desktop/Nexora
backend/.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
# In another terminal:
cd ~/Desktop/Nexora && npm run dev
```

For tests use `npm test`, `npm run build`, `npm run lint`, and
`backend/.venv/bin/python -m unittest discover -s backend/tests -v`.
