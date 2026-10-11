# Firmware Explorer

Open **Firmware Explorer** on the divider beneath the 3D viewport, or enter **Open firmware** in the local Demo Assistant. The left tree, right inspector, branding, scene geometry, and animation code remain intact.

- Drag the upper separator vertically, or focus it and use Up/Down (20 px), Home, or End. The preferred panel height is 230–680 px; smaller windows clamp it to preserve a 180 px viewport. Expand uses the available space; Restore returns to the preferred height. Very short windows scroll the central column to keep the command bar reachable.
- C, Assembly, and Machine Code are accessible keyboard tabs. Monaco loads only after opening, from local Vite assets and a local worker. C supports highlighting, line numbers, indentation, bracket matching, undo/redo, and Cmd/Ctrl+F search. Use **Edit C** to unlock and **Lock C** to prevent accidental edits.
- **Save C** / Cmd/Ctrl+S sets the explicit saved baseline. Every edit also persists a recovery draft; an unsaved indicator distinguishes draft recovery from an explicit save. Local edits survive tab/component changes, collapse, scene modes, reload, and hardware reset/import. **Reset sample** has an inline confirmation and only resets firmware.
- Copy and Download act on the active tab. Machine Copy yields space-separated bytes. Hex export is annotated text, not Intel HEX or a flash image. Assembly export preserves compiler-emitted directives.
- U1 (`mcu`), U3 (`sensor`), Q1 (`mosfet`), and FAN1 (`fan`) map to one MCU source file by stable ID. Selection highlights/navigates the related C symbol; **Go to …** reopens C. Passive, structural, and unmapped components show an empty state. The sensor, MOSFET, and fan are not presented as processors.

## Recorded build

`assets/firmware/cooling.c` is the single authoritative sample. It reads an already-decoded Celsius RAM sample and writes a requested duty percentage to RAM. This models the sensor-to-controller-to-fan relationship without pretending to implement board-specific I2C, ADC, GPIO, or PWM drivers.

The checked-in build was generated with **Apple Clang 16.0.0 (clang-1600.0.26.6)**:

```sh
clang --target=arm-none-eabi -mcpu=cortex-m3 -mthumb -O2 -ffreestanding -fno-builtin -c assets/firmware/cooling.c -o cooling.o
clang --target=arm-none-eabi -mcpu=cortex-m3 -mthumb -O2 -ffreestanding -fno-builtin -S assets/firmware/cooling.c -o cooling.s
```

The 22 bytes are the ELF object's `.text` section, little-endian Thumb-2 for ARM Cortex-M3. The display uses **section-relative offsets**, not offsets into the ELF file, linked virtual addresses, or physical flash addresses. `.text` has no unresolved relocations. Other ELF sections, including unwind metadata, are excluded. Functions begin at section offsets 0 (`sensor_read_celsius`), 4 (`fan_set_duty`), and 8 (`update_fan`). Inlining means C-to-instruction mapping is not one-to-one; the UI makes no line-level mapping claim.

The original compiler assembly, disassembly, flags, source revision, source SHA-256, machine SHA-256, architecture, and extracted bytes are recorded in `src/firmware/demoBuild.json`. Reassemble the compiler output and compare its `.text` bytes to the C-compiled object using:

```sh
python3 scripts/build-demo-firmware.py
```

This developer-only script reads the bundled source. It never reads editor drafts or user-provided C. It requires Clang with the ARM backend and `llvm-objdump` (resolved through `xcrun` on macOS). Override `CLANG` and `LLVM_OBJDUMP` for other installations. Compiler versions may produce different valid bytes; inspect changes when regenerating the fixture.

The implementation follows [Clang's cross-compilation guidance](https://clang.llvm.org/docs/CrossCompilation.html) and [Monaco's ESM integration](https://github.com/microsoft/monaco-editor/blob/main/docs/integrate-esm.md).

## Integrity and persistence

Editable source, editor preferences, and saved baselines live in a separate serializable Zustand store, so typing does not notify the 3D workspace store. `nexora.firmware.v1` retains its legacy key through the CircuitForge rename and is a versioned localStorage record with project-keyed drafts. Hardware JSON does not contain firmware; export C separately. Only the existing Smart Cooling Controller project is supported by the current hardware importer.

Build validity is derived, never persisted as a trusted flag: both the UTF-8 FNV-1a source revision and exact source equality must match the bundled source. SHA-256 records the build's source provenance. Saving an edited draft does not change build validity. Restoring the exact sample makes the original recorded build applicable again without claiming a rebuild. Stale outputs remain inspectable and are explicitly labeled as original demo artifacts.

Corrupt local records recover to the bundled sample with a visible message. Opening/resizing cannot overwrite damaged records; explicitly editing, saving, or resetting source replaces them. Storage write failures retain session source and the previous saved baseline. Monaco initialization failure offers a plain-text editor plus retry; it does not crash the scene. The panel also has an error boundary. Source is bundled at build time, so there is no independent source-fetch endpoint to fail. Missing compiled artifacts have explicit empty states.

## Assistant commands

- Open firmware / Close firmware explorer
- Show C code / Show assembly / Show machine code
- Show microcontroller firmware / Focus on the microcontroller

**Show assembly** selects the firmware tab. **Switch to assembly** and **Show assembly view** retain their existing 3D meaning. Generation/optimization/compilation requests explain that live AI and target-specific compilation are future capabilities.

## Deferred

There is no browser compiler, backend compilation service, live firmware generation, flashing, simulator, board-support package, vector table, linker layout, or executable application image. No user code is executed. Monaco provides editing, not a C language server or compiler diagnostics. A real board port needs startup, clocks, drivers, pin mapping, and a reviewed target configuration.

## Files changed

Added:

- `src/firmware/FirmwareExplorer.tsx`, `CodeEditor.tsx`, `monaco.ts`, `firmware.css`
- `src/firmware/model.ts`, `store.ts`, `demoBuild.json`
- `src/vite-env.d.ts`
- `assets/firmware/cooling.c`, `assets/firmware/cooling.s`
- `scripts/build-demo-firmware.py`
- `tests/firmware.test.tsx`, `tests/firmware-editor.test.tsx`, `tests/e2e/firmware.spec.ts`
- `docs/firmware.md`

Modified:

- `src/app/App.tsx` — central viewport/panel composition
- `src/hooks/useKeyboard.ts` — isolate panel shortcuts
- `src/lib/assistant.ts`, `src/components/layout/CommandBar.tsx` — actual firmware commands and suggestion
- `tests/setup.ts` — jsdom ResizeObserver stub
- `package.json`, `package-lock.json` — Monaco dependency
- `README.md`, `docs/architecture.md`, `docs/validation.md` — feature and validation documentation

Generated build outputs are ignored. The firmware integration left `src/three/` unchanged. The subsequent CircuitForge rename updates only the fan’s printed brand label in `ComponentPackages.tsx`; geometry, rendering, and animations are unchanged.

## CircuitForge branding update

Updated the header wordmark and icon, favicon, page title/description, assistant labels, status bar, fan label, exported filenames, package manifests, editor theme name, E2E screenshot names, import error message, and project documentation. Existing project and firmware storage keys are retained for compatibility. The wordmark letter spacing accommodates the longer name within the existing header layout.
