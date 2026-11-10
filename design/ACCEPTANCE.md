> Original design reference from 2026-10-30. This describes intended behavior, not current implementation or qualification. The current app README is authoritative for status. Pseudocode and template JSON here are documentation, not build entries.

# Acceptance — Snake Garden

**All runtime cases are NOT RUN.** This file is a plan; document checks are not gameplay evidence.

Apply all C01–C24 in [common acceptance](../../../../../docs/games/design-reference/ACCEPTANCE-COMMON.md). No immersive support is claimed or required for this flat-screen app.

## Game-specific cases

| ID | Experiment / invariant | Status |
|---|---|---|
| snake-garden-G01 | Tail-cell entry and growth are tested separately. | not_run |
| snake-garden-G02 | Two fast turns cannot reverse within one tick. | not_run |
| snake-garden-G03 | Full board terminates cleanly. | not_run |
| snake-garden-G04 | Food never appears in a wall. | not_run |
| snake-garden-G05 | RNG and input buffer round-trip in a save. | not_run |
| snake-garden-G06 | Resize cannot alter board dimensions or snake speed. | not_run |

## Release evidence

Record rules/content and dependency versions, actual asset names/hashes, desktop browser, real phone and (where required) Galaxy XR build, commands/logs, complete-playthrough result, save restoration result, multiwindow/late-disposal behavior, frame timing and unresolved defects. Exercise actual Rive properties and texture input rather than substituting an HTML mock.

A pure rules unit test, a visual smoke test and a hardware XR test are different evidence. Preserve that distinction. All promised features must be demonstrated or explicitly left incomplete; do not relabel a generic engine scene as the finished game.
