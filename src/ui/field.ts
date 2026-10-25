/** Field observations only. Cruxes name existing terrain, costs and controls;
 * forecasts disclose their authored uncertainty, never the seeded storm onset.
 * No additional hazards, private goals, verdicts or body measurements live here. */
import { type ClimbState, MOUNTAINS } from '../sim/climb.ts';
import { legsUp, routeName, windAt } from '../sim/mountain.ts';

const CRUXES: Record<string, Record<string, string>> = {
  hollin: {
    col: 'The rock channel is sheltered from wind but stones can fall when the sun warms it. The ridge is exposed. Scout, secure a rope, or turn back.',
    tower:
      'The summit step has poor footholds. Securing a rope takes time; climbing without it leaves the fall risk.',
    'gully-top': 'The final rocky climb still leaves the whole descent. Rest here or ask who will continue.',
  },
  tooth: {
    notch:
      'The snow channel offers shelter from wind; the east ridge stays exposed. A rope costs time here, and the return uses the same ground.',
    shelf: 'The steep snow face has poor footholds. Secure a rope, rest, or turn before the last climb.',
    gendarme: 'The crest stays in the wind. The summit is close, but everyone still has to come down.',
  },
  kestrel: {
    glacier:
      'The upper glacier leads to the deep crack. Check who can still hear you before crossing; a rope partner must be close.',
    schrund:
      'The ice wall is steep and can shed stones. A fixed rope takes time and reduces falls; it does not remove the effort.',
    shoulder:
      'Ezra turned here in the wind. The summit ridge is exposed. Rest, secure a rope, or turn while the descent is still ahead.',
  },
};

export function fieldNotice(s: ClimbState): string {
  if (!s.fieldRules) return '';
  const m = MOUNTAINS[s.mountain];
  if (!m) return '';
  const place = s.leader.pos.place;
  const crux = place ? CRUXES[s.mountain]?.[place] : '';
  const costs = crux
    ? legsUp(m, place ?? '')
        .map((l) => `${routeName(l)}: about ${l.minutes} minutes up for fresh legs, longer when tired`)
        .join('; ')
    : '';
  let sky = '';
  if (s.known.includes('storm')) {
    const strong = windAt(s.seed, s.weather, s.minute) >= 0.45;
    const now = strong ? 'The wind is strong now.' : 'The wind feels lighter here now.';
    sky =
      s.minute % 1440 > 14 * 60
        ? `${now} The midday forecast window has passed. Gusts can still strengthen; this is not a safe deadline.`
        : `${strong ? now : 'Cloud is building in the west.'} Forecast: stronger wind around 11:00–14:00, an estimate, not a deadline. It can strengthen before everyone returns.`;
  }
  return [crux, costs, sky].filter(Boolean).join(' ');
}
