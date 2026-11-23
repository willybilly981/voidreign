// engine.js - VOIDREIGN rules core and the Herald AI.
// Pure logic (no DOM), seeded for deterministic tests and screenshots.

import { ARCHETYPES, buildDeck, byId } from './cards.js';

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

function freshSeat() {
  return {
    hand: [],
    discard: [],
    protected: false,
    sageDraw: false,
    out: false,
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
  const reborn = deck.pop();
  return {
    deck, reborn, you, herald,
    turn: 'you', phase: 'awaitDraw',
    pending: null,
    lastPlayed: null,
    log: [],
    winner: null,
    moteChimed: 0,
  };
}

export class Match {
  constructor(seed = 1) {
    this.rng = mulberry32(seed);
    this.scores = { you: 0, herald: 0 };
    this.matchTarget = 3;
    this.roundNo = 0;
    this.heraldKnows = { youCard: null };
    this.round = null;
    this.matchWinner = null;
  }

  nextRound(firstTurn = null) {
    this.roundNo += 1;
    this.round = newRoundState(this.rng);
    this.heraldKnows.youCard = null;
    this.round.turn = firstTurn ?? (this.roundNo % 2 === 1 ? 'you' : 'herald');
    this.round.phase = 'awaitDraw';
    return this.round;
  }

  say(msg) { this.round.log.push(msg); }

  rememberYouCard(card) {
    this.heraldKnows.youCard = card ? { uid: card.uid, id: card.id } : null;
  }

  forgetYouUid(uid) {
    if (this.heraldKnows.youCard && this.heraldKnows.youCard.uid === uid) {
      this.heraldKnows.youCard = null;
    }
  }

  knownYouId() {
    return this.heraldKnows.youCard ? this.heraldKnows.youCard.id : null;
  }

  // Turn draw: respects Sage (up to 3 cards).
  drawForTurn(seat) {
    const st = this.round;
    const p = st[seat];
    if (st.deck.length === 0) return [];
    const n = Math.min(p.sageDraw ? 3 : 1, st.deck.length);
    p.sageDraw = false;
    return st.deck.splice(st.deck.length - n, n);
  }

  // Forced single draw from effects (Scourge/Usurper) must not consume victim's Sage flag.
  drawOne() {
    const st = this.round;
    return st.deck.length ? st.deck.pop() : null;
  }

  beginTurn(seat) {
    const st = this.round;
    const p = st[seat];
    p.protected = false;
    const pool = this.drawForTurn(seat);
    if (pool.length === 0) {
      st.phase = 'done';
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

  sageKeep(keepIdx) {
    const st = this.round, pen = st.pending;
    if (keepIdx < 0 || keepIdx >= pen.pool.length) throw new Error('invalid sage choice');
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

  playCard(seat, cardId) {
    const st = this.round;
    const p = st[seat];
    const idx = p.hand.findIndex((c) => c.id === cardId);
    if (idx < 0) throw new Error('card not in hand: ' + cardId);
    const card = p.hand[idx];
    if (!this.canPlay(card)) throw new Error('The Sovereign cannot be played');
    p.hand.splice(idx, 1);
    if (seat === 'you') this.forgetYouUid(card.uid);
    this.toDiscard(seat, card);
    st.lastPlayed = { seat, card };
    const steps = [];
    this.applyEffect(seat, card, steps);
    return steps;
  }

  toDiscard(seat, card) {
    const st = this.round;
    st[seat].discard.push(card);
    if (card.id === 'mote') st.moteChimed += 1;
  }

  eliminate(seat, { source = null, steps = null } = {}) {
    const st = this.round;
    const p = st[seat];
    if (p.out) return null;
    const heldSov = p.hand.some((c) => c.id === SOV);
    const sovBurned = p.discard.length > 0 && p.discard[p.discard.length - 1].id === SOV;
    if ((heldSov || sovBurned) && source !== 'usurper' && !p.rebornUsed && st.reborn) {
      for (const c of p.hand.splice(0)) this.toDiscard(seat, c);
      p.rebornUsed = true;
      p.hand.push(st.reborn);
      st.reborn = null;
      if (seat === 'you') this.heraldKnows.youCard = null;
      this.say(`${nameOf(seat)} falls... and the Reborn card returns ${nameOf(seat)} from the void!`);
      if (steps) steps.push({ type: 'reborn', seat });
      return 'reborn';
    }
    p.out = true;
    for (const c of p.hand.splice(0)) this.toDiscard(seat, c);
    if (seat === 'you') this.heraldKnows.youCard = null;
    this.say(seat === 'you' ? 'You fall.' : 'The Herald falls.');
    if (steps) steps.push({ type: 'elim', seat });
    return 'out';
  }

  other(seat) { return seat === 'you' ? 'herald' : 'you'; }

  applyEffect(seat, card, steps) {
    const st = this.round;
    const opp = this.other(seat);
    const foe = st[opp];
    const immune = foe.protected;

    if (card.id === 'mote') {
      if (st.moteChimed === 1) {
        this.say('The first chime of the Mote. Nothing happens... yet.');
        return;
      }
      if (immune) { this.say(`The second chime rings out - but ${nameOf(opp)} is guarded.`); return; }
      this.say('The second chime! The court trembles - the Mote acts as The Usurper.');
      this.execUsurper(seat, steps);
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
      if (seat === 'herald') this.rememberYouCard(st.you.hand[0] ?? null);
      this.say(`${nameOf(seat)}'s Oracle studies ${nameOf(opp)}'s hand.`);
      return;
    }
    if (card.id === 'aegis') {
      st[seat].protected = true;
      steps.push({ type: 'guard', seat });
      this.say(`${nameOf(seat)} raises the Aegis - guarded until next turn.`);
      return;
    }
    if (card.id === 'scourge') {
      if (immune) { this.say(`${nameOf(opp)} is guarded; the Scourge passes over.`); return; }
      const drawn = foe.hand.length >= 1 ? this.drawOne() : null;
      if (!drawn) { this.say('The void is empty; the Scourge fizzles.'); return; }
      foe.hand.push(drawn);
      st.phase = 'awaitPick';
      st.pending = { kind: 'scourge', seat, victim: opp };
      steps.push({ type: 'pickBurn', seat, victim: opp, hidden: true });
      return;
    }
    if (card.id === 'arbiter') {
      if (immune) { this.say(`${nameOf(opp)} is guarded; the Arbiter adjourns.`); return; }
      steps.push({ type: 'showdown', seat, of: opp });
      this.resolveShowdown(seat, steps);
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
      this.rememberYouCard(st.you.hand[0] ?? null);
      steps.push({ type: 'swap', seat });
      return;
    }
    if (card.id === 'usurper') {
      if (immune) { this.say(`${nameOf(opp)} is guarded; the Usurper's blade finds only prayer.`); return; }
      this.execUsurper(seat, steps);
    }
  }

  execUsurper(seat, steps) {
    const st = this.round;
    const opp = this.other(seat);
    const foe = st[opp];
    const drawn = this.drawOne();
    if (!drawn) { this.say('The void is empty; the execution never comes.'); return; }
    foe.hand.push(drawn);
    st.phase = 'awaitPick';
    st.pending = { kind: 'burn', seat, victim: opp };
    steps.push({ type: 'pickBurn', seat, victim: opp, hidden: false });
  }

  resolveShowdown(seat, steps) {
    const st = this.round;
    const opp = this.other(seat);
    const a = st[seat], b = st[opp];
    const ra = a.hand[0] ? a.hand[0].rank : 0;
    const rb = b.hand[0] ? b.hand[0].rank : 0;
    this.say(`The Arbiter weighs the hands: ${ra} against ${rb}.`);
    if (ra === rb) {
      this.say('A tie - both fall!');
      this.eliminate(seat, { steps });
      this.eliminate(opp, { steps });
    } else if (ra < rb) {
      this.eliminate(seat, { steps });
    } else {
      this.eliminate(opp, { steps });
    }
  }

  choose(choice) {
    const st = this.round;
    const pen = st.pending;
    if (!pen) throw new Error('no pending choice');
    const steps = [];
    if (pen.kind === 'sage') {
      this.sageKeep(choice);
    } else if (pen.kind === 'stalker') {
      const opp = this.other(pen.seat);
      const victim = st[opp];
      const guess = Number(choice);
      this.say(`${nameOf(pen.seat)} names rank ${guess}.`);
      steps.push({ type: 'guess', guess, victim: opp });
      if (victim.hand[0] && victim.hand[0].rank === guess) {
        this.say(`A true call - ${nameOf(opp)} holds rank ${guess}!`);
        this.eliminate(opp, { source: 'stalker', steps });
      } else {
        this.say(`A false call. ${nameOf(opp)} does not hold it.`);
      }
      this.clearPick(pen.seat);
    } else if (pen.kind === 'scourge' || pen.kind === 'burn') {
      const victim = st[pen.victim];
      if (choice < 0 || choice >= victim.hand.length) throw new Error('invalid burn index');
      const card = victim.hand.splice(choice, 1)[0];
      if (pen.victim === 'you') this.forgetYouUid(card.uid);
      this.say(`${nameOf(pen.seat)} burns a card of ${nameOf(pen.victim)}'s.`);
      steps.push({ type: 'burned', card, victim: pen.victim });
      this.burn(pen.victim, card, { source: pen.kind === 'burn' ? 'usurper' : 'scourge', steps });
      this.clearPick(pen.seat);
    }
    return steps;
  }

  clearPick(seat) {
    this.round.pending = null;
    if (this.round.turn === seat) this.round.phase = 'awaitPlay';
  }

  burn(victimSeat, card, { source, steps }) {
    const p = this.round[victimSeat];
    if (card.id === SOV) {
      p.discard.push(card);
      this.say(`${nameOf(victimSeat)}'s Sovereign is dragged into the light!`);
      this.eliminate(victimSeat, { source, steps });
    } else {
      this.toDiscard(victimSeat, card);
      this.say(`${nameOf(victimSeat)}'s ${card.name} is burned.`);
    }
  }

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

  heraldThreat() {
    const known = this.knownYouId();
    if (known === SOV) return 1.0;
    if (known) return 0.5;
    const unseen = this.unseenPool();
    const sovs = unseen.filter((c) => c === SOV).length;
    return unseen.length ? sovs / unseen.length : 0;
  }

  unseenPool() {
    const pool = buildDeck().map((c) => c.id);
    const drop = (arr) => { for (const c of arr) { const i = pool.indexOf(c.id); if (i >= 0) pool.splice(i, 1); } };
    drop(this.round.herald.hand);
    drop(this.round.herald.discard);
    drop(this.round.you.discard);
    const known = this.knownYouId();
    if (known) { const i = pool.indexOf(known); if (i >= 0) pool.splice(i, 1); }
    return pool;
  }

  heraldPickCard() {
    const st = this.round;
    const playable = st.herald.hand.filter((c) => c.id !== SOV);
    if (!playable.length) return { card: null, candidates: [] };
    const known = this.knownYouId();
    const youProtected = st.you.protected;
    const candidates = playable.map((card) => ({ card, score: this.scorePlay(card, { known, youProtected }) }));
    candidates.sort((a, b) => b.score - a.score);
    return { card: candidates[0].card, candidates };
  }

  scorePlay(card, { known, youProtected }) {
    const st = this.round;
    const h = st.herald;
    // evaluate based on the other card that stays in hand after playing `card`
    const kept = h.hand.find((c) => c !== card) || h.hand[0];
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
      case 'aegis':
        return known === SOV ? 40 : 14 + Math.round(threat * 40);
      case 'scourge': {
        if (youProtected) return 10;
        if (known === SOV) return 55;
        return 58 + Math.round(threat * 30);
      }
      case 'arbiter': {
        if (youProtected) return 9;
        if (known) return kept.rank > byId(known).rank ? 97 : -10;
        if (kept.rank >= 8) return 88;
        if (kept.rank >= 6) return 66;
        return 25;
      }
      case 'sage': return st.deck.length >= 4 ? 52 : 40;
      case 'transient': {
        if (youProtected) return 8;
        if (kept.id === SOV) return 92;
        if (known) return byId(known).rank > kept.rank ? 78 : 30;
        return kept.rank <= 4 ? 62 : 20;
      }
      case 'usurper':
        return youProtected ? 8 : 90;
      default: return 30;
    }
  }

  heraldResolve() {
    const st = this.round;
    const pen = st.pending;
    if (!pen) return [];
    if (pen.kind === 'sage') {
      let best = 0;
      for (let i = 1; i < pen.pool.length; i++) if (pen.pool[i].rank > pen.pool[best].rank) best = i;
      return this.choose(best);
    }
    if (pen.kind === 'stalker') {
      return this.choose(this.heraldGuess());
    }
    if (pen.kind === 'scourge' || pen.kind === 'burn') {
      const victim = st[pen.victim];
      const knownUid = this.heraldKnows.youCard?.uid ?? null;
      let idx = 0;
      if (pen.kind === 'burn') {
        const ranks = victim.hand.map((c) => (c.id === SOV ? 99 : c.rank));
        idx = ranks.indexOf(Math.max(...ranks));
      } else {
        const knownPos = knownUid ? victim.hand.findIndex((c) => c.uid === knownUid) : -1;
        if (knownPos >= 0 && victim.hand.length === 2) {
          // burn the newly drawn unseen card when the known card is already tracked
          idx = knownPos === 0 ? 1 : 0;
        } else {
          idx = Math.floor(this.rng() * victim.hand.length);
        }
      }
      const steps = this.choose(idx);
      // only open execution (burn) reveals the survivor; blind scourge keeps it unseen
      if (pen.kind === 'burn') this.rememberYouCard(victim.hand[0] ?? null);
      return steps;
    }
    return [];
  }

  heraldGuess() {
    const known = this.knownYouId();
    if (known && known !== SOV) return byId(known).rank;
    const pool = this.unseenPool().filter((id) => id !== SOV);
    const counts = {};
    for (const id of pool) counts[byId(id).rank] = (counts[byId(id).rank] || 0) + 1;
    let best = null, bestN = -1;
    for (const r of Object.keys(counts)) {
      if (counts[r] > bestN) { bestN = counts[r]; best = Number(r); }
    }
    if (best != null) return best;
    const ranks = ARCHETYPES.filter((a) => a.id !== SOV).map((a) => a.rank);
    return ranks[Math.floor(this.rng() * ranks.length)];
  }

  heraldExplain(card) {
    const known = this.knownYouId();
    const map = {
      mote: this.round.moteChimed >= 1 ? 'The second chime hangs over you.' : 'A spark for the court.',
      stalker: known ? 'The Herald knows your card.' : 'The Herald hunts blind.',
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
