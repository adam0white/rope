# Requests for the Human Framework

Generic gaps found while building The Rope. Nothing here is game-specific; the HF repo owner decides.

1. **Prospection of one's own future body (2026-10-18).** `prospection/` values received consequences but excludes future bodily state, so a person cannot reason "I will be too tired for the descent". The Rope keeps that reasoning in the host: the player can tell it as a forecast, and the descent's effort is advertised on the offer.
2. **A voice's own promise (2026-10-18).** HF has commitments a person owes, and social events `promise-kept`/`promise-broken` that move a relationship, but no path from a host voice keeping or breaking its own announced promise into `VoiceRelation.trust`. The Rope uses `adoptVoiceTrust` with a host-chosen step, which is a host number standing in for a framework rule.

## 6. Idle drink and relieve loop at full hydration (2026-10-19)

**Gap (confirmed in an owner export, Kestrel seed 334144833):** a person with nothing asked of them for eight hours chose `drink` and `relieve` alternately every four minutes, "because I feel like it" or "out of habit", at hydration 0.98 to 1.00 (about 90 drinks in a day). The Rope offers `drink` and `relieve` as small always-on actions (`water: 0.35`, `relief: 0.8`).
**Suspected cause (not confirmed):** drinking does not saturate with hydration, and relief is never satisfied for long because the bladder state refills from drinking.
**Proposal:** drink's value should fall to zero as hydration nears full, and a bladder state should gate `relieve`, so idle choice falls through to rest or wait.

## 7. A goal sentence that names the current path as a future descent (2026-10-19)

**Gap (confirmed, same export):** three minutes into the climb Wren wanted to go down and answered five asks with "Not till I go down the tarn path. I'll still have enough for the descent." The sentence is built from a goal (`g1`) whose affordance is the leg she is already on. The text reads as if the descent were planned and the path were ahead of her.
**Proposal:** the deferral template should use "turn back" when the goal's target is the person's current leg, and the reason for a goal formed three minutes after leaving should be inspectable (why did the goal form so early?).

## Released API reconciliation (2026-10-25)

The optional `field-rules` path uses published HF3.0.0, never sibling source. `bodyForecast` and the existing fullness/alongside paths already serve future-body and resting-partner requests. No replacement faculty is added. `noteVoicePromise` now supplies the new path's response to the leader's own turn-time promise. Existing tapes retain the original host trust step.

The optional bladder faculty is now used through `enableBladder`, real water outcomes and completed voiding, with no `relief` advertisement. HF owns bodily dynamics. `scripts/field-control.ts` exercises actual host intake, one completed void, unchanged Person RNG and exact full replay. This supersedes the historical claim that HF has no bladder, not the old reproduction evidence.

In the new path, reversing the currently occupied leg is labelled **turn back down** in the host offer. HF retains the complete reason and deferral. It has no terrain-specific template. Existing saved semantic labels remain unchanged. No generic HF gap is closed by inventing a game-local reasoning system.

## Current source reconciliation (2026-10-27)

The requests above record historical evidence.

- Request 2: field rules use released `noteVoicePromise` in `src/sim/climb.ts`. Older tapes keep their recorded host trust behavior. The ordinary hut start now records field rules automatically.
- Request 6 / F-012: field rules use released HF bladder state, completed water outcomes and completed voiding outcomes. Settled footing and an untied person gate the offer. `test/field.test.ts` and `scripts/field-control.ts` cover this. Historical owner exports stay unchanged.
- Request 7: field-rule descent offers say turn back when they concern the current leg. HF still owns the early goal; the host does not replace it with a rule.
- Request 1: Rope advertises bounded physical forecasts. Broader generic future-body reasoning belongs in HF. This batch adds no framework logic to Rope.


## HF4 reconciliation (2026-10-28)

The HF3 API descriptions above are historical. Current source uses published HF4.8.1 Run inputs, requests, receipts and full archives. There are no optional physiology faculties, manual trust writes or private body-based presentation. Retained place/voice references admit through honest initial world facts. Current controls establish no G2 or G6 blocker. G4 remains the broader public observation/projection need; this port explicitly says current condition is unavailable rather than exposing privileged truth. No HF edit or new framework gap is claimed.


## HF4 phrasebook verdicts and reasons — closed 2026-10-29

Published HF4.12 accepts authored verdict and reason fragments in `lexicon.voices`. Rope supplies its climbers’ phrasebooks and reads rendered public event narration. The temporary index-based host adapter is removed. Feel acceptance remains separate.
