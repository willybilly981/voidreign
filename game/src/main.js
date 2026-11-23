// main.js - VOIDREIGN flow driver: input, turn sequencing, and screen routing.

import { Match } from './engine.js';
import { ARCHETYPES } from './cards.js';
import { UI } from './ui.js';
import { cardFace } from './cardart.js';
import { Fx, Sound } from './fx.js';
import { maybeStage } from './shots.js';

const fx = new Fx(document.getElementById('fx'));
fx.start();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let match = null;
let busy = false;
let deadRanks = new Set();

function refresh(revealHerald = null) {
  UI.renderSeats(match, { revealHerald });
  UI.renderLog(match.round);
}

function recountDead() {
  deadRanks = new Set();
  for (const a of ARCHETYPES) {
    const inDiscard = [...match.round.you.discard, ...match.round.herald.discard].filter((c) => c.id === a.id).length;
    if (inDiscard >= a.count) deadRanks.add(a.rank);
  }
}

function burstOn(seat, hue = 46) {
  const zone = seat === 'you' ? document.getElementById('you-hand') : document.getElementById('herald-hand');
  const r = zone.getBoundingClientRect();
  fx.burst((r.left + r.width / 2) * devicePixelRatio, (r.top + r.height / 2) * devicePixelRatio, hue, 34, 1.2);
}

async function animateStep(s) {
  if (s.type === 'reveal') {
    if (s.seat === 'you') {
      const card = match.round.herald.hand[0];
      if (card) {
        UI.overlay(`<div class="ov"><h2>THE ORACLE'S SIGHT</h2>
          <p>The Herald holds:</p><div class="cardshelf"><div class="card size-pick">${cardFace(card, 'pick')}</div></div></div>`);
        await wait(2200);
        UI.overlay(null);
      }
    }
    refresh();
    return;
  }
  if (s.type === 'guard') { Sound.play('guard'); burstOn(s.seat, 96); }
  else if (s.type === 'swap') { Sound.play('swap'); }
  else if (s.type === 'showdown') { Sound.play('play'); await wait(350); }
  else if (s.type === 'burned') { Sound.play('burn'); burstOn(s.victim, 26); }
  else if (s.type === 'reborn') { Sound.play('reborn'); burstOn(s.seat, 46); await wait(350); }
  else if (s.type === 'elim') { Sound.play('elim'); burstOn(s.seat, 356); }
  else if (s.type === 'guess') { Sound.play('pick'); }
  refresh();
  await wait(120);
}

async function playerDraw() {
  busy = true;
  try {
    const res = match.beginTurn('you');
    Sound.play('draw');
    refresh();
    if (res.end) { await settleEnd(); return; }
    if (match.round.phase === 'awaitSage') {
      UI.prompt('The Sage unfolds three futures. Keep one.');
      const chosen = await new Promise((resolve) => UI.showSage(res.pool, resolve));
      UI.overlay(null);
      match.choose(chosen);
      Sound.play('deal');
      refresh();
    }
    const canPlay = match.round.you.hand.some((c) => c.id !== 'sovereign');
    if (!canPlay) {
      UI.prompt('You hold only the crown - it cannot be played. You fall.');
      const steps = [];
      match.eliminate('you', { steps });
      for (const s of steps) await animateStep(s);
      await settleEnd();
      return;
    }
    UI.prompt('Your move - raise a card and play it.<span class="dim">burn their cards, guard your own</span>');
    refresh();
  } finally {
    busy = false;
  }
}

async function playerPlay(card) {
  if (busy || match.round.turn !== 'you' || match.round.phase !== 'awaitPlay') return;
  if (card.id === 'sovereign') return;
  busy = true;
  try {
    UI.liftedUid = null;
    Sound.play('play');
    UI.prompt(`You play ${card.name}.`);
    const steps = match.playCard('you', card.id);
    recountDead();
    refresh();
    await runSteps(steps);
    await settleEnd();
  } finally {
    busy = false;
  }
}

async function runSteps(steps) {
  for (const s of steps) {
    if (s.type === 'pickRank' && s.seat === 'you') {
      const rank = await new Promise((resolve) => UI.showPickRank(deadRanks, resolve));
      UI.overlay(null);
      Sound.play('pick');
      const more = match.choose(rank);
      recountDead();
      refresh();
      await runSteps(more);
      continue;
    }
    if (s.type === 'pickBurn' && s.seat === 'you') {
      const victim = match.round[s.victim];
      const title = s.hidden ? 'THE SCOURGE BURNS' : 'THE USURPER\'S DECREE';
      const idx = await new Promise((resolve) =>
        UI.showPickBurn(victim.hand, { hidden: s.hidden, title }, resolve));
      UI.overlay(null);
      Sound.play('burn');
      const more = match.choose(idx);
      recountDead();
      refresh();
      await runSteps(more);
      continue;
    }
    await animateStep(s);
  }
}

async function settleEnd() {
  const st = match.round;
  const r = match.endTurn();
  refresh(r !== null ? 'all' : null);
  if (r === null) {
    if (st.turn === 'you') await playerDraw();
    else await heraldTurn();
    return;
  }
  await wait(700);
  if (match.matchWinner) {
    Sound.play(match.matchWinner === 'you' ? 'win' : 'lose');
    burstOn(match.matchWinner === 'you' ? 'you' : 'herald', match.matchWinner === 'you' ? 46 : 275);
    UI.showMatchEnd(match.matchWinner, match.scores, () => {
      UI.overlay(null);
      startMatch((Math.random() * 1e9) | 0);
    });
  } else {
    Sound.play(r === 'you' ? 'roundwin' : 'roundlose');
    UI.showRoundEnd(st, match.scores, () => {
      UI.overlay(null);
      beginRound();
    });
  }
}

async function heraldTurn() {
  busy = true;
  try {
    await wait(750);
    const res = match.beginTurn('herald');
    Sound.play('draw');
    refresh();
    UI.prompt('The Herald draws...');
    if (res.end) { await settleEnd(); return; }
    if (match.round.phase === 'awaitSage') {
      UI.prompt('The Herald weighs three futures...');
      await wait(800);
      match.heraldResolve();
      refresh();
    }
    await wait(450);
    const { card } = match.heraldPickCard();
    if (!card) {
      UI.prompt('The Herald holds only the crown - it cannot play and falls.');
      const steps = [];
      match.eliminate('herald', { steps });
      for (const s of steps) await animateStep(s);
      await settleEnd();
      return;
    }
    UI.read(match.heraldExplain(card));
    UI.prompt(`The Herald plays <b>${card.name}</b>.`);
    await wait(600);
    Sound.play('play');
    const steps = match.playCard('herald', card.id);
    recountDead();
    refresh();
    for (const s of steps) await animateStep(s);
    await wait(300);
    let safety = 4;
    while (match.round.pending && match.round.pending.seat === 'herald' && safety-- > 0) {
      const pen = match.round.pending;
      if (pen.kind === 'stalker') {
        UI.prompt('The Herald studies you, naming a rank...');
        await wait(900);
      } else if (pen.kind === 'scourge') {
        UI.prompt('The Scourge burns one of your cards, unseen.');
        await wait(850);
      } else if (pen.kind === 'burn') {
        UI.prompt('The court is shown your cards...');
        await wait(1100);
      }
      const more = match.heraldResolve();
      recountDead();
      for (const s of more) await animateStep(s);
      await wait(250);
    }
    UI.read('');
    await settleEnd();
  } finally {
    busy = false;
  }
}

function beginRound(firstTurn) {
  match.nextRound(firstTurn);
  deadRanks = new Set();
  UI.liftedUid = null;
  UI.read('');
  refresh();
  Sound.play('deal');
  if (match.round.turn === 'you') playerDraw();
  else heraldTurn();
}

function startMatch(seed = 20261123) {
  match = new Match(seed);
  UI.overlay(null);
  beginRound();
}

function showTitleScreen() {
  UI.showTitle(() => {
    Sound.play('roundwin');
    startMatch((Date.now() % 2147483647) | 0);
  }, () => UI.showRules());
}

document.getElementById('you-hand').addEventListener('click', (e) => {
  const el = e.target.closest('.card');
  if (!el || !match) return;
  const card = match.round.you.hand.find((c) => c.uid === el.dataset.uid);
  if (!card) return;
  if (card.id === 'sovereign') { Sound.play('click'); return; }
  if (UI.liftedUid === card.uid) {
    playerPlay(card);
  } else if (match.round.turn === 'you' && match.round.phase === 'awaitPlay' && !busy) {
    UI.liftedUid = card.uid;
    Sound.play('pick');
    UI.prompt(`${card.name} raised - click it again to play.<span class="dim">${card.effect}</span>`);
    refresh();
  }
});

addEventListener('keydown', (e) => {
  if (UI.rulesOpen()) {
    if (e.key === 'Escape' || e.key === 'Enter') UI.closeRules();
    return;
  }
  const ov = document.getElementById('overlay');
  if (ov.classList.contains('on')) {
    if (e.key === 'Enter' || e.key === ' ') {
      const btn = ov.querySelector('#ov-start, #ov-next, #ov-again');
      if (btn) { e.preventDefault(); btn.click(); }
      return;
    }
    const rankBtn = e.key === '0' ? ov.querySelector('.rankbtn[data-rank="10"]')
      : /^[1-9]$/.test(e.key) ? ov.querySelector(`.rankbtn[data-rank="${e.key}"]`) : null;
    if (rankBtn) { rankBtn.click(); return; }
    const pickIdx = ['1', '2', '3'].indexOf(e.key);
    if (pickIdx >= 0) {
      const pickCard = ov.querySelector(`.pickrow .card[data-idx="${pickIdx}"]`);
      if (pickCard) pickCard.click();
    }
    return;
  }
  if (!match || match.round.turn !== 'you' || match.round.phase !== 'awaitPlay' || busy) return;
  const i = ['1', '2', '3'].indexOf(e.key);
  if (i < 0) return;
  const card = match.round.you.hand[i];
  if (!card || card.id === 'sovereign') return;
  playerPlay(card);
});

document.getElementById('btn-sound').addEventListener('click', (e) => {
  Sound.on = !Sound.on;
  e.target.textContent = Sound.on ? 'SOUND' : 'MUTED';
});

document.getElementById('btn-rules').addEventListener('click', () => {
  if (UI.rulesOpen()) UI.closeRules();
  else UI.showRules();
});

const staged = maybeStage();

if (staged) {
  match = staged.match;
  deadRanks = staged.deadRanks ?? new Set();
  refresh(staged.revealHerald ?? null);
  if (staged.overlay === 'win') UI.showMatchEnd('you', match.scores, () => {});
  if (staged.overlay === 'lose') UI.showMatchEnd('herald', match.scores, () => {});
  if (staged.read) UI.read(staged.read);
  if (staged.prompt) UI.prompt(staged.prompt);
  window.__shotReady = true;
} else {
  showTitleScreen();
}
