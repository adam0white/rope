/** Display only. Stored narration and deterministic replay keep their original words. */
const phrases: ReadonlyArray<readonly [string, string]> = [
  [
    'Cowbells somewhere below, then nothing but boots on the path.',
    'You hear cowbells somewhere below. Then you hear only boots on the path.',
  ],
  [
    'The sun found the top of the crag before it found any of you.',
    'Sunlight reached the top of the steep rock face before it reached any of you.',
  ],
  ['The path steepened. Talk thinned to the odd word.', 'The path grew steeper. People spoke less.'],
  [
    'Larch needles underfoot, soft as a carpet in the dark.',
    'Soft larch needles covered the path in the dark.',
  ],
  [
    'Through the trees the Tooth showed for a moment, black against grey.',
    'You briefly saw the Tooth through the trees, black against the grey sky.',
  ],
  [
    'A stream crossing on wobbling stones. Nobody fell in.',
    'You crossed a stream on wobbling stones. Nobody fell in.',
  ],
  [
    'The wood ended all at once, and the screes began.',
    'The trees ended suddenly. Loose stones covered the slope ahead.',
  ],
  [
    'The screes slid two steps back for every three.',
    'For every three steps forward on the loose stones, you slid two steps back.',
  ],
  ['Headtorches bobbing in a line along the tarn.', 'Headtorches moved in a line along the mountain lake.'],
  [
    'Crampons on, by the edge of the ice, fingers clumsy with cold.',
    'You put on crampons, spikes for walking on ice. Your cold fingers made it difficult.',
  ],
  [
    'At the col Tamar looked at the gully for a long time and said nothing.',
    'At the col, the low point between peaks, Tamar looked at the gully for a long time and said nothing.',
  ],
  ['I once called a retreat weather.', 'I once said we turned back because of the weather.'],
  [
    'The retreat was sensible; the account protected me.',
    'Turning back was sensible, but my explanation hid my lack of confidence.',
  ],
  [
    'No old account is claimed corrected elsewhere.',
    'She does not say whether her earlier account was corrected elsewhere.',
  ],
  ['the footing was bad', 'it was difficult to keep a secure foothold'],
  ['the wind was hard across it', 'strong wind blew across it'],
  ['Everyone down, after dark', 'Everyone is back, after dark.'],
  ['Everyone down', 'Everyone is back.'],
  [
    'Frost on the moraine boulders; every hand went into a pocket.',
    'Frost covered the boulders left by the glacier. Everyone put their hands in their pockets.',
  ],
  ['Far above, the wall caught the sun.', 'Sunlight reached the rock wall far above.'],
  [
    'Oskar was outside the hut at half four, already looking at the top.',
    'Oskar was outside the hut at 04:30, already looking at the summit.',
  ],
  ['A quiet stretch.', 'Nothing new has happened.'],
  ['Was going anyway.', 'I was going anyway.'],
  ['Fine. On your head.', 'Fine. You are responsible if this goes wrong.'],
  ['Not from here. Look where we are.', 'I cannot do that from here. Look where we are.'],
  ['Not from here, friend.', 'I cannot do that from here, friend.'],
  ['Not from here.', 'I cannot do that from here.'],
  ['If you insist. I don’t like it.', 'I will do it if you insist, but I don’t like it.'],
  ['As you say. But I don’t agree.', 'I will do what you say, but I don’t agree.'],
  ['Can’t, not from here.', 'I cannot do that from here.'],
  ['How? Not from here.', 'How can I do that from here?'],
  ['Can’t. Look around.', 'I cannot do that here. Look around.'],
  ['Yes. Carefully, though.', 'Yes, but we need to be careful.'],
  ['On it!', 'I will do it!'],
  ['If you think so.', 'I will try if you think I should.'],
  ['For you, then.', 'I will do it for you, then.'],
  ['Keep something back for it.', 'Save some strength for it.'],
  [
    'cloud is building in the west; it will blow this afternoon.',
    'Clouds are building in the west. The wind will get stronger this afternoon.',
  ],
  [
    'the gully is in shade and quiet; from its top the summit is half an hour.',
    'The gully, a narrow channel in the mountain, is shaded and quiet. From its top, the summit is about half an hour away.',
  ],
  [
    'the ridge is long but the rock is good; from the tower it is under an hour.',
    'The ridge is long, but the rock is solid. From the tower, the summit is less than an hour away.',
  ],
  [
    'In the hut book, two summers back: “Turned at the shoulder. Wind. Next year. E.”',
    'In the hut book, Ezra wrote two summers ago: “I turned back at the shoulder because of the wind. I will try again next year. E.”',
  ],
  [
    'Bilal opened the tin at last. Tea, the cheap kind Ezra liked.',
    'Bilal opened the tin at last. It held the cheap tea Ezra liked.',
  ],
  [
    'Wren said Ezra had always said the arête was the honest way up.',
    'Wren said Ezra had always called the arête, a narrow rock ridge, the honest way up.',
  ],
  ['put you off.', 'asked you to wait.'],
  ['would not. “', 'refused your request. “'],
  ['had company down.', 'had someone to walk down with.'],
  ['was still on the mountain at dark', 'was still on the mountain when it got dark'],
  ['was down by ', 'was back at the hut by '],
  ['stood on the top', 'reached the summit'],
  ['was down;', 'was back at the hut;'],
  ['got no higher than ', 'climbed as far as '],
  ['I promised: down before dark, as I told Mum.', 'I promised Mum I would be back before dark.'],
  ['I promised: leave the tin on the top.', 'I promised to leave the tin on the summit.'],
  [
    'One simulated alternative: the same mountain, the same weather, with that one thing left unsaid. Small changes compound, so read it as a likely story, not a certainty.',
    'This simulation uses the same mountain and weather, with one input removed. Small changes can affect later events. This is a possible outcome, not a certainty.',
  ],
];

export function displayText(text: string): string {
  let result = text.replace(/“([^”]+)”/g, (_, quote: string) => `“${displayText(quote)}”`);
  for (const [before, after] of phrases) result = result.replaceAll(before, after);
  result = result.replace(
    /Once I’ve done ([^.!?]+)\. Not before\./g,
    (_, action: string) =>
      `I will consider it after I ${action[0]?.toLowerCase()}${action.slice(1)}, but not before.`,
  );
  result = result.replace(
    /Not yet\. Let me ([^.!?]+), then sure\./g,
    'Not yet. Let me $1 first. Then I will do it.',
  );
  result = result.replace(
    /Can I just ([^.!?]+) first\? Then yes\./g,
    'Can I just $1 first? Then I will do it.',
  );
  result = result.replace(
    /^((?:Tamar Vale|Oskar|Nell|Bilal|Wren)): (stood|reached|turned|got|climbed|was|came) /,
    '$1 $2 ',
  );
  result = result.replace(
    /^Someone remembered: (Tamar Vale|Oskar|Nell|Bilal|Wren) \([^)]*\): ["“](.*)["”]$/,
    (_, name: string, quote: string) => `The journal records ${name}’s answer: “${displayText(quote)}”`,
  );
  // These are complete deferred-answer templates in the retained narrator.
  result = result.replace(/(^|[.!?] )After I ([^.!?]+)\. (?=I’m not stopping now\.)/g, '$1Let me $2 first. ');
  result = result.replace(
    /(^|[.!?] )After I ([^.!?]+), my friend\./g,
    '$1I will listen after I $2, my friend.',
  );
  result = result.replace(/(^|[.!?] )Not till I ([^.!?]+)\./g, '$1I will not do that until I $2.');
  result = result.replace(
    /(^|[.!?] )([^.!?:“”]+) first\. Then I’ll think about it\./g,
    (_, prefix: string, action: string) =>
      `${prefix}I need to ${action[0]?.toLowerCase()}${action.slice(1)} first. Then I will think about it.`,
  );
  result = result.replace(/(^|[.!?] )After I ([^.!?,]+)! Come on\./g, '$1Let me $2 first! Come on.');
  result = result.replace(
    /(^|[.!?] )Um, after I ([^.!?]+)\? I’d like to\./g,
    '$1Can I $2 first? I would like to.',
  );
  result = result.replace(
    /(^|[.!?] )After I ([^.!?]+), if that’s all right\./g,
    '$1Let me $2 first, if that is all right.',
  );
  result = result.replace(
    /(^|[.!?] )([^.!?:“”]+) first, we’re so close\./g,
    (_, prefix: string, action: string) =>
      `${prefix}Let me ${action[0]?.toLowerCase()}${action.slice(1)} first. We are so close.`,
  );
  result = result.replace(/([^.!?]+) — ([^.!?]+)/g, '$1: $2');
  result = result.replace(
    /(Tamar Vale|Oskar|Nell|Bilal|Wren) still on the hill/g,
    '$1 is still on the mountain.',
  );
  result = result.replace(/(All|[2-5]) still on the hill/g, '$1 are still on the mountain.');
  return result;
}
