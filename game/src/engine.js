// engine.js - VOIDREIGN rules core and the Herald (rival AI).
// Pure logic: no DOM. UI drives a Match, calls playCard/choose, and reads state.
// Everything is seeded so screenshots and self-tests are deterministic.

import { ARCHETYPES, buildDeck, byId, byRank } from './cards.js';

export function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const SOV = 'sovereign';

// One player slot: hand (array of archetype), discard pile, and flags.
function freshSeat() {
  return {
    hand: [],
    discard: [],
    protected: false, // The Aegis: immune until own next turn
    sageDraw: false,  // The Sage: draw 3-keep-1 next turn
    out: false,       // eliminated this round
    rebornUsed: false,
  };
}

export function newRoundState(rng) {
  const deck = buildDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const you = freshSeat();
  const herald = freshSeat();
  you.hand.push(deck.pop());
  herald.hand.push(deck.pop());
  const reborn = deck.pop(); // the hidden Reborn card, set aside face down
  return {
    deck, reborn, you, herald,
    turn: 'you', phase: 'awaitDraw',
    pending: null,   // in-flight effect awaiting a choice
    log: [],         // event strings for the UI chronicle
    winner: null,    // 'you' | 'herald' | 'tie' once the round ends
    notes: [],       // Herald's reasoning snippets for the telegraph line
    moteChimed: 0,   // Mote cards in both discard piles
  };
}

export class Match {
  constructor(seed = 1) {
    this.rng = mulberry32(seed);
    this.matchSeed = seed;
    this.scores = { you: 0, herald: 0 };
    this.matchTarget = 3;
    this.roundNo = 0;
    this.heraldKnows = { youHand: null, seen: [] }; // what the Herald knows of your hand
    this.round = null;
    this.matchWinner = null;
  }

  nextRound(firstTurn = null) {
    this.roundNo += 1;
    this.round = newRoundState(this.rng);
    this.heraldKnows.youHand = null;
    const order = firstTurn ?? (this.roundNo % 2 === 1 ? 'you' : 'herald');
    this.round.turn = order;
    this.round.phase = 'awaitDraw';
    return this.round;
  }

  say(msg) { this.round.log.push(msg); }
  note(msg) { this.round.notes.push(msg); }

  moteCount() { return this.round.moteChimed; }

  drawFor(seat) {
    const st = this.round;
    const p = st[seat];
    if (st.deck.length === 0) return []; // draw that fizzles: effects that needed a draw are void
    const n = Math.min(p.sageDraw ? 3 : 1, st.deck.length);
    p.sageDraw = false;
    return st.deck.splice(st.deck.length - n, n);
  }

  // beginTurn: draw phase. Returns the pool the player picks from (1 card, or 3 under Sage).
  beginTurn(seat) {
    const st = this.round;
    const p = st[seat];
    p.protected = false; // your own Aegis lapses as your turn begins
    const pool = this.drawFor(seat);
    if (pool.length === 0) {
      st.phase = 'done'; // exhausted mid-effect/draw: end now
      return { pool, end: true };
    }
    if (pool.length === 1) {
      p.hand.push(pool[0]);
      st.phase = 'awaitPlay';
      return { pool, end: false };
    }
    st.phase = 'awaitSage';
    st.pending = { kind: 'sage', seat, pool };
    return { pool, end: false };
  }

  // sageKeep: player chose one of the Sage pool; the rest return and the void re-shuffles.
  sageKeep(keepIdx) {
    const st = this.round, pen = st.pending;
    const p = st[pen.seat];
    const keep = pen.pool.splice(keepIdx, 1)[0];
    p.hand.push(keep);
    for (const c of pen.pool) st.deck.unshift(c);
    for (let i = st.deck.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [st.deck[i], st.deck[j]] = [st.deck[j], st.deck[i]];
    }
    st.pending = null;
    st.phase = 'awaitPlay';
    return keep;
  }

  canPlay(card) { return card.id !== SOV; }

  // playCard: seat plays `card` (must be in hand). Returns a plan the UI animates.
  // plan.steps: sequence of {type, ...} describing what happened; UI performs them,
  // calling back into choose() only when the player must pick.
  playCard(seat, cardId) {
    const st = this.round;
    const p = st[seat];
    const idx = p.hand.findIndex((c) => c.id === cardId);
    if (idx < 0) throw new Error('card not in hand: ' + cardId);
    const card = p.hand[idx];
    if (!this.canPlay(card)) throw new Error('The Sovereign cannot be played');
    p.hand.splice(idx, 1);
    this.toDiscard(seat, card, { selfPlay: true });
    const steps = [];
    this.applyEffect(seat, card, steps);
    return steps;
  }

  toDiscard(seat, card, opts = {}) {
    const st = this.round;
    const p = st[seat];
    p.discard.push(card);
    if (card.id === 'mote') st.moteChimed += 1;
    // burned cards never fire their own effect; the burn path handles Sovereign
    if (opts.burned && card.id === SOV) {
      this.say(`${nameOf(seat)}'s Sovereign is burned!`);
      this.eliminate(seat, { source: opts.source });
    }
  }

  eliminate(seat, { source = null } = {}) {
    const st = this.round;
    const p = st[seat];
    if (p.out) return;
    const heldSov = p.hand.find((c) => c.id === SOV);
    const sovBurned = p.discard.length && p.discard[p.discard.length - 1].id === SOV;
    const carriesSov = heldSov || sovBurned;
    if (carriesSov && source !== 'usurper' && !p.rebornUsed && st.reborn) {
      // The Void returns the Sovereign's bearer with the hidden Reborn card.
      for (const c of p.hand.splice(0)) this.toDiscardQuiet(seat, c);
      p.rebornUsed = true;
      p.hand.push(st.reborn);
      st.reborn = null;
      this.say(`${nameOf(seat)} falls... and the Reborn card returns ${nameOf(seat)} from the void!`);
      return;
    }
    p.out = true;
    for (const c of p.hand.splice(0)) this.toDiscardQuiet(seat, c);
    this.say(seat === 'you' ? `You fall.` : `The Herald falls.`);
  }

  toDiscardQuiet(seat, card) {
    const p = this.round[seat];
    p.discard.push(card);
    if (card.id === 'mote') this.round.moteChimed += 1;
  }

  other(seat) { return seat === 'you' ? 'herald' : 'you'; }

  // The effect engine. Mutates state, pushes plan steps for the UI.
  applyEffect(seat, card, steps) {
    const st = this.round;
    const opp = this.other(seat);
    const foe = st[opp];
    const immune = foe.protected;

    if (card.id === 'mote') {
      if (st.moteChimed === 1) {
        this.say(`The first chime of the Mote. Nothing happens... yet.`);
        return;
      }
      this.say(`The second chime! The court trembles - the Mote acts as The Usurper.`);
      this.execUsurper(seat, steps, 'mote');
      return;
    }
    if (card.id === 'stalker') {
      if (immune) { this.say(`${nameOf(opp)} is guarded; the Stalker's hunt fails.`); return; }
      st.phase = 'awaitPick';
      st.pending = { kind: 'stalker', seat };
      steps.push({ type: 'pickRank', seat });
      return;
    }
    if (card.id === 'oracle') {
      if (immune) { this.say(`${nameOf(opp)} is guarded; the Oracle sees nothing.`); return; }
      steps.push({ type: 'reveal', seat, of: opp });
      if (seat === 'herald') this.heraldKnows.youHand = st.you.hand[0] ? st.you.hand[0].id : null;
      this.say(`${nameOf(seat)}'s Oracle studies ${nameOf(opp)}'s hand.`);
      return;
    }
    if (card.id === 'aegis') {
      st[seat].protected = true;
      this.say(`${nameOf(seat)} raises the Aegis - no decree may touch ${nameOf(seat)} until ${nameOf(seat)}'s next turn.`);
      return;
    }
    if (card.id === 'scourge') {
      if (immune) { this.say(`${nameOf(opp)} is guarded; the Scourge passes over.`); return; }
      const drawn = foe.hand.length >= 1 ? this.drawFor(opp) : [];
      if (drawn.length === 0) { this.say(`The void is empty; the Scourge fizzles.`); return; }
      foe.hand.push(drawn[0]);
      st.phase = 'awaitPick';
      st.pending = { kind: 'scourge', seat, victim: opp };
      steps.push({ type: 'pickBurn', seat, victim: opp, hidden: true });
      return;
    }
    if (card.id === 'arbiter') {
      if (immune) { this.say(`${nameOf(opp)} is guarded; the Arbiter adjourns.`); return; }
      steps.push({ type: 'showdown', seat, of: opp });
      this.resolveShowdown(seat);
      return;
    }
    if (card.id === 'sage') {
      st[seat].sageDraw = true;
      this.say(`${nameOf(seat)} consults the Sage - three futures unfold next turn.`);
      return;
    }
    if (card.id === 'transient') {
      if (immune) { this.say(`${nameOf(opp)} is guarded; the Transient's mirror stays shut.`); return; }
      const mine = st[seat].hand, theirs = foe.hand;
      st[seat].hand = theirs; foe.hand = mine;
      this.say(`${nameOf(seat)} and ${nameOf(opp)} trade hands.`);
      this.heraldKnows.youHand = st.you.hand[0] ? st.you.hand[0].id : null;
      steps.push({ type: 'swap', seat });
      return;
    }
    if (card.id === 'usurper') {
      if (immune) { this.say(`${nameOf(opp)} is guarded; the Usurper's blade finds only prayer.`); return; }
      this.execUsurper(seat, steps, 'usurper');
      return;
    }
  }

  execUsurper(seat, steps, source) {
    const st = this.round;
    const opp = this.other(seat);
    const foe = st[opp];
    const drawn = this.drawFor(opp);
    if (drawn.length === 0) { this.say(`The void is empty; the execution never comes.`); return; }
    foe.hand.push(drawn[0]);
    st.phase = 'awaitPick';
    st.pending = { kind: 'burn', seat, victim: opp, source };
    steps.push({ type: 'pickBurn', seat, victim: opp, hidden: false });
  }

  resolveShowdown(seat) {
    const st = this.round;
    const a = st[seat], b = st[this.other(seat)];
    const ra = a.hand[0] ? a.hand[0].rank : 0, rb = b.hand[0] ? b.hand[0].rank : 0;
    this.say(`The Arbiter weighs the hands: ${ra} against ${rb}.`);
    if (ra === rb) { this.say(`A tie - both fall!`); this.eliminate(seat); this.eliminate(this.other(seat)); }
    else if (ra < rb) this.eliminate(seat);
    else this.eliminate(this.other(seat));
  }

  // The player's pick (or the Herald's) that resolves a pending choice.
  choose(choice) {
    const st = this.round;
    const pen = st.pending;
    if (!pen) throw new Error('no pending choice');
    const steps = [];
    if (pen.kind === 'sage') {
      this.sageKeep(choice);
    } else if (pen.kind === 'stalker') {
      const victim = st[this.other(pen.seat)];
      const guess = choice;
      this.say(`${nameOf(pen.seat)} names rank ${guess}.`);
      steps.push({ type: 'guess', guess, victim: this.other(pen.seat) });
      if (victim.hand[0].rank === guess) {
        this.say(`A true call - ${nameOf(this.other(pen.seat))} holds rank ${guess}!`);
        this.burn(this.other(pen.seat), victim.hand[0], { source: 'stalker' });
      } else {
        this.say(`A false call. ${nameOf(this.other(pen.seat))} does not hold it.`);
      }
      this.clearPick(pen.seat);
    } else if (pen.kind === 'oracle') {
      this.clearPick(pen.seat);
    } else if (pen.kind === 'scourge' || pen.kind === 'burn') {
      const victim = st[pen.victim];
      const idx = choice;
      const card = victim.hand[idx];
      this.say(`${nameOf(pen.seat)} burns a card of ${nameOf(pen.victim)}'s.`);
      victim.hand.splice(idx, 1);
      steps.push({ type: 'burned', card, victim: pen.victim });
      this.burn(pen.victim, card, { source: pen.kind === 'burn' ? 'usurper' : 'scourge' });
      this.clearPick(pen.seat);
    }
    return steps;
  }

  clearPick(seat) {
    this.round.pending = null;
    if (this.round.turn === seat) this.round.phase = 'awaitPlay';
  }

  burn(victimSeat, card, { source }) {
    const st = this.round;
    const p = st[victimSeat];
    if (card.id === SOV) {
      p.discard.push(card);
      this.say(`${nameOf(victimSeat)}'s Sovereign is dragged into the light!`);
      this.eliminate(victimSeat, { source });
    } else {
      p.discard.push(card);
      if (card.id === 'mote') st.moteChimed += 1;
      this.say(`${nameOf(victimSeat)}'s ${card.name} is burned.`);
    }
  }

  // endTurn: called by the flow once effects settle; checks round end conditions.
  endTurn() {
    const st = this.round;
    const { you, herald } = st;
    if (you.out && herald.out) { st.winner = 'tie'; st.phase = 'done'; return this.finishRound(); }
    if (you.out) { st.winner = 'herald'; st.phase = 'done'; return this.finishRound(); }
    if (herald.out) { st.winner = 'you'; st.phase = 'done'; return this.finishRound(); }
    if (st.deck.length === 0) {
      const ry = you.hand[0] ? you.hand[0].rank : 0;
      const rh = herald.hand[0] ? herald.hand[0].rank : 0;
      st.winner = ry === rh ? 'tie' : ry > rh ? 'you' : 'herald';
      this.say(`The void is empty. Hands open: ${ry} against ${rh}.`);
      st.phase = 'done';
      return this.finishRound();
    }
    st.turn = this.other(st.turn);
    st.phase = 'awaitDraw';
    return null;
  }

  finishRound() {
    if (this.round.winner === 'you') this.scores.you += 1;
    if (this.round.winner === 'herald') this.scores.herald += 1;
    if (this.scores.you >= this.matchTarget) this.matchWinner = 'you';
    if (this.scores.herald >= this.matchTarget) this.matchWinner = 'herald';
    return this.round.winner;
  }

  // ============ The Herald: the rival's mind ============
  // Knowledge of your hand lives in heraldKnows.youHand.
  heraldThreat() {
    const st = this.round;
    const known = this.heraldKnows.youHand;
    if (known === SOV) return 1.0;
    if (known) return 0.5;
    // unseen sovereign chance: how much of the unseen pool could be the crown
    const unseen = this.unseenPool();
    const sovs = unseen.filter((c) => c === SOV).length;
    return unseen.length ? sovs / unseen.length : 0;
  }

  unseenPool() {
    // Archetype ids the Herald cannot place: all deck copies minus its own hand,
    // the reborn card (unknown), both discard piles, and your known hand.
    const pool = buildDeck().map((c) => c.id);
    const drop = (arr) => { for (const c of arr) { const i = pool.indexOf(c.id); if (i >= 0) pool.splice(i, 1); } };
    drop(this.round.herald.hand);
    drop(this.round.herald.discard);
    drop(this.round.you.discard);
    if (this.heraldKnows.youHand) { const i = pool.indexOf(this.heraldKnows.youHand); if (i >= 0) pool.splice(i, 1); }
    return pool;
  }

  heraldPickCard() {
    const st = this.round;
    const h = st.herald;
    const playable = h.hand.filter((c) => c.id !== SOV);
    const known = this.heraldKnows.youHand;
    const youProtected = st.you.protected;
    const candidates = playable.map((card) => ({ card, score: this.scorePlay(card, { known, youProtected }) }));
    // holding the Sovereign while the foe is safe: a low hand is still better kept;
    // otherwise lean on the plain value ordering.
    candidates.sort((a, b) => b.score - a.score);
    const pick = candidates[0];
    return { card: pick.card, candidates };
  }

  scorePlay(card, { known, youProtected }) {
    const st = this.round;
    const h = st.herald;
    const threat = this.heraldThreat();
    switch (card.id) {
      case 'mote':
        return st.moteChimed >= 1 && !youProtected ? 82 : 9;
      case 'stalker': {
        if (youProtected) return 8;
        if (known && known !== SOV) return 96;
        const pool = this.unseenPool().filter((id) => id !== SOV);
        return pool.length ? 42 + (18 - pool.length) : 20;
      }
      case 'oracle': return youProtected ? 8 : 46;
      case 'aegis': {
        const danger = known === SOV ? 40 : 14 + Math.round(threat * 40);
        return danger;
      }
      case 'scourge': {
        if (youProtected) return 10;
        if (known === SOV) return 55; // burning the crown only reborns it
        return 58 + Math.round(threat * 30);
      }
      case 'arbiter': {
        if (youProtected) return 9;
        if (known) return h.hand[0].rank > byId(known).rank ? 97 : -10;
        const me = h.hand[0].rank;
        if (me >= 8) return 88;
        if (me >= 6) return 66;
        return 25;
      }
      case 'sage': return st.deck.length >= 4 ? 52 : 40;
      case 'transient': {
        if (youProtected) return 8;
        const mine = h.hand[0];
        if (mine.id === SOV) return 92; // hand the crown away
        if (known) {
          const yours = byId(known).rank;
          return yours > mine.rank ? 78 : 30;
        }
        return mine.rank <= 4 ? 62 : 20;
      }
      case 'usurper': {
        if (youProtected) return 8;
        return 90; // a burn chosen in the open is nearly always lethal leverage
      }
      default: return 30;
    }
  }

  // Herald resolves whatever its play left pending; returns plan steps.
  heraldResolve() {
    const st = this.round;
    const pen = st.pending;
    if (!pen) return [];
    const h = st.herald;
    if (pen.kind === 'sage') {
      let best = 0;
      for (let i = 0; i < pen.pool.length; i++) if (pen.pool[i].rank > pen.pool[best].rank) best = i;
      return this.choose(best);
    }
    if (pen.kind === 'stalker') {
      const guess = this.heraldGuess();
      return this.choose(guess);
    }
    if (pen.kind === 'oracle') {
      return this.choose(null);
    }
    if (pen.kind === 'scourge' || pen.kind === 'burn') {
      const victim = st[pen.victim];
      const known = this.heraldKnows.youHand;
      let idx = 0;
      const drawnIsNew = victim.hand.length === 2;
      if (pen.kind === 'burn') {
        // sees both: kill the Sovereign if shown, else burn the bigger threat
        const ranks = victim.hand.map((c) => (c.id === SOV ? 99 : c.rank));
        idx = ranks.indexOf(Math.max(...ranks));
        if (known && victim.hand[0].id !== known) idx = 1 - victim.hand.findIndex((c) => c.id === known) * 0 + 0; // keep simple
      } else {
        // blind burn: the fresh draw is the wild card, the known card may be safer to leave
        if (drawnIsNew && known && victim.hand[0].id === known) idx = 1;
        else idx = Math.floor(this.rng() * victim.hand.length);
      }
      const steps = this.choose(idx);
      this.heraldKnows.youHand = victim.hand[0] ? victim.hand[0].id : null;
      return steps;
    }
    return [];
  }

  heraldGuess() {
    const st = this.round;
    const known = this.heraldKnows.youHand;
    if (known && known !== SOV) return byId(known).rank;
    const pool = this.unseenPool().filter((id) => id !== SOV);
    const counts = {};
    for (const id of pool) counts[byId(id).rank] = (counts[byId(id).rank] || 0) + 1;
    let best = null, bestN = -1;
    for (const r of Object.keys(counts)) {
      if (counts[r] > bestN) { bestN = counts[r]; best = Number(r); }
    }
    if (best != null) return best;
    // everything else is known dead: guess a random non-Sovereign rank
    const ranks = ARCHETYPES.filter((a) => a.id !== SOV).map((a) => a.rank);
    return ranks[Math.floor(this.rng() * ranks.length)];
  }

  heraldExplain(card) {
    const known = this.heraldKnows.youHand;
    const map = {
      mote: this.moteCount() >= 1 ? 'The second chime hangs over you.' : 'A spark for the court.',
      stalker: known ? `The Herald knows your card.` : 'The Herald hunts blind.',
      oracle: 'The Herald wants a look at you.',
      aegis: 'The Herald fortifies.',
      scourge: 'The Herald reaches for your hand.',
      arbiter: 'The Herald calls the scale.',
      sage: 'The Herald reads futures.',
      transient: 'The Herald covets what you hold.',
      usurper: 'The Usurper draws his blade.',
    };
    return map[card.id] || '';
  }
}

function nameOf(seat) {
  return seat === 'you' ? 'You' : 'The Herald';
}
