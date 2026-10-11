# Nexora Phase 2.2 — Verified Pins and Conservative ERC

## Scope

This update extends the existing schematic, electrical review, and AI context. It does **not** certify hardware, simulate circuits, auto-route PCB traces, infer pin functions from 3D placement, or establish power/current budgets.

### Curated pin evidence

| Catalog ID | Scope of verified pin data | Primary manufacturer evidence |
|---|---|---|
| `pico` | Selected 40-pin **Raspberry Pi Pico Rev3 board header** terminals: GP0, GP1, GND pin 3, GP20, GP21, 3V3(OUT), VSYS | [Pico datasheet, §2.1](https://datasheets.raspberrypi.com/pico/pico-datasheet.pdf); [Pico series pinout](https://datasheets.raspberrypi.com/pico/Pico-2-Pinout.pdf) |
| `tmp102` | All six pins of the **TI TMP102 DRL SOT-563 package**; V+ operating range 1.4–3.6 V; I2C SDA/SCL functions | [TMP102 datasheet §4, §5.3, §7.4](https://www.ti.com/lit/ds/symlink/tmp102.pdf) |
| `irlz44n` | **Infineon/IR IRLZ44NPbF TO-220AB** gate lead 1, drain lead 2, source lead 3 | [Infineon datasheet, package lead assignments](https://www.infineon.com/assets/row/public/documents/24/49/infineon-irlz44n-datasheet-en.pdf) |

All other catalog entries retain **symbolic logical terminals** until an exact package, board revision, and authoritative pin map are confirmed. Even the curated parts above have only a bounded subset of their electrical characteristics represented.

## Compatibility statuses

- **PASS**: a *specific* documented requirement holds, such as a nominal 3.3 V output falling within a documented 1.4–3.6 V supply input, or an SDA-to-SDA interface-function match. This is not a complete design approval.
- **FAIL**: a *documented* net conflict, such as direct power-output-to-ground, crossed I2C SDA/SCL, or multiple fixed push-pull output drivers on one net.
- **UNKNOWN**: unverified/symbolic pin mappings or missing necessary evidence. Unknown is neither pass nor fail.

The project schematic preserves old `VDD`, `DATA`, `IO-A`, etc. terminals as distinct **legacy logical** connections and adds curated physical endpoints prefixed `pin:`. No automatic migration or inferred physical equivalence is performed. Review old connections before using them to build real hardware.

## Testing

From Nexora root (on the user's Mac):

```
npm test
npm run lint
npm run build
backend/.venv/bin/python -m unittest discover -s backend/tests -v
```

Also try Schematic with an inserted Pico + TMP102. Connect `pin:GP0` to `pin:SDA` (matching **function**), then change to `pin:SCL` (documented bus lane mismatch). Connect Pico `pin:3V3_OUT` to TMP102 `pin:V+` to see narrow voltage-range compatibility, but **do not treat this as current-budget or circuit safety proof**. The selected symbol exposes manufacturer datasheet links in the Connections sidebar.

## Remaining gaps

Verified full pin maps/footprints, pin mux configuration, cable pinouts, exact MCU pad drive settings, pull-ups, level shifting, fan current/protection, common grounds, transient voltage limits, ERC completeness, and PCB fabrication rules are future work. No AI response or validation badge should claim these are covered.
