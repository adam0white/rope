# The Rope: project workflow

You lead five Human Framework (HF) people up a mountain and back. Every one of them can say no.

- Start a resumed task with [HANDOFF.md](HANDOFF.md), then [docs/design.md](docs/design.md).
- **Done means (owner, 2026-10-18):** every player input gets a visible, person-voiced answer within a few seconds of game time at normal speed; each climb's debrief attributes at least one outcome to one input; Adam climbs with a party he recognises and says the people were the point. Adam accepts feel.
- **First acceptance test:** within ten minutes the player makes a plan, meets a reasonable objection, changes something concrete and sees a consequence they care about.

## Rules
- HF comes only from npm: `@adam0white/human-framework@2.18.0`, exact. Never import sibling source. No game logic goes into HF. A generic HF gap goes into [docs/hf-requests.md](docs/hf-requests.md).
- Never fake a verdict. Every refusal, deferral or counter-offer comes from an HF resolution (`answerNow`, `decide` with a suggestion, `predict`).
- Inner state is never a number on screen. Show it as drawing: stride, lag, lean, gaze, hatching.
- All world randomness is keyed by (seed, kind, place, minute) through `hashUnit`, never by draw order. Person RNG stays unused (`will.temperature` 0). Seed + input log + start state is the replay, the playtest export and the debrief substrate.
- The sim core (`src/sim`) is headless, deterministic and free of DOM, renderer and LLM code. State is plain JSON.
- Visual language: Field Notebook (`human-framework/docs/design-language.md`). Only `--rope` is loud.
- Faith stays quiet: a prayer at dusk is a journal line, never a mechanic.
- Workers AI may voice camp conversation only, from HF decision records and journal facts. It never emits state. Hard caps in the Worker, a kill switch and a labelled deterministic fallback. Budget $5 total; track spend in HANDOFF.md.
- No server infrastructure beyond one Worker with static assets (no Durable Objects, no databases).
- Phones first: Galaxy S26 360x780 CSS px, about 690 px visible; thumb actions in the bottom 40%.
- `npm run check` (lint, typecheck, tests) passes before every commit. Node >= 24, `/opt/homebrew/bin` first on PATH.
- Deferred work goes into the Deferred section of docs/design.md with a target. Playtesters' words go verbatim into `docs/playtest-*.md`.

## Delivery
- Repository `adam0white/rope` (public). Site: https://rope.adamwhite.work (Cloudflare Worker static assets, `wrangler.jsonc`). The owner authorized commit, push and `npm run deploy`. Verify the live site against the commit after each deploy.

- Player-facing copy follows [Plain English](docs/lab/plain-english.md).
