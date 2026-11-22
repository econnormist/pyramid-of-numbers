(() => {
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const pick = a => a[Math.floor(Math.random() * a.length)];
const pad = (n, w) => String(n).padStart(w, '0');
const fmtTime = s => { s = Math.max(0, s); const m = Math.floor(s / 60); return pad(m, 2) + ':' + pad(Math.floor(s % 60), 2); };
const fmtSecs = s => s < 60 ? s.toFixed(1) + 's' : fmtTime(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const tablesText = t => (t || []).length === 11 ? 'ALL' : (t || []).join(',');
const opsText = o => o === 'mul' ? '×' : o === 'div' ? '÷' : '×÷';

// Hieroglyphs for the card backs: eye of Horus, ankh, scarab, lion, owl, eye, djed, sun, cobra, falcon, fish, water, mouth, reed, bread
const GLYPHS = [0x13080, 0x132F9, 0x131A3, 0x130ED, 0x13153, 0x13079, 0x132BD, 0x131F3, 0x13193, 0x13143, 0x1319B, 0x13216, 0x1308B, 0x131CB, 0x133CF].map(c => String.fromCodePoint(c));

/* ---------------- settings ---------------- */
const settings = Object.assign(
  { name: '', tables: [2, 3, 4, 5, 10], ops: 'mul', levels: 5, timerOn: false, timer: 10, muted: false },
  LS.get('pyramid-settings', {})
);
const saveSettings = () => LS.set('pyramid-settings', settings);

/* ---------------- sound ---------------- */
const audio = {
  ctx: null,
  tone(freq, dur, type = 'square', when = 0, vol = 0.05) {
    if (settings.muted) return;
    try {
      this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      const t = this.ctx.currentTime + when;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch {}
  },
  flip() { this.tone(660, 0.08); this.tone(990, 0.06, 'square', 0.05); },
  key() { this.tone(520, 0.03, 'square', 0, 0.025); },
  right() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.12, 'square', i * 0.07)); },
  wrong() { [330, 247, 175, 131].forEach((f, i) => this.tone(f, 0.22, 'sawtooth', i * 0.14, 0.04)); },
  win() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.16, 'square', i * 0.11)); }
};

/* ---------------- records store ---------------- */
// Uses the artifact's shared database when available, else this browser's storage.
const store = {
  mode: 'local', db: null, loading: false,
  runs: LS.get('pyramid-runs', []),
  async init() {
    try {
      if (!window.claude || typeof window.claude.use !== 'function') return this.emit();
      this.loading = true; this.emit();
      const db = await window.claude.use('db');
      if (!db) { this.loading = false; return this.emit(); }
      this.db = db; this.mode = 'db';
      const timer = setTimeout(() => { this.slow = true; this.emit(); }, 10000);
      db.collection('runs').orderBy('at', 'desc').limit(1000).onSnapshot(snap => {
        if (!snap.metadata.fromCache) { clearTimeout(timer); this.slow = false; }
        this.loading = false;
        this.runs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        this.emit();
      }, err => {
        clearTimeout(timer); console.warn('records unavailable', err);
        this.mode = 'local'; this.db = null; this.loading = false;
        this.runs = LS.get('pyramid-runs', []); this.emit();
      });
    } catch (e) { this.loading = false; this.emit(); }
  },
  async add(run) {
    if (this.db) {
      try { await this.db.collection('runs').add(run); return 'shared'; }
      catch (e) { console.warn('shared save failed', e); }
    }
    const local = LS.get('pyramid-runs', []);
    local.unshift(run); LS.set('pyramid-runs', local.slice(0, 500));
    this.runs = [run, ...this.runs];
    this.emit();
    return 'local';
  },
  emit() {
    renderHall(); renderNameChips();
    if (!$('#screen-records').hidden) renderRecords();
  }
};

/* ---------------- screens ---------------- */
function show(name) {
  ['setup', 'game', 'records'].forEach(n => { $('#screen-' + n).hidden = n !== name; });
  window.scrollTo(0, 0);
}

/* ---------------- setup UI ---------------- */
function buildSetup() {
  const tWrap = $('#tables');
  for (let n = 2; n <= 12; n++) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tbl'; b.textContent = n; b.dataset.n = n; b.id = 'tbl-' + n;
    b.setAttribute('aria-label', n + ' times table');
    b.addEventListener('click', () => {
      const i = settings.tables.indexOf(n);
      i >= 0 ? settings.tables.splice(i, 1) : settings.tables.push(n);
      settings.tables.sort((a, b) => a - b); syncSetup();
    });
    tWrap.appendChild(b);
  }
  $('#tables-all').onclick = () => { settings.tables = [2,3,4,5,6,7,8,9,10,11,12]; syncSetup(); };
  $('#tables-none').onclick = () => { settings.tables = []; syncSetup(); };
  $$('#ops button').forEach(b => b.onclick = () => { settings.ops = b.dataset.op; syncSetup(); });
  $('#lv-down').onclick = () => { settings.levels = Math.max(3, settings.levels - 1); syncSetup(); };
  $('#lv-up').onclick = () => { settings.levels = Math.min(8, settings.levels + 1); syncSetup(); };
  $('#timer-off').onclick = () => { settings.timerOn = false; syncSetup(); };
  $('#timer-on').onclick = () => { settings.timerOn = true; syncSetup(); };
  $('#timer-range').oninput = e => { settings.timer = +e.target.value; settings.timerOn = true; syncSetup(); };
  $('#player-name').value = settings.name;
  $('#player-name').oninput = e => { settings.name = e.target.value; $('#setup-err').textContent = ''; saveSettings(); };
  $('#mute-btn').onclick = () => { settings.muted = !settings.muted; syncSetup(); };
  $('#setup-form').addEventListener('submit', e => { e.preventDefault(); tryStart(); });
  $('#to-records').onclick = () => { recSel = null; show('records'); renderRecords(); };
  syncSetup();
}
function syncSetup() {
  $$('.tbl').forEach(b => b.setAttribute('aria-pressed', settings.tables.includes(+b.dataset.n)));
  $$('#ops button').forEach(b => b.setAttribute('aria-pressed', settings.ops === b.dataset.op));
  $('#lv-out').textContent = settings.levels;
  $('#lv-down').disabled = settings.levels <= 3; $('#lv-up').disabled = settings.levels >= 8;
  let mp = '';
  for (let r = 1; r <= settings.levels; r++) mp += '<div>' + '<i></i>'.repeat(r) + '</div>';
  $('#mini-pyr').innerHTML = mp;
  $('#timer-off').setAttribute('aria-pressed', !settings.timerOn);
  $('#timer-on').setAttribute('aria-pressed', settings.timerOn);
  $('#timer-range').value = settings.timer;
  $('#timer-range').style.opacity = settings.timerOn ? 1 : 0.4;
  $('#timer-out').textContent = settings.timerOn ? settings.timer + ' SEC' : 'NO LIMIT';
  $('#mute-btn').textContent = 'SOUND: ' + (settings.muted ? 'OFF' : 'ON');
  $('#mute-btn').setAttribute('aria-pressed', settings.muted);
  saveSettings();
}
function renderNameChips() {
  const names = playerNames().slice(0, 6);
  $('#name-chips').innerHTML = names.map(n => `<button type="button" class="chip" data-n="${esc(n)}">${esc(n)}</button>`).join('');
  $$('#name-chips .chip').forEach(c => c.onclick = () => { settings.name = c.dataset.n; $('#player-name').value = c.dataset.n; $('#setup-err').textContent = ''; saveSettings(); });
}
function playerNames() {
  const seen = new Map();
  [...store.runs].sort((a, b) => b.at - a.at).forEach(r => { if (!seen.has(r.name)) seen.set(r.name, r.at); });
  return [...seen.keys()];
}
function renderHall() {
  const top = [...store.runs].sort((a, b) => b.score - a.score).slice(0, 7);
  const rk = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH'];
  $('#hall-list').innerHTML = top.length
    ? top.map((r, i) => `<li><span class="rk">${rk[i]}</span><span class="nm">${esc(r.name)} <span class="sub">${r.levels} lv · ${opsText(r.ops)}</span></span><span class="sc">${pad(r.score, 5)}</span></li>`).join('')
    : `<li class="empty">${store.loading ? 'Opening the tomb…' : 'No climbs yet. Be the first pharaoh on the wall.'}</li>`;
  $('#store-note').textContent = store.mode === 'db'
    ? (store.slow ? 'Records can’t be reached right now. Scores may be out of date.' : 'Scores are saved for everyone who opens this game.')
    : 'Scores are saved in this browser only.';
}
function tryStart() {
  const name = (settings.name || '').trim();
  if (!name) { $('#setup-err').textContent = 'Type your name to start.'; $('#player-name').focus(); return; }
  if (!settings.tables.length) { $('#setup-err').textContent = 'Pick at least one times table.'; return; }
  $('#setup-err').textContent = '';
  audio.flip();
  startGame();
}

/* ---------------- game ---------------- */
let G = null;
function startGame() {
  G = {
    name: settings.name.trim().toUpperCase(), tables: [...settings.tables], ops: settings.ops,
    levels: settings.levels, timer: settings.timerOn ? settings.timer : 0,
    score: 0, correct: 0, wrong: 0, row: 0, phase: 'pick', input: '',
    start: performance.now(), qStart: 0, active: null, deal: null
  };
  deal();
  show('game');
  renderPyramid(); renderConsole(); updateHud();
  setMsg('Pick a stone on level 1.');
  resetQuit();
  requestAnimationFrame(tick);
}
function makeQuestion(used) {
  let q;
  for (let tries = 0; tries < 40; tries++) {
    const a = pick(G.tables), b = 1 + Math.floor(Math.random() * 12);
    const op = G.ops === 'mix' ? (Math.random() < 0.5 ? 'mul' : 'div') : G.ops;
    if (op === 'mul') q = Math.random() < 0.5 ? { text: `${a} × ${b}`, ans: a * b } : { text: `${b} × ${a}`, ans: a * b };
    else q = { text: `${a * b} ÷ ${a}`, ans: b };
    if (!used.has(q.text)) break;
  }
  used.add(q.text);
  return q;
}
function deal() {
  const used = new Set();
  G.deal = [];
  for (let r = 0; r < G.levels; r++) {
    const width = G.levels - r;   // widest row at the base, one capstone on top
    G.deal.push(Array.from({ length: width }, () => ({ q: makeQuestion(used), glyph: pick(GLYPHS), state: 'down' })));
  }
  G.row = 0; G.active = null;
}
const cur = () => G.deal[G.active.r][G.active.i];

function renderPyramid() {
  const el = $('#pyramid');
  el.style.setProperty('--cols', G.levels);
  el.innerHTML = '';
  for (let r = G.levels - 1; r >= 0; r--) {
    const row = document.createElement('div');
    row.className = 'row'; row.dataset.row = r; row.dataset.label = 'L' + (r + 1);
    G.deal[r].forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'card'; b.dataset.r = r; b.dataset.i = i;
      b.style.setProperty('--dx', (Math.random() * 120 - 60).toFixed(0) + 'px');
      b.style.setProperty('--dy', (Math.random() * 60 - 30).toFixed(0) + 'px');
      b.style.setProperty('--rot', (Math.random() * 50 - 25).toFixed(0) + 'deg');
      b.innerHTML = `<span class="card-inner"><span class="face back"><span class="glyph" aria-hidden="true">${c.glyph}</span></span><span class="face front"><span class="res"></span></span></span>`;
      b.addEventListener('click', () => pickCard(r, i));
      row.appendChild(b);
    });
    el.appendChild(row);
  }
  updatePyramid();
  sizeCards();
}
// Pick the largest card size that fits the stage both across (widest row) and down (all levels).
function sizeCards() {
  if (!G || $('#screen-game').hidden) return;
  const stage = $('.stage'), n = G.levels;
  const W = stage.clientWidth - 64;
  const H = stage.clientHeight - $('#msg').offsetHeight - 10 - 12;
  const byW = (W - (n - 1) * 8) / n;              // widest a card can be
  const rowH = (H - (n - 1) * 8) / n;             // tallest a card can be
  const h = Math.max(30, Math.floor(Math.min(128, rowH, byW / 0.75)));
  const w = Math.max(26, Math.floor(Math.min(96, byW, h)));   // 3:4 when roomy, up to square when height is tight
  const el = $('#pyramid');
  el.style.setProperty('--card', w + 'px');
  el.style.setProperty('--card-h', Math.min(h, Math.round(w / 0.75)) + 'px');
}
if ('ResizeObserver' in window) new ResizeObserver(() => sizeCards()).observe($('.stage'));
else window.addEventListener('resize', sizeCards);
function updatePyramid() {
  $$('#pyramid .row').forEach(row => row.classList.toggle('active', +row.dataset.row === G.row && G.phase !== 'done'));
  $$('#pyramid .card').forEach(b => {
    const r = +b.dataset.r, i = +b.dataset.i, c = G.deal[r][i];
    const playable = G.phase === 'pick' && r === G.row;
    b.classList.toggle('flipped', c.state !== 'down');
    b.classList.toggle('open', c.state === 'open');
    b.classList.toggle('right', c.state === 'right');
    b.classList.toggle('wrong', c.state === 'wrong');
    b.classList.toggle('playable', playable);
    b.classList.toggle('passed', r < G.row && c.state === 'down');
    b.classList.toggle('dim', r > G.row && c.state === 'down');
    b.disabled = !playable;
    b.querySelector('.res').textContent = c.state === 'open' ? '?' : (c.state === 'right' || c.state === 'wrong') ? c.q.ans : '';
    b.setAttribute('aria-label', c.state === 'right' ? `Level ${r + 1}: ${c.q.text} = ${c.q.ans}, correct`
      : c.state === 'wrong' ? `Level ${r + 1}: answer was ${c.q.ans}`
      : playable ? `Level ${r + 1}, stone ${i + 1}: flip` : `Level ${r + 1} stone`);
  });
}
function pickCard(r, i) {
  if (!G || G.phase !== 'pick' || r !== G.row) return;
  audio.flip();
  G.active = { r, i }; G.deal[r][i].state = 'open';
  G.phase = 'answer'; G.input = ''; G.qStart = performance.now();
  updatePyramid(); renderConsole();
  setMsg(`Level ${r + 1}: what's the answer?`);
}
function renderConsole(result) {
  const q = $('#q'), ans = $('#ans');
  const answering = G.phase === 'answer';
  if (G.active && (answering || G.phase === 'feedback')) {
    const c = cur();
    q.className = 'q'; q.textContent = c.q.text + ' =';
    ans.textContent = result === 'wrong' ? c.q.ans : G.input;
    ans.style.color = result === 'wrong' ? 'var(--carnelian)' : result === 'right' ? 'var(--turq)' : '';
  } else {
    q.className = 'q idle';
    q.textContent = G.phase === 'shuffle' ? 'THE SANDS ARE SHIFTING…' : 'CHOOSE A GLOWING STONE';
    ans.textContent = ''; ans.style.color = '';
  }
  ans.classList.toggle('caret', answering);
  $$('#keypad button').forEach(b => b.disabled = !answering);
  const showT = !!G.timer && answering;
  $('#tbar').hidden = !showT; $('#tlabel').hidden = !showT;
}
function press(k) {
  if (!G || G.phase !== 'answer') return;
  if (k === 'go') return submit();
  if (k === 'del') G.input = G.input.slice(0, -1);
  else if (G.input.length < 3) G.input = (G.input === '0' ? '' : G.input) + k;
  audio.key();
  renderConsole();
}
function submit() {
  if (G.phase !== 'answer' || G.input === '') return;
  +G.input === cur().q.ans ? onRight() : onWrong(false);
}
function onRight() {
  const game = G, c = cur();
  const t = (performance.now() - G.qStart) / 1000;
  const speed = G.timer ? 1 - t / G.timer : 1 - (t - 2) / 10;
  const bonus = Math.round(50 * Math.max(0, Math.min(1, speed)));
  const pts = 100 + bonus;
  G.score += pts; G.correct++; c.state = 'right'; G.phase = 'feedback';
  audio.right();
  updatePyramid(); renderConsole('right'); updateHud();
  floatText('+' + pts);
  setMsg(G.row + 1 === G.levels ? 'The capstone is yours!' : pick(['Correct! Climb higher.', 'Right! Up you go.', 'The gods approve! Next level.', 'Correct! Keep climbing.']), 'good');
  setTimeout(() => {
    if (G !== game) return;
    G.row++; G.active = null;
    if (G.row >= G.levels) return finish();
    G.phase = 'pick';
    updatePyramid(); renderConsole();
    setMsg(`Pick a stone on level ${G.row + 1}.`);
  }, 950);
}
function onWrong(timeout) {
  const game = G, c = cur();
  G.wrong++; G.score = Math.max(0, G.score - 50); c.state = 'wrong'; G.phase = 'feedback';
  audio.wrong();
  updatePyramid(); renderConsole('wrong'); updateHud();
  floatText('−50', true);
  setMsg((timeout ? 'Time ran out! ' : 'Not quite. ') + `${c.q.text} = ${c.q.ans}. Back to the base!`, 'bad');
  setTimeout(() => { if (G === game) shuffleReset(); }, 2200);
}
function shuffleReset() {
  const game = G;
  G.phase = 'shuffle'; G.active = null;
  G.deal.flat().forEach(c => c.state = 'down');
  updatePyramid(); renderConsole();
  const el = $('#pyramid');
  setTimeout(() => {
    if (G !== game) return;
    el.classList.add('shuffling');
    setTimeout(() => {
      if (G !== game) return;
      el.classList.remove('shuffling');
      deal(); G.phase = 'pick';
      renderPyramid(); renderConsole();
      setMsg('New stones! Pick one on level 1.');
    }, 900);
  }, 450);
}
function setMsg(t, kind) { const m = $('#msg'); m.textContent = t; m.className = 'msg' + (kind ? ' ' + kind : ''); }
function floatText(t, bad) {
  const ans = $('#ans'); const rect = ans.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = 'float'; f.textContent = t;
  f.style.position = 'fixed'; f.style.left = (rect.right + 8) + 'px'; f.style.top = rect.top + 'px';
  if (bad) f.style.color = 'var(--carnelian)';
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1000);
}
function updateHud() {
  $('#hud-name').textContent = G.name;
  $('#hud-score').textContent = pad(G.score, 6);
  $('#hud-level').textContent = Math.min(G.row + 1, G.levels) + '/' + G.levels;
  $('#hud-resets').textContent = G.wrong;
}
function tick() {
  if (!G || G.phase === 'done' || $('#screen-game').hidden) return;
  const now = performance.now();
  $('#hud-time').textContent = fmtTime((now - G.start) / 1000);
  if (G.timer && G.phase === 'answer') {
    const left = G.timer - (now - G.qStart) / 1000;
    const frac = Math.max(0, left / G.timer);
    $('#tbar-fill').style.width = (frac * 100) + '%';
    $('#tbar').classList.toggle('low', frac < 0.3);
    $('#tlabel').textContent = Math.ceil(Math.max(0, left)) + ' SEC';
    if (left <= 0) onWrong(true);
  }
  requestAnimationFrame(tick);
}
async function finish() {
  G.phase = 'done';
  updatePyramid(); renderConsole();
  const seconds = Math.round((performance.now() - G.start) / 100) / 10;
  const prev = store.runs.filter(r => r.name === G.name);
  const prevBest = prev.length ? Math.max(...prev.map(r => r.score)) : null;
  const same = prev.filter(r => r.levels === G.levels);
  const prevFast = same.length ? Math.min(...same.map(r => r.seconds)) : null;
  const run = {
    name: G.name, at: Date.now(), score: G.score, seconds, correct: G.correct, wrong: G.wrong,
    levels: G.levels, tables: G.tables, ops: G.ops, timer: G.timer, completed: true
  };
  audio.win();
  setMsg('You reached the capstone!', 'good');
  const badges = [];
  if (prevBest === null) badges.push('FIRST CLIMB!');
  else {
    if (G.score > prevBest) badges.push('NEW BEST SCORE!');
    if (prevFast !== null && seconds < prevFast) badges.push(`FASTEST ${G.levels}-LEVEL CLIMB!`);
  }
  if (G.wrong === 0) badges.push('PERFECT CLIMB');
  $('#win-badges').innerHTML = badges.map(b => `<span class="badge">${b}</span>`).join('');
  const acc = Math.round(100 * G.correct / (G.correct + G.wrong));
  $('#win-stats').innerHTML = [
    ['SCORE', pad(G.score, 6)], ['TIME', fmtSecs(seconds)],
    ['RIGHT ANSWERS', G.correct], ['RESETS', G.wrong],
    ['ACCURACY', acc + '%'], ['PREVIOUS BEST', prevBest === null ? '—' : pad(prevBest, 6)]
  ].map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join('');
  $('#win-title').textContent = `${G.name} REACHED THE CAPSTONE!`;
  $('#win-save').textContent = 'Saving your climb…';
  $('#finish').hidden = false;
  $('#again-btn').focus();
  const where = await store.add(run);
  $('#win-save').textContent = where === 'shared' ? 'Climb saved to the Hall of Records.' : 'Climb saved in this browser.';
}
function resetQuit() {
  $('#quit-box').innerHTML = '<button type="button" class="btn small ghost" id="quit-btn">QUIT</button>';
  $('#quit-btn').onclick = () => {
    $('#quit-box').innerHTML = '<span class="label" style="color:var(--muted)">QUIT?</span><button type="button" class="btn small" id="quit-yes">YES</button><button type="button" class="btn small ghost" id="quit-no">NO</button>';
    $('#quit-yes').onclick = () => { G = null; show('setup'); };
    $('#quit-no').onclick = resetQuit;
  };
}

$$('#keypad button').forEach(b => b.addEventListener('click', () => press(b.dataset.k)));
document.addEventListener('keydown', e => {
  if (!G || $('#screen-game').hidden || !$('#finish').hidden) return;
  if (e.target && e.target.tagName === 'INPUT') return;
  if (/^[0-9]$/.test(e.key)) { press(e.key); e.preventDefault(); }
  else if (e.key === 'Backspace') { press('del'); e.preventDefault(); }
  else if (e.key === 'Enter' && G.phase === 'answer') { press('go'); e.preventDefault(); }
});
$('#again-btn').onclick = () => { $('#finish').hidden = true; startGame(); };
$('#win-menu').onclick = () => { $('#finish').hidden = true; G = null; show('setup'); };
$('#win-records').onclick = () => { $('#finish').hidden = true; recSel = G ? G.name : null; G = null; show('records'); renderRecords(); };

/* ---------------- records ---------------- */
let recSel = null;
$('#rec-back').onclick = () => show('setup');
$('#rec-player').onchange = e => { recSel = e.target.value; renderRecords(); };

function renderRecords() {
  const names = playerNames();
  if (recSel === null) {
    const n = (settings.name || '').trim().toUpperCase();
    recSel = names.includes(n) ? n : (names[0] || '__all');
  }
  $('#rec-player').innerHTML = `<option value="__all">ALL PLAYERS</option>` + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  $('#rec-player').value = recSel;
  const all = recSel === '__all';
  const runs = store.runs.filter(r => all || r.name === recSel).sort((a, b) => a.at - b.at);

  if (!runs.length) {
    $('#rec-tiles').innerHTML = '';
    $('#rec-charts').innerHTML = `<div class="empty" style="grid-column:1/-1">${store.loading ? 'Opening the tomb…' : 'No climbs recorded yet. Finish a pyramid and your score and time will appear here.'}</div>`;
    $('#rec-table').innerHTML = '';
    return;
  }
  const best = runs.reduce((a, b) => b.score > a.score ? b : a);
  const fast = runs.reduce((a, b) => b.seconds < a.seconds ? b : a);
  const tc = runs.reduce((s, r) => s + r.correct, 0), tw = runs.reduce((s, r) => s + r.wrong, 0);
  const tiles = [
    ['CLIMBS', runs.length, all ? names.length + ' players' : 'since ' + new Date(runs[0].at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })],
    ['BEST SCORE', pad(best.score, 5), (all ? best.name + ' · ' : '') + fmtDate(best.at)],
    ['FASTEST CLIMB', fmtSecs(fast.seconds), (all ? fast.name + ' · ' : '') + fast.levels + ' levels'],
    ['ACCURACY', Math.round(100 * tc / Math.max(1, tc + tw)) + '%', tc + ' right · ' + tw + ' wrong']
  ];
  $('#rec-tiles').innerHTML = tiles.map(([k, v, s]) => `<div class="tile"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${esc(s)}</span></div>`).join('');

  if (all) {
    $('#rec-charts').innerHTML = `<div class="empty" style="grid-column:1/-1">Pick a player above to see their scores and times climb by climb.</div>`;
  } else {
    $('#rec-charts').innerHTML = `
      <div class="chart" id="ch-score"><h3>SCORE PER CLIMB</h3><p>Higher is better</p></div>
      <div class="chart" id="ch-time"><h3>TIME TO THE CAPSTONE</h3><p>Lower is better · compare climbs with the same number of levels</p></div>`;
    lineChart($('#ch-score'), runs, r => r.score, v => String(Math.round(v)));
    lineChart($('#ch-time'), runs, r => r.seconds, v => fmtSecs(v), true);
  }

  const rows = [...runs].reverse().slice(0, 100);
  $('#rec-table').innerHTML = `<table><thead><tr><th>WHEN</th>${all ? '<th>PLAYER</th>' : ''}<th class="num">SCORE</th><th class="num">TIME</th><th class="num">RESETS</th><th class="num">LEVELS</th><th>TABLES</th><th>SUMS</th><th>TIMER</th></tr></thead><tbody>${
    rows.map(r => `<tr><td>${fmtDate(r.at)}</td>${all ? `<td>${esc(r.name)}</td>` : ''}<td class="num gold">${r.score}</td><td class="num">${fmtSecs(r.seconds)}</td><td class="num">${r.wrong}</td><td class="num">${r.levels}</td><td>${tablesText(r.tables)}</td><td>${opsText(r.ops)}</td><td>${r.timer ? r.timer + 's' : 'off'}</td></tr>`).join('')
  }</tbody></table>`;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
function lineChart(box, runs, get, fmt, lowerBetter) {
  const W = Math.max(280, box.clientWidth || 400), H = 210;
  const m = { l: 52, r: 18, t: 18, b: 30 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const vals = runs.map(get);
  const ymax = niceMax(Math.max(...vals) * 1.1);
  const n = runs.length;
  const x = i => m.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = v => m.t + ih - (v / ymax) * ih;
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const v = ymax * k / 4, yy = y(v);
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}" stroke="var(--grid)" stroke-width="1"/>`;
    g += `<text x="${m.l - 8}" y="${yy + 5}" text-anchor="end">${fmt(v)}</text>`;
  }
  const step = Math.max(1, Math.ceil(n / 8));
  for (let i = 0; i < n; i += step) g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">#${i + 1}</text>`;
  const pts = vals.map((v, i) => [x(i), y(v)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = n > 1 ? `${line} L${pts[n - 1][0]} ${m.t + ih} L${pts[0][0]} ${m.t + ih} Z` : '';
  const last = pts[n - 1];
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${box.querySelector('h3').textContent} for ${n} climbs">
    ${g}
    ${area ? `<path d="${area}" fill="var(--gold)" fill-opacity=".12"/>` : ''}
    ${n > 1 ? `<path d="${line}" fill="none" stroke="var(--gold)" stroke-width="2" stroke-linejoin="round"/>` : ''}
    ${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="var(--gold)" stroke="var(--panel)" stroke-width="2"/>`).join('')}
    <circle cx="${last[0]}" cy="${last[1]}" r="7" fill="var(--turq)" stroke="var(--panel)" stroke-width="2"/>
    <text x="${Math.min(last[0], W - m.r)}" y="${last[1] - 12}" text-anchor="${n > 1 ? 'end' : 'middle'}" style="fill:var(--ink)">${fmt(vals[n - 1])}</text>
    <line class="xh" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" stroke="var(--muted)" stroke-dasharray="3 3" visibility="hidden"/>
    <rect class="hit" x="${m.l - 10}" y="0" width="${iw + 20}" height="${H}" fill="transparent"/>
  </svg>`;
  box.insertAdjacentHTML('beforeend', svg);
  const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; box.appendChild(tip);
  const svgEl = box.querySelector('svg'), xh = svgEl.querySelector('.xh');
  const move = ev => {
    const pt = ev.touches ? ev.touches[0] : ev;
    const rect = svgEl.getBoundingClientRect();
    const sx = (pt.clientX - rect.left) * (W / rect.width);
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(p[0] - sx) < Math.abs(pts[best][0] - sx)) best = i; });
    const r = runs[best], p = pts[best];
    xh.setAttribute('x1', p[0]); xh.setAttribute('x2', p[0]); xh.setAttribute('visibility', 'visible');
    tip.innerHTML = `<b>${fmt(vals[best])}</b><br>Climb #${best + 1} · ${fmtDate(r.at)}<br>${r.levels} levels · ${opsText(r.ops)} · tables ${tablesText(r.tables)}<br>${r.wrong} reset${r.wrong === 1 ? '' : 's'}${r.timer ? ' · ' + r.timer + 's timer' : ''}`;
    tip.hidden = false;
    const scale = rect.width / W;
    const left = Math.min(Math.max(p[0] * scale, 90), rect.width - 90);
    tip.style.left = left + 'px';
    tip.style.top = (svgEl.offsetTop + p[1] * scale - 10) + 'px';
  };
  const hit = svgEl.querySelector('.hit');
  hit.addEventListener('mousemove', move);
  hit.addEventListener('touchstart', move, { passive: true });
  hit.addEventListener('touchmove', move, { passive: true });
  hit.addEventListener('mouseleave', () => { tip.hidden = true; xh.setAttribute('visibility', 'hidden'); });
}
let rz;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (!$('#screen-records').hidden) renderRecords(); }, 150); });

/* ---------------- boot ---------------- */
buildSetup();
renderHall(); renderNameChips();
store.init();
})();
