# Design review round 2 (design-review-agent, 2026-11-16)

Round-1 status: 11 fixed, 5 partly (1 flows, 5 write states, 12 One in Live, 14 filled-button contrast, 16 rooms grouping), 2 not fixed (7 phone editor touch size, 15 label collisions).

New findings:
N1 BLOCKER Zone kinds (zone / ignore / entry) do not exist; proposal gives 4+2+2 slots.
N2 BLOCKER Phone Edit canvas never fits the room: two-row toolbar + 46% sheet leave ~230 px; room ~125 px wide.
N3 HIGH Phone calibration canvas ~150 px, sheet repeats the strip, actions below fold.
N4 HIGH Calibration strip height varies per state; canvas jumps; X wraps.
N5 HIGH Strip and inspector duplicate actions inconsistently.
N6 HIGH White on #03a9f4 fills = 2.63:1 (HA default does the same; owner call).
N7 HIGH One's tuner labelled "Calibrate" / "Not calibrated"; rename "Tune range".
N8 HIGH One's coverage drawn only when selected; absent in View.
N9 MED Desktop View does not fit the room.
N10 MED Room stale headline overstates when one sensor is live.
N11 MED Edit/View toggle: weak selected state, icon-only on phone, live during calibration, default mode undefined.
N12 MED Sensor rows do not signal they open settings; "RMS 84 mm" → "Calibrated, ±10 cm".
N13 MED No add / remove / move sensor inside a room; One has no placement path.
N14 MED Label collisions ("2 m" on wall, "Doorway entry" overflow, "on device 6.0 m" over axis).
N15 MED "mm" means spread in capture and error in review.
N16 MED Passing point (106 mm < 150) gets warning colour.
N17 MED Dark mode: coverage fill inside room ~1.1:1.
N18 MED Rooms grouping rule inconsistent; grid half width.
N19 MED Phone sheet shrinks to content (mock bug; spec full width).
N20-24 nits: live arc red = target red; "Failed" under "Online"; two legends for one hatch; "Try perspective fit" unexplained; occupied tile reads as selected.

Verdict: no-go as complete spec; go for M1–M3 (discovery, Rooms, desktop canvas, Pro/Lite calibration, One tuner). Decide before M4/M5:
1 zone kinds UI and slot pools; 2 several XY sensors per room (slot pools, coverage); 3 phone Edit layout (sheet states, min canvas height, pinch-zoom, 22 px handle hit); 4 Edit/View default, memory, non-admin, during calibration; 5 sensor lifecycle in room; 6 calibration exit semantics; 7 too-complex zone UI; 8 One rendering unselected and in View, mixed stale semantics; 9 update rewrite-proposal §7 to the two-screen model.
