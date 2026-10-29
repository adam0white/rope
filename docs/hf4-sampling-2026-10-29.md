# HF4 sampling — 2026-10-29

## HF 4.12.0 control on current main

The measured game source is `3aded8cc8c66783146c8ef39b06c2eebc65bcb0e`, with published HF 4.12.0, client 0.5.12 and kit 0.5.29. The existing seed-3 full-climb control reached minute 5,634 with seven player inputs and 1,254 HF transactions. Complete game replay and public HF replay matched exactly. The 6,691,054-byte JSON was retained and read back from a 1,079,247-byte gzip, SHA256 `d7656f3b8ee007239d30f72502b8d6c1cdec24a6751e8445d8289d2fa831ec96`. Raw control and readback receipts are in `games-deferred/recovery-rope412-full-climb.*` and `recovery-rope412-full-climb-readback.json`. The 89,054 ms elapsed on a shared Mac is not a device performance guarantee.

The unchanged `npm run measure` also completed all 36 scripted climbs: 12 seeds on each peak. Its aggregate rows matched the historical table below exactly. This comparison does not establish identical individual histories or player experience. The raw current output is `games-deferred/recovery-rope412-measure.log`; the definitions and limitations below apply to both runs. No current focused position or company run is claimed here.

## Historical HF 4.8.1 sample

Owner feel and readiness remain due 2026-11-03. Shared custody and the model-call input gate remain separate. This sample changes no gameplay, thresholds, people or physics.

The measured source is `9f17680d89ab0eb3d99082f16b228d8262ebd70c`, using published HF 4.8.1, client 0.5.7 and kit 0.5.24. The live release was independently fetched at that exact commit with `dirty:false`. The earlier HF3 calibration and the older `a93c2b7` file/footer checks keep their own scope.

## Existing scripted policy

`npm run measure` completed unchanged: seeds 1–12 on each of Hollin, Tooth and Kestrel, using the existing leader script, noon turn and holdout collection. Each row contains twelve runs of the same five defined climbers. These are not sixty independent people or player observations.

| Peak    | Summited | Back by dark | Hurt | Non-assenting answer rows | Summited after turn |
| ------- | -------: | -----------: | ---: | ------------------------: | ------------------: |
| Hollin  |        1 |           50 |    8 |                 24 of 168 |                   1 |
| Tooth   |        0 |           50 |   11 |                  6 of 222 |                   0 |
| Kestrel |        1 |           57 |   16 |                 19 of 158 |                   1 |

People counts are out of 60 per peak. The script calls injury severity at least 0.15 hurt. Back by dark uses the existing day account and its dusk plus 45-minute rule. Its raw heading says “Answers that disagree”, but its predicate counts every player-input answer row whose verdict is not `assented`, including deferrals or other statuses. It does not measure a private feeling or establish opposition in every case. No tuning followed these results.

## Replay and physical controls

The existing `scripts/hf4-full-climb-control.ts` completed on seed 3: minute 5,634, seven player inputs, 1,254 HF transactions and 17,056,721 bytes of complete exported JSON. Complete game replay and public HF replay matched exactly. Elapsed time was 87,466 ms on the shared Mac; this is not a device performance guarantee.

The retained gzip is 823,393 bytes, SHA256 `776ee4495b44316a2bff2a51648c0479617f8bc3901037a6eb818217ceb3a62a`. Raw receipts are kept under the director's `games-deferred` store as `recovery-rope-9f-full-climb.*`, `recovery-rope-9f-measure.log` and `recovery-rope-9f-sampling-binding.json`.

At `9f17680`, `positions.test.ts` and `climb.test.ts` passed five controls in 16.08 s, retaining their 30 s limits. The position fixtures explicitly author halfway host positions; they do not claim a natural climb to that point. They check descent continuity on all three peaks. The climb controls retain actual costed HF work and exact public replay.

At `9f17680`, `company.test.ts` passed four controls in 8.99 s with the same 30 s limit: waiting for company, an actual HF escort answer and roped descent, an audible turning response, and unchanged refusal of the historical owner file. Its col positions and pending host request are authored fixtures, not evidence that the party climbed there. The actual HF answer and completed activity receipt remain required.

The earlier `9f` documentation checks first failed formatting, then a separate full check timed out in `native-file-session.test.ts` while its status remained Loading. The subsequent Node 26 full check passed 223 tests in 47 files; those earlier failures remain in the `recovery-rope-9f-docs-check*.log` receipts and do not establish a current failure.

Reproduce the historical sample from its measured source with the existing scripts and focused tests. These checks establish neither an owner profile, a live shared journey, human accessibility nor whether Adam finds the people compelling. Camp inference remains off; no model or player round ran.
