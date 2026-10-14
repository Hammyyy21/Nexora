# Placement and AI chat UX

## Starting state and scope

The repository contained uncommitted AI-1 and AI-2 work before this task. AI-1 already implemented project memory, bounded conversation history, intent recognition, project isolation and Beginner/Engineer explanations. AI-2 already integrated nine-stage structured Build Plans, catalog-aware recommendations, manual evidence-based progress, save/export/import, and backend prompt context. This change preserves that implementation and its approval/revision gates. No model replacement, fine-tuning, cloud database or autonomous hardware changes were introduced.

AI-2 is implemented for the scoped planning milestone. This task adds an accessible **What should I do next?** action and makes local step guidance include current project evidence. The existing planner derives recommendations and progress from the goal, current inventory, schematic connections, physical-terminal provenance, PCB pads/nets/airwires, firmware target/source and engineering findings. An RP2040 distance-measurement project retains its controller and reports the distance sensor as unavailable; temperature sensors are not substituted. External candidates remain unverified recommendations. Completion records user review, never circuit certification.

## Placement interaction

Selecting an insertable component from any workspace activates Design, closes the catalog drawer, switches to assembly view and starts an ephemeral preview at the first suggested board area when available. Search and catalog details remain unchanged. The tools pane is temporarily hidden without changing its saved width or panel selection. The existing Canvas stays mounted.

The placement pane occupies real layout space beside the viewport. It starts at 300 px, has a 260 px normal minimum, and is limited to the smaller of 480 px and 45% of the available workspace. Narrow layouts adapt these limits. Drag its left edge to resize. Focus the separator with Tab and use **Left/Right** to grow/shrink by 20 px; **Home/End** select its current minimum/maximum. Pointer capture, touch-action and propagation handling keep resizing outside camera and transform gestures.

**Collapse** reduces the pane to a compact rail, keeping the preview and **Fit PCB to View** available. **Expand** restores the preferred width. Width persists in `nexora.placement-layout.v1`; collapse persists for the session. Storage failure leaves session controls usable.

At widths up to 620 px, controls become a scrollable bottom pane using at most 42% of workspace height; collapse reduces that to a small action row. Horizontal resizing is hidden because the board retains full screen width. Compact navigation closes the tools drawer when opening PCB Layout, Schematic or Components so it cannot cover their controls.

The camera fits the PCB bounds using the real remaining Canvas aspect ratio. Pending parts and distant existing objects do not shrink the PCB framing. During placement, a hidden board is shown and the enclosure is temporarily hidden for visibility; project visibility and geometry are unchanged. Resize/collapse triggers a fresh fit, preserving orbit direction and projection. Resize fits are immediate; explicit fits use the existing interruptible camera transition. Zoom, pan and orbit remain available. Selecting a suggested area or changing XYZ/rotation updates the ghost without moving the camera or committing hardware.

**Fit PCB to View** also works while collapsed. Confirm creates one component through the existing undo/redo path; it does not issue a focus-camera request. Cancel leaves the project unchanged. Closing placement restores the previous tools pane without deliberately resetting the camera. Existing free-workspace positioning and Reset placement behavior remain available; manually entered off-board positions are not forced into the PCB framing.

## Chat interaction and reliability

The composer captures the submitted text, clears that project's draft synchronously, records the outgoing message, then starts the asynchronous request. Both Send and **Enter** use the same path. **Shift+Enter** inserts a newline. Composition input is not submitted mid-composition. The textarea retains whitespace and multiline text; the existing 4,000-character limit and credential redaction remain in force.

A synchronous store lock blocks duplicate requests. The composer remains editable while a reply is pending, so a new draft survives success, failure, workspace navigation and refresh. Failures keep the sent question, append a useful sanitized error and expose **Retry last message**. Retry does not append another outgoing message or clear a separate draft; it preserves whether the original request was online or local, even if configuration failure changed the visible mode. It recomputes current project context so old edits cannot bypass approval protections.

Requests retain project identity and switch-generation checks. Responses from a project switched away from are discarded, including switch-away/back. A single request remains in flight globally until completion or the existing timeout. The original question remains in the saved conversation. Pending proposals retain project/revision/snapshot/goal/firmware guards and require explicit approval.

User messages have a 160 ms entrance. Completed assistant replies have a 320 ms paint-only reveal of the full rendered content. This is presentation of a validated completed JSON response, **not streamed model generation**. There are no per-character React updates or artificial request delays. Markdown, tables and fenced code are rendered with react-markdown and remark-gfm; raw HTML is disabled and remote images are represented by their alt text. Diagram fences remain readable source, not executed diagrams. Structured actions and editable firmware previews stay outside the animated message body.

The conversation follows new messages only within 64 px of its bottom. Scrolling upward preserves reading position. Full reply layout is reserved before its reveal, avoiding animation-driven height changes. OS `prefers-reduced-motion` and the existing app setting disable message effects. Existing messages do not animate on initial chat mount. Typing is never animated.

## Files changed in this task

- Placement: `src/catalog/Placement.tsx`, new `src/catalog/placementLayout.ts`, `src/catalog/navigation.ts`, `src/app/App.tsx`, `src/store/useWorkspaceStore.ts`, `src/three/CameraController.tsx`, `src/three/ComponentMesh.tsx`, `src/workspace/ToolsPanel.tsx`, `src/workspace/DesignDrawer.tsx`, `src/workspace/design.css`.
- Chat: `src/components/layout/CommandBar.tsx`, `src/ai/store.ts`, new `src/ai/ChatMessage.tsx` and `src/ai/chat.css`, `package.json`, `package-lock.json`.
- AI-2 refinements: existing uncommitted `src/ai/planner/BuildPlan.tsx` and `src/ai/planner/planner.ts`.
- Regression coverage: `tests/ai-guide.test.tsx`, `tests/ai-build-plan.test.tsx`, `tests/catalog-workspace.test.tsx`, `tests/placement-recommendations.test.tsx`, `tests/camera-preservation.test.tsx`, new `tests/e2e/placement-chat-ux.spec.ts`.

## Validation

Final validation on 2026-10-14:

| Check | Result |
| --- | --- |
| `npm test -- --testTimeout=15000` | 308 passed across 37 files |
| `npm run lint` | Passed |
| `npm run build` | TypeScript and production build passed; existing large-chunk warning remains |
| `backend/.venv/bin/python -m unittest discover -s backend/tests -v` | 47 passed |
| `npm run test:e2e -- tests/e2e/placement-chat-ux.spec.ts tests/e2e/ai-guide.spec.ts` | 7 passed |
| `git diff --check` | Passed |

No final checks failed or were skipped. Initial failures identified obsolete off-board placement assumptions, a compact-navigation drawer obstruction, asynchronous Canvas resize timing, and a local/online request-mode regression during retry development. These were corrected and the full required checks rerun. Existing unit-test warnings about multiple Three.js imports in mocks and reduced-motion configuration remain informational.

Automated AI responses are mocked; no paid model calls were used. Browser tests cover desktop/mobile navigation, placement resizing/collapse, preview edits, Focus Mode, confirmation/cancellation, width and project refresh persistence, pending sends, project switching, Markdown, reduced motion and preserving a scrolled reader's position. Camera unit tests project board corners into resized viewports and check pose preservation after confirmation. Existing suites continue exercising action approvals, revision checks, goal memory, recommendation honesty and Build Plan persistence.

Browser review screenshots: [desktop placement](../test-results/placement-ux-1366.png), [mobile placement](../test-results/placement-ux-390.png), and [AI Guide](../test-results/ai-hardware-mentor.png). These are ignored test artifacts and can be regenerated with the browser command above.

## Limits and follow-up

Placement is geometric preview, not electrical validation. If no clear area fits, manual coordinates and warnings remain necessary. Width persists; pending placements themselves remain ephemeral. Mobile uses a bounded bottom pane rather than a horizontally adjustable side pane. Free-workspace positions outside board bounds require manual orbit/pan/zoom. Existing camera direction is preserved, so a previously edge-on view may need orbiting.

The gateway is non-streaming. Future genuine streaming must keep partial prose separate from fully validated action proposals. Mermaid fences are displayed as source. Retry controls are session-only, while questions and drafts persist. Existing bounded memory/history, English-oriented goal heuristics, local browser storage limits, unavailable distance-sensor catalog records and external routing/compilation/testing requirements remain.

Useful follow-up work: source-backed distance-sensor catalog entries and verified pin mappings; authenticated streaming with complete action validation; separate investigation of existing large production bundles. No changes were pushed or committed.
