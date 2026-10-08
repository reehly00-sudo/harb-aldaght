'use strict';
// التحقق من أسماء المستخدمين ومنع انتحال المؤسس.
const FOUNDER_NAME = 'Keep';
const RESERVED_EXACT = ['system', 'root', 'null', 'undefined', 'host', 'mod', 'moderator', 'support', 'official', 'owner',
  'مضيف', 'المضيف', 'مشرف', 'المشرف', 'النظام', 'الادارة', 'الإدارة'];
const RESERVED_PART = ['admin', 'founder', 'مؤسس', 'ادمن', 'أدمن'];

const keyOf = (name) => name.normalize('NFKC').toLowerCase().replace(/[\u064B-\u065F\u0640]/g, '');

function looksLikeKeep(key) {
  const leet = { 3: 'e', 1: 'i', 0: 'o', 4: 'a', 5: 's', 7: 't' };
  const s = key.replace(/[0-9]/g, (d) => leet[d] || '').replace(/[^a-z\u0600-\u06FF]/g, '');
  const collapsed = s.replace(/(.)\1+/g, '$1');
  return s.includes('keep') || collapsed === 'kep' || collapsed === 'كيب';
}

// يعيد { name, key, founder } أو يرمي رسالة خطأ عربية
function validate(raw) {
  const name = String(raw ?? '').normalize('NFKC').trim();
  if (!name) throw new Error('اكتب اسم المستخدم أولًا.');
  if (name.length < 3 || name.length > 16) throw new Error('اسم المستخدم يجب أن يكون من 3 إلى 16 حرفًا.');
  if (!/^[\p{Script=Arabic}a-zA-Z0-9_]+$/u.test(name)) throw new Error('استخدم حروفًا عربية أو إنجليزية وأرقامًا و _ فقط، بدون مسافات.');
  const key = keyOf(name);
  if (key === 'keep') return { name: FOUNDER_NAME, key, founder: true };
  if (looksLikeKeep(key)) throw new Error('هذا الاسم قريب من اسم المؤسس Keep وغير مسموح.');
  if (RESERVED_EXACT.includes(key) || RESERVED_PART.some((w) => key.includes(w))) throw new Error('هذا الاسم محجوز. اختر اسمًا آخر.');
  return { name, key, founder: false };
}

module.exports = { validate, keyOf, FOUNDER_NAME };
