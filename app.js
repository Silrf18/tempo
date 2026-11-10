'use strict';
/* Tempo — temporizador de entreno. Funciona 100 % sin conexión:
   no hay ni una petición de red en este archivo y la página la tiene bloqueada (CSP connect-src 'none'). */

/* ======================= Modelo ======================= */

const MODES = {
  hiit: { title: 'Intervalos', desc: 'Trabajo y descanso', icon: 'pulse' },
  tabata: { title: 'Tabata', desc: '20 s / 10 s × 8', icon: 'bolt' },
  emom: { title: 'EMOM', desc: 'Cada minuto, a tope', icon: 'emom' },
  amrap: { title: 'AMRAP', desc: 'Máximas rondas', icon: 'amrap' },
  fortime: { title: 'Por tiempo', desc: 'Contra el reloj', icon: 'flag' },
  stopwatch: { title: 'Cronómetro', desc: 'Tiempo libre', icon: 'stopwatch' },
};
const MODE_KEYS = Object.keys(MODES);
const countsUp = (m) => m === 'fortime' || m === 'stopwatch';

const BASE = {
  hiit: [10, 40, 20, 8, 1, 60],
  tabata: [10, 20, 10, 8, 1, 60],
  emom: [10, 60, 0, 10, 1, 0],
  amrap: [10, 720, 0, 1, 1, 0],
  fortime: [10, 1200, 0, 1, 1, 0],
  stopwatch: [0, 3600, 0, 1, 1, 0],
};
const alertDefaults = () => ({ count: 3, when: 'both', tone: 'classic', phase: true, half: false, voice: false, vibrate: true });

function defaultConfig(m) {
  const b = BASE[m] || BASE.hiit;
  return { prep: b[0], work: b[1], rest: b[2], rounds: b[3], sets: b[4], setRest: b[5], alerts: alertDefaults() };
}
function normConfig(c, m) {
  const out = Object.assign(defaultConfig(m || 'hiit'), c || {});
  out.alerts = Object.assign(alertDefaults(), (c && c.alerts) || {});
  return out;
}

const FIELDS = {
  prep: { time: true, min: 0, max: 300 },
  work: { time: true, min: 5, max: 5940 },
  rest: { time: true, min: 0, max: 600 },
  rounds: { time: false, min: 1, max: 99 },
  sets: { time: false, min: 1, max: 20 },
  setRest: { time: true, min: 0, max: 600 },
};
const stepUp = (k, v) => (!FIELDS[k].time ? 1 : v < 60 ? 5 : v < 300 ? 15 : 60);
const stepDown = (k, v) => (!FIELDS[k].time ? 1 : v <= 60 ? 5 : v <= 300 ? 15 : 60);

function fieldsFor(m) {
  if (m === 'hiit' || m === 'tabata') return ['prep', 'work', 'rest', 'rounds', 'sets', 'setRest'];
  if (m === 'emom') return ['prep', 'work', 'rounds'];
  return ['prep', 'work'];
}
function fieldLabel(m, k) {
  const over = {
    emom: { work: ['Intervalo', 'Empieza uno cada'], rounds: ['Rondas', 'Número de intervalos'] },
    amrap: { work: ['Duración', 'Máximas rondas posibles'] },
    fortime: { work: ['Tiempo límite', 'Termina antes del límite'] },
    stopwatch: { work: ['Límite', 'Se detiene al llegar'] },
  }[m] || {};
  const base = {
    prep: ['Preparación', 'Cuenta atrás inicial'],
    work: ['Trabajo', 'Esfuerzo máximo'],
    rest: ['Descanso', 'Entre rondas'],
    rounds: ['Rondas', 'Por serie'],
    sets: ['Series', 'Bloques completos'],
    setRest: ['Descanso entre series', 'Recuperación larga'],
  };
  return over[k] || base[k];
}

// Colores de fase como variables CSS: en el iPhone usan la gama ampliada (Display P3) de app.css.
const HEX = { prep: 'var(--orange)', work: 'var(--volt)', rest: 'var(--blue)', setrest: 'var(--blue)' };
const fieldColor = (k) => (k === 'prep' ? HEX.prep : k === 'work' ? HEX.work : k === 'rest' || k === 'setRest' ? HEX.rest : 'var(--text)');

function buildPhases(m, c) {
  const P = [];
  if (c.prep > 0) P.push({ type: 'prep', dur: c.prep, round: 0, set: 1 });
  const sets = Math.max(1, c.sets || 1);
  const rounds = Math.max(1, c.rounds || 1);
  for (let s = 1; s <= sets; s++) {
    for (let r = 1; r <= rounds; r++) {
      P.push({ type: 'work', dur: c.work, round: r, set: s, up: countsUp(m) });
      if (r < rounds && c.rest > 0) P.push({ type: 'rest', dur: c.rest, round: r, set: s });
    }
    if (s < sets && c.setRest > 0) P.push({ type: 'setrest', dur: c.setRest, round: rounds, set: s });
  }
  return P;
}
const sumDur = (P) => P.reduce((a, p) => a + p.dur, 0);
const totalSeconds = (m, c) => sumDur(buildPhases(m, c));

function clock(s) {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}

function summaryText(m, c) {
  if (m === 'emom') return `${c.rounds} rondas, una cada ${clock(c.work)}`;
  if (m === 'amrap') return `Máximas rondas en ${clock(c.work)}`;
  if (m === 'fortime') return `Termina antes de ${clock(c.work)}`;
  if (m === 'stopwatch') return `Cuenta hacia arriba hasta ${clock(c.work)}`;
  return `${c.rounds} rondas de ${c.work} s / ${c.rest} s` + (c.sets > 1 ? ` × ${c.sets} series` : '');
}
function timerTitle(m, c) {
  const t = MODES[m].title;
  if (m === 'hiit' || m === 'tabata') return `${t} · ${c.work}/${c.rest}`;
  if (m === 'emom') return `${t} · ${c.rounds} × ${clock(c.work)}`;
  if (m === 'amrap') return `${t} · ${clock(c.work)}`;
  return t;
}
function metaText(m, c) {
  if (m === 'hiit' || m === 'tabata') return `${MODES[m].title} · ${c.work}/${c.rest} × ${c.rounds}` + (c.sets > 1 ? ` · ${c.sets} series` : '');
  if (m === 'emom') return `EMOM · ${c.rounds} rondas de ${clock(c.work)}`;
  if (m === 'amrap') return `AMRAP · ${clock(c.work)}`;
  if (m === 'fortime') return `Por tiempo · límite ${clock(c.work)}`;
  return 'Cronómetro';
}
function alertsSummary(a) {
  const w = { work: 'final del trabajo', rest: 'final del descanso', both: 'cada intervalo' }[a.when] || 'cada intervalo';
  let t = a.count > 0 ? `${a.count} ${a.count === 1 ? 'pitido' : 'pitidos'} · ${w}` : 'Sin cuenta atrás';
  if (a.voice) t += ' · voz';
  if (a.half) t += ' · aviso a mitad';
  return t;
}
function alertsCaption(a) {
  const w = { work: 'del trabajo', rest: 'del descanso', both: 'de cada intervalo' }[a.when] || 'de cada intervalo';
  const parts = [];
  if (a.count > 0) {
    const what = a.voice ? `Cuenta en voz alta ${a.count} s` : a.count === 1 ? '1 pitido' : `${a.count} pitidos`;
    parts.push(`${what} al final ${w}`);
  }
  if (a.phase) parts.push('pitido largo al cambiar de fase');
  if (a.half) parts.push('doble pitido a mitad');
  const s = parts.length ? parts.join(' · ') : 'Sin avisos sonoros';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const SPOKEN = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];

/* ======================= Guardado local ======================= */

const LS = {
  get(k, d) {
    try {
      const v = localStorage.getItem('tempo.' + k);
      return v == null ? d : JSON.parse(v);
    } catch (e) {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('tempo.' + k, JSON.stringify(v));
    } catch (e) { /* almacenamiento lleno o bloqueado */ }
  },
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function seedPresets() {
  return [
    { id: uid(), title: 'Piernas explosivas', mode: 'hiit', cfg: normConfig({ prep: 10, work: 45, rest: 15, rounds: 10, sets: 1, setRest: 60 }) },
    { id: uid(), title: 'Tabata core', mode: 'tabata', cfg: normConfig({ prep: 10, work: 20, rest: 10, rounds: 8, sets: 2, setRest: 60, alerts: { count: 5, when: 'rest', tone: 'digital' } }) },
    { id: uid(), title: 'EMOM cardio', mode: 'emom', cfg: normConfig({ prep: 10, work: 60, rest: 0, rounds: 12, sets: 1, setRest: 0, alerts: { count: 3, when: 'work', tone: 'soft', half: true, voice: true } }) },
  ];
}
function loadPresets() {
  const raw = LS.get('presets', null);
  if (!Array.isArray(raw)) {
    const p = seedPresets();
    LS.set('presets', p);
    return p;
  }
  return raw.filter((p) => p && MODES[p.mode]).map((p) => ({ id: p.id || uid(), title: String(p.title || ''), mode: p.mode, cfg: normConfig(p.cfg, p.mode) }));
}

/* ======================= Sonido, voz y vibración ======================= */

const Sound = {
  ctx: null,
  voice: null,
  primed: false,
  canVibrate: typeof navigator.vibrate === 'function',
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
      if (this.ctx && !this.primed) {
        const b = this.ctx.createBuffer(1, 1, 22050);
        const s = this.ctx.createBufferSource();
        s.buffer = b;
        s.connect(this.ctx.destination);
        s.start(0);
      }
      if (!this.primed && 'speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        speechSynthesis.speak(u);
      }
      this.primed = true;
    } catch (e) { /* sin audio */ }
  },
  tone(freq, ms, kind, delay) {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const K = { classic: ['triangle', 1, 0.5], digital: ['square', 1, 0.22], soft: ['sine', 0.75, 0.6] }[kind] || ['triangle', 1, 0.5];
      const t0 = ctx.currentTime + (delay || 0) / 1000;
      const dur = ms / 1000;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = K[0];
      o.frequency.setValueAtTime(freq * K[1], t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(K[2], t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    } catch (e) { /* nada */ }
  },
  pickVoice() {
    if (!('speechSynthesis' in window)) return;
    // Solo voces del propio dispositivo (localService): nunca voces en la nube.
    const vs = speechSynthesis.getVoices().filter((v) => v.lang && /^es/i.test(v.lang) && v.localService);
    this.voice = vs.find((v) => /es[-_]ES/i.test(v.lang)) || vs[0] || null;
  },
  say(text) {
    if (!this.voice || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = this.voice;
      u.lang = this.voice.lang;
      u.rate = 1.1;
      speechSynthesis.speak(u);
    } catch (e) { /* nada */ }
  },
  vibrate(p) {
    try {
      if (this.canVibrate) navigator.vibrate(p);
    } catch (e) { /* nada */ }
  },
};
if ('speechSynthesis' in window) {
  Sound.pickVoice();
  speechSynthesis.onvoiceschanged = () => {
    Sound.pickVoice();
    if (S.screen === 'alerts') render();
  };
}

/* ======================= Estado ======================= */

const S = {
  screen: 'home',
  mode: 'hiit',
  cfg: defaultConfig('hiit'),
  presetId: null,
  presetTitle: null,
  presets: loadPresets(),
  history: (LS.get('history', []) || []).filter((h) => h && MODES[h.mode]),
  settings: Object.assign({ fullColor: true, keepAwake: true }, LS.get('settings', {})),
  phases: [],
  idx: 0,
  running: false,
  endsAt: 0,
  left: 0,
  soundOn: true,
  locked: false,
  result: { total: 0, rounds: 0, work: 0, rest: 0 },
  testPlaying: null,
  showAll: false,
  dialog: null,
};
let lastBeep = -1;
let halfDone = false;
const now = () => Date.now();
const remainingMs = () => (S.running ? Math.max(0, S.endsAt - now()) : S.left);
const findPreset = (id) => S.presets.find((p) => p.id === id);
const workoutTitle = () => S.presetTitle || MODES[S.mode].title;

/* ======================= Motor del temporizador ======================= */

function tone(f, ms, d) { if (S.soundOn) Sound.tone(f, ms, S.cfg.alerts.tone, d); }
function say(t) { if (S.soundOn && S.cfg.alerts.voice) Sound.say(t); }
function vibe(p) { if (S.cfg.alerts.vibrate) Sound.vibrate(p); }

function cue(type) {
  const a = S.cfg.alerts;
  if (a.phase) {
    if (type === 'work') tone(1320, 550);
    else if (type === 'prep') tone(990, 250);
    else tone(660, 550);
  }
  const workWord = S.mode === 'hiit' || S.mode === 'tabata' || S.mode === 'emom' ? 'Trabajo' : '¡Vamos!';
  say({ prep: 'Prepárate', work: workWord, rest: 'Descanso', setrest: 'Descanso largo' }[type]);
  if (type === 'work') vibe([200, 80, 200]);
  else if (type !== 'prep') vibe([400]);
}

function start() {
  const P = buildPhases(S.mode, S.cfg);
  if (!P.length) return;
  Sound.unlock();
  S.phases = P;
  S.idx = 0;
  S.endsAt = now() + P[0].dur * 1000;
  S.left = P[0].dur * 1000;
  S.running = true;
  S.locked = false;
  lastBeep = -1;
  halfDone = false;
  if (!S.presetId) {
    const last = LS.get('last', {});
    last[S.mode] = S.cfg;
    LS.set('last', last);
  }
  go('timer');
  cue(P[0].type);
}

function toggle() {
  const t = now();
  if (S.running) {
    S.left = Math.max(0, S.endsAt - t);
    S.running = false;
  } else {
    Sound.unlock();
    S.endsAt = t + S.left;
    S.running = true;
  }
  render();
}

function jump(i) {
  if (i >= S.phases.length) {
    finish(false);
    return;
  }
  const k = Math.max(0, i);
  const ms = S.phases[k].dur * 1000;
  S.idx = k;
  S.endsAt = now() + ms;
  S.left = ms;
  lastBeep = -1;
  halfDone = false;
  render();
  cue(S.phases[k].type);
}

function finish(natural) {
  const cur = S.phases[S.idx];
  const curMs = !cur ? 0 : natural ? cur.dur * 1000 : Math.max(0, cur.dur * 1000 - remainingMs());
  const r = { total: 0, rounds: 0, work: 0, rest: 0 };
  S.phases.forEach((p, i) => {
    if (i > S.idx) return;
    const s = i < S.idx ? p.dur : Math.floor(curMs / 1000);
    r.total += s;
    if (p.type === 'work') {
      r.work += s;
      if (s > 0) r.rounds += 1;
    } else if (p.type !== 'prep') r.rest += s;
  });
  S.result = r;
  S.running = false;
  S.history = [{ at: Date.now(), title: workoutTitle(), mode: S.mode, seconds: r.total, rounds: r.rounds }].concat(S.history).slice(0, 300);
  LS.set('history', S.history);
  go('done');
  tone(1320, 160);
  tone(1320, 160, 220);
  tone(1760, 600, 440);
  say('Entreno completado');
  vibe([150, 80, 150, 80, 400]);
}

function engineTick() {
  if (S.screen !== 'timer' || !S.running || !S.phases.length) return;
  const t = now();
  let i = S.idx;
  let e = S.endsAt;
  if (t >= e) {
    while (t >= e) {
      i += 1;
      if (i >= S.phases.length) {
        finish(true);
        return;
      }
      e += S.phases[i].dur * 1000;
    }
    S.idx = i;
    S.endsAt = e;
    lastBeep = -1;
    halfDone = false;
    render();
    cue(S.phases[i].type);
  }
  const ph = S.phases[i];
  const a = S.cfg.alerts;
  const left = e - t;
  const applies = a.when === 'both' || (a.when === 'work' ? ph.type === 'work' : ph.type !== 'work');
  const sec = Math.ceil(left / 1000);
  if (applies && sec >= 1 && sec <= a.count && lastBeep !== sec) {
    lastBeep = sec;
    if (a.voice && S.soundOn && Sound.voice) say(SPOKEN[sec] || String(sec));
    else tone(880, 120);
  }
  if (a.half && !halfDone && ph.type !== 'prep' && ph.dur >= 10 && ph.dur * 1000 - left >= ph.dur * 500) {
    halfDone = true;
    tone(1100, 100);
    tone(1100, 100, 160);
    say('Mitad');
  }
}

/* Pantalla encendida mientras el temporizador está abierto */
const Wake = {
  lock: null,
  async update() {
    const want = S.screen === 'timer' && S.settings.keepAwake && document.visibilityState === 'visible';
    try {
      if (want && !this.lock && navigator.wakeLock) {
        this.lock = await navigator.wakeLock.request('screen');
        this.lock.addEventListener('release', () => { this.lock = null; });
      } else if (!want && this.lock) {
        const l = this.lock;
        this.lock = null;
        await l.release();
      }
    } catch (e) {
      this.lock = null;
    }
  },
};

/* ======================= Iconos ======================= */

const STROKE = {
  pulse: ['M3 12L7 12L10 5L14 19L17 12L21 12'],
  bolt: ['M13 2L4 14h7l-1 8 9-12h-7z'],
  emom: ['M20 12a8 8 0 1 1-2.34-5.66', 'M20 4v4h-4', 'M12 8v4l2.5 2.5'],
  amrap: ['M17 2l3 3-3 3', 'M4 11V9a4 4 0 0 1 4-4h12', 'M7 22l-3-3 3-3', 'M20 13v2a4 4 0 0 1-4 4H4'],
  flag: ['M5 21V4', 'M5 4h12l-2.5 4L17 12H5'],
  stopwatch: ['M5 14a7 7 0 1 0 14 0a7 7 0 1 0-14 0', 'M12 10v4l2 2', 'M10 3h4', 'M12 3v4'],
  history: ['M3 12a9 9 0 1 0 2.64-6.36', 'M3 4v4h4', 'M12 8v4l3 2'],
  sliders: ['M4 7h9', 'M19 7h1', 'M4 17h3', 'M13 17h7', 'M13.5 7a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0', 'M7.5 17a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0'],
  back: ['M15 5l-7 7 7 7'],
  chev: ['M9 5l7 7-7 7'],
  bookmark: ['M7 4h10v16l-5-4-5 4z'],
  bell: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  minus: ['M6 12h12'],
  plus: ['M12 6v12', 'M6 12h12'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  vol: ['M4 9h4l5-4v14l-5-4H4z', 'M16.5 8.5a5 5 0 0 1 0 7', 'M19 6a8.5 8.5 0 0 1 0 12'],
  mute: ['M4 9h4l5-4v14l-5-4H4z', 'M17 9l5 6', 'M22 9l-5 6'],
  lock: ['M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  repeat: ['M4 12a8 8 0 0 1 14-5.3L20 9', 'M20 4v5h-5', 'M20 12a8 8 0 0 1-14 5.3L4 15', 'M4 20v-5h5'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
};
const FILL = {
  play: ['M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z'],
  pause: ['M7.2 5h1.6A1.2 1.2 0 0 1 10 6.2v11.6a1.2 1.2 0 0 1-1.2 1.2H7.2A1.2 1.2 0 0 1 6 17.8V6.2A1.2 1.2 0 0 1 7.2 5z', 'M15.2 5h1.6A1.2 1.2 0 0 1 18 6.2v11.6a1.2 1.2 0 0 1-1.2 1.2h-1.6a1.2 1.2 0 0 1-1.2-1.2V6.2A1.2 1.2 0 0 1 15.2 5z'],
  prev: ['M19 5.5v13L9 12z', 'M5 5h2.6v14H5z'],
  next: ['M5 5.5v13L15 12z', 'M16.4 5h2.6v14h-2.6z'],
};
function icon(n, size) {
  const s = size || 20;
  const filled = !!FILL[n];
  const paths = (filled ? FILL[n] : STROKE[n] || []).map((d) => `<path d="${d}"/>`).join('');
  return `<svg class="${filled ? 'f' : 'i'}" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ======================= Vistas ======================= */

function topBar(title, right) {
  return `<header class="topbar">
    <button class="cbtn" data-act="back" aria-label="Volver">${icon('back')}</button>
    <span class="title">${esc(title)}</span>
    ${right || '<span class="spacer44"></span>'}
  </header>`;
}

function viewHome() {
  const tiles = MODE_KEYS.map((k) => {
    const m = MODES[k];
    return `<button class="tile${k === 'hiit' ? ' feat' : ''}" data-act="pickMode" data-arg="${k}">
      <span class="chip">${icon(m.icon)}</span>
      <span class="tile-txt"><span class="tile-name">${m.title}</span><span class="tile-desc">${m.desc}</span></span>
    </button>`;
  }).join('');
  const list = S.showAll ? S.presets : S.presets.slice(0, 3);
  const rows = list.map((p) => `
    <div class="preset" data-long="askDelete" data-arg="${p.id}">
      <button class="preset-main" data-act="openPreset" data-arg="${p.id}">
        <span class="p-title">${esc(p.title)}</span>
        <span class="p-meta">${esc(metaText(p.mode, p.cfg))}</span>
      </button>
      <span class="p-time">${clock(totalSeconds(p.mode, p.cfg))}</span>
      <button class="cbtn volt" data-act="playPreset" data-arg="${p.id}" aria-label="Empezar ${esc(p.title)}">${icon('play', 18)}</button>
    </div>`).join('');
  const more = S.presets.length > 3
    ? `<button class="link" data-act="toggleShowAll">${S.showAll ? 'Ver menos' : `Ver todos (${S.presets.length})`}</button>`
    : '';
  return `<main class="screen home">
    <header class="bar">
      <span class="logo">${icon('pulse')}</span>
      <span class="brand">TEMPO</span>
      <span class="grow"></span>
      <button class="cbtn" data-act="go" data-arg="history" aria-label="Historial">${icon('history')}</button>
      <button class="cbtn" data-act="go" data-arg="settings" aria-label="Ajustes">${icon('sliders')}</button>
    </header>
    <div class="hero"><span class="overline">Entrenar</span><h1 class="h1">¿Qué toca hoy?</h1></div>
    <div class="grid">${tiles}</div>
    <section class="presets">
      <div class="sec-head"><h2 class="overline">Mis entrenos</h2>${more}</div>
      ${S.presets.length
        ? rows + '<p class="hint">Mantén pulsado un entreno para borrarlo</p>'
        : '<p class="hint">Aún no tienes entrenos guardados. Configura uno y pulsa el marcador de arriba a la derecha para guardarlo.</p>'}
    </section>
  </main>`;
}

function stepRow(k, label, hint, valueText, opts) {
  return `<div class="srow${opts.dim ? ' dim' : ''}">
    ${opts.dot ? `<span class="dot" style="background:${opts.dot}"></span>` : ''}
    <span class="s-txt"><span class="s-l">${label}</span><span class="s-h">${hint}</span></span>
    <button class="step" data-act="${opts.act}" data-rep data-arg="${k}:-" ${opts.decOff ? 'disabled' : ''} aria-label="Menos ${label}">${icon('minus', 18)}</button>
    <span class="s-v">${valueText}</span>
    <button class="step" data-act="${opts.act}" data-rep data-arg="${k}:+" ${opts.incOff ? 'disabled' : ''} aria-label="Más ${label}">${icon('plus', 18)}</button>
  </div>`;
}

function viewSetup() {
  const m = S.mode;
  const c = S.cfg;
  const P = buildPhases(m, c);
  const rows = fieldsFor(m).map((k) => {
    const [label, hint] = fieldLabel(m, k);
    const f = FIELDS[k];
    const v = c[k];
    const off = k === 'setRest' && c.sets < 2;
    return stepRow(k, label, hint, f.time ? clock(v) : v, {
      act: 'step', dot: fieldColor(k), dim: off, decOff: off || v <= f.min, incOff: off || v >= f.max,
    });
  }).join('');
  const segs = P.map((p) => `<i style="flex:${p.dur} 1 0;height:${p.type === 'work' ? 10 : 5}px;background:${HEX[p.type]}"></i>`).join('');
  return `<main class="screen fixed">
    ${topBar(S.presetTitle || MODES[m].title, `<button class="cbtn" data-act="askSave" aria-label="Guardar entreno">${icon('bookmark')}</button>`)}
    <div class="scroll">
      <div class="card total">
        <div class="total-top">
          <div><span class="overline sm">Tiempo total</span><span class="total-v">${clock(sumDur(P))}</span></div>
          <span class="total-sum">${summaryText(m, c)}</span>
        </div>
        <div class="struct">${segs}</div>
        <div class="legend">
          <span><i style="height:10px;background:${HEX.work}"></i>Trabajo</span>
          <span><i style="height:5px;background:${HEX.rest}"></i>Descanso</span>
          <span><i style="height:5px;background:${HEX.prep}"></i>Preparación</span>
        </div>
      </div>
      <div class="card">${rows}</div>
      <button class="card navrow" data-act="go" data-arg="alerts">
        <span class="chip">${icon('bell', 19)}</span>
        <span class="nr-txt"><span class="nr-t">Avisos y pitidos</span><span class="nr-s">${alertsSummary(c.alerts)}</span></span>
        <span class="muted">${icon('chev', 18)}</span>
      </button>
    </div>
    <button class="primary" data-act="start">${icon('play', 22)}<span>Empezar</span></button>
  </main>`;
}

function viewAlerts() {
  const a = S.cfg.alerts;
  const ticks = [];
  for (let s = 10; s >= 0; s--) {
    const on = s === 0 ? a.phase || a.voice : s <= a.count;
    let size = s === 0 ? (on ? 20 : 8) : on ? 12 : 6;
    if (S.testPlaying === s) size += 10;
    ticks.push(`<span class="tick${on ? ' on' : ''}${s === 0 ? ' zero' : ''}"><span class="tb"><span class="td" style="width:${size}px;height:${size}px"></span></span><span class="tl">${s}</span></span>`);
  }
  const seg = (key, opts) => `<div class="seg" role="radiogroup">${opts.map(([v, l]) =>
    `<button role="radio" aria-checked="${a[key] === v}" data-act="${key === 'when' ? 'setWhen' : 'setTone'}" data-arg="${v}">${l}</button>`).join('')}</div>`;
  const toggleRow = (k, label, hint, disabled) => `<button class="trow${disabled ? ' dim' : ''}" role="switch" aria-checked="${!!a[k]}" data-act="toggleAlert" data-arg="${k}" ${disabled ? 'disabled' : ''}>
      <span class="t-txt"><span class="t-l">${label}</span><span class="t-h">${hint}</span></span>
      <span class="sw${a[k] && !disabled ? ' on' : ''}"><i></i></span>
    </button>`;
  return `<main class="screen fixed">
    ${topBar('Avisos')}
    <div class="scroll" style="gap:12px">
      <div class="card preview">
        <div class="pv-head">
          <span class="overline sm">Final de cada intervalo</span>
          <button class="pill" data-act="testAlerts">${icon('play', 14)}<span>${S.testPlaying != null ? 'Sonando…' : 'Probar'}</span></button>
        </div>
        <div class="ticks">${ticks.join('')}</div>
        <p class="caption">${alertsCaption(a)}</p>
      </div>
      <h2 class="overline sm sec">Cuenta atrás</h2>
      <div class="card divided">
        ${stepRow('count', 'Pitidos', 'Últimos segundos del intervalo', a.count === 0 ? 'No' : a.count, { act: 'alertCount', decOff: a.count <= 0, incOff: a.count >= 10 })}
        <div class="segblock"><span>Suenan al acabar</span>${seg('when', [['work', 'Trabajo'], ['rest', 'Descanso'], ['both', 'Ambos']])}</div>
        <div class="segblock"><span>Tono</span>${seg('tone', [['classic', 'Clásico'], ['digital', 'Digital'], ['soft', 'Suave']])}</div>
      </div>
      <h2 class="overline sm sec">Más avisos</h2>
      <div class="card divided">
        ${toggleRow('phase', 'Pitido al cambiar de fase', 'Agudo al trabajar, grave al descansar')}
        ${toggleRow('half', 'Aviso a mitad del intervalo', 'Doble pitido corto')}
        ${toggleRow('voice', 'Voz', Sound.voice ? 'Dice la fase y cuenta los segundos' : 'No hay voz en español instalada en el dispositivo')}
        ${toggleRow('vibrate', 'Vibración', Sound.canVibrate ? 'Al empezar cada fase' : 'El navegador del iPhone no permite vibrar', !Sound.canVibrate)}
      </div>
    </div>
  </main>`;
}

let R = {};
const C_RING = 904.78;

function viewTimer() {
  const P = S.phases;
  const ph = P[S.idx];
  const m = S.mode;
  const c = S.cfg;
  const full = S.settings.fullColor;
  const accent = HEX[ph.type];
  const dark = '#0A0B0D';
  const t = full
    ? { bg: accent, fg: dark, sub: 'rgba(10,11,13,.72)', track: 'rgba(10,11,13,.14)', ring: dark, btn: 'rgba(10,11,13,.10)', main: dark, mainFg: accent, card: 'rgba(10,11,13,.08)', label: dark }
    : { bg: dark, fg: '#F4F5F1', sub: '#9BA1A9', track: '#1E2126', ring: accent, btn: '#1A1D22', main: accent, mainFg: dark, card: '#14161A', label: accent };
  const workLabel = { amrap: 'AMRAP', fortime: 'Por tiempo', stopwatch: 'Cronómetro' }[m] || 'Trabajo';
  const phaseLabel = (type) => ({ prep: 'Prepárate', work: workLabel, rest: 'Descanso', setrest: 'Descanso largo' }[type]);
  const rounds = Math.max(1, c.rounds);
  const sets = Math.max(1, c.sets);
  let roundText = '';
  if (ph.type === 'prep') roundText = 'Empieza en';
  else if (ph.type === 'setrest') roundText = `Serie ${ph.set} / ${sets} completada`;
  else if (rounds > 1 || sets > 1) roundText = `Ronda ${ph.round} / ${rounds}` + (sets > 1 ? ` · Serie ${ph.set} / ${sets}` : '');
  else if (m === 'amrap') roundText = 'Máximas rondas posibles';
  else if (ph.up) roundText = `Límite ${clock(ph.dur)}`;
  const nx = P[S.idx + 1];
  const nextLabel = !nx ? 'Fin del entreno' : nx.type === 'work' ? workLabel + (rounds > 1 ? ` · Ronda ${nx.round}` : '') : phaseLabel(nx.type);
  const nextTime = nx ? clock(nx.dur) : '';
  const segs = P.map((p, i) => (p.type === 'prep' ? '' :
    `<i class="${p.type === 'work' ? 'hi' : 'lo'}" style="flex:${p.dur} 1 0"><b${i === S.idx ? ' id="segCur"' : ''} style="width:${i < S.idx ? 100 : 0}%;background:${full ? dark : HEX[p.type]}"></b></i>`)).join('');
  const vars = `--tb:${t.bg};--tf:${t.fg};--ts:${t.sub};--tt:${t.track};--tr:${t.ring};--tbtn:${t.btn};--tm:${t.main};--tmf:${t.mainFg};--tc:${t.card};--tl:${t.label}`;
  const controls = S.locked
    ? `<button class="unlock" data-long="unlock">${icon('lock', 19)}<span>Mantén pulsado para desbloquear</span></button>`
    : `<button class="cbtn t c62" data-act="prev" aria-label="Reiniciar intervalo">${icon('prev', 24)}</button>
       <button class="cbtn tmain" data-act="toggle" aria-label="${S.running ? 'Pausar' : 'Reanudar'}">${icon(S.running ? 'pause' : 'play', 36)}</button>
       <button class="cbtn t c62" data-act="skip" aria-label="Saltar intervalo">${icon('next', 24)}</button>`;
  return `<main class="screen fixed timer" style="${vars}">
    <div class="tbar">
      <div class="tside">${S.locked ? '' : `<button class="cbtn t" data-act="askStop" aria-label="Terminar entreno">${icon('close')}</button>`}</div>
      <span class="ttitle">${esc(timerTitle(m, c))}</span>
      <div class="tside r">${S.locked ? '' : `
        <button class="cbtn t" data-act="sound" aria-label="${S.soundOn ? 'Silenciar avisos' : 'Activar avisos'}">${icon(S.soundOn ? 'vol' : 'mute')}</button>
        <button class="cbtn t" data-act="lock" aria-label="Bloquear pantalla">${icon('lock', 19)}</button>`}</div>
    </div>
    <div class="tprog">${segs}</div>
    <div class="tstats"><span><b id="tElapsed">0:00</b> transcurrido</span><span><b id="tLeft">0:00</b> restante</span></div>
    <div class="flex1"></div>
    <div class="tphase"><span class="tlabel">${phaseLabel(ph.type)}</span><span class="tround">${roundText}</span></div>
    <div class="flex06"></div>
    <div class="ring" id="ring">
      <svg viewBox="0 0 300 300" aria-hidden="true"><circle class="track" cx="150" cy="150" r="144"/><circle class="prog" id="ringProg" cx="150" cy="150" r="144"/></svg>
      <div class="ring-in"><span class="tbig" id="tBig" role="timer"></span><span class="tunit" id="tUnit"></span></div>
    </div>
    <div class="flex1"></div>
    <div class="tnext"><div><span><span class="tn-l">Siguiente</span><span class="tn-v">${nextLabel}</span></span><span class="tn-t">${nextTime}</span></div></div>
    <div class="tctrl">${controls}</div>
  </main>`;
}

function bindTimer() {
  const $ = (id) => document.getElementById(id);
  R = { big: $('tBig'), unit: $('tUnit'), ring: $('ringProg'), seg: $('segCur'), el: $('tElapsed'), left: $('tLeft'), box: $('ring') };
  R.scale = R.box ? R.box.clientWidth / 300 : 1;
  R.lastBig = null;
}

function tickUI() {
  if (S.screen !== 'timer' || !R.big) return;
  const P = S.phases;
  const ph = P[S.idx];
  const durMs = ph.dur * 1000;
  const rem = Math.min(durMs, remainingMs());
  const secs = ph.up ? Math.floor((durMs - rem) / 1000) : Math.ceil(rem / 1000);
  const big = secs >= 60 ? clock(secs) : String(secs);
  if (big !== R.lastBig) {
    R.lastBig = big;
    R.big.textContent = big;
    const base = big.length <= 2 ? 164 : big.length <= 4 ? 120 : 98;
    R.big.style.fontSize = (base * R.scale).toFixed(1) + 'px';
    R.unit.textContent = secs >= 60 ? 'minutos' : 'segundos';
  }
  const frac = durMs > 0 ? (ph.up ? (durMs - rem) / durMs : rem / durMs) : 0;
  R.ring.style.strokeDashoffset = (C_RING * (1 - frac)).toFixed(1);
  R.ring.style.opacity = frac > 0.002 ? '1' : '0';
  if (R.seg) R.seg.style.width = (durMs > 0 ? (1 - rem / durMs) * 100 : 0).toFixed(2) + '%';
  let after = 0;
  for (let i = S.idx + 1; i < P.length; i++) after += P[i].dur * 1000;
  const total = sumDur(P) * 1000;
  const remT = after + rem;
  R.el.textContent = clock((total - remT) / 1000);
  R.left.textContent = clock(Math.ceil(remT / 1000));
}

function viewDone() {
  const r = S.result;
  const sub = (S.presetTitle ? S.presetTitle + ' · ' : '') + metaText(S.mode, S.cfg);
  return `<main class="screen fixed done">
    <div class="done-hero">
      <span class="badge">${icon('check', 54)}</span>
      <h1 class="big-title">¡Hecho!</h1>
      <div class="done-sub"><span class="overline">Entreno completado</span><b>${esc(sub)}</b></div>
    </div>
    <div class="stats">
      <div class="card stat"><span class="overline sm">Tiempo total</span><b class="v">${clock(r.total)}</b></div>
      <div class="card stat"><span class="overline sm">Rondas</span><b>${r.rounds}</b></div>
      <div class="card stat"><span class="overline sm">Trabajo</span><b>${clock(r.work)}</b></div>
      <div class="card stat"><span class="overline sm">Descanso</span><b>${clock(r.rest)}</b></div>
    </div>
    <button class="outline" data-act="askSave">${icon('bookmark', 18)}<span>${S.presetId ? 'Actualizar en mis entrenos' : 'Guardar en mis entrenos'}</span></button>
    <div class="row2">
      <button class="secondary" data-act="start">${icon('repeat')}<span>Repetir</span></button>
      <button class="primary" data-act="home"><span>Terminar</span></button>
    </div>
  </main>`;
}

const DATE_FMT = (() => {
  try {
    return new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return null;
  }
})();
function fmtDate(ms) {
  const d = new Date(ms);
  const s = DATE_FMT ? DATE_FMT.format(d) : d.toLocaleString();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function viewHistory() {
  const list = S.history;
  const right = list.length ? `<button class="cbtn" data-act="askClearHistory" aria-label="Borrar historial">${icon('trash')}</button>` : '';
  if (!list.length) {
    return `<main class="screen fixed">${topBar('Historial', right)}<div class="empty">Todavía no has terminado ningún entreno.<br>¡A por el primero!</div></main>`;
  }
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const week = list.filter((h) => h.at >= weekAgo);
  const rows = list.map((h) => `<div class="card hrow">
      <span class="h-txt"><span class="h-date">${esc(fmtDate(h.at))}</span><span class="h-title">${esc(h.title)}</span></span>
      <span class="h-right"><span class="h-time">${clock(h.seconds)}</span>${h.rounds > 1 ? `<span class="h-rounds">${h.rounds} rondas</span>` : ''}</span>
    </div>`).join('');
  return `<main class="screen fixed">
    ${topBar('Historial', right)}
    <div class="scroll" style="gap:10px">
      <div class="stats">
        <div class="card stat"><span class="overline sm">Esta semana</span><b class="v">${week.length}</b></div>
        <div class="card stat"><span class="overline sm">Tiempo</span><b>${clock(week.reduce((a, h) => a + h.seconds, 0))}</b></div>
      </div>
      <h2 class="overline sm sec" style="padding-top:8px">Últimos entrenos</h2>
      ${rows}
    </div>
  </main>`;
}

function viewSettings() {
  const st = S.settings;
  const row = (k, label, hint) => `<button class="trow" role="switch" aria-checked="${!!st[k]}" data-act="setting" data-arg="${k}">
      <span class="t-txt"><span class="t-l">${label}</span><span class="t-h">${hint}</span></span>
      <span class="sw${st[k] ? ' on' : ''}"><i></i></span>
    </button>`;
  return `<main class="screen fixed">
    ${topBar('Ajustes')}
    <div class="scroll" style="gap:12px">
      <h2 class="overline sm sec">Temporizador</h2>
      <div class="card divided">
        ${row('fullColor', 'Pantalla a color', 'El fondo cambia de color con cada fase')}
        ${row('keepAwake', 'Mantener pantalla encendida', 'Mientras el temporizador está abierto')}
      </div>
      <div class="swatches"><span style="background:${HEX.prep}">Prepárate</span><span style="background:${HEX.work}">Trabajo</span><span style="background:${HEX.rest}">Descanso</span></div>
      <h2 class="overline sm sec" style="padding-top:8px">Privacidad</h2>
      <div class="card info">
        <b>Funciona 100 % sin conexión</b>
        <p>Tempo no se conecta a nada: el propio navegador le tiene prohibido abrir conexiones. Tus entrenos y tu historial solo se guardan en este dispositivo. La voz usa únicamente las voces instaladas en el teléfono.</p>
      </div>
      <h2 class="overline sm sec" style="padding-top:8px">Consejos</h2>
      <div class="card info">
        <b>Tempo 1.1 · versión web</b>
        <p>Si el iPhone está en modo silencio, los pitidos pueden no sonar: desactívalo durante el entreno. Si bloqueas el teléfono o cambias de app, el tiempo sigue contando, pero los avisos se pausan hasta que vuelvas.</p>
      </div>
    </div>
  </main>`;
}

function dialogHTML() {
  const d = S.dialog;
  if (!d) return '';
  if (d.kind === 'name') {
    return `<div class="overlay" data-act="closeDialog"><div class="dialog" data-act="noop" role="dialog" aria-modal="true">
      <h2>Guardar entreno</h2>
      <input id="nameInput" type="text" maxlength="40" placeholder="Nombre del entreno" value="${esc(d.initial || '')}" autocomplete="off" enterkeyhint="done">
      <div class="dlg-actions"><button class="cancel" data-act="closeDialog">Cancelar</button><button class="ok" data-act="saveName">Guardar</button></div>
    </div></div>`;
  }
  return `<div class="overlay" data-act="closeDialog"><div class="dialog" data-act="noop" role="alertdialog" aria-modal="true">
    <h2>${esc(d.title)}</h2><p>${esc(d.text)}</p>
    <div class="dlg-actions"><button class="cancel" data-act="closeDialog">${esc(d.cancel || 'Cancelar')}</button><button class="ok" data-act="confirmDialog">${esc(d.ok)}</button></div>
  </div></div>`;
}

const VIEWS = { home: viewHome, setup: viewSetup, alerts: viewAlerts, timer: viewTimer, done: viewDone, history: viewHistory, settings: viewSettings };

/* ======================= Render y navegación ======================= */

const app = document.getElementById('app');

function render(fresh) {
  const sc = app.querySelector('.scroll');
  const keepScroll = !fresh && sc ? sc.scrollTop : 0;
  const keepY = fresh ? 0 : window.scrollY;
  app.innerHTML = VIEWS[S.screen]() + dialogHTML();
  const sc2 = app.querySelector('.scroll');
  if (sc2) sc2.scrollTop = keepScroll;
  window.scrollTo(0, keepY);
  let bg = 'var(--bg)';
  if (S.screen === 'timer' && S.settings.fullColor && S.phases[S.idx]) bg = HEX[S.phases[S.idx].type];
  document.body.style.backgroundColor = bg;
  document.documentElement.style.backgroundColor = bg;
  if (S.screen === 'timer') {
    bindTimer();
    tickUI();
  } else {
    R = {};
  }
  const input = document.getElementById('nameInput');
  if (input) {
    input.focus();
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') ACT.saveName();
    });
  }
}

function go(screen) {
  S.screen = screen;
  S.dialog = null;
  render(true);
  Wake.update();
}

function back() {
  if (S.screen === 'alerts') go('setup');
  else if (S.screen === 'timer') { if (!S.locked) ACT.askStop(); }
  else if (S.screen !== 'home') go('home');
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

function setAlerts(patch) {
  S.cfg = Object.assign({}, S.cfg, { alerts: Object.assign({}, S.cfg.alerts, patch) });
  render();
}

let testTimers = [];
function testAlerts() {
  testTimers.forEach(clearTimeout);
  testTimers = [];
  Sound.unlock();
  const a = S.cfg.alerts;
  const later = (ms, fn) => testTimers.push(setTimeout(fn, ms));
  let at = 0;
  if (a.half) {
    Sound.tone(1100, 100, a.tone);
    Sound.tone(1100, 100, a.tone, 160);
    at = 900;
  }
  for (let s = a.count; s >= 1; s--) {
    later(at, () => {
      S.testPlaying = s;
      if (S.screen === 'alerts') render();
      if (a.voice && Sound.voice) Sound.say(SPOKEN[s] || String(s));
      else Sound.tone(880, 120, a.tone);
    });
    at += 1000;
  }
  later(at, () => {
    S.testPlaying = 0;
    if (S.screen === 'alerts') render();
    if (a.phase) Sound.tone(1320, 550, a.tone);
    if (a.voice) Sound.say('Trabajo');
    if (a.vibrate) Sound.vibrate([200, 80, 200]);
  });
  later(at + 700, () => {
    S.testPlaying = null;
    if (S.screen === 'alerts') render();
  });
}

function savePreset(title) {
  const name = (title || '').trim().slice(0, 40) || MODES[S.mode].title;
  const existing = S.presetId && findPreset(S.presetId);
  if (existing) {
    S.presets = S.presets.map((p) => (p.id === existing.id ? { id: p.id, title: name, mode: S.mode, cfg: S.cfg } : p));
  } else {
    const p = { id: uid(), title: name, mode: S.mode, cfg: S.cfg };
    S.presetId = p.id;
    S.presets = [p].concat(S.presets);
  }
  S.presetTitle = name;
  LS.set('presets', S.presets);
  S.dialog = null;
  render();
  toast('Guardado en Mis entrenos');
}

/* ======================= Acciones ======================= */

const ACT = {
  noop() {},
  go(s) { go(s); },
  back() { back(); },
  home() { S.running = false; go('home'); },
  pickMode(m) {
    S.mode = m;
    const last = LS.get('last', {});
    S.cfg = last && last[m] ? normConfig(last[m], m) : defaultConfig(m);
    S.presetId = null;
    S.presetTitle = null;
    go('setup');
  },
  openPreset(id) {
    const p = findPreset(id);
    if (!p) return;
    S.mode = p.mode;
    S.cfg = normConfig(p.cfg, p.mode);
    S.presetId = p.id;
    S.presetTitle = p.title;
    go('setup');
  },
  playPreset(id) {
    const p = findPreset(id);
    if (!p) return;
    S.mode = p.mode;
    S.cfg = normConfig(p.cfg, p.mode);
    S.presetId = p.id;
    S.presetTitle = p.title;
    start();
  },
  toggleShowAll() { S.showAll = !S.showAll; render(); },
  askDelete(id) {
    const p = findPreset(id);
    if (!p) return;
    S.dialog = { kind: 'confirm', title: '¿Borrar entreno?', text: `«${p.title}» se eliminará de Mis entrenos.`, ok: 'Borrar', act: 'deletePreset', arg: id };
    render();
  },
  deletePreset(id) {
    S.presets = S.presets.filter((p) => p.id !== id);
    LS.set('presets', S.presets);
    if (S.presetId === id) { S.presetId = null; S.presetTitle = null; }
    render();
  },
  step(arg) {
    const [k, dir] = arg.split(':');
    const f = FIELDS[k];
    if (!f || (k === 'setRest' && S.cfg.sets < 2)) return;
    const v = S.cfg[k];
    const nv = Math.min(f.max, Math.max(f.min, dir === '+' ? v + stepUp(k, v) : v - stepDown(k, v)));
    if (nv === v) return;
    S.cfg = Object.assign({}, S.cfg, { [k]: nv });
    render();
  },
  alertCount(arg) {
    const dir = arg.split(':')[1];
    const v = S.cfg.alerts.count;
    const nv = Math.min(10, Math.max(0, v + (dir === '+' ? 1 : -1)));
    if (nv !== v) setAlerts({ count: nv });
  },
  setWhen(v) { setAlerts({ when: v }); },
  setTone(v) { setAlerts({ tone: v }); Sound.unlock(); Sound.tone(880, 140, v); },
  toggleAlert(k) { setAlerts({ [k]: !S.cfg.alerts[k] }); },
  testAlerts() { testAlerts(); },
  askSave() { S.dialog = { kind: 'name', initial: S.presetTitle || '' }; render(); },
  saveName() {
    const input = document.getElementById('nameInput');
    savePreset(input ? input.value : '');
  },
  closeDialog() { S.dialog = null; render(); },
  confirmDialog() {
    const d = S.dialog;
    S.dialog = null;
    if (d && ACT[d.act]) ACT[d.act](d.arg);
    else render();
  },
  start() { start(); },
  toggle() { toggle(); },
  skip() { jump(S.idx + 1); },
  prev() {
    const ph = S.phases[S.idx];
    if (!ph) return;
    const done = ph.dur * 1000 - remainingMs();
    jump(done > 2000 || S.idx === 0 ? S.idx : S.idx - 1);
  },
  sound() { S.soundOn = !S.soundOn; render(); },
  lock() { S.locked = true; render(); },
  unlock() { S.locked = false; render(); },
  askStop() {
    S.dialog = { kind: 'confirm', title: '¿Terminar el entreno?', text: 'Volverás a la configuración y se perderá el progreso de esta sesión.', ok: 'Terminar', cancel: 'Seguir', act: 'stop' };
    render();
  },
  stop() { S.running = false; go('setup'); },
  setting(k) {
    S.settings = Object.assign({}, S.settings, { [k]: !S.settings[k] });
    LS.set('settings', S.settings);
    render();
    Wake.update();
  },
  askClearHistory() {
    S.dialog = { kind: 'confirm', title: '¿Borrar historial?', text: 'Se eliminarán todos los entrenos completados. Tus entrenos guardados no se tocan.', ok: 'Borrar', act: 'clearHistory' };
    render();
  },
  clearHistory() { S.history = []; LS.set('history', []); render(); },
};

/* ======================= Eventos ======================= */

let repDelay = null;
let repTimer = null;
let longTimer = null;
let longFired = false;

function stopPress() {
  clearTimeout(repDelay);
  clearInterval(repTimer);
  clearTimeout(longTimer);
  repDelay = repTimer = longTimer = null;
}

app.addEventListener('pointerdown', (e) => {
  longFired = false;
  const rep = e.target.closest('[data-rep]');
  if (rep && !rep.disabled) {
    const act = rep.dataset.act;
    const arg = rep.dataset.arg;
    Sound.unlock();
    ACT[act](arg);
    repDelay = setTimeout(() => {
      repTimer = setInterval(() => ACT[act](arg), 85);
    }, 420);
    return;
  }
  const lg = e.target.closest('[data-long]');
  if (lg) {
    const act = lg.dataset.long;
    const arg = lg.dataset.arg;
    longTimer = setTimeout(() => {
      longFired = true;
      if (navigator.vibrate) navigator.vibrate(30);
      ACT[act](arg);
    }, 550);
  }
});
window.addEventListener('pointerup', stopPress);
window.addEventListener('pointercancel', stopPress);
app.addEventListener('scroll', stopPress, true);
app.addEventListener('contextmenu', (e) => e.preventDefault());

app.addEventListener('click', (e) => {
  Sound.unlock();
  if (longFired) {
    longFired = false;
    return;
  }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (el.hasAttribute('data-rep') && e.detail !== 0) return; // ya gestionado al pulsar
  const fn = ACT[el.dataset.act];
  if (fn) fn(el.dataset.arg);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (S.dialog) ACT.closeDialog();
    else back();
  }
});

document.addEventListener('visibilitychange', () => {
  Wake.update();
  if (document.visibilityState === 'visible' && S.screen === 'timer') {
    engineTick();
    if (S.screen === 'timer') render();
  }
});

window.addEventListener('resize', () => {
  if (S.screen === 'timer') bindTimer();
});

setInterval(() => {
  engineTick();
  tickUI();
}, 50);

/* ======================= Arranque ======================= */

render(true);

// Guarda la app en el dispositivo para que funcione sin conexión (requiere https o el propio PC).
if ('serviceWorker' in navigator && window.isSecureContext) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  // Cuando llega una versión nueva, recarga sola (nunca en mitad de un entreno).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    const reload = () => {
      if (reloaded) return;
      if (S.screen === 'timer') { setTimeout(reload, 5000); return; }
      reloaded = true;
      location.reload();
    };
    reload();
  });
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
