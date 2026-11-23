// main.js - VOIDREIGN flow driver: input, turn sequencing, the Herald's
// telegraphed turns, and screen routing. Rules live in engine.js, pixels in ui.js.

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
let deadRanks = new Set(); // ranks with every copy burned (for the Stalker picker)

function all() { return UI; }

function refresh(revealHerald = null) {
  UI.renderSeats(match, { revealHerald });
  UI.renderLog(match.round);
}

function recountDead() {
  const seen = new Set();
  for (const c of match.round.you.discard) seen.add(c.id);
  for (const c of match.round.herald.discard) seen.add(c.id);
  deadRanks = new Set();
  for (const a of ARCHETYPES) {
    const copies = a.id === 'sovereign' ? a.count : a.count;
    const inDiscard = [...match.round.you.discard, ...match.round.herald.discard].filter((c) => c.id === a.id).length;
    if (inDiscard >= copies) deadRanks.add(a.rank);
  }
}

function centerOf(el) {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

function burstOn(seat, hue = 46) {
  const zone = seat === 'you' ? document.getElementById('you-hand') : document.getElementById('herald-hand');
  const [x, y] = centerOf(zone);
  fx.burst(x * devicePixelRatio, y * devicePixelRatio, hue, 34, 1.2);
}

// ---------- turn flow ----------

async function playerDraw() {
  const res = match.beginTurn('you');
  Sound.play('draw');
  refresh();
  if (res.end) { await settleEnd(); return; }
  if (match.round.phase === 'awaitSage') {
    UI.prompt('The Sage unfolds three futures. Keep one.');
    UI.showSage(res.pool, (i) => {
      UI.overlay(null);
      match.choose(i);
      Sound.play('deal');
      refresh();
      playerAwait();
    });
    return;
  }
  playerAwait();
}

function playerAwait() {
  if (match.round.phase === 'awaitPick') { handlePending('you'); return; }
  UI.prompt('Your move - raise a card and play it.<span class="dim">burn their cards, guard your own</span>');
  refresh();
}

async function playerPlay(card) {
  if (busy || match.round.turn !== 'you') return;
  if (match.round.phase !== 'awaitPlay') return;
  if (card.id === 'sovereign') return;
  busy = true;
  UI.liftedUid = null;
  Sound.play('play');
  UI.prompt(`You play ${card.name}.`);
  const steps = match.playCard('you', card.id);
  recountDead();
  refresh();
  await runSteps(steps, 'you');
  busy = false;
}

async function runSteps(steps, actor) {
  for (const s of steps) {
    if (s.type === 'pickRank' && s.seat === 'you') {
      UI.showPickRank(deadRanks, async (rank) => {
        UI.overlay(null);
        Sound.play('pick');
        const more = match.choose(rank);
        recountDead();
        refresh();
        await runSteps(more, 'you');
      });
      return; // resume in the callback
    }
    if (s.type === 'pickBurn' && s.seat === 'you') {
      const victim = match.round[s.victim];
      const title = s.hidden ? 'THE SCOURGE BURNS' : 'THE USURPER\'S DECREE';
      UI.showPickBurn(victim.hand, { hidden: s.hidden, title }, async (idx) => {
        UI.overlay(null);
        Sound.play('burn');
        const more = match.choose(idx);
        recountDead();
        refresh();
        await runSteps(more, 'you');
      });
      return;
    }
    if (s.type === 'reveal') {
      // Oracle: show the rival's hand to the picker alone.
      if (s.seat === 'you') {
        const card = match.round.herald.hand[0];
        if (card) {
          UI.overlay(`<div class="ov"><h2>THE ORACLE'S SIGHT</h2>
            <p>The Herald holds:</p><div class="cardshelf">${cardFace(card, 'pick')}</div></div>`);
          await wait(2300);
          UI.overlay(null);
        }
      }
      refresh();
      continue;
    }
    if (s.type === 'swap') { Sound.play('swap'); }
    if (s.type === 'showdown') { Sound.play('play'); await wait(350); }
    if (s.type === 'burned') {
      Sound.play('burn');
      burstOn(s.victim, 26);
    }
    if (s.type === 'guess') { Sound.play('pick'); }
    refresh();
    await wait(120);
  }
  await settleEnd();
}

// A pending choice belonging to the player after their play.
function handlePending(seat) {
  const pen = match.round.pending;
  if (!pen || pen.seat !== 'you') return;
  if (pen.kind === 'stalker') {
    UI.showPickRank(deadRanks, async (rank) => {
      UI.overlay(null);
      Sound.play('pick');
      const more = match.choose(rank);
      recountDead();
      refresh();
      await runSteps(more, 'you');
    });
  } else if (pen.kind === 'scourge' || pen.kind === 'burn') {
    const victim = match.round[pen.victim];
    UI.showPickBurn(victim.hand, {
      hidden: pen.kind === 'scourge',
      title: pen.kind === 'burn' && pen.source === 'mote' ? 'THE SECOND CHIME' : 'THE USURPER\'S DECREE',
    }, async (idx) => {
      UI.overlay(null);
      Sound.play('burn');
      const more = match.choose(idx);
      recountDead();
      refresh();
      await runSteps(more, 'you');
    });
  }
}

// Round end -> round end overlay; match end -> match end overlay.
async function settleEnd() {
  const st = match.round;
  const stillPlaying = !st.you.out && !st.herald.out && st.phase !== 'done';
  if (st.you.out || st.herald.out || st.deck.length === 0 || st.phase === 'done') {
    const r = match.endTurn();
    refresh();
    if (r === null) return; // next turn queued below
    // round over
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
    return;
  }
  if (stillPlaying) { /* turn continued */ }
}

// The Herald takes a whole turn, telegraphing each beat.
async function heraldTurn() {
  await wait(850);
  const res = match.beginTurn('herald');
  Sound.play('draw');
  refresh();
  UI.prompt('The Herald draws...');
  if (res.end) { await settleEnd(); return; }
  if (match.round.phase === 'awaitSage') {
    UI.prompt('The Herald weighs three futures...');
    await wait(900);
    match.heraldResolve();
    refresh();
  }
  await wait(500);
  const { card } = match.heraldPickCard();
  UI.read(match.heraldExplain(card));
  UI.prompt(`The Herald plays <b>${card.name}</b>.`);
  await wait(650);
  Sound.play('play');
  const steps = match.playCard('herald', card.id);
  recountDead();
  refresh();
  await wait(350);
  // resolve whatever the play left pending (picks the Herald makes itself)
  let safety = 4;
  while (match.round.pending && match.round.pending.seat === 'herald' && safety-- > 0) {
    const pen = match.round.pending;
    if (pen.kind === 'stalker') {
      UI.prompt('The Herald studies you, naming a rank...');
      await wait(1000);
    } else if (pen.kind === 'oracle') {
      UI.prompt('The Oracle gazes at your hand.');
      await wait(900);
    } else if (pen.kind === 'scourge') {
      UI.prompt('The Scourge burns one of your cards, unseen.');
      await wait(900);
    } else if (pen.kind === 'burn') {
      // execution: your hand is revealed; show it, then the Herald burns one
      const reveal = new Set(match.round.you.hand.map((c) => c.uid));
      refresh(reveal);
      UI.prompt('The court is shown your cards...');
      Sound.play('burn');
      await wait(1300);
    } else if (pen.kind === 'sage') {
      await wait(400);
    }
    match.heraldResolve();
    recountDead();
    refresh(match.round.pending && match.round.pending.kind === 'burn'
      ? new Set(match.round.you.hand.map((c) => c.uid)) : null);
    await wait(300);
  }
  UI.read('');
  await settleEnd();
}

// endTurn wrapper that advances to the right side.
async function advance() {
  const r = match.endTurn();
  refresh();
  if (r !== null) { await settleEnd(); return; }
  if (match.round.turn === 'you') await playerDraw();
  else await heraldTurn();
}

// Route the loop after each player's pick resolves.
const origRun = runSteps;

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

// ---------- input ----------

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
  if (!match || match.round.turn !== 'you' || match.round.phase !== 'awaitPlay' || busy) return;
  const i = ['1', '2', '3'].indexOf(e.key);
  if (i < 0) return;
  const card = match.round.you.hand[i];
  if (!card) return;
  if (card.id === 'sovereign') return;
  playerPlay(card);
});

document.getElementById('btn-sound').addEventListener('click', (e) => {
  Sound.on = !Sound.on;
  e.target.textContent = Sound.on ? 'SOUND' : 'MUTED';
});

document.getElementById('btn-rules').addEventListener('click', () => {
  UI.showRules(() => UI.overlay(null));
});

// ---------- boot ----------

const staged = maybeStage();

if (staged) {
  match = staged.match;
  deadRanks = staged.deadRanks ?? new Set();
  refresh(staged.revealHerald ?? null);
  if (staged.overlay === 'win') UI.showMatchEnd('you', match.scores, () => {});
  if (staged.overlay === 'lose') UI.showMatchEnd('herald', match.scores, () => {});
  if (staged.overlay === 'rules') UI.showRules(() => UI.overlay(null));
  if (staged.pick === 'rank') UI.showPickRank(deadRanks, () => {});
  if (staged.pick === 'burn-hidden') UI.showPickBurn(match.round.herald.hand, { hidden: true, title: 'THE SCOURGE BURNS' }, () => {});
  if (staged.pick === 'burn-open') UI.showPickBurn(match.round.herald.hand, { hidden: false, title: 'THE USURPER\'S DECREE' }, () => {});
  if (staged.pick === 'sage') UI.showSage(match.round.you.hand.slice(0, 3), () => {});
  if (staged.read) UI.read(staged.read);
  if (staged.prompt) UI.prompt(staged.prompt);
  window.__shotReady = true;
} else {
  UI.showTitle(() => {
    Sound.play('roundwin');
    startMatch((Date.now() % 2147483647) | 0);
  }, () => UI.showRules(() => UI.showTitle(() => {
    Sound.play('roundwin');
    startMatch((Date.now() % 2147483647) | 0);
  }, () => {})));
}
