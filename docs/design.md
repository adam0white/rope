# Design notes

- **Renderer: PixiJS 8.22.0**, because the scene is many redrawn ink strokes per frame (wobbly lines, hatching, stick figures) and Pixi's retained Graphics on WebGL does that cheaply on phones, without Phaser's game framework we do not need (no physics, scenes or asset pipeline).
- **inkjs: not used.** Every line people say comes from HF verdicts; story beats are short data lines in `src/sim/mountain.ts`. A branching script engine would compete with HF for who speaks.
- **Host versus HF.** The host builds honest offers (what a leg costs, how risky it is now, what it advertises) and the world (weather, slips, ropes). HF decides and voices. The game never writes a refusal. Where HF lacks a faculty, the host does not fake it; see `hf-requests.md`.
- **Leader pace.** Going up, you wait mid-leg when the nearest person behind falls out of earshot. That is the player's own body, kept in the host.

## Current source authority (2026-10-27)

[HANDOFF.md](../HANDOFF.md) records exact delivery through `ba0cbc4`, source/main CI, clean live manifest and qualified receipts. Public controls (`1c2fed8`), complete source archive retention (`78170c1`) and public file-entry/SDK preservation (`ba0cbc4`) are delivered. HF remains3.0.0/engine2.23.0; client0.4.15/kit0.5.17. Historical optional/query-gated wording does not govern ordinary current gameplay. Source delivery and synthetic compatibility do not establish owner-profile safety, publication/admission/claim, receipt/ACK, ingestion or player feel.

## Receiving integrity and enlarged text (2026-10-27)

The ba0cbc4 reproduction admitted a rechecksummed receiving claim with replaced inherited limitations while parent and complete state stayed unchanged. Current source compares the complete SDK15 parent-to-claim transformation, including all inherited fields. Actual public-SDK valid claims and supported historical/current Commonstead sources retain exact replay; false claims refuse. Actual built-App rejection preserves the whole previous run/source packet, valid retry retains the original limitations and bytes, and compact JSON-wrapper reimport remains exact.

The pre-repair actual App let per-element font2x clock/status text cross the fixed header at360×690 and1280×800. Current source gives full wrapped context and stable status space their actual rows, uses stable clock digits, and measures the top boundary for overlays. Actual App normal/font2x controls retain full answer text and its scroll-reachable final line, with stable map/leader rectangles as clock/status words vary. Separate actual file-page root16/root32 checks pass complete retained export and real nonzero-notice/Resume reachability at both sizes. Neither font control is native page zoom or a whole-game/player acceptance result. Exact RED/GREEN and delivery receipts are under `~/code/.lab-scratch/games-deferred/gd-resume-goodhands-rope-closeout-rope-`.

## Deferred (with targets)

- **Source-owner contract/runtime evidence, review2026-11-03:** SDK15 publishes prepare/put helpers but no exact owned-departure/receiver-ACK binding. Finite native Rope/Commonstead Oskar admission is present; unsupported dialects cannot borrow provenance. Actual owner-profile/active-SW preservation, live ownership/claim, stored ACK/retirement and ingestion remain unproved and distinct. No owner/profile/queue actions are authorized here.

- Adam accepts feel and readiness on 2026-11-03. His exact old screen/page sequence for `r-4sha5x28jz` remains unavailable: the export contains no navigation log. Existing ending and journal-return regressions cover the reproduced trap; they cannot reconstruct unseen navigation. Source: owner report 2026-10-20.
- Camp conversation through Workers AI waits for actual owner/player judgment that the core is fun (input gate, review 2026-11-03). Inference is off. The labelled deterministic journal fallback runs without a network request. The existing Worker cap, kill switch and $5 total budget remain for any later authorized prototype. This task makes no model calls.
- Named owner acceptance journeys (opening answers, approaches, pair meetings, phone reading, pacing and carried Commonstead Oskar) remain acceptance work on 2026-11-03. Existing implementations and engineering controls do not establish Adam's judgment. No new player round is part of this task.

- HF4 sampling on 2026-10-29 includes the unchanged 36-climb script and one complete game/public HF replay on `3aded8c` (HF 4.12.0). The focused position and roped-company controls were run earlier on `9f17680` (HF 4.8.1). [Results and limits](hf4-sampling-2026-10-29.md). This engineering sample is not Adam’s acceptance or a difficulty guarantee. Repeat after a relevant engine or mechanics change; HF3 calibration remains historical.

- **LIGHT 2026-10-30 panel (F-2226–F-2237), source candidate; Adam accepts feel on 2026-11-03 (pace taste F-2235 on 2026-11-10).** Built here: walk-to control for a fall, topic and deferral answers, attention words, Skip windows, distinct more labels, movement words on the people row (details in the section below). Deferred with a reason and a date:
  - F-2235 pace of long quiet stretches: owner/player taste, review 2026-11-10. One cold player likes slow watching and others quit early; no timing defect is established, so the clock, agency and difficulty are unchanged.
  - F-2236 clock jump during the menu: lab calibration C14 only. The 49-second snapshot preceded it and no human-speed 1–3 s reproduction exists; no game clock change. Target 2026-11-10 in the lab.
  - Phone dock clipping (F-2231) and the phone hint for Lead on: browser-unverified. No browser or test server was used, and the pointer cause is unproved. A real phone check at 360×690 belongs to the retest after this source is delivered, target 2026-11-03.
  - Skip stop reasons (F-2234/F-2237), narrowed: a stop caused by someone leaving or returning earshot, food running out, or a rope-up pair opening or closing now names who, from the public facts before and after the minute. The controls cover those four through the visible pace line (hearing and both pair directions through native frames). Not covered, and not claimed: a stop for any other change in the stamp (a delivered line, a fall, a turn, dusk, someone reaching the hut) shows no extra reason beyond the line or call itself, and no test claims every possible future stop is named. The reason is written as the cause of the last stop (one "Skip stopped:" prefix, hearing in the chip's words, past tense for pairs and the hut), not a state that lasts for its 30 game minutes. The Skip help names only the two people asked to rope up, and the Lead on note says it also waits at a place on the path (copy only, FIX3, browser-unverified). Someone near the wind-scaled earshot edge can stop Skip repeatedly (real hearing check, not tuned). Target 2026-11-03 for the retest to judge frequency and wording.
  - Phone fold-out (F-2231 trade-off): the weather warning now sits below the controls, so on a short phone sheet it needs a scroll to find. Browser-unverified. Target 2026-11-03.
  - Person-specific deferral wording itself (F-2228): the repeated sentence is HF's recorded deferral naming the person's current job. The host now shows that job and its end time. A genuinely different sentence per request would be an HF phrasebook feature, not host logic; no new HF request is filed because no generic gap is shown beyond `hf-requests.md` item 7.

## LIGHT 2026-10-30 candidate (F-2226–F-2234, F-2237)

All changes are in `src/ui`; `src/sim`, HF pins and the saved format are untouched. For a fixed start, exact input log and engine, replay is the same computation as before. Identical clicks no longer always send identical inputs, though: the fall call's button sends `lead near` where it sent `lead with`, and Skip changes when the player's next input is stamped. So no claim is made that every resulting export or full-state hash is unchanged, and no new fixed-hash comparison was run. Existing replay tests stay green and the new tests export, replay and apply a real next input. Two existing tests changed for label growth only: `clarity.test.ts` (button name) and `request-result.test.ts` (chip prefix match).

- **Fall call.** `go to him` used the earshot _follow_, which stops at 35% of earshot or when altitude is within 4 m, while the call stays open until the leader is within 40 m. The call bar now offers `walk to <name>`, the existing explicit approach: only the leader walks, nobody is told to follow, distance and time are the engine's. The people row stays visible during a fall (picking someone shows their requests under the call). The status line names `walk to` only where that button exists and uses real hearing for "You can hear".
- **Topic and action answers.** `ask-life` now has its own result: the topic, the person's recorded verdict and words, and the recorded talk once it lands in the journal, otherwise "not finished" or "no words recorded". A deferral shows the person's recorded current job and its end time, and says when the same words were already given for another request. No sentence is invented; no state is written.
- **Attention.** The pace line names the actual holder (a fall, the promised hour, a request to go down, or why the leader stopped). The Skip button states what it stops for.
- **Skip.** The stop stamp also changes when someone enters or leaves earshot, food runs out, or an asked-for rope-up pair comes within 40 m. Stamp equality also stops Skip when someone comes back into earshot. The stamp from before a whole minute is kept until that minute completes, because HF can yield mid-minute after positions have already moved; any input, Skip start, cancel (a tap on the scene or sheet, or choosing a pace in the menu) or new session clears it. The stop is named from the public facts before and after (who left or returned earshot, who ran out of food, which pair can rope up or has moved apart, who is now at the hut or tied), on the pace line until the player acts or half an hour passes; a call that needs the player still names itself after the reading pause. Skip is not an input. It does change when the next input is stamped, so exports differ from a run without Skip.
- **Sheet refresh.** The conditional refresh key includes the words each chip shows (movement, relative position, hearing), the journal length, unheard requests, and each person's recorded request and current job, so a chip or result panel is not left stale inside an hour.
- **Hint order (F-2229, examined, not changed).** `nextNote` shows the insist note before the Lead on note when an early refusal exists, and that note is what unlocks Insist. Lead on follows while the player has not yet led. Reordering would delay the Insist unlock (an existing test shows it), so it was left. Whether this ordering hid Tessa's phone hint is unproved; the wording of both notes now says plainly what Lead on and Stay with them do.
- **Phone.** The two `more` buttons read `more requests` and `more moves`; the weather warning folds out below the controls; the sheet clears the dock by a margin. CSS effect is unverified in a browser.
- **Movement words.** Each person's chip shows ↑, ↓ or · for walking up, walking down or not walking, and above, below or level. The accessible name carries the full sentence. These are observed movement and position only; chip height on a phone is browser-unverified.
- **Teaching text.** The Lead on and Stay with them notes say what each does. A rope-up refusal explains what the request needs, and a request to go down from the hut says there is no path down.

Where an actual HF refusal is possible: every verdict still comes from HF resolution events. None of these changes grants, forces or hides a verdict. New wording does not alter any recorded line.

## Automatic completed-climb histories (2026-10-28)

Design decision: a completed native climb automatically attempts to save eligible browser histories. It uses the existing checkpoint validation, source retention and compare-and-set publication path. This removes reliance on hiding or closing the page. It does not end anyone’s goals or invent a departure verdict.

The next-climb action waits for the outstanding attempt before changing the climb. End-of-climb, hidden-page and next-climb triggers share one attempt for an unchanged completed state. A real request to end a person’s trip changes that state and permits a new attempt. Waiting copy describes the attempt, not successful publication. Refusals remain in continuity status. Disabled browser histories skip the attempt; an already outstanding attempt still settles before navigation. File play cannot publish. A stale result cannot advance a replacement climb.

Public pacing, export and file entry remain in the ordinary menu. Cast controls stay on the central shelf. Debug starts collapsed beside Lab privacy. Native legacy admission remains limited to supported Rope and Commonstead Oskar histories; it is not a claim that every shared history can enter.

## Public mountain plans (2026-10-27)

The ordinary hut start records `field-rules` with HF bodily needs enabled. There is no feature choice. Old inputs and starts keep their recorded behavior; upgrades do not rewrite admitted Person snapshots. Logged rules persist into later climbs. Complete current exports replay exactly.

In this path, **Scout crossing** asks one person through HF to cross the next connected leg. The offer carries its actual travel duration, effort, fall risk and descent forecast. A refusal or delay does not produce a report. Only completing the crossing stores an observation, stamped with its time. The leader receives it only within hearing range; the words warn that conditions can change. Recorded observations retain their time and source. A newer report replaces older tellable knowledge, while an older delayed report cannot erase a newer direct observation. A report describes the leg crossed, not hidden future weather. The original `ahead` and leader scouting tapes retain their existing behavior.

**Send** in a company call first offers the helper a real route to the asker's recorded meeting position. The asker remains free to move or leave. The mission retains its original HF assent, exact input, target and begun activity; refusal, replacement or expiry prevents an old mission from resuming. Reaching an empty meeting position does not satisfy the call. A reached helper gets a further HF choice about going down. Only actual nearby descent can answer the company call; it does not tie a rope. The old `escort` input retains its original continuation.

Three authored crux locations per mountain describe existing ground and existing choices. A climb encounters two or three according to its route. Route and weather details retain the risks of loose rock, exposed ridges, ice, fatigue and time spent securing a rope. The broad 11:00–14:00 wind window is labelled an estimate and appears only after visible cloud is known. After that window passes the warning says so and describes current observed wind. It never displays the seeded storm onset or promises a safe deadline. Terrain and physical difficulty are unchanged.

Nearby conflicting plans quote only answers and calls that were actually spoken. Both people receive those heard utterances as percepts. Their private goals are never quoted as knowledge. Further decisions remain HF's.

Stepping aside uses released HF `enableBladder`, intake through actual completed water outcomes, `voidsBladder` offers and `Outcome.voidedBladder` only after completion. Settled footing and an untied person are required. HF owns filling, urgency and choice; the host has no generic urge clock or pain-relief substitute. Valley rest includes an actual toilet offer only for actors with the recorded bodily state. The new leader-promise response uses released `noteVoicePromise` for the leader's own kept/broken turn-time promise. Old editions retain their exact host trust step. Scope/control: `scripts/field-control.ts`.

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

## Delivered public controls and continuity (2026-10-27, `1c2fed8`)

Pace controls are public. Run diagnostics start collapsed beside Lab privacy. Cast inspection and experiments link to the central shelf. Fresh seasons enable the released persona channel before preparing the cast transactionally. Claims, parent checks, source admission and cancellation remain in the released contracts. Loaded seasons retain pinned actors. The old cast panel and its alternate import handler are removed; imports use the separate file session.

HF stays at 3.0.0. Camp inference remains input-gated. There is no model call in this batch. Owner acceptance remains separate from engineering checks.


## HF4 port decisions (2026-10-28, candidate)

HF4.8.1 replaces HF3 with the public Run protocol. The canonical cast, mountain geometry, deterministic keyed world randomness and real physical outcomes remain the host's responsibility. HF chooses people’s responses and owns physiology, social learning, memory, active work, agenda and lifecycle. There are no faculty enable flags, alternate person updates or game-local replacements for HF decisions.

Current saves and public playtest exports contain the complete HF Run plus the start, inputs, phase and complete host state. Replay must reproduce the exact saved state on the installed pin. HF3 saves/exports and profile-only portable v1 are deliberately refused. Historical tests and fixtures remain verbatim in docs/history, not re-stamped as current evidence. The fresh season reads public shelf heads automatically, admits supported v2 histories before a single batch claim, and leaves old/occupied/terminal histories unchanged; those roles begin an explicitly new local story and cannot overwrite the skipped histories.

Player-visible condition is an evidence boundary. HF's privileged body and trust truth cannot drive a tired face, a gaze, a fatigue adjective or a private need summary. Show actual movement, received words and dated injuries; state that current condition/trust are unavailable. No substitute physiology was invented. This deliberately changes the drawing and remains subject to Adam's feel acceptance. It relates to broader HF needs G4 but does not block the port.

Complete Run archives are much larger than old person snapshots: the 4.8.1 four-day valley control retains3.78MB HF/4.54MB host state, before the complete season/source envelope. The earlier4.5.3 control retained16.70MB HF/17.46MB host. Native saves therefore use IndexedDB, exact compare-and-swap ownership and a visible paused save. Valley days advance on detached state, one public call per animation frame, with a paused progress message; the old one-minute horizon becomes30minutes only in the valley, preserving all intermediate world requests and actual activity durations. Mountain frames still advance one public call at a time. No fixed phone/worst-case frame-time guarantee is claimed.

Each completed native climb attempts eligible history publication before next-climb navigation. A refused checkpoint is not publication. Asking someone to end a trip performs real costed work and may be refused or unfinished. Complete source envelopes and deduplicated raw full archives survive failed CAS. Native source capacity is128Mi UTF16 units; original file bytes are limited to128MiB, a complete file session to512MiB, JSON depth128/nodes8million, with existing replay/input bounds. Oversize state is refused before file installation/publication; nothing is trimmed. File progress never opens native storage or publishes people.

No real framework blocker is currently established. Supported initial world facts register honest place/group identities for retained history. No HF source was edited. Controls are synthetic technical evidence, not a new player round or Adam's acceptance. Camp remains off with no model spend.


### Shared-person compatibility, 2026-10-28

The current SDK reports that peer games have not certified portable reading for the five Rope people. Rope skips each blocked incoming history and refuses its source projection or terminal write; local climbs remain available. The SDK controls when each peer becomes eligible. This is the existing G2 portable-admission dependency in `docs/hf-requests.md`, not a new framework gap. Recheck peer certification by 2026-11-03.


## HF4.12 phrasebook narration (2026-10-29)

The five climbers each have four authored alternatives for assent, compliance, deferral, modification, refusal and inability. Command uses the assent family. The phrasebooks and reason sentences are supplied in `definitions.lexicon.voices`; HF records its choices and the host displays the inspected `suggestion-resolved` narration. Deferred and modified wording quotes the actual recorded alternative label, which may be a noun phrase. Rope no longer selects text from an event index. HF provides fallback wording for omitted reasons.

Current runs retain the public replay and full-hash controls. Older engine archives follow the existing start-fresh boundary. This source change does not establish Adam’s judgment of feel.
