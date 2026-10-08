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
  function tone(freq, dur = 0.08, type = 'square', vol = 0.08, when = 0) {
    const a = ac(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + when;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const seq = (notes, step, type, vol) => notes.forEach((f, i) => tone(f, step * 1.6, type, vol, i * step));
  return {
    get sound() { return S.sound; }, set sound(v) { S.sound = v; set('hp_sound', v); },
    get vibe() { return S.vibe; }, set vibe(v) { S.vibe = v; set('hp_vibe', v); },
    buzz(ms = 12) { if (S.vibe && navigator.vibrate) { try { navigator.vibrate(ms); } catch {} } },
    tap() { tone(180 + Math.random() * 40, 0.06, 'triangle', 0.16); },
    good() { tone(660, 0.07, 'square', 0.06); },
    bad() { tone(140, 0.2, 'sawtooth', 0.08); },
    tick() { tone(440, 0.09, 'square', 0.05); },
    go() { tone(880, 0.18, 'square', 0.07); },
    win() { seq([523, 659, 784, 1047], 0.11, 'square', 0.07); },
    lose() { seq([392, 330, 262], 0.16, 'triangle', 0.1); },
    level() { seq([523, 784, 1047, 1319, 1568], 0.09, 'square', 0.07); },
    boom() { tone(70, 0.4, 'sawtooth', 0.14); },
  };
})();
