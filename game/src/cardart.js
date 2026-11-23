// cardart.js - procedural inline SVG card faces for VOIDREIGN.

const GLYPHS = {
  spark: '<path d="M50 12 L58 42 L86 40 L62 56 L70 88 L50 66 L30 88 L38 56 L14 40 L42 42 Z" />',
  arrow: '<path d="M22 78 L66 20 L58 52 L78 46 Z M18 84 L60 70 L52 78 Z" /><circle cx="66" cy="22" r="8" />',
  eye: '<path d="M50 30 C70 30 86 50 86 50 C86 50 70 70 50 70 C30 70 14 50 14 50 C14 50 30 30 50 30 Z" /><circle cx="50" cy="50" r="12" /><circle cx="50" cy="50" r="5" fill="#0b0714" />',
  shield: '<path d="M50 14 L82 26 L82 52 C82 72 66 84 50 90 C34 84 18 72 18 52 L18 26 Z" />',
  flame: '<path d="M50 12 C58 28 74 38 74 58 C74 76 64 88 50 88 C36 88 26 76 26 58 C26 44 34 36 38 30 C38 40 44 44 46 40 C44 30 44 20 50 12 Z" />',
  scales: '<path d="M50 16 L50 74 M26 30 L74 30 M34 30 L22 56 Q34 66 46 56 Z M66 30 L54 56 Q66 66 78 56 Z M38 78 L62 78 L62 84 L38 84 Z" />',
  scroll: '<path d="M28 20 L66 20 Q74 20 74 30 L74 64 Q74 78 60 78 L34 78 Q26 78 26 70 L26 30 Z" /><path d="M34 32 L64 32 M34 42 L64 42 M34 52 L54 52" stroke-width="4" stroke="#0b0714" fill="none" />',
  exchange: '<path d="M20 36 L68 36 L60 26 L70 36 L60 46 Z M80 64 L32 64 L40 54 L30 64 L40 74 Z" />',
  sword: '<path d="M50 10 L56 18 L52 58 L56 86 L50 90 L44 86 L48 58 L44 18 Z" /><path d="M30 60 L70 60 L70 66 L30 66 Z" /><circle cx="50" cy="88" r="5" />',
  crown: '<path d="M20 66 L26 36 L40 50 L50 24 L60 50 L74 36 L80 66 Z M22 72 L78 72 L78 80 L22 80 Z" /><circle cx="50" cy="20" r="5" /><circle cx="24" cy="32" r="4" /><circle cx="76" cy="32" r="4" />',
};

let gradSeq = 0;

export function glyphSVG(card, cls = '') {
  const hue = card.hue;
  // unique gradient id per rendered SVG to avoid DOM id collisions across duplicate cards
  const gid = `g-${card.id}-${++gradSeq}`;
  return `<svg class="glyph ${cls}" viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="hsl(${hue} ${card.sat}% 78%)"/>
        <stop offset="1" stop-color="hsl(${hue} ${card.sat}% ${card.lum}%)"/>
      </linearGradient>
    </defs>
    <g fill="url(#${gid})">${GLYPHS[card.glyph]}</g>
  </svg>`;
}

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function cardFace(card, size = 'hand') {
  const { hue, sat, lum } = card;
  const dark = `hsl(${hue} 40% 14%)`;
  const mid = `hsl(${hue} ${Math.max(30, sat - 15)}% ${Math.max(18, lum - 18)}%)`;
  const effect = size === 'hand' || size === 'pick' ? card.effect : '';
  return `<div class="card-face card-${card.id} size-${size}"
      style="--hue:${hue};--sat:${sat}%;--lum:${lum}%">
    <div class="card-glow" style="background:radial-gradient(ellipse at 50% 30%, hsl(${hue} ${sat}% ${lum + 8}% / .55), transparent 62%)"></div>
    <div class="card-rank">${card.rank}</div>
    <div class="card-art">${glyphSVG(card)}</div>
    <div class="card-name">${esc(card.name)}</div>
    ${effect ? `<div class="card-effect">${esc(effect)}</div>` : ''}
    <div class="card-fil" style="border-color:hsl(${hue} ${sat}% ${lum}% / .5);background:linear-gradient(160deg, ${mid}aa, ${dark}e6)"></div>
  </div>`;
}

export function cardBack(size = 'hand') {
  return `<div class="card-face card-back-face size-${size}">
    <div class="back-seal">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(46 60% 55% / .8)" stroke-width="2"/>
        <circle cx="50" cy="50" r="28" fill="none" stroke="hsl(275 50% 60% / .7)" stroke-width="1.5"/>
        <path d="M50 22 L56 44 L78 44 L61 57 L67 79 L50 66 L33 79 L39 57 L22 44 L44 44 Z" fill="hsl(46 70% 60% / .9)"/>
      </svg>
    </div>
    <div class="back-word">VOIDREIGN</div>
    <div class="card-fil"></div>
  </div>`;
}
