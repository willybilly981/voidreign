// fx.js - the void's ambient particles and the procedural soundscape.
// Canvas starfield/motes behind the table, plus Web Audio blips synthesized
// on the fly: no audio files, no network.

export class Fx {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.parts = [];
    this.bursts = [];
    this.last = 0;
    this.running = false;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = innerWidth * devicePixelRatio;
    this.canvas.height = innerHeight * devicePixelRatio;
  }

  seed() {
    const n = Math.floor(innerWidth / 14);
    for (let i = 0; i < n; i++) {
      this.parts.push({
        x: Math.random(), y: Math.random(),
        r: .4 + Math.random() * 1.6,
        vx: (Math.random() - .5) * .006, vy: (Math.random() - .5) * .004,
        hue: Math.random() < .7 ? 46 + Math.random() * 20 : 260 + Math.random() * 40,
        tw: Math.random() * Math.PI * 2,
      });
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (!this.parts.length) this.seed();
    requestAnimationFrame((t) => this.tick(t));
  }

  burst(x, y, hue, count = 26, speed = .9) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (.4 + Math.random());
      this.bursts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - .3, life: 1, hue });
    }
  }

  tick(t) {
    const dt = Math.min(.05, (t - this.last) / 1000 || .016);
    this.last = t;
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const s = devicePixelRatio;
    for (const p of this.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.tw += dt * 1.4;
      if (p.x < 0) p.x = 1; if (p.x > 1) p.x = 0;
      if (p.y < 0) p.y = 1; if (p.y > 1) p.y = 0;
      const a = .18 + Math.sin(p.tw) * .12;
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, p.r * s, 0, 7);
      ctx.fillStyle = `hsla(${p.hue}, 70%, 70%, ${a})`;
      ctx.fill();
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.x += b.vx * dt * 60; b.y += b.vy * dt * 60;
      b.vy += .02; b.life -= dt * 1.4;
      if (b.life <= 0) { this.bursts.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.2 * s * b.life, 0, 7);
      ctx.fillStyle = `hsla(${b.hue}, 85%, 65%, ${b.life})`;
      ctx.fill();
    }
    requestAnimationFrame((tt) => this.tick(tt));
  }
}

// --- sound ---
let AC = null;
function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { AC = null; } }
  return AC;
}

export const Sound = {
  on: true,
  enabled() { return this.on && !!ac(); },
  blip(freq, dur = .08, type = 'sine', gain = .12, slide = 0) {
    if (!this.enabled()) return;
    const c = ac();
    if (c.state === 'suspended') c.resume().catch(() => {});
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + dur);
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start(); o.stop(c.currentTime + dur + .02);
  },
  play(name) {
    const seqs = {
      deal: [[520, .06, 'triangle'], [660, .07, 'triangle']],
      draw: [[340, .05, 'sine', .09]],
      play: [[220, .09, 'square', .07, -60], [440, .08, 'triangle', .09]],
      pick: [[500, .04, 'sine', .08]],
      burn: [[140, .16, 'sawtooth', .1, -80], [90, .2, 'sawtooth', .08, -40]],
      reborn: [[392, .14, 'sine', .1], [523, .18, 'sine', .1], [784, .24, 'sine', .1]],
      elim: [[110, .3, 'sawtooth', .12, -70], [55, .4, 'sine', .14]],
      guard: [[620, .18, 'sine', .08], [830, .2, 'sine', .06]],
      swap: [[300, .08, 'triangle', .08], [380, .08, 'triangle', .08], [460, .1, 'triangle', .08]],
      roundwin: [[523, .14, 'triangle', .1], [659, .14, 'triangle', .1], [784, .2, 'triangle', .12]],
      roundlose: [[330, .18, 'sine', .1], [262, .24, 'sine', .11]],
      win: [[392, .16, 'triangle', .11], [523, .16, 'triangle', .11], [659, .16, 'triangle', .11], [784, .3, 'triangle', .13]],
      lose: [[440, .2, 'sine', .1], [415, .2, 'sine', .1], [392, .4, 'sine', .13]],
      click: [[700, .03, 'sine', .05]],
    };
    (seqs[name] || []).forEach(([f, d, t, g, s], i) =>
      setTimeout(() => this.blip(f, d, t, g ?? .1, s ?? 0), i * 90));
  },
};
