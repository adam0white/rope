/** Author-only clues. They enter the journal only after a chosen, receptive HF conversation. */
export const DISCOVERIES: Record<
  string,
  { topic: string; displayTopic?: string; clue: string; outcome: string }
> = {
  tamar: {
    topic: 'teaching a retreat',
    displayTopic: 'teaching people when to turn back',
    clue: 'I once said we turned back because of the weather. I had lost confidence in my judgment of the route. Turning back was sensible, but my explanation hid my lack of confidence.',
    outcome:
      'Tamar Vale uses that day as a teaching example and names her uncertainty. She does not say whether her earlier account was corrected elsewhere.',
  },
  oskar: {
    topic: 'photographing a climb',
    clue: 'One admired photograph combines two moments. The caption says the photograph was edited, but the story makes a volunteer seem to have stayed through the storm. They went home.',
    outcome:
      'Oskar drafts an accurate mountain caption before taking a picture. The old publication still needs correction and the subject’s consent.',
  },
  nell: {
    topic: 'local mountain names',
    clue: 'I draw maps of bad mountain names. The Sunny Chair is a wet hollow. They are maps of what people say, not safe route maps.',
    outcome:
      'Nell shows a private map of local names and leaves space for a name from this party. Nobody gains navigation skill.',
  },
  bilal: {
    topic: 'the folding lamp',
    clue: 'The lamp is for shadow animals. My stepchild likes the goat. The heron is much better. I do not always want to be the entertainment.',
    outcome:
      'Bilal shows how to make a heron shadow and invites you to hold the lamp. He decides whether to offer another show.',
  },
  wren: {
    topic: 'the habitat survey',
    clue: 'I left an ambiguous observation out of a preliminary report. I feared it would be used against the recommendation. This page says what I was unsure of.',
    outcome:
      'Wren shows the page with permission and drafts an explanation of what it can and cannot establish. The survey remains disputed. No filed report is changed.',
  },
};
