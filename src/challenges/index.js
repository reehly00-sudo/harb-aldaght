'use strict';
/*
 * سجل التحديات (Modular).
 * لإضافة تحدٍّ جديد: أنشئ ملفًا هنا يصدّر الواجهة التالية ثم أضفه للقائمة،
 * وأضف واجهته في public/js/challenges.js بنفس الـ id.
 *
 *   id, name, hint, duration(ms), lowerIsBetter?
 *   init(playerIds)            → { cfg (يُرسل للعميل), st (حالة سرّية في السيرفر) }
 *   start(st, ctx)             → اختياري، عند بدء الجولة. ctx: { emit, emitTo, after, end, t }
 *   action(st, uid, data, t, ctx) → يعالج فعل اللاعب (t = مللي ثانية منذ البداية) ويعيد ردًّا اختياريًا
 *   finish(st, playerIds)      → { [uid]: { raw:number|null, label:string, flagged?:bool } }
 */
const list = [
  require('./tap'),
  require('./reaction'),
  require('./color'),
  require('./dontpress'),
  require('./bomb'),
  require('./target'),
];
const byId = Object.fromEntries(list.map((c) => [c.id, c]));
module.exports = { list, byId };
