/*
 * الحيوية: شخصيات، أماكن لعب، عبارات مضحكة، ومؤثرات بصرية خفيفة.
 * كل شيء شكلي فقط ولا يؤثر على النتائج. لا قدرات خاصة لأي شخصية.
 */
window.FUN = (() => {
  'use strict';
  const CHARS = ['🦊', '🐼', '🐸', '🐯', '🐙', '🦄', '🐵', '🐧', '🦁', '🐨', '🐲', '🤖', '👻', '👽', '🐔', '🦉'];
  const PLACES = [
    { id: 'stadium', name: 'الملعب', icon: '🏟️', deco: '⚽ 🥅 ⚽' },
    { id: 'desert', name: 'الصحراء', icon: '🏜️', deco: '🌵 🐪 🌵' },
    { id: 'space', name: 'الفضاء', icon: '🚀', deco: '🪐 ⭐ 🛸' },
    { id: 'sea', name: 'قاع البحر', icon: '🌊', deco: '🐠 🫧 🐡' },
    { id: 'market', name: 'السوق الليلي', icon: '🏮', deco: '🏮 🎪 🏮' },
    { id: 'snow', name: 'الجبل الثلجي', icon: '🏔️', deco: '❄️ ⛄ ❄️' },
  ];
  const ICONS = { tap: '🥁', reaction: '⚡', color: '🎨', dontpress: '💀', bomb: '💣', target: '🎯' };
  const SAY = {
    start: ['شد حيلك!', 'يلا يا بطل!', 'ورّنا شغلك!', 'لا ترحمهم!'],
    good: ['خلص عليه!', 'كفو!', 'نار 🔥', 'ما شاء الله!', 'وحش!'],
    bad: ['وش تسوي؟!', 'يا ساتر!', 'لا لا لا!', 'ركّز يا شيخ!', 'أووف 😬'],
    late: ['تأخرت 😂', 'نايم؟ 😴', 'وينك؟!', 'تحرّك!'],
    win: ['خلّصت عليهم! 🔥', 'كفو يا بطل!', 'ولا غلطة!', 'ملك الجولة 👑'],
    mid: ['قريب… شد حيلك!', 'مو بطّال!', 'الجاية لك!'],
    lose: ['يا ساتر! 😂', 'وش صار؟!', 'تأخرت 😂', 'عوّضها في الجاية!'],
  };
  const LATE_OK = { tap: 1, target: 1, color: 1 }; // تحديات لا يصح فيها الانتظار
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const fx = () => document.getElementById('fx');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let on = false, streak = 0, lastAct = 0, lastSay = 0, idleT = 0, px = innerWidth / 2, py = innerHeight / 2;
  document.addEventListener('pointerdown', (e) => { px = e.clientX; py = e.clientY; }, true);

  function say(kind, force) {
    const el = document.getElementById('say'); if (!el) return;
    const n = performance.now(); if (!force && n - lastSay < 2800) return;
    lastSay = n; el.textContent = pick(SAY[kind]);
    el.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.08)', offset: 0.15 }, { opacity: 1, transform: 'scale(1)', offset: 0.8 }, { opacity: 0, transform: 'scale(.9)' }], { duration: 1500, easing: 'ease-out' });
  }
  function spark(txt, color, size = 26) {
    const box = fx(); if (calm || !box || box.childElementCount > 26) return;
    const s = document.createElement('b'); s.className = 'spark'; s.textContent = txt;
    s.style.cssText = `left:${px}px;top:${py}px;color:${color};font-size:${size}px`;
    box.appendChild(s);
    const dx = (Math.random() - 0.5) * 70;
    s.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px),-190%) scale(1.25)`, opacity: 0 }], { duration: 520, easing: 'ease-out' }).onfinish = () => s.remove();
  }
  function move(kind) {
    const a = document.getElementById('myav'); if (!a || calm) return;
    a.animate(kind === 'hop'
      ? [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-9px) scale(1.12,.92)' }, { transform: 'translateY(0) scale(1)' }]
      : [{ transform: 'rotate(0)' }, { transform: 'rotate(-18deg)' }, { transform: 'rotate(16deg)' }, { transform: 'rotate(0)' }], { duration: kind === 'hop' ? 140 : 320 });
  }
  function flash(color) {
    const box = fx(); if (!box) return;
    const f = document.createElement('div'); f.className = 'flash'; f.style.background = color; box.appendChild(f);
    f.animate([{ opacity: 0.38 }, { opacity: 0 }], { duration: 320 }).onfinish = () => f.remove();
  }
  function banner(text) {
    const box = fx(); if (!box) return;
    const d = document.createElement('div'); d.className = 'gobanner'; d.textContent = text; box.appendChild(d);
    d.animate([{ transform: 'scale(.3) rotate(-8deg)', opacity: 0 }, { transform: 'scale(1.1) rotate(-3deg)', opacity: 1, offset: 0.3 }, { transform: 'scale(1) rotate(-3deg)', opacity: 1, offset: 0.7 }, { transform: 'scale(1.8) rotate(-3deg)', opacity: 0 }], { duration: 750, easing: 'ease-out' }).onfinish = () => d.remove();
  }
  function rain(emojis, n = 9) {
    const box = fx(); if (calm || !box) return;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('b'); s.className = 'drop'; s.textContent = pick(emojis); s.style.left = 5 + Math.random() * 90 + '%'; box.appendChild(s);
      s.animate([{ transform: 'translateY(-40px)', opacity: 0.9 }, { transform: 'translateY(70vh)', opacity: 0 }], { duration: 1300 + Math.random() * 700, delay: Math.random() * 500, easing: 'ease-in', fill: 'backwards' }).onfinish = () => s.remove();
    }
  }
  // ربط المؤثرات بأحداث التحديات عبر أصواتها، دون تعديل منطق أي تحدٍّ
  SFX.hook = (name) => {
    if (!on) return;
    lastAct = performance.now();
    if (name === 'tap') { move('hop'); spark('+1', '#FFC83D', 20); if (++streak % 30 === 0) say('good'); }
    else if (name === 'good') { move('hop'); spark(pick(['✨', '⭐', '👌', '💥']), '#2EE6C5'); if (++streak % 6 === 0) say('good'); }
    else if (name === 'bad' || name === 'boom') { streak = 0; move('shake'); flash('#FF2D55'); spark('✖', '#FF5468', 34); say('bad'); }
  };
  function liveOn(id) {
    liveOff(); on = true; streak = 0; lastAct = performance.now(); lastSay = 0;
    banner('انطلق!'); SFX.whistle();
    setTimeout(() => on && say('start', true), 500);
    if (LATE_OK[id]) idleT = setInterval(() => { if (performance.now() - lastAct > 2600) { say('late'); lastAct = performance.now() + 1500; } }, 600);
  }
  function liveOff() { on = false; clearInterval(idleT); idleT = 0; }

  function placeFor(code, round) { let h = 0; for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PLACES[(h + round * 5) % PLACES.length]; }
  function scene(place) {
    const el = document.getElementById('scene'); if (!el) return;
    const cls = place ? 'p-' + place.id : '';
    if (el.className === cls) return;
    el.className = cls; el.dataset.deco = place ? place.deco : '';
  }
  return { CHARS, PLACES, ICONS, char: (i) => CHARS[i] || CHARS[0], pick, phrase: (k) => pick(SAY[k]), say, rain, liveOn, liveOff, placeFor, scene };
})();
