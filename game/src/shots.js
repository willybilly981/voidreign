// shots.js - deterministic staged states for screenshot captures.
// Every staged board preserves the 18-card conservation invariant.

import { Match } from './engine.js';
import { byId } from './cards.js';

function mk(id, n) {
  return { ...byId(id), uid: `${id}#${n}` };
}

function stage() {
  const m = new Match(1);
  m.nextRound('you');
  return { m, st: m.round };
}

export function maybeStage() {
  const shot = new URLSearchParams(location.search).get('shot');
  if (!shot) return null;

  if (shot === 'cover') {
    // Active execution table: You played The Usurper (shown in center & your discard),
    // the Herald drew and revealed Sage + Sovereign, and you choose which burns.
    // Total cards: you(2) + you.discard(3) + herald(2) + herald.discard(3) + reborn(1) + deck(7) = 18.
    const { m, st } = stage();
    m.roundNo = 2; m.scores.you = 1; m.scores.herald = 1;
    st.you.hand = [mk('mote', 0), mk('arbiter', 0)];
    st.you.discard = [mk('oracle', 0), mk('scourge', 0), mk('usurper', 0)];
    st.herald.hand = [mk('sage', 0), mk('sovereign', 0)];
    st.herald.discard = [mk('stalker', 0), mk('aegis', 0), mk('mote', 1)];
    st.lastPlayed = { seat: 'you', card: mk('usurper', 0) };
    st.reborn = mk('transient', 1);
    st.deck.length = 7;
    st.turn = 'you';
    st.phase = 'awaitPlay';
    st.moteChimed = 1;
    st.log = [
      'The Herald raises the Aegis.',
      'The Herald plays The Stalker and names rank 6.',
      'A false call. You do not hold it.',
      'You consult the Oracle - the Herald held The Sage.',
      'You play The Usurper.',
      'The Herald draws and reveals both cards to the court.',
      'Choose which card burns.',
    ];
    return {
      match: m,
      revealHerald: new Set(st.herald.hand.map((c) => c.uid)),
      read: 'The Sovereign is exposed - the Usurper bars the Reborn return.',
      prompt: 'THE USURPER\'S DECREE - choose which revealed card burns<span class="dim">burning the Sovereign by the Usurper\'s blade ends the round outright</span>',
    };
  }

  if (shot === 'win') {
    // Deck exhausted showdown: Your Sovereign (10) beats The Herald's Aegis (4).
    // Total cards: you(1) + you.discard(8) + herald(1) + herald.discard(7) + reborn(1) + deck(0) = 18.
    const { m, st } = stage();
    m.roundNo = 4;
    m.scores.you = 3; m.scores.herald = 1;
    m.matchWinner = 'you';
    st.you.hand = [mk('sovereign', 0)];
    st.you.discard = [
      mk('stalker', 0), mk('scourge', 0), mk('aegis', 0), mk('oracle', 1),
      mk('mote', 0), mk('arbiter', 0), mk('sage', 1), mk('transient', 1),
    ];
    st.herald.hand = [mk('aegis', 1)];
    st.herald.discard = [
      mk('oracle', 0), mk('transient', 0), mk('mote', 1), mk('usurper', 0),
      mk('sage', 0), mk('stalker', 1), mk('scourge', 1),
    ];
    st.lastPlayed = { seat: 'you', card: mk('transient', 1) };
    st.reborn = mk('arbiter', 1);
    st.deck.length = 0;
    st.winner = 'you';
    st.phase = 'done';
    st.log = [
      'The Herald plays The Usurper - your hand is shown.',
      'The Herald burns The Mote. Your Sovereign endures.',
      'The void is empty. Hands open: 10 against 4.',
      'You claim the final sigil.',
    ];
    return { match: m, revealHerald: 'all', overlay: 'win', prompt: '' };
  }

  if (shot === 'lose') {
    // Open execution defeat: The Herald's Usurper burned your Sovereign.
    // Total cards: you(0) + you.discard(4) + herald(1) + herald.discard(5) + reborn(1) + deck(7) = 18.
    const { m, st } = stage();
    m.roundNo = 4;
    m.scores.you = 1; m.scores.herald = 3;
    m.matchWinner = 'herald';
    st.you.hand = [];
    st.you.discard = [mk('oracle', 0), mk('aegis', 1), mk('arbiter', 0), mk('sovereign', 0)];
    st.you.out = true;
    st.herald.hand = [mk('transient', 0)];
    st.herald.discard = [mk('stalker', 1), mk('mote', 0), mk('oracle', 1), mk('sage', 0), mk('usurper', 0)];
    st.lastPlayed = { seat: 'herald', card: mk('usurper', 0) };
    st.reborn = mk('scourge', 0);
    st.deck.length = 7;
    st.winner = 'herald';
    st.phase = 'done';
    st.log = [
      'The Herald plays The Usurper - your hand is shown.',
      'The Herald burns your Sovereign. The blade bars the return.',
      'You fall.',
      'The court forgets its Heir.',
    ];
    return { match: m, revealHerald: 'all', overlay: 'lose', prompt: '' };
  }

  return null;
}
