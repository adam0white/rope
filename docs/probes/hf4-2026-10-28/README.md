Current 4.8.1 controls: `rope-hf481-control.jsonl` and `rope-hf481-field-control.json` record fresh actual-game replay proofs. The older measurements below are historical.

# HF4 technical controls, 2026-10-28

Candidate evidence, not production delivery, a new player round or Adam's feel acceptance. The historical candidate pinned HF4.6.0 with client0.5.2/kit0.5.19. Current source pins HF4.8.1 with client0.5.7/kit0.5.24. Run `node scripts/hf4-control.ts` to reproduce the complete control; `--frames-only` stops after the climbing control.

`rope-hf46-final-control.jsonl` is the current control. It records110 actual climbing minutes after public inputs, a completed hut-path crossing to the meadow, exact outer game replay, the same Run through four real calendar days in the valley, then three actual minutes of the next authored mountain opening. Both outer input tapes and the full HF archive replay exactly. Final HF full hash: `5b6bbaf783ac3cd50e075367c69669e391349e8f8b18880f38bec2de334863a1`. The current default three-minute game golden is in test/hf-upgrade.test.ts. This is not a complete played three-climb season.

The valley uses30minute public horizons and serves every intermediate world request and actual activity duration. No activity completes without its accepted real receipt. The final HF archive has729 transactions and3,782,639bytes; the complete next-opening host state has4,542,509bytes. Valley advancement plus next-opening setup/three-minute replay took54.73seconds; full HF replay took12.96seconds. These wall times came from a loaded developer machine. The valley CPU field includes that setup and checkpoint work, and excludes the final full HF replay.

The current climbing control measures the actual Node advanceFrame helper after ten simulated minutes of warmup:207 samples, wall p95 26.23ms/max275.70ms, CPU p95 25.88ms,63 samples over10ms. The110minutes advanced in2.39seconds, excluding replay and export. These are not browser rendering or phone measurements, and they do not establish a hard frame-time maximum. Native saving and valley preparation are explicit paused operations. The UI yields between public HF calls.

`rope-hf4-control-2.jsonl` and `rope-hf4-frame-2.jsonl` are historical HF4.5.3 measurements. Their hashes,16.70MB HF/17.46MB host archives and8.84ms Node p95 are not current 4.8.1 results. The earlier control1 CPU figure included replay and is not used.

`rope-storage-control.json` is a separate headless Chromium capacity/CAS control on a360×690 viewport. It stored and read18,000,018 exact synthetic bytes in native IndexedDB, refused a conflicting writer and a stale callback, then removed its own slot. File-mode game startup opened the native Rope database zero times. The actual chooser target measured328×74.39 CSS pixels and the page fit the360px viewport width. The string is not an HF archive or played journey. Browser and server closed normally; no screenshot was retained. The standalone harness remains beside the worker report under .lab-scratch/codex.

Old HF3 test source is retained verbatim under docs/history/hf3-tests. Those files are historical evidence. Current public physical/replay controls live in test/*.test.ts.


`rope-hf460-field-control.json` repairs the repository’s existing field-control command for the current Run API. It uses one real drink request and600 ordinary mountain minutes, records9 actual completed step-aside actions with accepted voiding outcomes, and verifies exact game and full HF replay. HF hash: `ba7763636830a767e55a2a2d34a88a74418cbcbdce878dd1c1b47165cb95a97d`. No body state or person RNG is written. The original HF3 script remains byte-for-byte under docs/history/hf3-scripts; its unchanged-Person-RNG assumption is historical, not an HF4 requirement.
