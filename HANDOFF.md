# Handoff

## State (2026-10-18)
- Live at https://rope.adamwhite.work (repo adam0white/rope). Second pass: conflicting aims, harder day, visible pressure, natural debrief sentences (docs/findings.md). Checked in the browser at 360×690: title, intro, climbing, HF-voiced bubbles, notes, debrief branch, next climb.
- Next: reviewer feedback; send-ahead and scout verbs; Workers AI camp voice only after the core is judged fun.

## Workers AI spend
- Built 2026-10-18: `POST /api/camp` (worker/index.ts), model `@cf/meta/llama-3.1-8b-instruct-fp8-fast` (switched from 3.2-1b the same day), max_tokens 180, input capped at 6 KB.
- Caps, held in isolate memory (no storage, so per isolate, approximate): 6 calls per IP per hour, 100 per day. Kill switch: set `CAMP_AI` to "off" in wrangler.jsonc and deploy. Any refusal or error gives the client's labelled deterministic fallback ("Read from the journal (no model).").
- The model only voices text; the client keeps lines spoken by party names and never reads state from them.
- Worst case, assumed from list pricing (about $0.045/M input, $0.384/M output for the 8B fp8-fast model) and not measured: about 1.2k in + 180 out ≈ $0.00012 per call, so $0.012 per isolate per day at the cap; about $0.12/day even if ten isolates each hit it.
- Estimated spend to date: under $0.01 (a handful of test calls). Estimate per call, assumed from list pricing and not measured: about 1k input + 180 output tokens, well under $0.001. Even every isolate at the daily cap stays far inside the Workers AI free daily allocation. Check the dashboard (AI > Workers AI usage) to confirm actual spend.
