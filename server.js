'use strict';
/*
 * حرب الضغط — السيرفر (بدون أي مكتبات خارجية)
 * HTTP + Server-Sent Events للبث اللحظي + SQLite المدمجة في Node.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// تحميل .env بسيط (اختياري)
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch {}

const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'game.db');
const TZ_OFFSET_MIN = Number(process.env.TZ_OFFSET_MIN ?? 180);

const db = require('./src/db').open(DB_PATH);
const users = require('./src/users');
const xp = require('./src/xp');
const { Hub, ApiError } = require('./src/rooms');
const hub = new Hub(db, { minPlayers: Number(process.env.MIN_PLAYERS) || 2, maxPlayers: Number(process.env.MAX_PLAYERS) || 10 });

// ---------- حساب المؤسس ----------
let FOUNDER_KEY = process.env.FOUNDER_KEY || db.meta('founder_key');
if (!FOUNDER_KEY) {
  FOUNDER_KEY = crypto.randomBytes(9).toString('base64url');
  db.setMeta('founder_key', FOUNDER_KEY);
  console.log(`\n🔑 مفتاح المؤسس (للدخول باسم Keep): ${FOUNDER_KEY}\n   احفظه، أو عيّن FOUNDER_KEY في متغيرات البيئة.\n`);
}
if (!db.userByKey('keep')) db.createUser(users.FOUNDER_NAME, 'keep', true);
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// ---------- أدوات ----------
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((ok, no) => {
  let s = '';
  req.on('data', (c) => { s += c; if (s.length > 4096) { no(new ApiError(413, 'الطلب كبير جدًا.')); req.destroy(); } });
  req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { no(new ApiError(400, 'طلب غير صالح.')); } });
  req.on('error', no);
});
const buckets = new Map();
function limit(key, max, windowMs) {
  const now = Date.now(), b = buckets.get(key);
  if (!b || now - b.t > windowMs) { buckets.set(key, { t: now, n: 1 }); return; }
  if (++b.n > max) throw new ApiError(429, 'محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.');
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.t > 120000) buckets.delete(k); }, 60000).unref();
const ipOf = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
const auth = (req, url) => {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('t');
  const u = db.userByToken(t);
  if (!u || u.banned) throw new ApiError(401, 'انتهت الجلسة. ادخل باسم المستخدم من جديد.');
  return u;
};
const founderOnly = (u) => { if (!u.is_founder) throw new ApiError(403, 'غير مسموح.'); };

// ---------- تسجيل الدخول باسم المستخدم ----------
function login(req, { name, token, key }) {
  limit('login:' + ipOf(req), 20, 60000);
  let v;
  try { v = users.validate(name); } catch (e) { throw new ApiError(400, e.message); }
  let u = db.userByKey(v.key);
  if (v.founder) {
    if (!(token && safeEqual(token, u.token))) {
      if (!key) return { needKey: true, error: 'اسم Keep محجوز للمؤسس. أدخل مفتاح المؤسس للمتابعة.' };
      if (!safeEqual(key, FOUNDER_KEY)) throw new ApiError(403, 'مفتاح المؤسس غير صحيح.', { needKey: true });
      u.token = db.rotateToken(u.id);
    }
  } else if (!u) {
    u = db.createUser(v.name, v.key);
  } else if (u.banned) {
    throw new ApiError(403, 'هذا الحساب موقوف.');
  } else if (!(token && safeEqual(token, u.token))) {
    if (hub.isOnline(u.id)) throw new ApiError(409, 'هذا الاسم مستخدم الآن من لاعب آخر. اختر اسمًا مختلفًا.');
    u.token = db.rotateToken(u.id);   // عودة اللاعب من جهاز جديد
  }
  db.touch(u.id);
  return { token: u.token, me: db.me(u.id) };
}

function dayStart() {
  const off = TZ_OFFSET_MIN * 60000, local = Date.now() + off;
  return local - (local % 86400000) - off;
}

// ---------- المسارات ----------
const routes = {
  'POST /api/login': async (req) => login(req, await readBody(req)),
  'GET /api/me': (req, url) => ({ me: db.me(auth(req, url).id) }),

  'POST /api/room/create': (req, url) => { const u = auth(req, url); limit('create:' + u.id, 6, 60000); return { code: hub.create(u).code }; },
  'POST /api/room/join': async (req, url) => { const u = auth(req, url); limit('join:' + u.id, 20, 60000); return { code: hub.join(u, (await readBody(req)).code).code }; },
  'POST /api/room/leave': (req, url) => { hub.leave(auth(req, url).id); return {}; },
  'POST /api/room/act': async (req, url) => { const u = auth(req, url), b = await readBody(req); hub.act(u, b.type, b); return {}; },
  'POST /api/play': async (req, url) => hub.play(auth(req, url), await readBody(req)),

  'GET /api/leaderboard': (req, url) => {
    auth(req, url);
    const range = url.searchParams.get('range');
    const since = range === 'day' ? dayStart() : range === 'week' ? Date.now() - 7 * 86400000 : 0;
    return { range: range === 'day' || range === 'week' ? range : 'all', rows: db.leaderboard(since) };
  },
  'GET /api/profile': (req, url) => {
    auth(req, url);
    const u = db.userByKey(users.keyOf(url.searchParams.get('name') || ''));
    if (!u) throw new ApiError(404, 'لا يوجد لاعب بهذا الاسم.');
    return { profile: { ...db.me(u.id), rank: db.rankOf(u.id), banned: !!u.banned } };
  },

  // صلاحيات المؤسس — داخل اللعبة نفسها، بلا لوحة تحكم منفصلة
  'POST /api/founder': async (req, url) => {
    const me = auth(req, url); founderOnly(me);
    const b = await readBody(req), target = db.userById(Number(b.target));
    if (!target) throw new ApiError(404, 'اللاعب غير موجود.');
    if (b.type === 'level') {
      const lvl = Math.floor(Number(b.value));
      if (!(lvl >= 1 && lvl <= xp.MAX_LEVEL)) throw new ApiError(400, `المستوى يجب أن يكون بين 1 و ${xp.MAX_LEVEL}.`);
      db.setXp(target.id, xp.totalXpForLevel(lvl));
    } else if (b.type === 'badge') {
      db.setBadge(target.id, String(b.value || '').trim().slice(0, 14));
    } else if (b.type === 'ban') {
      if (target.is_founder) throw new ApiError(400, 'لا يمكن إيقاف حساب المؤسس.');
      db.setBanned(target.id, !!b.value);
      if (b.value) hub.expel(target.id);
    } else throw new ApiError(400, 'إجراء غير معروف.');
    hub.refreshUser(target.id);
    return {};
  },
};

function stream(req, res, url) {
  const u = auth(req, url);
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 1500\n\n');
  hub.attach(u.id, res);
  const beat = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => { clearInterval(beat); hub.detach(u.id, res); });
}

// ---------- الملفات الثابتة ----------
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || !path.extname(p)) p = '/index.html';
  const file = path.join(PUBLIC, path.normalize(p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('غير موجود'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': p === '/index.html' ? 'no-cache' : 'public, max-age=600', 'X-Content-Type-Options': 'nosniff' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/stream' && req.method === 'GET') return stream(req, res, url);
    if (url.pathname === '/healthz') return json(res, 200, { ok: true });
    const h = routes[`${req.method} ${url.pathname}`];
    if (h) return json(res, 200, (await h(req, url)) || {});
    if (url.pathname.startsWith('/api/')) throw new ApiError(404, 'المسار غير موجود.');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serveStatic(req, res, url);
  } catch (e) {
    if (res.headersSent) return res.end();
    if (e instanceof ApiError) return json(res, e.status, { error: e.message, ...(e.extra || {}) });
    console.error(e);
    json(res, 500, { error: 'خطأ في السيرفر. حاول مرة أخرى.' });
  }
});

server.listen(PORT, () => console.log(`🥁 حرب الضغط تعمل على http://localhost:${PORT}`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); process.exit(0); });
