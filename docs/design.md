# Design notes

- **Renderer: PixiJS 8.22.0**, because the scene is many redrawn ink strokes per frame (wobbly lines, hatching, stick figures) and Pixi's retained Graphics on WebGL does that cheaply on phones, without Phaser's game framework we do not need (no physics, scenes or asset pipeline).
- **inkjs: not used.** Every line people say comes from HF verdicts; story beats are short data lines in `src/sim/mountain.ts`. A branching script engine would compete with HF for who speaks.
- **Host versus HF.** The host builds honest offers (what a leg costs, how risky it is now, what it advertises) and the world (weather, slips, ropes). HF decides and voices. The game never writes a refusal. Where HF lacks a faculty, the host does not fake it; see `hf-requests.md`.
- **Leader pace.** Going up, you wait mid-leg when the nearest person behind falls out of earshot. That is the player's own body, kept in the host.

## Deferred (with targets)
- Send ahead / scout a crossing as verbs: after first reviewer feedback (target 2026-10-25).
- Camp conversation via Workers AI with caps, kill switch and labelled fallback: after the core is judged fun (target 2026-11-01).
- Sheet height stays fixed so the camera does not jump when panels change: polish pass (2026-10-21).
- Wake lock and fullscreen on start: polish pass (2026-10-21).
- Colliding wants surfaced as short exchanges between members (Nell's call against Oskar's top), and two or three set-piece cruxes per peak with a visible storm clock: from the owner playtest consult 2026-10-18 (target 2026-10-28).
- Late playtest polish (docs/playtests/latecasual-2026-10-18.md): stale bubbles after a new call, feedback for far take-pack, tutorial clipping and repeat at 360 px, name chips off the edge: polish pass (target 2026-10-21). Mood word saturation ("tired" on all by 08:53): next retune (target 2026-10-25).
