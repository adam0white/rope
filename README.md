# The Rope

Lead five people up a mountain and back. Every one of them can say no.

A browser game built on the [Human Framework](https://github.com/adam0white/human-framework), a deterministic model of simulated people. [Play The Rope](https://rope.adamwhite.work).

## How to play

1. Choose **New game**. You lead Tamar Vale, Oskar, Nell, Bilal and Wren across a season of three mountains.
2. At the hut, choose when to turn back, or choose **We'll see** to make no promise.
3. Use **lead on**, **go down** and **stop** in the bottom row to control your own movement. **stay with them** keeps you with the party. Select a person to offer **walk to** that person instead.
4. Select a person or the whole party before making a request. Only people nearby can hear you. Rest, eat and wait send a gentle request immediately. **Ask more firmly…** opens the pressure choices. Each person can refuse.
5. Read their answers and watch for calls, injuries and people falling behind. The **Journal** records what happened. The information button explains the current part of the climb.
6. After each climb, read what happened to each person and the comparison with one selected input removed. Continue to the next mountain or close the season.

Time advances automatically during play. It slows for answers and calls. Opening the menu or an information panel stops time. **Menu** offers **Feedback**, **Full screen**, **All games**, a **Recording** switch and **New game**. **Resume** closes the menu. When an unfinished season is available, **New game** asks for confirmation before replacing it.

### Feedback

Open **Menu → Feedback**. The shared **I'm stopping** and **I'm confused** choices prefill the note. Selecting, changing or clearing a choice sends nothing and retains your edits. Use **Submit** to send the note. The existing verdict choices, **Lab privacy** link and recording controls remain available. When Recording is off, the optional sharing checkbox starts unchecked; leaving it unchecked sends the note alone. After a successful send, the page says **Sent. Your note is stored.**

### Mountain plans

The ordinary hut start records installed field rules automatically. **Scout crossing** asks a person to cross the next leg. HF can refuse. A crossing costs real travel time, effort and risk. Reports require hearing distance and name their time; conditions may have changed. Older reports cannot replace newer direct observations.

An escort must actually meet the person before considering descent together. Arrival does not guarantee agreement. Terrain notices and uncertain weather estimates reveal no hidden storm deadline. HF handles bodily needs and responses to the leader's kept or broken promise.

The input log records these rules. Existing tapes keep their recorded behavior. Complete current exports replay exactly. Replay does not establish browser-history ownership or owner acceptance.

## Saves and replay

The game saves automatically in this browser during play and when the page is hidden or left. **Resume** on the title page reconstructs an unfinished saved season. Browser storage must be available; clearing it removes the local save. Saves from an incompatible edition may not load.

**Menu → Playback speed** offers Auto, Slow, Normal and Fast. The menu offers a run download, the separate file-session importer and the title page. **Debug**, beside **Lab privacy**, starts collapsed and shows diagnostic version information. File sessions keep progress in memory and require a download before closing. They preserve the native saved season and acquire no browser-history ownership.

Fresh seasons automatically prepare shared people through the released browser shelf contract. Failed admission preserves your saved season. **People in this browser** opens the central shelf for cast controls. End screens also link there. Loaded seasons retain pinned actors.

To print an exported run's timeline locally:

```sh
node scripts/replay-export.ts /path/to/export.json
```

The script reports whether the saved answers and journal text match. It is not a complete state-equality test.

## What Human Framework contributes

The game pins the published npm package `@adam0white/human-framework` to exactly **3.0.0**. That package reports engine **2.23.0**; the package version and engine stamp are different values. Fresh climbs use Rope simulation rules **2**. The native history format uses `rope-cast/1`, rules stamp `rope-cast-1` and calendar mapping `rope-calendar/1`.

The host uses immutable lab-client **0.4.15** and lab-kit **0.5.17** release artifacts.

HF supplies each person's traits, values, bodily needs, goals, relationships, memories, decisions and decision-based replies. Rope supplies the mountains, weather, movement, ropes, available actions and physical consequences. Rope presents offers to HF rather than writing a person's refusal itself. The simulation runs locally and deterministically from its starting state and input log. The deployed configuration has `CAMP_AI` off. The debrief uses the labelled deterministic journal fallback. Optional Workers AI conversation, when enabled, does not decide what happens in the climb.

## Installation and offline use

Use your browser's install option where supported. Offline use requires an initial online load and cached assets. The production service worker caches the page and assets as they are fetched; it cannot supply assets that have never loaded or whose cache was cleared. Feedback delivery and online camp conversation require a connection. Camp conversation has a deterministic fallback.

## Development

Use shared Node 26.12.0 (`.node-version` and `.nvmrc`) and pnpm 12.14.0.

```sh
pnpm install --frozen-lockfile
npm run dev     # local game
npm run check:lane # lint, typecheck, tests (this repo runs the full check)
```

## Credits

- People: [@adam0white/human-framework](https://www.npmjs.com/package/@adam0white/human-framework) 3.0.0 (MIT).
- Rendering: [PixiJS](https://pixijs.com) 8.22.0 (MIT).
- Type: Literata (OFL) and Caveat (OFL) from Google Fonts.
- World randomness pattern from HF's game _The Night Watch_.
- Code MIT; see LICENSE.

Dependency changes use pnpm and the committed `pnpm-lock.yaml`. The npm lock was imported with exact dependency versions preserved. Do not regenerate an npm lock or install a separate runtime per worktree. The pnpm policy uses strict engines/peers, no hoisting, hardlinks, a 24-hour third-party release delay and a scoped exemption for owned `@adam0white/*` packages.
