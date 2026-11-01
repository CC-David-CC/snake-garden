# Snake Garden — desktop integration

Snake Garden is a Phaser 4.2.1 grid game with six campaign gardens, classic
endless play and three fixed logical speeds. The rules model uses one queued
turn per movement tick, seeded food placement, rock collision and the specified
tail-vacation rule. A full board or campaign growth goal ends as a win.

The desktop app exposes a synchronous `mount(host)` and idempotently disposes
only its own Phaser engine, listeners, resize observer, audio context and file
subscription. Desktop keyboard controls and phone-sized direction buttons are
both available; swiping the board is supplemental.

Save and Open use the signed-in desktop's `My files` context. Files retain an
expected version, show changed/conflicting-copy warnings, store the full logical
snapshot including queued turn and tick remainder, and reopen paused.

## Current limitation

No authored `garden-guide.riv` is supplied. The app shows a clearly labelled
procedural seedling guide and does **not** claim the Rive acceptance gate is
complete. Final artwork, physical-phone testing and the full per-game
acceptance matrix remain open.

## Verification

From the desktop worktree:

```sh
npm run typecheck --prefix apps/games/01-phaser-arcade/snake-garden
npm test --prefix apps/games/01-phaser-arcade/snake-garden
node tests/snake-garden-browser.test.mjs
CODI_PHONE=1 node tests/snake-garden-browser.test.mjs
node tests/snake-garden-account.test.mjs
```

The browser fixture is memory-backed. The account test must point only at an
isolated loopback account server.

Resuming or queuing a turn after a save marks the logical state unsaved. Saving
captures a paused snapshot, holds game controls at that boundary, and warns if
closed during the save. The app also pauses when its desktop window loses focus,
is hidden or rolled up, or the browser blurs; Resume is explicit. Imported snake
bodies are bounded to the board and checked for invalid cells. Local desktop and
emulated-phone account checks cover save boundaries, focus, synchronization and
account isolation. Physical phone and physical audio output remain unverified.

A missing or invalid save used to restore a window now clears the failed
reference and leaves a new paused garden. Local desktop and emulated-phone
account tests cover an invalid save, playing, save/sync, close/reopen and paused
refresh; a phone-sized missing-save test also passed. The original invalid file
is untouched. Physical touch and authored Rive artwork remain unverified.
