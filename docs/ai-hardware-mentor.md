# AI Hardware Mentor — AI-1

AI-1 extends the existing Guide, local project archive and FastAPI gateway. It does not change the configured model, execute generated firmware, add a database, or introduce new hardware libraries.

## Context and persistence

`src/ai/memory.ts` defines a bounded, serializable intent record. `src/projects/store.ts` stores it in the optional `mentors[projectId]` field of the existing `nexora.projects.v2` archive. Older archives remain readable. Each record contains:

- Primary goal and intended hardware function.
- User requirements, retaining the original numbers and units.
- Decision statements and separately labeled references to unverified assistant advice.
- User corrections, unknown requirements, and a bounded excerpt of the latest AI advice for next steps.
- Omission and message counts, plus the project's unsent draft.

The Guide owns message recording for both its conversation UI and catalog explanations. Existing project chats retain the latest 20 messages. Recent chats in older archives seed intent on the next request. Goal memory survives eviction of the original chat turn. Lists hold at most 12 entries of 500 characters; requirements retain their first four entries and the latest eight so initial numerical requirements survive lengthy follow-ups. Later explicit corrections take precedence. Advice excerpts are limited to 1,600 characters and are **not confirmed decisions or executed steps**. Ambiguous decisions retain their preceding advice as labeled evidence rather than inventing a resolved component selection.

Chat requests include at most 10 messages, 4,000 characters per message and 12,000 total. Oversized historical messages retain their ending (including a possible final question) with a truncation marker. `conversation_omitted`, intent `omitted_entries`, and the existing snapshot omission counts tell the model what is missing. An additional UTF-8 body budget removes redundant context and then older memory/history if needed; `context_omitted` identifies removed fields. The existing gateway body limits remain intact.

`guideContext` derives component identities and roles from the **current** project, alongside the existing bounded snapshot, firmware and engineering findings. Removing a controller therefore removes it from current component context, regardless of an earlier conversation. Source-backed catalog data is retrieved by the server, not trusted from client specifications.

Memory and drafts are saved through the existing local archive. Storage failures retain session state and use the project store's existing error reporting. Memory is scoped by stable IDs, not names: rename preserves it; new, duplicated and imported projects start with independent memory; removing a project removes its archive memory. Hardware-only JSON export/import does not transport conversation memory. There is no cloud memory service.

## Isolation and approval

Every request captures its project, session project-switch generation, revision, serialized project and firmware draft. A response from a project that was switched away from is discarded, including after switching back before it completes. It cannot create a proposal, change inspection findings, append another project's chat, or overwrite its memory. The original user question remains saved. Concurrent chat sends remain blocked by the existing busy state.

Proposals remain ephemeral. Existing action parsing, backend validation, local previews, project/revision/snapshot checks and firmware checks still gate explicit **Apply changes**. Conversational acceptance such as “Let's use that” is evidence for advice, never approval to mutate hardware. Memory is stored outside project undo/redo; chat cannot restore or execute an old proposal after refresh.

The UI can hide the Project Inspection table directly because this is a display action. Other unsupported interface requests receive a limitation instead of triggering hardware inspection. Existing explicit local viewing shortcuts continue to work.

## Beginner and Engineer modes

The existing Guide controls now include **Explanation style**. Beginner Mode is the default. Engineer Mode and Beginner Mode share the same evidence and safety boundaries. The preference is local and persists across all project sessions, like response length; it is independent of the Demo/online selector.

Beginner instructions require plain-English introductions to unfamiliar terms, a sensible recommendation with reasons, small practical steps and at most one necessary clarifying question at a time. Engineer instructions permit deeper interface, electrical, calculation and PCB trade-off discussion where evidence supports it. Answers remain proportional to the question and selected response length.

## Goal-aware guidance and catalog honesty

Conservative local rules distinguish object detection, object-distance measurement, PCB spacing, wireless data, wireless power and temperature measurement. Unknown goals retain the user's stated goal and recent dialogue for model interpretation. A detection-to-measurement refinement preserves existing range requirements. Explicit changes to a different function clear obsolete requirements and advice; ambiguous follow-ups do not change the goal. Corrections are retained separately.

`backend/mentor.py` assembles deterministic **catalog search evidence**, separate from electrical checks. It checks all checked-in catalog names/descriptions/use cases for capability candidates. This is a text search, not manufacturer qualification or live inventory. For the current catalog there is no object-distance sensor. The prompt directs the model to report that absence, consider time-of-flight or ultrasonic sensing without promising a range, explain how a compatible sensor could communicate with an existing RP2040, and outline power, wiring, firmware and physical tests. TMP102, BME280 and SHT31 are explicitly excluded as distance sensors. The gateway also rejects structured proposals that substitute these parts for a distance sensor; an explicit request to add auxiliary temperature sensing remains possible.

Manufacturer-backed facts, catalog information, user values, estimates and unverified suggestions must be distinguished. The model cannot browse manufacturer documents or stock services. Physical pins and ratings cannot be invented. Placement, schematic lines and narrow deterministic checks do not establish a working or fully verified circuit.

## Failures, privacy and limits

Recognizable credential assignments, common key formats, bearer tokens, private-key blocks and credentials in URLs are redacted before chat/draft persistence and transmission. This is a best-effort safeguard, not a general secret detector: arbitrary unlabeled secrets cannot be reliably recognized. Never enter credentials into the Guide. Existing firmware snapshot redaction is unchanged; firmware remains part of the bounded request. The UI disclosure now accurately says so. Backend credentials remain server-side, raw upstream exceptions remain hidden, and requests continue using `store=False`.

A failed upstream request preserves its question, conversation and draft for retry. Error text is not adopted as the next-step advice. Pending edits are not persisted or replayed. If browser storage is disabled or full, refresh durability cannot be promised.

Natural-language extraction deliberately uses conservative rules rather than an additional model call. It is strongest for the evaluated functions and English phrases; it is not a complete requirements-management system. Unknown goals and nuanced component roles rely on retained user statements and model reasoning. Bounded histories can lose older details, with omissions explicitly reported. Model prose remains nondeterministic; offline evaluations verify context, decisions and boundaries, not the correctness of every possible generated answer. Demo Assistant remains scripted, without the live mentor's generative guidance.

## Evaluation and extension

`tests/ai-mentor.test.ts` covers goal refinement, corrections, contextual follow-ups, function distinctions, project isolation (including switch away/back), persistence, approval/revision protection, failure recovery, redaction and truncation. `tests/project-hydration.test.ts` exercises a fresh module load. `backend/tests/test_mentor.py` uses a mocked provider to check actual prompt assembly, explanation modes, complete catalog searches, schema bounds and unsuitable-sensor proposal rejection. `tests/e2e/ai-guide.spec.ts` covers responsive Guide navigation and saved goal/history/draft/mode restoration after browser refresh. No ordinary test uses a paid AI call.

Run:

```sh
npm test -- --testTimeout=15000
npm run lint
npm run build
backend/.venv/bin/python -m unittest discover -s backend/tests -v
npm run test:e2e -- tests/e2e/ai-guide.spec.ts
```

Future improvements can add an editable goal/decision view, explicit user confirmation of extracted requirements, more language/function rules, versioned structured plan summaries, and curated sensor capability tags. Source-backed distance-sensor records and verified pin mappings need separate catalog work. Any future model-generated memory updates should pass a bounded schema, preserve provenance and corrections, and remain separate from the action approval path. Real model evaluations can supplement, rather than replace, deterministic CI.

## Delivery verification

Validated locally on 2026-10-12:

| Check | Result |
| --- | --- |
| Vitest (`--testTimeout=15000`) | 289 passed across 36 files |
| ESLint | Passed |
| TypeScript / Vite production build | Passed; existing large-chunk warning remains |
| Backend unittest discovery | 43 passed |
| AI Guide Playwright suite | 3 passed, including desktop/mobile navigation and refresh persistence |

Browser navigation tests now dismiss the existing first-run Projects dialog and assert the application's intentional navigation-focus behavior. Their canvas identity, draft preservation and console-error assertions remain intact. A review screenshot is generated at `test-results/ai-hardware-mentor.png` (ignored test artifact). Model responses in evaluations are mocked; live model quality was not evaluated with paid calls.

Files added or modified:

- `src/ai/memory.ts`, `src/ai/client.ts`, `src/ai/store.ts`
- `src/projects/store.ts`, `src/components/layout/CommandBar.tsx`
- `backend/mentor.py`, `backend/models.py`, `backend/catalog.py`, `backend/main.py`
- `tests/ai-mentor.test.ts`, `tests/ai-guide.test.tsx`, `tests/project-hydration.test.ts`, `tests/e2e/ai-guide.spec.ts`
- `backend/tests/test_mentor.py`, `docs/ai-hardware-mentor.md`

Changes are left uncommitted for review; nothing was pushed.
