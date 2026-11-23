// cards.js - VOIDREIGN card definitions (18 cards across 10 archetypes).

export const ARCHETYPES = [
  {
    id: 'mote', rank: 1, count: 2, name: 'The Mote', short: 'MOTE',
    effect: '1st Mote: no effect. 2nd Mote acts as The Usurper.',
    glyph: 'spark', hue: 168, sat: 70, lum: 58,
  },
  {
    id: 'stalker', rank: 2, count: 2, name: 'The Stalker', short: 'STALKER',
    effect: 'Name a rank. If the rival holds it, they fall.',
    glyph: 'arrow', hue: 14, sat: 75, lum: 55,
  },
  {
    id: 'oracle', rank: 3, count: 2, name: 'The Oracle', short: 'ORACLE',
    effect: 'Peek at the rival\'s hidden card.',
    glyph: 'eye', hue: 210, sat: 80, lum: 62,
  },
  {
    id: 'aegis', rank: 4, count: 2, name: 'The Aegis', short: 'AEGIS',
    effect: 'Protected from all effects until your next turn.',
    glyph: 'shield', hue: 96, sat: 45, lum: 55,
  },
  {
    id: 'scourge', rank: 5, count: 2, name: 'The Scourge', short: 'SCOURGE',
    effect: 'Rival draws; burn one of their cards unseen.',
    glyph: 'flame', hue: 26, sat: 90, lum: 52,
  },
  {
    id: 'arbiter', rank: 6, count: 2, name: 'The Arbiter', short: 'ARBITER',
    effect: 'Compare hands. Lower rank falls; tie fells both.',
    glyph: 'scales', hue: 275, sat: 55, lum: 60,
  },
  {
    id: 'sage', rank: 7, count: 2, name: 'The Sage', short: 'SAGE',
    effect: 'Next turn, draw three cards and keep one.',
    glyph: 'scroll', hue: 190, sat: 60, lum: 48,
  },
  {
    id: 'transient', rank: 8, count: 2, name: 'The Transient', short: 'TRANSIENT',
    effect: 'Trade hands with the rival.',
    glyph: 'exchange', hue: 318, sat: 65, lum: 60,
  },
  {
    id: 'usurper', rank: 9, count: 1, name: 'The Usurper', short: 'USURPER',
    effect: 'Rival draws & reveals; burn one. Kills Sovereign.',
    glyph: 'sword', hue: 356, sat: 70, lum: 48,
  },
  {
    id: 'sovereign', rank: 10, count: 1, name: 'The Sovereign', short: 'SOVEREIGN',
    effect: 'Unplayable. If fallen, Reborn saves unless Usurper struck.',
    glyph: 'crown', hue: 46, sat: 90, lum: 58,
  },
];

export const DECK_SIZE = ARCHETYPES.reduce((n, a) => n + a.count, 0);

export function byId(id) {
  return ARCHETYPES.find((a) => a.id === id);
}

export function buildDeck() {
  const deck = [];
  for (const a of ARCHETYPES) for (let i = 0; i < a.count; i++) deck.push({ ...a, uid: `${a.id}#${i}` });
  return deck;
}
