// مؤثرات صوتية خفيفة بـ WebAudio (بدون ملفات) + اهتزاز. قابلة للإيقاف من الإعدادات.
window.SFX = (() => {
  'use strict';
  const get = (k) => { try { return localStorage.getItem(k) !== '0'; } catch { return true; } };
  const set = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch {} };
  const S = { sound: get('hp_sound'), vibe: get('hp_vibe') };
  let ctx;
  const ac = () => {
    if (!S.sound) return null;
    try { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch { return null; }
    return ctx;
  };
  // to: تردد نهاية اختياري لانزلاق النغمة (أساس الأصوات الكوميدية)
  function tone(freq, dur = 0.08, type = 'square', vol = 0.08, when = 0, to = 0) {
    const a = ac(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + when;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const seq = (notes, step, type, vol) => notes.forEach((f, i) => tone(f, step * 1.6, type, vol, i * step));
  const api = {
    hook: null, // يستمع له fun.js ليربط المؤثرات البصرية بالأحداث (يعمل حتى مع كتم الصوت)
    get sound() { return S.sound; }, set sound(v) { S.sound = v; set('hp_sound', v); },
    get vibe() { return S.vibe; }, set vibe(v) { S.vibe = v; set('hp_vibe', v); },
    buzz(ms = 12) { if (S.vibe && navigator.vibrate) { try { navigator.vibrate(ms); } catch {} } },
    tap() { tone(180 + Math.random() * 40, 0.06, 'triangle', 0.16); },
    good() { tone(500 + Math.random() * 250, 0.09, 'sine', 0.12, 0, 1300); },                 // «بلوب» فقاعة
    bad() { tone(420, 0.13, 'sawtooth', 0.07, 0, 190); tone(330, 0.2, 'sawtooth', 0.07, 0.13, 120); }, // بطة حزينة
    tick() { tone(440, 0.09, 'square', 0.05); },
    go() { tone(880, 0.18, 'square', 0.07); },
    whistle() { tone(500, 0.28, 'sine', 0.1, 0, 1900); },                                       // صفارة انزلاقية
    boing() { tone(160, 0.12, 'sine', 0.14, 0, 620); tone(620, 0.22, 'sine', 0.1, 0.12, 240); }, // نطّة زنبرك
    win() { seq([523, 659, 784, 1047], 0.1, 'square', 0.07); tone(160, 0.12, 'sine', 0.12, 0.45, 620); tone(620, 0.22, 'sine', 0.09, 0.57, 240); },
    lose() { [[311, 293], [293, 277], [277, 262], [262, 150]].forEach(([f, to], i) => tone(f, i === 3 ? 0.7 : 0.3, 'sawtooth', 0.07, i * 0.32, to)); }, // وومب وومب
    level() { seq([523, 784, 1047, 1319, 1568], 0.09, 'square', 0.07); },
    boom() { tone(70, 0.4, 'sawtooth', 0.14); tone(900, 0.5, 'sine', 0.06, 0.1, 80); },
  };
  for (const k of ['tap', 'good', 'bad', 'boom', 'go']) { const f = api[k]; api[k] = () => { f(); api.hook?.(k); }; }
  return api;
})();
