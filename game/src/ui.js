// ui.js - DOM rendering for VOIDREIGN: seats, hands, discards, chronicle,
// overlays for picks and endings. Pure view: game flow lives in main.js.

import { cardFace, cardBack } from './cardart.js';
import { ARCHETYPES } from './cards.js';

const $ = (id) => document.getElementById(id);

function cardEl(card, size, { playable = false, lifted = false, unplayable = false, back = false } = {}) {
  const div = document.createElement('div');
  div.className = 'card' + (playable ? ' playable' : '') + (lifted ? ' lifted' : '') + (unplayable ? ' unplayable' : '');
  div.dataset.uid = card.uid;
  div.innerHTML = back ? cardBack(size) : cardFace(card, size);
  return div;
}

export const UI = {
  liftedUid: null,

  renderDeck(st) {
    $('deck-count').textContent = `${st.deck.length} cards remain`;
    const stack = $('deck-stack');
    stack.innerHTML = '<div class="deck-card"><i></i></div><div class="deck-card" style="transform:translate(2px,-2px)"><i></i></div><div class="deck-card" style="transform:translate(4px,-4px)"><i></i></div>' +
      `<div class="deck-num">${st.deck.length}</div>`;
    const tok = $('reborn-token');
    tok.classList.toggle('gone', !st.reborn);
    if (st.reborn && !tok.innerHTML) {
      tok.innerHTML = '<div class="deck-card"><i></i></div><div class="token-label">REBORN</div>';
    }
  },

  renderSeats(m, { revealHerald = null } = {}) {
    const st = m.round;
    // chips
    $('chips-you').innerHTML =
      (st.you.protected ? '<span class="chip aegis">GUARDED</span>' : '') +
      (st.you.sageDraw ? '<span class="chip sage">SAGE NEXT DRAW</span>' : '') +
      (st.you.out ? '<span class="chip out">FALLEN</span>' : '');
    $('chips-herald').innerHTML =
      (st.herald.protected ? '<span class="chip aegis">GUARDED</span>' : '') +
      (st.herald.sageDraw ? '<span class="chip sage">SAGE NEXT DRAW</span>' : '') +
      (st.herald.out ? '<span class="chip out">FALLEN</span>' : '');

    // your hand: two cards face up
    const yh = $('you-hand');
    yh.innerHTML = '';
    for (const c of st.you.hand) {
      const canPlay = c.id !== 'sovereign' && st.turn === 'you' && (st.phase === 'awaitPlay');
      const el = cardEl(c, 'hand', {
        playable: canPlay,
        unplayable: c.id === 'sovereign' && st.turn === 'you' && st.phase === 'awaitPlay',
        lifted: this.liftedUid === c.uid,
      });
      el.dataset.rank = c.rank;
      yh.appendChild(el);
    }

    // herald hand: backs, unless revealHerald holds uids (or 'all')
    const hh = $('herald-hand');
    hh.innerHTML = '';
    for (const c of st.herald.hand) {
      const show = revealHerald === 'all' || (revealHerald && revealHerald.has(c.uid));
      hh.appendChild(cardEl(c, 'hand', { back: !show }));
    }
    if (st.herald.out) {
      // leave the last card ghost visible via discard; hand is empty
    }

    // discards
    this.renderDiscard($('you-discard'), st.you.discard);
    this.renderDiscard($('herald-discard'), st.herald.discard);

    // sigils
    this.renderSigils($('sigils-you'), m.scores.you, m.matchTarget);
    this.renderSigils($('sigils-herald'), m.scores.herald, m.matchTarget);
    $('round-no').textContent = `ROUND ${['I','II','III','IV','V','VI','VII'][Math.min(6, m.roundNo - 1)]}`;
    this.renderDeck(st);
  },

  renderSigils(box, n, target) {
    box.innerHTML = '';
    for (let i = 0; i < target; i++) {
      const s = document.createElement('span');
      s.className = 'sigil' + (i < n ? ' on' : '');
      box.appendChild(s);
    }
  },

  renderDiscard(box, pile) {
    box.innerHTML = '';
    for (const c of pile) box.appendChild(cardEl(c, 'mini'));
  },

  renderLog(st) {
    const ul = $('log');
    ul.innerHTML = '';
    const tail = st.log.slice(-22);
    for (const [i, msg] of tail.entries()) {
      const li = document.createElement('li');
      const global = st.log.indexOf(msg);
      li.textContent = msg;
      if (msg.startsWith('You')) li.className = 'me';
      if (/falls|burns|chime|Sovereign|Reborn|Arbiter weighs/.test(msg)) li.classList.add('hi');
      ul.appendChild(li);
    }
    ul.scrollTop = ul.scrollHeight;
  },

  prompt(html) { $('prompt').innerHTML = html; },

  read(text, tag = "HERALD'S READ") {
    $('herald-read').innerHTML = text ? `<span class="read-tag">${tag}</span>${text}` : '';
  },

  overlay(html) {
    const ov = $('overlay');
    if (!html) { ov.classList.remove('on'); ov.innerHTML = ''; return; }
    ov.innerHTML = html;
    ov.classList.add('on');
  },

  // --- pick overlays ---
  showPickRank(deadRanks, onPick) {
    const cells = ARCHETYPES.map((a) => {
      const dead = deadRanks.has(a.rank);
      return `<button class="rankbtn ${dead ? 'dead' : ''}" data-rank="${a.rank}">
        ${a.rank}<span class="rname">${a.short}${dead ? ' ·DEAD' : ''}</span>
      </button>`;
    }).join('');
    this.overlay(`<div class="ov">
      <h2>THE STALKER HUNTS</h2>
      <p>Name the rank you believe the Herald holds.<br>Dimmed ranks cannot be in hand - every copy lies burned.</p>
      <div class="rankgrid">${cells}</div></div>`);
    $('overlay').querySelectorAll('.rankbtn').forEach((b) =>
      b.addEventListener('click', () => onPick(Number(b.dataset.rank))));
  },

  showPickBurn(victimCards, { hidden, title }, onPick) {
    const cards = victimCards.map((c, i) => {
      const div = cardEl(c, 'pick', { back: hidden });
      div.dataset.idx = i;
      return div.outerHTML;
    }).join('');
    this.overlay(`<div class="ov"><h2>${title}</h2>
      <p>${hidden ? 'Choose one of the Herald\'s cards to burn - unseen.' : 'Choose which of the revealed cards burns.'}</p>
      <div class="pickrow">${cards}</div></div>`);
    $('overlay').querySelectorAll('.pickrow .card').forEach((el) =>
      el.addEventListener('click', () => onPick(Number(el.dataset.idx))));
  },

  showSage(pool, onPick) {
    this.overlay(`<div class="ov"><h2>THE SAGE UNFOLDS THREE FUTURES</h2>
      <p>Keep one. The others return to the void.</p>
      <div class="pickrow" id="sage-row"></div></div>`);
    const row = $('sage-row');
    pool.forEach((c, i) => {
      const el = cardEl(c, 'pick');
      el.addEventListener('click', () => onPick(i));
      row.appendChild(el);
    });
  },

  showRoundEnd(round, scores, onNext) {
    const w = round.winner;
    const title = w === 'tie' ? 'A MUTUAL FALL' : w === 'you' ? 'THE ROUND IS YOURS' : 'THE HERALD TAKES THE ROUND';
    const cls = w === 'you' ? 'win' : 'lose';
    this.overlay(`<div class="ov end">
      <h1 class="${cls}" style="font-size:38px;letter-spacing:7px">${title}</h1>
      <div class="scoreline">YOU ${scores.you} - ${scores.herald} THE HERALD</div>
      <p>First to three sigils claims the court.</p>
      <button class="bigbtn" id="ov-next">NEXT ROUND</button></div>`);
    $('ov-next').addEventListener('click', onNext);
  },

  showMatchEnd(winner, scores, onAgain) {
    const win = winner === 'you';
    this.overlay(`<div class="ov end">
      <h1 class="${win ? 'win' : 'lose'}">${win ? 'REIGN CLAIMED' : 'THE COURT REMEMBERS YOU'}</h1>
      <p class="sub">${win ? 'Three sigils. The void kneels to the Heir.' : 'The Herald keeps the shattered throne... this time.'}</p>
      <div class="scoreline">YOU ${scores.you} - ${scores.herald} THE HERALD</div>
      <button class="bigbtn" id="ov-again">${win ? 'DEFEND THE CROWN' : 'DEMAND REMATCH'}</button></div>`);
    $('ov-again').addEventListener('click', onAgain);
  },

  showTitle(onStart, onRules) {
    this.overlay(`<div class="ov title">
      <h1>VOIDREIGN</h1>
      <p class="tagline">a duel of the empty court</p>
      <p class="court">Eighteen cards. One hidden Reborn card. Two rivals.<br>
      Burn their Sovereign and the void returns them - unless the Usurper's own blade struck.</p>
      <button class="bigbtn" id="ov-start">TAKE THE TABLE</button>
      <button class="bigbtn ghost" id="ov-rules">LEARN THE LAW</button>
      <p class="sub">First to three rounds · mouse or keys 1-3 · sound on click</p></div>`);
    $('ov-start').addEventListener('click', onStart);
    $('ov-rules').addEventListener('click', onRules);
  },

  showRules(onBack) {
    const rows = ARCHETYPES.map((a) =>
      `<div><b>${a.rank} · ${a.name}</b> (${a.count}×) - ${a.effect}</div>`).join('');
    this.overlay(`<div class="ov"><h2>THE LAW OF THE EMPTY COURT</h2>
      <p>Each turn: draw one, play one. Burn their cards, guard your own.<br>
      When the deck runs out, the higher hand takes the round. First to <b>three rounds</b> wins.</p>
      <div class="rulelist">${rows}
      <div><b>THE REBORN CARD</b> - one card sits face down beside the deck. If your Sovereign is burned
      by anything but the Usurper's own decree, you fall and return holding it instead.</div></div>
      <button class="bigbtn" id="ov-back">BACK</button></div>`);
    $('ov-back').addEventListener('click', onBack);
  },
};
