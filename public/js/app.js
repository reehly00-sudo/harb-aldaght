// حرب الضغط — تطبيق العميل (Vanilla JS، بلا مكتبات)
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const app = $('#app'), sheet = $('#sheet'), toastEl = $('#toast'), fx = $('#fx');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} } };
  const num = (n) => Number(n || 0).toLocaleString('en-US');

  const S = { me: null, token: store.get('hp_token'), room: null, view: 'home', range: 'day', offset: 0, es: null,
    live: null, liveKey: '', roomKey: '', lastCount: 0, lbTimer: 0, profile: null,
    pending: (new URLSearchParams(location.search).get('room') || '').toUpperCase() };
  const now = () => Date.now() + S.offset;

  // ---------- الشبكة ----------
  async function api(path, body) {
    const r = await fetch('/api/' + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok) {
      if (r.status === 401 && path !== 'login' && S.me) logout();
      const e = new Error(j.error || 'تعذّر الاتصال. حاول مرة أخرى.'); e.data = j; e.status = r.status; throw e;
    }
    return j;
  }
  const tryApi = async (path, body) => { try { return await api(path, body); } catch (e) { toast(e.message); return null; } };
  const play = (data) => api('play', data).catch(() => ({}));

  function connect() {
    if (S.es) S.es.close();
    const es = S.es = new EventSource('/api/stream?t=' + encodeURIComponent(S.token));
    const on = (ev, fn) => es.addEventListener(ev, (e) => fn(JSON.parse(e.data)));
    on('me', (d) => { S.me = d; if (!S.room && S.view === 'home') render(); });
    on('state', (d) => { if (d) S.offset = d.now - Date.now(); const had = !!S.room; S.room = d; if (d || had) render(); });
    for (const ev of ['go', 'sig', 'prog']) on(ev, (d) => S.live?.on?.(ev, d));
    on('kicked', (d) => toast(d.ban ? 'المضيف منعك من هذه الغرفة.' : 'المضيف أخرجك من الغرفة.'));
    on('closed', () => toast('أُغلقت الغرفة.'));
    on('banned', () => { toast('تم إيقاف هذا الحساب.'); logout(); });
  }
  function logout() {
    S.es?.close(); S.es = null; stopLive();
    S.me = null; S.room = null; S.token = ''; store.set('hp_token', ''); S.view = 'home';
    if (sheet.open) sheet.close();
    render();
  }

  // ---------- عناصر مشتركة ----------
  const tier = (l) => (l >= 200 ? 't200' : l > 180 ? 't7' : l > 150 ? 't6' : l > 120 ? 't5' : l > 90 ? 't4' : l > 60 ? 't3' : l > 30 ? 't2' : 't1');
  const lv = (l) => `<span class="lv ${tier(l)}">${l >= 200 ? '👑 ' : ''}Lv ${l}</span>`;
  const who = (p, ownerId) => `<span class="nm ${tier(p.level)}">${esc(p.name)}</span>`
    + (p.founder ? '<span class="tag founder">👑 المؤسس</span>' : ownerId === p.id ? '<span class="tag host">👑 المضيف</span>' : '')
    + (p.badge ? `<span class="tag">${esc(p.badge)}</span>` : '');
  const medal = (r) => ['🥇', '🥈', '🥉'][r - 1] || r;
  let toastT;
  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 2800); }
  function confetti() {
    const cols = ['#FF3D6E', '#FFC83D', '#2EE6C5', '#A78BFA', '#fff'];
    const f = document.createDocumentFragment();
    for (let i = 0; i < 28; i++) { const p = document.createElement('i'); p.style.cssText = `left:${Math.random() * 100}%;background:${cols[i % 5]};animation-duration:${1.4 + Math.random() * 1.4}s;animation-delay:${Math.random() * 0.4}s`; f.appendChild(p); }
    fx.appendChild(f); setTimeout(() => fx.querySelectorAll('i').forEach((n) => n.remove()), 3400);
  }
  function levelUp(level) {
    const d = document.createElement('div'); d.className = 'levelup ' + tier(level);
    d.innerHTML = `<b>مستوى جديد!</b><span>${level}</span>`;
    fx.appendChild(d); SFX.level(); SFX.buzz(120); setTimeout(() => d.remove(), 2700);
  }
  function openSheet(html) { sheet.innerHTML = `<div class="col">${html}<button class="btn ghost" data-act="closeSheet" type="button">إغلاق</button></div>`; if (!sheet.open) sheet.showModal(); }
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });

  // ---------- العرض ----------
  function render() {
    clearInterval(S.lbTimer);
    if (!S.me) return viewLogin();
    if (S.room) return viewRoom();
    stopLive(); S.roomKey = '';
    ({ home: viewHome, board: viewBoard, profile: viewProfile }[S.view] || viewHome)();
  }
  const page = (cls, html) => { app.innerHTML = `<section class="view ${cls}">${html}</section>`; };

  function viewLogin(err = '', needKey = false) {
    const name = $('#name')?.value ?? store.get('hp_name');
    page('login', `
      <h1 class="title">🥁<span>حرب الضغط</span></h1>
      <p class="sub">جولات سريعة ومضحكة مع أصدقائك</p>
      <div class="spacer"></div>
      <input id="name" class="field" maxlength="16" autocomplete="username" autocapitalize="off" placeholder="اكتب اسم المستخدم" value="${esc(name)}" aria-label="اسم المستخدم">
      ${needKey ? '<input id="key" class="field" type="password" autocomplete="current-password" placeholder="مفتاح المؤسس" aria-label="مفتاح المؤسس">' : ''}
      <p class="err" role="alert">${esc(err)}</p>
      <button class="btn hot" data-act="login" type="button">دخول</button>
      <p class="note">احفظ اسم المستخدم لحفظ تقدمك ولفلك.</p>
      <div class="spacer"></div>`);
    $(needKey ? '#key' : '#name').addEventListener('keydown', (e) => { if (e.key === 'Enter') actions.login(); });
  }
  async function doLogin(body, silent) {
    try {
      const r = await api('login', body);
      if (r.needKey) return silent ? viewLogin() : viewLogin(r.error, true);
      S.token = r.token; S.me = r.me; store.set('hp_token', r.token); store.set('hp_name', r.me.name);
      connect(); render();
      if (S.pending) { const c = S.pending; S.pending = ''; history.replaceState(null, '', '/'); await tryApi('room/join', { code: c }); }
    } catch (e) {
      if (silent) { S.token = ''; store.set('hp_token', ''); return viewLogin(); }
      viewLogin(e.message, !!e.data?.needKey);
    }
  }

  function meCard(m) {
    const max = m.level >= 200, pct = max ? 100 : Math.round((100 * m.into) / m.need);
    return `<div class="card mecard ${tier(m.level)}">
      <div class="row">${who(m)}<span class="spacer"></span>${lv(m.level)}</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="xp"><span>${max ? 'MAX' : `XP ${num(m.into)} / ${num(m.need)}`}</span><span>${num(m.xp)} XP</span></div>
    </div>`;
  }
  function viewHome() {
    page('home', `
      <h1 class="title">🥁<span>حرب الضغط</span></h1>
      ${meCard(S.me)}
      <button class="btn hot" data-act="create" type="button">🎮 إنشاء غرفة</button>
      <button class="btn sun" data-act="joinSheet" type="button">🔑 دخول غرفة</button>
      <div class="grid2">
        <button class="btn" data-act="go" data-view="board" type="button">🏆 أفضل اللاعبين</button>
        <button class="btn" data-act="go" data-view="profile" type="button">👤 ملفي</button>
      </div>`);
  }

  // ----- الغرفة -----
  function viewRoom() {
    const r = S.room, ph = r.phase;
    const key = ph === 'intro' || ph === 'active' ? `${ph}:${r.round}` : [ph, r.round, r.ownerId, r.roundsTotal, r.players.map((p) => p.id + (p.online ? '' : 'x') + p.level + p.badge).join()].join(':');
    if (key === S.roomKey) return;
    const phaseChanged = S.roomKey.split(':')[0] !== ph || ph === 'intro' || ph === 'active' || ph === 'results';
    S.roomKey = key;
    if (ph !== 'active') stopLive();
    if (sheet.open && ph !== 'lobby' && ph !== 'final') sheet.close();
    ({ lobby: roomLobby, intro: roomIntro, active: roomActive, results: roomResults, final: roomFinal })[ph](r, phaseChanged);
  }
  const mine = (r) => r.ownerId === S.me.id;
  const plist = (r) => `<ul class="plist">${r.players.map((p) => `<li class="${p.id === S.me.id ? 'me' : ''} ${p.online ? '' : 'off'}"><span class="pw">${who(p, r.ownerId)}</span>${lv(p.level)}<button class="more" data-act="player" data-id="${p.id}" type="button" aria-label="خيارات ${esc(p.name)}">⋯</button></li>`).join('')}</ul>`;
  function roomLobby(r) {
    const owner = mine(r), enough = r.players.length >= r.min;
    page('room', `
      <div class="card codebox"><span class="note">كود الغرفة</span><strong>${esc(r.code)}</strong>
        <div class="grid2"><button class="btn" data-act="copy" type="button">نسخ الكود</button><button class="btn" data-act="share" type="button">مشاركة الرابط</button></div></div>
      <div class="rowlabel"><h2>اللاعبون</h2><span dir="ltr">${r.players.length} / ${r.max}</span></div>
      ${plist(r)}
      <div class="spacer"></div>
      ${owner || S.me.founder ? `<div class="rowlabel"><span>عدد الجولات</span></div><div class="seg">${[3, 5, 7].map((n) => `<button data-act="rounds" data-n="${n}" class="${r.roundsTotal === n ? 'on' : ''}" type="button">${n}</button>`).join('')}</div>` : ''}
      ${owner ? `<button class="btn hot" data-act="start" type="button" ${enough ? '' : 'disabled'}>ابدأ اللعبة</button>${enough ? '' : `<p class="note">تحتاج ${r.min} لاعبين على الأقل. شارك الكود مع أصدقائك.</p>`}`
        : `<p class="note">بانتظار المضيف لبدء اللعبة… (${r.roundsTotal} جولات)</p>`}
      <div class="grid2"><button class="btn ghost" data-act="leave" type="button">مغادرة الغرفة</button>${owner || S.me.founder ? '<button class="btn ghost danger" data-act="closeRoom" type="button">إغلاق الغرفة</button>' : '<span></span>'}</div>`);
  }
  function roomIntro(r) {
    S.lastCount = 0;
    page('intro', `<p class="rnd">الجولة ${r.round} من ${r.roundsTotal}</p><h2>${esc(r.challenge.name)}</h2><p class="sub">${esc(r.challenge.hint)}</p><div class="count" id="count"></div>`);
    tick();
  }
  function roomActive(r) {
    const c = r.challenge, key = 'r' + r.round;
    if (S.liveKey === key) return;
    stopLive(); S.liveKey = key;
    page('play', `<div class="hud"><small>الجولة ${r.round} من ${r.roundsTotal}</small><b id="secs"></b><span>${esc(c.name)}</span><div class="bar"><i id="tbar"></i></div></div><div class="stage" id="stage"></div>`);
    const mod = window.CHALLENGES[c.id];
    if (!mod) { $('#stage').innerHTML = '<p class="tip">هذا التحدي غير مدعوم في نسختك. حدّث الصفحة.</p>'; return; }
    S.live = mod.mount($('#stage'), c.cfg, { send: play, players: r.players, meId: S.me.id, timeLeft: () => c.endAt - now() }) || {};
    S.live.endAt = c.endAt;
    tick();
  }
  function stopLive() { if (S.live) { try { S.live.stop?.(); } catch {} } S.live = null; S.liveKey = ''; }
  function roomResults(r) {
    const res = r.results, meRow = res.rows.find((x) => x.id === S.me.id);
    page('results', `<p class="rnd center" style="color:var(--sun);font-weight:700">الجولة ${r.round} من ${r.roundsTotal}</p><h2 class="center">${esc(res.challenge.name)}</h2>
      <ul class="rows">${res.rows.map((x) => `<li class="${x.id === S.me.id ? 'me' : ''} ${x.rank === 1 && x.points ? 'first' : ''}"><span class="medal">${x.points ? medal(x.rank) : '—'}</span>
        <span class="who"><span>${who(x)}</span><small>${esc(x.label)}</small></span><span class="sp"></span><span class="pts">+${x.points}</span></li>`).join('')}</ul>
      <p class="note">${res.last ? 'النتيجة النهائية بعد لحظات…' : 'الجولة التالية بعد لحظات…'}</p>`);
    if (meRow) { if (meRow.rank === 1 && meRow.points) { SFX.win(); SFX.buzz(60); } else if (!meRow.points) SFX.lose(); else SFX.good(); }
  }
  function roomFinal(r, fresh) {
    const f = r.final, top = f[0], meRow = f.find((x) => x.id === S.me.id), owner = mine(r);
    const titles = ['🏆 المركز الأول', '🥈 المركز الثاني', '🥉 المركز الثالث'];
    page('final', `
      <div class="champ"><div class="cup">🏆</div><span class="note">المركز الأول</span><span class="nm ${tier(top.level)}">${esc(top.name)}</span></div>
      <ul class="rows">${f.map((x) => `<li class="${x.id === S.me.id ? 'me' : ''} ${x.place === 1 ? 'first' : ''}"><span class="medal">${medal(x.place)}</span>
        <span class="who"><span>${who(x)} ${lv(x.level)}</span><small>${titles[x.place - 1] || 'المركز ' + x.place}</small></span><span class="sp"></span>
        <span class="pts">${num(x.total)}<small>+${x.xp} XP</small></span></li>`).join('')}</ul>
      <div class="spacer"></div>
      ${owner ? '<button class="btn hot" data-act="start" type="button">العب مباراة جديدة</button><button class="btn" data-act="lobby" type="button">العودة لقائمة اللاعبين</button>' : '<p class="note">بانتظار المضيف لبدء مباراة جديدة…</p>'}
      <button class="btn ghost" data-act="leave" type="button">مغادرة الغرفة</button>`);
    if (!fresh || !meRow) return;
    if (meRow.place === 1) { confetti(); SFX.win(); SFX.buzz(150); } else SFX.lose();
    if (meRow.level > meRow.levelBefore) setTimeout(() => levelUp(meRow.level), 900);
  }
  // مؤقت العدّ التنازلي وشريط الوقت
  function tick() {
    const r = S.room; if (!r || !r.challenge) return;
    const c = r.challenge;
    if (r.phase === 'intro') {
      const el = $('#count'); if (!el) return;
      const n = Math.max(1, Math.min(3, Math.ceil((c.startAt - now()) / 1000)));
      if (n !== S.lastCount) { S.lastCount = n; el.textContent = n; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); SFX.tick(); }
    } else if (r.phase === 'active') {
      const left = Math.max(0, c.endAt - now()), s = $('#secs'), b = $('#tbar'); if (!s) return;
      s.textContent = Math.ceil(left / 1000); b.style.width = (100 * left) / c.duration + '%';
      if (left <= 0 && S.live) { try { S.live.stop?.(); } catch {} }
    } else return;
    setTimeout(tick, 100);
  }

  // ----- أفضل اللاعبين -----
  async function viewBoard() {
    const tabs = [['day', 'اليوم'], ['week', 'الأسبوع'], ['all', 'الأفضل دائمًا']];
    page('board', `<button class="back" data-act="go" data-view="home" type="button">→ الرئيسية</button><h2>🏆 أفضل اللاعبين</h2>
      <div class="seg">${tabs.map(([k, t]) => `<button data-act="range" data-r="${k}" class="${S.range === k ? 'on' : ''}" type="button">${t}</button>`).join('')}</div><div id="lb"><p class="empty">جارٍ التحميل…</p></div>`);
    const load = async () => {
      const range = S.range; let d;
      try { d = await api('leaderboard?range=' + range); } catch (e) { const box = $('#lb'); if (box) box.innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
      const box = $('#lb'); if (!box || S.view !== 'board' || S.range !== range) return;
      box.innerHTML = d.rows.length ? `<ul class="lb">${d.rows.map((x, i) => `<li class="${x.id === S.me.id ? 'me' : ''}" data-act="profileOf" data-name="${esc(x.name)}">
        <span class="rk">${medal(i + 1)}</span><span class="who">${who(x)}</span>${lv(x.level)}
        <div class="stats"><span><b>${num(x.points)}</b>نقاط</span><span><b>${num(x.wins)}</b>فوز</span><span><b>${num(x.games)}</b>مباريات</span><span><b>+${num(x.xp)}</b>XP</span></div></li>`).join('')}</ul>`
        : '<p class="empty">لا توجد مباريات في هذه الفترة بعد. أنشئ غرفة وكن أول المتصدرين.</p>';
    };
    S.loadBoard = load; await load();
    clearInterval(S.lbTimer); S.lbTimer = setInterval(() => { if (S.view === 'board' && !S.room && !document.hidden) load(); }, 15000);
  }

  // ----- الملف -----
  const profileHtml = (p) => {
    const max = p.level >= 200, pct = max ? 100 : Math.round((100 * p.into) / p.need), rate = p.games ? Math.round((100 * p.wins) / p.games) : 0;
    return `<div class="phead ${tier(p.level)}"><span class="nm ${tier(p.level)}">${esc(p.name)}</span>
        <div>${p.founder ? '<span class="tag founder">👑 المؤسس</span> ' : ''}${p.badge ? `<span class="tag">${esc(p.badge)}</span>` : ''}</div>${lv(p.level)}</div>
      <div class="${tier(p.level)}"><div class="bar"><i style="width:${pct}%"></i></div><p class="note" dir="ltr">${max ? 'MAX LEVEL' : `XP ${num(p.into)} / ${num(p.need)}`}</p></div>
      <div class="stats4"><div><b>${num(p.games)}</b>🎮 مباراة</div><div><b>${num(p.wins)}</b>🏆 فوز</div><div><b>${rate}%</b>📈 نسبة الفوز</div><div><b>${num(p.best)}</b>⭐ أفضل نتيجة</div>
        <div><b>${p.rank ? '#' + p.rank : '—'}</b>الترتيب الحالي</div><div><b>${num(p.firstPlaces)}</b>🥇 صدارة جولات</div></div>`;
  };
  async function viewProfile() {
    page('profile', `<button class="back" data-act="go" data-view="home" type="button">→ الرئيسية</button><div id="pf"><p class="empty">جارٍ التحميل…</p></div>`);
    const d = await tryApi('profile?name=' + encodeURIComponent(S.me.name));
    const box = $('#pf'); if (d && box) { box.className = 'view'; box.innerHTML = profileHtml(d.profile); }
  }
  // بطاقة لاعب (داخل الغرفة أو من الصدارة) + أدوات المضيف / المؤسس عند توفر الصلاحية
  async function playerSheet(name, id) {
    const d = await tryApi('profile?name=' + encodeURIComponent(name)); if (!d) return;
    const p = d.profile, r = S.room, self = p.id === S.me.id;
    const inRoom = r && r.players.some((x) => x.id === p.id);
    const boss = r && (mine(r) || S.me.founder);
    let tools = '';
    if (inRoom && boss && !self && !p.founder) tools += `<div class="grid2"><button class="btn danger" data-act="kick" data-id="${p.id}" type="button">طرد</button><button class="btn danger" data-act="ban" data-id="${p.id}" type="button">منع من الغرفة</button></div>`;
    if (S.me.founder && !p.founder) tools += `
      <div class="inline"><input class="field" id="fLevel" type="number" min="1" max="200" inputmode="numeric" placeholder="المستوى (1–200)" aria-label="المستوى"><button class="btn" data-act="fLevel" data-id="${p.id}" type="button">تغيير المستوى</button></div>
      <div class="inline"><input class="field" id="fBadge" maxlength="14" placeholder="شارة خاصة" value="${esc(p.badge)}" aria-label="الشارة"><button class="btn" data-act="fBadge" data-id="${p.id}" type="button">حفظ الشارة</button></div>
      <button class="btn danger" data-act="fBan" data-id="${p.id}" data-v="${p.banned ? 0 : 1}" type="button">${p.banned ? 'إلغاء إيقاف الحساب' : 'إيقاف الحساب'}</button>`;
    S.sheetName = p.name;
    openSheet(profileHtml(p) + tools);
  }
  function settingsSheet() {
    const sw = (k, label) => `<button class="switch" data-act="toggle" data-k="${k}" aria-pressed="${SFX[k]}" type="button"><span>${label}</span><i></i></button>`;
    openSheet(`<h3>الإعدادات</h3>${sw('sound', 'الأصوات')}${sw('vibe', 'الاهتزاز')}${S.me ? `<p class="note">دخلت باسم <b>${esc(S.me.name)}</b></p><button class="btn danger" data-act="logout" type="button">تسجيل الخروج</button>` : ''}`);
  }

  // ---------- الأفعال ----------
  const roomAct = (type, extra) => tryApi('room/act', { type, ...extra });
  const founder = async (type, target, value) => { if (await tryApi('founder', { type, target, value })) { toast('تم الحفظ.'); if (S.sheetName) playerSheet(S.sheetName); S.loadBoard?.(); } };
  const actions = {
    login() { const name = $('#name').value, key = $('#key')?.value; doLogin({ name, key }); },
    logout() { api('room/leave', {}).catch(() => {}).finally(logout); },
    go(b) { S.view = b.dataset.view; render(); },
    settings: settingsSheet,
    closeSheet() { sheet.close(); },
    toggle(b) { const k = b.dataset.k; SFX[k] = !SFX[k]; b.setAttribute('aria-pressed', SFX[k]); if (SFX[k]) { k === 'sound' ? SFX.good() : SFX.buzz(30); } },
    create() { tryApi('room/create', {}); },
    joinSheet() {
      openSheet(`<h3>🔑 دخول غرفة</h3><input id="code" class="field" maxlength="5" autocapitalize="characters" autocomplete="off" placeholder="كود الغرفة" dir="ltr" aria-label="كود الغرفة"><button class="btn sun" data-act="join" type="button">دخول الغرفة</button>`);
      const i = $('#code'); i.focus(); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') actions.join(); });
    },
    async join() { const code = $('#code').value.trim(); if (!code) return toast('اكتب كود الغرفة.'); if (await tryApi('room/join', { code })) sheet.close(); },
    leave() { tryApi('room/leave', {}); },
    start() { roomAct('start'); },
    lobby() { roomAct('lobby'); },
    rounds(b) { roomAct('rounds', { value: Number(b.dataset.n) }); },
    closeRoom() { if (confirm('إغلاق الغرفة وإخراج جميع اللاعبين؟')) roomAct('close'); },
    async copy() { try { await navigator.clipboard.writeText(S.room.code); toast('نُسخ الكود.'); } catch { toast('الكود: ' + S.room.code); } },
    async share() {
      const url = `${location.origin}/?room=${S.room.code}`, text = `ادخل غرفتي في حرب الضغط 🥁 الكود: ${S.room.code}`;
      try { if (navigator.share) await navigator.share({ title: 'حرب الضغط', text, url }); else { await navigator.clipboard.writeText(url); toast('نُسخ رابط الغرفة.'); } } catch {}
    },
    player(b) { const p = S.room?.players.find((x) => x.id === Number(b.dataset.id)); if (p) playerSheet(p.name); },
    profileOf(b) { playerSheet(b.dataset.name); },
    async kick(b) { if (await roomAct('kick', { target: Number(b.dataset.id) })) sheet.close(); },
    async ban(b) { if (await roomAct('ban', { target: Number(b.dataset.id) })) sheet.close(); },
    range(b) { S.range = b.dataset.r; viewBoard(); },
    fLevel(b) { const v = Number($('#fLevel').value); if (!(v >= 1 && v <= 200)) return toast('اكتب مستوى بين 1 و 200.'); founder('level', Number(b.dataset.id), v); },
    fBadge(b) { founder('badge', Number(b.dataset.id), $('#fBadge').value); },
    fBan(b) { founder('ban', Number(b.dataset.id), b.dataset.v === '1'); },
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const fn = actions[b.dataset.act]; if (fn) fn(b);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.me && S.es && S.es.readyState === 2) connect(); });

  // ---------- الإقلاع ----------
  const savedName = store.get('hp_name');
  if (S.token && savedName) doLogin({ name: savedName, token: S.token }, true); else render();
})();
