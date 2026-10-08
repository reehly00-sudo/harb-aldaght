'use strict';
// تحدي اللون — الكلمة تسمّي اللون المطلوب لكنها مكتوبة بحبر لون آخر.
const COLORS = [
  { id: 'red', name: 'أحمر', hex: '#F0453F' }, { id: 'blue', name: 'أزرق', hex: '#3B8BFF' },
  { id: 'green', name: 'أخضر', hex: '#2FC46B' }, { id: 'yellow', name: 'أصفر', hex: '#F7C92B' },
  { id: 'purple', name: 'بنفسجي', hex: '#A45CFF' }, { id: 'orange', name: 'برتقالي', hex: '#FF8A2B' },
];
const MIN_GAP = 120;
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
module.exports = {
  id: 'color', name: 'تحدي اللون', hint: 'اضغط اللون الذي تقوله الكلمة، لا لون الحبر!', duration: 12000,
  init(ids) {
    const seq = [];
    for (let k = 0; k < 70; k++) {
      const pick = shuffle(COLORS.map((c) => c.id)).slice(0, 4);
      const target = pick[0];
      const ink = shuffle(COLORS.map((c) => c.id).filter((c) => c !== target))[0];
      seq.push({ target, ink, options: shuffle(pick.slice()) });
    }
    const st = { seq, pos: {}, score: {}, last: {} };
    ids.forEach((i) => { st.pos[i] = 0; st.score[i] = 0; st.last[i] = -1e9; });
    return { cfg: { colors: COLORS, seq }, st };
  },
  action(st, uid, d, t) {
    if (t > this.duration || d.i !== st.pos[uid] || t - st.last[uid] < MIN_GAP) return;
    const q = st.seq[d.i]; if (!q) return;
    st.last[uid] = t; st.pos[uid]++;
    if (d.c === q.target) st.score[uid]++; else st.score[uid] = Math.max(0, st.score[uid] - 1);
  },
  finish(st, ids) {
    const out = {};
    for (const i of ids) out[i] = { raw: st.score[i], label: `${st.score[i]} إجابة صحيحة` };
    return out;
  },
};
