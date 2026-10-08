'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const xp = require('./xp');

function open(file) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  // الغرف حيّة في الذاكرة؛ أي غرفة بقيت مفتوحة من تشغيل سابق تُغلق
  db.prepare("UPDATE rooms SET status='closed', closed_at=? WHERE status='open'").run(Date.now());

  const P = {};
  const q = (sql) => (P[sql] ||= db.prepare(sql));
  const newToken = () => crypto.randomBytes(24).toString('hex');
  const api = { raw: db, newToken };

  api.meta = (k) => q('SELECT value FROM meta WHERE key=?').get(k)?.value;
  api.setMeta = (k, v) => q('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, v);

  // ---------- Users ----------
  api.userByKey = (key) => q('SELECT * FROM users WHERE name_key=?').get(key);
  api.userById = (id) => q('SELECT * FROM users WHERE id=?').get(id);
  api.userByToken = (t) => (t ? q('SELECT * FROM users WHERE token=?').get(t) : undefined);
  api.createUser = (name, key, founder = false) => {
    const now = Date.now();
    const id = Number(q('INSERT INTO users(name,name_key,token,is_founder,created_at,last_seen) VALUES(?,?,?,?,?,?)')
      .run(name, key, newToken(), founder ? 1 : 0, now, now).lastInsertRowid);
    q('INSERT INTO player_progress(user_id,xp,level) VALUES(?,?,?)')
      .run(id, founder ? xp.MAX_XP : 0, founder ? xp.MAX_LEVEL : 1);
    return api.userById(id);
  };
  api.rotateToken = (id) => { const t = newToken(); q('UPDATE users SET token=?, last_seen=? WHERE id=?').run(t, Date.now(), id); return t; };
  api.touch = (id) => q('UPDATE users SET last_seen=? WHERE id=?').run(Date.now(), id);
  api.setBadge = (id, badge) => q('UPDATE users SET badge=? WHERE id=?').run(badge || null, id);
  api.setBanned = (id, b) => q('UPDATE users SET banned=? WHERE id=?').run(b ? 1 : 0, id);

  // ---------- Progress ----------
  api.progress = (id) => q('SELECT * FROM player_progress WHERE user_id=?').get(id);
  api.setXp = (id, total) => q('UPDATE player_progress SET xp=?, level=? WHERE user_id=?').run(total, xp.levelFromXp(total).level, id);
  api.me = (id) => {
    const u = api.userById(id); if (!u) return null;
    const p = api.progress(id), l = xp.levelFromXp(p.xp);
    return { id: u.id, name: u.name, founder: !!u.is_founder, badge: u.badge || '', level: l.level, xp: p.xp, into: l.into, need: l.need,
      games: p.games, wins: p.wins, firstPlaces: p.first_places, best: p.best_score };
  };
  api.rankOf = (id) => {
    const mine = q('SELECT COALESCE(SUM(points),0) s, COUNT(*) n FROM leaderboard_entries WHERE user_id=?').get(id);
    if (!mine.n) return null;
    return 1 + q(`SELECT COUNT(*) c FROM (SELECT SUM(e.points) s FROM leaderboard_entries e JOIN users u ON u.id=e.user_id
                  WHERE u.banned=0 GROUP BY e.user_id HAVING s > ?)`).get(mine.s).c;
  };

  // ---------- Rooms ----------
  api.createRoom = (code, ownerId, max, rounds) => Number(q('INSERT INTO rooms(code,owner_id,max_players,rounds_total,created_at) VALUES(?,?,?,?,?)')
    .run(code, ownerId, max, rounds, Date.now()).lastInsertRowid);
  api.closeRoom = (id) => q("UPDATE rooms SET status='closed', closed_at=? WHERE id=?").run(Date.now(), id);
  api.setOwner = (id, uid) => q('UPDATE rooms SET owner_id=? WHERE id=?').run(uid, id);
  api.setRounds = (id, n) => q('UPDATE rooms SET rounds_total=? WHERE id=?').run(n, id);
  api.joinRoom = (rid, uid) => q(`INSERT INTO room_players(room_id,user_id,joined_at) VALUES(?,?,?)
    ON CONFLICT(room_id,user_id) DO UPDATE SET left_at=NULL`).run(rid, uid, Date.now());
  api.leftRoom = (rid, uid, banned) => q('UPDATE room_players SET left_at=?, banned=MAX(banned,?) WHERE room_id=? AND user_id=?').run(Date.now(), banned ? 1 : 0, rid, uid);

  // ---------- Games / Rounds / Scores ----------
  api.createGame = (rid) => Number(q('INSERT INTO games(room_id,started_at) VALUES(?,?)').run(rid, Date.now()).lastInsertRowid);
  api.createRound = (gid, idx, ch) => Number(q('INSERT INTO rounds(game_id,idx,challenge,started_at) VALUES(?,?,?,?)').run(gid, idx, ch, Date.now()).lastInsertRowid);
  api.saveRound = (roundId, rows) => {
    db.exec('BEGIN');
    try {
      for (const r of rows) q('INSERT OR REPLACE INTO scores(round_id,user_id,raw,points,flagged) VALUES(?,?,?,?,?)').run(roundId, r.id, r.raw, r.points, r.flagged ? 1 : 0);
      q('UPDATE rounds SET ended_at=? WHERE id=?').run(Date.now(), roundId);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  // rows: [{id, total, place, roundFirsts}] → يضيف xp/levelBefore/levelAfter لكل صف
  api.finishGame = (gid, rows) => {
    const now = Date.now();
    db.exec('BEGIN');
    try {
      for (const r of rows) {
        const p = api.progress(r.id);
        r.levelBefore = p.level;
        r.xp = xp.gameXp({ points: r.total, placement: r.place, players: rows.length, roundFirsts: r.roundFirsts });
        const total = Math.min(xp.MAX_XP, p.xp + r.xp);
        r.levelAfter = xp.levelFromXp(total).level;
        q(`UPDATE player_progress SET xp=?, level=?, games=games+1, wins=wins+?, first_places=first_places+?, best_score=MAX(best_score,?) WHERE user_id=?`)
          .run(total, r.levelAfter, r.place === 1 ? 1 : 0, r.roundFirsts, r.total, r.id);
        q('INSERT OR REPLACE INTO leaderboard_entries(game_id,user_id,points,placement,xp_gained,created_at) VALUES(?,?,?,?,?,?)')
          .run(gid, r.id, r.total, r.place, r.xp, now);
      }
      q('UPDATE games SET ended_at=?, winner_id=? WHERE id=?').run(now, rows.find((r) => r.place === 1)?.id ?? null, gid);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return rows;
  };

  // ---------- Leaderboard ----------
  api.leaderboard = (since) => q(`
    SELECT u.id, u.name, u.is_founder founder, u.badge, p.level,
           SUM(e.points) points, SUM(e.placement = 1) wins, COUNT(*) games, SUM(e.xp_gained) xp
    FROM leaderboard_entries e
    JOIN users u ON u.id = e.user_id
    JOIN player_progress p ON p.user_id = u.id
    WHERE e.created_at >= ? AND u.banned = 0
    GROUP BY u.id
    ORDER BY points DESC, wins DESC, games ASC
    LIMIT 50`).all(since).map((r) => ({ ...r, founder: !!r.founder, badge: r.badge || '' }));

  return api;
}

module.exports = { open };
