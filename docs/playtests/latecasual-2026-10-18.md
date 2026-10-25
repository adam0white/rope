# Late playtest, casual mobile gamer persona (Opus, source unread), 2026-10-18

Played the local build that has the owner-playtest fixes (docs/playtests/owner-2026-10-18.md) at 360×780: Hollin, climb 1, 05:00 to about 17:20, about 11 real minutes. Another session that shared the Playwright browser navigated its tab away twice, so the climb did not reach the end of the day.

## Its words (verbatim)

> A cozy, sad little hiking story where your friends actually ignore you. I liked it, but I lost control of my group fast.

> It's like Reigns but everyone has their own opinion and you're just the guy holding the map. I promised we'd turn back at one, and by one o'clock two of them were basically at the summit and couldn't hear me. That's either brilliant or infuriating, I can't decide.

> The little lines are great: Wren saying she can do it 'though the descent will be hard.' I believed her.
- Most fun: 14:20–14:29, "Far off: Bilal slipped …" then "Far off: Oskar stood on the summit", just after its 13:02 call to turn: "I felt guilty and helpless."
- Most boring: 07:02–08:53, when every answer was a yes.
- The change that would bring it back: "make the turn-back promise enforceable and readable. When my promised hour arrives, pause the game softly, show clearly who heard me and who didn't, and give me one tap to 'call everyone down'."

## Applied

- **The promised hour.** When it arrives, the clock slows and drops out of fast. For an hour, a bar reads "13:00, the hour you promised. In earshot: … Too far to hear: …" with one tap, "we all turn", which turns the leader and urges everyone down.
- **The promise is settled no earlier than the hour.** Before, any momentary walk down after the promise counted as keeping it, including "stay with them" walking back to the party. That is a sim change. Promise runs differ, and `npm run measure` is unchanged because the script makes no promise. Test: `test/owner.test.ts`.

## Not applied (recorded)

- "Tired" on every chip by 08:53 repeats the earlier finding (findings.md). The thresholds were already raised once. Target: next retune, 2026-10-25.
- Bubbles still showing old answers after a new call; "take pack" when the person is far does nothing visible; the tutorial banner clips at 360 px; the "Tap Climb on, then ask" note repeats; the name chips scroll sideways so Wren is off the edge. Target: polish pass, 2026-10-21.
- Fast speed covering long stretches while the player thinks (09:24 to 11:03). The new halt, hurt and promise calls now slow it at those moments; I have not checked whether that is enough.
