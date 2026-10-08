'use strict';
// إدارة الغرف الحيّة ومحرك الجولات (السيرفر هو مصدر الحقيقة).
const challenges = require('./challenges');

const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const INTRO_MS = 3600, RESULTS_MS = 5000, END_GRACE_MS = 300, OFFLINE_MS = 25000;
const POINTS = [100, 75, 55, 40, 30, 25, 20, 15, 12, 10];
const ROUND_CHOICES = [3, 5, 7];

class ApiError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

class Hub {
  constructor(db, { minPlayers = 2, maxPlayers = 10 } = {}) {
    this.db = db; this.min = minPlayers; this.max = maxPlayers;
    this.rooms = new Map();      // code → room
    this.userRoom = new Map();   // userId → room
    this.streams = new Map();    // userId → SSE response
    this.offTimers = new Map();
  }

  // ---------- البث (SSE) ----------
  isOnline(uid) { return this.streams.has(uid); }
  send(uid, ev, data) { const r = this.streams.get(uid); if (r) r.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`); }
  broadcast(room, ev, data) { for (const uid of room.players.keys()) this.send(uid, ev, data); }
  push(room) { if (!room.closed) this.broadcast(room, 'state', this.snapshot(room)); }

  attach(uid, res) {
    const old = this.streams.get(uid);
    this.streams.set(uid, res);
    if (old) { try { old.end(); } catch {} }
    clearTimeout(this.offTimers.get(uid)); this.offTimers.delete(uid);
    this.send(uid, 'me', this.db.me(uid));
    const room = this.userRoom.get(uid);
    if (room) { room.players.get(uid).online = true; this.push(room); } else this.send(uid, 'state', null);
  }
  detach(uid, res) {
    if (this.streams.get(uid) !== res) return;
    this.streams.delete(uid);
    const room = this.userRoom.get(uid);
    if (!room) return;
    room.players.get(uid).online = false;
    this.push(room);
    this.offTimers.set(uid, setTimeout(() => { this.offTimers.delete(uid); if (!this.streams.has(uid)) this.leave(uid); }, OFFLINE_MS));
  }

  // ---------- الحالة المرسلة للعميل ----------
  playerInfo(uid) {
    const m = this.db.me(uid);
    return { id: m.id, name: m.name, level: m.level, founder: m.founder, badge: m.badge, online: true, total: 0, roundFirsts: 0 };
  }
  snapshot(room) {
    const c = room.cur;
    return {
      now: Date.now(), code: room.code, ownerId: room.ownerId, phase: room.phase, max: this.max, min: this.min,
      roundsTotal: room.roundsTotal, round: room.roundIdx + 1,
      players: [...room.players.values()].map(({ roundFirsts, ...p }) => p),
      challenge: c && ['intro', 'active'].includes(room.phase)
        ? { id: c.ch.id, name: c.ch.name, hint: c.ch.hint, duration: c.ch.duration, cfg: c.cfg, startAt: c.startAt, endAt: c.startAt + c.ch.duration } : null,
      results: room.phase === 'results' ? room.results : null,
      final: room.phase === 'final' ? room.final : null,
    };
  }

  // ---------- الغرف ----------
  create(user) {
    this.leave(user.id);
    let code; do { code = Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join(''); } while (this.rooms.has(code));
    const room = { id: this.db.createRoom(code, user.id, this.max, 5), code, ownerId: user.id, players: new Map(), banned: new Set(),
      phase: 'lobby', roundsTotal: 5, roundIdx: -1, cur: null, timers: new Set(), closed: false };
    this.rooms.set(code, room);
    this.addPlayer(room, user.id);
    return room;
  }
  addPlayer(room, uid) {
    room.players.set(uid, this.playerInfo(uid));
    this.userRoom.set(uid, room);
    this.db.joinRoom(room.id, uid);
    this.push(room);
  }
  join(user, rawCode) {
    const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const room = this.rooms.get(code);
    if (!room) throw new ApiError(404, 'لا توجد غرفة مفتوحة بهذا الكود. تأكد من الكود وحاول مرة أخرى.');
    if (room.players.has(user.id)) { this.push(room); return room; }
    if (room.banned.has(user.id)) throw new ApiError(403, 'المضيف منعك من دخول هذه الغرفة.');
    if (!['lobby', 'final'].includes(room.phase)) throw new ApiError(409, 'اللعبة جارية الآن. ادخل بعد انتهاء المباراة.');
    if (room.players.size >= this.max) throw new ApiError(409, 'الغرفة ممتلئة.');
    this.leave(user.id);
    this.addPlayer(room, user.id);
    return room;
  }
  leave(uid, banned = false) {
    const room = this.userRoom.get(uid);
    if (!room) return;
    room.players.delete(uid);
    this.userRoom.delete(uid);
    this.db.leftRoom(room.id, uid, banned);
    this.send(uid, 'state', null);
    if (room.players.size === 0) return this.close(room);
    if (room.ownerId === uid) { room.ownerId = room.players.keys().next().value; this.db.setOwner(room.id, room.ownerId); }
    this.push(room);
  }
  close(room, notify = false) {
    if (room.closed) return;
    room.closed = true;
    for (const t of room.timers) clearTimeout(t);
    for (const uid of room.players.keys()) {
      this.userRoom.delete(uid);
      if (notify) this.send(uid, 'closed', {});
      this.send(uid, 'state', null);
    }
    this.rooms.delete(room.code);
    this.db.closeRoom(room.id);
  }
  timer(room, ms, fn) {
    const t = setTimeout(() => { room.timers.delete(t); if (!room.closed) fn(); }, ms);
    room.timers.add(t);
    return t;
  }

  // أفعال المضيف / المؤسس داخل الغرفة
  act(user, type, d = {}) {
    const room = this.userRoom.get(user.id);
    if (!room) throw new ApiError(404, 'لست داخل غرفة.');
    const isOwner = room.ownerId === user.id, boss = isOwner || !!user.is_founder;
    const idle = ['lobby', 'final'].includes(room.phase);
    const need = (ok) => { if (!ok) throw new ApiError(403, 'هذا الإجراء للمضيف فقط.'); };
    switch (type) {
      case 'start':
        need(isOwner);
        if (!idle) throw new ApiError(409, 'اللعبة بدأت بالفعل.');
        if (room.players.size < this.min) throw new ApiError(409, `تحتاج ${this.min} لاعبين على الأقل لبدء اللعبة. شارك كود الغرفة مع أصدقائك.`);
        this.startGame(room); break;
      case 'lobby':
        need(isOwner);
        if (room.phase === 'final') { room.phase = 'lobby'; this.push(room); } break;
      case 'rounds':
        need(boss);
        if (!idle || !ROUND_CHOICES.includes(d.value)) throw new ApiError(400, 'قيمة غير صالحة.');
        room.roundsTotal = d.value; this.db.setRounds(room.id, d.value); this.push(room); break;
      case 'kick': case 'ban': {
        need(boss);
        const target = room.players.get(Number(d.target));
        if (!target) throw new ApiError(404, 'اللاعب ليس في الغرفة.');
        if (target.id === user.id) throw new ApiError(400, 'لا يمكنك طرد نفسك.');
        if (target.founder) throw new ApiError(403, 'لا يمكن طرد المؤسس.');
        if (type === 'ban') room.banned.add(target.id);
        this.send(target.id, 'kicked', { ban: type === 'ban' });
        this.leave(target.id, type === 'ban'); break;
      }
      case 'close': need(boss); this.close(room, true); break;
      default: throw new ApiError(400, 'إجراء غير معروف.');
    }
  }

  // ---------- محرك اللعبة ----------
  startGame(room) {
    const rest = shuffle(challenges.list.map((c) => c.id).filter((id) => id !== 'tap'));
    const order = ['tap', ...rest];
    while (order.length < room.roundsTotal) order.push(...shuffle(challenges.list.map((c) => c.id)));
    room.order = order.slice(0, room.roundsTotal);
    room.gameId = this.db.createGame(room.id);
    room.roundIdx = -1; room.final = null;
    for (const p of room.players.values()) { p.total = 0; p.roundFirsts = 0; }
    this.nextRound(room);
  }
  nextRound(room) {
    room.roundIdx++;
    if (room.roundIdx >= room.roundsTotal) return this.finishGame(room);
    const ch = challenges.byId[room.order[room.roundIdx]];
    const ids = [...room.players.keys()];
    const names = Object.fromEntries(ids.map((i) => [i, { ...room.players.get(i) }]));
    const { cfg, st } = ch.init(ids);
    const cur = room.cur = { ch, cfg, st, ids, names, startAt: Date.now() + INTRO_MS, ended: false, timers: [],
      roundId: this.db.createRound(room.gameId, room.roundIdx, ch.id), rate: {} };
    cur.ctx = {
      t: () => Date.now() - cur.startAt,
      emit: (ev, data) => this.broadcast(room, ev, data),
      emitTo: (uid, ev, data) => this.send(uid, ev, data),
      after: (ms, fn) => cur.timers.push(this.timer(room, ms, () => { if (!cur.ended) fn(); })),
      end: () => setImmediate(() => this.endRound(room, cur)),
    };
    room.phase = 'intro'; this.push(room);
    this.timer(room, INTRO_MS, () => {
      room.phase = 'active'; this.push(room);
      ch.start?.(st, cur.ctx);
      this.timer(room, ch.duration + END_GRACE_MS, () => this.endRound(room, cur));
    });
  }
  // فعل لاعب داخل الجولة
  play(user, data) {
    const room = this.userRoom.get(user.id), cur = room?.cur;
    if (!cur || room.phase !== 'active' || cur.ended || !cur.ids.includes(user.id)) return {};
    const t = Date.now() - cur.startAt;
    if (t < 0 || t > cur.ch.duration + END_GRACE_MS) return {};
    // حد عام: 30 طلبًا في الثانية لكل لاعب
    const sec = Math.floor(t / 1000), r = (cur.rate[user.id] ||= { sec, n: 0 });
    if (r.sec !== sec) { r.sec = sec; r.n = 0; }
    if (++r.n > 30) return {};
    return cur.ch.action(cur.st, user.id, data || {}, t, cur.ctx) || {};
  }
  endRound(room, cur) {
    if (cur.ended || room.closed || room.cur !== cur) return;
    cur.ended = true;
    cur.timers.forEach(clearTimeout);
    const res = cur.ch.finish(cur.st, cur.ids), lower = !!cur.ch.lowerIsBetter;
    const valid = cur.ids.filter((i) => res[i].raw != null && (lower || res[i].raw > 0))
      .sort((a, b) => (lower ? res[a].raw - res[b].raw : res[b].raw - res[a].raw));
    let rank = 0, prev;
    valid.forEach((id, k) => {
      if (res[id].raw !== prev) { rank = k; prev = res[id].raw; }
      res[id].rank = rank + 1; res[id].points = POINTS[Math.min(rank, POINTS.length - 1)];
    });
    const rows = cur.ids.map((id) => {
      const r = res[id], p = room.players.get(id);
      r.rank ??= valid.length + 1; r.points ??= 0;
      if (p) { p.total += r.points; if (r.rank === 1 && r.points > 0) p.roundFirsts++; }
      const n = cur.names[id];
      return { id, name: n.name, level: n.level, founder: n.founder, badge: n.badge, raw: r.raw, label: r.label, rank: r.rank, points: r.points, flagged: !!r.flagged };
    }).sort((a, b) => a.rank - b.rank);
    this.db.saveRound(cur.roundId, rows);
    room.results = { challenge: { id: cur.ch.id, name: cur.ch.name }, rows, last: room.roundIdx + 1 >= room.roundsTotal, nextAt: Date.now() + RESULTS_MS };
    room.phase = 'results'; this.push(room);
    this.timer(room, RESULTS_MS, () => this.nextRound(room));
  }
  finishGame(room) {
    const ps = [...room.players.values()].sort((a, b) => b.total - a.total);
    let place = 0, prev;
    const rows = ps.map((p, k) => { if (p.total !== prev) { place = k; prev = p.total; } return { id: p.id, total: p.total, place: place + 1, roundFirsts: p.roundFirsts }; });
    this.db.finishGame(room.gameId, rows);
    room.final = rows.map((r) => {
      const p = room.players.get(r.id);
      p.level = r.levelAfter;
      return { id: r.id, name: p.name, founder: p.founder, badge: p.badge, total: r.total, place: r.place, xp: r.xp, levelBefore: r.levelBefore, level: r.levelAfter };
    });
    room.cur = null; room.phase = 'final';
    for (const r of rows) this.send(r.id, 'me', this.db.me(r.id));
    this.push(room);
  }

  // ---------- أدوات المؤسس ----------
  refreshUser(uid) {
    const room = this.userRoom.get(uid);
    if (room) { const p = room.players.get(uid), m = this.db.me(uid); Object.assign(p, { level: m.level, badge: m.badge }); this.push(room); }
    this.send(uid, 'me', this.db.me(uid));
  }
  expel(uid) {
    this.send(uid, 'banned', {});
    this.leave(uid);
    const s = this.streams.get(uid); if (s) { this.streams.delete(uid); try { s.end(); } catch {} }
  }
}

module.exports = { Hub, ApiError };
