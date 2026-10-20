# Handoff

## F-230 phone and request results (2026-10-20)
- Remaining: Adam accepts feel. A fresh source-unread retest remains unrun.
- Help fits its full reserved strip at 360×690. An empty strip releases space to the mountain. Primary requests and movement stay on the main sheet; extra abilities live in “more actions”, with matching disclosure words and highlights. Outstanding company/hurt/turnback calls have a visible labelled button; opening it shows their original responses.
- Latest-request results sit below controls. Rest names what was accepted. “We all turn” reports the leader’s descent and new urge, actual downhill movement, and the latest HF refusal with its reason. Recorded answers remain available on request; no simulation or replay changes.
- Five new DOM regressions plus touch Chromium renders cover requests, movement, safe areas, pair selection, rest answers and renewed turnaround refusals. Report, screenshots, checks and live release identity: `/Users/abdul/code/human-framework/scratch/followups/rope-report.md`. No Workers AI calls were made.

## F-209 review follow-up (2026-10-20)
- Remaining: Adam accepts feel. Cold-player understanding and the first-action timing protocol remain untested; Rope has no HF-character adapter.
- Rope request feedback now retains both partners’ HF answers, including either refusal, for either pair orientation. A different pair does not inherit their answers. Empty rations no longer disable eating at the hut; the UI cache follows hut availability.
- Speed, journal and note-dismiss buttons have 44×44 minimum hit boxes. Continue names the saved climb, mountain and time.
- Legacy narration is versioned separately from host decisions. Use `replayExport` to reconstruct an old export at its saved minute. The two unchanged owner exports now have full-state equality tests. Unversioned starts alone cannot distinguish releases; see docs/design.md. Current rules-2 replay and the owner-night hash stay unchanged.
- Browser renders, check/deploy logs, live release identity and the finding-by-finding report are in `/Users/abdul/code/human-framework/scratch/clarity/rope-report.md` (Follow-up) and `rope/followup-*`. No Workers AI calls were made.

## F-209 first-minute clarity (2026-10-20)
- Remaining: Adam's feel acceptance stays with Adam. This round implements only the three filed clarity fixes; no HF-character playtest was requested because Rope has no adapter.
- Disabled verbs now show adjacent, readable circumstances, not hover titles. Recorded HF answers persist by request and person, with refusals ahead of grudging yeses. The first actual objection immediately unlocks the existing insist disclosure. Ration, proximity and follow changes invalidate the UI cache.
- Phone request panels show only the target, request and commitment controls. The person strip has an explicit swipe cue and preserves its scroll position. The phone sheet reserves space for replies and safe-area padding; desktop keeps its prior height. Selected chips and speed use ink outlines; the request choices own the accent.
- Mandatory opening story before the first meaningful choice: 136 → 27 words across title and hut. The cut story remains in “More about the season” and “At the hut”. The turnback choices and simulation inputs are unchanged.
- Lab-kit 0.1.0's released stamp replaces the copied release script. Its lockfile integrity matches the common brief. No kit CSS, runtime menu or glossary was imported. HF remains exactly 2.8.0; no sim files changed; Workers AI usage is unchanged.
- Six DOM regressions cover opening copy, disabled reasons and changing food/proximity, compact composers and accent classes, authentic updated refusal words, and open requests losing/regaining earshot. The existing stamp test now invokes the released bin; the night-page assertion follows the shortened question.
- Before/after Chromium renders at 360×690 and 1280×800, the two-person rope request, safe-area checks, delivery identity and final check results are recorded in `/Users/abdul/code/human-framework/scratch/clarity/rope-report.md`. Screenshots live beside that report in `rope/`.

## Owner night transition (2026-10-20)
- Remaining: confirm the exact screen the owner saw in run `r-4sha5x28jz`; the export does not record page navigation. See docs/playtests/owner-2026-10-20.md.
- The owner replay reconstructs the entire saved state byte for byte at 23:00, `over: true`. No simulation or host-rule change; HF stays pinned at 2.8.0.
- Fixed a journal return path that exposed a stopped, finished map. All finished-climb journal returns now open the read-back; a closed season returns to the season page. Returning during the ending stamp cancels its timer before the next climb starts.
- Added DOM integration coverage for normal speed, fast speed, the actual nightfall button, journal returns, the pending-timer race and season closure. The minimal owner input log and full-state SHA-256 are in test/fixtures/owner-night.ts; the private export was not copied.
- `npm run check`: 19 files / 48 tests passed. Three existing Biome warnings remain. `happy-dom` is an exact development dependency for real page tests; WebGL, camp networking and the debrief Worker are replaced at their boundaries.
- Release identity: the deployed `/release.json` must match this change's pushed commit with `dirty: false`.

## Lab client (2026-10-19, deployed)
- `@adam0white/lab-client` 0.1.0 (release tarball) is wired in: `src/ui/lab.ts` (`createLab({ game: 'rope' })`), names in `src/ui/labnames.ts` (screens `title`, `climb N <mountain>: hut|climb|debrief`, `season`; milestones `climb N done|summit|all home`, `season done`; no player text). "Send this run to the notebook" sits beside each Export button (journal and debrief) and sends `exportClimb` output. `connect-src` in `public/_headers` now includes https://human.adamwhite.work.
- `/release.json` was 404 because nothing wrote it. `npm run build` now runs `scripts/stamp-release.ts` first, which writes `public/release.json` (gitignored, copied to dist). The Worker only runs first for `/api/*`, so assets serve the file; `public/sw.js` now skips `/release.json` (it was cache-first and would have frozen the build stamp).
- Committed and deployed. The live `/release.json` matched the commit and had `dirty: false`; the served JavaScript matched the local build SHA-256. Worker version 27af504a-145a-49a7-9020-89cc206c824a was the first delivery.
- Still to verify with a player run: open the live game, send a run with the note "integration test" and the label "agent", and confirm the run count on https://human.adamwhite.work/lab/.

## HF 2.8.0 (2026-10-19)
- **Live:** https://rope.adamwhite.work, Worker version f3b1977b-3055-419f-8c9f-3c372ce73301, bundle `assets/index-B3bkadIs.js`; its sha256 matches dist. HF is pinned at 2.8.0 exactly.
- Host rules 2 (`ClimbState.rules`): fullness on, no "step aside" offer, `alongside` and `reconsider` for roped partners. Numbers and the old-export rule are in docs/findings.md ("HF 2.8.0 and host rules 2"). Saves and exports from before this build replay under rules 1; both owner exports still match their saved answers (test/rules2.test.ts).
- `npm test` now runs with a 30 s timeout: the 12-seed sweeps time out at 5 s when the machine is busy.

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
