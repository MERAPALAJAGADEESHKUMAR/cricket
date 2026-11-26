/**
 * Boundary Blitz - Cricket Batting Game
 * Vanilla JS, Canvas rendering, Web Audio API sounds, localStorage persistence.
 */
(() => {
  'use strict';

  // ============================================================
  // 1. CONFIG & CONSTANTS
  // ============================================================
  const CONFIG = {
    MODES: {
      quick: { name: 'Quick Play', overs: 5, balls: 30, chase: false },
      chase: { name: 'Chase Mode', overs: 5, balls: 30, chase: true },
      super: { name: 'Super Over', overs: 1, balls: 6, chase: false },
    },
    DIFFICULTY: {
      easy:   { label: 'Easy',   speedMult: 0.78, variation: 0.35, timingWindow: 1.35, wicketChance: 0.35 },
      medium: { label: 'Medium', speedMult: 1.0,  variation: 0.6,  timingWindow: 1.0,  wicketChance: 0.55 },
      hard:   { label: 'Hard',   speedMult: 1.25, variation: 0.85, timingWindow: 0.78, wicketChance: 0.72 },
    },
    MAX_WICKETS: 3,
    STORAGE_KEY: 'boundary_blitz_scores_v1',
    MUTE_KEY: 'boundary_blitz_muted_v1',
    LEADERBOARD_SIZE: 5,
    TIMING: { PERFECT: 55, GOOD: 120, AVERAGE: 210 },
    DELIVERY_TYPES: ['fast', 'spin', 'yorker', 'bouncer', 'fullToss'],
  };

  const COMMENTARY = {
    six: [
      "What a shot! That's SIX! Into the crowd!",
      "Huge! Sailed over the boundary for a maximum!",
      "Absolutely massive! That's gone all the way!",
      "Clean as a whistle - six runs!"
    ],
    four: [
      "Cracked away for FOUR! Beautiful timing.",
      "Races to the boundary - that's four!",
      "Splendid shot! Finds the gap for four.",
      "Pierced the field! Four more to the total."
    ],
    runs: [
      "Quick running between the wickets.",
      "Pushed into the gap for runs.",
      "Smart batting - they pick up runs.",
      "Worked away nicely for a few."
    ],
    dot: [
      "Good ball! No run there.",
      "Defended solidly. Dot ball.",
      "Beaten! The bowler wins that one.",
      "Swing and a miss - no contact."
    ],
    wicket: [
      "Oh no! That's out! The stumps are shattered!",
      "Edged and taken! A huge wicket!",
      "Clean bowled! What a delivery!",
      "Caught! The batter has to walk back."
    ],
    start: [
      "Get ready... the bowler is marking the run-up!",
      "The crowd roars as the batter takes guard.",
      "Here we go! Eyes on the ball."
    ],
    chaseStart: [
      "The target is set. Time to chase it down!",
      "Pressure on! Can you chase this total?"
    ]
  };

  // ============================================================
  // 2. UTILITIES & STORAGE
  // ============================================================
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => Math.random() * (b - a) + a;
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function loadScores() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  function saveScore(entry) {
    const scores = loadScores();
    scores.push(entry);
    scores.sort((a, b) => b.runs - a.runs || b.strikeRate - a.strikeRate);
    const trimmed = scores.slice(0, 20);
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(trimmed));
    return trimmed;
  }
  function getTopScores(n = CONFIG.LEADERBOARD_SIZE) { return loadScores().slice(0, n); }
  function isHighScore(runs) {
    const scores = loadScores();
    if (scores.length < CONFIG.LEADERBOARD_SIZE) return runs > 0;
    return runs > scores[Math.min(scores.length, CONFIG.LEADERBOARD_SIZE) - 1].runs;
  }
  function loadMuted() { try { return localStorage.getItem(CONFIG.MUTE_KEY) === '1'; } catch { return false; } }
  function saveMuted(muted) { try { localStorage.setItem(CONFIG.MUTE_KEY, muted ? '1' : '0'); } catch {} }

  // ============================================================
  // 3. AUDIO (Web Audio API)
  // ============================================================
  const Audio = {
    ctx: null,
    muted: loadMuted(),
    ensure() {
      if (!this.ctx) { const Ctx = window.AudioContext || window.webkitAudioContext; if (Ctx) this.ctx = new Ctx(); }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    },
    toggle() { this.muted = !this.muted; saveMuted(this.muted); return this.muted; },
    tone({ freq = 440, freqEnd, type = 'sine', dur = 0.2, gain = 0.15, delay = 0, attack = 0.01 }) {
      if (this.muted) return; this.ensure(); if (!this.ctx) return;
      const t0 = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    },
    noise({ dur = 0.2, gain = 0.08, delay = 0, lowpass = 4000 }) {
      if (this.muted) return; this.ensure(); if (!this.ctx) return;
      const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource(); src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = lowpass;
      const g = this.ctx.createGain(); const t0 = this.ctx.currentTime + delay;
      g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter).connect(g).connect(this.ctx.destination);
      src.start(t0); src.stop(t0 + dur + 0.02);
    },
    batHit(power = 1) {
      this.noise({ dur: 0.08, gain: 0.12 * power, lowpass: 2500 });
      this.tone({ freq: 180, freqEnd: 90, type: 'triangle', dur: 0.12, gain: 0.18 * power });
      this.tone({ freq: 1200, freqEnd: 600, type: 'sine', dur: 0.06, gain: 0.05 * power });
    },
    crowdCheer() {
      this.noise({ dur: 1.2, gain: 0.06, lowpass: 3000 });
      this.noise({ dur: 0.9, gain: 0.04, delay: 0.15, lowpass: 5000 });
      this.tone({ freq: 523, type: 'sine', dur: 0.25, gain: 0.04, delay: 0.05 });
      this.tone({ freq: 659, type: 'sine', dur: 0.25, gain: 0.04, delay: 0.1 });
      this.tone({ freq: 784, type: 'sine', dur: 0.4, gain: 0.05, delay: 0.15 });
    },
    wicket() {
      this.tone({ freq: 500, freqEnd: 120, type: 'sawtooth', dur: 0.35, gain: 0.08 });
      this.tone({ freq: 220, freqEnd: 60, type: 'square', dur: 0.3, gain: 0.04, delay: 0.05 });
      this.noise({ dur: 0.2, gain: 0.08, delay: 0.02, lowpass: 1800 });
    },
    swing() { this.noise({ dur: 0.1, gain: 0.04, lowpass: 6000 }); this.tone({ freq: 300, freqEnd: 600, type: 'sine', dur: 0.08, gain: 0.03 }); },
    uiClick() { this.tone({ freq: 660, freqEnd: 550, type: 'sine', dur: 0.06, gain: 0.04 }); }
  };

  // ============================================================
  // 4. GAME STATE & RULES
  // ============================================================
  const state = {
    screen: 'home', phase: 'idle', mode: 'quick', difficulty: 'medium',
    runs: 0, wickets: 0, ballsBowled: 0, fours: 0, sixes: 0, target: null,
    ball: null, delivery: null, shotDir: 'off', swing: null, result: null,
    lastTime: 0, resultTimer: 0, effects: [], commentary: pick(COMMENTARY.start),
    prevPhase: 'idle'
  };

  function modeConfig() { return CONFIG.MODES[state.mode]; }
  function diffConfig() { return CONFIG.DIFFICULTY[state.difficulty]; }
  function totalBalls() { return modeConfig().balls; }
  function ballsLeft() { return Math.max(0, totalBalls() - state.ballsBowled); }
  function oversText() {
    const b = state.ballsBowled, o = Math.floor(b / 6), rem = b % 6;
    return `${o}.${rem} / ${modeConfig().overs}.0`;
  }
  function runRate() { return state.ballsBowled === 0 ? 0 : (state.runs / state.ballsBowled) * 6; }
  function strikeRate() { return state.ballsBowled === 0 ? 0 : (state.runs / state.ballsBowled) * 100; }
  function inningsOver() { return state.wickets >= CONFIG.MAX_WICKETS || state.ballsBowled >= totalBalls(); }
  function chaseWon() { return state.mode === 'chase' && state.target !== null && state.runs >= state.target; }

  function resetInnings() {
    state.runs = 0; state.wickets = 0; state.ballsBowled = 0; state.fours = 0; state.sixes = 0;
    state.ball = null; state.delivery = null; state.swing = null; state.result = null;
    state.resultTimer = 0; state.effects = []; state.phase = 'idle'; state.shotDir = 'off';
    if (state.mode === 'chase') {
      const diff = state.difficulty;
      const base = diff === 'easy' ? 38 : diff === 'medium' ? 48 : 58;
      state.target = base + randInt(-6, 10);
      state.commentary = pick(COMMENTARY.chaseStart) + ` Target: ${state.target}.`;
    } else {
      state.target = null;
      state.commentary = pick(COMMENTARY.start);
    }
  }

  function createDelivery() {
    const diff = diffConfig();
    const type = pick(CONFIG.DELIVERY_TYPES);
    let speed = rand(520, 680) * diff.speedMult;
    let bounceY = 380;
    let lineX = 450;
    let swingX = rand(-1, 1) * 35 * diff.variation;
    if (type === 'fast') { speed *= 1.15; }
    if (type === 'spin') { speed *= 0.78; swingX += rand(-1, 1) * 55 * diff.variation; }
    if (type === 'yorker') { speed *= 1.05; bounceY = 430; }
    if (type === 'bouncer') { speed *= 1.1; bounceY = 320; }
    if (type === 'fullToss') { speed *= 0.95; bounceY = 460; }
    lineX += rand(-1, 1) * 30 * diff.variation;
    const startY = 130, impactY = 455;
    const travelMs = ((impactY - startY) / speed) * 1000;
    return { type, speed, startX: 450 + rand(-10, 10), startY, targetX: lineX, impactY, bounceY, swingX, travelMs, impactTime: performance.now() + travelMs };
  }
  function createBall(delivery) { return { x: delivery.startX, y: delivery.startY, height: 0, radius: 8, trail: [], bounced: false }; }

  function startDelivery() {
    if (inningsOver() || chaseWon()) { endInnings(); return; }
    state.delivery = createDelivery();
    state.ball = createBall(state.delivery);
    state.swing = null; state.result = null; state.phase = 'bowling';
  }

  function evaluateSwing() {
    if (!state.delivery || state.swing || state.phase !== 'bowling') return;
    Audio.swing();
    const now = performance.now();
    const diff = diffConfig();
    const delta = now - state.delivery.impactTime;
    const absDelta = Math.abs(delta);
    const wPerfect = CONFIG.TIMING.PERFECT * diff.timingWindow;
    const wGood = CONFIG.TIMING.GOOD * diff.timingWindow;
    const wAvg = CONFIG.TIMING.AVERAGE * diff.timingWindow;
    const ballLine = state.delivery.targetX + state.delivery.swingX * 0.5;
    const correctDir = ballLine < 445 ? 'off' : 'leg';
    const dirBonus = state.swingDir === correctDir ? 0 : 35;
    const effectiveDelta = absDelta + dirBonus;

    let outcome;
    if (effectiveDelta <= wPerfect) outcome = { type: 'six', runs: 6, wicket: false };
    else if (effectiveDelta <= wGood) outcome = { type: 'four', runs: 4, wicket: false };
    else if (effectiveDelta <= wAvg) outcome = { type: 'runs', runs: randInt(1, 3), wicket: false };
    else {
      const isWicket = Math.random() < diff.wicketChance * (absDelta > wAvg * 1.8 ? 0.85 : 0.55);
      if (isWicket) outcome = { type: 'wicket', runs: 0, wicket: true, wicketType: pick(['Bowled!', 'Caught!', 'LBW!']) };
      else outcome = { type: 'dot', runs: 0, wicket: false };
    }
    if (state.delivery.type === 'yorker' && outcome.type === 'dot' && Math.random() < 0.2 * diff.wicketChance) {
      outcome = { type: 'wicket', runs: 0, wicket: true, wicketType: 'Bowled!' };
    }
    state.swing = { time: now, dir: state.swingDir, delta, outcome };
    state.phase = 'swinging';
    applyOutcome(outcome);
  }

  function resolveNoSwing() {
    if (state.phase !== 'bowling' || state.swing) return;
    const diff = diffConfig();
    let outcome;
    if (Math.random() < 0.18 * diff.wicketChance) outcome = { type: 'wicket', runs: 0, wicket: true, wicketType: pick(['Bowled!', 'Caught!']) };
    else outcome = { type: 'dot', runs: 0, wicket: false };
    state.swing = { time: performance.now(), dir: state.shotDir, delta: 999, outcome, noSwing: true };
    state.phase = 'swinging';
    applyOutcome(outcome);
  }

  function applyOutcome(outcome) {
    state.result = outcome;
    state.ballsBowled++;
    if (outcome.wicket) {
      state.wickets++; Audio.wicket(); spawnWicketEffect();
      state.commentary = pick(COMMENTARY.wicket);
    } else if (outcome.type === 'six') {
      state.runs += 6; state.sixes++; Audio.batHit(1.2); Audio.crowdCheer(); spawnBoundaryEffect('six');
      state.commentary = pick(COMMENTARY.six);
    } else if (outcome.type === 'four') {
      state.runs += 4; state.fours++; Audio.batHit(1.0); Audio.crowdCheer(); spawnBoundaryEffect('four');
      state.commentary = pick(COMMENTARY.four);
    } else if (outcome.type === 'runs') {
      state.runs += outcome.runs; Audio.batHit(0.7); spawnRunEffect(outcome.runs);
      state.commentary = pick(COMMENTARY.runs) + ` ${outcome.runs} run${outcome.runs > 1 ? 's' : ''}.`;
    } else {
      state.commentary = pick(COMMENTARY.dot);
    }
    if (chaseWon()) state.commentary = "Target chased! You've done it!";
    state.resultTimer = 1700;
    updateHUD();
    showEventBanner(outcome);
  }

  function spawnBoundaryEffect(kind) { state.effects.push({ type: 'boundary', kind, t: 0, dur: 1200 }); }
  function spawnWicketEffect() { state.effects.push({ type: 'wicket', t: 0, dur: 1200 }); }
  function spawnRunEffect(runs) { state.effects.push({ type: 'runs', runs, t: 0, dur: 800 }); }

  // ============================================================
  // 5. DOM REFS & UI
  // ============================================================
  const dom = {};
  function cacheDom() {
    dom.home = $('home-screen'); dom.setup = $('setup-screen'); dom.game = $('game-screen');
    dom.pauseOverlay = $('pause-overlay'); dom.gameoverOverlay = $('gameover-overlay');
    dom.canvas = $('game-canvas'); dom.ctx = dom.canvas.getContext('2d');
    dom.scoreRuns = $('score-runs'); dom.scoreWickets = $('score-wickets'); dom.scoreMode = $('score-mode-label');
    dom.statOvers = $('stat-overs'); dom.statBalls = $('stat-balls'); dom.statRR = $('stat-rr');
    dom.statTarget = $('stat-target'); dom.targetStat = $('target-stat');
    dom.commentary = $('commentary-text'); dom.eventBanner = $('event-banner');
    dom.dirDisplay = $('dir-display'); dom.btnOff = $('btn-off'); dom.btnLeg = $('btn-leg'); dom.muteBtn = $('mute-btn');
    dom.leaderboardBody = $('leaderboard-body'); dom.leaderboardEmpty = $('leaderboard-empty');
    dom.goEyebrow = $('gameover-eyebrow'); dom.goTitle = $('gameover-title'); dom.goResult = $('gameover-result');
    dom.finalScore = $('final-score'); dom.finalWickets = $('final-wickets'); dom.finalSR = $('final-sr');
    dom.finalFours = $('final-fours'); dom.finalSixes = $('final-sixes'); dom.finalBalls = $('final-balls'); dom.newHigh = $('new-highscore');
  }

  function showScreen(name) {
    state.screen = name;
    ['home', 'setup', 'game'].forEach(s => dom[s].classList.toggle('active', s === name));
  }

  function updateHUD() {
    dom.scoreRuns.textContent = String(state.runs);
    dom.scoreWickets.textContent = String(state.wickets);
    dom.scoreMode.textContent = modeConfig().name;
    dom.statOvers.textContent = oversText();
    dom.statBalls.textContent = String(ballsLeft());
    dom.statRR.textContent = runRate().toFixed(2);
    if (state.mode === 'chase' && state.target !== null) { dom.targetStat.classList.remove('hidden'); dom.statTarget.textContent = String(state.target); }
    else { dom.targetStat.classList.add('hidden'); dom.statTarget.textContent = '-'; }
    dom.commentary.textContent = state.commentary;
    updateDirUI();
  }
  function updateDirUI() {
    dom.dirDisplay.textContent = state.shotDir.toUpperCase();
    dom.btnOff.classList.toggle('selected', state.shotDir === 'off');
    dom.btnLeg.classList.toggle('selected', state.shotDir === 'leg');
  }
  function showEventBanner(outcome) {
    const el = dom.eventBanner;
    el.className = 'event-banner';
    let text = '';
    if (outcome.wicket) { text = outcome.wicketType || 'WICKET!'; el.classList.add('wicket'); }
    else if (outcome.type === 'six') { text = 'SIX!'; el.classList.add('six'); }
    else if (outcome.type === 'four') { text = 'FOUR!'; el.classList.add('four'); }
    else if (outcome.type === 'runs') { text = `+${outcome.runs}`; el.classList.add('runs'); }
    else { text = 'DOT BALL'; el.classList.add('runs'); }
    el.textContent = text;
    void el.offsetWidth; el.classList.add('show');
    clearTimeout(el._hideTimer); el._hideTimer = setTimeout(() => el.classList.remove('show'), 1200);
  }
  function renderLeaderboard() {
    const scores = getTopScores();
    dom.leaderboardBody.innerHTML = '';
    if (scores.length === 0) { dom.leaderboardEmpty.style.display = 'block'; return; }
    dom.leaderboardEmpty.style.display = 'none';
    scores.forEach((s, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="rank">${i + 1}</td><td class="score-cell">${s.runs}/${s.wickets}</td><td class="mode-cell">${escapeHtml(s.modeName || s.mode || '')}</td><td class="diff-cell">${escapeHtml(s.difficulty || '')}</td>`;
      dom.leaderboardBody.appendChild(tr);
    });
  }
  function escapeHtml(str) { return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function updateMuteUI() { dom.muteBtn.textContent = Audio.muted ? 'ðŸ”‡' : 'ðŸ”Š'; dom.muteBtn.setAttribute('aria-label', Audio.muted ? 'Unmute sound' : 'Mute sound'); }

  // ============================================================
  // 6. RENDERING
  // ============================================================
  const W = 900, H = 560;
  function clearCanvas() { dom.ctx.clearRect(0, 0, W, H); }

  function drawPitch() {
    const ctx = dom.ctx;
    const sky = ctx.createLinearGradient(0, 0, 0, 180);
    sky.addColorStop(0, '#0b1d2a'); sky.addColorStop(1, '#163a2a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, 180);
    ctx.fillStyle = '#091821';
    for (let i = 0; i < W; i += 18) { const h = 18 + Math.sin(i * 0.13) * 8 + (i % 36 === 0 ? 10 : 0); ctx.fillRect(i, 120 - h, 14, h + 60); }
    ctx.fillStyle = 'rgba(255,245,200,0.5)';
    for (let i = 8; i < W; i += 28) { if (Math.sin(i) > -0.2) ctx.fillRect(i, 105 + (i % 3) * 4, 2, 2); }
    const outfield = ctx.createRadialGradient(W/2, 420, 60, W/2, 420, 520);
    outfield.addColorStop(0, '#3f9850'); outfield.addColorStop(1, '#1f6a32');
    ctx.fillStyle = outfield; ctx.fillRect(0, 160, W, H - 160);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(W/2, 390, 390, 185, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(212,255,63,0.18)'; ctx.lineWidth = 8; ctx.stroke();
    const pitchGrad = ctx.createLinearGradient(W/2 - 70, 0, W/2 + 70, 0);
    pitchGrad.addColorStop(0, '#c9a46b'); pitchGrad.addColorStop(0.5, '#ddb97d'); pitchGrad.addColorStop(1, '#c9a46b');
    ctx.fillStyle = pitchGrad; ctx.beginPath(); ctx.roundRect(W/2 - 65, 150, 130, 340, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(W/2 - 55, 185); ctx.lineTo(W/2 + 55, 185); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W/2 - 55, 455); ctx.lineTo(W/2 + 55, 455); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W/2 - 45, 175); ctx.lineTo(W/2 + 45, 175); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W/2 - 45, 465); ctx.lineTo(W/2 + 45, 465); ctx.stroke();
    drawStumps(ctx, W/2, 182, 0.55); drawStumps(ctx, W/2, 458, 1);
  }
  function drawStumps(ctx, x, y, scale) {
    const s = scale; ctx.fillStyle = '#f4efe4';
    for (let i = -1; i <= 1; i++) ctx.fillRect(x + i * 8 * s - 2 * s, y - 28 * s, 4 * s, 28 * s);
    ctx.fillStyle = '#ffe8a0';
    ctx.fillRect(x - 10 * s, y - 30 * s, 8 * s, 2.5 * s); ctx.fillRect(x + 2 * s, y - 30 * s, 8 * s, 2.5 * s);
  }
  function drawBowler() {
    const ctx = dom.ctx, x = W/2, y = 165;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x, y + 22, 16, 5, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#1a4d8f'; ctx.fillRect(x - 10, y - 10, 20, 24);
    ctx.fillStyle = '#e8c39e'; ctx.beginPath(); ctx.arc(x, y - 18, 9, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#153a6a'; ctx.fillRect(x - 10, y - 24, 20, 5);
    ctx.strokeStyle = '#f5f5f5'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 5, y + 14); ctx.lineTo(x - 8, y + 28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 5, y + 14); ctx.lineTo(x + 8, y + 28); ctx.stroke();
    let armAngle = -0.6;
    if (state.phase === 'bowling' && state.delivery) {
      const prog = clamp((performance.now() - (state.delivery.impactTime - state.delivery.travelMs)) / state.delivery.travelMs, 0, 1);
      armAngle = -0.6 + Math.sin(prog * Math.PI) * 1.8;
    }
    ctx.strokeStyle = '#e8c39e'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x + 8, y - 5); ctx.lineTo(x + 18, y - 5 + Math.sin(armAngle)*18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 8, y - 5); ctx.lineTo(x - 16, y + 8); ctx.stroke();
    ctx.restore();
  }
  function drawBatter() {
    const ctx = dom.ctx, x = W/2 - 20, y = 448;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(x + 10, y + 24, 18, 5, 0, 0, Math.PI*2); ctx.fill();
    let batAngle = -0.3;
    if (state.swing) {
      const sinceSwing = performance.now() - state.swing.time;
      if (sinceSwing < 400) { const p = sinceSwing / 400; const dir = state.swing.dir === 'leg' ? 1 : -1; batAngle = -0.3 + Math.sin(p * Math.PI) * 1.6 * dir; }
    }
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + 5, y + 12); ctx.lineTo(x, y + 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 15, y + 12); ctx.lineTo(x + 20, y + 30); ctx.stroke();
    ctx.fillStyle = '#1e7a3d'; ctx.fillRect(x, y - 12, 22, 26);
    ctx.fillStyle = '#f5f5f5'; ctx.fillRect(x - 1, y + 2, 8, 18); ctx.fillRect(x + 13, y + 2, 8, 18);
    ctx.fillStyle = '#e8c39e'; ctx.beginPath(); ctx.arc(x + 11, y - 20, 10, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#1a2f4a'; ctx.beginPath(); ctx.arc(x + 11, y - 22, 11, Math.PI, 0); ctx.fill(); ctx.fillRect(x, y - 22, 22, 5);
    ctx.save(); ctx.translate(x + 18, y - 4); ctx.rotate(batAngle);
    ctx.strokeStyle = '#e8c39e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(12, 10); ctx.stroke();
    ctx.fillStyle = '#d4a056'; ctx.fillRect(8, 6, 6, 34); ctx.fillStyle = '#c48a3a'; ctx.fillRect(7, 34, 8, 10);
    ctx.restore();
    ctx.strokeStyle = '#e8c39e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 2, y + 8); ctx.stroke();
    ctx.restore();
  }
  function drawBall() {
    if (!state.ball || !state.delivery) return;
    const ctx = dom.ctx, b = state.ball;
    if (b.trail.length > 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3; ctx.beginPath();
      for (let i = 0; i < b.trail.length; i++) { const p = b.trail[i]; if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
      ctx.stroke();
    }
    const shadowScale = clamp(1 - b.height / 120, 0.3, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(b.x, b.y + b.height * 0.6, b.radius * shadowScale * 1.2, b.radius * shadowScale * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    const by = b.y - b.height;
    const grad = ctx.createRadialGradient(b.x - 2, by - 2, 1, b.x, by, b.radius);
    grad.addColorStop(0, '#ff6b6b'); grad.addColorStop(1, '#b82020');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(b.x, by, b.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(b.x, by, b.radius - 2, -0.8, 0.8); ctx.stroke();
  }
  function drawEffects(dt) {
    const ctx = dom.ctx;
    for (let i = state.effects.length - 1; i >= 0; i--) {
      const e = state.effects[i]; e.t += dt; const p = clamp(e.t / e.dur, 0, 1);
      if (e.type === 'boundary') {
        ctx.save(); ctx.globalAlpha = (1 - p) * 0.5; ctx.strokeStyle = e.kind === 'six' ? '#d4ff3f' : '#7df9ff'; ctx.lineWidth = 6 * (1 - p) + 2;
        ctx.beginPath(); ctx.ellipse(W/2, 390, 390 + p * 40, 185 + p * 20, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      } else if (e.type === 'wicket') {
        ctx.save(); ctx.globalAlpha = (1 - p) * 0.25; ctx.fillStyle = '#ff4d5a'; ctx.fillRect(0, 0, W, H); ctx.restore();
        ctx.save(); ctx.globalAlpha = 1 - p; ctx.fillStyle = '#ffe8a0'; const bx = W/2, by = 458;
        ctx.fillRect(bx - 15 - p * 40, by - 30 - p * 80 + p*p*60, 8, 3); ctx.fillRect(bx + 10 + p * 30, by - 30 - p * 70 + p*p*50, 8, 3); ctx.restore();
      } else if (e.type === 'runs') {
        ctx.save(); ctx.globalAlpha = (1 - p); ctx.fillStyle = '#fff'; ctx.font = 'bold 32px Poppins, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`+${e.runs}`, W/2, 380 - p * 40); ctx.restore();
      }
      if (p >= 1) state.effects.splice(i, 1);
    }
  }
  function render(dt) {
    clearCanvas(); drawPitch(); drawBowler(); drawBatter(); drawBall(); drawEffects(dt);
    if (state.delivery && state.phase === 'bowling') {
      const ctx = dom.ctx; ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.roundRect(16, 170, 130, 34, 8); ctx.fill();
      ctx.fillStyle = '#d4ff3f'; ctx.font = 'bold 13px Poppins, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(state.delivery.type.toUpperCase(), 28, 192); ctx.restore();
    }
    if (state.phase === 'paused') { dom.ctx.fillStyle = 'rgba(0,0,0,0.35)'; dom.ctx.fillRect(0, 0, W, H); }
  }

  // ============================================================
  // 7. INPUT
  // ============================================================
  function setShotDir(dir) { if (dir !== 'off' && dir !== 'leg') return; state.shotDir = dir; state.swingDir = dir; updateDirUI(); }
  function flashButton(btn) { if (!btn) return; btn.classList.add('active'); setTimeout(() => btn.classList.remove('active'), 150); }
  function doSwing() {
    Audio.ensure();
    if (state.screen !== 'game' || state.phase === 'paused' || state.phase === 'gameover') return;
    if (state.phase === 'bowling' && !state.swing) { state.swingDir = state.shotDir; evaluateSwing(); flashButton($('btn-swing')); }
  }
  function onKeyDown(e) {
    if (e.code === 'ArrowLeft') { e.preventDefault(); setShotDir('off'); flashButton($('btn-off')); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); setShotDir('leg'); flashButton($('btn-leg')); }
    else if (e.code === 'Space') { e.preventDefault(); doSwing(); }
    else if (e.code === 'KeyP') { e.preventDefault(); togglePause(); }
    else if (e.code === 'KeyM') { e.preventDefault(); toggleMute(); }
  }
  function bindInput() {
    document.addEventListener('keydown', onKeyDown);
    $('btn-off').addEventListener('click', () => { Audio.ensure(); setShotDir('off'); });
    $('btn-leg').addEventListener('click', () => { Audio.ensure(); setShotDir('leg'); });
    $('btn-swing').addEventListener('click', () => doSwing());
    ['btn-off','btn-leg','btn-swing'].forEach(id => { $(id).addEventListener('touchend', (e) => { e.preventDefault(); $(id).click(); }, { passive: false }); });
  }

  // ============================================================
  // 8. FLOW
  // ============================================================
  function startGame() {
    Audio.ensure(); resetInnings(); showScreen('game');
    dom.pauseOverlay.classList.remove('active'); dom.pauseOverlay.setAttribute('aria-hidden', 'true');
    dom.gameoverOverlay.classList.remove('active'); dom.gameoverOverlay.setAttribute('aria-hidden', 'true');
    state.phase = 'idle'; updateHUD(); updateMuteUI();
    setTimeout(() => { if (state.screen === 'game' && state.phase === 'idle') startDelivery(); }, 900);
  }
  function endInnings() {
    state.phase = 'gameover';
    const won = state.mode === 'chase' ? chaseWon() : null;
    const sr = strikeRate();
    const entry = { runs: state.runs, wickets: state.wickets, fours: state.fours, sixes: state.sixes, balls: state.ballsBowled, strikeRate: Math.round(sr * 10) / 10, mode: state.mode, modeName: modeConfig().name, difficulty: state.difficulty, target: state.target, won, date: Date.now() };
    const wasHigh = isHighScore(state.runs);
    saveScore(entry); renderLeaderboard(); showGameOver(entry, wasHigh, won);
  }
  function showGameOver(entry, wasHigh, won) {
    dom.finalScore.textContent = String(entry.runs); dom.finalWickets.textContent = String(entry.wickets);
    dom.finalSR.textContent = entry.strikeRate.toFixed(1); dom.finalFours.textContent = String(entry.fours);
    dom.finalSixes.textContent = String(entry.sixes); dom.finalBalls.textContent = String(entry.balls);
    dom.newHigh.hidden = !wasHigh;
    if (state.mode === 'chase') {
      dom.goEyebrow.textContent = won ? 'Target Chased!' : 'Chase Complete';
      dom.goTitle.textContent = won ? 'You Win!' : 'So Close!';
      dom.goResult.textContent = won ? `You chased ${state.target} with ${ballsLeft()} ball${ballsLeft() !== 1 ? 's' : ''} to spare.` : `You scored ${state.runs}/${state.wickets} chasing ${state.target}. Fell short by ${Math.max(0, state.target - state.runs)}.`;
    } else if (state.mode === 'super') {
      dom.goEyebrow.textContent = 'Super Over Complete'; dom.goTitle.textContent = 'Game Over';
      dom.goResult.textContent = `You smashed ${state.runs} runs in the Super Over!`;
    } else {
      dom.goEyebrow.textContent = 'Innings Complete'; dom.goTitle.textContent = 'Game Over';
      dom.goResult.textContent = `Solid innings! You scored ${state.runs} runs off ${entry.balls} balls.`;
    }
    dom.gameoverOverlay.classList.add('active'); dom.gameoverOverlay.setAttribute('aria-hidden', 'false');
  }
  function togglePause() {
    if (state.screen !== 'game' || state.phase === 'gameover') return;
    if (state.phase === 'paused') resumeGame(); else pauseGame();
  }
  function pauseGame() {
    if (state.screen !== 'game' || state.phase === 'gameover') return;
    state.prevPhase = state.phase; state.phase = 'paused';
    dom.pauseOverlay.classList.add('active'); dom.pauseOverlay.setAttribute('aria-hidden', 'false');
  }
  function resumeGame() {
    if (state.phase !== 'paused') return;
    dom.pauseOverlay.classList.remove('active'); dom.pauseOverlay.setAttribute('aria-hidden', 'true');
    state.phase = state.prevPhase || 'idle';
    if (state.delivery && state.phase === 'bowling') startDelivery();
    else if (state.phase === 'idle') setTimeout(() => { if (state.phase === 'idle' && state.screen === 'game') startDelivery(); }, 600);
  }
  function quitToHome() {
    state.phase = 'idle';
    dom.pauseOverlay.classList.remove('active'); dom.pauseOverlay.setAttribute('aria-hidden', 'true');
    dom.gameoverOverlay.classList.remove('active'); dom.gameoverOverlay.setAttribute('aria-hidden', 'true');
    showScreen('home'); renderLeaderboard();
  }
  function toggleMute() { Audio.ensure(); Audio.toggle(); updateMuteUI(); }

  // ============================================================
  // 9. GAME LOOP
  // ============================================================
  function update(dt) {
    if (state.screen !== 'game' || state.phase === 'paused' || state.phase === 'gameover') return;
    if (state.ball && state.delivery && (state.phase === 'bowling' || state.phase === 'swinging')) {
      const d = state.delivery, b = state.ball, now = performance.now();
      const elapsed = now - (d.impactTime - d.travelMs);
      const t = clamp(elapsed / d.travelMs, 0, 1.4);
      const baseX = d.startX + (d.targetX - d.startX) * Math.min(t, 1);
      const swingCurve = Math.sin(Math.min(t, 1) * Math.PI) * d.swingX;
      b.x = baseX + swingCurve; b.y = d.startY + (d.impactY - d.startY) * Math.min(t, 1);
      const pitchT = clamp((d.bounceY - d.startY) / (d.impactY - d.startY), 0.2, 0.95);
      if (t < pitchT) { b.height = Math.sin((t / pitchT) * Math.PI) * 35; }
      else {
        const p = (t - pitchT) / Math.max(0.01, 1 - pitchT);
        if (d.type === 'bouncer') b.height = Math.sin(clamp(p,0,1) * Math.PI) * 70;
        else if (d.type === 'yorker' || d.type === 'fullToss') b.height = Math.max(0, (1-p) * 10);
        else b.height = Math.sin(clamp(p,0,1) * Math.PI) * 25;
      }
      b.trail.push({ x: b.x, y: b.y - b.height }); if (b.trail.length > 18) b.trail.shift();
      if (state.phase === 'bowling' && !state.swing && now > d.impactTime + 180) resolveNoSwing();
      if (state.phase === 'swinging' && state.result) {
        const r = state.result;
        if (r.type === 'six' || r.type === 'four') { b.y -= dt * 0.45; b.x += (state.swing.dir === 'leg' ? 1 : -1) * dt * 0.35; b.height += dt * 0.25; }
        else if (r.wicket) { b.y += dt * 0.05; b.height = Math.max(0, b.height - dt * 0.2); }
        else if (r.type === 'runs') { b.y -= dt * 0.15; b.x += (state.swing.dir === 'leg' ? 1 : -1) * dt * 0.2; b.height = Math.max(0, b.height - dt * 0.1); }
        else { b.y += dt * 0.12; b.height = Math.max(0, b.height - dt * 0.15); }
      }
    }
    if (state.phase === 'swinging' && state.result) {
      state.resultTimer -= dt;
      if (state.resultTimer <= 0) {
        if (chaseWon() || inningsOver()) endInnings();
        else { state.phase = 'idle'; setTimeout(() => { if (state.screen === 'game' && state.phase === 'idle') startDelivery(); }, 450); }
      }
    }
  }
  function loop(ts) {
    if (!state.lastTime) state.lastTime = ts;
    const dt = Math.min(50, ts - state.lastTime); state.lastTime = ts;
    update(dt); render(dt);
    requestAnimationFrame(loop);
  }

  // ============================================================
  // 10. INIT
  // ============================================================
  function bindSetup() {
    $('play-now-btn').addEventListener('click', () => { Audio.ensure(); Audio.uiClick(); showScreen('setup'); });
    $('how-to-play-btn').addEventListener('click', () => { $('how-to-play-panel').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    $('setup-back-btn').addEventListener('click', () => { Audio.uiClick(); showScreen('home'); });
    document.querySelectorAll('#mode-options .option-card').forEach(btn => {
      btn.addEventListener('click', () => { Audio.ensure(); Audio.uiClick(); document.querySelectorAll('#mode-options .option-card').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); state.mode = btn.dataset.mode; });
    });
    document.querySelectorAll('#difficulty-options .option-card').forEach(btn => {
      btn.addEventListener('click', () => { Audio.ensure(); Audio.uiClick(); document.querySelectorAll('#difficulty-options .option-card').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); state.difficulty = btn.dataset.difficulty; });
    });
    $('start-game-btn').addEventListener('click', () => { Audio.uiClick(); startGame(); });
    $('pause-btn').addEventListener('click', () => { Audio.ensure(); Audio.uiClick(); togglePause(); });
    $('mute-btn').addEventListener('click', () => { Audio.uiClick(); toggleMute(); });
    $('resume-btn').addEventListener('click', () => { Audio.uiClick(); resumeGame(); });
    $('restart-btn').addEventListener('click', () => { Audio.uiClick(); dom.pauseOverlay.classList.remove('active'); dom.pauseOverlay.setAttribute('aria-hidden', 'true'); startGame(); });
    $('quit-btn').addEventListener('click', () => { Audio.uiClick(); quitToHome(); });
    $('play-again-btn').addEventListener('click', () => { Audio.uiClick(); dom.gameoverOverlay.classList.remove('active'); dom.gameoverOverlay.setAttribute('aria-hidden', 'true'); startGame(); });
    $('home-btn').addEventListener('click', () => { Audio.uiClick(); dom.gameoverOverlay.classList.remove('active'); dom.gameoverOverlay.setAttribute('aria-hidden', 'true'); quitToHome(); });
  }

  function init() {
    cacheDom(); bindSetup(); bindInput(); renderLeaderboard(); updateMuteUI(); updateDirUI(); showScreen('home');
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();


