'use strict';
// الزر المفخخ — مكان القنبلة سرّي في السيرفر ومختلف لكل لاعب.
const CELLS = 9;
module.exports = {
  id: 'bomb', name: 'الزر المفخخ', hint: 'كل زر آمن يزيد نقاطك أكثر… وزر واحد يفجّر كل ما جمعت. متى تتوقف؟', duration: 9000,
  init(ids) {
    const st = { p: {} };
    ids.forEach((i) => { st.p[i] = { bomb: Math.floor(Math.random() * CELLS), open: new Set(), dead: false }; });
    return { cfg: { cells: CELLS }, st };
  },
  score: (k) => (5 * k * (k + 1)) / 2,
  action(st, uid, d, t) {
    const p = st.p[uid], c = Number(d.c);
    if (t > this.duration || !p || p.dead || !Number.isInteger(c) || c < 0 || c >= CELLS || p.open.has(c)) return;
    if (c === p.bomb) { p.dead = true; return { boom: true, score: 0 }; }
    p.open.add(c);
    return { safe: true, score: this.score(p.open.size) };
  },
  finish(st, ids) {
    const out = {};
    for (const i of ids) {
      const p = st.p[i];
      out[i] = p.dead ? { raw: 0, label: '💥 انفجر' } : { raw: this.score(p.open.size), label: `${this.score(p.open.size)} نقطة` };
    }
    return out;
  },
};
