// ui.js - DOM rendering for VOIDREIGN.

import { cardFace, cardBack, esc } from './cardart.js';
import { ARCHETYPES, byId } from './cards.js';

const $ = (id) => document.getElementById(id);

function roman(n) {
  const table = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let rem = Math.max(1, n), out = '';
  for (const [val, sym] of table) {
    while (rem >= val) { out += sym; rem -= val; }
  }
  return out;
}

function cardEl(card, size, { playable = false, lifted = false, unplayable = false, back = false } = {}) {
  const div = document.createElement('div');
  div.className = `card size-${size}` +
    (playable ? ' playable' : '') +
    (lifted ? ' lifted' : '') +
    (unplayable ? ' unplayable' : '');
  div.dataset.uid = card.uid;
  div.innerHTML = back ? cardBack(size) : cardFace(card, size);
  return div;
}

export const UI = {
  liftedUid: null,

  setTitleMode(on) {
    $('board').classList.toggle('title-mode', on);
  },

  renderDeck(st) {
    $('deck-count').textContent = `${st.deck.length} ${st.deck.length === 1 ? 'card' : 'cards'} remain`;
    const stack = $('deck-stack');
    stack.innerHTML =
      '<div class="deck-card"><i></i></div>' +
      '<div class="deck-card" style="transform:translate(2px,-2px)"><i></i></div>' +
      '<div class="deck-card" style="transform:translate(4px,-4px)"><i></i></div>' +
      `<div class="deck-num">${st.deck.length}</div>`;
    const tok = $('reborn-token');
    tok.classList.toggle('gone', !st.reborn);
    if (!tok.innerHTML) {
      tok.innerHTML = '<div class="deck-card"><i></i></div><div class="token-label">REBORN</div>';
    }
  },

  renderLastPlayed(last) {
    const slot = $('block-slot');
    slot.innerHTML = '';
    if (!last) return;
    const wrap = document.createElement('div');
    wrap.className = 'played-wrap';
    const tag = document.createElement('div');
    tag.className = 'played-tag';
    tag.textContent = last.seat === 'you' ? 'LAST PLAY · YOU' : 'LAST PLAY · THE HERALD';
    wrap.appendChild(tag);
    wrap.appendChild(cardEl(last.card, 'tabled'));
    slot.appendChild(wrap);
  },

  renderSeats(m, { revealHerald = null } = {}) {
    const st = m.round;
    $('chips-you').innerHTML =
      (st.you.protected ? '<span class="chip aegis">GUARDED</span>' : '') +
      (st.you.sageDraw ? '<span class="chip sage">SAGE NEXT DRAW</span>' : '') +
      (st.you.out ? '<span class="chip out">FALLEN</span>' : '');
    $('chips-herald').innerHTML =
      (st.herald.protected ? '<span class="chip aegis">GUARDED</span>' : '') +
      (st.herald.sageDraw ? '<span class="chip sage">SAGE NEXT DRAW</span>' : '') +
      (st.herald.out ? '<span class="chip out">FALLEN</span>' : '');

    const yh = $('you-hand');
    yh.innerHTML = '';
    for (const c of st.you.hand) {
      const canPlay = c.id !== 'sovereign' && st.turn === 'you' && st.phase === 'awaitPlay';
      const el = cardEl(c, 'hand', {
        playable: canPlay,
        unplayable: c.id === 'sovereign' && st.turn === 'you' && st.phase === 'awaitPlay',
        lifted: this.liftedUid === c.uid,
      });
      el.dataset.rank = c.rank;
      yh.appendChild(el);
    }

    const hh = $('herald-hand');
    hh.innerHTML = '';
    for (const c of st.herald.hand) {
      const show = revealHerald === 'all' || (revealHerald && revealHerald.has(c.uid));
      hh.appendChild(cardEl(c, 'hand', { back: !show }));
    }

    this.renderDiscard($('you-discard'), st.you.discard);
    this.renderDiscard($('herald-discard'), st.herald.discard);
    this.renderLastPlayed(st.lastPlayed);

    this.renderSigils($('sigils-you'), m.scores.you, m.matchTarget);
    this.renderSigils($('sigils-herald'), m.scores.herald, m.matchTarget);
    $('round-no').textContent = `ROUND ${roman(m.roundNo)}`;
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
    for (const msg of st.log.slice(-22)) {
      const li = document.createElement('li');
      li.textContent = msg;
      if (msg.startsWith('You')) li.className = 'me';
      if (/falls|burns|chime|Sovereign|Reborn|Arbiter weighs/.test(msg)) li.classList.add('hi');
      ul.appendChild(li);
    }
    ul.scrollTop = ul.scrollHeight;
  },

  prompt(html) { $('prompt').innerHTML = html; },

  read(text, tag = "HERALD'S READ") {
    const box = $('herald-read');
    box.innerHTML = '';
    if (!text) return;
    const span = document.createElement('span');
    span.className = 'read-tag';
    span.textContent = tag;
    box.appendChild(span);
    box.appendChild(document.createTextNode(text));
  },

  overlay(html) {
    const ov = $('overlay');
    if (!html) { ov.classList.remove('on'); ov.innerHTML = ''; return; }
    ov.innerHTML = html;
    ov.classList.add('on');
  },

  rulesOpen() {
    return $('rules-overlay').classList.contains('on');
  },

  closeRules() {
    const ro = $('rules-overlay');
    ro.classList.remove('on');
    ro.innerHTML = '';
  },

  showPickRank(deadRanks, onPick) {
    let picked = false;
    const cells = ARCHETYPES.map((a) => {
      const dead = deadRanks.has(a.rank);
      return `<button class="rankbtn ${dead ? 'dead' : ''}" data-rank="${a.rank}">
        ${a.rank}<span class="rname">${a.short}${dead ? ' ·DEAD' : ''}</span>
      </button>`;
    }).join('');
    this.overlay(`<div class="ov">
      <h2>THE STALKER HUNTS</h2>
      <p>Name the rank you believe the Herald holds (keys 1-9, 0 for 10).<br>Dimmed ranks have every copy burned.</p>
      <div class="rankgrid">${cells}</div></div>`);
    $('overlay').querySelectorAll('.rankbtn').forEach((b) =>
      b.addEventListener('click', () => {
        if (picked) return;
        picked = true;
        onPick(Number(b.dataset.rank));
      }));
  },

  showPickBurn(victimCards, { hidden, title }, onPick) {
    let picked = false;
    const cards = victimCards.map((c, i) => {
      const div = cardEl(c, 'pick', { back: hidden });
      div.dataset.idx = i;
      return div.outerHTML;
    }).join('');
    this.overlay(`<div class="ov"><h2>${esc(title)}</h2>
      <p>${hidden ? 'Choose one of the Herald\'s cards to burn - unseen (keys 1-2).' : 'Choose which revealed card burns (keys 1-2).'}</p>
      <div class="pickrow">${cards}</div></div>`);
    $('overlay').querySelectorAll('.pickrow .card').forEach((el) =>
      el.addEventListener('click', () => {
        if (picked) return;
        picked = true;
        onPick(Number(el.dataset.idx));
      }));
  },

  showSage(pool, onPick) {
    let picked = false;
    this.overlay(`<div class="ov"><h2>THE SAGE UNFOLDS THREE FUTURES</h2>
      <p>Keep one (click or press 1-${pool.length}). The others return to the void.</p>
      <div class="pickrow" id="sage-row"></div></div>`);
    const row = $('sage-row');
    pool.forEach((c, i) => {
      const el = cardEl(c, 'pick');
      el.dataset.idx = i;
      el.addEventListener('click', () => {
        if (picked) return;
        picked = true;
        onPick(i);
      });
      row.appendChild(el);
    });
  },

  showRoundEnd(round, scores, onNext) {
    let done = false;
    const w = round.winner;
    const title = w === 'tie' ? 'A MUTUAL FALL' : w === 'you' ? 'THE ROUND IS YOURS' : 'THE HERALD TAKES THE ROUND';
    const cls = w === 'you' ? 'win' : 'lose';
    this.overlay(`<div class="ov end">
      <h1 class="${cls}" style="font-size:36px;letter-spacing:7px">${title}</h1>
      <div class="scoreline">YOU ${scores.you} - ${scores.herald} THE HERALD</div>
      <p>First to three sigils claims the court.</p>
      <button class="bigbtn" id="ov-next">NEXT ROUND</button></div>`);
    $('ov-next').addEventListener('click', () => { if (!done) { done = true; onNext(); } });
  },

  showMatchEnd(winner, scores, onAgain) {
    let done = false;
    const win = winner === 'you';
    this.overlay(`<div class="ov end">
      <h1 class="${win ? 'win' : 'lose'}">${win ? 'REIGN CLAIMED' : 'THE COURT REMEMBERS YOU'}</h1>
      <p class="sub">${win ? 'Three sigils. The void kneels to the Heir.' : 'The Herald keeps the shattered throne... this time.'}</p>
      <div class="scoreline">YOU ${scores.you} - ${scores.herald} THE HERALD</div>
      <button class="bigbtn" id="ov-again">${win ? 'DEFEND THE CROWN' : 'DEMAND REMATCH'}</button></div>`);
    $('ov-again').addEventListener('click', () => { if (!done) { done = true; onAgain(); } });
  },

  showTitle(onStart, onRules) {
    this.setTitleMode(true);
    const fanIds = ['oracle', 'scourge', 'sovereign', 'usurper', 'aegis'];
    const fanHtml = fanIds.map((id, i) => {
      const c = byId(id);
      const deg = (i - 2) * 8;
      const dy = Math.abs(i - 2) * 10;
      return `<div class="card size-tabled fan-card" style="transform:translateY(${dy}px) rotate(${deg}deg)">${cardFace(c, 'tabled')}</div>`;
    }).join('');
    this.overlay(`<div class="ov title">
      <h1>VOIDREIGN</h1>
      <p class="tagline">a duel of the empty court</p>
      <div class="title-fan">${fanHtml}</div>
      <p class="court">Eighteen cards. One hidden Reborn card. Two rivals.<br>
      Burn their Sovereign and the void returns them - unless the Usurper's own blade struck.</p>
      <button class="bigbtn" id="ov-start">TAKE THE TABLE</button>
      <button class="bigbtn ghost" id="ov-rules">LEARN THE LAW</button>
      <p class="sub">First to three rounds · mouse or keys 1-3, Enter · synthesized sound</p></div>`);
    $('ov-start').addEventListener('click', () => { this.setTitleMode(false); onStart(); });
    $('ov-rules').addEventListener('click', onRules);
  },

  showRules() {
    const rows = ARCHETYPES.map((a) =>
      `<div><b>${a.rank} · ${esc(a.name)}</b> (${a.count}x) - ${esc(a.effect)}</div>`).join('');
    const ro = $('rules-overlay');
    ro.innerHTML = `<div class="ov"><h2>THE LAW OF THE EMPTY COURT</h2>
      <p>Each turn: draw one, play one. Burn their cards, guard your own.<br>
      When the deck runs out, the higher hand takes the round. First to <b>three rounds</b> wins.</p>
      <div class="rulelist">${rows}
      <div><b>THE REBORN CARD</b> - one card sits face down beside the deck. If you fall while holding or
      burning the Sovereign by anything other than the Usurper's decree, you return holding it instead.</div></div>
      <button class="bigbtn" id="ov-back">BACK</button></div>`;
    ro.classList.add('on');
    $('ov-back').addEventListener('click', () => this.closeRules());
  },
};
