'use strict';
// اختبار شامل عبر HTTP: دخول، حماية اسم Keep، غرفة، مباراة كاملة من 3 جولات، غش، XP، صدارة.
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');

const PORT = 4100 + Math.floor(Math.random() * 500), BASE = `http://127.0.0.1:${PORT}`;
const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hp-')), 't.db');
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server.js')],
  { env: { ...process.env, PORT, DB_PATH: dbFile, FOUNDER_KEY: 'test-key' }, stdio: 'inherit' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, body, token) {
  const r = await fetch(BASE + '/api/' + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json()) };
}
async function client(name, key) {
  const l = await call('login', { name, key });
  assert.equal(l.status, 200, `${name}: ${l.error}`);
  const c = { name, token: l.token, me: l.me, state: null, events: [], ctl: new AbortController() };
  c.post = (p, b = {}) => call(p, b, c.token);
  (async () => {
    const res = await fetch(`${BASE}/api/stream?t=${c.token}`, { signal: c.ctl.signal });
    let buf = '';
    for await (const chunk of res.body) {
      buf += Buffer.from(chunk).toString();
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = /^event: (.+)$/m.exec(block)?.[1], data = /^data: (.+)$/m.exec(block)?.[1];
        if (!ev) continue;
        const d = JSON.parse(data);
        if (ev === 'state') c.state = d; else if (ev === 'me') c.me = d; else c.events.push([ev, d]);
        c.onEvent?.(ev, d);
      }
    }
  })().catch(() => {});
  return c;
}
const until = async (fn, ms = 20000, what = '') => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout: ' + what); await sleep(40); } };

(async () => {
  await sleep(700);
  // --- الأسماء ---
  for (const bad of ['', 'ab', 'Keep', 'keep', 'K33P', 'Ke_ep', 'Keeep', 'admin1', 'المؤسس', 'a b c', 'كيب'])
    assert.ok(!(await call('login', { name: bad })).token, 'يجب رفض: ' + bad);
  assert.equal((await call('login', { name: 'Keep', key: 'wrong' })).status, 403);

  const keep = await client('Keep', 'test-key');
  assert.ok(keep.me.founder && keep.me.level === 200);
  const fahad = await client('Fahad'), saad = await client('Saad'), cheat = await client('Cheater');
  await until(() => fahad.state === null && saad.me && cheat.me, 3000, 'streams');
  assert.equal((await call('login', { name: 'fahad' })).status, 409, 'الاسم المتصل لا يتكرر');

  // --- الغرفة ---
  const { code } = await fahad.post('room/create');
  assert.match(code, /^[A-Z0-9]{5}$/);
  assert.equal((await fahad.post('room/act', { type: 'start' })).status, 409, 'لا تبدأ بلاعب واحد');
  for (const c of [saad, cheat, keep]) assert.equal((await c.post('room/join', { code })).status, 200);
  await until(() => fahad.state?.players.length === 4, 3000, 'join');
  assert.equal((await saad.post('room/act', { type: 'start' })).status, 403, 'غير المضيف لا يبدأ');
  assert.equal((await fahad.post('room/act', { type: 'kick', target: keep.me.id })).status, 403, 'لا يمكن طرد المؤسس');
  assert.equal((await fahad.post('room/act', { type: 'ban', target: saad.me.id })).status, 200);
  await until(() => saad.state === null && fahad.state.players.length === 3, 3000, 'ban');
  assert.equal((await saad.post('room/join', { code })).status, 403, 'الممنوع لا يدخل');
  assert.equal((await fahad.post('room/act', { type: 'rounds', value: 3 })).status, 200);
  assert.equal((await fahad.post('room/act', { type: 'start' })).status, 200);

  // --- اللعب: بوتات بسيطة لكل تحدٍّ ---
  const players = [fahad, cheat, keep], seen = [];
  const bots = {
    tap: (c, cfg, s) => { const iv = setInterval(() => c.post('play', { n: c === cheat ? 40 : c === fahad ? 2 : 1 }), 200); return () => clearInterval(iv); },
    reaction: (c) => { c.onEvent = (ev) => { if (ev === 'go') setTimeout(() => c.post('play', {}), c === fahad ? 150 : 260); }; if (c === cheat) c.post('play', {}); return () => { c.onEvent = null; }; },
    color: (c, cfg) => { let i = 0; const iv = setInterval(() => { const q = cfg.seq[i]; c.post('play', { i, c: c === cheat ? 'none' : q.target }); i++; }, c === fahad ? 300 : 500); return () => clearInterval(iv); },
    dontpress: (c) => { c.onEvent = (ev, d) => { if (ev === 'sig' && (!d.bad || c === cheat)) setTimeout(() => c.post('play', { i: d.i }), 200); }; return () => { c.onEvent = null; }; },
    bomb: (c) => { c.post('play', { c: 0 }).then(() => c === fahad && c.post('play', { c: 1 })); return () => {}; },
    target: (c) => { const iv = setInterval(() => c.post('play', {}), c === cheat ? 20 : c === fahad ? 300 : 600); return () => clearInterval(iv); },
  };
  for (let round = 1; round <= 3; round++) {
    await until(() => fahad.state?.phase === 'active' && fahad.state.round === round, 15000, 'active ' + round);
    const ch = fahad.state.challenge; seen.push(ch.id);
    assert.ok(ch.duration >= 5000 && ch.duration <= 15000, 'مدة الجولة 5–15 ثانية');
    const stops = players.map((c) => bots[ch.id](c, ch.cfg));
    await until(() => fahad.state?.phase === 'results' && fahad.state.round === round, 20000, 'results ' + round);
    stops.forEach((s) => s());
    const rows = fahad.state.results.rows;
    console.log(`جولة ${round} [${ch.id}]`, rows.map((r) => `${r.name}:${r.label}→+${r.points}`).join(' | '));
    if (ch.id === 'tap') {
      const ch8 = rows.find((r) => r.name === 'Cheater');
      assert.ok(ch8.flagged && ch8.points === 0, 'نتيجة الغشاش مرفوضة');
      assert.equal(rows[0].name, 'Fahad');
      assert.ok(rows[0].raw <= 123, 'سقف الضغطات');
    }
  }
  assert.equal(seen[0], 'tap');
  await until(() => fahad.state?.phase === 'final', 10000, 'final');
  const fin = fahad.state.final;
  console.log('النهائي', fin.map((r) => `${r.place}.${r.name} ${r.total}pts +${r.xp}XP`).join(' | '));
  assert.equal(fin.length, 3);
  assert.ok(fin.every((r) => r.xp > 0));
  await until(() => fahad.me.games === 1, 2000, 'me update');
  assert.equal(keep.me.level, 200);

  // --- الصدارة والملف وأدوات المؤسس ---
  const lbr = await call('leaderboard?range=day', null, fahad.token);
  assert.equal(lbr.rows.length, 3); assert.ok(lbr.rows[0].points >= lbr.rows[1].points);
  const pf = await call('profile?name=Fahad', null, fahad.token);
  assert.equal(pf.profile.games, 1); assert.ok(pf.profile.rank >= 1);
  assert.equal((await fahad.post('founder', { type: 'level', target: fahad.me.id, value: 200 })).status, 403, 'أدوات المؤسس لـ Keep فقط');
  assert.equal((await keep.post('founder', { type: 'level', target: fahad.me.id, value: 47 })).status, 200);
  assert.equal((await keep.post('founder', { type: 'badge', target: fahad.me.id, value: '⚡ سريع' })).status, 200);
  await until(() => fahad.me.level === 47 && fahad.me.badge === '⚡ سريع', 2000, 'founder tools');
  assert.equal((await keep.post('founder', { type: 'ban', target: cheat.me.id, value: true })).status, 200);
  assert.equal((await cheat.post('room/create')).status, 401, 'الموقوف يُطرد');

  // --- إغلاق الغرفة ---
  assert.equal((await fahad.post('room/act', { type: 'close' })).status, 200);
  await until(() => fahad.state === null && keep.state === null, 2000, 'close');
  assert.equal((await keep.post('room/join', { code })).status, 404);

  console.log('\n✅ جميع الاختبارات نجحت');
  done(0);
})().catch((e) => { console.error('\n❌', e); done(1); });
function done(code) { srv.kill(); setTimeout(() => process.exit(code), 100); }
