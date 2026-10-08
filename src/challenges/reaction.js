'use strict';
// رد الفعل — السيرفر وحده يعرف لحظة الإشارة ويقيس الزمن.
const MIN_HUMAN_MS = 70;
module.exports = {
  id: 'reaction', name: 'رد الفعل', hint: 'انتظر الإشارة الخضراء ثم اضغط فورًا. الضغط المبكر يُخرجك!', duration: 8000, lowerIsBetter: true,
  init(ids) {
    return { cfg: {}, st: { delay: 1500 + Math.random() * 3500, goAt: null, res: {}, n: ids.length } };
  },
  start(st, ctx) {
    ctx.after(st.delay, () => {
      st.goAt = ctx.t();
      ctx.emit('go', {});
      ctx.after(2500, () => ctx.end());
    });
  },
  action(st, uid, d, t, ctx) {
    if (uid in st.res) return;
    let reply;
    if (st.goAt == null) { st.res[uid] = { early: true }; reply = { early: true }; }
    else {
      const ms = Math.round(t - st.goAt);
      if (ms < MIN_HUMAN_MS) { st.res[uid] = { flagged: true }; reply = { early: true }; }
      else { st.res[uid] = { ms }; reply = { ms }; }
    }
    if (st.goAt != null && Object.keys(st.res).length >= st.n) ctx.end();
    return reply;
  },
  finish(st, ids) {
    const out = {};
    for (const i of ids) {
      const r = st.res[i];
      if (!r) out[i] = { raw: null, label: 'لم يضغط' };
      else if (r.early) out[i] = { raw: null, label: 'ضغط قبل الإشارة' };
      else if (r.flagged) out[i] = { raw: null, label: 'نتيجة غير منطقية، لم تُحتسب', flagged: true };
      else out[i] = { raw: r.ms, label: `${r.ms} مللي ثانية` };
    }
    return out;
  },
};
