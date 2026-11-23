// cards.js - VOIDREIGN card definitions.
// An original small-deck deduction duel: 18 cards over 10 archetypes, each with a
// rank, a color identity and one effect. Names, art, fiction and rulings here are
// written for this game; the genre's shared grammar (draw-and-play, numbered ranks,
// a reincarnation token) is borrowed, nothing else is.

export const ARCHETYPES = [
  {
    id: 'mote', rank: 1, count: 2, name: 'The Mote', short: 'MOTE',
    effect: 'First Mote: nothing. The second Mote played by anyone acts as The Usurper.',
    glyph: 'spark', hue: 168, sat: 70, lum: 58,
    flavor: 'A single spark of the coming rebellion. One means nothing; the second chimes the court.',
  },
  {
    id: 'stalker', rank: 2, count: 2, name: 'The Stalker', short: 'STALKER',
    effect: 'Name a rank. If the rival holds it, they reveal and fall.',
    glyph: 'arrow', hue: 14, sat: 75, lum: 55,
    flavor: 'The Usurper\'s hounds hunt by number. A true call is a quiet death.',
  },
  {
    id: 'oracle', rank: 3, count: 2, name: 'The Oracle', short: 'ORACLE',
    effect: 'Peek at the rival\'s hand. Tell no one what it holds.',
    glyph: 'eye', hue: 210, sat: 80, lum: 62,
    flavor: 'Her sight crosses the veil. What she shows you is yours alone.',
  },
  {
    id: 'aegis', rank: 4, count: 2, name: 'The Aegis', short: 'AEGIS',
    effect: 'You cannot be targeted until your next turn begins.',
    glyph: 'shield', hue: 96, sat: 45, lum: 55,
    flavor: 'A prayer in brass. No decree touches the guarded.',
  },
  {
    id: 'scourge', rank: 5, count: 2, name: 'The Scourge', short: 'SCOURGE',
    effect: 'Rival draws, then you pick one of their two cards to burn, unseen.',
    glyph: 'flame', hue: 26, sat: 90, lum: 52,
    flavor: 'A plague in the archive. It burns what it cannot read.',
  },
  {
    id: 'arbiter', rank: 6, count: 2, name: 'The Arbiter', short: 'ARBITER',
    effect: 'Compare hands with the rival. Lower rank falls. A tie fells both.',
    glyph: 'scales', hue: 275, sat: 55, lum: 60,
    flavor: 'The scale favors no banner. It favors the heavier card.',
  },
  {
    id: 'sage', rank: 7, count: 2, name: 'The Sage', short: 'SAGE',
    effect: 'Next turn, draw three and keep one. The rest return to the void.',
    glyph: 'scroll', hue: 190, sat: 60, lum: 48,
    flavor: 'He unfolds three futures and lets you keep the kind one.',
  },
  {
    id: 'transient', rank: 8, count: 2, name: 'The Transient', short: 'TRANSIENT',
    effect: 'Trade hands with the rival.',
    glyph: 'exchange', hue: 318, sat: 65, lum: 60,
    flavor: 'In the dream of the court, you wake in the rival\'s chair.',
  },
  {
    id: 'usurper', rank: 9, count: 1, name: 'The Usurper', short: 'USURPER',
    effect: 'Rival draws, shows both; you burn one. Burning the Sovereign kills for good.',
    glyph: 'sword', hue: 356, sat: 70, lum: 48,
    flavor: 'The false king hunts the true one. His blade can strike where plague cannot.',
  },
  {
    id: 'sovereign', rank: 10, count: 1, name: 'The Sovereign', short: 'SOVEREIGN',
    effect: 'Cannot be played. If burned you fall - unless the Usurper struck, the Reborn card returns you.',
    glyph: 'crown', hue: 46, sat: 90, lum: 58,
    flavor: 'The void has one law: the crown is never willingly shown. Burn it and the court remembers you.',
  },
];

export const DECK_SIZE = ARCHETYPES.reduce((n, a) => n + a.count, 0);

export function byId(id) {
  return ARCHETYPES.find((a) => a.id === id);
}

export function byRank(rank) {
  return ARCHETYPES.find((a) => a.rank === rank);
}

// buildDeck returns the full 18-card multiset, unshuffled.
// Each physical card is a copy of its archetype plus a unique uid for the DOM.
export function buildDeck() {
  const deck = [];
  for (const a of ARCHETYPES) for (let i = 0; i < a.count; i++) deck.push({ ...a, uid: `${a.id}#${i}` });
  return deck;
}
