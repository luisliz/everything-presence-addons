# Design review round 1 (design-review-agent, 2026-11-16)

Ranked findings (full text in session transcript; headings only here):
1. Rooms: New room / Add to a room flows do not exist; toolbar does not say outline vs zone.
2. No delete or undo anywhere.
3. Calibrate on phone: live feedback below the fold.
4. One tuner: distances unexplained, no far-wall marker, no "use current distance", half-disc implies 180° coverage, SEN0395 variant unmocked.
5. Device writes have no Applying / Failed / Offline / too-complex states; no per-zone sync badge.
6. Calibrate error states missing (0 or 2+ targets, moving, offline, outside wedge, poor fit with fallback).
7. Phone editor not touch-operable: 130 px room, 8 px handles, "Cursor" readout, inspector far from shape.
8. Three save models and five names for timeout; unify terms (Clears after, Discard changes, Offline), auto-apply as the rule.
9. Settings hierarchy: room timeouts under sensor switch; save bar covers content and references off-screen field; Installation note has no skip path.
10. Stepper bug (completed steps unchecked); Fit is a dead step, fit automatically at ≥3 points.
11. Review: residual bars need threshold scale and warning colour; translate RMS into zone-width guidance; red reused; corner-bias instruction.
12. Live: no staleness indicator; the One is absent.
13. Dark mode: zone/target colours fail contrast (2.5:1, 2.3:1); ring labels unreadable.
14. Light mode: accent text 2.63:1, warning text 2.16:1; darken accent/warning for text only.
15. Overflow/collisions: spread pills, zone labels, ring labels, wrapped button, legend glyph mismatch.
16. Rooms hierarchy noise: area repeats room name; single 450 px column; "Occupied, 2"; room tabs shown without a room.
17. Inspector: taken slots not disabled/swap; inconsistent fields; "Evaluated by" jargon → "Runs on".
18. Copy explains the renderer, not the task.

U1–U9: U1, U4, U5, U7, U8, U9 addressed; U2 addressed on desktop only; U3 and U6 partial.

Keep: coverage wedge + hatching, slot counter and HA-down note, capture model with live spread, review vs previous fit, wedge guidance for points, "device uses X" pattern, unassigned banner, sensors list, Live layout, check-mark convention, 44 px controls.
