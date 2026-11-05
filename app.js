/* 컨택싱어 웹앱 — 공통 스크립트
   각 화면은 <body data-page="..."> 값으로 아래 PAGES 중 하나가 실행된다.
   시안이라 서버가 없다: 화면 상태와 등록 내용은 이 브라우저(localStorage)에만 저장된다. */
(function () {
  'use strict';
  var D = window.CSM || { shows: [] };
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- 날짜 (한국 시간 기준) ---------- */
  function kstToday() { return new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10); }
  var TODAY = kstToday();
  function toDate(s) { var p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function addDays(s, n) { var d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function wd(s) { return WD[toDate(s).getUTCDay()]; }
  function md(s) { var p = s.split('-'); return (+p[1]) + '.' + (+p[2]); }
  function rel(s) { return s === TODAY ? '오늘' : (s === addDays(TODAY, 1) ? '내일' : wd(s)); }
  function dayLabel(s) { return md(s) + ' (' + wd(s) + ')'; }
  function won(n) { return Number(n || 0).toLocaleString('ko-KR'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------- 저장 (이 브라우저에만) ---------- */
  var store = {
    get: function (k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가: 새로고침 전까지만 유지 */ } }
  };
  var STATE_KEY = 'csm-state', INBOX_KEY = 'contactsinger-inbox', BOOK_KEY = 'csm-bookings';
  var S = store.get(STATE_KEY, {}) || {};
  function st(k, def) { return S[k] != null ? S[k] : def; }
  function put(k, v) { S[k] = v; store.set(STATE_KEY, S); }
  function inboxAdd(kind, item) {
    var ib = store.get(INBOX_KEY, null) || {};
    (ib[kind] = ib[kind] || []).push(item);
    store.set(INBOX_KEY, ib);
  }

  /* ---------- 공연 일정 ---------- */
  function scheduleDates(from, n) {
    var ds = [];
    D.shows.forEach(function (s) { if (s.d >= from && ds.indexOf(s.d) < 0) ds.push(s.d); });
    ds.sort();
    return ds.slice(0, n);
  }
  function showsOn(d) { return D.shows.filter(function (s) { return s.d === d; }); }
  function isRental(d) { var l = showsOn(d); return l.length > 0 && l.every(function (s) { return s.type === 'rental'; }); }
  function nextShow() {
    var l = D.shows.filter(function (s) { return s.d >= TODAY && s.type !== 'rental'; });
    l.sort(function (a, b) { return (a.d + a.t) < (b.d + b.t) ? -1 : 1; });
    return l[0] || null;
  }
  function who(s) { return s.a || '출연자 미정'; }
  function bookHref(s) { return 'booking.html?d=' + s.d + '&t=' + encodeURIComponent(s.t); }

  /* ---------- 팬 등급 ---------- */
  var VISIT = [[1, '첫 직관'], [5, '단골'], [15, '찐단골'], [30, '개근']];
  var TIPG = [[1000, '서포터'], [30000, '후원자'], [100000, '큰손']];
  function grade(list, v) {
    var cur = null, next = null;
    for (var i = 0; i < list.length; i++) { if (v >= list[i][0]) cur = list[i]; else { next = list[i]; break; } }
    return { name: cur ? cur[1] : '아직 없음', next: next };
  }
  function fan() { return { visits: st('visits', 9), tip: st('tip', 58000) }; }
  function perks(v, t) {
    var mid = '직관 찐단골(15회) 또는 큰손(누적 10만원)';
    return [
      { t: '공연 후 사진 · 짧은 인사', c: '직관 단골(5회) 또는 후원자(누적 3만원)', open: v >= 5 || t >= 30000 },
      { t: '사인', c: mid, open: v >= 15 || t >= 100000 },
      { t: '신청곡 우선권', c: mid, open: v >= 15 || t >= 100000 },
      { t: '앞자리 예약', c: '직관 개근(30회) 또는 팬회장(후원 1위)', open: v >= 30 }
    ];
  }
  function bindFan() {
    var f = fan(), vg = grade(VISIT, f.visits), tg = grade(TIPG, f.tip);
    var vNext = vg.next ? vg.next[0] : f.visits, tNext = tg.next ? tg.next[0] : f.tip;
    var map = {
      'visit-name': vg.name, 'visit-count': f.visits + '회',
      'visit-badge': '직관 · ' + vg.name + ' ' + f.visits + '회',
      'visit-short': '직관 · ' + vg.name,
      'visit-progress': vg.next ? f.visits + ' / ' + vNext + '회' : f.visits + '회',
      'visit-hint': vg.next ? vg.next[1] + '까지 직관 ' + (vNext - f.visits) + '회 · 예약하고 방문하면 쌓여요' : '최고 직관 등급이에요',
      'tip-name': tg.name, 'tip-badge': '후원 · ' + tg.name,
      'tip-progress': tg.next ? won(f.tip) + ' / ' + won(tNext) : won(f.tip) + '원',
      'tip-hint': tg.next ? tg.next[1] + '까지 ' + won(tNext - f.tip) + '원 · 현장 팁으로 쌓여요' : '최고 후원 등급이에요 · 후원 1위가 되면 팬회장'
    };
    var ps = perks(f.visits, f.tip), opened = ps.filter(function (p) { return p.open; }), locked = ps.filter(function (p) { return !p.open; })[0];
    var line = opened.length ? opened.map(function (p) { return p.t.replace(' · 짧은 인사', ' · 인사'); }).join(', ') + ' 혜택 열림' : '아직 열린 혜택이 없어요';
    if (locked && vg.next) line += ' · ' + locked.t.split(' ')[0] + '까지 직관 ' + Math.max(0, (locked.t === '앞자리 예약' ? 30 : 15) - f.visits) + '회';
    map['perk-line'] = line;
    Object.keys(map).forEach(function (k) { $$('[data-bind="' + k + '"]').forEach(function (el) { el.textContent = map[k]; }); });
    $$('[data-bar="visit"]').forEach(function (el) { el.style.width = Math.min(100, Math.round(f.visits / vNext * 100)) + '%'; });
    $$('[data-bar="tip"]').forEach(function (el) { el.style.width = Math.min(100, Math.round(f.tip / tNext * 100)) + '%'; });
    return { f: f, vg: vg, tg: tg };
  }

  /* ---------- 공통 UI ---------- */
  var ICON = {
    check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    lock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    chev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9.5 5.5 6.5 6.5-6.5 6.5"/></svg>'
  };
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  var lastFocus = null;
  function openSheet(id) {
    var bg = document.getElementById(id); if (!bg) return;
    lastFocus = document.activeElement; bg.hidden = false; document.body.style.overflow = 'hidden';
    var head = bg.querySelector('h2'); if (head) { head.setAttribute('tabindex', '-1'); head.focus(); }
  }
  function closeSheet(bg) {
    if (!bg) return; bg.hidden = true; document.body.style.overflow = '';
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  document.addEventListener('click', function (e) {
    var c = e.target.closest('[data-close]'); if (c) { closeSheet(c.closest('.sheet-bg')); return; }
    if (e.target.classList && e.target.classList.contains('sheet-bg')) closeSheet(e.target);
    var o = e.target.closest('[data-open]'); if (o) { e.preventDefault(); openSheet(o.getAttribute('data-open')); return; }
    var tt = e.target.closest('[data-toast]'); if (tt) toast(tt.getAttribute('data-toast'));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { var open = $$('.sheet-bg').filter(function (b) { return !b.hidden; })[0]; if (open) closeSheet(open); }
  });
  // 뒤로: 같은 사이트에서 왔으면 이전 화면으로, 아니면 링크 주소로
  $$('a[data-back]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      try { if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) { e.preventDefault(); history.back(); } } catch (x) { /* 링크로 이동 */ }
    });
  });
  // 하나만 고르는 버튼 묶음
  function single(root, cb) {
    if (!root) return;
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button[aria-pressed]'); if (!b || !root.contains(b) || b.disabled) return;
      $$('button[aria-pressed]', root).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      if (cb) cb(b);
    });
  }
  // 여러 개 고르는 버튼 묶음
  function multi(root, cb) {
    if (!root) return;
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button[aria-pressed]'); if (!b || !root.contains(b)) return;
      b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      if (cb) cb(b);
    });
  }
  function picked(root) { return $$('button[aria-pressed="true"]', root).map(function (b) { return b.getAttribute('data-v') || b.textContent.trim(); }); }
  function share(title) {
    var url = location.href.split('#')[0];
    if (navigator.share) { navigator.share({ title: title, url: url }).catch(function () { /* 취소 */ }); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast('링크를 복사했어요'); }, function () { toast(url); });
    else toast(url);
  }
  function likeBtn(btn, key, base) {
    if (!btn) return;
    var liked = !!(st('liked', {})[key]);
    function draw() { btn.setAttribute('aria-pressed', liked ? 'true' : 'false'); var n = $('[data-count]', btn); if (n) n.textContent = won(base + (liked ? 1 : 0)); }
    btn.addEventListener('click', function () { liked = !liked; var l = st('liked', {}); l[key] = liked; put('liked', l); draw(); });
    draw();
  }
  function followBtn(btn) {
    if (!btn) return;
    function draw() { var on = !!st('following', false); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); btn.textContent = on ? '팔로잉' : '팔로우'; btn.classList.toggle('light', !on); btn.classList.toggle('ghost', on); }
    btn.addEventListener('click', function () { put('following', !st('following', false)); draw(); toast(st('following') ? '새벽오렌지를 팔로우했어요' : '팔로우를 취소했어요'); });
    draw();
  }

  /* ---------- 공연 현황판 (홈) ---------- */
  function chipHtml(d, on) {
    return '<button type="button" class="dchip' + (isRental(d) ? ' empty-day' : '') + '" aria-pressed="' + on + '" data-d="' + d + '" aria-label="' + dayLabel(d) + '"><small>' + rel(d) + '</small><b>' + md(d) + '</b></button>';
  }
  function rowsHtml(d) {
    var l = showsOn(d);
    if (!l.length) return '<li class="empty">이날은 공연이 없어요</li>';
    return l.map(function (s) {
      if (s.type === 'rental') return '<li class="empty">대관일이라 일반 공연이 없어요</li>';
      return '<li class="show"><span class="tm"><b>' + esc(s.t) + '</b><small>' + esc(s.p || '') + '</small></span>' +
        '<span class="in"><b>' + esc(who(s)) + '</b><small>행2PM8PM · 을지로 · 무료 라이브</small></span>' +
        '<a class="btn sm go" href="' + bookHref(s) + '" aria-label="' + esc(dayLabel(s.d) + ' ' + s.t + ' ' + who(s)) + ' 예약">예약</a></li>';
    }).join('');
  }
  function board(root) {
    if (!root) return;
    var chips = $('.dates', root), list = $('.shows', root), dates = scheduleDates(TODAY, 7);
    if (!dates.length) { chips.innerHTML = ''; list.innerHTML = '<li class="empty">다음 공연 일정이 곧 올라와요</li>'; return; }
    var cur = dates[0];
    function draw(focus) {
      chips.innerHTML = dates.map(function (d) { return chipHtml(d, d === cur); }).join('');
      list.innerHTML = rowsHtml(cur);
      if (focus) { var b = $('[data-d="' + cur + '"]', chips); if (b) b.focus(); }
    }
    chips.addEventListener('click', function (e) { var b = e.target.closest('.dchip'); if (!b) return; cur = b.getAttribute('data-d'); draw(true); });
    draw(false);
  }

  /* ---------- 화면별 ---------- */
  var PAGES = {};

  PAGES.home = function () {
    var ROLES = ['fan', 'venue', 'artist'];
    var LABEL = { fan: '손님', venue: '라이브바 사장님', artist: '가수' };
    var q = new URLSearchParams(location.search).get('role');
    var role = ROLES.indexOf(q) >= 0 ? q : st('role', '');
    if (ROLES.indexOf(role) < 0) role = '';
    function profile(r) { return st('profile-' + r, null); }
    function greet() {
      ROLES.forEach(function (r) {
        var el = $('[data-greet="' + r + '"]'); if (!el) return;
        var p = profile(r);
        if (!p) { el.textContent = LABEL[r] + ' 정보를 입력하면 맞춤 화면이 열려요'; return; }
        el.textContent = r === 'venue' ? p.venue + ' · ' + p.owner + ' 사장님, 반가워요' : p.name + '님, 반가워요';
        var btn = $('[data-edit="' + r + '"]'); if (btn) btn.textContent = '정보 수정';
      });
    }
    function setRole(r, ask) {
      role = r;
      $$('[data-role]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-role') === r ? 'true' : 'false'); });
      var view = r || 'fan';
      $$('[data-for-role]').forEach(function (s) { s.hidden = s.getAttribute('data-for-role') !== view; });
      if (r) put('role', r);
      if (ask && r && !profile(r)) openSheet('form-' + r);
    }
    $$('[data-role]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = b.getAttribute('data-role');
        setRole(r, true);
        if (profile(r)) { var v = document.getElementById('view-' + r); if (v) v.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      });
    });
    $$('[data-edit]').forEach(function (b) { b.addEventListener('click', function () { openSheet('form-' + b.getAttribute('data-edit')); }); });

    function setupForm(r, req, agreeId, fill, collect, inbox) {
      var wrap = document.getElementById('form-' + r); if (!wrap) return;
      var form = $('form', wrap);
      $$('[role="group"]', form).forEach(function (g) { var isMulti = /여러 개/.test(g.textContent.slice(0, 40)); (isMulti ? multi : single)(g); });
      var p = profile(r);
      if (p) Object.keys(fill).forEach(function (id) { var el = document.getElementById(id); if (el && p[fill[id]] != null) el.value = p[fill[id]]; });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!requireFields(form, req)) return;
        if (!agreeOk(agreeId)) return;
        var data = collect(); data.at = TODAY;
        put('profile-' + r, data);
        if (inbox) inboxAdd(inbox[0], inbox[1](data));
        closeSheet(wrap); greet(); setRole(r, false);
        toast(r === 'venue' ? data.venue + ' 등록을 시작했어요' : '반가워요, ' + data.name + '님!');
        var v = document.getElementById('view-' + r); if (v) setTimeout(function () { v.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
      });
    }
    setupForm('fan', ['pf-name'], 'pf-agree', { 'pf-name': 'name', 'pf-phone': 'phone' }, function () {
      return { name: val('pf-name'), phone: val('pf-phone'), genres: picked($('#pf-genres')), area: picked($('#pf-area'))[0] || '' };
    });
    setupForm('venue', ['pv-venue', 'pv-owner', 'pv-phone'], 'pv-agree', { 'pv-venue': 'venue', 'pv-owner': 'owner', 'pv-phone': 'phone', 'pv-area': 'area' }, function () {
      return { venue: val('pv-venue'), owner: val('pv-owner'), phone: val('pv-phone'), area: val('pv-area'), styles: picked($('#pv-styles')), days: picked($('#pv-days')) };
    }, ['venues', function (d) {
      return { name: d.venue, owner: d.owner, category: '라이브바', address: d.area, biz: '', cert: false, phone: d.phone, capacity: '', days: d.days, hours: '',
               styles: d.styles, equipment: [], photos: 0, created: TODAY, status: 'pending' };
    }]);
    setupForm('artist', ['pa-name', 'pa-phone'], 'pa-agree', { 'pa-name': 'name', 'pa-phone': 'phone', 'pa-link': 'link' }, function () {
      return { name: val('pa-name'), phone: val('pa-phone'), lineup: picked($('#pa-lineup'))[0] || '', genres: picked($('#pa-genres')), link: val('pa-link') };
    }, ['artists', function (d) {
      return { name: d.name, lineup: d.lineup, genres: d.genres, age: '', region: '', phone: d.phone, bio: '', careers: [],
               tracks: d.link ? [['대표 링크', d.link]] : [], video: '', created: TODAY, status: 'pending' };
    }]);
    greet();
    setRole(role, false);
    bindReq(document, true);
    var vw = $('#v-week'); if (vw) vw.innerHTML = weekHtml();

    // 배너: 넘길 때 몇 번째인지 표시
    var track = $('#bnr'), idx = $('#bnr-i');
    if (track && idx) track.addEventListener('scroll', function () {
      var w = track.firstElementChild ? track.firstElementChild.getBoundingClientRect().width + 10 : 1;
      idx.textContent = Math.min(track.children.length, Math.round(track.scrollLeft / w) + 1);
    }, { passive: true });
    // 검색: 가수 이름으로 다음 공연 찾기
    var form = $('#search');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = $('#q').value.trim().replace(/\s+/g, '').toLowerCase(); if (!q) return;
      var hit = D.shows.filter(function (s) { return s.d >= TODAY && s.a && s.a.replace(/\s+/g, '').toLowerCase().indexOf(q) >= 0; })
        .sort(function (x, y) { return (x.d + x.t) < (y.d + y.t) ? -1 : 1; })[0];
      if (hit) location.href = 'schedule.html#d-' + hit.d;
      else toast('‘' + $('#q').value.trim() + '’ 님의 다가오는 공연을 찾지 못했어요');
    });
    board($('#board'));
    bindFan();
    // 내 예약
    var mine = (store.get(BOOK_KEY, []) || []).filter(function (b) { return b.d >= TODAY; });
    var box = $('#my-bookings');
    if (box && mine.length) {
      box.hidden = false;
      $('ul', box).innerHTML = mine.slice(0, 3).map(function (b) {
        return '<li><span class="t"><b>' + esc(dayLabel(b.d) + ' ' + b.t + ' · ' + b.a) + '</b><span>행2PM8PM · ' + b.ppl + '명 · 방문하면 직관 인증</span></span><span class="pill yes">예약됨</span></li>';
      }).join('');
    }
    // 알림
    var nl = $('#noti-list');
    if (nl) {
      var ns = nextShow(), items = [];
      if (ns) items.push(['<b>' + (ns.d === TODAY ? '오늘 ' : dayLabel(ns.d) + ' ') + esc(ns.t) + ' ' + esc(who(ns)) + '</b> 공연이 열려요', '행2PM8PM · 을지로 · 무료 라이브', bookHref(ns)]);
      items.push(['<b>새벽오렌지</b>가 새 공연 클립을 올렸어요', '행2PM8PM 루프탑 · 0:26', 'clip.html']);
      items.push(['<b>공연 후 사진 · 인사</b> 혜택이 열려 있어요', '직관 단골 · 후원자 등급 혜택', 'artist.html']);
      nl.innerHTML = items.map(function (it) { return '<li><a class="row" href="' + it[2] + '" style="color:var(--fg);text-decoration:none;flex:1;min-height:44px"><span class="t"><span style="font-size:14px">' + it[0] + '</span><span>' + it[1] + '</span></span>' + ICON.chev + '</a></li>'; }).join('');
    }
  };

  PAGES.clip = function () {
    var v = $('#clip-video'), sb = $('#sound');
    if (v && sb) sb.addEventListener('click', function () {
      v.muted = !v.muted; if (!v.muted) v.play().catch(function () { /* 자동재생 제한 */ });
      sb.setAttribute('aria-pressed', v.muted ? 'false' : 'true'); sb.setAttribute('aria-label', v.muted ? '소리 켜기' : '소리 끄기');
      $('.ic-mute', sb).hidden = !v.muted; $('.ic-sound', sb).hidden = v.muted;
    });
    likeBtn($('#like'), 'clip', 1024);
    followBtn($('#follow'));
    var sh = $('#share'); if (sh) sh.addEventListener('click', function () { share('컨택싱어 공연 클립'); });
    var ns = nextShow(), box = $('#tonight');
    if (box && ns) {
      $('[data-k="head"]', box).textContent = ns.d === TODAY ? '이 무대, 오늘 밤에도 열려요' : '이 무대의 다음 공연 · ' + dayLabel(ns.d);
      $('[data-k="line"]', box).textContent = '행2PM8PM · ' + ns.t + ' ' + who(ns);
      $('a', box).setAttribute('href', bookHref(ns));
    }
  };

  PAGES.booking = function () {
    var q = new URLSearchParams(location.search), qd = q.get('d'), qt = q.get('t');
    var dates = scheduleDates(TODAY, 7);
    if (qd && qd >= TODAY && dates.indexOf(qd) < 0 && showsOn(qd).length) dates = scheduleDates(qd, 7);
    var f = fan(), vg = grade(VISIT, f.visits);
    var mode = 'watch', day = (qd && dates.indexOf(qd) >= 0) ? qd : dates[0], si = 0, ppl = 2;
    if (qt && day === qd) { var idx = showsOn(day).filter(function (s) { return s.type !== 'rental'; }).map(function (s) { return s.t; }).indexOf(qt); if (idx >= 0) si = idx; }
    var daysEl = $('#b-days'), showsEl = $('#b-shows'), cta = $('#b-cta');
    single($('#b-mode'), function (b) { mode = b.getAttribute('data-v'); draw(); });
    $('#b-dec').addEventListener('click', function () { ppl = Math.max(1, ppl - 1); draw(); });
    $('#b-inc').addEventListener('click', function () { ppl = Math.min(20, ppl + 1); draw(); });
    daysEl.addEventListener('click', function (e) { var b = e.target.closest('button[data-d]'); if (!b) return; day = b.getAttribute('data-d'); si = 0; draw(); var nb = $('[data-d="' + day + '"]', daysEl); if (nb) nb.focus(); });
    showsEl.addEventListener('click', function (e) { var b = e.target.closest('button[data-i]'); if (!b) return; si = +b.getAttribute('data-i'); draw(); var nb = $('[data-i="' + si + '"]', showsEl); if (nb) nb.focus(); });
    function list() { return day ? showsOn(day).filter(function (s) { return s.type !== 'rental'; }) : []; }
    function draw() {
      $$('[data-mode]').forEach(function (el) { el.hidden = el.getAttribute('data-mode') !== mode; });
      if (!dates.length) { daysEl.innerHTML = '<p class="empty" style="grid-column:1/-1">다음 공연 일정이 곧 올라와요</p>'; }
      else daysEl.innerHTML = dates.map(function (d) {
        return '<button type="button" class="dchip' + (isRental(d) ? ' empty-day' : '') + '" aria-pressed="' + (d === day) + '" data-d="' + d + '" aria-label="' + dayLabel(d) + '" style="min-width:0"><small>' + rel(d) + '</small><b>' + (+d.split('-')[2]) + '</b></button>';
      }).join('');
      $('#b-day-label').textContent = day ? dayLabel(day) : '';
      var l = list(); if (si >= l.length) si = 0;
      if (!l.length) showsEl.innerHTML = '<p class="empty">' + (day && isRental(day) ? '대관일이라 일반 공연이 없어요. 다른 날짜를 골라 주세요.' : '이날은 공연이 없어요.') + '</p>';
      else showsEl.innerHTML = l.map(function (s, i) {
        return '<button type="button" class="role" aria-pressed="' + (i === si) + '" data-i="' + i + '" style="flex-direction:row;align-items:center;gap:14px;min-height:64px;padding:0 16px">' +
          '<span class="mono" style="font-size:16px;font-weight:700;color:var(--accent)">' + esc(s.t) + '</span>' +
          '<span class="r-t"><b style="font-size:15px">' + esc(who(s)) + '</b><span>' + esc((s.p || '1회 공연') + ' · 행2PM8PM') + '</span></span><span class="radio"></span></button>';
      }).join('');
      $('#b-ppl').textContent = ppl + '명';
      var total = won(ppl * 10000) + '원';
      var s = l[si];
      $('#b-picked').textContent = s ? dayLabel(day) + ' ' + s.t + ' ' + who(s) : '공연을 골라 주세요';
      $('#b-total').textContent = total; $('#b-ppl2').textContent = ppl + '명';
      $('#b-visit').textContent = '방문하면 직관 등급이 자동으로 올라가요 · 지금 ' + vg.name + ' ' + f.visits + '회 → ' + (f.visits + 1) + '회';
      var front = $('#b-front'); if (front) { var ok = f.visits >= 30; front.disabled = !ok; front.setAttribute('aria-disabled', ok ? 'false' : 'true'); }
      if (mode === 'watch') { cta.textContent = s ? '예약금 ' + total + ' 결제하기' : '예약할 공연이 없어요'; cta.disabled = !s; }
      else { cta.textContent = '대관 견적 요청하기'; cta.disabled = false; }
    }
    single($('#b-seat'));
    cta.addEventListener('click', function () {
      if (mode === 'rent') { $('#rent-text').textContent = (day ? dayLabel(day) + ' · ' : '') + ppl + '명 대관 견적을 요청했어요. 매장 확인 후 견적이 도착해요.'; openSheet('sheet-rent'); return; }
      var s = list()[si]; if (!s) return;
      var bk = store.get(BOOK_KEY, []) || []; bk.push({ d: s.d, t: s.t, a: who(s), ppl: ppl, at: TODAY }); store.set(BOOK_KEY, bk);
      $('#book-text').textContent = dayLabel(s.d) + ' ' + s.t + ' ' + who(s) + ' · ' + ppl + '명 예약됐어요. 방문하면 직관 ' + (f.visits + 1) + '회째로 기록돼요.';
      openSheet('sheet-book');
    });
    draw();
  };

  PAGES.tip = function () {
    var amts = [3000, 5000, 10000, 50000], ai = 2, pi = 0, pays = ['카드', '계좌이체', '카카오페이', '토스페이'];
    single($('#t-amt'), function (b) { ai = +b.getAttribute('data-i'); draw(); });
    single($('#t-pay'), function (b) { pi = +b.getAttribute('data-i'); draw(); });
    function draw() {
      var f = fan(), base = f.tip, amt = amts[ai], after = base + amt, tg = grade(TIPG, base), ag = grade(TIPG, after);
      var goal = tg.next ? tg.next[0] : after, reach = tg.next && after >= goal;
      $$('[data-bind="tip-name"]').forEach(function (el) { el.textContent = tg.name; });
      $('#t-after').textContent = tg.next ? won(after) + ' / ' + won(goal) : won(after) + '원';
      var bp = tg.next ? Math.round(base / goal * 100) : 100, ap = tg.next ? Math.min(100, Math.round(after / goal * 100)) : 100;
      $('#t-bar-base').style.width = bp + '%'; $('#t-bar-add').style.width = Math.max(0, ap - bp) + '%';
      var gt = $('#t-goal');
      gt.textContent = !tg.next ? '이미 최고 후원 등급이에요 · 후원 1위가 되면 팬회장 뱃지' : (reach ? '이 팁으로 ' + ag.name + ' 등급 달성! ' + (ag.name === '큰손' ? '신청곡 우선권 · 사인 혜택이 열려요' : '공연 후 사진 · 인사 혜택이 열려요') : '이 팁을 보내면 ' + tg.next[1] + '까지 ' + won(goal - after) + '원 남아요');
      gt.style.color = reach ? 'var(--accent)' : 'var(--muted)';
      var songOpen = after >= 100000 || f.visits >= 15;
      $('#t-song').hidden = !songOpen; $('#t-song-lock').hidden = songOpen;
      $('#t-send').textContent = '새벽오렌지에게 ' + won(amt) + '원 보내기 · ' + pays[pi];
      bindFan();
    }
    $('#t-send').addEventListener('click', function () {
      var f = fan(), amt = amts[ai], before = grade(TIPG, f.tip), after = f.tip + amt, ag = grade(TIPG, after);
      put('tip', after);
      inboxAdd('tips', { date: TODAY, fan: '웹 방문자', artist: '새벽오렌지', amount: amt, method: pays[pi], paid: false });
      var up = ag.name !== before.name;
      $('#sheet-tip-t').textContent = up ? ag.name + ' 등급 달성!' : '팁을 보냈어요';
      $('#tip-text').textContent = up
        ? '새벽오렌지 피드 댓글에 ' + ag.name + ' 뱃지가 붙고 상위에 노출돼요.' + (ag.name === '큰손' ? ' 다음 공연부터 신청곡 우선권과 사인을 받을 수 있어요.' : '')
        : won(amt) + '원이 새벽오렌지에게 전달됐어요.' + (ag.next ? ' ' + ag.next[1] + '까지 ' + won(ag.next[0] - after) + '원 남았어요.' : '');
      $('#t-msg').value = ''; var song = $('#t-song input'); if (song) song.value = '';
      openSheet('sheet-tip'); draw();
    });
    draw();
  };

  PAGES.feed = function () {
    likeBtn($('#like-1'), 'post1', 1024);
    likeBtn($('#like-2'), 'post2', 312);
    $$('[data-share]').forEach(function (b) { b.addEventListener('click', function () { share('컨택싱어 피드'); }); });
    var more = $('#more-comments');
    if (more) more.addEventListener('click', function () { $$('.comment[hidden]').forEach(function (c) { c.hidden = false; }); more.hidden = true; });
    // 피드 종류
    function filter(kind) {
      var following = !!st('following', false), n = 0;
      $$('.post').forEach(function (p) {
        var tags = (p.getAttribute('data-tags') || '').split(' ');
        var show = kind === 'rec' ? tags.indexOf('rec') >= 0 : kind === 'near' ? tags.indexOf('near') >= 0 : (following && tags.indexOf('dawn') >= 0);
        p.hidden = !show; if (show) n++;
      });
      $('#feed-empty').hidden = n > 0;
    }
    single($('#feed-tabs'), function (b) { filter(b.getAttribute('data-v')); });
    filter('rec');
    // 오늘 라인업 (공연장 소식)
    var lu = $('#lineup');
    if (lu) {
      var d = scheduleDates(TODAY, 1)[0];
      if (d) {
        $('#lineup-head').textContent = (d === TODAY ? '오늘' : dayLabel(d)) + ' 행2PM8PM 라인업';
        lu.innerHTML = rowsHtml(d);
      }
    }
    // 음원 재생 흉내 (시안)
    var pb = $('#play'), timer = null, pos = 72, len = 188;
    function tick() { pos = (pos + 1) % len; $('#play-bar').style.width = Math.round(pos / len * 100) + '%'; $('#play-pos').textContent = Math.floor(pos / 60) + ':' + ('0' + pos % 60).slice(-2); }
    if (pb) pb.addEventListener('click', function () {
      var on = pb.getAttribute('aria-pressed') !== 'true';
      pb.setAttribute('aria-pressed', on ? 'true' : 'false'); pb.setAttribute('aria-label', on ? '일시정지' : '재생');
      $('.ic-play', pb).hidden = on; $('.ic-pause', pb).hidden = !on;
      clearInterval(timer); if (on) timer = setInterval(tick, 1000);
    });
  };

  PAGES.artist = function () {
    var r = bindFan();
    followBtn($('#follow'));
    var ul = $('#perks');
    if (ul) ul.innerHTML = perks(r.f.visits, r.f.tip).map(function (p) {
      return '<li><span class="lock' + (p.open ? ' on' : '') + '">' + (p.open ? ICON.check : ICON.lock) + '</span><span class="t"><b' + (p.open ? '' : ' style="color:var(--fg-2)"') + '>' + p.t + '</b><span>' + p.c + '</span></span>' +
        '<span class="tiny" style="font-weight:700;color:' + (p.open ? 'var(--accent)' : 'var(--muted)') + '">' + (p.open ? '사용 가능' : '잠김') + '</span></li>';
    }).join('');
    var ranks = {
      tip: [['1', '하늘색고래', '팬회장', 'chief'], ['2', '을지로러버', '후원 · 큰손', 'tip'], ['3', '밤산책', '후원 · 큰손', 'tip'], ['9', '나', '후원 · ' + r.tg.name, 'tip', 1]],
      visit: [['1', '민트초코', '직관 · 개근 34회', 'visit'], ['2', '하늘색고래', '직관 · 찐단골 21회', 'visit'], ['3', '지민', '직관 · 찐단골 16회', 'visit'], ['14', '나', '직관 · ' + r.vg.name + ' ' + r.f.visits + '회', 'visit', 1]]
    };
    function drawRank(k) {
      $('#ranks').innerHTML = ranks[k].map(function (x) {
        return '<li class="rank' + (x[4] ? ' me' : '') + '"><span class="no' + (x[0] === '1' ? ' first' : '') + '">' + x[0] + '</span><span class="avatar plain ph-box" style="width:34px;height:34px;border-radius:17px"></span><span class="nm">' + x[1] + '</span><span class="badge ' + x[3] + '">' + x[2] + '</span></li>';
      }).join('');
    }
    single($('#rank-tabs'), function (b) { drawRank(b.getAttribute('data-v')); });
    drawRank('tip');
  };

  // 무대에 컨택하기 버튼 (무대 컨택 화면 · 홈의 가수 화면)
  function bindReq(root, short) {
    var sent = st('matchSent', {});
    $$('[data-req]', root).forEach(function (b) {
      var id = b.getAttribute('data-req'), isShort = b.hasAttribute('data-short');
      function draw() {
        var on = !!sent[id]; b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.textContent = on ? (isShort ? '컨택 보냄' : '컨택 보냄 · 매장 확인 중') : (isShort ? '컨택' : '이 무대에 컨택하기');
        b.className = (on ? 'btn outline' : 'btn') + (isShort ? ' sm' : '');
      }
      b.addEventListener('click', function () { sent[id] = !sent[id]; put('matchSent', sent); draw(); toast(sent[id] ? '이 무대에 컨택했어요' : '컨택을 취소했어요'); });
      draw();
    });
  }
  PAGES.match = function () { bindReq(document); };

  PAGES['venue-match'] = function () {
    var asked = st('venueAsked', {});
    function count() { var n = $$('.mcard').filter(function (c) { return !c.hidden; }).length; $('#vm-count').textContent = n; }
    single($('#vm-genres'), function (b) {
      var g = b.getAttribute('data-v');
      $$('.mcard').forEach(function (c) { c.hidden = g !== '전체' && c.getAttribute('data-genre') !== g; });
      count();
    });
    $$('[data-ask]').forEach(function (b) {
      var id = b.getAttribute('data-ask');
      function draw() { var on = !!asked[id]; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.textContent = on ? '컨택 보냄' : '컨택 요청'; b.className = on ? 'btn outline sm' : 'btn sm'; }
      b.addEventListener('click', function () { asked[id] = !asked[id]; put('venueAsked', asked); draw(); toast(asked[id] ? '싱어에게 컨택 요청을 보냈어요' : '컨택을 취소했어요'); });
      draw();
    });
    count();
  };

  // 다가오는 무대: 실제 공연 일정에서 오늘부터 7일 (파트너 센터 · 홈의 사장님 화면)
  function weekHtml() {
    var html = '';
    for (var i = 0; i < 7; i++) {
      var d = addDays(TODAY, i), l = showsOn(d);
      var left = '<span style="flex:none;width:58px;display:flex;flex-direction:column;gap:1px"><span class="mono" style="font-size:13px;font-weight:700;color:' + (l.length ? 'var(--accent-text)' : '#B42318') + '">' + md(d) + '</span><span class="tiny" style="font-size:11px">' + (i === 0 ? '오늘' : wd(d)) + (l[0] && l[0].t ? ' ' + l[0].t : '') + '</span></span>';
      if (!l.length) html += '<li>' + left + '<span class="t"><b style="color:var(--muted)">컨택 필요</b></span><a class="btn sm" href="venue-match.html">AI 추천 보기</a></li>';
      else if (l[0].type === 'rental') html += '<li>' + left + '<span class="t"><b>대관</b><span>일반 공연 없음</span></span></li>';
      else {
        var names = l.map(function (s) { return (s.p ? s.p + ' ' : (l.length > 1 ? s.t + ' ' : '')) + who(s); }).join(' · ');
        var need = l.some(function (s) { return !s.a; });
        html += '<li>' + left + '<span class="t"><b>' + esc(names) + '</b><span>' + (l.length > 1 ? l.length + '회 공연' : '1회 공연') + '</span></span>' + (need ? '<a class="btn sm" href="venue-match.html">컨택하기</a>' : '<span class="pill done">확정</span>') + '</li>';
      }
    }
    return html;
  }

  PAGES.partner = function () {
    var req = st('partnerReq', {});
    $$('[data-request]').forEach(function (card) {
      var id = card.getAttribute('data-request');
      function draw() {
        var v = req[id] || 'pending';
        $('.r-pending', card).hidden = v !== 'pending'; $('.r-done', card).hidden = v === 'pending';
        var s = $('.r-status', card); s.textContent = v === 'accepted' ? '수락 완료 · 일정 확정 알림 발송' : '거절했어요'; s.style.color = v === 'accepted' ? 'var(--accent)' : 'var(--muted)';
      }
      function set(v) { req[id] = v; put('partnerReq', req); draw(); }
      $('[data-act="accept"]', card).addEventListener('click', function () { set('accepted'); });
      $('[data-act="decline"]', card).addEventListener('click', function () { set('declined'); });
      $('[data-act="undo"]', card).addEventListener('click', function () { set('pending'); });
      draw();
    });
    var ul = $('#week'); if (ul) ul.innerHTML = weekHtml();
  };

  PAGES.schedule = function () {
    var shown = 0;
    $$('.day[data-day]').forEach(function (li) {
      var d = li.getAttribute('data-day');
      if (d < TODAY) li.hidden = true; else shown++;
      if (d === TODAY) { li.classList.add('is-today'); var t = $('.today-tag', li); if (t) t.hidden = false; }
    });
    $$('.month').forEach(function (m) { m.hidden = $$('.day', m).every(function (li) { return li.hidden; }); });
    var e = $('#sched-empty'); if (e) e.hidden = shown > 0;
  };

  /* ---------- 등록 폼 (싱어 · 매장) ---------- */
  function fileField(input, onPick) {
    if (!input) return;
    input.addEventListener('change', function () {
      var fs = input.files ? Array.prototype.slice.call(input.files) : [];
      var wrap = input.closest('.upload'), label = wrap ? $('.fname', wrap) : null;
      if (wrap) wrap.classList.toggle('has', fs.length > 0);
      if (label) label.textContent = fs.length > 1 ? fs.length + '개 파일 선택' : (fs[0] ? fs[0].name : label.getAttribute('data-empty'));
      if (onPick) onPick(fs);
    });
  }
  function requireFields(form, ids) {
    var bad = [];
    ids.forEach(function (id) {
      var el = document.getElementById(id), ok = el && (el.type === 'file' ? el.files && el.files.length : String(el.value).trim());
      var err = document.getElementById(id + '-err');
      if (err) err.hidden = !!ok;
      if (el) el.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (!ok) bad.push(el);
    });
    if (bad[0]) { (bad[0].type === 'file' ? bad[0].closest('label, .upload, .pick-photo') || bad[0] : bad[0]).scrollIntoView({ block: 'center', behavior: 'smooth' }); try { bad[0].focus({ preventScroll: true }); } catch (e) { bad[0].focus(); } }
    return bad.length === 0;
  }
  function agreeOk(id) {
    var a = document.getElementById(id), hint = document.getElementById(id + '-err');
    if (hint) hint.hidden = a.checked;
    if (!a.checked) a.focus();
    return a.checked;
  }
  function val(id) { var el = document.getElementById(id); return el ? String(el.value).trim() : ''; }

  PAGES['artist-register'] = function () {
    single($('#ar-lineup')); multi($('#ar-genres'));
    var photo = $('#ar-photo'), box = $('#ar-photo-box');
    fileField(photo, function (fs) {
      if (!fs[0]) return;
      box.innerHTML = '<img alt="선택한 프로필 사진">'; box.classList.add('has');
      $('img', box).src = URL.createObjectURL(fs[0]);
      $('#ar-photo-btn').textContent = '다른 사진 선택';
    });
    fileField($('#ar-audio')); fileField($('#ar-video'));
    var rows = $('#ar-careers'), n = rows.children.length;
    $('#ar-add').addEventListener('click', function () {
      if (n >= 10) { toast('공연 경력은 10개까지 적을 수 있어요'); return; }
      var i = n++, div = document.createElement('div');
      div.className = 'crow';
      div.innerHTML = '<label class="sr" for="ar-place-' + i + '">공연장 또는 행사명 ' + (i + 1) + '</label><input class="in-text" id="ar-place-' + i + '" placeholder="공연장 또는 행사명">' +
        '<label class="sr" for="ar-date-' + i + '">공연 시기 ' + (i + 1) + '</label><input class="in-text mono" id="ar-date-' + i + '" inputmode="numeric" placeholder="YYYY.MM" style="font-size:15px">' +
        '<button type="button" class="icon-btn" aria-label="공연 경력 ' + (i + 1) + ' 지우기" data-del>&times;</button>';
      rows.appendChild(div); $('input', div).focus();
    });
    rows.addEventListener('click', function (e) { var b = e.target.closest('[data-del]'); if (b) b.closest('.crow').remove(); });
    $('#ar-agree').addEventListener('change', function () { $('#ar-agree-err').hidden = true; });
    $('#ar-submit').addEventListener('click', function () {
      if (!requireFields($('#ar-form'), ['ar-photo', 'ar-name', 'ar-age', 'ar-phone'])) return;
      if (!agreeOk('ar-agree')) return;
      var careers = $$('.crow', rows).map(function (r) { var ins = $$('input', r); return [ins[0].value.trim(), ins[1].value.trim()]; }).filter(function (c) { return c[0]; });
      var tracks = [];
      var au = $('#ar-audio').files[0]; if (au) tracks.push([au.name.replace(/\.[^.]+$/, ''), '파일 업로드']);
      if (val('ar-audio-link')) tracks.push(['음원 링크', val('ar-audio-link')]);
      var vf = $('#ar-video').files[0];
      inboxAdd('artists', {
        name: val('ar-name'), lineup: picked($('#ar-lineup'))[0] || '', genres: picked($('#ar-genres')), age: +val('ar-age') || '',
        region: val('ar-region'), phone: val('ar-phone'), bio: val('ar-bio'), careers: careers, tracks: tracks,
        video: vf ? '공연 영상 1개 (' + vf.name + ')' : (val('ar-video-link') || ''), created: TODAY, status: 'pending'
      });
      put('role', 'artist');
      openSheet('sheet-done');
    });
  };

  PAGES['venue-register'] = function () {
    single($('#vr-cat')); multi($('#vr-days')); multi($('#vr-styles')); single($('#vr-pay')); multi($('#vr-gear'));
    fileField($('#vr-cert'));
    var thumbs = $('#vr-thumbs');
    fileField($('#vr-photos'), function (fs) {
      fs = fs.slice(0, 10);
      $$('img, .slot', thumbs).forEach(function (x) { x.remove(); });
      fs.forEach(function (f, i) { var im = document.createElement('img'); im.alt = '공연장 사진 ' + (i + 1); im.src = URL.createObjectURL(f); thumbs.appendChild(im); });
      $('#vr-photo-count').textContent = fs.length ? fs.length + '장 선택' : '사진 추가';
    });
    // 주소 검색 (다음 우편번호 서비스, 누를 때만 불러옴)
    $('#vr-find').addEventListener('click', function () {
      function open() {
        new window.daum.Postcode({ oncomplete: function (data) { $('#vr-addr').value = data.roadAddress || data.jibunAddress || data.address; $('#vr-addr2').focus(); } }).open();
      }
      if (window.daum && window.daum.Postcode) { open(); return; }
      var s = document.createElement('script');
      s.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      s.onload = open; s.onerror = function () { toast('주소 검색을 불러오지 못했어요. 직접 입력해 주세요.'); $('#vr-addr').focus(); };
      document.head.appendChild(s);
    });
    $('#vr-agree').addEventListener('change', function () { $('#vr-agree-err').hidden = true; });
    $('#vr-submit').addEventListener('click', function () {
      if (!requireFields($('#vr-form'), ['vr-name', 'vr-biz', 'vr-cert', 'vr-phone', 'vr-addr'])) return;
      if (!agreeOk('vr-agree')) return;
      inboxAdd('venues', {
        name: val('vr-name'), category: picked($('#vr-cat'))[0] || '', address: (val('vr-addr') + ' ' + val('vr-addr2')).trim(), biz: val('vr-biz'),
        cert: false, phone: val('vr-phone'), capacity: +val('vr-cap') || '', days: picked($('#vr-days')), hours: val('vr-time'),
        styles: picked($('#vr-styles')), pay: picked($('#vr-pay'))[0] || '', mood: val('vr-mood'), equipment: picked($('#vr-gear')),
        photos: ($('#vr-photos').files || []).length, created: TODAY, status: 'pending'
      });
      put('role', 'venue');
      openSheet('sheet-done');
    });
  };

  PAGES.about = function () { };

  // 첫 화면: 연락 · 접촉 · 교제를 고르면 연결 그림과 설명 카드가 함께 바뀐다
  // 시작 화면: 5초 동안 1~100% 올라간 뒤 홈으로
  PAGES.intro = function () {
    var pct = $('#sp-pct'), fill = $('#sp-fill'), bar = $('#sp-bar');
    if (!pct) return;
    var DUR = 5000, t0 = null, done = false;
    function go() { if (done) return; done = true; location.replace('home.html'); }
    function step(ts) {
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / DUR), v = Math.max(1, Math.round(k * 100));
      pct.textContent = v; fill.style.width = v + '%'; bar.setAttribute('aria-valuenow', v);
      if (k < 1) requestAnimationFrame(step); else setTimeout(go, 300);
    }
    requestAnimationFrame(step);
    setTimeout(go, DUR + 1500);
  };

  /* ---------- 실행 ---------- */
  var page = document.body.getAttribute('data-page');
  if (PAGES[page]) PAGES[page]();
  // 화면 지도의 '오늘' 공연 줄
  var tl = $('[data-bind="tonight"]');
  if (tl) { var ns = nextShow(); tl.textContent = ns ? (ns.d === TODAY ? '오늘 ' : dayLabel(ns.d) + ' ') + ns.t + ' · ' + who(ns) : '다음 일정 준비 중'; }
  // 예시 화면의 '다가오는 토요일' 날짜
  var sat = addDays(TODAY, 1); while (wd(sat) !== '토') sat = addDays(sat, 1);
  $$('[data-bind="next-sat"]').forEach(function (el) { el.textContent = md(sat); });
  $$('[data-bind="next-sat-label"]').forEach(function (el) { el.textContent = '다음 공연 ' + dayLabel(sat); });
})();
