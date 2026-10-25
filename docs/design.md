# Design notes

- **Renderer: PixiJS 8.22.0**, because the scene is many redrawn ink strokes per frame (wobbly lines, hatching, stick figures) and Pixi's retained Graphics on WebGL does that cheaply on phones, without Phaser's game framework we do not need (no physics, scenes or asset pipeline).
- **inkjs: not used.** Every line people say comes from HF verdicts; story beats are short data lines in `src/sim/mountain.ts`. A branching script engine would compete with HF for who speaks.
- **Host versus HF.** The host builds honest offers (what a leg costs, how risky it is now, what it advertises) and the world (weather, slips, ropes). HF decides and voices. The game never writes a refusal. Where HF lacks a faculty, the host does not fake it; see `hf-requests.md`.
- **Leader pace.** Going up, you wait mid-leg when the nearest person behind falls out of earshot. That is the player's own body, kept in the host.

## Deferred (with targets)

- Adam accepts feel and readiness on 2026-11-03. His exact old screen/page sequence for `r-4sha5x28jz` remains unavailable: the export contains no navigation log. Existing ending and journal-return regressions cover the reproduced trap; they cannot reconstruct unseen navigation. Source: owner report 2026-10-20.
- Camp conversation through Workers AI waits for actual owner/player judgment that the core is fun (input gate, review 2026-11-03). Inference is off. The labelled deterministic journal fallback runs without a network request. The existing Worker cap, kill switch and $5 total budget remain for any later authorized prototype. This task makes no model calls.
- Named owner acceptance journeys (opening answers, approaches, pair meetings, phone reading, pacing and carried Commonstead Oskar) remain acceptance work on 2026-11-03. Existing implementations and engineering controls do not establish Adam's judgment. No new player round is part of this task.

## Explicit new mountain plans (2026-10-25)

The hut offers an unchecked **New mountain plans** choice and a separate optional bodily choice. Choosing either records `field-rules` in the input log. Old inputs, starts and loaded admitted actors acquire no implicit fields or random draws. The initial admitted Person snapshots remain pinned. The explicit choice persists into later climbs in the season. Current full exports replay with the complete semantic history.

In this path, **Scout crossing** asks one person through HF to cross the next connected leg. The offer carries its actual travel duration, effort, fall risk and descent forecast. A refusal or delay does not produce a report. Only completing the crossing stores an observation, stamped with its time. The leader receives it only within hearing range; the words warn that conditions can change. Opted-in observations retain their time and source. A newer report replaces older tellable knowledge, while an older delayed report cannot erase a newer direct observation. A report describes the leg crossed, not hidden future weather. The original `ahead` and leader scouting tapes retain their existing behavior.

**Send** in a company call first offers the helper a real route to the asker's recorded meeting position. The asker remains free to move or leave. The mission retains its original HF assent, exact input, target and begun activity; refusal, replacement or expiry prevents an old mission from resuming. Reaching an empty meeting position does not satisfy the call. A reached helper gets a further HF choice about going down. Only actual nearby descent can answer the company call; it does not tie a rope. The old `escort` input retains its original continuation.

Three authored crux locations per mountain describe existing ground and existing choices. A climb encounters two or three according to its route. Route and weather details retain the risks of loose rock, exposed ridges, ice, fatigue and time spent securing a rope. The broad 11:00–14:00 wind window is labelled an estimate and appears only after visible cloud is known. After that window passes the warning says so and describes current observed wind. It never displays the seeded storm onset or promises a safe deadline. Terrain and physical difficulty are unchanged.

Nearby conflicting plans quote only answers and calls that were actually spoken. Both people receive those heard utterances as percepts. Their private goals are never quoted as knowledge. Further decisions remain HF's.

Optional stepping aside uses released HF `enableBladder`, intake through actual completed water outcomes, `voidsBladder` offers and `Outcome.voidedBladder` only after completion. Settled footing and an untied person are required. HF owns filling, urgency and choice; the host has no generic urge clock or pain-relief substitute. Valley rest includes an actual toilet offer only for actors who opted in. The new leader-promise response uses released `noteVoicePromise` for the leader's own kept/broken turn-time promise. Old editions retain their exact host trust step. Scope/control: `scripts/field-control.ts`.

## Deferred polish reconciliation (2026-10-25)

Asynchronous counterfactual replies are scoped to their climb and page generation; leaving a readback terminates its Worker. A late result cannot populate another climb or a replacement readback. Camp uses no asynchronous model result while the core-fun gate is closed.

Phone target chips wrap full names in three columns. The leader row has a fixed height, so request panels cannot resize the scene. The internally scrolling sheet retains full answers and existing tactical slowdown. Existing new-call bubble clearing, disabled far-pack explanation, close approach and tutorial seen-state remain in place. New-plan unavailable pack answers may name the factual distance after the actual HF refusal.

A controlled seed334144833 morning at08:53 reproduces all five looking tired: HF fatigue is approximately0.60–0.67. This is real exertion after hours of climbing, not a stale or unconditional label. No artificial diversity or easier physiology is introduced; exhaustion still matters. Approximate subjective words and the body drawing stay intact.

Starting from an explicit hut gesture requests supported native wake lock and phone-only fullscreen. Hidden pages release this task's wake lock; returning visible reacquires it. Denied or unsupported APIs keep ordinary play usable. Desktop fullscreen remains an explicit menu action. The immutable client/kit provide no display-session helper, so the host uses feature detection rather than a second platform layer.

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
