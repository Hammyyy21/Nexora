# B2 board-label test selector correction

The name propagation integration test uses the client renderer to verify live Zustand state changes. The Explorer exposes two distinct buttons with the board name: the board-selection button (accessible text `Distance Sensor Board PCB1`) and the visibility button (`Hide Distance Sensor Board`). The previous loose `name: /Distance Sensor Board/` selector was ambiguous and made an otherwise passing integration test fail.

The assertion now anchors the button's accessible name to the board-selection control, allowing the optional `PCB1` identifier while excluding the `Hide …` action. This is a test-only change; no application behavior is modified.

Run `npm test -- --testTimeout=15000`, `npm run lint`, and `npm run build` on macOS.
