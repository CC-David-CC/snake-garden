> Original design reference from 2026-10-30. This describes intended behavior, not current implementation or qualification. The current app README is authoritative for status. Pseudocode and template JSON here are documentation, not build entries.

# Snake Garden

**Grid arcade · Phaser · single-player · phone required · flat-screen app**

> Planned design, not implemented or browser-tested. `index.pseudo.mjs` is an explanatory entry point, not a playable game.

## Experience

A bright garden snake game where small challenges teach routing before an endless score chase.

## What this demonstrates

- Fixed grid tick with smooth visual interpolation
- Seeded level variation
- Input buffering and responsive sound cues

## Rules and complete loop

- One cell per logical move; at most one queued turn per tick; direct reversal is invalid.
- Food spawns only in empty cells. Collision with the tail cell is allowed only when the tail moves away on that same non-growth tick.
- Campaign goals are collect-count challenges; a full board is victory, not an infinite food-spawn loop.

## Bounded polished release

Six compact gardens, Classic endless and three fixed movement speeds.

- Soft corners and readable head direction
- Optional swipe is supplemental, not the only phone control
- No frame-rate-dependent speed

No multiplayer, accounts, server simulation or generic editor is required. Start, rules/help, play/activity, pause, outcome/goal feedback and retry must all be complete. Settings include volume/mute, reduced motion, contrast and game-specific options where meaningful. State changes occur in the game model; animations illustrate them.

## Rive inside this app

Animated seedling guide in title/results, with non-blocking score feedback. The requested asset is `garden-guide.riv`; it is **not included**. See [RIVE.md](RIVE.md) for the authoring/integration contract. A placeholder or unrelated animated logo does not satisfy this requirement.

## Save behavior

Exact logical snapshot including pending turn and move remainder. See [SAVE.md](SAVE.md). Loading starts paused; resume is explicit. Restart and load cancel stale callbacks and any owned AI work.

## Build sequence

Implement the rule loop in [gameplay.pseudo.txt](gameplay.pseudo.txt); bind the exact app lifecycle from [index.pseudo.mjs](index.pseudo.mjs); complete [CONTROLS.md](CONTROLS.md); author/integrate [RIVE.md](RIVE.md); then satisfy [ACCEPTANCE.md](ACCEPTANCE.md). Do not add XR or a 3D engine solely to widen the technology list.

Target wave: **2**. Integrator first reads [AGENTS.md](../../../../../docs/games/design-reference/ORIGINAL-INSTRUCTIONS.md); do not guess host APIs from symbolic helper names.

Use original/licensed artwork and audio. Keep the scope small enough to polish; expand content only after the release gates pass.
