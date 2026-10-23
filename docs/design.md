# Design notes

- **Renderer: PixiJS 8.22.0**, because the scene is many redrawn ink strokes per frame (wobbly lines, hatching, stick figures) and Pixi's retained Graphics on WebGL does that cheaply on phones, without Phaser's game framework we do not need (no physics, scenes or asset pipeline).
- **inkjs: not used.** Every line people say comes from HF verdicts; story beats are short data lines in `src/sim/mountain.ts`. A branching script engine would compete with HF for who speaks.
- **Host versus HF.** The host builds honest offers (what a leg costs, how risky it is now, what it advertises) and the world (weather, slips, ropes). HF decides and voices. The game never writes a refusal. Where HF lacks a faculty, the host does not fake it; see `hf-requests.md`.
- **Leader pace.** Going up, you wait mid-leg when the nearest person behind falls out of earshot. That is the player's own body, kept in the host.

## Deferred (with targets)
- Confirm the exact screen and page-navigation sequence behind owner run `r-4sha5x28jz`; the replay ends correctly and a journal-return trap is fixed, but the export has no navigation log (target 2026-10-21).
- Scope asynchronous debrief Worker replies to their originating climb so a slow reply cannot populate a later read-back; found during transition review, predates this fix (target 2026-10-25).
- Send ahead / scout a crossing as verbs: after first reviewer feedback (target 2026-10-25).
- Camp conversation via Workers AI with caps, kill switch and labelled fallback: after the core is judged fun (target 2026-11-01).
- Sheet height stays fixed so the camera does not jump when panels change: polish pass (2026-10-21).
- Wake lock and fullscreen on start: polish pass (2026-10-21).
- Colliding wants surfaced as short exchanges between members (Nell's call against Oskar's top), and two or three set-piece cruxes per peak with a visible storm clock: from the owner playtest consult 2026-10-18 (target 2026-10-28).
- Late playtest polish (docs/playtests/latecasual-2026-10-18.md): stale bubbles after a new call, feedback for far take-pack, tutorial repeat at 360 px, name chips off the edge: polish pass (target 2026-10-21). Mood word saturation ("tired" on all by 08:53): next retune (target 2026-10-25).


## Legacy export narration (2026-10-20)

Host decision rules and narration have separate versions. Narrator 1 preserves the original HF words and the original escort journal sentence. Narrator 2 adds known refusal causes. Narrator 3 also distinguishes walking toward a distant person from walking together, and says a rope exists only when one was tied. Host rules 2 imply narrator 3; new games keep the current words and decisions.

The two rules-1 owner exports predate saved narration metadata. Their start states do not identify which narrator produced them. `replayExport` uses known narration evidence in the saved lines and journal to choose a version, then regenerates the entire state from the start and inputs at the saved minute. It never copies saved prose into the result. Tests compare the complete saved JSON state for both unchanged exports. The owner-night full-state hash still covers current rules.

`replayExport` reconstructs a saved snapshot. Its result preserves the original JSON shape, including absent version fields; it is not a continuation API for unversioned legacy snapshots. For an unversioned start, `replay` alone defaults to narrator 1. A caller replaying a known later legacy narrator must pass the explicit narration version. No fixture was rewritten.

## Explicit approaches and pair meetings (2026-10-20)

New UI walks to an individual use `lead near`, which reaches within helping distance. The old `lead with` input retains its original earshot stopping rule for exact replay. It remains the party-follow input. Existing logs, start states and JSON shapes do not acquire new defaults or version fields.

`gather` is a new spoken request to both named people. HF resolves each answer. The host offers travel to the first person's fixed position and a finite wait, with travel effort, footing risk and exposure while waiting. A refusal or deferral does not execute that person's plan. Accepted travel follows connected trail segments, preserves partial-leg positions and records real endpoint arrivals. A short approach downhill does not count as turning home. Roping up remains a separate two-person HF request.

The optional leader `near` and member `gather` fields arise only from these new inputs. Legacy owner exports, the owner-night hash and a pre-change rules-2 individual-follow hash guard exact old replay. New-input tests compare the complete replayed state. UI distance and ETA are approximate, refer to game minutes and assume the target stays in place; a moving target is named as such. None of this changes the clock playback rate.

## Owner automatic pacing update (2026-10-21)
The speed chooser is removed. Quiet travel runs briskly, every delivered event stops the current batch for reading, and active calls run slowly. Composing a request or opening a page/menu holds time. “Until something happens” replaces the nightfall shortcut only when the descent is quiet and no reading or call is pending; it stops at the first new word, injury, arrival, promise or tutorial. Information buttons retain the season and hut background. Completed-climb and closed-season totals are always computed and hidden until “See tally”. Simulation inputs, saves and replay remain unchanged. Adam accepts feel.

## Approved UI sweep (2026-10-22)
The UI follows the lab layout grammar: a single top bar, daylight strip, mountain, internally scrolling sheet, and pinned leader actions. Pending hurt and promised-hour calls take over the sheet. Company requests appear as a banner. The menu contains the journal, pacing, Send word, full screen, title and lab links, recording control, and return action. Automatic pacing is the default; optional Slow, Steady and Fast overrides live in the menu. Skip ⏩ runs unchanged simulation minutes and stops for decisions, physical events, guidance, dusk, or two elapsed game hours. Ambient journal words do not stop it.

Send word uses lab-client 0.2.1. It respects an explicit recording opt-out, requires consent for an unlinked run under a browser privacy signal, and remembers an optional submitted name under `hf-lab-feedback-name`. Downloads retain the existing playtest export. The simulation, HF 2.8.0 pin, save shape and replay rules remain unchanged. Adam accepts feel after retesting.
