# First playable (2026-10-18)

## How to play
1. `npm install && npm run dev`, open the page at phone width (built for 360×780, about 690 px visible).
2. **Begin the season.** Read the hut page, then **Step outside**.
3. The top half is the mountain in side profile; the bottom sheet is what you can do, in thumb reach.
   - Chips pick who you speak to (everyone, or one person). A dashed chip is out of earshot.
   - People verbs: climb on, turn back, rest, eat, wait; later rope up, take pack, share food.
   - Then a force: **ask**, **urge**, later **insist**.
   - "You" verbs: lead on (walks on until the fork, waits when the party drops out of earshot), go down, stop; later tell, promise, fix rope.
4. Each answer comes in seconds as a speech bubble in the person's own words, from HF's verdict. Time slows when someone says no, falls, or a note appears. ◁ ▷ ▷▷ set speed.
5. The day ends when everyone is down, or at 23:00. The debrief replays the climb without each of your inputs in turn and shows the one that changed someone's day most, as one simulated alternative.
6. **On to** the next mountain: three climbs (Hollin Crag, The Tooth, Kestrel Pike). People carry over trust, memory and injuries; valley days between climbs run through HF.

## What is in
- Headless core (`src/sim`): world draws keyed by (place, minute); every person ticked each minute; replay = start JSON + input log. Tests: determinism, prefix identity, two verdict controls (state-dependent verdicts; gully versus ridge at the col), told route knowledge reaching HF consequence evidence, debrief attribution, season export replay.
- Verbs: ask/urge/insist, promise (a turn-back hour, held as an HF agenda commitment, kept or broken against your own turn), tell (route facts as HF received consequences and threats), rope up, take pack, share food, rest/eat/wait, lead/stop/go down, route choice at the fork, fix rope.
- Inner state only as drawing: stride, lean, hunch, limp, gaze toward or away from you, bowed head, ink blot for injury.
- Progressive disclosure: margin notes unlock insist, tell, promise, rope, fix, pack/share when the situation calls for them.
- Implied back story: Ezra, who led for eleven summers, through objects and moments (his map, his chair, Tamar at the col, Bilal's tin, the hut book, his mug). Bilal's dusk prayer is a journal line only.
- Journal page, playtest export (seed, start, input log, final state), save/resume in localStorage (start + inputs), PWA manifest and service worker (offline after first load).

## What is not (yet)
- Not deployed. `wrangler.jsonc` and the custom domain come in step 4.
- No "send ahead" verb and no scouting a crossing as a distinct action (the leader walking ahead and waiting is the nearest thing).
- Workers AI camp voice: not built (by plan, only after the core is fun). Spend $0.00.
- Not playtested by a person. Tuning is from 12-seed scripted runs only (docs/findings.md).
- Sound, haptics, wake lock and fullscreen are not wired.
- The debrief sentence is generated from outcome facts; some branches read oddly (see findings).
