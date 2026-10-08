'use strict';
// الهدف المتحرك — السيرفر يعدّ الإصابات ويفرض حدًّا أدنى بين الإصابة والأخرى.
const MIN_GAP = 180, FLAG_FAST = 12;
module.exports = {
  id: 'target', name: 'الهدف المتحرك', hint: 'الهدف لا يثبت في مكانه. أصبه بأكبر عدد من المرات!', duration: 8000,
  init(ids) {
    const st = { hits: {}, last: {}, fast: {} };
    ids.forEach((i) => { st.hits[i] = 0; st.last[i] = -1e9; st.fast[i] = 0; });
    return { cfg: { moveMs: 650 }, st };
  },
  action(st, uid, d, t) {
    if (t > this.duration) return;
    if (t - st.last[uid] < MIN_GAP) { st.fast[uid]++; return; }
    st.last[uid] = t; st.hits[uid]++;
  },
  finish(st, ids) {
    const out = {};
    for (const i of ids) {
      out[i] = st.fast[i] > FLAG_FAST
        ? { raw: null, label: 'نتيجة غير منطقية، لم تُحتسب', flagged: true }
        : { raw: st.hits[i], label: `${st.hits[i]} إصابة` };
    }
    return out;
  },
};
