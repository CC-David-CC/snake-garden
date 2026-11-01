# Save and load — Snake Garden

## Promise shown to the user

Exact logical snapshot including pending turn and move remainder.

## Authoritative fields

- ordered snake cells
- direction and queued legal turn
- food cell
- obstacle map id
- score and growth count
- RNG and move tick remainder

Use the versioned envelope from [SAVE-LOAD.md](../../docs/SAVE-LOAD.md), app id `snake-garden`, a content/rules version and any required engine fingerprint. Derived render positions, DOM, texture handles, Rive artboards and in-flight worker jobs are excluded. XR anchors, tracked poses and hardware identities are excluded.

Pause at a committed game boundary, cancel uncommitted input, capture only the documented snapshot/checkpoint and report what was actually written. A visible Save operation must not quietly write an older checkpoint without saying so. On load validate size, app/version, finite values, ids and invariants, prepare a replacement, then commit; failure leaves the current game intact. The game resumes paused with an explicit Resume.

Restart/load invalidates callbacks, held inputs and queued AI results from the previous state.

File integration is unbound until the real host services are inspected. Do not invent host method names, atomic write guarantees or another hidden document store. Use explicit Save As/conflict handling appropriate to the actual provider.
