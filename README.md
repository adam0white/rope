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

### Optional mountain plans

At the hut, open **New mountain plans** before choosing a turn time or **We'll see**. Both options start unchecked. **Use these plans and the new promise response** enables field rules. **Also allow people to step aside when their body needs it** also enables field rules and separately opts people into HF's bladder model.

With field rules on, **scout crossing** asks a person to cross the next leg. HF can refuse. An accepted crossing takes real travel time, effort and risk. The person reports observed conditions only after coming within hearing distance. Reports name when the crossing happened; conditions may have changed. An older report cannot replace a newer direct observation. **Route and weather warning** describes terrain costs and an uncertain forecast, not a safe deadline.

An escort request asks the helper to meet the other person before considering descent together. It requires an accepted HF plan, an actual nearby meeting and an unexpired request. Arrival does not guarantee agreement to descend. Public request answers remain available; a promise to turn back concerns the leader's turn, not everyone's arrival at the hut. Field rules use HF's response to a kept or broken voice promise.

These are explicit logged choices. Old starts and inputs retain their rules and raw histories. Fresh climbs still use rules **2**; field rules are an optional addition, not a new chapter format. Current exports replay the selected options. Replay checks do not establish ownership of browser histories or player acceptance.

## Saves and replay

The game saves automatically in this browser during play and when the page is hidden or left. **Resume** on the title page reconstructs an unfinished saved season. Browser storage must be available; clearing it removes the local save. Saves from an incompatible edition may not load.

Diagnostic controls require [the lab view](https://rope.adamwhite.work/?lab=1). With a climb underway, **Feedback → Download this run** exports its starting state, inputs and saved state as JSON. The finished-climb and season pages also offer that download in the lab view. **Menu → Lab tools → Load a current Rope run** imports a current export and checks its replay against the saved state. Importing a file does not give the run control over its people's saved browser histories. Playback speed and browser-history tools also live in this diagnostic view.

To print an exported run's timeline locally:

```sh
node scripts/replay-export.ts /path/to/export.json
```

The script reports whether the saved answers and journal text match. It is not a complete state-equality test.

## What Human Framework contributes

The game pins the published npm package `@adam0white/human-framework` to exactly **3.0.0**. That package reports engine **2.23.0**; the package version and engine stamp are different values. Fresh climbs use Rope simulation rules **2**. The native history format uses `rope-cast/1`, rules stamp `rope-cast-1` and calendar mapping `rope-calendar/1`.

HF supplies each person's traits, values, bodily needs, goals, relationships, memories, decisions and decision-based replies. Rope supplies the mountains, weather, movement, ropes, available actions and physical consequences. Rope presents offers to HF rather than writing a person's refusal itself. The simulation runs locally and deterministically from its starting state and input log. The deployed configuration has `CAMP_AI` off. The debrief uses the labelled deterministic journal fallback. Optional Workers AI conversation, when enabled, does not decide what happens in the climb.

## Installation and offline use

Use your browser's install option where supported. Offline use requires an initial online load and cached assets. The production service worker caches the page and assets as they are fetched; it cannot supply assets that have never loaded or whose cache was cleared. Feedback delivery and online camp conversation require a connection. Camp conversation has a deterministic fallback.

## Development

Use Node 24 or later.

```sh
npm install
npm run dev     # local game
npm run check:lane # lint, typecheck, tests (this repo runs the full check)
```

## Credits

- People: [@adam0white/human-framework](https://www.npmjs.com/package/@adam0white/human-framework) 3.0.0 (MIT).
- Rendering: [PixiJS](https://pixijs.com) 8.22.0 (MIT).
- Type: Literata (OFL) and Caveat (OFL) from Google Fonts.
- World randomness pattern from HF's game _The Night Watch_.
- Code MIT; see LICENSE.
