# Findings

- 2026-10-18. Without a voice, nobody climbed: climb legs did not advance the summit goal. Fixed by advancing the summit goal by `climb` too, and adding a belonging term for following the leader.
- 2026-10-18. Nobody came down from the summit until the host adopted an HF goal "get down safely" on summiting or turning. Sized 1/legs-left; a fixed 0.25 completed it one leg early.
- 2026-10-18. The leader outpaced the party and almost every word went unheard (in 12 scripted days, the only answered words were the first ask). Fixed: the leader waits when the nearest person behind is out of earshot.
- 2026-10-18. With a sensible plan (turn at 12:00), 12 scripted days produced **zero** refusals in 106 answers: people objected only when the plan went against them (turning at 09:00: 23 non-assents; forcing the gully: 21). Objections are natural, not frequent; a player who only follows the party never meets one. Open question for playtests.
- 2026-10-18. Ask, urge and insist gave identical outcomes in those scripted runs, because people already wanted what was asked.
- 2026-10-18. Tamar's gully memory (a threat percept from the col beat) did **not** change the col control result when removed; the gully's own risk drives her deferral. Kept as story; its HF effect is unproven.
- 2026-10-18. Injuries: 18 of 60 person-days hurt before tuning; slip rate scaled by 0.6, now 14 of 60. Still high; deliberate ("naturally hard"), to revisit after playtests.
- 2026-10-18. One debrief branch read "Had you not turned back yourself at the summit, Bilal would have turned back at the last scramble": true to the replay (your descent changed whom he followed) but hard to read.

## Second pass (2026-10-18): people who disagree
- Aims added as HF state, per climb: Nell's promise to her mother (an HF commitment to descend from five hours before dusk), Bilal's goal to leave Ezra's tin on the top (HF goal, importance 0.85). Wren's pride lives in the host offer: turning first costs her esteem until someone else has turned.
- Harder day: legs ×1.3, storm 11:00–14:00 at strength 0.6–1.0, lateness danger from 12:00, and four hours before dusk everyone adopts "get down safely" (the light going is visible to all). "Home" now means down by dusk + 45 minutes of twilight.
- The scripted leader had stopped turning back at all after "lead on" began walking on by itself; the old "zero refusals" figure partly measured that script bug. With an attentive script (turn at 12:00, repeat the call to anyone in earshot), 12 days: asking gives 30 non-assents in 150 answers (Tamar 13, Nell 17), insisting gives none and brings 39 of 60 home versus 35. Turning at 13:00: 5 non-assents, 38 home.
- Earshot was the hidden gate: 260 m halved by wind meant the call to turn rarely reached anyone past the fork. Now 400 m, reduced by up to 35% in wind.
- Force: asking at the col to turn gets deferrals; insisting gets assent; insisting repeatedly costs trust through HF (control tests). In play, a trust drop shows as "(she looks away)" on the bubble and a protested yes gets a heavy rope-coloured border.
- Tamar's gully memory was not causal (removing it changed nothing), so it is dropped from HF; the col beat stays as a story line only.
- The fork splits the party on its own: Oskar and Wren often take the gully while others wait at the col. Kept: it is HF choice and a real leader problem.
- Injuries: 12–16 of 60 person-days. They come from exposure, wind and afternoon sun on real legs, so they read as earned; left as is.
- Debrief sentences now read "If you hadn't … at … (time), X would have …. Instead, she …".

## Retune of The Tooth and Kestrel (2026-10-18)
12 scripted fresh parties per mountain, attentive leader, asking.
- The Tooth, as is: first top about 13:08; 46–51 of 60 down by dark; 10–13 hurt. Left alone: the right step up from Hollin.
- Kestrel before: first top 15:06, 7–10 of 60 on top, 16–38 down, 20–23 hurt, injuries spread across the morning glacier as well as the afternoon wall. Too punishing, and the morning falls read as arbitrary.
- Kestrel after (legs shortened, lower-glacier and wall footing eased): turning at 12:00, first top 13:16, 28 on top, 32 down, 20 hurt, now mostly on the ice wall and the summit ridge after 11:00, when sun and wind are on them. Kept hard on purpose as the finale; roping and fixed ropes (unused by the script) are the answer to it.
- Nell now refuses from her own HF promise (reason `commitment:c1`), and the person quotes the HF commitment's label: "… I promised: down before dark, as I told Mum."

## Camp voice: 1B against 8B (2026-10-18)
Three fixed records (seeds 1, 4, 7 on Hollin, turning at 11:00, 13:00, 15:00), same prompt. Llama 3.2 1B wrote "Hollin: said." five times, spoke as the mountain, and invented a person ("Ezra"). Llama 3.1 8B (fp8-fast) spoke only as the party and drew on real records (the gully against the ridge, Nell's call to her mother), though it still embroiders blame ("I told you the moraine was loose"). Kept 8B. The label says the talk is a model's and changes nothing.

## HF 2.5.0, forecast and voices (2026-10-18)
- Upgraded to HF 2.5.0. Every climb offer declares `followedBy` the way back to the hut (all legs climbed plus this one, at descent pace). In a 12-seed probe on Kestrel, `forecast:body` never became the top reason for a refusal; it shifts utilities. Hollin, script asking, 12 seeds, after all of today's changes: turning at 11:00, 62 of 228 answers disagree, 0 on top, 60 down by dark; at 12:00, 33 of 171, 24 on top, 40 down; at 13:00, 4 of 144, 24 on top, 42 down. Disagreement at 12:00 holds (30 of 149 before). Separated by switching each off (HF 2.6.0, fatigue store on): the 11:00 drop to 0 summits is entirely the forecast; without it 22 summit after the leader turned and only 26 are down by dark; the ask-for-company rule changes nothing there. When a person refuses or defers a climb for a need, goal or promise, they add HF's own forecast line ("I can do it, but I'll be too thirsty for the descent.").
- HF's deferral template repeated across people ("After I climb the snow to the col, then I will." 22 times in 24 runs). src/sim/voice.ts now phrases HF's answer per person, keeping the act, verdict and reason; the variant is hashed from seed, person and minute so replay is exact.
- Carry-over control (test/season.test.ts, three climbs): HF voice trust carries exactly into the next climb; climb 2 opened on "Oskar, Nell and Wren spent the night out…" and "Wren was still hurt from the gully, and came anyway."
- Lone descents: 12 seeds, script turning at 15:00, 32 asks for company, 22 went alone after 45 minutes unanswered (the script never answers).
- Kestrel with a careful scripted leader (test/careful.test.ts: two rope pairs asked at the hut, a rope fixed on every fixable leg, turning at 12:00, 12 seeds): 24 on top, 36 down by dark, 7 hurt, against 21 / 39 / 17 for the plain script. Fixing was impossible before: the leader auto-walked through every place, so the walk-on now stops below an unfixed fixable leg. Roping was broken: the rope offer existed only once the request was pending, after HF had already answered "isn't on offer" (fixed; the request now goes to both people). Roped partners now weigh going where the other goes (belonging ±0.3); one rope in 12 still came off.

## HF 2.6.0 fatigue store (2026-10-18)
- Opted in (`enable.fatigueStore`). Mean end-of-day depletion about 0.26–0.32. With Kestrel's old leg efforts, summits at a 12:00 turn fell from 21 to 4 of 60; leg efforts eased by 0.1 (glacier 0.5, upper glacier 0.6, wall 0.75, ridge 0.65): 22 on top, 34 down by dark, 13 hurt, 51 of 213 answers disagree. Hollin at 12:00: 20 on top, 36 down, 22 of 151 disagree.
- Escort, 12 seeds, sending the first person in earshot when Nell asks: 4 of 4 sent pairs went down roped together, no repeat asks, both home. In 8 of 12 seeds nobody was in the leader's earshot when she asked, so she went alone after 45 minutes; the player would have to walk back to answer.
- Rope pairs split in all 12 careful runs, about 08:00 on the glacier: one partner stops to rest and HF keeps them resting even when a tug on the rope makes them decide again. The journal now says so ("Tamar stayed where she was; Nell untied and went on.").
- Controls re-seeded after the fatigue store: the col controls use seed 2 (seed 1 now has everyone agree to turn); the plain-day control expects 3 of 5 down by dark, the rate on every seed 1–12 at a 13:00 turn.

## Resume after the end of the day (2026-10-18)

Fable reported that resuming after a climb ended showed a dead map with no read-back. I could not reproduce this on the build deployed on 2026-10-18. A finished save loaded in the browser opens the stamp, then the read-back with "On to The Tooth". `test/resume.test.ts` checks that a save taken mid-ending replays to the same finished climb. The cause of Fable's dead map is unknown. One suspect is the older build it played (its footer said HF 2.5.0), but that is not confirmed.

## Out-of-earshot asking (2026-10-18)

When a member asks for company and nobody is in earshot, the player now sees a faint bar ("X is calling from below, too far to make out"). When the caller is below, the bar offers "go back to her/him". This is the answer to the out-of-earshot asking problem. The game does not move the request into earshot or speak for anyone.

## Fable fixes, items 3 to 6 (2026-10-18)

- **Leading.** "Lead on" now keeps to the pace of the last member still climbing. The leader waits when that member falls past 0.6 of earshot. Before, the leader waited only once nobody at all was near. There is a new "stay with them" order, and "walk to <name>" when someone is picked (`lead` input `dir: 'with'`). Both walk along the legs toward that person, or toward the middle of the party. Control: `test/follow.test.ts`.
- **Far events.** A fall, slip, untie or summit by someone out of earshot appears as a margin note starting "Far off:". The camera frames the leader and everyone still out, and the leader always stays in frame. There is no zoom, so a widely spread party can still run off-screen.
- **Early warnings and voices.** HF's verdicts are unchanged. A yes now carries HF's body forecast when it warns ("but", "though"), so the warning comes while turning is still cheap. Generic yeses get per-person voices; a yes that carries a reason keeps HF's words. "We all turn" now also urges everyone down (bubbles and a journal line). Turning in earshot answers a pending request for company, so the bar closes.
- **Layout and save.** With a prompt open, the you row sits above the prompt. Bubbles avoid the margin note, and the note is opaque over the weather ink. Rope-up asks for ask, urge or insist after the second pick. The save no longer stores the climb start twice: about 25 KB instead of about 51 KB on climb 1.

## Outcomes under the party-pace rule (2026-10-18)

Measured with the script asking, a 12:00 turn, 12 seeds per peak, HF 2.6.0 with the fatigue store on. The counts are people summed over 12 seeds, out of 60. "Before" is the same build with the old wait rule put back.

| Peak | Party pace (now) | Old wait rule |
|---|---|---|
| Hollin | 7 on top, 46 down by dark, 12 hurt, 32 of 173 answers disagree | 20 on top, 36 down, 14 hurt, 0 of 129 |
| Tooth | 23 on top, 35 down, 14 hurt, 0 of 129 | 1 on top, 57 down, 12 hurt, 11 of 222 |
| Kestrel | 22 on top, 37 down, 15 hurt, 0 of 147 | 19 on top, 37 down, 12 hurt, 38 of 203 |

The pace rule moves outcomes a lot. Waiting for the last climber keeps Hollin's party lower at noon, so fewer reach the top and more are down by dark. On Tooth and Kestrel, answers that disagree drop to none. My guess is that the waits act as rests, so nobody is asked on while worn out. I have not checked that. The "0 of 129" for both Hollin-old and Tooth-new looks like a coincidence; I have not explained it. Kestrel losing its disagreement is a design problem: the hardest peak should produce some noes. Recommendation: check this in the next playtest before retuning. If it holds, the leader's waits could count as standing, not resting, or Kestrel's efforts could go back up.

## Root cause of the zero noes, and pacing (2026-10-18, later)

- **The "waits act as rests" guess was wrong.** At the 12:00 turn, mean fatigue and altitude match under both pace rules: Kestrel 0.63 old against 0.64 new, Tooth 0.65 against 0.66, Hollin 0.71 against 0.72. I built no cold-standing rule.
- **Cause.** Waiting for the very last climber made the leader the sweeper. On Kestrel seed 1 the leader was still at the lake at 12:00, 2.4 km and 800 m below Tamar. The turn reached only the back of the party, and the script repeats the call only to people in earshot. Nobody who cannot hear the call can say no to it. Oskar, Wren and Tamar went on, unasked. The old run's 38 Kestrel deferrals were mostly the same holdouts deferring the same call every 15 minutes, because the old leader happened to be beside them. Summits barely changed (19 old, 22 new), so the friction was still there; the answer count missed it.
- **Fixes.**
  - The leader leads from the middle: it waits when half or more of those still climbing are out of easy earshot behind.
  - Walking up to fetch someone does not undo a turn.
  - The party-pace wait does not apply while following someone.
  - The test script now walks up to holdouts out of earshot and asks them in person.
  - A story beat about one person waits for that person: on Kestrel, Bilal's tin opened on the top while Bilal was down on the moraine.
- **I reverted two knobs that moved nothing:** Nell's promise window tied to the descent time, and a belonging cost for climbing out of the leader's earshot. Choices people make on their own produce no answer lines, so the answer count could not show the second one either way.
- **New friction count.** "Summited after the turn" counts people who reached the top after the leader turned.

| Peak (12 seeds, 12:00 turn, script fetches holdouts) | On top | Down by dark | Hurt | Answers that disagree | Summited after the turn |
|---|---|---|---|---|---|
| Hollin | 4 | 52 | 15 | 37 of 202 | 4 |
| Tooth | 1 | 56 | 14 | 20 of 228 | 1 |
| Kestrel | 20 | 40 | 13 | 23 of 198 | 20 |

Without the fetch, the disagreeing answers are 21, 20 and 12. Kestrel has the most friction overall: 43 disagreements plus people going on, against 41 on Hollin and 21 on Tooth. It does not yet have the most disagreeing answers; Hollin's come from its tight day and Nell's promise. This target is not fully met.

- **Pacing.** The clock was already on target: normal runs at 0.8 game minutes per real second, 48 per real minute, and fast is three times that. In the browser at normal speed I measured 8 game minutes per 10 real seconds. `test/pacing.test.ts` models a scripted climb, counting slowdowns: Hollin 21.7, Tooth 18.8 and Kestrel 24.0 real minutes. Notes and story lines now slow the clock for 2.5 s instead of 7 s (`src/ui/pace.ts`). The earlier "27 game minutes in 40 s on fast" was the start of climb 1, slowed by intro story lines and notes. A hidden browser pane may also have throttled it; that is not confirmed.

## First-time playtest fixes (2026-10-18, evening)

- **A skipped leg on the way down.** A leg turned back on halfway was popped off the path as if it had been climbed. The next descent then skipped a whole leg: on Kestrel seed 1, Wren went from the ice wall to the glacier, dropping 413 m in 15 minutes. That made the dots disagree with the journal. Fixed: only a completed leg comes off the path, for members and the leader. Regression test: `test/positions.test.ts`, no one moves more than 40 m a minute, on 3 peaks with 12 seeds each.
- **Slow descents.** A spent person also crawled down, up to 2.9 times slower, because the climbing pace curve was used for the descent too. Going down now uses a softer curve, at worst about 1.7 times slower. Oskar's Kestrel descent from the top went from 8.5 hours to 7.3.
- **The first hour.**
  - Some mornings Wren leaves without breakfast. Her starting satiety is seeded from 0.3 to 0.75, and the journal says so when it is low. HF then defers her first "climb on" in 3 of 12 Hollin seeds ("Not till I eat something.").
  - Each peak has six approach lines, one every half hour after the introductions.
  - After 20 quiet game minutes the margin suggests fast-forward.
- **Readable state.**
  - Posture is exaggerated: stride, lean and hunch respond more strongly.
  - Cold hatching starts at a lower cold.
  - Each chip carries one handwritten mood word, such as "tired", "spent", "scared", "cold", "hurting", "low" or "keen", chosen from HF's state. No numbers are shown.
- **Layout.**
  - The margin note is a fixed strip between the top bar and the map, so it no longer covers the map or bubbles, and the map never jumps when a note arrives.
  - The sheet takes 46% of the height.
  - Once a row has six or more verbs, verbs sit five to a row.
  - With everything unlocked, every verb is above the fold at 360×780, before and after picking someone.
- **The console error on load** is Cloudflare Web Analytics' injected beacon, `static.cloudflareinsights.com/beacon.min.js`, failing with net::ERR_FAILED in the test browser. The CSP allows it, and the server answers 200 with `access-control-allow-origin: *`. So the browser side (blocking or sandbox) is the likely cause; I have not confirmed this. The game's own code logs no errors. To remove the error, turn off automatic Web Analytics injection for rope.adamwhite.work.

### Re-measured after the path and descent fixes (2026-10-18, late)

| Peak (12 seeds, 12:00 turn, script fetches holdouts) | On top | Down by dark | Hurt | Answers that disagree | Summited after the turn |
|---|---|---|---|---|---|
| Hollin | 6 | 51 | 14 | 55 of 222 | 6 |
| Tooth | 1 | 59 | 12 | 22 of 233 | 1 |
| Kestrel | 18 | 42 | 16 | 19 of 191 | 18 |

Generated by `npm run measure` (`scripts/measure.ts`, which states each definition). "Hurt" counts anyone with an injury of severity 0.15 or more. The harness behind the earlier tables was not saved, so those earlier numbers may not compare exactly. Hollin's disagreeing answers rose from 37 to 55; Wren's skipped breakfast accounts for some of that, but I have not separated the causes. Tooth brings nearly everyone down by dark. Kestrel still has fewer disagreeing answers than Hollin.

**Browser pass (360×780, then 780×360, one Hollin climb on fast, then the start of the Tooth):**
- Bubbles faded after 17 game minutes.
- On a new climb the speed was back to normal, and the "Everyone down" stamp was cleared.
- The end-of-day summary read "on the snow slope below the col".
- At dawn the mood words were "keen" for Nell and Bilal and blank for the rest; nobody read "cold".
- By 08:20 every chip read "tired" or "spent", so the word told the player nothing. Fixed: "tired" now needs fatigue above about 0.57, and "spent" above 0.8.
- Not seen: queued company prompts. Nobody asked for company during this climb, so the queue is still unverified in the browser.
- Landscape: the docked note and the map sit correctly. At 360 tall the sheet still scrolls to reach the last verb row, even with verbs now compact (five to a row, 40 px). The name labels at the hut overlap the "the hut" label. Neither is fixed.
- The only console error locally was `/api/camp` returning 404, which is expected: the Vite dev server runs without the Worker.

## HF 2.8.0 and host rules 2 (2026-10-19)
- Pinned HF 2.8.0 exactly. The bump alone changed nothing: both owner exports and `npm run measure` were identical to 2.6.0.
- Behaviour changes on purpose, only for climbs started after this build (`ClimbState.rules: 2`):
  - `enableFullness` on every person: past comfort, a drink is worth less. Kestrel drink/relieve loop: with nothing asked, 12 seeds x 5 people x 20 hours gave 1185 drinks and 1091 "step aside" on Kestrel (974 and 856 on Hollin); now 337 and 0 (288 and 0).
  - No "step aside" offer. HF reads `relief` as relief from pain and has no bladder, so the offer was a loop with nothing to value. A toilet is not an HF act.
  - Roped partners: offers that go the way the partner is going carry `Affordance.alongside`, and the decision uses `reconsider: true` while the partner is moving. Rope pairs that came apart on Kestrel (careful script, 12 seeds): 12 of 12 before, 2 of 12 now. The "stayed where she was" journal line: 12 before, 0 now. The belonging tug of 0.3 stays.
  - Ordering: the tugger's `mem.move` is now set before the partner is interrupted. This was not the cause: the partner decides on a later step either way, so it changes nothing. The cause was the resting inertia, as HF's triage said.
- Measure, 12 seeds, turning at 12:00 (on top / down by dark / hurt / answers that disagree):

| Peak | Before (2.6.0) | After (2.8.0, rules 2) |
|---|---|---|
| hollin | 6 / 51 / 14 / 55 of 222 | 6 / 51 / 14 / 53 of 219 |
| tooth | 1 / 59 / 12 / 22 of 233 | 1 / 59 / 12 / 23 of 236 |
| kestrel | 18 / 42 / 16 / 19 of 191 | 17 / 43 / 16 / 17 of 189 |

- Old exports: a saved climb has no `rules`, so it replays under rules 1 (fullness is not enabled in its saved people, the step-aside offer stays, no alongside or reconsider) and matches its saved answers. Both owner exports do (`test/rules2.test.ts`). Their journal text was already not identical to the saved text before this change.
- Not done: Kestrel's "Not till I go down the tarn path" is Rope's own template (HF's triage rejected it as an HF change). Tracked in docs/hf-requests.md.

## HF plain narration adoption (2026-10-25)

Pin both the host and lab-client's HF dependency to the published 2.21.0 package. Set the persisted plainEnglish lexicon option where the canonical party is created. Restoring a run must keep its saved narration choice.

An upgrade proof must retain episode records, actions, outcomes, IDs, time, RNG and decisions. The helper in test/hf-narration-proof.ts blanks only spoken replies and pure narration, plus two pin/opt-in metadata fields. It parses known HF intention, outcome and counter-offer wrappers into their legacy form while preserving the full goal, action, outcome status and label payload. Fixed alternatives use finite exact pairs; unknown text remains exact. Mutation controls detect changes to intention payload, outcome-summary payload/status, counter-offer payload, authored memory facts, episode counts, actions, outcome tags, choices and RNG. Parent verification caught an earlier helper that erased these semantic payloads; it was replaced before delivery. Never erase an entire history to make hashes match. Real producer output is required to test a new cross-host engine dialect; changing a fixture's engine header proves nothing.
