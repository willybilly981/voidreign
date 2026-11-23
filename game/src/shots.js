// shots.js - deterministic staged states for screenshot captures.
// ?shot=cover|table|win|lose renders a hand-built board that exercises every
// screen the bounty asks to see. Normal play never touches this file.

import { Match } from './engine.js';
import { buildDeck, byId } from './cards.js';

function mk(id, n) {
  return { ...byId(id), uid: `${id}#${n}` };
}

function stage() {
  const m = new Match(1);
  m.nextRound('you');
  const st = m.round;
  return { m, st };
}

function setHand(seat, cards) {
  return cards;
}

export function maybeStage() {
  const shot = new URLSearchParams(location.search).get('shot');
  if (!shot) return null;

  if (shot === 'cover') {
    // The player's own execution: both herald cards are revealed and the crown
    // is among them. Burn the Sovereign for the round - but the Reborn card waits.
    const { m, st } = stage();
    m.roundNo = 2; m.scores.you = 1;
    st.you.hand = [mk('mote', 0), mk('usurper', 0)];
    st.you.discard = [mk('oracle', 0), mk('scourge', 0)];
    st.herald.hand = [mk('sage', 0), mk('sovereign', 0)];
    st.herald.discard = [mk('stalker', 0), mk('aegis', 0), mk('mote', 1)];
    st.reborn = mk('transient', 1);
    st.deck = st.deck.filter((c) => c.uid !== 'usurper#0');
    st.deck.length = 7;
    st.turn = 'you';
    st.phase = 'awaitPick';
    st.pending = { kind: 'burn', seat: 'you', victim: 'herald', source: 'usurper' };
    st.moteChimed = 1;
    st.log = [
      'The Herald raises the Aegis.',
      'The Herald plays The Stalker and calls rank 6.',
      'A false call. You do not hold it.',
      'You consult the Oracle - the Herald held The Sage.',
      'You play The Usurper.',
      'The Herald draws and shows both cards to the court.',
      'Choose which card burns.',
    ];
    return {
      match: m,
      revealHerald: new Set(st.herald.hand.map((c) => c.uid)),
      prompt: 'THE USURPER\'S DECREE - choose which revealed card burns<span class="dim">the Sovereign\'s crown bars the Reborn card only to the Usurper\'s own blade</span>',
    };
  }

  if (shot === 'table') {
    const { m, st } = stage();
    m.roundNo = 1;
    st.you.hand = [mk('arbiter', 0), mk('transient', 0)];
    st.you.discard = [mk('oracle', 1)];
    st.herald.hand = [mk('oracle', 0), mk('stalker', 1)];
    st.herald.discard = [mk('scourge', 1), mk('aegis', 1)];
    st.reborn = mk('mote', 0);
    st.deck.length = 13;
    st.you.sageDraw = false;
    st.turn = 'you';
    st.phase = 'awaitPlay';
    st.log = [
      'The court convenes. Hands dealt; the Reborn card set aside.',
      'The Herald burns a card of yours, unseen - it was The Arbiter\'s twin.',
      'You consult the Oracle - the Herald holds The Stalker.',
      'The Herald raises the Aegis.',
      'Your move.',
    ];
    return {
      match: m,
      revealHerald: null,
      read: 'The Herald\'s hand is hidden - but you saw The Stalker through the Oracle\'s eye.',
      prompt: 'Your move - raise a card and play it.<span class="dim">the Arbiter weighs, the Transient trades</span>',
    };
  }

  if (shot === 'win') {
    const { m, st } = stage();
    m.roundNo = 4;
    m.scores.you = 3; m.scores.herald = 1;
    m.matchWinner = 'you';
    st.you.hand = [mk('sovereign', 0)];
    st.you.discard = [mk('stalker', 0), mk('scourge', 0), mk('aegis', 0)];
    st.herald.hand = [];
    st.herald.discard = [mk('oracle', 0), mk('transient', 0), mk('mote', 1), mk('usurper', 0), mk('sage', 0)];
    st.herald.out = true;
    st.reborn = null;
    st.deck.length = 0;
    st.winner = 'you';
    st.phase = 'done';
    st.log = [
      'The Herald plays The Usurper - your hand is shown.',
      'The Herald burns The Mote. Your Sovereign never falls.',
      'The void is empty. Hands open: 10 against 4.',
      'The Herald falls.',
      'The court is yours.',
    ];
    return { match: m, overlay: 'win', prompt: '' };
  }

  if (shot === 'lose') {
    const { m, st } = stage();
    m.roundNo = 5;
    m.scores.you = 0; m.scores.herald = 3;
    m.matchWinner = 'herald';
    st.you.hand = [];
    st.you.discard = [mk('sovereign', 0), mk('arbiter', 0), mk('aegis', 1)];
    st.you.out = true;
    st.herald.hand = [mk('usurper', 0)];
    st.herald.discard = [mk('stalker', 1), mk('mote', 0), mk('oracle', 1)];
    st.reborn = null;
    st.deck.length = 2;
    st.winner = 'herald';
    st.phase = 'done';
    st.log = [
      'The Herald plays The Usurper - your hand is shown.',
      'The Herald burns your Sovereign. The blade of the usurper bars the return.',
      'You fall.',
      'The court forgets its Heir.',
    ];
    return {
      match: m,
      revealHerald: 'all',
      overlay: 'lose',
      prompt: '',
    };
  }

  return null;
}
