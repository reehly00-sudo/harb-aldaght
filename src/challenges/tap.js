'use strict';
// الضغط السريع — العدّ في السيرفر مع سقف زمني لعدد الضغطات.
const MAX_CPS = 15;        // أقصى معدل بشري منطقي
const FLAG_OVER = 25;      // ضغطات فوق السقف قبل رفض النتيجة
module.exports = {
  id: 'tap', name: 'الضغط السريع', hint: 'اضغط بأسرع ما تستطيع!', duration: 10000,
  init(ids) {
    const st = { c: {}, over: {} };
    ids.forEach((i) => { st.c[i] = 0; st.over[i] = 0; });
    return { cfg: {}, st };
  },
  start(st, ctx) {
    const loop = () => { ctx.emit('prog', st.c); ctx.after(500, loop); };
    ctx.after(500, loop);
  },
  action(st, uid, d, t) {
    const n = Math.min(40, Math.floor(Number(d.n) || 0));
    if (n <= 0) return;
    const cap = Math.floor((MAX_CPS * Math.min(t, this.duration)) / 1000) + 3;
    const want = st.c[uid] + n;
    if (want > cap) { st.over[uid] += want - cap; st.c[uid] = cap; } else st.c[uid] = want;
  },
  finish(st, ids) {
    const out = {};
    for (const i of ids) {
      out[i] = st.over[i] > FLAG_OVER
        ? { raw: null, label: 'نتيجة غير منطقية، لم تُحتسب', flagged: true }
        : { raw: st.c[i], label: `${st.c[i]} ضغطة` };
    }
    return out;
  },
};
