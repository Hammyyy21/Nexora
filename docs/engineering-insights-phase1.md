# Engineering Insights – Phase 1

Source-only incremental addition to the current Nexora Studio. It does **not** replace project persistence or any AI-action protocol.

## UI

Open **Workspace** in the five-tab tools strip. At the bottom of the existing scene preferences, use **Engineering tools** to switch between:

- **Design review:** deterministic warnings from current component transforms and catalog verification status. Click **Select component** to inspect any flagged component. Overlap checks use approximate 3D bounding boxes and are explicitly labeled preliminary.
- **Bill of materials:** groups placed parts by curated catalog ID, otherwise by concept name/type, with references, quantity and manufacturer part number where available. **Export BOM CSV** downloads a CSV with formula-injection protection. It does not contain fabricated prices or stock availability.

## AI context

The frontend sends at most eight short design findings (each at most 160 characters) as *untrusted, advisory context* alongside component names and positions. The FastAPI gateway validates their sizes. The model may explain these findings but must not treat them as actual electrical-rule checks.

## Important non-capabilities

No verified pin mapping, netlist, schematic editor, copper traces, 2D-to-3D synchronization, electrical DRC, SPICE engine, manufacturing Gerbers, live pricing, or collaborative editing was implemented in this phase. Existing demonstration connection paths remain illustrations and must not be represented as electrically complete.

## Verification

On your Mac, run `npm test`, `npm run lint`, `npm run build` and `backend/.venv/bin/python -m unittest discover -s backend/tests -v` from the project root.

Manual: switch across projects and compare BOMs; move a part beyond PCB bounds in Free workspace and inspect the review; click a finding's component selector; download CSV and confirm correct references; ask the online AI to summarize preliminary review findings, then verify it does not claim an electrically valid design.

## Future stages

1. Verified component symbols, footprints and pin definitions; user-editable schematic with logical nets.
2. Shared schematic/2D PCB/3D assembly model and real netlist-driven electrical-rule checks.
3. Copper routing, trace-clearance DRC, real manufacturer BOM data, export formats, SPICE via a suitable simulator, and fabrication validation.

Build original features inspired by publicly documented workflows—do not copy competitors' proprietary code, branding, or asset libraries.
