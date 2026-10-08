/*
 * واجهات التحديات في العميل (Modular).
 * كل تحدٍّ: mount(el, cfg, api) → { on?(event, data), stop?() }
 * api: { send(data) → Promise<رد السيرفر>, players, meId, timeLeft() }
 * النتائج تُحسب في السيرفر؛ ما يُعرض هنا مجرد تغذية راجعة فورية.
 */
window.CHALLENGES = (() => {
  'use strict';
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  const press = (node, fn) => node.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(e); });
  const flash = (node, cls, ms = 120) => { node.classList.add(cls); setTimeout(() => node.classList.remove(cls), ms); };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const tap = {
    mount(root, cfg, api) {
      root.innerHTML = `<div class="bigscore">0</div><button class="pad" type="button">اضغط!</button><div class="race"></div>`;
      const score = root.querySelector('.bigscore'), pad = root.querySelector('.pad'), race = root.querySelector('.race');
      let n = 0, pending = 0, stopped = false;
      const flush = () => { if (pending) { api.send({ n: pending }); pending = 0; } };
      const iv = setInterval(flush, 150);
      press(pad, () => {
        if (stopped) return;
        n++; pending++; score.textContent = n;
        flash(pad, 'down', 60); SFX.tap(); SFX.buzz(8);
      });
      return {
        on(ev, counts) {
          if (ev !== 'prog') return;
          const max = Math.max(10, ...Object.values(counts));
          race.innerHTML = api.players.map((p) => `<div><span>${esc(p.name)}</span><div class="bar"><i style="width:${(100 * (counts[p.id] || 0)) / max}%;background:${p.id === api.meId ? 'var(--hot)' : 'var(--mint)'}"></i></div><b>${counts[p.id] || 0}</b></div>`).join('');
        },
        stop() { stopped = true; clearInterval(iv); flush(); },
      };
    },
  };

  const reaction = {
    mount(root, cfg, api) {
      root.innerHTML = `<p class="tip">انتظر…</p><button class="pad wait" type="button">انتظر</button>`;
      const pad = root.querySelector('.pad'), tip = root.querySelector('.tip');
      let done = false;
      press(pad, async () => {
        if (done) return;
        done = true; flash(pad, 'down', 80); SFX.buzz(15);
        const r = await api.send({});
        if (r.ms != null) { pad.textContent = r.ms; tip.textContent = 'مللي ثانية — زمن رد فعلك'; SFX.good(); }
        else { pad.className = 'pad bad shake'; pad.textContent = '✋'; tip.textContent = 'ضغطت قبل الإشارة!'; SFX.bad(); }
      });
      return { on(ev) { if (ev === 'go' && !done) { pad.className = 'pad go'; pad.textContent = 'اضغط!'; tip.textContent = 'الآن!'; SFX.go(); } }, stop() { done = true; } };
    },
  };

  const color = {
    mount(root, cfg, api) {
      const hex = Object.fromEntries(cfg.colors.map((c) => [c.id, c.hex])), name = Object.fromEntries(cfg.colors.map((c) => [c.id, c.name]));
      root.innerHTML = `<div class="bigscore">0</div><div class="word"></div><div class="colors"></div>`;
      const score = root.querySelector('.bigscore'), word = root.querySelector('.word'), box = root.querySelector('.colors');
      let i = 0, s = 0, last = 0, stopped = false;
      const show = () => {
        const q = cfg.seq[i]; if (!q) return;
        word.textContent = name[q.target]; word.style.color = hex[q.ink];
        box.innerHTML = q.options.map((c) => `<button type="button" data-c="${c}" style="background:${hex[c]}" aria-label="${name[c]}"></button>`).join('');
      };
      box.addEventListener('pointerdown', (e) => {
        const b = e.target.closest('button'); if (!b || stopped) return;
        e.preventDefault();
        const now = performance.now(); if (now - last < 130) return; last = now;
        const q = cfg.seq[i], ok = b.dataset.c === q.target;
        api.send({ i, c: b.dataset.c });
        s = ok ? s + 1 : Math.max(0, s - 1); score.textContent = s; i++;
        if (ok) SFX.good(); else { SFX.bad(); flash(word, 'shake', 250); }
        SFX.buzz(8); show();
      });
      show();
      return { stop() { stopped = true; } };
    },
  };

  const dontpress = {
    mount(root, cfg, api) {
      root.innerHTML = `<div class="bigscore">0</div><button class="pad wait" type="button"><span class="ico">…</span></button><p class="tip">اضغط عند كل إشارة، وتجنّب 💀</p>`;
      const score = root.querySelector('.bigscore'), pad = root.querySelector('.pad'), ico = root.querySelector('.ico');
      let cur = -1, timer, stopped = false;
      const idle = () => { cur = -1; pad.className = 'pad wait'; ico.textContent = '…'; };
      press(pad, async () => {
        if (stopped) return;
        flash(pad, 'down', 70); SFX.buzz(10);
        const i = cur; if (i >= 0) { clearTimeout(timer); idle(); }
        const r = await api.send({ i });
        if (r.score != null) score.textContent = r.score;
        if (r.bad || r.miss) { SFX.bad(); flash(pad, 'shake', 250); } else SFX.good();
      });
      return {
        on(ev, d) {
          if (ev !== 'sig' || stopped) return;
          cur = d.i; ico.textContent = d.icon; pad.className = 'pad ' + (d.bad ? 'bad' : 'go');
          clearTimeout(timer); timer = setTimeout(idle, cfg.ttl);
        },
        stop() { stopped = true; clearTimeout(timer); },
      };
    },
  };

  const bomb = {
    mount(root, cfg, api) {
      root.innerHTML = `<div class="bigscore">0</div><div class="bombs">${Array.from({ length: cfg.cells }, (_, c) => `<button type="button" data-c="${c}">?</button>`).join('')}</div><p class="tip">توقّف متى شئت. زر واحد مفخخ!</p>`;
      const score = root.querySelector('.bigscore'), grid = root.querySelector('.bombs'), tip = root.querySelector('.tip');
      let dead = false, busy = false, prev = 0;
      grid.addEventListener('pointerdown', async (e) => {
        const b = e.target.closest('button'); if (!b || dead || busy || b.classList.contains('safe')) return;
        e.preventDefault(); busy = true; SFX.buzz(10);
        const r = await api.send({ c: Number(b.dataset.c) });
        busy = false;
        if (r.boom) { dead = true; b.className = 'boom'; b.textContent = '💥'; grid.classList.add('dead', 'shake'); score.textContent = 0; tip.textContent = 'انفجر! خسرت نقاط هذه الجولة.'; SFX.boom(); SFX.buzz(200); }
        else if (r.safe) { b.className = 'safe'; b.textContent = '+' + (r.score - prev); prev = r.score; score.textContent = r.score; SFX.good(); }
      });
      return { stop() { dead = true; } };
    },
  };

  const target = {
    mount(root, cfg, api) {
      root.innerHTML = `<div class="bigscore">0</div><div class="arena"><button type="button" aria-label="الهدف"></button></div>`;
      const score = root.querySelector('.bigscore'), t = root.querySelector('.arena button');
      let n = 0, last = 0, stopped = false;
      const move = () => { t.style.left = 14 + Math.random() * 72 + '%'; t.style.top = 16 + Math.random() * 68 + '%'; };
      move();
      const iv = setInterval(move, cfg.moveMs);
      press(t, () => {
        const now = performance.now(); if (stopped || now - last < 190) return; last = now;
        n++; score.textContent = n; api.send({});
        SFX.good(); SFX.buzz(10);
        t.classList.add('hit'); move(); requestAnimationFrame(() => requestAnimationFrame(() => t.classList.remove('hit')));
      });
      return { stop() { stopped = true; clearInterval(iv); } };
    },
  };

  return { tap, reaction, color, dontpress, bomb, target };
})();
