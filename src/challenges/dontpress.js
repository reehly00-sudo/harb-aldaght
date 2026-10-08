'use strict';
// لا تضغط — الإشارات تُبث لحظيًا من السيرفر فلا يعرفها العميل مسبقًا.
const SAFE = ['🥁', '⚡', '🔥', '🎯', '⭐'];
const TTL = 700, GRACE = 220;
module.exports = {
  id: 'dontpress', name: 'لا تضغط', hint: 'اضغط عند كل إشارة… إلا الجمجمة 💀 فلا تلمسها!', duration: 10000,
  init(ids) {
    const st = { score: {}, cur: null, hit: new Set(), i: 0 };
    ids.forEach((i) => { st.score[i] = 0; });
    return { cfg: { ttl: TTL }, st };
  },
  start(st, ctx) {
    const next = () => {
      if (ctx.t() > this.duration - TTL - 200) return;
      const bad = Math.random() < 0.35;
      st.cur = { i: st.i++, bad, at: ctx.t() };
      st.hit = new Set();
      ctx.emit('sig', { i: st.cur.i, bad, icon: bad ? '💀' : SAFE[Math.floor(Math.random() * SAFE.length)] });
      ctx.after(TTL + 250 + Math.random() * 450, next);
    };
    ctx.after(700, next);
  },
  action(st, uid, d, t) {
    if (t > this.duration) return;
    const c = st.cur;
    const live = c && d.i === c.i && t - c.at <= TTL + GRACE;
    if (!live) { st.score[uid] -= 1; return { miss: true, score: st.score[uid] }; }   // ضغط عشوائي
    if (st.hit.has(uid)) return { score: st.score[uid] };
    st.hit.add(uid);
    st.score[uid] += c.bad ? -2 : 1;
    return { bad: c.bad, score: st.score[uid] };
  },
  finish(st, ids) {
    const out = {};
    for (const i of ids) out[i] = { raw: st.score[i], label: `${st.score[i]} نقطة` };
    return out;
  },
};
