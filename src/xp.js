'use strict';
// نظام XP والمستويات — لا عملات إطلاقًا.
const MAX_LEVEL = 200;
// XP المطلوب للانتقال من المستوى L إلى L+1 (يتصاعد خطيًا)
const xpForNext = (level) => 100 + 25 * (level - 1);
const totalXpForLevel = (level) => {
  const n = Math.max(0, Math.min(level, MAX_LEVEL) - 1);
  return 100 * n + 25 * (n * (n - 1)) / 2;
};
const MAX_XP = totalXpForLevel(MAX_LEVEL); // ≈ 512 ألف XP ≈ آلاف المباريات

function levelFromXp(xp) {
  let level = 1, rest = Math.max(0, xp);
  while (level < MAX_LEVEL && rest >= xpForNext(level)) { rest -= xpForNext(level); level++; }
  return level >= MAX_LEVEL
    ? { level: MAX_LEVEL, into: 0, need: 0 }
    : { level, into: rest, need: xpForNext(level) };
}

// XP المباراة: مشاركة + أداء + مركز + صدارة جولات
function gameXp({ points, placement, players, roundFirsts }) {
  if (points <= 0) return 5;
  let v = 15 + Math.floor(points / 8) + 3 * roundFirsts;
  if (placement === 1) v += Math.min(80, 20 + 8 * (players - 1));
  else if (placement === 2 && players >= 3) v += 20;
  else if (placement === 3 && players >= 4) v += 10;
  return v;
}

module.exports = { MAX_LEVEL, MAX_XP, xpForNext, totalXpForLevel, levelFromXp, gameXp };
