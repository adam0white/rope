# Handoff

## Owner playtest round (2026-10-18, night)
- Live: Worker version 6d18e37d-6bce-4c23-901d-fe6b159ffae2, bundle `assets/index-C7ttQYIy.js`. Its sha256 matches dist.
- Owner: "rope was not that fun". Diagnosis and fixes are in docs/playtests/owner-2026-10-18.md; the late playtest is in docs/playtests/latecasual-2026-10-18.md.
- Shipped:
  - a turn-time choice at the hut;
  - refusals that name their cause;
  - leader-halt reasons;
  - a hurt bar;
  - a promised-hour bar;
  - "walk on to nightfall";
  - a promise now settles at its hour.
- Next: the owner replays a climb. The deferred items, with dates, are in docs/design.md.

## State (2026-10-18, end of the Fable fix round)
- **Live:** https://rope.adamwhite.work, Worker version 0e58bbc6-c867-4789-845d-bb11efb383ae, bundle `assets/index-DBYkc7yU.js`. HF is pinned at 2.6.0 exactly, with the fatigue store on. I fetched the bundle after each deploy and found the new strings in it.
- **Committed 2026-10-18** (signing restored). Never `pkill -f`; kill by exact PID.
- **Done this round** (Fable playtest, docs/playtests/fable-2026-10-18.md):
  - one account of the day (`dayAccount`, `hurtLevel`) behind the stamp, chips, read-back and journal, with a 12-seed property test;
  - a resume regression test (the dead map was not reproduced);
  - "lead on" keeps to the party's pace, plus "stay with them" and "walk to <name>";
  - the camera frames the party and eases out to zoom 0.6, and the leader is always in frame;
  - "Far off:" margin notes for falls, slips, unties and summits out of earshot;
  - per-person yes voices, and a warning forecast on a yes;
  - "we all turn" urges everyone down and closes the request for company;
  - the you row sits above prompts, bubbles avoid the note, and the note is opaque;
  - rope-up asks ask, urge or insist, with a label naming the pair;
  - the save no longer stores the climb start twice (about 25 KB).
  - Measurements are in docs/findings.md.
- **Later the same day:** the cause of the zero noes was the leader acting as the sweeper (findings.md, "Root cause of the zero noes, and pacing"). Now:
  - the leader leads from the middle;
  - the test script fetches holdouts;
  - a story beat about one person waits for that person;
  - notes and story lines slow the clock for 2.5 s.
  - Pacing is modelled at 19–24 real minutes per climb (`test/pacing.test.ts`, `src/ui/pace.ts`).
- **First-time playtest round** (docs/playtests/firsttime-2026-10-18.md, findings.md, "First-time playtest fixes"): a skipped-leg descent bug, softer tired descents, an early-hour need and approach lines, a quiet-stretch hint, mood words on chips, a docked note strip, every verb above the fold, queued company prompts, stale bubbles cleared, speed and stamp reset on a new climb, "at"/"on" wording.
- **Next:**
  1. A fresh playtest of this build.
  1b. Re-measured and browser-checked (findings.md, "Re-measured after the path and descent fixes"); mood thresholds raised and landscape verbs compacted, both deployed (deployed as Worker 963c01c8-6ee5-4046-b32f-0e7e8810fd32, bundle assets/index-B5fKaDWR.js). Queued company prompts are still unseen in the browser.
  1a. Owner's call: turn off Cloudflare Web Analytics auto-injection to remove the console error from the beacon.
  2. Kestrel has the most friction counting people who went on past the turn (20), but fewer disagreeing answers than Hollin (23 against 37). Decide whether that is acceptable or whether Kestrel needs more noes on the way up; climb asks are never refused on Tooth or Kestrel.
  3. Hollin summits are low: 4 of 60 at a 12:00 turn.
  4. Commit once signing works, or unsigned if the owner says so.

## Workers AI spend
- Built 2026-10-18: `POST /api/camp` (worker/index.ts), model `@cf/meta/llama-3.1-8b-instruct-fp8-fast` (switched from 3.2-1b the same day), max_tokens 180, input capped at 6 KB.
- Caps, held in isolate memory (no storage, so per isolate, approximate): 6 calls per IP per hour, 100 per day. Kill switch: set `CAMP_AI` to "off" in wrangler.jsonc and deploy. Any refusal or error gives the client's labelled deterministic fallback ("Read from the journal (no model).").
- The model only voices text; the client keeps lines spoken by party names and never reads state from them.
- Worst case, assumed from list pricing (about $0.045/M input, $0.384/M output for the 8B fp8-fast model) and not measured: about 1.2k in + 180 out ≈ $0.00012 per call, so $0.012 per isolate per day at the cap; about $0.12/day even if ten isolates each hit it.
- Estimated spend to date: under $0.01 (a handful of test calls). Estimate per call, assumed from list pricing and not measured: about 1k input + 180 output tokens, well under $0.001. Even every isolate at the daily cap stays far inside the Workers AI free daily allocation. Check the dashboard (AI > Workers AI usage) to confirm actual spend.
