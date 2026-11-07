/* 컨택싱어 웹앱 — 공통 스크립트
   각 화면은 <body data-page="..."> 값으로 아래 PAGES 중 하나가 실행된다.
   화면 상태는 이 브라우저(localStorage)에, 등록 · 컨택 · 예약은 Supabase에 저장된다. */
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

  /* ---------- 서버 (Supabase): 등록 정보 저장 · 팝업 · 공지 ----------
     config.js 의 공개용 키로 데이터베이스에 '쓰기'만 한다. 남의 정보 '보기'는 관리자 계정만 가능(데이터베이스 권한 규칙). */
  var CFG = window.CS_CONFIG || {};
  var SB_ON = !!(CFG.url && CFG.key);
  function netErr(m) { var e = new Error(m || 'network'); e.network = true; return e; }
  function sbReq(path, opt) {
    opt = opt || {};
    if (!SB_ON) return Promise.reject(netErr('설정 없음'));
    var h = { apikey: CFG.key }, k, body = opt.body;
    for (k in (opt.headers || {})) h[k] = opt.headers[k];
    if (body != null && !(window.Blob && body instanceof Blob)) { body = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, opt.timeout || 20000) : 0;
    return fetch(CFG.url + path, { method: opt.method || 'GET', headers: h, body: body, signal: ctl ? ctl.signal : undefined }).then(function (r) {
      clearTimeout(timer);
      return r.text().then(function (t) {
        if (!r.ok) { var e = new Error(t || ('HTTP ' + r.status)); e.status = r.status; throw e; }
        try { return t ? JSON.parse(t) : null; } catch (x) { return null; }
      });
    }, function (e) { clearTimeout(timer); throw netErr(e && e.message); });
  }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16), i;
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b); else for (i = 0; i < 16; i++) b[i] = Math.random() * 256 | 0;
    b[6] = b[6] & 15 | 64; b[8] = b[8] & 63 | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function sbRpc(fn, args) { return sbReq('/rest/v1/rpc/' + fn, { method: 'POST', body: args || {} }); }
  var TABLE_OF = { venue: 'venues', artist: 'artists', fan: 'fans' };
  // 이 기기에서 등록한 회원 (등록할 때 만든 번호 + 비밀 번호). 서버는 이 둘이 맞을 때만 내 컨택 · 상태를 보여 준다.
  function member(kind) { var m = st('member-' + kind, null); return m && m.id && m.token ? m : null; }
  /* ---------- 카카오 로그인 (Supabase Auth 의 카카오 연결) ---------- */
  var AUTH_KEY = 'csm-auth', AUTH = {};
  function session() { var a = store.get(AUTH_KEY, null); return a && a.access ? a : null; }
  function authToken() {
    var a = session(); if (!a) return Promise.resolve(null);
    if (a.exp - 60000 > Date.now()) return Promise.resolve(a.access);
    return fetch(CFG.url + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: CFG.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: a.refresh }) })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('refresh')); })
      .then(function (j) { a.access = j.access_token; a.refresh = j.refresh_token; a.exp = Date.now() + (j.expires_in || 3600) * 1000; store.set(AUTH_KEY, a); return a.access; },
            function () { store.set(AUTH_KEY, null); return null; });
  }
  function sbAuth(path, opt) {
    return authToken().then(function (tok) {
      if (!tok) { var e = new Error('로그인이 필요해요'); e.auth = true; throw e; }
      opt = opt || {}; var h = {}, k; for (k in (opt.headers || {})) h[k] = opt.headers[k]; h.Authorization = 'Bearer ' + tok; opt.headers = h;
      return sbReq(path, opt);
    });
  }
  function kakaoStart(role, back) {
    store.set('csm-kakao-intent', { role: role || '', back: back || '', at: Date.now() });
    var base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    var sc = (AUTH.kakao_scopes || []).filter(function (x) { return /^[a-z_]+$/.test(x); }).join(',');
    location.href = CFG.url + '/auth/v1/authorize?provider=kakao&redirect_to=' + encodeURIComponent(base + 'index.html') + (sc ? '&scopes=' + encodeURIComponent(sc) : '');
  }
  // 카카오에서 돌아오면 주소 끝(#)에 로그인 정보가 붙어 온다
  function takeAuthHash() {
    var h = location.hash.slice(1);
    if (!/(^|&)(access_token|error)=/.test(h)) return false;
    var q = new URLSearchParams(h);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
    if (q.get('error')) { setTimeout(function () { toast('카카오 로그인을 마치지 못했어요. 다시 시도해 주세요'); }, 300); return false; }
    store.set(AUTH_KEY, { access: q.get('access_token'), refresh: q.get('refresh_token'), exp: Date.now() + (+q.get('expires_in') || 3600) * 1000, provider: q.get('provider_token') || '' });
    return true;
  }
  function phoneKR(p) { p = String(p || '').replace(/^\+82\s?/, '0').replace(/[^0-9]/g, ''); return p.length >= 10 ? p.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3') : ''; }
  // 로그인 직후: 내 계정 · 카카오 프로필(이름 · 전화번호) · 내 회원 정보 불러오기
  function afterKakao() {
    var a = session();
    var me = sbAuth('/auth/v1/user', {}).catch(function () { return null; });
    var kp = a && a.provider ? fetch('https://kapi.kakao.com/v2/user/me', { headers: { Authorization: 'Bearer ' + a.provider } })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }) : Promise.resolve(null);
    return Promise.all([me, kp]).then(function (r) {
      var u = r[0] || {}, k = (r[1] && r[1].kakao_account) || {}, md = u.user_metadata || {}, prof = k.profile || {};
      var p = { uid: u.id || '', nickname: prof.nickname || md.name || md.full_name || '', name: k.name || '', phone: phoneKR(k.phone_number),
                email: k.email || u.email || '', avatar: prof.profile_image_url || md.avatar_url || '' };
      var a2 = session(); if (a2) { a2.uid = p.uid; a2.provider = ''; store.set(AUTH_KEY, a2); }   // 카카오 토큰은 바로 버린다
      put('kakao', p);
      // 이 기기에서 먼저 등록한 정보는 카카오 계정에 연결
      return Promise.all(['venue', 'artist', 'fan'].map(function (kind) {
        var m = member(kind); if (!m) return null;
        return sbAuth('/rest/v1/rpc/link_member', { method: 'POST', body: { p_kind: kind, p_id: m.id, p_token: m.token, p_email: p.email || null, p_avatar: p.avatar || null } }).catch(function () { return null; });
      })).then(function () { return sbAuth('/rest/v1/rpc/my_members', { method: 'POST', body: {} }).catch(function () { return []; }); })
        .then(function (rows) {
          var seen = {};
          (rows || []).forEach(function (x) {
            if (seen[x.kind]) return; seen[x.kind] = x;
            put('member-' + x.kind, { id: x.id, token: x.member_token });
            if (!profileOf(x.kind)) put('profile-' + x.kind, x.kind === 'venue' ? { venue: x.name, owner: p.name || p.nickname, phone: p.phone, at: TODAY } : { name: x.name, phone: p.phone, genres: [], at: TODAY });
          });
          return { profile: p, mine: seen };
        });
    });
  }
  function kakaoLogout() {
    var a = session();
    if (a) fetch(CFG.url + '/auth/v1/logout', { method: 'POST', headers: { apikey: CFG.key, Authorization: 'Bearer ' + a.access } }).catch(function () {});
    store.set(AUTH_KEY, null);
    ['kakao', 'member-venue', 'member-artist', 'member-fan', 'profile-venue', 'profile-artist', 'profile-fan', 'role'].forEach(function (k) { put(k, null); });
    toast('로그아웃했어요'); setTimeout(function () { location.replace('index.html'); }, 600);
  }
  function errMsg(e, fallback) { var m = (e && e.message) || ''; try { var j = JSON.parse(m); m = j.message || m; } catch (x) { /* 글자 그대로 */ } return /[가-힣]/.test(m) ? m : fallback; }
  var MAX_FILE = 10 * 1024 * 1024;
  function fileOk(f, label) {
    if (!f) return true;
    if (f.size > MAX_FILE) { toast(label + ' 파일은 10MB 이하로 올려 주세요'); return false; }
    if (f.type && !/^image\//.test(f.type) && f.type !== 'application/pdf') { toast(label + '은(는) 사진이나 PDF만 올릴 수 있어요'); return false; }
    return true;
  }
  function sbUpload(folder, file) {
    var m = (file.name || '').match(/\.([a-z0-9]{2,5})$/i), ext = m ? m[1].toLowerCase() : 'jpg';
    var path = folder + '/' + TODAY + '-' + uid() + '.' + ext;
    return sbReq('/storage/v1/object/uploads/' + path, { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' } })
      .then(function () { return path; });
  }
  // 큰 파일(영상) 올리기: 진행률을 보여 주려고 XMLHttpRequest 사용
  function sbPut(bucket, path, blob, type, onProg) {
    return new Promise(function (res, rej) {
      if (!SB_ON) { rej(netErr('설정 없음')); return; }
      var x = new XMLHttpRequest();
      x.open('POST', CFG.url + '/storage/v1/object/' + bucket + '/' + path);
      x.setRequestHeader('apikey', CFG.key); x.setRequestHeader('Content-Type', type || 'application/octet-stream'); x.setRequestHeader('x-upsert', 'false');
      if (onProg && x.upload) x.upload.onprogress = function (e) { if (e.lengthComputable) onProg(e.loaded / e.total); };
      x.onload = function () { if (x.status >= 200 && x.status < 300) res(path); else { var e = new Error(x.responseText || ('HTTP ' + x.status)); e.status = x.status; rej(e); } };
      x.onerror = function () { rej(netErr('upload')); };
      x.ontimeout = function () { rej(netErr('timeout')); };
      x.timeout = 300000;
      x.send(blob);
    });
  }
  // 등록 정보 저장: 파일을 먼저 올리고 표에 한 줄 추가. 서버에 닿지 못하면(오프라인 · 미리보기) 이 기기에만 남긴다.
  function saveMember(kind, row, uploads) {
    var table = TABLE_OF[kind], mem = member(kind);
    function insertNew() {
      var id = uid(), token = uid(), r = {}, k;
      for (k in row) r[k] = row[k];
      r.id = id; r.member_token = token;
      var a = session(), kp = st('kakao', null);
      function plain() { return sbReq('/rest/v1/' + table, { method: 'POST', body: r, headers: { Prefer: 'return=minimal' } }); }
      var send = plain;
      if (a && a.uid) {
        send = function () {
          var ra = {}, kk; for (kk in r) ra[kk] = r[kk];
          ra.user_id = a.uid; if (kp && kp.email) ra.email = kp.email; if (kp && kp.avatar) ra.avatar_url = kp.avatar;
          return sbAuth('/rest/v1/' + table, { method: 'POST', body: ra, headers: { Prefer: 'return=minimal' } }).catch(function (e) { if (e && e.auth) return plain(); throw e; });
        };
      }
      return send().then(function () { put('member-' + kind, { id: id, token: token }); return 'server'; });
    }
    return Promise.all((uploads || []).map(function (u) {
      var fs = (u.files || []).filter(Boolean);
      return fs.length ? Promise.all(fs.map(function (f) { return sbUpload(u.folder, f); })).then(function (ps) { u.set(row, ps); }) : null;
    })).then(function () {
      // 이 기기에서 이미 등록했으면 새 줄을 만들지 않고 고친다
      if (mem) return sbRpc('member_update', { p_kind: kind, p_id: mem.id, p_token: mem.token, p_data: row }).then(function (ok) { return ok === true ? 'server' : insertNew(); });
      return insertNew();
    }).then(function (w) { return w; }, function (e) {
      if (e && e.network) { inboxAdd(table, row); return 'local'; }
      throw e;
    });
  }
  function busy(btn, on) {
    if (!btn) return;
    if (on) { btn.setAttribute('data-label', btn.textContent); btn.textContent = '보내는 중…'; btn.disabled = true; }
    else { btn.textContent = btn.getAttribute('data-label') || btn.textContent; btn.disabled = false; }
  }
  function saveFail(e) { toast('저장하지 못했어요. 잠시 후 다시 시도해 주세요'); if (window.console) console.warn('[컨택싱어] 저장 실패', e); }
  function savedWhere(where) { if (where === 'local') toast('서버에 연결하지 못해 이 기기에만 저장했어요'); }
  var FEAT = {};

  /* ---------- 공연 일정: 컨택싱어에 등록한 여러 매장 (데이터베이스) + 행2PM8PM 기본 일정 ----------
     데이터베이스에 행2PM8PM 일정이 있으면 그것을 쓰고, 없으면 앱에 들어 있던 일정을 그대로 쓴다. */
  var HANG = '행2PM8PM', HANG_AREA = '서울 중구 을지로', SHOWS_KEY = 'csm-shows';
  function isHang(v) { return String(v || '').replace(/\s/g, '').toLowerCase().indexOf('행2pm8pm') >= 0; }
  D.shows.forEach(function (s) { s.v = s.v || HANG; s.area = s.area || HANG_AREA; });
  var STATIC_SHOWS = D.shows.slice(), SHOWS_FROM_DB = false;
  function showOrder(a, b) { return (a.d + (a.t || '99') + (a.v || '')) < (b.d + (b.t || '99') + (b.v || '')) ? -1 : 1; }
  function applyShows(rows) {
    var db = (rows || []).map(function (r) {
      return { id: r.id, d: r.show_date, t: r.show_time || '', p: r.part || '', a: r.kind === 'rental' ? '' : (r.artist_name || ''), aid: r.artist_id || null,
               v: r.venue_name || '', vid: r.venue_id || null, area: r.area || '', type: r.kind === 'rental' ? 'rental' : 'show' };
    });
    SHOWS_FROM_DB = db.length > 0;
    var hasHang = db.some(function (s) { return isHang(s.v); });
    D.shows = (hasHang ? [] : STATIC_SHOWS).concat(db).sort(showOrder);
  }
  function loadShows() {
    if (!SB_ON) return Promise.resolve();
    var c = store.get(SHOWS_KEY, null);
    if (c && c.day === TODAY && c.rows) applyShows(c.rows);          // 지난번 받아 둔 일정으로 먼저 그린다
    return sbRpc('public_shows', { p_from: TODAY, p_days: 45 }).then(function (rows) {
      store.set(SHOWS_KEY, { day: TODAY, rows: rows || [] }); applyShows(rows);
    }, function () { /* 서버에 닿지 못하면 기본 일정 */ });
  }
  function scheduleDates(from, n, pick) {
    var ds = [];
    D.shows.forEach(function (s) { if (s.d >= from && (!pick || pick(s)) && ds.indexOf(s.d) < 0) ds.push(s.d); });
    ds.sort();
    return ds.slice(0, n);
  }
  function showsOn(d, pick) { return D.shows.filter(function (s) { return s.d === d && (!pick || pick(s)); }); }
  function isRental(d, pick) { var l = showsOn(d, pick); return l.length > 0 && l.every(function (s) { return s.type === 'rental'; }); }
  function nextShow(pick) {
    var l = D.shows.filter(function (s) { return s.d >= TODAY && s.type !== 'rental' && (!pick || pick(s)); });
    l.sort(showOrder);
    return l[0] || null;
  }
  function who(s) { return s.a || '출연자 미정'; }
  function bookHref(s) { return s.id ? 'booking.html?show=' + encodeURIComponent(s.id) : 'booking.html?d=' + s.d + '&t=' + encodeURIComponent(s.t); }
  // 동네: 주소에서 '○○구' (없으면 앞 두 단어)
  function areaOf(s) {
    var a = String((s && s.area) || '').trim(), m = a.match(/([가-힣]{1,4}[구군시])(?:\s|$)/g);
    if (m) { var last = m[m.length - 1].trim(); if (/구$|군$/.test(last)) return last; }
    return a.split(/\s+/).slice(0, 2).join(' ') || '기타';
  }
  function venueLine(s) { return (s.v || HANG) + ' · ' + areaOf(s) + (isHang(s.v) ? ' · 무료 라이브' : ''); }

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
    chev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9.5 5.5 6.5 6.5-6.5 6.5"/></svg>',
    ticket: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5v-2A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v2a3.5 3.5 0 0 0 0 7v2a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-2a3.5 3.5 0 0 0 0-7Z"/><path d="M14 5v14" stroke-dasharray="2 2.5"/></svg>',
    mute: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/></svg>',
    sound: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    share: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M5 13v6h14v-6"/></svg>',
    gift: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12"/><path d="M12 8S10.5 3.5 8 4.2 8.5 8 12 8Zm0 0s1.5-4.5 4-3.8S15.5 8 12 8Z"/></svg>',
    ig: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none"/></svg>',
    yt: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9.2 5 2.8-5 2.8Z" fill="currentColor" stroke="none"/></svg>',
    play: '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5Z" fill="currentColor"/></svg>',
    heart: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20Z"/></svg>'
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
  function chipHtml(d, on, pick) {
    return '<button type="button" class="dchip' + (isRental(d, pick) ? ' empty-day' : '') + '" aria-pressed="' + on + '" data-d="' + d + '" aria-label="' + dayLabel(d) + '"><small>' + rel(d) + '</small><b>' + md(d) + '</b></button>';
  }
  function rowsHtml(d, pick) {
    var l = showsOn(d, pick);
    if (!l.length) return '<li class="empty">이날은 공연이 없어요</li>';
    return l.map(function (s) {
      if (s.type === 'rental') return '<li class="empty">' + esc(s.v || HANG) + ' 대관일이라 일반 공연이 없어요</li>';
      return '<li class="show"><span class="tm"><b>' + esc(s.t) + '</b><small>' + esc(s.p || '') + '</small></span>' +
        '<span class="in"><b>' + (s.aid ? '<a href="singer.html?id=' + encodeURIComponent(s.aid) + '" style="color:inherit">' + esc(who(s)) + '</a>' : esc(who(s))) + '</b><small>' + esc(venueLine(s)) + '</small></span>' +
        '<a class="btn sm go" href="' + bookHref(s) + '" aria-label="' + esc(dayLabel(s.d) + ' ' + s.t + ' ' + who(s)) + ' 예약">예약</a></li>';
    }).join('');
  }
  // 공연 현황판: 동네 고르기 → 날짜 → 그날 공연 (여러 매장)
  function board(root) {
    if (!root) return;
    var chips = $('.dates', root), list = $('.shows', root), areasEl = $('.areas', root);
    var areas = [];
    D.shows.forEach(function (s) { if (s.d >= TODAY) { var a = areaOf(s); if (areas.indexOf(a) < 0) areas.push(a); } });
    var area = st('area', '');
    if (areas.indexOf(area) < 0) area = '';
    function pick(s) { return !area || areaOf(s) === area; }
    var dates, cur;
    function draw(focus) {
      if (areasEl) {
        areasEl.hidden = areas.length < 2;
        areasEl.innerHTML = ['전체'].concat(areas).map(function (a) { var v = a === '전체' ? '' : a; return '<button type="button" class="chip" data-area="' + esc(v) + '" aria-pressed="' + (v === area) + '">' + esc(a) + '</button>'; }).join('');
      }
      dates = scheduleDates(TODAY, 7, pick);
      if (!dates.length) { chips.innerHTML = ''; list.innerHTML = '<li class="empty">다음 공연 일정이 곧 올라와요</li>'; return; }
      if (dates.indexOf(cur) < 0) cur = dates[0];
      chips.innerHTML = dates.map(function (d) { return chipHtml(d, d === cur, pick); }).join('');
      list.innerHTML = rowsHtml(cur, pick);
      if (focus) { var b = $('[data-d="' + cur + '"]', chips); if (b) b.focus(); }
    }
    chips.addEventListener('click', function (e) { var b = e.target.closest('.dchip'); if (!b) return; cur = b.getAttribute('data-d'); draw(true); });
    if (areasEl) areasEl.addEventListener('click', function (e) { var b = e.target.closest('[data-area]'); if (!b) return; area = b.getAttribute('data-area'); put('area', area); draw(false); });
    draw(false);
  }

  /* ---------- 화면별 ---------- */
  var PAGES = {};

  var ROLE_LABEL = { venue: '라이브바 사장님', fan: '손님', artist: '가수' };
  function profileOf(r) { return st('profile-' + r, null); }
  function profileName(r) { var p = profileOf(r); return p ? (r === 'venue' ? p.venue : p.name) : ''; }

  // 프로필 정보 입력 폼 (시작 화면)
  function setupRoleForm(r, req, agreeId, fill, collect, remote, done) {
    var form = $('[data-form="' + r + '"]'); if (!form) return;
    $$('[role="group"]', form).forEach(function (g) { (/여러 개/.test(g.textContent.slice(0, 40)) ? multi : single)(g); });
    var p = profileOf(r);
    if (p) Object.keys(fill).forEach(function (id) { var el = document.getElementById(id); if (el && p[fill[id]] != null) el.value = p[fill[id]]; });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!requireFields(form, req)) return;
      if (!agreeOk(agreeId)) return;
      if (FEAT.signup === false) { toast('지금은 신규 등록을 잠시 쉬고 있어요. 건너뛰고 둘러보세요'); return; }
      var data = collect(); if (!data) return; data.at = TODAY;
      var btn = $('button[type="submit"]', form), rm = remote(data);
      busy(btn, true);
      saveMember(rm[0], rm[1]).then(function (where) {
        put('profile-' + r, data); savedWhere(where); busy(btn, false); done(r);
      }, function (e) { busy(btn, false); saveFail(e); });
    });
    var skip = $('[data-skip="' + r + '"]', form); if (skip) skip.addEventListener('click', function () { done(r); });
  }

  // 시작 화면: 넷플릭스처럼 프로필 고르기 → (처음이면) 정보 입력 → 정보 받는 중 1~100% → 홈
  /* ---------- 무대 영상: 화면에 보이는 영상만 소리 없이 반복 재생 ---------- */
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var VIO = null;
  function autoVideos(root) {
    var vids = $$('video[data-auto]', root || document).filter(function (v) { return !v.hasAttribute('data-io'); });
    if (!vids.length || REDUCED) return;
    vids.forEach(function (v) { v.setAttribute('data-io', ''); });
    function play(v) { if (!v.hasAttribute('data-sound')) v.muted = true; if (v.preload !== 'auto') v.preload = 'auto'; var p = v.play(); if (p && p.catch) p.catch(function () { /* 자동재생 제한: 포스터만 보임 */ }); }
    if (!('IntersectionObserver' in window)) { vids.forEach(function (v) { if (v.offsetParent) play(v); }); return; }
    if (!VIO) VIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting && e.target.offsetParent) play(e.target); else e.target.pause(); });
    }, { threshold: 0.35 });
    vids.forEach(function (v) { VIO.observe(v); });
  }

  var GUIDE_KEY = 'csm-guide-seen';
  PAGES.intro = function () {
    var pick = $('#step-pick'), info = $('#step-info'), load = $('#step-load');
    if (!pick) return;
    var fromKakao = takeAuthHash();
    ['venue', 'fan', 'artist'].forEach(function (r) { var el = $('[data-pname="' + r + '"]'); if (el) el.textContent = profileName(r); });
    var hv = $('#pf-video'), hb = $('#pf-vbtn'), userPaused = REDUCED;
    function drawHb() { if (!hb) return; var off = hv.paused; hb.setAttribute('aria-pressed', off ? 'true' : 'false'); hb.setAttribute('aria-label', off ? '영상 재생' : '영상 멈추기'); $('.i-pause', hb).hidden = off; $('.i-play', hb).hidden = !off; }
    function heroPlay() { if (!hv) return; var p = hv.play(); if (p && p.catch) p.catch(function () { drawHb(); }); }
    if (hv) {
      if (REDUCED) { hv.removeAttribute('autoplay'); hv.pause(); }
      hv.addEventListener('play', drawHb); hv.addEventListener('pause', drawHb);
      if (hb) hb.addEventListener('click', function () { if (hv.paused) { userPaused = false; heroPlay(); } else { userPaused = true; hv.pause(); } });
      drawHb();
    }
    function show(step) {
      pick.hidden = step !== 'pick'; info.hidden = step !== 'info'; load.hidden = step !== 'load'; window.scrollTo(0, 0);
      if (hv) { if (step === 'pick' && !userPaused) heroPlay(); else if (step !== 'pick') hv.pause(); }
    }
    function openInfo(r) {
      $$('[data-role-step]').forEach(function (s) { s.hidden = s.getAttribute('data-role-step') !== r; });
      show('info');
      var h = document.getElementById('info-' + r + '-t'); if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
    }
    function startLoad(r) {
      put('role', r);
      var tpl = $('#av-tpl'), slot = $('#load-av');
      if (tpl && slot && tpl.content) { slot.innerHTML = ''; slot.appendChild(tpl.content.querySelector('.av-' + r).cloneNode(true)); }
      $('#load-name').textContent = ROLE_LABEL[r] + (profileName(r) ? ' · ' + profileName(r) : '');
      // 기다리는 동안 이 역할이 앱에서 할 일 3가지를 보여 준다. 처음 보는 역할이면 조금 더 길게(7초), 다음부터는 5초.
      var seen = store.get(GUIDE_KEY, {}) || {}, first = !seen[r], DUR = first ? 7000 : 5000;
      var guide = $('#ld-guide'), items = [], skip = $('#ld-skip');
      $$('[data-guide]', load).forEach(function (g) { g.hidden = g.getAttribute('data-guide') !== r; if (!g.hidden) items = $$('li', g); });
      if (guide) guide.hidden = !items.length;
      load.classList.toggle('has-guide', items.length > 0);
      items.forEach(function (li) { li.classList.remove('on', 'done'); });
      seen[r] = 1; store.set(GUIDE_KEY, seen);
      show('load');
      var pct = $('#sp-pct'), fill = $('#sp-fill'), bar = $('#sp-bar'), t0 = null, gone = false;
      function go() { if (gone) return; gone = true; location.replace('home.html'); }
      if (skip) { skip.hidden = false; skip.onclick = go; }
      function mark(k) {
        var n = items.length, cur = Math.min(n - 1, Math.floor(k * n));
        items.forEach(function (li, i) { li.classList.toggle('on', i === cur && k < 1); li.classList.toggle('done', i < cur || k >= 1); });
      }
      function step(ts) {
        if (t0 === null) t0 = ts;
        var k = Math.min(1, (ts - t0) / DUR), v = Math.max(1, Math.round(k * 100));
        pct.textContent = v; fill.style.width = v + '%'; bar.setAttribute('aria-valuenow', v);
        if (items.length) mark(k);
        if (k < 1) requestAnimationFrame(step); else setTimeout(go, 400);
      }
      requestAnimationFrame(step);
      setTimeout(go, DUR + 1500);
    }
    $$('[data-pick]').forEach(function (b) {
      b.addEventListener('click', function () { var r = b.getAttribute('data-pick'); if (profileOf(r)) startLoad(r); else openInfo(r); });
    });
    // 카카오로 가입: 받은 정보로 바로 가입하고, 꼭 필요한데 비어 있는 칸만 묻는다
    function kakaoNote(r, msg) { var n = $('#info-' + r + ' [data-kakao-note]'); if (n) { n.hidden = false; n.textContent = msg; } }
    function autoJoin(r, p, back) {
      var nick = p.nickname || p.name || '';
      function finish() { if (back) location.replace(back); else startLoad(r); }
      if (r === 'fan' && nick) {
        var row = { name: nick.slice(0, 40), phone: p.phone || null, genres: [], area: null };
        return saveMember('fan', row).then(function () {
          put('profile-fan', { name: row.name, phone: p.phone || '', genres: [], area: '', at: TODAY });
          toast('카카오 정보로 가입했어요'); finish();
        }, function (e) { saveFail(e); openInfo('fan'); });
      }
      if (r === 'artist' && nick && p.phone) {
        var ar = { source: 'quick', name: nick.slice(0, 60), phone: p.phone, genres: [] };
        return saveMember('artist', ar).then(function () {
          put('profile-artist', { name: ar.name, phone: p.phone, lineup: '', genres: [], link: '', at: TODAY });
          toast('카카오 정보로 가입했어요 · 장르 · 편성은 정보 수정에서 더해 주세요'); finish();
        }, function (e) { saveFail(e); openInfo('artist'); });
      }
      // 사장님(매장 이름이 꼭 필요) 또는 연락처가 없는 경우: 받은 정보를 채운 입력 화면으로
      var fill = { venue: { 'pv-owner': p.name || nick, 'pv-phone': p.phone }, artist: { 'pa-name': nick, 'pa-phone': p.phone }, fan: { 'pf-name': nick, 'pf-phone': p.phone } }[r] || {};
      Object.keys(fill).forEach(function (id) { var el = document.getElementById(id); if (el && fill[id] && !el.value) el.value = fill[id]; });
      openInfo(r);
      kakaoNote(r, r === 'venue' ? '카카오에서 받은 정보를 채웠어요. 매장 이름만 입력하고 시작하세요.' : '카카오에서 받은 정보를 채웠어요. 비어 있는 칸만 입력해 주세요.');
      var first = $('#info-' + r + ' input:not([type=checkbox]):placeholder-shown'); if (first) first.focus();
    }
    function drawLogin() {
      var a = session(), p = st('kakao', null);
      $$('[data-kakao-in]').forEach(function (el) { el.hidden = !a; }); $$('[data-kakao-out]').forEach(function (el) { el.hidden = !!a; });
      $$('[data-kakao-name]').forEach(function (el) { el.textContent = '카카오 로그인됨' + (p && (p.nickname || p.name) ? ' · ' + (p.nickname || p.name) : ''); });
    }
    drawLogin();
    if (fromKakao) {
      show('load'); $('#load-name').textContent = '카카오 정보 확인 중'; $('.sp-msg', load).textContent = '카카오 로그인 중';
      $('#ld-guide').hidden = true; $('#ld-skip').hidden = true; load.classList.remove('has-guide');
      afterKakao().then(function (res) {
        var intent = store.get('csm-kakao-intent', null) || {}; store.set('csm-kakao-intent', null);
        var r = ROLE_LABEL[intent.role] ? intent.role : '', back = /^[a-z-]+\.html$/.test(intent.back || '') ? intent.back : '';
        $('.sp-msg', load).textContent = '정보 받는 중';
        ['venue', 'fan', 'artist'].forEach(function (k) { var el = $('[data-pname="' + k + '"]'); if (el) el.textContent = profileName(k); });
        drawLogin(); show('pick');
        if (r && res.mine[r]) { if (back) location.replace(back); else startLoad(r); return; }
        if (r) { autoJoin(r, res.profile, back); return; }
        var kinds = Object.keys(res.mine);
        if (kinds.length) { if (back) location.replace(back); else startLoad(kinds.indexOf(st('role', '')) >= 0 ? st('role', '') : kinds[0]); return; }
        toast('처음이시네요! 어떤 역할로 시작할지 골라 주세요');
      }, function () { show('pick'); toast('카카오 정보를 불러오지 못했어요. 다시 시도해 주세요'); });
    }
    $('#pf-back').addEventListener('click', function () { show('pick'); });
    setupRoleForm('fan', ['pf-name'], 'pf-agree', { 'pf-name': 'name', 'pf-phone': 'phone' }, function () {
      return { name: val('pf-name'), phone: val('pf-phone'), genres: picked($('#pf-genres')), area: picked($('#pf-area'))[0] || '' };
    }, function (d) {
      return ['fan', { name: d.name, phone: d.phone || null, genres: d.genres, area: d.area || null }];
    }, startLoad);
    setupRoleForm('venue', ['pv-venue', 'pv-owner', 'pv-phone'], 'pv-agree', { 'pv-venue': 'venue', 'pv-owner': 'owner', 'pv-phone': 'phone', 'pv-area': 'area' }, function () {
      return { venue: val('pv-venue'), owner: val('pv-owner'), phone: val('pv-phone'), area: val('pv-area'), styles: picked($('#pv-styles')), days: picked($('#pv-days')) };
    }, function (d) {
      return ['venue', { source: 'quick', venue_name: d.venue, owner_name: d.owner, phone: d.phone, area: d.area || null, styles: d.styles, open_days: d.days }];
    }, startLoad);
    setupRoleForm('artist', ['pa-name', 'pa-phone'], 'pa-agree', { 'pa-name': 'name', 'pa-phone': 'phone', 'pa-insta': 'instagram', 'pa-yt': 'youtube' }, function () {
      var sns = snsCheck('pa'); if (!sns) return null;
      return { name: val('pa-name'), phone: val('pa-phone'), lineup: picked($('#pa-lineup'))[0] || '', genres: picked($('#pa-genres')), link: '', instagram: sns.instagram, youtube: sns.youtube };
    }, function (d) {
      return ['artist', { source: 'quick', name: d.name, phone: d.phone, lineup: d.lineup || null, genres: d.genres, details: { instagram: d.instagram || '', youtube: d.youtube || '' } }];
    }, startLoad);
    var edit = new URLSearchParams(location.search).get('edit');
    if (edit && ROLE_LABEL[edit]) openInfo(edit);
  };

  // 홈: 시작 화면에서 고른 프로필에 맞는 화면만
  PAGES.home = function () {
    var q = new URLSearchParams(location.search).get('as');
    var role = ROLE_LABEL[q] ? q : st('role', 'fan');
    if (!ROLE_LABEL[role]) role = 'fan';
    if (q) put('role', role);
    $$('[data-for-role]').forEach(function (s) { s.hidden = s.getAttribute('data-for-role') !== role; });
    var p = profileOf(role), g = $('[data-greet="' + role + '"]'), e = $('[data-edit="' + role + '"]');
    if (p && g) g.textContent = role === 'venue' ? p.venue + ' · ' + p.owner + ' 사장님, 반가워요' : p.name + '님, 반가워요';
    if (p && e) e.textContent = '정보 수정';
    bindReq(document, true);
    var vw = $('#v-week'); if (vw) vw.innerHTML = weekHtml();
    // 검색: 가수 이름으로 다음 공연 찾기
    var form = $('#search');
    if (form) form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var qq = $('#q').value.trim().replace(/\s+/g, '').toLowerCase(); if (!qq) return;
      var hit = D.shows.filter(function (s) { return s.d >= TODAY && s.a && s.a.replace(/\s+/g, '').toLowerCase().indexOf(qq) >= 0; })
        .sort(function (x, y) { return (x.d + x.t) < (y.d + y.t) ? -1 : 1; })[0];
      if (hit) location.href = 'schedule.html#d-' + hit.d;
      else toast('‘' + $('#q').value.trim() + '’ 님의 다가오는 공연을 찾지 못했어요');
    });
    board($('#board'));
    bindFan();
    drawMyBookings($('#my-bookings'));
    var view = $('#view-' + role);
    if (role === 'venue' || role === 'artist') {
      memberStatus(role, view).then(function (pr) {
        if (pr && g && !p) g.textContent = role === 'venue' ? pr.name + ' 사장님, 반가워요' : pr.name + '님, 반가워요';
        if (role === 'venue') venueHome(pr); else artistHome(pr);
      });
      if (role === 'artist') loadPublicList('artist', view);
      loadInbox(role, view);
    }
  };

  /* ---------- 내 예약 (상태는 서버에서): 홈 맨 위 · 예약 화면 위 · 내 예약 화면 ---------- */
  var BSTATUS = { requested: ['확인 중', 'wait'], confirmed: ['예약 확정', 'yes'], declined: ['예약 불가', 'no'], cancelled: ['취소됨', 'done'],
                  visited: ['방문 완료', 'yes'], noshow: ['노쇼', 'no'], local: ['전달 안 됨', 'no'] };
  var BNOTE = { requested: '매장에서 확인하고 있어요 · 확정되면 알림톡으로 알려 드려요', confirmed: '자리가 준비됐어요 · 공연 시간에 맞춰 방문해 주세요',
                declined: '이번에는 예약이 어려워요 · 매장 답변을 확인해 주세요', cancelled: '취소된 예약이에요', visited: '다녀가 주셔서 감사해요',
                noshow: '방문 기록이 없는 예약이에요', local: '인터넷이 끊겨 매장에 전달되지 않았어요 · 다시 신청해 주세요' };
  function bookCode(ref) { return String(ref || '').replace(/-/g, '').slice(0, 6).toUpperCase(); }
  function myBookingsLocal() { return store.get(BOOK_KEY, []) || []; }
  function isUpcoming(b) { return b.d ? b.d >= TODAY : (b.at || TODAY) >= addDays(TODAY, -30); }
  function splitBookings(all) {
    var up = all.filter(isUpcoming).sort(function (a, b) { return ((a.d || '9') + (a.t || '')) < ((b.d || '9') + (b.t || '')) ? -1 : 1; });
    var past = all.filter(function (b) { return !isUpcoming(b); }).sort(function (a, b) { return (a.d || '') < (b.d || '') ? 1 : -1; });
    return { up: up, past: past };
  }
  // 서버에서 최신 상태 받기: 이 기기에서 신청한 예약 번호 + (손님 정보를 등록했다면) 다른 기기에서 신청한 예약
  function refreshBookings() {
    var all = myBookingsLocal();
    if (!SB_ON) return Promise.resolve(all);
    var refs = all.filter(function (b) { return b.ref && b.status !== 'local'; }).map(function (b) { return b.ref; }).slice(-50), fm = member('fan');
    return Promise.all([
      refs.length ? sbRpc('my_bookings', { p_refs: refs }).catch(function () { return null; }) : Promise.resolve([]),
      fm ? sbRpc('my_fan_bookings', { p_id: fm.id, p_token: fm.token }).catch(function () { return null; }) : Promise.resolve([])
    ]).then(function (r) {
      if (!r[0] && !r[1]) return all;
      var byRef = {}; all.forEach(function (b) { if (b.ref) byRef[b.ref] = b; });
      (r[0] || []).concat(r[1] || []).forEach(function (x) {
        var b = byRef[x.ref];
        if (!b) { b = { ref: x.ref, at: String(x.created_at || '').slice(0, 10) }; all.push(b); byRef[x.ref] = b; }
        b.kind = x.kind; b.d = x.show_date; b.t = x.show_time || ''; b.a = x.artist || (x.kind === 'rent' ? '대관 견적' : ''); b.ppl = x.people;
        b.status = x.status; b.reply = x.reply || ''; if (x.venue_name) b.v = x.venue_name;
      });
      store.set(BOOK_KEY, all.slice(-60));
      return all;
    });
  }
  function bookCardHtml(b) {
    var st = BSTATUS[b.status] || BSTATUS.requested;
    var when = b.kind === 'rent' ? '대관 견적' + (b.d ? ' · ' + dayLabel(b.d) : '') : ((b.d === TODAY ? '오늘 ' : '') + (b.d ? dayLabel(b.d) : '') + (b.t ? ' ' + b.t : '')).trim();
    var sub = [b.v || HANG, b.kind !== 'rent' && b.a ? b.a : '', b.ppl ? b.ppl + '명' : ''].filter(Boolean).join(' · ');
    return '<article class="mybk' + (b.status === 'confirmed' ? ' is-yes' : '') + '" data-ref="' + esc(b.ref || '') + '">' +
      '<div class="mb-top"><div class="stack" style="gap:2px;min-width:0"><span class="mb-when">' + esc(when || '날짜 협의') + '</span><span class="mb-sub">' + esc(sub) + '</span></div><span class="pill ' + st[1] + '">' + esc(st[0]) + '</span></div>' +
      '<span class="mb-msg">' + esc(BNOTE[b.status] || BNOTE.requested) + '</span>' +
      (b.reply ? '<div class="mb-reply"><b>매장 답변</b> ' + esc(b.reply) + '</div>' : '') +
      (b.status === 'local' ? '<a class="btn sm" href="booking.html" style="align-self:flex-start">다시 신청하기</a>'
        : (b.ref ? '<span class="mb-code">예약번호 ' + bookCode(b.ref) + (b.at ? ' · ' + md(b.at) + ' 신청' : '') + '</span>' : '')) + '</article>';
  }
  // 홈(손님) 맨 위: 다가오는 예약 3건
  function drawMyBookings(box) {
    if (!box) return;
    var listEl = $('#mb-home-list', box);
    function paint(all) {
      var up = splitBookings(all).up.slice(0, 3);
      box.hidden = !up.length;
      if (listEl) listEl.innerHTML = up.map(bookCardHtml).join('');
    }
    paint(myBookingsLocal());
    refreshBookings().then(paint, function () { /* 저장된 상태로 */ });
  }
  // 예약 화면 위: 내 예약 요약 (누르면 내 예약 화면)
  function drawBookSummary() {
    var el = $('#b-mine'); if (!el) return;
    function paint(all) {
      var up = splitBookings(all).up;
      el.hidden = !up.length; if (!up.length) return;
      var yes = up.filter(function (b) { return b.status === 'confirmed'; }).length, wait = up.filter(function (b) { return b.status === 'requested'; }).length;
      var next = up[0];
      el.innerHTML = '<span style="color:var(--accent);flex:none">' + ICON.ticket + '</span><span style="flex:1;min-width:0"><b>내 예약 ' + up.length + '건</b>' +
        '<span class="tiny">' + esc([yes ? '확정 ' + yes : '', wait ? '확인 중 ' + wait : ''].filter(Boolean).join(' · ') + (next && next.d ? ' · 가장 가까운 예약 ' + dayLabel(next.d) + (next.t ? ' ' + next.t : '') : '')) + '</span></span>' + ICON.chev;
    }
    paint(myBookingsLocal());
    refreshBookings().then(paint, function () {});
  }

  /* ---------- 컨택: 가수 ↔ 라이브바 (보내기 · 받기 · 수락/거절) ---------- */
  var CSTATUS = { requested: ['답 기다리는 중', 'wait'], accepted: ['수락', 'yes'], declined: ['거절', 'no'], cancelled: ['취소', 'done'] };
  function demoOff(box, slot) { var d = box.parentNode && box.parentNode.querySelector('[data-demo="' + slot + '"]'); if (d) d.hidden = true; }
  function memberStatus(kind, root) {
    var boxes = $$('[data-real="status"]', root || document);
    function note(html) { boxes.forEach(function (b) { b.hidden = !html; b.innerHTML = html || ''; }); }
    var m = member(kind);
    var reg = '<div class="note row" style="gap:10px;align-items:center"><span style="flex:1">' +
      (kind === 'venue' ? '매장을 등록하면 가수들의 실제 컨택 요청이 여기에 쌓여요.' : '프로필을 등록하면 라이브바와 실제 컨택을 주고받을 수 있어요.') +
      '</span><a class="btn sm" href="index.html?edit=' + kind + '">등록하기</a></div>';
    if (!m || !SB_ON) { note(SB_ON ? reg : ''); return Promise.resolve(null); }
    return sbRpc('my_profile', { p_kind: kind, p_id: m.id, p_token: m.token }).then(function (rows) {
      var p = rows && rows[0];
      if (!p) { put('member-' + kind, null); note(reg); return null; }
      $$('[data-me-name]').forEach(function (el) { el.textContent = el.tagName === 'H1' ? p.name : p.name + ' 파트너'; });
      var msg = p.status === 'approved' ? '' : p.status === 'rejected' ? '등록이 반려됐어요. 운영팀에 문의해 주세요.'
        : kind === 'venue' ? '매장 승인 대기 중이에요. 승인되면 가수들에게 매장이 보이고 컨택을 받을 수 있어요.'
        : '프로필 승인 대기 중이에요. 승인되면 사장님들에게 프로필이 보여요. 승인된 매장에는 지금도 컨택할 수 있어요.';
      note(msg ? '<p class="note">' + esc(msg) + '</p>' : '');
      return p;
    }, function () { note(''); return null; });
  }
  function myContacts(kind) {
    var m = member(kind); if (!m || !SB_ON) return Promise.resolve([]);
    return sbRpc('my_contacts', { p_kind: kind, p_id: m.id, p_token: m.token }).then(function (r) { return r || []; }, function () { return []; });
  }
  function telOf(p) { return String(p || '').replace(/[^0-9+]/g, ''); }
  function linkOf(u) { u = String(u || '').trim(); return /^https?:\/\//i.test(u) ? u : ''; }
  function wishText(c) { return [c.wish_date ? dayLabel(c.wish_date) : '', c.wish_time || '', c.pay || ''].filter(Boolean).join(' · ') || '일정 · 조건 협의'; }
  function publicCard(kind, x, sentId) {
    // kind = 나 (artist 는 라이브바 목록, venue 는 가수 목록을 본다)
    var meta = kind === 'artist' ? [x.category, x.area].filter(Boolean).join(' · ') : [x.lineup, (x.genres || []).join(', '), x.region].filter(Boolean).join(' · ');
    var tags = kind === 'artist' ? (x.styles || []).concat(x.open_days && x.open_days.length ? [x.open_days.join('·') + ' 공연'] : [], x.capacity ? ['최대 ' + x.capacity + '명'] : []) : [];
    var link = kind === 'venue' ? linkOf(x.link) : '';
    var name = kind === 'artist' ? x.venue_name : x.name;
    return '<article class="mcard">' +
      '<div class="stack" style="gap:3px"><h3>' + esc(name) + '</h3><span class="tiny">' + esc(meta || '컨택싱어 승인 ' + (kind === 'artist' ? '매장' : '가수')) + '</span></div>' +
      (tags.length ? '<div class="chips">' + tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
      (x.bio ? '<p class="why">' + esc(x.bio) + '</p>' : '') +
      (kind === 'venue' && snsHtml(x) ? '<div class="sns-row">' + snsHtml(x) + '</div>' : '') +
      '<div class="row" style="gap:8px">' + (link ? '<a class="btn ghost sm" href="' + esc(link) + '" target="_blank" rel="noopener">공연 영상 · 음원</a>' : '') +
      '<button type="button" class="btn ' + (sentId ? 'outline ' : '') + (link ? 'sm' : 'block') + '" style="flex:1" data-contact-to="' + esc(x.id) + '" data-name="' + esc(name) + '"' + (sentId ? ' disabled' : '') + '>' +
      (sentId ? '컨택 보냄 · 답 기다리는 중' : (kind === 'artist' ? '이 무대에 컨택하기' : '컨택 요청')) + '</button></div></article>';
  }
  function loadPublicList(kind, root) {
    var boxes = $$('[data-real="list"]', root || document);
    if (!boxes.length || !SB_ON) return;
    Promise.all([sbRpc(kind === 'artist' ? 'public_venues' : 'public_artists', {}), myContacts(kind)]).then(function (r) {
      var m = member(kind), list = (r[0] || []).filter(function (x) { return !m || x.id !== m.id; });
      if (!list.length) return;                                   // 아직 승인된 상대가 없으면 예시 화면 그대로
      var sent = {}; (r[1] || []).forEach(function (c) { if (c.box === 'sent' && c.status === 'requested') sent[c.other_id] = c.id; });
      boxes.forEach(function (box) {
        var lim = +(box.getAttribute('data-limit') || 100);
        box.innerHTML = list.slice(0, lim).map(function (x) { return publicCard(kind, x, sent[x.id]); }).join('') +
          (list.length > lim ? '<a class="sub" href="' + (kind === 'artist' ? 'match.html' : 'venue-match.html') + '" style="padding:6px 0">' + list.length + (kind === 'artist' ? '곳' : '팀') + ' 모두 보기 ›</a>' : '');
        box.hidden = false; demoOff(box, 'list');
        $$('[data-contact-to]', box).forEach(function (b) {
          b.addEventListener('click', function () {
            openContact(kind, b.getAttribute('data-contact-to'), b.getAttribute('data-name'), function () {
              b.disabled = true; b.classList.add('outline'); b.textContent = '컨택 보냄 · 답 기다리는 중';
              loadInbox(kind, root);
            });
          });
        });
      });
    }, function () { /* 서버 연결 불가: 예시 화면 그대로 */ });
  }
  function contactSheet() {
    var bg = $('#sheet-contact'); if (bg) return bg;
    bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'sheet-contact'; bg.hidden = true;
    bg.innerHTML = '<div class="sheet form-sheet" role="dialog" aria-modal="true" aria-labelledby="sc-t"><h2 id="sc-t">컨택 보내기</h2><p class="tiny" id="sc-sub"></p>' +
      '<div class="grid g2" style="gap:10px"><div class="field"><label class="lbl" for="sc-date">희망 날짜</label><input class="in-text" id="sc-date" type="date"></div>' +
      '<div class="field"><label class="lbl" for="sc-time">시간</label><select class="in-text" id="sc-time"><option value="">협의</option><option>18:00</option><option>19:00</option><option>19:30</option><option>20:00</option><option>21:00</option></select></div></div>' +
      '<div class="field"><label class="lbl" for="sc-pay">페이 · 조건</label><input class="in-text" id="sc-pay" maxlength="60" placeholder="예: 회당 15만원 · 협의"></div>' +
      '<div class="field"><label class="lbl" for="sc-msg">메시지</label><textarea class="in-text" id="sc-msg" maxlength="500" rows="4" style="padding:10px 14px;min-height:96px"></textarea></div>' +
      '<p class="tiny">상대가 수락하면 서로의 연락처가 보여요.</p>' +
      '<button type="button" class="btn block" id="sc-send">컨택 보내기</button><button type="button" class="btn ghost block" data-close>취소</button></div>';
    document.body.appendChild(bg);
    return bg;
  }
  function openContact(kind, to, name, done) {
    var m = member(kind);
    if (!m) { toast(kind === 'artist' ? '먼저 가수 프로필을 등록해 주세요' : '먼저 매장을 등록해 주세요'); setTimeout(function () { location.href = 'index.html?edit=' + kind; }, 1200); return; }
    var bg = contactSheet(), btn = $('#sc-send');
    $('#sc-t').textContent = name + '에게 컨택';
    $('#sc-sub').textContent = kind === 'artist' ? '공연하고 싶은 날짜와 조건을 남기면 사장님이 확인하고 답해요.' : '모시고 싶은 날짜와 조건을 남기면 가수가 확인하고 답해요.';
    $('#sc-date').min = TODAY; $('#sc-date').value = ''; $('#sc-time').value = ''; $('#sc-pay').value = '';
    $('#sc-msg').value = kind === 'artist' ? '안녕하세요! 이 무대에서 공연하고 싶어요.' : '안녕하세요! 저희 매장 무대에 모시고 싶어요.';
    btn.onclick = function () {
      busy(btn, true);
      sbRpc('send_contact', { p_from: kind, p_id: m.id, p_token: m.token, p_to: to, p_date: $('#sc-date').value || null, p_time: $('#sc-time').value || null,
                              p_pay: val('sc-pay') || null, p_message: val('sc-msg') || null })
        .then(function () { busy(btn, false); closeSheet(bg); toast(name + '에게 컨택을 보냈어요'); if (done) done(); },
              function (e) { busy(btn, false); toast(errMsg(e, '보내지 못했어요. 잠시 후 다시 시도해 주세요')); });
    };
    openSheet('sheet-contact');
  }
  function replySheet() {
    var bg = $('#sheet-reply'); if (bg) return bg;
    bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'sheet-reply'; bg.hidden = true;
    bg.innerHTML = '<div class="sheet form-sheet" role="dialog" aria-modal="true" aria-labelledby="sr-t"><h2 id="sr-t">컨택에 답하기</h2><p class="tiny" id="sr-sub"></p>' +
      '<div class="field"><label class="lbl" for="sr-msg">한마디 (상대에게 보여요)</label><textarea class="in-text" id="sr-msg" maxlength="300" rows="3" style="padding:10px 14px;min-height:80px"></textarea></div>' +
      '<button type="button" class="btn block" id="sr-ok">보내기</button><button type="button" class="btn ghost block" data-close>닫기</button></div>';
    document.body.appendChild(bg);
    return bg;
  }
  function contactItem(c) {
    var stt = CSTATUS[c.status] || [c.status, 'done'], recv = c.box === 'received', ph = c.status === 'accepted' ? telOf(c.other_phone) : '', link = linkOf(c.other_link);
    var label = recv && c.status === 'requested' ? ['새 요청', 'yes'] : stt;
    return '<article class="mcard" data-cid="' + esc(c.id) + '">' +
      '<div class="between" style="align-items:flex-start;gap:10px"><div class="stack" style="gap:2px;min-width:0"><span class="tiny">' + (recv ? '받은 컨택' : '보낸 컨택') + ' · ' + esc(dayLabel(String(c.created_at).slice(0, 10))) + '</span>' +
      '<b style="font-size:15px">' + esc(c.other_name || '') + '</b>' + (c.other_info ? '<span class="tiny">' + esc(c.other_info) + '</span>' : '') + '</div><span class="pill ' + label[1] + '">' + esc(label[0]) + '</span></div>' +
      '<span class="tiny" style="color:var(--fg-2)">희망 · ' + esc(wishText(c)) + '</span>' +
      (c.message ? '<p class="why">' + esc(c.message) + '</p>' : '') +
      (c.reply ? '<p class="note"><b>' + (recv ? '내 답장' : '답장') + '</b> ' + esc(c.reply) + '</p>' : '') +
      (link ? '<a class="sub" href="' + esc(link) + '" target="_blank" rel="noopener">공연 영상 · 음원 보기 ›</a>' : '') +
      (ph ? '<div class="row" style="gap:8px;align-items:center"><a class="btn sm" href="tel:' + esc(ph) + '">전화</a><a class="btn ghost sm" href="sms:' + esc(ph) + '">문자</a><span class="tiny">' + esc(c.other_phone) + '</span></div>' : '') +
      (recv && c.status === 'requested' ? '<div class="grid g2" style="gap:8px"><button type="button" class="btn ghost sm" data-act="declined">거절</button><button type="button" class="btn sm" data-act="accepted">수락</button></div>' : '') +
      (!recv && c.status === 'requested' ? '<button type="button" class="btn ghost sm" data-act="cancel" style="align-self:flex-start">컨택 취소</button>' : '') +
      '</article>';
  }
  function loadInbox(kind, root) {
    var boxes = $$('[data-real="inbox"]', root || document);
    if (!boxes.length || !member(kind) || !SB_ON) return;
    myContacts(kind).then(function (list) {
      boxes.forEach(function (box) {
        var lim = +(box.getAttribute('data-limit') || 100);
        box.hidden = false; demoOff(box, 'inbox');
        box.innerHTML = !list.length ? '<p class="empty">' + (kind === 'venue' ? '아직 받은 컨택 요청이 없어요. 매장이 승인되면 가수들이 컨택할 수 있고, 가수 섭외에서 먼저 컨택할 수도 있어요.' : '아직 주고받은 컨택이 없어요. 마음에 드는 무대에 먼저 컨택해 보세요.') + '</p>'
          : list.slice(0, lim).map(contactItem).join('') + (list.length > lim ? '<a class="sub" href="' + (kind === 'venue' ? 'partner.html' : 'match.html') + '" style="padding:6px 0">' + list.length + '건 모두 보기 ›</a>' : '');
        if (box.getAttribute('data-bound')) return;
        box.setAttribute('data-bound', '1');
        box.addEventListener('click', function (e) {
          var b = e.target.closest('[data-act]'); if (!b) return;
          var card = b.closest('[data-cid]'), cid = card.getAttribute('data-cid'), act = b.getAttribute('data-act'), m = member(kind);
          if (!m) return;
          if (act === 'cancel') {
            busy(b, true);
            sbRpc('cancel_contact', { p_from: kind, p_id: m.id, p_token: m.token, p_contact: cid }).then(function (ok) { toast(ok ? '컨택을 취소했어요' : '이미 답을 받은 컨택이에요'); loadInbox(kind, root); loadPublicList(kind, root); },
              function () { busy(b, false); toast('취소하지 못했어요. 잠시 후 다시 시도해 주세요'); });
            return;
          }
          var bg = replySheet(), ok = $('#sr-ok'), name = $('b', card).textContent;
          $('#sr-t').textContent = act === 'accepted' ? name + '의 컨택을 수락할까요?' : name + '의 컨택을 거절할까요?';
          $('#sr-sub').textContent = act === 'accepted' ? '수락하면 서로의 연락처가 보여요. 일정은 전화나 문자로 맞춰 주세요.' : '정중한 한마디를 남기면 다음 컨택으로 이어지기 쉬워요.';
          $('#sr-msg').value = act === 'accepted' ? '좋아요! 연락드릴게요.' : '이번에는 일정이 맞지 않아요. 다음에 꼭 함께해요.';
          ok.textContent = act === 'accepted' ? '수락하기' : '거절하기';
          ok.onclick = function () {
            busy(ok, true);
            sbRpc('respond_contact', { p_kind: kind, p_id: m.id, p_token: m.token, p_contact: cid, p_status: act, p_reply: val('sr-msg') || null }).then(function (done) {
              busy(ok, false); ok.textContent = act === 'accepted' ? '수락하기' : '거절하기'; closeSheet(bg);
              toast(done ? (act === 'accepted' ? '수락했어요 · 이제 서로 연락할 수 있어요' : '거절했어요') : '이미 처리된 컨택이에요');
              loadInbox(kind, root);
            }, function () { busy(ok, false); toast('보내지 못했어요. 잠시 후 다시 시도해 주세요'); });
          };
          openSheet('sheet-reply');
        });
      });
    });
  }

  PAGES.clip = function () {
    var v = $('#clip-video'), sb = $('#sound'), CL = D.clips || [];
    if (!v) return;
    var BASE = [1024, 812, 1350], q = +(new URLSearchParams(location.search).get('v') || 1);
    var i = Math.min(Math.max(1, q || 1), Math.max(1, CL.length)) - 1, lb = $('#like'), fb = $('#follow');
    function cur() { return CL[i] || {}; }
    function drawLike() {
      var on = !!(st('liked', {})['clip-' + cur().id]);
      lb.setAttribute('aria-pressed', on ? 'true' : 'false'); $('[data-count]', lb).textContent = won((BASE[i] || 900) + (on ? 1 : 0));
    }
    function drawFollow() {
      var on = !!(st('follow-clips', {})[cur().id]);
      fb.setAttribute('aria-pressed', on ? 'true' : 'false'); fb.textContent = on ? '팔로잉' : '팔로우'; fb.classList.toggle('light', !on); fb.classList.toggle('ghost', on);
    }
    function setClip(n, first) {
      if (!CL.length) return;
      i = (n + CL.length) % CL.length;
      var c = cur();
      if (!first) {
        v.classList.add('swap');
        v.src = '' + c.src; v.poster = '' + c.poster;
        v.setAttribute('aria-label', '행2PM8PM ' + c.title);
        var p = v.play(); if (p && p.catch) p.catch(function () { /* 자동재생 제한 */ });
        setTimeout(function () { v.classList.remove('swap'); }, 180);
        try { history.replaceState(null, '', '?v=' + c.n); } catch (e) { /* 미리보기 등 주소 변경 불가 */ }
      }
      $('#clip-h1').textContent = '행2PM8PM ' + c.title;
      $('#clip-title').textContent = c.title;
      $('#clip-sub').textContent = c.sub + ' · 행2PM8PM 실제 공연';
      $('#clip-cap').textContent = c.cap;
      $('#clip-thumb').src = '' + c.prev_poster;
      $('#clip-idx').textContent = '행2PM8PM · ' + (i + 1) + ' / ' + CL.length;
      $$('#clip-dots i').forEach(function (d, k) { d.classList.toggle('on', k === i); });
      drawLike(); drawFollow();
    }
    if (sb) sb.addEventListener('click', function () {
      v.muted = !v.muted; if (!v.muted) v.play().catch(function () { /* 자동재생 제한 */ });
      sb.setAttribute('aria-pressed', v.muted ? 'false' : 'true'); sb.setAttribute('aria-label', v.muted ? '소리 켜기' : '소리 끄기');
      $('.ic-mute', sb).hidden = !v.muted; $('.ic-sound', sb).hidden = v.muted;
    });
    lb.addEventListener('click', function () { var l = st('liked', {}); l['clip-' + cur().id] = !l['clip-' + cur().id]; put('liked', l); drawLike(); });
    fb.addEventListener('click', function () {
      var f = st('follow-clips', {}); f[cur().id] = !f[cur().id]; put('follow-clips', f); drawFollow();
      toast(f[cur().id] ? '팔로우했어요 · 이 가수의 다음 무대를 알려드릴게요' : '팔로우를 취소했어요');
    });
    $('#clip-next').addEventListener('click', function () { setClip(i + 1); });
    $('#clip-prev').addEventListener('click', function () { setClip(i - 1); });
    // 위로 밀면 다음 영상, 아래로 밀면 이전 영상 (릴스처럼)
    var y0 = null;
    v.addEventListener('touchstart', function (e) { y0 = e.touches[0].clientY; }, { passive: true });
    v.addEventListener('touchend', function (e) {
      if (y0 === null) return; var dy = e.changedTouches[0].clientY - y0; y0 = null;
      if (Math.abs(dy) > 50) setClip(dy < 0 ? i + 1 : i - 1);
    });
    var wheelAt = 0;
    v.addEventListener('wheel', function (e) { var now = Date.now(); if (now - wheelAt < 700 || Math.abs(e.deltaY) < 30) return; wheelAt = now; setClip(e.deltaY > 0 ? i + 1 : i - 1); }, { passive: true });
    document.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setClip(i + 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); setClip(i - 1); }
    });
    v.addEventListener('click', function () { if (v.paused) v.play().catch(function () {}); else v.pause(); });
    if (q > 1 && CL[i]) { v.src = '' + CL[i].src; v.poster = '' + CL[i].poster; v.play && v.play().catch(function () {}); }
    setClip(i, true);
    var sh = $('#share'); if (sh) sh.addEventListener('click', function () { share('컨택싱어 · 행2PM8PM ' + cur().title); });
    var ns = nextShow(function (x) { return isHang(x.v); }), box = $('#tonight');
    if (box && ns) {
      $('[data-k="head"]', box).textContent = ns.d === TODAY ? '이 무대, 오늘 밤에도 열려요' : '이 무대의 다음 공연 · ' + dayLabel(ns.d);
      $('[data-k="line"]', box).textContent = '행2PM8PM · ' + ns.t + ' ' + who(ns);
      $('a', box).setAttribute('href', bookHref(ns));
    }
  };

  PAGES.booking = function () {
    var q = new URLSearchParams(location.search), qd = q.get('d'), qt = q.get('t'), qs = q.get('show');
    // 매장: 공연이 있는 매장들 (행2PM8PM 먼저)
    var venues = [];
    D.shows.forEach(function (s) { if (s.d >= TODAY && s.type !== 'rental' && !venues.some(function (x) { return x.v === s.v; })) venues.push({ v: s.v, vid: s.vid, area: s.area }); });
    venues.sort(function (a, b) { return isHang(a.v) ? -1 : isHang(b.v) ? 1 : 0; });
    var qShow = qs ? D.shows.filter(function (s) { return s.id === qs; })[0] : null;
    var curV = qShow ? qShow.v : (venues[0] ? venues[0].v : HANG);
    if (qShow) { qd = qShow.d; qt = qShow.t; }
    function pickV(s) { return s.v === curV; }
    var dates;
    function calcDates() {
      dates = scheduleDates(TODAY, 7, pickV);
      if (qd && qd >= TODAY && dates.indexOf(qd) < 0 && showsOn(qd, pickV).length) dates = scheduleDates(qd, 7, pickV);
    }
    calcDates();
    // 처음 고르는 날짜: 대관일을 건너뛰고 예약할 수 있는 공연이 있는 첫날
    function firstDay() { for (var i = 0; i < dates.length; i++) { if (showsOn(dates[i], pickV).some(function (s) { return s.type !== 'rental'; })) return dates[i]; } return dates[0]; }
    var f = fan(), vg = grade(VISIT, f.visits);
    var mode = 'watch', day = (qd && dates.indexOf(qd) >= 0) ? qd : firstDay(), si = 0, ppl = 2;
    if (qt && day === qd) { var idx = showsOn(day, pickV).filter(function (s) { return s.type !== 'rental'; }).map(function (s) { return s.t; }).indexOf(qt); if (idx >= 0) si = idx; }
    var daysEl = $('#b-days'), showsEl = $('#b-shows'), cta = $('#b-cta');
    single($('#b-mode'), function (b) { mode = b.getAttribute('data-v'); draw(); });
    function drawVenue() {
      var box = $('#b-venue-box'), vEl = $('#b-venues'), info = venues.filter(function (x) { return x.v === curV; })[0] || { v: curV, area: HANG_AREA };
      if (box) box.hidden = venues.length < 2;
      if (vEl) vEl.innerHTML = venues.map(function (x) { return '<button type="button" class="chip" data-venue="' + esc(x.v) + '" aria-pressed="' + (x.v === curV) + '">' + esc(x.v) + '</button>'; }).join('');
      var hang = isHang(curV);
      $('#b-vname').textContent = curV; $('#b-varea').textContent = hang ? '을지로 · 1–3층' : areaOf(info);
      $('#b-vtags').hidden = !hang; $('#b-video').hidden = !hang;
      var rt = $('#b-rent-tab'); if (rt) { rt.hidden = !hang; if (!hang && mode === 'rent') { mode = 'watch'; $$('#b-mode button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === 'watch' ? 'true' : 'false'); }); } }
    }
    var vEl0 = $('#b-venues');
    if (vEl0) vEl0.addEventListener('click', function (e) {
      var b = e.target.closest('[data-venue]'); if (!b) return;
      curV = b.getAttribute('data-venue'); qd = null; qt = null; calcDates(); day = firstDay(); si = 0; drawVenue(); draw();
    });
    drawVenue();
    drawBookSummary();
    $('#b-dec').addEventListener('click', function () { ppl = Math.max(1, ppl - 1); draw(); });
    $('#b-inc').addEventListener('click', function () { ppl = Math.min(20, ppl + 1); draw(); });
    daysEl.addEventListener('click', function (e) { var b = e.target.closest('button[data-d]'); if (!b) return; day = b.getAttribute('data-d'); si = 0; draw(); var nb = $('[data-d="' + day + '"]', daysEl); if (nb) nb.focus(); });
    showsEl.addEventListener('click', function (e) { var b = e.target.closest('button[data-i]'); if (!b) return; si = +b.getAttribute('data-i'); draw(); var nb = $('[data-i="' + si + '"]', showsEl); if (nb) nb.focus(); });
    function list() { return day ? showsOn(day, pickV).filter(function (s) { return s.type !== 'rental'; }) : []; }
    function draw() {
      $$('[data-mode]').forEach(function (el) { el.hidden = el.getAttribute('data-mode') !== mode; });
      if (!dates.length) { daysEl.innerHTML = '<p class="empty" style="grid-column:1/-1">다음 공연 일정이 곧 올라와요</p>'; }
      else daysEl.innerHTML = dates.map(function (d) {
        return '<button type="button" class="dchip' + (isRental(d, pickV) ? ' empty-day' : '') + '" aria-pressed="' + (d === day) + '" data-d="' + d + '" aria-label="' + dayLabel(d) + '" style="min-width:0"><small>' + rel(d) + '</small><b>' + (+d.split('-')[2]) + '</b></button>';
      }).join('');
      $('#b-day-label').textContent = day ? dayLabel(day) : '';
      var l = list(); if (si >= l.length) si = 0;
      if (!l.length) showsEl.innerHTML = '<p class="empty">' + (day && isRental(day, pickV) ? '대관일이라 일반 공연이 없어요. 다른 날짜를 골라 주세요.' : '이날은 공연이 없어요.') + '</p>';
      else showsEl.innerHTML = l.map(function (s, i) {
        return '<button type="button" class="role" aria-pressed="' + (i === si) + '" data-i="' + i + '" style="flex-direction:row;align-items:center;gap:14px;min-height:64px;padding:0 16px">' +
          '<span class="mono" style="font-size:16px;font-weight:700;color:var(--accent)">' + esc(s.t) + '</span>' +
          '<span class="r-t"><b style="font-size:15px">' + esc(who(s)) + '</b><span>' + esc((s.p || '1회 공연') + ' · ' + (s.v || HANG)) + '</span></span><span class="radio"></span></button>';
      }).join('');
      $('#b-ppl').textContent = ppl + '명';
      var total = won(ppl * 10000) + '원';
      var s = l[si];
      $('#b-picked').textContent = s ? dayLabel(day) + ' ' + s.t + ' ' + who(s) : '공연을 골라 주세요';
      $('#b-visit').textContent = '방문하면 직관 등급이 자동으로 올라가요 · 지금 ' + vg.name + ' ' + f.visits + '회 → ' + (f.visits + 1) + '회';
      var front = $('#b-front'); if (front) { var ok = f.visits >= 30; front.disabled = !ok; front.setAttribute('aria-disabled', ok ? 'false' : 'true'); }
      if (mode === 'watch') { cta.textContent = s ? '예약 신청하기 · ' + ppl + '명' : '예약할 공연이 없어요'; cta.disabled = !s; }
      else { cta.textContent = '대관 견적 요청하기'; cta.disabled = false; }
    }
    single($('#b-seat'));
    var pf = profileOf('fan') || {}, kp = st('kakao', null) || {};
    if ((pf.name || kp.name || kp.nickname) && !val('b-name')) $('#b-name').value = pf.name || kp.name || kp.nickname;
    if ((pf.phone || kp.phone) && !val('b-phone')) $('#b-phone').value = pf.phone || kp.phone;
    if (session()) $$('#b-guest [data-kakao-out]').forEach(function (el) { el.remove(); });
    $('#b-agree').addEventListener('change', function () { $('#b-agree-err').hidden = true; });
    cta.addEventListener('click', function () {
      var s = mode === 'watch' ? list()[si] : null;
      if (mode === 'watch' && !s) return;
      if (!requireFields($('#b-guest'), ['b-name', 'b-phone'])) return;
      if (!agreeOk('b-agree')) return;
      var ref = uid(), fm = member('fan');
      var args = { p_ref: ref, p_kind: mode, p_date: s ? s.d : (day || null), p_time: s ? s.t : null, p_artist: s ? who(s) : null, p_people: ppl,
                   p_name: val('b-name'), p_phone: val('b-phone'), p_request: val('b-req') || null, p_fan_id: fm ? fm.id : null, p_fan_token: fm ? fm.token : null,
                   p_show: s && s.id ? s.id : null, p_venue: s && s.vid ? s.vid : null };
      var item = { ref: ref, kind: mode, d: args.p_date, t: args.p_time || '', a: args.p_artist || '대관 견적', v: s ? s.v : HANG, ppl: ppl, at: TODAY, status: 'requested' };
      function done(where) {
        if (where === 'local') { item.status = 'local'; toast('서버에 연결하지 못해 이 기기에만 저장했어요'); }
        var bk = store.get(BOOK_KEY, []) || []; bk.push(item); store.set(BOOK_KEY, bk);
        if (!pf.name) put('profile-fan', { name: args.p_name, phone: args.p_phone, genres: [], area: '', at: TODAY });
        if (mode === 'rent') { $('#rent-text').textContent = (day ? dayLabel(day) + ' · ' : '') + ppl + '명 대관 견적을 요청했어요.'; openSheet('sheet-rent'); }
        else { $('#book-text').textContent = (s.v || HANG) + ' · ' + dayLabel(s.d) + ' ' + s.t + ' ' + who(s) + ' · ' + ppl + '명 예약을 신청했어요.'; openSheet('sheet-book'); }
      }
      busy(cta, true);
      sbRpc('create_booking', args).then(function () {
        busy(cta, false); var bc = $('#book-code'); if (bc) { bc.hidden = false; bc.textContent = '예약번호 ' + bookCode(ref); }
        done('server'); drawBookSummary();
      }, function (e) {
        busy(cta, false);
        if (e && e.network) { done('local'); return; }
        toast(errMsg(e, '신청하지 못했어요. 잠시 후 다시 시도해 주세요'));
      });
    });
    draw();
  };

  PAGES.tip = function () {
    var amts = [3000, 5000, 10000, 50000], ai = 2;
    var box = $('#t-artists'), inp = $('#t-artist'), foot = $('.foot[data-sms]'), smsNo = foot ? foot.getAttribute('data-sms') : '';
    // 오늘 공연하는 뮤지션 (여러 매장 공연 일정에서)
    var seen = {}, today = showsOn(TODAY).filter(function (x) { return x.type !== 'rental' && x.a && !seen[x.a + '|' + x.v] && (seen[x.a + '|' + x.v] = 1); });
    var many = today.some(function (x) { return x.v !== (today[0] || {}).v; });
    var q = new URLSearchParams(location.search).get('to'), pickedShow = null;
    var venuesToday = []; today.forEach(function (x) { if (venuesToday.indexOf(x.v) < 0) venuesToday.push(x.v); });
    $('#t-stage').textContent = today.length ? '오늘 무대 · ' + venuesToday.map(function (v) { return v + ' ' + today.filter(function (x) { return x.v === v; }).map(function (x) { return x.t; }).join(', '); }).join(' / ') : '오늘 무대';
    box.innerHTML = today.map(function (x, i) { return '<button type="button" class="chip" data-a="' + esc(x.a) + '" data-i="' + i + '" aria-pressed="false">' + esc(x.a) + (many ? ' · ' + esc(x.v) : '') + '</button>'; }).join('');
    box.hidden = !today.length;
    function drawChips() {
      var name = inp.value.trim();
      if (pickedShow && pickedShow.a !== name) pickedShow = null;
      if (!pickedShow) pickedShow = today.filter(function (x) { return x.a === name; })[0] || null;
      $$('[data-a]', box).forEach(function (c) { c.setAttribute('aria-pressed', pickedShow && today[+c.getAttribute('data-i')] === pickedShow ? 'true' : 'false'); });
    }
    if (!inp.value) inp.value = (q && q.slice(0, 40)) || (today[0] ? today[0].a : '');
    box.addEventListener('click', function (e) { var c = e.target.closest('[data-a]'); if (!c) return; pickedShow = today[+c.getAttribute('data-i')]; inp.value = pickedShow.a; drawChips(); });
    inp.addEventListener('input', drawChips); drawChips();
    var pf = profileOf('fan') || {}, kp = st('kakao', null) || {};
    if (!val('t-payer')) $('#t-payer').value = kp.name || pf.name || '';
    single($('#t-amt'), function (b) { ai = +b.getAttribute('data-i'); draw(); });
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
      // 신청곡은 누구나 보낼 수 있어요 (팁과 함께 뮤지션에게 전달)
      $('#t-amt-text').textContent = won(amt) + '원';
      bindFan();
    }
    $('#t-copy').addEventListener('click', function () {
      var no = this.getAttribute('data-copy-text');
      (navigator.clipboard ? navigator.clipboard.writeText(no) : Promise.reject()).then(function () { toast('계좌번호를 복사했어요 · ' + no); }, function () { toast('계좌번호: ' + no); });
    });
    var lastLink = '';
    function smsLink(code) {
      var song = val('t-song-in'), ns = pickedShow && pickedShow.a === val('t-artist') ? pickedShow : null;
      var body = ['[컨택싱어 현장 팁]'].concat(code ? ['팁 번호: ' + code] : [], ['입금자명: ' + val('t-payer'), '금액: ' + won(amts[ai]) + '원', '받을 뮤지션: ' + val('t-artist'),
                  '공연: ' + (ns ? ns.v : HANG) + ' ' + dayLabel(TODAY) + (ns ? ' ' + ns.t : '')], val('t-msg') ? ['한마디: ' + val('t-msg')] : [], song ? ['신청곡: ' + song] : []).join('\n');
      return 'sms:' + smsNo.replace(/[^0-9]/g, '') + '?&body=' + encodeURIComponent(body);
    }
    $('#t-send').addEventListener('click', function () {
      if (!requireFields($('main'), ['t-artist', 't-payer'])) return;
      var btn = this, ref = uid(), ns = pickedShow && pickedShow.a === val('t-artist') ? pickedShow : null;
      function go(code) {
        lastLink = smsLink(code);
        var list = store.get('csm-tips', []) || [];
        list.push({ at: TODAY, artist: val('t-artist'), amount: amts[ai], payer: val('t-payer'), code: code || '', status: code ? 'saved' : 'sms' });
        store.set('csm-tips', list.slice(-30));
        $('#tip-text').textContent = '문자를 보내면 입금을 확인한 뒤 ' + val('t-artist') + '님께 ' + won(amts[ai]) + '원을 100% 그대로 전달해요.' + (code ? ' (팁 번호 ' + code + ')' : '');
        $('#tip-sms-fallback').textContent = '문자 앱이 열리지 않으면 ' + smsNo + '로 ' + (code ? '팁 번호 ' + code + ' · ' : '') + '입금자명 · 금액 · 받을 뮤지션을 직접 보내 주세요.';
        $('#tip-sms-again').setAttribute('href', lastLink);
        openSheet('sheet-tip');
        location.href = lastLink;
      }
      // 팁 기록을 서버에 남기고(입금 확인 전) 받은 팁 번호를 문자에 함께 적는다
      if (!SB_ON) { go(''); return; }
      busy(btn, true);
      sbRpc('create_tip', { p_ref: ref, p_amount: amts[ai], p_payer: val('t-payer'), p_artist: val('t-artist'), p_show: ns && ns.id ? ns.id : null,
                            p_message: val('t-msg') || null, p_song: val('t-song-in') || null })
        .then(function (code) { busy(btn, false); go(typeof code === 'string' ? code : ''); }, function (e) {
          busy(btn, false);
          if (e && e.network) { go(''); return; }
          toast(errMsg(e, '팁 기록을 남기지 못했어요. 잠시 후 다시 시도해 주세요'));
        });
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
    var curKind = 'rec';
    function filter(kind) {
      var following = !!st('following', false), n = 0; curKind = kind;
      $$('.post').forEach(function (p) {
        var tags = (p.getAttribute('data-tags') || '').split(' ');
        var show = kind === 'rec' ? tags.indexOf('rec') >= 0 : kind === 'near' ? tags.indexOf('near') >= 0 : (following && tags.indexOf('dawn') >= 0);
        if (p.hasAttribute('data-off')) show = false;
        p.hidden = !show; if (show) n++;
      });
      $('#feed-empty').hidden = n > 0;
    }
    single($('#feed-tabs'), function (b) { filter(b.getAttribute('data-v')); });
    filter('rec');
    feedClips(function () { filter(curKind); });
    // 오늘 라인업 (공연장 소식)
    var lu = $('#lineup');
    if (lu) {
      var d = scheduleDates(TODAY, 1)[0];
      if (d) {
        $('#lineup-head').textContent = (d === TODAY ? '오늘' : dayLabel(d)) + ' 라인업';
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

  /* ---------- 피드 영상: 가수가 올린 15초 이내 클립 (누구나 보기 · 승인된 가수만 올리기) ---------- */
  var CLIP_MAX = 15.5, CLIP_MB = 30;
  function ago(iso) {
    var t = Date.parse(iso); if (isNaN(t)) return '';
    var m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return '방금'; if (m < 60) return m + '분 전'; if (m < 1440) return Math.floor(m / 60) + '시간 전'; if (m < 10080) return Math.floor(m / 1440) + '일 전';
    var d = new Date(t); return (d.getMonth() + 1) + '.' + d.getDate();
  }
  function secLabel(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function clipExt(f) {
    var n = (f.name || '').toLowerCase().match(/\.([a-z0-9]{2,5})$/), e = n ? n[1] : '', t = (f.type || '').toLowerCase();
    if (e === 'mp4' || e === 'm4v' || t === 'video/mp4') return 'mp4';
    if (e === 'mov' || e === 'qt' || t === 'video/quicktime') return 'mov';
    if (e === 'webm' || t === 'video/webm') return 'webm';
    return '';
  }
  var CLIP_TYPE = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };
  function clipErr(e) {
    var m = String((e && e.message) || '');
    if (/not_approved/.test(m)) return '프로필이 승인되면 영상을 올릴 수 있어요';
    if (/too_long/.test(m)) return '15초 이내 영상만 올릴 수 있어요';
    if (/too_many/.test(m)) return '하루에 10개까지 올릴 수 있어요. 내일 다시 올려 주세요';
    if (/not_member/.test(m)) return '가수 프로필을 확인하지 못했어요. 홈의 정보 수정에서 다시 등록해 주세요';
    if (/bad_link/.test(m)) return '유튜브 · 인스타그램 영상 주소를 확인해 주세요';
    if (e && (e.status === 413 || /too large|maximum allowed size|Payload/i.test(m))) return '영상이 너무 커요. 30MB 이하로 올려 주세요';
    if (e && (e.status === 415 || /mime/i.test(m))) return 'mp4 · mov · webm 영상만 올릴 수 있어요';
    if (e && e.network) return '인터넷 연결이 불안정해요. 와이파이에서 다시 시도해 주세요';
    return '올리지 못했어요. 잠시 후 다시 시도해 주세요';
  }
  function readDuration(v, url) {
    return new Promise(function (res, rej) {
      var done = false, t = setTimeout(function () { end(null, new Error('timeout')); }, 15000);
      function end(d, err) { if (done) return; done = true; clearTimeout(t); v.onloadedmetadata = v.ondurationchange = v.onerror = null; if (err) rej(err); else res(d); }
      v.onloadedmetadata = function () {
        if (isFinite(v.duration) && v.duration > 0) { end(v.duration); return; }
        // 길이 정보가 없는 영상(일부 webm): 끝으로 옮겨서 길이를 알아낸다
        v.ondurationchange = function () { if (isFinite(v.duration) && v.duration > 0) { var d = v.duration; try { v.currentTime = 0; } catch (x) { /* 무시 */ } end(d); } };
        try { v.currentTime = 1e7; } catch (x) { end(null, x); }
      };
      v.onerror = function () { end(null, new Error('decode')); };
      v.src = url; v.load();
    });
  }
  function grabPoster(v, d) {
    return new Promise(function (res) {
      var t = setTimeout(function () { v.onseeked = null; res(null); }, 6000);
      function draw() {
        try {
          var w = v.videoWidth, h = v.videoHeight; if (!w || !h) { clearTimeout(t); res(null); return; }
          var k = Math.min(1, 720 / Math.max(w, h)), c = document.createElement('canvas');
          c.width = Math.round(w * k); c.height = Math.round(h * k);
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          c.toBlob(function (b) { clearTimeout(t); res(b && b.size > 1500 ? b : null); }, 'image/jpeg', 0.8);
        } catch (x) { clearTimeout(t); res(null); }
      }
      v.onseeked = function () { v.onseeked = null; draw(); };
      try { v.currentTime = Math.min(0.5, d / 2); } catch (x) { clearTimeout(t); res(null); }
    });
  }
  function clipMedia(r, url) {
    var name = esc(r.artist_name || '가수');
    if (r.source === 'youtube') {
      var id = String(r.ext_id || ''); if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return '';
      return '<div class="post-media tall ext yt" data-yt="' + id + '" role="button" tabindex="0" aria-label="' + name + ' 유튜브 영상 재생">' +
        '<img src="https://i.ytimg.com/vi/' + id + '/hqdefault.jpg" alt="" loading="lazy"><span class="src">YouTube</span><span class="ext-play" aria-hidden="true">' + ICON.play + '</span></div>';
    }
    if (r.source === 'instagram') {
      var m = String(r.ext_id || '').match(/^(reel|p):([A-Za-z0-9_-]{5,40})$/); if (!m) return '';
      return '<div class="post-media tall ext ig" data-ig="' + m[1] + '/' + m[2] + '" role="button" tabindex="0" aria-label="' + name + ' 인스타그램 영상 보기">' +
        '<span class="src">Instagram</span><span class="ig-t"><span class="ext-play" aria-hidden="true">' + ICON.play + '</span>인스타그램 ' + (m[1] === 'p' ? '게시물' : '릴스') + ' 보기</span></div>';
    }
    var poster = r.poster_path && url[r.poster_path] ? ' poster="' + esc(url[r.poster_path]) + '"' : '';
    return '<div class="post-media tall"><video data-auto src="' + esc(url[r.video_path]) + '"' + poster + ' muted loop playsinline preload="none" aria-label="' + name + ' 공연 클립"></video>' +
      '<button type="button" class="snd" aria-pressed="false" aria-label="소리 켜기">' + ICON.mute + '</button>' +
      '<span class="dur chip-glass mono" style="position:absolute;right:12px;bottom:12px">' + secLabel(r.duration) + '</span></div>';
  }
  var LIKED_KEY = 'csm-liked-clips';
  function deviceId() { var d = store.get('csm-device', null); if (!d) { d = uid(); store.set('csm-device', d); } return d; }
  function likedSet() { var l = store.get(LIKED_KEY, []) || []; var o = {}; l.forEach(function (x) { o[x] = 1; }); return o; }
  function clipPost(r, url, mine) {
    var media = clipMedia(r, url); if (!media) return '';
    var sub = [r.lineup, (r.genres || []).slice(0, 2).join(' · '), ago(r.created_at)].filter(Boolean).join(' · ');
    var liked = !!likedSet()[r.id];
    return '<article class="post" data-tags="rec" data-clip="' + esc(r.id) + '">' +
      '<div class="row pad" style="padding-right:12px"><a class="artist-btn" href="singer.html?id=' + encodeURIComponent(r.artist_id) + '" aria-label="' + esc(r.artist_name) + ' 프로필 보기" style="text-decoration:none"><span class="avatar plain ini" aria-hidden="true">' + esc(String(r.artist_name || '?').slice(0, 1)) + '</span>' +
      '<span class="stack" style="gap:1px;min-width:0"><b style="font-size:15px">' + esc(r.artist_name) + '</b><span class="tiny">' + esc(sub) + '</span></span></a>' +
      (mine ? '<button type="button" class="btn sm ghost" data-del-clip>내리기</button>' : '') + '</div>' + media +
      '<div class="post-actions"><button type="button" class="act like" data-like aria-pressed="' + liked + '" aria-label="좋아요">' + ICON.heart + '<span data-n>' + won(r.likes || 0) + '</span></button>' +
      '<button type="button" class="act" data-share aria-label="공유">' + ICON.share + '</button>' + snsHtml(r, true) + '<span style="flex:1"></span>' +
      '<a class="btn sm" href="tip.html?to=' + encodeURIComponent(r.artist_name || '') + '" style="background:var(--accent-soft);color:var(--accent)">' + ICON.gift + '팁</a></div>' +
      (r.caption ? '<p class="pad" style="font-size:14px;line-height:1.55;white-space:pre-line">' + esc(r.caption) + '</p>' : '') +
      '<p class="pad views" data-views>조회 ' + won(r.views || 0) + '</p></article>';
  }
  // 클립 조회수: 화면에 반쯤 2초 보이면(파일 영상) · 눌러서 재생하면(SNS 영상) 한 번 (이 탭에서 클립마다 한 번)
  var VIEWED = {}, VIEW_IO = null;
  function countView(id) {
    if (!id || VIEWED[id] || !SB_ON) return; VIEWED[id] = 1;
    try { var ss = JSON.parse(sessionStorage.getItem('csm-viewed') || '{}'); if (ss[id]) return; ss[id] = 1; sessionStorage.setItem('csm-viewed', JSON.stringify(ss)); } catch (e) { /* 무시 */ }
    sbRpc('view_clip', { p_clip: id }).catch(function () {});
  }
  function watchViews(box) {
    if (!('IntersectionObserver' in window)) return;
    if (!VIEW_IO) VIEW_IO = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var el = e.target;
        if (e.isIntersecting) el._vt = setTimeout(function () { countView(el.closest('[data-clip]').getAttribute('data-clip')); }, 2000);
        else clearTimeout(el._vt);
      });
    }, { threshold: 0.5 });
    $$('[data-clip] .post-media:not(.ext)', box).forEach(function (m) { VIEW_IO.observe(m); });
  }
  // 받은 클립 줄들에 서명된 임시 주소를 붙인다 (파일 영상만)
  function isUp(r) { return !r.source || r.source === 'upload'; }
  function clipSign(rows) {
    rows = rows || [];
    var paths = []; rows.forEach(function (r) { if (isUp(r)) { paths.push(r.video_path); if (r.poster_path) paths.push(r.poster_path); } });
    if (!paths.length) return Promise.resolve(rows.map(function (r) { r._url = {}; return r; }));
    return sbReq('/storage/v1/object/sign/clips', { method: 'POST', body: { expiresIn: 21600, paths: paths } }).then(function (signed) {
      var url = {};
      (signed || []).forEach(function (x) { var u = x && !x.error && (x.signedURL || x.signedUrl); if (u) url[x.path] = /^https?:/.test(u) ? u : CFG.url + '/storage/v1' + u; });
      return rows.filter(function (r) { return !isUp(r) || url[r.video_path]; }).map(function (r) { r._url = url; return r; });
    });
  }
  // 클립 묶음의 버튼들 (소리 · SNS 재생 · 좋아요 · 공유 · 내리기)
  function clipBind(box, reload) {
    function soundBtn(b, on) { b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.setAttribute('aria-label', on ? '소리 끄기' : '소리 켜기'); b.innerHTML = on ? ICON.sound : ICON.mute; }
    function muteAll(except) { $$('video', box).forEach(function (o) { if (o !== except) { o.muted = true; o.removeAttribute('data-sound'); } }); }
    (function () {
      $$('.post-media', box).filter(function (m) { return $('video', m); }).forEach(function (m) {
        var v = $('video', m), b = $('.snd', m);
        function flip() {
          var on = v.muted;
          muteAll(v);
          v.muted = !on;
          if (on) { v.setAttribute('data-sound', ''); var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.removeAttribute('data-sound');
          $$('.post-media', box).forEach(function (o) { var ob = $('.snd', o), ov = $('video', o); if (ob && ov) soundBtn(ob, !ov.muted); });
        }
        v.addEventListener('volumechange', function () { soundBtn(b, !v.muted); });
        b.addEventListener('click', function (e) { e.stopPropagation(); flip(); });
        v.addEventListener('click', flip);
      });
      // 유튜브 · 인스타그램: 누르면 그 자리에서 재생 (누르기 전에는 SNS를 불러오지 않는다)
      $$('.ext', box).forEach(function (m) {
        function open() {
          if (m.classList.contains('on')) return;
          var yt = m.getAttribute('data-yt'), ig = m.getAttribute('data-ig'), label = m.getAttribute('aria-label') || '영상';
          var src = yt ? 'https://www.youtube-nocookie.com/embed/' + yt + '?autoplay=1&playsinline=1&rel=0' : 'https://www.instagram.com/' + ig + '/embed/';
          muteAll(null);
          m.classList.add('on'); m.removeAttribute('role'); m.removeAttribute('tabindex'); m.removeAttribute('aria-label');
          m.innerHTML = '<iframe src="' + esc(src) + '" title="' + esc(label) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
          if (ig) m.insertAdjacentHTML('afterend', '<a class="sub pad" href="https://www.instagram.com/' + esc(ig) + '/" target="_blank" rel="noopener noreferrer">인스타그램 앱에서 보기</a>');
          countView(m.closest('[data-clip]').getAttribute('data-clip'));
        }
        m.addEventListener('click', open);
        m.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      });
      $$('[data-like]', box).forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.closest('[data-clip]').getAttribute('data-clip'), on = b.getAttribute('aria-pressed') !== 'true', n = $('[data-n]', b);
          var l = (store.get(LIKED_KEY, []) || []).filter(function (x) { return x !== id; }); if (on) l.unshift(id); store.set(LIKED_KEY, l.slice(0, 500));
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          var cur = +String(n.textContent).replace(/[^0-9]/g, '') || 0; n.textContent = won(Math.max(0, cur + (on ? 1 : -1)));
          if (SB_ON) sbRpc('like_clip', { p_clip: id, p_device: deviceId(), p_on: on }).then(function (c) { if (typeof c === 'number') n.textContent = won(c); }, function () {});
        });
      });
      $$('[data-share]', box).forEach(function (b) { b.addEventListener('click', function () { share('컨택싱어 피드'); }); });
      $$('[data-del-clip]', box).forEach(function (b) {
        b.addEventListener('click', function () {
          if (!b.hasAttribute('data-sure')) {
            b.setAttribute('data-sure', ''); b.textContent = '한 번 더 누르면 내려가요';
            setTimeout(function () { if (b.isConnected && !b.disabled) { b.removeAttribute('data-sure'); b.textContent = '내리기'; } }, 3000);
            return;
          }
          var m = member('artist'), id = b.closest('[data-clip]').getAttribute('data-clip');
          if (!m) return;
          b.disabled = true; b.textContent = '내리는 중…';
          sbRpc('delete_my_clip', { p_id: m.id, p_token: m.token, p_clip: id }).then(function (ok) {
            if (!ok) throw new Error('no');
            toast('영상을 내렸어요'); if (reload) reload();
          }).catch(function () { b.disabled = false; b.removeAttribute('data-sure'); b.textContent = '내리기'; toast('내리지 못했어요. 잠시 후 다시 시도해 주세요'); });
        });
      });
    })();
    autoVideos(box); watchViews(box);
  }
  function feedClips(after) {
    var box = $('#feed-real'); if (!box) return;
    function demo(on) { $$('[data-demo-post]').forEach(function (p) { if (on) p.removeAttribute('data-off'); else p.setAttribute('data-off', ''); }); }
    function load() {
      if (!SB_ON) return Promise.resolve();
      return sbRpc('public_clips', { p_limit: 30 }).then(clipSign).then(function (rows) {
        var me = member('artist');
        box.innerHTML = rows.map(function (r) { return clipPost(r, r._url, !!(me && me.id === r.artist_id)); }).join('');
        var n = box.children.length;
        box.hidden = !n; demo(!n);
        clipBind(box, load); if (after) after();
      }).catch(function () { /* 서버에 닿지 못하면 예시 피드만 보여 준다 */ });
    }
    // 올리기 화면: 영상 파일 (15초 이내) 또는 SNS 영상 링크
    var fab = $('#fab-clip'), cu = {}, mode = 'file';
    function cuErr(m) { var e = $('#cu-err'); if (e) { e.hidden = !m; e.textContent = m || ''; } }
    function cuState() {
      var b = $('#cu-submit'); if (!b || cu.busy) return;
      b.disabled = !((mode === 'file' ? (cu.file && cu.dur) : cu.link) && $('#cu-agree').checked);
    }
    function linkPrev() {
      var pv = $('#cu-link-prev'), l = cu.link;
      pv.hidden = !l;
      if (!l) { pv.innerHTML = ''; return; }
      if (l.source === 'youtube') pv.innerHTML = '<img src="https://i.ytimg.com/vi/' + l.id + '/mqdefault.jpg" alt=""><span class="stack" style="gap:2px"><b>유튜브 영상</b><span class="tiny">이 영상이 피드에 보여요</span></span>';
      else pv.innerHTML = '<span class="sns ig" aria-hidden="true">' + ICON.ig + '</span><span class="stack" style="gap:2px"><b>인스타그램 ' + (l.id.indexOf('p:') === 0 ? '게시물' : '릴스') + '</b><span class="tiny">공개 계정의 영상만 보여요</span></span>';
    }
    function cuReset() {
      if (cu.url) URL.revokeObjectURL(cu.url);
      cu = {};
      var v = $('#cu-video'); v.removeAttribute('src'); try { v.load(); } catch (x) { /* 무시 */ }
      $('#cu-file').value = ''; $('#cu-prev').hidden = true; $('#cu-meta').hidden = true; $('#cu-bar').hidden = true;
      $('#cu-url').value = ''; linkPrev();
      $('#cu-cap').value = ''; $('#cu-agree').checked = false; $('span', $('#cu-pick')).textContent = '영상 고르기';
      cuErr(''); cuState();
    }
    function posted(btn) {
      cu.busy = false; busy(btn, false);
      closeSheet($('#sheet-clip')); cuReset(); toast('피드에 올렸어요');
      var rb = $('#feed-tabs [data-v="rec"]'); if (rb && rb.getAttribute('aria-pressed') !== 'true') rb.click();
      load().then(function () { window.scrollTo(0, 0); });
    }
    if ($('#cu-file')) {
      single($('#cu-mode'), function (b) {
        mode = b.getAttribute('data-v');
        $('#cu-file-box').hidden = mode !== 'file'; $('#cu-link-box').hidden = mode !== 'link';
        cuErr(''); cuState();
        if (mode === 'link') setTimeout(function () { $('#cu-url').focus(); }, 0);
      });
      $('#cu-url').addEventListener('input', function () {
        var v = this.value.trim();
        cu.link = parseVideoLink(v); linkPrev();
        cuErr(v && !cu.link ? '유튜브(쇼츠 · 영상) 또는 인스타그램(릴스 · 게시물) 영상 주소를 붙여넣어 주세요' : ''); cuState();
      });
      $('#cu-file').addEventListener('change', function () {
        var f = this.files && this.files[0], ext = f ? clipExt(f) : '';
        cu.file = null; cu.dur = 0; cu.poster = null; cuErr(''); $('#cu-meta').hidden = true; cuState();
        if (!f) return;
        if (!ext) { cuErr('mp4 · mov · webm 영상만 올릴 수 있어요'); return; }
        if (f.size > CLIP_MB * 1048576) { cuErr('영상이 너무 커요 (' + Math.round(f.size / 1048576) + 'MB). 30MB 이하로 올려 주세요. 카메라 화질을 1080p로 바꾸면 크기가 줄어요'); return; }
        if (cu.url) URL.revokeObjectURL(cu.url);
        cu.url = URL.createObjectURL(f);
        var v = $('#cu-video'), my = cu.url;
        $('#cu-prev').hidden = false; $('span', $('#cu-pick')).textContent = '다른 영상 고르기';
        readDuration(v, my).then(function (d) {
          if (cu.url !== my) return;
          if (d > CLIP_MAX) { cuErr('15초 이내 영상만 올릴 수 있어요 (지금 ' + secLabel(d) + '). 휴대폰 갤러리의 ‘편집’에서 15초 이내로 잘라 주세요'); return; }
          cu.file = f; cu.dur = d; cu.ext = ext;
          var meta = $('#cu-meta'); meta.hidden = false; meta.textContent = '길이 ' + secLabel(d) + ' · ' + (f.size / 1048576).toFixed(1) + 'MB';
          cuState();
          return grabPoster(v, d).then(function (b) { if (cu.url === my) cu.poster = b; });
        }).catch(function () { if (cu.url === my) cuErr('이 영상은 열 수 없어요. 휴대폰 기본 카메라로 찍은 mp4 영상으로 올려 주세요'); });
      });
      $('#cu-agree').addEventListener('change', cuState);
      $('#cu-submit').addEventListener('click', function () {
        var m = member('artist'), btn = this, cap = $('#cu-cap').value.trim() || null;
        if (!m || cu.busy) return;
        function failed(e) { cu.busy = false; busy(btn, false); $('#cu-bar').hidden = true; cuErr(clipErr(e)); cuState(); }
        if (mode === 'link') {
          if (!cu.link) return;
          cu.busy = true; busy(btn, true); btn.textContent = '올리는 중…'; cuErr('');
          sbRpc('post_clip_link', { p_id: m.id, p_token: m.token, p_source: cu.link.source, p_ext_id: cu.link.id, p_caption: cap }).then(function () { posted(btn); }, failed);
          return;
        }
        if (!cu.file) return;
        var base = m.id + '/' + uid(), vpath = base + '.' + cu.ext, ppath = cu.poster ? base + '.jpg' : null;
        var bar = $('#cu-bar'), bi = $('i', bar);
        cu.busy = true; busy(btn, true); btn.textContent = '올리는 중…'; cuErr(''); bar.hidden = false; bi.style.width = '3%';
        sbPut('clips', vpath, cu.file, CLIP_TYPE[cu.ext], function (p) { bi.style.width = Math.max(3, Math.round(p * 90)) + '%'; })
          .then(function () { return ppath ? sbPut('clips', ppath, cu.poster, 'image/jpeg').catch(function () { ppath = null; }) : null; })
          .then(function () { return sbRpc('post_clip', { p_id: m.id, p_token: m.token, p_video: vpath, p_poster: ppath, p_caption: cap, p_duration: Math.round(cu.dur * 100) / 100 }); })
          .then(function () { bi.style.width = '100%'; posted(btn); }, failed);
      });
    }
    if (fab) fab.addEventListener('click', function () {
      var m = member('artist');
      if (!m || !SB_ON) { openSheet('sheet-upload'); return; }
      fab.disabled = true;
      sbRpc('my_profile', { p_kind: 'artist', p_id: m.id, p_token: m.token }).then(function (rows) {
        var p = rows && rows[0];
        if (!p) { openSheet('sheet-upload'); return; }
        if (p.status !== 'approved') { toast(p.status === 'rejected' ? '등록이 반려돼 영상을 올릴 수 없어요. 운영팀에 문의해 주세요' : '프로필 승인 대기 중이에요. 승인되면 영상을 올릴 수 있어요'); return; }
        cuReset(); openSheet('sheet-clip');
      }, function () { toast('서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요'); }).then(function () { fab.disabled = false; });
    });
    load();
  }

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
  PAGES.match = function () { bindReq(document); memberStatus('artist'); loadPublicList('artist'); loadInbox('artist'); artistGigs(); };

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
      b.addEventListener('click', function () { asked[id] = !asked[id]; put('venueAsked', asked); draw(); toast(asked[id] ? '싱어에게 컨택 요청을 보냈어요 (예시)' : '컨택을 취소했어요'); });
      draw();
    });
    count();
    memberStatus('venue'); loadPublicList('venue');
  };

  // 다가오는 무대: 실제 공연 일정에서 오늘부터 7일 (파트너 센터 · 홈의 사장님 화면)
  function weekHtml(src, mine) {
    var html = '';
    for (var i = 0; i < 7; i++) {
      var d = addDays(TODAY, i), l = src ? src(d) : showsOn(d, function (s) { return isHang(s.v); });
      var left = '<span style="flex:none;width:58px;display:flex;flex-direction:column;gap:1px"><span class="mono" style="font-size:13px;font-weight:700;color:' + (l.length ? 'var(--accent-text)' : '#B42318') + '">' + md(d) + '</span><span class="tiny" style="font-size:11px">' + (i === 0 ? '오늘' : wd(d)) + (l[0] && l[0].t ? ' ' + l[0].t : '') + '</span></span>';
      if (!l.length) html += '<li>' + left + '<span class="t"><b style="color:var(--muted)">' + (mine ? '공연 없음' : '컨택 필요') + '</b></span><a class="btn sm" href="' + (mine ? 'partner.html#gigs' : 'venue-match.html') + '">' + (mine ? '공고 올리기' : 'AI 추천 보기') + '</a></li>';
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
    memberStatus('venue').then(venueCenter); loadInbox('venue');
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
    board($('#board'));
    var hangDb = D.shows.filter(function (s) { return s.id && isHang(s.v) && s.d >= TODAY; });
    var first = $('.month'), host = first ? first.parentNode : null;
    if (hangDb.length && host) {
      $$('.month', host).forEach(function (mm) { mm.remove(); });
      var byM = {}, order = [];
      hangDb.forEach(function (s) { var ym = s.d.slice(0, 7); if (!byM[ym]) { byM[ym] = {}; order.push(ym); } (byM[ym][s.d] = byM[ym][s.d] || []).push(s); });
      host.insertAdjacentHTML('beforeend', order.map(function (ym) {
        var days = Object.keys(byM[ym]).sort();
        return '<div class="month" data-month="' + ym + '"><h3>' + (+ym.slice(0, 4)) + '년 ' + (+ym.slice(5)) + '월</h3><ul class="days">' + days.map(function (d) {
          return '<li class="day" id="d-' + d + '" data-day="' + d + '"><span class="dt"><b>' + md(d) + '</b><span>' + wd(d) + '요일</span><span class="today-tag" hidden>오늘</span></span><ul>' +
            byM[ym][d].map(function (s) { return s.type === 'rental' ? '<li class="rental">대관 · 일반 공연 없음</li>' : '<li><time datetime="' + d + 'T' + esc(s.t || '00:00') + ':00+09:00">' + esc(s.t) + '</time><span>' + esc(who(s)) + (s.p ? ' <span class="pt">' + esc(s.p) + '</span>' : '') + '</span></li>'; }).join('') + '</ul></li>';
        }).join('') + '</ul></div>';
      }).join(''));
    }
    var shown = 0;
    $$('.day[data-day]').forEach(function (li) {
      var d = li.getAttribute('data-day');
      if (d < TODAY) li.hidden = true; else shown++;
      if (d === TODAY) { li.classList.add('is-today'); var t = $('.today-tag', li); if (t) t.hidden = false; }
    });
    $$('.month').forEach(function (m) { m.hidden = $$('.day', m).every(function (li) { return li.hidden; }); });
    var e = $('#sched-empty'); if (e) e.hidden = shown > 0;
  };

  /* ================================================================ 2단계: 사장님 · 가수 화면 (서버 데이터) */
  var GSTATUS = { applied: ['지원 완료', 'wait'], picked: ['선정', 'yes'], declined: ['마감', 'no'], withdrawn: ['지원 취소', 'done'] };
  var GIGST = { open: ['모집 중', 'wait'], filled: ['선정 완료', 'yes'], closed: ['마감', 'done'], cancelled: ['취소', 'no'] };
  var PAYST = { unpaid: ['미지급', 'wait'], paid: ['지급 완료', 'yes'], none: ['', ''] };
  function pillHtml(p) { return p && p[0] ? '<span class="pill ' + p[1] + '">' + esc(p[0]) + '</span>' : ''; }
  function vRpc(fn, extra) { var m = member('venue'); var a = { p_id: m.id, p_token: m.token }; for (var k in (extra || {})) a[k] = extra[k]; return sbRpc(fn, a); }
  function aRpc(fn, extra) { var m = member('artist'); var a = { p_id: m.id, p_token: m.token }; for (var k in (extra || {})) a[k] = extra[k]; return sbRpc(fn, a); }
  function telA(p, label) { var t = telOf(p); return t ? '<a class="btn ghost sm" href="tel:' + esc(t) + '">' + esc(label || '전화') + '</a>' : ''; }
  function sure(b, label, run) {   // 두 번 눌러야 실행 (실수 방지 · 알림창 없이)
    if (!b.hasAttribute('data-sure')) {
      b.setAttribute('data-sure', ''); var old = b.textContent; b.textContent = label;
      setTimeout(function () { if (b.isConnected && !b.disabled && b.hasAttribute('data-sure')) { b.removeAttribute('data-sure'); b.textContent = old; } }, 3000);
      return;
    }
    b.removeAttribute('data-sure'); run();
  }
  function rpcErr(e, map) {
    var m = String((e && e.message) || '');
    for (var k in map) if (m.indexOf(k) >= 0) return map[k];
    return e && e.network ? '인터넷 연결을 확인해 주세요' : errMsg(e, '처리하지 못했어요. 잠시 후 다시 시도해 주세요');
  }
  function vShow(r) { return { id: r.id, d: r.show_date, t: r.show_time || '', p: r.part || '', a: r.kind === 'rental' ? '' : (r.artist_name || ''), type: r.kind === 'rental' ? 'rental' : 'show', status: r.status, pay: r.pay, pay_status: r.pay_status, gig_id: r.gig_id, aid: r.artist_id }; }

  // ---------------------------------------------------------------- 사장님: 파트너 센터 (예약 · 공고 · 공연 일정 · 공연비)
  function venueCenter(pr) {
    var m = member('venue'); if (!m || !SB_ON || !pr) return;
    var approved = pr.status === 'approved', data = { shows: [], bookings: [], gigs: [] };
    var kpiSec = $('#kpi-t') && $('#kpi-t').closest('section');
    // 정산: 예시 → 실제 공연비 지급
    var sd = $('#settle'), sr = $('#settle-real');
    if (sd && sr) { sd.hidden = true; sd.id = 'settle-demo'; sr.hidden = false; sr.id = 'settle'; }
    $('#p-book').hidden = false; $('#gigs').hidden = false; $('#ps-new').hidden = false;
    function kpis() {
      if (!kpiSec) return;
      var wk = addDays(TODAY, 7);
      var n1 = data.shows.filter(function (s) { return s.status === 'scheduled' && s.show_date >= TODAY && s.show_date < wk && s.kind === 'show'; }).length;
      var n2 = data.bookings.filter(function (b) { return b.status === 'requested'; }).length;
      var n3 = data.gigs.filter(function (g) { return g.status === 'open'; }).length;
      var n4 = data.shows.filter(function (s) { return s.status === 'scheduled' && s.kind === 'show' && s.pay_status === 'unpaid' && s.show_date <= TODAY; }).length;
      $('.kpis', kpiSec).innerHTML = '<div><dt>이번 주 공연</dt><dd>' + n1 + '<small> 회</small></dd></div><div><dt>확정 전 예약</dt><dd>' + n2 + '<small> 건</small></dd></div>' +
        '<div><dt>모집 중 공고</dt><dd>' + n3 + '<small> 건</small></dd></div><div><dt>공연비 미지급</dt><dd' + (n4 ? ' style="color:var(--accent)"' : '') + '>' + n4 + '<small> 건</small></dd></div>';
      $('#kpi-note').textContent = '우리 매장';
    }
    // ---- 예약
    var bf = 'todo';
    function drawBookings() {
      var rows = data.bookings.filter(function (b) { return bf === 'all' ? true : bf === 'today' ? b.show_date === TODAY : b.status === 'requested'; });
      $('#pb-sum').textContent = '확정 전 ' + data.bookings.filter(function (b) { return b.status === 'requested'; }).length + '건 · 오늘 ' + data.bookings.filter(function (b) { return b.show_date === TODAY && (b.status === 'requested' || b.status === 'confirmed'); }).length + '건';
      $('#pb-list').innerHTML = rows.length ? rows.map(function (b) {
        var when = b.kind === 'rent' ? '대관 견적' + (b.show_date ? ' · ' + dayLabel(b.show_date) : '') : ((b.show_date ? dayLabel(b.show_date) : '') + ' ' + (b.show_time || '') + (b.artist ? ' · ' + b.artist : '')).trim();
        var acts = b.status === 'requested' ? '<button type="button" class="btn sm" data-bset="confirmed">확정</button><button type="button" class="btn ghost sm" data-bset="declined">불가</button>'
          : b.status === 'confirmed' ? '<button type="button" class="btn ghost sm" data-bset="visited">방문 완료</button><button type="button" class="btn ghost sm" data-bset="noshow">노쇼</button><button type="button" class="btn ghost sm" data-bset="cancelled">취소</button>' : '';
        return '<div class="bk" data-bk="' + esc(b.id) + '"><div class="between" style="align-items:center"><b style="font-size:15px">' + esc(b.name) + ' · ' + b.people + '명</b>' + pillHtml(b.status === 'requested' ? ['확정 전', 'wait'] : BSTATUS[b.status]) + '</div>' +
          '<span class="tiny">' + esc(when) + '</span>' + (b.request ? '<span class="tiny">요청: ' + esc(b.request) + '</span>' : '') + (b.reply ? '<span class="tiny">답변: ' + esc(b.reply) + '</span>' : '') +
          '<div class="acts">' + telA(b.phone) + acts + '</div></div>';
      }).join('') : '<p class="empty">' + (bf === 'todo' ? '확정을 기다리는 예약이 없어요' : bf === 'today' ? '오늘 예약이 없어요' : '아직 예약이 없어요') + '</p>';
    }
    single($('#pb-filter'), function (b) { bf = b.getAttribute('data-v'); drawBookings(); });
    $('#pb-list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-bset]'); if (!b) return;
      var id = b.closest('[data-bk]').getAttribute('data-bk'), stt = b.getAttribute('data-bset');
      function run() {
        b.disabled = true;
        vRpc('venue_booking_set', { p_booking: id, p_status: stt, p_reply: null }).then(function (ok) {
          if (!ok) throw new Error('no'); toast((BSTATUS[stt] || [stt])[0] + '(으)로 바꿨어요' + (stt === 'confirmed' || stt === 'declined' || stt === 'cancelled' ? ' · 손님에게 알려요' : '')); loadAll();
        }).catch(function (er) { b.disabled = false; toast(rpcErr(er, {})); });
      }
      if (stt === 'declined' || stt === 'cancelled' || stt === 'noshow') sure(b, '한 번 더 누르면 ' + b.textContent, run); else run();
    });
    // ---- 빈 무대 공고
    var gf = $('#pg-form');
    single($('#pg-lineup')); multi($('#pg-genres'));
    $('#pg-date').min = TODAY;
    $('#pg-new').addEventListener('click', function () {
      if (!approved) { toast('매장이 승인되면 공고를 올릴 수 있어요'); return; }
      gf.hidden = false; $('#pg-date').focus();
    });
    $('#pg-cancel').addEventListener('click', function () { gf.hidden = true; });
    gf.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!requireFields(gf, ['pg-date'])) return;
      var btn = $('#pg-save'), lu = picked($('#pg-lineup'))[0];
      busy(btn, true);
      vRpc('post_gig', { p_date: val('pg-date'), p_time: val('pg-time') || null, p_pay: val('pg-pay') || null, p_lineup: lu && lu !== '상관없음' ? lu : null,
                        p_genres: picked($('#pg-genres')), p_note: val('pg-note') || null }).then(function () {
        busy(btn, false); gf.hidden = true; gf.reset(); toast('공고를 올렸어요 · 가수들이 지원하면 알려 드려요'); loadAll();
      }, function (er) { busy(btn, false); toast(rpcErr(er, { not_approved: '매장이 승인되면 공고를 올릴 수 있어요', bad_date: '오늘 이후 날짜를 골라 주세요', too_many: '모집 중인 공고는 20개까지예요' })); });
    });
    function drawGigs() {
      var box = $('#pg-list');
      if (!approved) { box.innerHTML = '<p class="note">매장이 승인되면 빈 무대 공고를 올릴 수 있어요.</p>'; return; }
      var gs = data.gigs;
      box.innerHTML = gs.length ? gs.map(function (g) {
        var apps = (g.apps || []).filter(function (a) { return a.status !== 'withdrawn'; });
        var head = '<div class="between" style="align-items:center"><h3>' + esc(dayLabel(g.gig_date) + (g.gig_time ? ' ' + g.gig_time : '')) + '</h3>' + pillHtml(GIGST[g.status]) + '</div>' +
          '<div class="meta">' + esc([g.pay || '공연비 협의', g.lineup, (g.genres || []).join(' · ')].filter(Boolean).join(' · ')) + '</div>' + (g.note ? '<p class="tiny" style="margin:0">' + esc(g.note) + '</p>' : '');
        var list = apps.length ? '<div class="apps"><span class="tiny">지원한 가수 ' + apps.length + '명</span>' + apps.map(function (a) {
          return '<div class="gapp" data-app="' + esc(a.app_id) + '"><div class="between" style="align-items:center"><a href="singer.html?id=' + encodeURIComponent(a.artist_id) + '" style="color:var(--fg);font-weight:700">' + esc(a.name) + '</a>' + pillHtml(GSTATUS[a.status]) + '</div>' +
            '<span class="tiny">' + esc([a.lineup, (a.genres || []).join(' · '), a.region].filter(Boolean).join(' · ') || '컨택싱어 가수') + '</span>' +
            (a.message ? '<span style="font-size:13.5px">“' + esc(a.message) + '”</span>' : '') + (snsHtml(a) ? '<div class="sns-row">' + snsHtml(a) + '</div>' : '') +
            '<div class="acts row" style="gap:6px">' + (g.status === 'open' && a.status === 'applied' ? '<button type="button" class="btn sm" data-pick>이 가수로 확정</button>' : '') + (a.phone ? telA(a.phone, '전화 ' + a.phone) : '') + '</div></div>';
        }).join('') + '</div>' : (g.status === 'open' ? '<p class="tiny" style="margin:0">아직 지원한 가수가 없어요</p>' : '');
        return '<article class="gcard" data-gig="' + esc(g.id) + '">' + head + list + (g.status === 'open' ? '<div class="row end"><button type="button" class="btn ghost sm" data-gclose>공고 마감</button></div>' : '') + '</article>';
      }).join('') : '<p class="empty">올린 공고가 없어요. ‘공고 올리기’로 첫 공고를 올려 보세요</p>';
    }
    $('#pg-list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-pick], [data-gclose]'); if (!b) return;
      if (b.hasAttribute('data-pick')) {
        var app = b.closest('[data-app]').getAttribute('data-app');
        sure(b, '한 번 더 누르면 확정돼요', function () {
          b.disabled = true;
          vRpc('pick_gig_app', { p_app: app }).then(function () { toast('확정했어요 · 공연 일정에 들어갔고 가수에게 알려요'); loadAll(); }, function (er) { b.disabled = false; toast(rpcErr(er, { not_open: '이미 마감된 공고예요' })); });
        });
      } else {
        var gid = b.closest('[data-gig]').getAttribute('data-gig');
        sure(b, '한 번 더 누르면 마감돼요', function () {
          b.disabled = true;
          vRpc('close_gig', { p_gig: gid, p_status: 'closed' }).then(function () { toast('공고를 마감했어요'); loadAll(); }, function (er) { b.disabled = false; toast(rpcErr(er, {})); });
        });
      }
    });
    // ---- 공연 일정 (추가 · 수정 · 취소) + 공연비 지급
    var sf = $('#ps-form'), editing = null;
    $('#ps-date').min = addDays(TODAY, -1);
    $('#ps-new').addEventListener('click', function () { editing = null; sf.reset(); sf.hidden = false; $('#ps-save').textContent = '일정 저장'; $('#ps-date').focus(); });
    $('#ps-cancel').addEventListener('click', function () { sf.hidden = true; editing = null; });
    sf.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!requireFields(sf, ['ps-date'])) return;
      var btn = $('#ps-save'); busy(btn, true);
      vRpc('venue_save_show', { p_show: editing, p_date: val('ps-date'), p_time: val('ps-time') || null, p_part: val('ps-part') || null, p_artist: val('ps-artist') || null,
                                p_kind: $('#ps-rental').checked ? 'rental' : 'show', p_pay: val('ps-pay') || null }).then(function () {
        busy(btn, false); sf.hidden = true; sf.reset(); toast(editing ? '일정을 고쳤어요' : '공연 일정을 올렸어요 · 손님 앱에 보여요'); editing = null; store.set(SHOWS_KEY, null); loadAll();
      }, function (er) { busy(btn, false); toast(rpcErr(er, { bad_date: '날짜를 확인해 주세요', too_many: '앞으로 일정은 300개까지 올릴 수 있어요' })); });
    });
    function drawShows() {
      var ul = $('#week'), up = data.shows.filter(function (s) { return s.show_date >= TODAY; }).slice(0, 40);
      ul.innerHTML = up.length ? up.map(function (s) {
        var off = s.status === 'cancelled', name = s.kind === 'rental' ? '대관 · 일반 공연 없음' : (s.artist_name || '가수 미정');
        return '<li data-show="' + esc(s.id) + '"' + (off ? ' style="opacity:.55"' : '') + '><span style="flex:none;width:62px;display:flex;flex-direction:column;gap:1px"><span class="mono" style="font-size:13px;font-weight:700;color:var(--accent-text)">' + md(s.show_date) + '</span><span class="tiny" style="font-size:11px">' + (s.show_date === TODAY ? '오늘' : wd(s.show_date)) + (s.show_time ? ' ' + esc(s.show_time) : '') + '</span></span>' +
          '<span class="t"><b>' + esc(name) + (s.part ? ' · ' + esc(s.part) : '') + '</b><span>' + esc([off ? '취소됨' : '', s.pay ? '공연비 ' + s.pay : '', s.gig_id ? '공고에서 선정' : ''].filter(Boolean).join(' · ') || '예정') + '</span></span>' +
          '<span class="row" style="gap:4px">' + (off ? '<button type="button" class="btn ghost sm" data-sset="scheduled">되살리기</button>' : '<button type="button" class="btn ghost sm" data-sedit>수정</button><button type="button" class="btn ghost sm" data-sset="cancelled">취소</button>') + '</span></li>';
      }).join('') : '<li><span class="t"><b style="color:var(--muted)">올린 공연 일정이 없어요</b><span>‘공연 추가’로 날짜 · 가수를 올리면 손님 앱의 공연 일정에 바로 떠요</span></span></li>';
      // 공연비
      var due = data.shows.filter(function (s) { return s.status === 'scheduled' && s.kind === 'show' && s.pay_status !== 'none' && s.show_date <= TODAY; }).slice(-30).reverse();
      var unpaid = due.filter(function (s) { return s.pay_status === 'unpaid'; }).length;
      $('#sr-sum').textContent = due.length ? '미지급 ' + unpaid + '건' : '';
      $('#sr-list').innerHTML = due.length ? due.map(function (s) {
        return '<li data-show="' + esc(s.id) + '"><span class="t"><b>' + esc(dayLabel(s.show_date) + ' ' + (s.artist_name || '가수')) + '</b><span>' + esc(s.pay || '공연비') + '</span></span>' +
          (s.pay_status === 'paid' ? '<button type="button" class="btn ghost sm" data-pay="unpaid">지급 완료 ✓</button>' : '<button type="button" class="btn sm" data-pay="paid">지급 완료로</button>') + '</li>';
      }).join('') : '<li><span class="t"><b style="color:var(--muted)">지난 공연의 공연비 기록이 없어요</b><span>공연비를 적어 둔 공연이 끝나면 여기에 보여요</span></span></li>';
    }
    function showAct(e) {
      var b = e.target.closest('[data-sset], [data-sedit], [data-pay]'); if (!b) return;
      var id = b.closest('[data-show]').getAttribute('data-show'), s = data.shows.filter(function (x) { return x.id === id; })[0];
      if (b.hasAttribute('data-sedit') && s) {
        editing = id; sf.hidden = false; $('#ps-save').textContent = '고친 내용 저장';
        $('#ps-date').value = s.show_date; $('#ps-time').value = s.show_time || ''; $('#ps-part').value = s.part || ''; $('#ps-artist').value = s.artist_name || ''; $('#ps-pay').value = s.pay || ''; $('#ps-rental').checked = s.kind === 'rental';
        $('#ps-artist').disabled = !!s.artist_id; sf.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      var args = b.hasAttribute('data-pay') ? { p_show: id, p_status: null, p_pay_status: b.getAttribute('data-pay') } : { p_show: id, p_status: b.getAttribute('data-sset'), p_pay_status: null };
      function run() {
        b.disabled = true;
        vRpc('venue_show_set', args).then(function (ok) { if (!ok) throw new Error('no'); toast(args.p_pay_status ? (args.p_pay_status === 'paid' ? '공연비 지급 완료로 체크했어요' : '미지급으로 되돌렸어요') : (args.p_status === 'cancelled' ? '공연을 취소했어요' : '공연을 되살렸어요')); store.set(SHOWS_KEY, null); loadAll(); },
          function (er) { b.disabled = false; toast(rpcErr(er, {})); });
      }
      if (args.p_status === 'cancelled') sure(b, '한 번 더 누르면 취소', run); else run();
    }
    $('#week').addEventListener('click', showAct); $('#sr-list').addEventListener('click', showAct);
    function loadAll() {
      return Promise.all([vRpc('venue_shows').catch(function () { return []; }), vRpc('venue_bookings').catch(function () { return []; }), vRpc('venue_gigs').catch(function () { return []; })]).then(function (r) {
        data.shows = r[0] || []; data.bookings = r[1] || []; data.gigs = r[2] || [];
        kpis(); drawBookings(); drawGigs(); drawShows();
        if (location.hash && !venueCenter.scrolled) { venueCenter.scrolled = true; var t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView({ block: 'start' }); }
      });
    }
    loadAll();
  }

  // 홈 (사장님): 오늘 요약 + 다가오는 무대
  function venueHome(pr) {
    var m = member('venue'); if (!m || !SB_ON || !pr) return;
    Promise.all([vRpc('venue_shows').catch(function () { return []; }), vRpc('venue_bookings').catch(function () { return []; }), vRpc('venue_gigs').catch(function () { return []; })]).then(function (r) {
      var shows = r[0] || [], bookings = r[1] || [], gigs = r[2] || [];
      var box = $('#v-sum'); if (box) {
        box.hidden = false;
        var n1 = shows.filter(function (s) { return s.show_date === TODAY && s.status === 'scheduled' && s.kind === 'show'; }).length;
        var n2 = bookings.filter(function (b) { return b.status === 'requested'; }).length;
        var n3 = bookings.filter(function (b) { return b.show_date === TODAY && (b.status === 'requested' || b.status === 'confirmed'); }).reduce(function (a, b) { return a + (b.people || 0); }, 0);
        var n4 = gigs.reduce(function (a, g) { return a + (g.status === 'open' ? (g.apps || []).filter(function (x) { return x.status === 'applied'; }).length : 0); }, 0);
        $('#v-kpis').innerHTML = '<div><dt>오늘 공연</dt><dd>' + n1 + '<small> 회</small></dd></div><div><dt>오늘 예약 손님</dt><dd>' + n3 + '<small> 명</small></dd></div>' +
          '<a href="partner.html#p-book" style="text-decoration:none;color:inherit"><div style="height:100%"><dt>확정 전 예약</dt><dd' + (n2 ? ' style="color:var(--accent)"' : '') + '>' + n2 + '<small> 건</small></dd></div></a>' +
          '<a href="partner.html#gigs" style="text-decoration:none;color:inherit"><div style="height:100%"><dt>공고 새 지원</dt><dd' + (n4 ? ' style="color:var(--accent)"' : '') + '>' + n4 + '<small> 명</small></dd></div></a>';
      }
      var vw = $('#v-week'); if (vw) {
        var list = shows.filter(function (s) { return s.status === 'scheduled'; }).map(vShow);
        vw.innerHTML = weekHtml(function (d) { return list.filter(function (s) { return s.d === d; }); }, true);
        $('#v-week-note').textContent = '우리 매장 일정';
      }
    });
  }

  // ---------------------------------------------------------------- 가수: 홈 (내 프로필 링크 · 공연 · 공고 · 팁 · 클립 반응)
  function profileUrl(id) { return location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '') + 'singer.html?id=' + id; }
  function artistHome(pr) {
    var m = member('artist'); if (!m || !SB_ON || !pr) return;
    var lk = $('#a-link');
    if (lk) {
      lk.hidden = false;
      if (pr.status === 'approved') {
        $('#a-link-url').value = profileUrl(m.id); $('#a-link-open').href = 'singer.html?id=' + m.id;
        $('#a-link-copy').addEventListener('click', function () {
          var u = profileUrl(m.id);
          (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast('내 프로필 링크를 복사했어요'); }, function () { $('#a-link-url').select(); toast('주소를 길게 눌러 복사해 주세요'); });
        });
      } else { $('#a-link-url').value = '프로필이 승인되면 열려요'; $('#a-link-copy').disabled = true; $('#a-link-open').hidden = true; }
    }
    Promise.all([aRpc('my_shows').catch(function () { return []; }), aRpc('my_gig_apps').catch(function () { return []; }), sbRpc('open_gigs', {}).catch(function () { return []; }),
                 aRpc('my_tips').catch(function () { return []; }), aRpc('my_clip_stats').catch(function () { return []; })]).then(function (r) {
      var shows = r[0] || [], apps = r[1] || [], gigs = r[2] || [], tips = r[3] || [], clips = r[4] || [];
      var ym = TODAY.slice(0, 7), mine = {}; apps.forEach(function (a) { mine[a.gig_id] = a; });
      var up = shows.filter(function (s) { return s.show_date >= TODAY && s.status === 'scheduled'; });
      var tipSum = tips.filter(function (t) { return t.status === 'confirmed' && String(t.confirmed_at || t.created_at).slice(0, 7) === ym; }).reduce(function (a, t) { return a + t.amount; }, 0);
      var views = clips.reduce(function (a, c) { return a + (c.views || 0); }, 0), likes = clips.reduce(function (a, c) { return a + (c.likes || 0); }, 0);
      $('#a-sum').hidden = false;
      $('#a-kpis').innerHTML = '<div><dt>다가오는 공연</dt><dd>' + up.length + '<small> 회</small></dd></div><div><dt>이번 달 받은 팁</dt><dd>' + won(tipSum) + '<small> 원</small></dd></div>' +
        '<div><dt>클립 조회</dt><dd>' + won(views) + '</dd></div><div><dt>클립 좋아요</dt><dd>' + won(likes) + '</dd></div>';
      // 내 공연 일정 + 지원 중인 공고
      var rows = up.map(function (s) {
        return '<li><span class="t"><b>' + esc(dayLabel(s.show_date) + (s.show_time ? ' ' + s.show_time : '') + ' · ' + s.venue_name) + '</b><span>' + esc([areaOf(s), s.pay ? '공연비 ' + s.pay : ''].filter(Boolean).join(' · ')) + '</span></span>' + pillHtml(PAYST[s.pay_status]) + '</li>';
      }).concat(apps.filter(function (a) { return a.status === 'applied' && a.gig_date >= TODAY; }).map(function (a) {
        return '<li><span class="t"><b>' + esc(dayLabel(a.gig_date) + (a.gig_time ? ' ' + a.gig_time : '') + ' · ' + a.venue_name) + '</b><span>공고 지원 · 사장님 확인 중</span></span>' + pillHtml(GSTATUS.applied) + '</li>';
      }));
      var sh = $('#a-shows'); sh.hidden = false;
      $('ul', sh).innerHTML = rows.length ? rows.join('') : '<li><span class="t"><b style="color:var(--muted)">잡힌 공연이 아직 없어요</b><span>빈 무대 공고에 지원하거나 라이브바에 컨택해 보세요</span></span><a class="btn sm" href="match.html#gigs">공고 보기</a></li>';
      // 빈 무대 공고 (지원 안 한 것 3개)
      var open = gigs.filter(function (g) { return !mine[g.id]; }).slice(0, 3), gg = $('#a-gigs');
      gg.hidden = !open.length;
      $('ul', gg).innerHTML = open.map(function (g) {
        return '<li><span class="t"><b>' + esc(g.venue_name + ' · ' + dayLabel(g.gig_date) + (g.gig_time ? ' ' + g.gig_time : '')) + '</b><span>' + esc([g.pay || '공연비 협의', g.lineup, areaOf(g)].filter(Boolean).join(' · ')) + '</span></span><a class="btn sm" href="match.html#gigs">지원</a></li>';
      }).join('');
      // 받은 팁 · 신청곡
      var tb = $('#a-tips'); tb.hidden = false;
      $('#a-tips-sum').textContent = '이번 달 ' + won(tipSum) + '원';
      $('ul', tb).innerHTML = tips.length ? tips.slice(0, 6).map(function (t) {
        var extra = [t.song ? '♪ ' + t.song : '', t.message ? '“' + t.message + '”' : ''].filter(Boolean).join(' · ');
        return '<li><span class="t"><b>' + esc(t.payer) + ' · ' + (t.status === 'confirmed' ? won(t.amount) + '원' : '입금 확인 중') + '</b><span>' + esc(extra || (t.venue_name || '') + ' · ' + ago(t.created_at)) + '</span></span>' +
          (t.status === 'confirmed' ? '<span class="pill yes">전달</span>' : '<span class="pill wait">확인 중</span>') + '</li>';
      }).join('') : '<li><span class="t"><b style="color:var(--muted)">아직 받은 팁이 없어요</b><span>손님이 현장 팁을 보내면 신청곡 · 한마디와 함께 여기에 보여요</span></span></li>';
      // 클립 반응
      var cb = $('#a-clips'); cb.hidden = !clips.length;
      $('ul', cb).innerHTML = clips.slice(0, 5).map(function (c) {
        return '<li><span class="t"><b>' + esc(c.caption || (c.source === 'youtube' ? '유튜브 영상' : c.source === 'instagram' ? '인스타그램 영상' : '공연 클립')) + '</b><span>' + esc(ago(c.created_at) + (c.status === 'hidden' ? ' · 관리자가 숨김' : '')) + '</span></span><span class="tiny" style="white-space:nowrap">조회 ' + won(c.views) + ' · ♥ ' + won(c.likes) + '</span></li>';
      }).join('');
    });
  }

  // 무대 컨택 (가수): 빈 무대 공고 · 지원 · 내 지원 현황
  function artistGigs() {
    var box = $('#gg-list'); if (!box) return;
    if (!SB_ON) { box.innerHTML = '<p class="empty">공고는 서버에 연결되면 보여요</p>'; return; }
    var cur = null, gigsById = {};
    function load() {
      var m = member('artist');
      return Promise.all([sbRpc('open_gigs', {}), m ? aRpc('my_gig_apps').catch(function () { return []; }) : Promise.resolve([])]).then(function (r) {
        var gigs = r[0] || [], apps = r[1] || [], mine = {}; apps.forEach(function (a) { mine[a.gig_id] = a; });
        gigsById = {}; gigs.forEach(function (g) { gigsById[g.id] = g; });
        $('#gg-count').textContent = gigs.length ? gigs.length + '건 모집 중' : '';
        box.innerHTML = gigs.length ? gigs.map(function (g) {
          var a = mine[g.id];
          return '<article class="gcard" data-gig="' + esc(g.id) + '"><div class="between" style="align-items:center"><h3>' + esc(g.venue_name) + '</h3><span class="tiny">' + esc(areaOf(g)) + '</span></div>' +
            '<div class="meta"><b>' + esc(dayLabel(g.gig_date) + (g.gig_time ? ' ' + g.gig_time : '')) + '</b> · ' + esc([g.pay || '공연비 협의', g.lineup, (g.genres || []).join(' · ')].filter(Boolean).join(' · ')) + '</div>' +
            (g.note ? '<p class="tiny" style="margin:0">' + esc(g.note) + '</p>' : '') +
            '<div class="between" style="align-items:center"><span class="tiny">지원 ' + (g.apps || 0) + '명</span>' +
            (a && a.status === 'applied' ? '<span class="row" style="gap:6px">' + pillHtml(GSTATUS.applied) + '<button type="button" class="btn ghost sm" data-withdraw="' + esc(a.app_id) + '">지원 취소</button></span>'
              : a ? pillHtml(GSTATUS[a.status]) : '<button type="button" class="btn sm" data-apply>지원하기</button>') + '</div></article>';
        }).join('') : '<p class="empty">지금 모집 중인 공고가 없어요. 새 공고가 올라오면 여기에 보여요</p>';
        var mb = $('#gg-mine'), done = apps.filter(function (a) { return a.status !== 'applied' || !gigsById[a.gig_id]; });
        mb.hidden = !done.length;
        $('ul', mb).innerHTML = done.map(function (a) {
          return '<li><span class="t"><b>' + esc(a.venue_name + ' · ' + dayLabel(a.gig_date) + (a.gig_time ? ' ' + a.gig_time : '')) + '</b><span>' + esc(a.status === 'picked' ? '공연 일정에 들어갔어요' + (a.venue_phone ? ' · 매장 ' + a.venue_phone : '') : a.status === 'declined' ? '다른 가수로 마감됐어요' : a.status === 'withdrawn' ? '지원을 취소했어요' : '공고가 마감됐어요') + '</span></span>' +
            (a.status === 'picked' && a.venue_phone ? telA(a.venue_phone, '전화') : pillHtml(GSTATUS[a.status])) + '</li>';
        }).join('');
      }).catch(function () { box.innerHTML = '<p class="empty">공고를 불러오지 못했어요. 잠시 후 다시 열어 주세요</p>'; });
    }
    box.addEventListener('click', function (e) {
      var ap = e.target.closest('[data-apply]'), wd2 = e.target.closest('[data-withdraw]');
      if (ap) {
        if (!member('artist')) { toast('가수 프로필을 먼저 등록해 주세요'); setTimeout(function () { location.href = 'index.html?edit=artist'; }, 1200); return; }
        cur = ap.closest('[data-gig]').getAttribute('data-gig'); var g = gigsById[cur] || {};
        $('#ap-info').textContent = (g.venue_name || '') + ' · ' + (g.gig_date ? dayLabel(g.gig_date) : '') + (g.gig_time ? ' ' + g.gig_time : '') + ' · ' + (g.pay || '공연비 협의');
        $('#ap-msg').value = ''; openSheet('sheet-apply');
      }
      if (wd2) sure(wd2, '한 번 더 누르면 취소', function () {
        wd2.disabled = true;
        aRpc('withdraw_gig_app', { p_app: wd2.getAttribute('data-withdraw') }).then(function () { toast('지원을 취소했어요'); load(); }, function (er) { wd2.disabled = false; toast(rpcErr(er, {})); });
      });
    });
    var send = $('#ap-send');
    if (send) send.addEventListener('click', function () {
      if (!cur) return; busy(send, true);
      aRpc('apply_gig', { p_gig: cur, p_message: val('ap-msg') || null }).then(function () {
        busy(send, false); closeSheet($('#sheet-apply')); toast('지원했어요 · 사장님이 고르면 알려 드려요'); load();
      }, function (er) { busy(send, false); toast(rpcErr(er, { not_open: '마감된 공고예요', not_member: '가수 프로필을 다시 확인해 주세요' })); });
    });
    load();
    if (location.hash === '#gigs') setTimeout(function () { var t = $('#gigs'); if (t) t.scrollIntoView({ block: 'start' }); }, 300);
  }

  // ---------------------------------------------------------------- 내 예약 화면 (mybooking.html)
  PAGES.mybooking = function () {
    function paint(all) {
      var sp = splitBookings(all);
      $('#mb-loading').hidden = true;
      $('#mb-up').hidden = !sp.up.length; $('#mb-up-list').innerHTML = sp.up.map(bookCardHtml).join('');
      $('#mb-past').hidden = !sp.past.length; $('#mb-past-list').innerHTML = sp.past.slice(0, 20).map(bookCardHtml).join('');
      $('#mb-empty').hidden = !!(sp.up.length || sp.past.length);
    }
    var local = myBookingsLocal();
    if (local.length) paint(local);
    refreshBookings().then(paint, function () { paint(myBookingsLocal()); });
  };

  // ---------------------------------------------------------------- 가수 공개 프로필 (singer.html?id=)
  PAGES.singer = function () {
    var id = new URLSearchParams(location.search).get('id') || '';
    function none() { $('#sg-loading').hidden = true; $('#sg-none').hidden = false; }
    if (!/^[0-9a-f-]{36}$/i.test(id) || !SB_ON) { none(); return; }
    Promise.all([sbRpc('public_artist', { p_id: id }), sbRpc('public_shows', { p_from: TODAY, p_days: 60, p_artist: id }).catch(function () { return []; }),
                 sbRpc('public_clips', { p_limit: 20, p_artist: id }).then(clipSign).catch(function () { return []; })]).then(function (r) {
      var a = r[0] && r[0][0], shows = r[1] || [], clips = r[2] || [];
      if (!a) { none(); return; }
      document.title = a.name + ' | 컨택싱어 가수 프로필';
      $('#sg-loading').hidden = true; $('#sg-head').hidden = false;
      $('#sg-ini').textContent = String(a.name || '?').slice(0, 1); $('#sg-name').textContent = a.name;
      $('#sg-meta').textContent = [a.lineup, (a.genres || []).join(' · '), a.region].filter(Boolean).join(' · ') || '컨택싱어 가수';
      $('#sg-sns').innerHTML = snsHtml(a);
      var bio = $('#sg-bio'); bio.hidden = !a.bio; bio.textContent = a.bio || '';
      $('#sg-tip').href = 'tip.html?to=' + encodeURIComponent(a.name);
      var list = shows.map(function (s) { return { id: s.id, d: s.show_date, t: s.show_time || '', p: s.part || '', a: s.artist_name, aid: s.artist_id, v: s.venue_name, vid: s.venue_id, area: s.area, type: 'show' }; });
      $('#sg-book').href = list[0] ? bookHref(list[0]) : 'booking.html';
      if (list.length) {
        $('#sg-shows-box').hidden = false;
        $('#sg-shows').innerHTML = list.slice(0, 10).map(function (s) {
          return '<li><span class="t"><b>' + esc(dayLabel(s.d) + (s.t ? ' ' + s.t : '') + ' · ' + s.v) + '</b><span>' + esc(areaOf(s)) + '</span></span><a class="btn sm" href="' + bookHref(s) + '">예약</a></li>';
        }).join('');
      }
      var cs = (a.careers || []).filter(function (c) { return c && (c[0] || c.place); });
      if (cs.length) { $('#sg-careers-box').hidden = false; $('#sg-careers').innerHTML = cs.slice(0, 12).map(function (c) { return '<li><span class="t"><b>' + esc(c[0] || c.place) + '</b><span>' + esc(c[1] || c.date || '') + '</span></span></li>'; }).join(''); }
      if (clips.length) {
        var box = $('#sg-clips'); $('#sg-clips-box').hidden = false;
        box.innerHTML = clips.map(function (c) { return clipPost(c, c._url, false); }).join('');
        clipBind(box, null);
      }
    }, none);
    $('#sg-share').addEventListener('click', function () {
      var u = location.href, t = ($('#sg-name').textContent || '가수') + ' | 컨택싱어';
      if (navigator.share) navigator.share({ title: t, url: u }).catch(function () {});
      else (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast('프로필 링크를 복사했어요'); }, function () { toast(u); });
    });
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
  /* ---------- 가수 SNS: 인스타그램 아이디 · 유튜브 채널 주소 정리 ---------- */
  function igHandle(v) {
    v = String(v || '').trim(); if (!v) return '';
    var m = v.match(/^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([^/?#]+)/i); if (m) v = m[1];
    v = v.replace(/^@/, '');
    if (!/^[A-Za-z0-9._]{1,30}$/.test(v) || /^(p|reel|reels|tv|stories|explore|accounts)$/i.test(v)) return null;
    return v;
  }
  function ytChannel(v) {
    v = String(v || '').trim(); if (!v) return '';
    if (/^@[^\s/?#]{3,30}$/.test(v)) return 'https://www.youtube.com/@' + encodeURIComponent(v.slice(1));
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    var u; try { u = new URL(v); } catch (e) { return null; }
    var h = u.hostname.toLowerCase().replace(/^(www|m|music)\./, ''), p = u.pathname.replace(/\/+$/, '');
    if (h === 'youtu.be') return /^\/[A-Za-z0-9_-]{11}$/.test(p) ? 'https://youtu.be' + p : null;
    if (h !== 'youtube.com') return null;
    var ch = p.match(/^\/(@[A-Za-z0-9._%-]{3,120}|channel\/[A-Za-z0-9_-]{10,40}|c\/[A-Za-z0-9._%-]{1,120}|user\/[A-Za-z0-9._%-]{1,120})(?:\/(?:videos|shorts|featured|streams|about))?$/);
    if (ch) return 'https://www.youtube.com/' + ch[1];
    var vid = u.searchParams.get('v') || '';
    if (p === '/watch' && /^[A-Za-z0-9_-]{11}$/.test(vid)) return 'https://www.youtube.com/watch?v=' + vid;
    if (/^\/shorts\/[A-Za-z0-9_-]{11}$/.test(p)) return 'https://www.youtube.com' + p;
    return null;
  }
  function snsCheck(pre) {
    var ig = igHandle(val(pre + '-insta')), yt = ytChannel(val(pre + '-yt')), bad = null;
    [[pre + '-insta', ig], [pre + '-yt', yt]].forEach(function (x) {
      var el = document.getElementById(x[0]), er = document.getElementById(x[0] + '-err'), b = x[1] === null;
      if (er) er.hidden = !b; if (el) el.setAttribute('aria-invalid', b ? 'true' : 'false'); if (b && !bad) bad = el;
    });
    if (bad) { bad.scrollIntoView({ block: 'center', behavior: 'smooth' }); try { bad.focus({ preventScroll: true }); } catch (e) { bad.focus(); } return null; }
    return { instagram: ig, youtube: yt };
  }
  function snsHtml(x, compact) {
    var ig = x && igHandle(x.instagram), yt = x && x.youtube ? ytChannel(x.youtube) : '', out = '';
    if (ig) out += '<a class="sns ig" href="https://www.instagram.com/' + encodeURIComponent(ig) + '/" target="_blank" rel="noopener noreferrer" aria-label="인스타그램 @' + esc(ig) + ' (새 창)">' + ICON.ig + '<span>' + (compact ? '인스타' : '@' + esc(ig)) + '</span></a>';
    if (yt) out += '<a class="sns yt" href="' + esc(yt) + '" target="_blank" rel="noopener noreferrer" aria-label="유튜브 채널 (새 창)">' + ICON.yt + '<span>유튜브</span></a>';
    return out;
  }
  // SNS 영상 주소 → { source: 'youtube', id } / { source: 'instagram', id: 'reel:코드' }
  function parseVideoLink(v) {
    v = String(v || '').trim(); if (!v) return null;
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    var u; try { u = new URL(v); } catch (e) { return null; }
    var h = u.hostname.toLowerCase().replace(/^(www|m)\./, ''), p = u.pathname, m;
    if (h === 'youtu.be') { m = p.match(/^\/([A-Za-z0-9_-]{11})(?:\/|$)/); return m ? { source: 'youtube', id: m[1] } : null; }
    if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
      var vid = u.searchParams.get('v') || '';
      if (p === '/watch' && /^[A-Za-z0-9_-]{11}$/.test(vid)) return { source: 'youtube', id: vid };
      m = p.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})(?:\/|$)/); return m ? { source: 'youtube', id: m[1] } : null;
    }
    if (h === 'instagram.com') {
      m = p.match(/^\/(?:[A-Za-z0-9._]+\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]{5,40})(?:\/|$)/);
      return m ? { source: 'instagram', id: (m[1] === 'p' ? 'p' : 'reel') + ':' + m[2] } : null;
    }
    return null;
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
      var sns = snsCheck('ar'); if (!sns) return;
      if (!agreeOk('ar-agree')) return;
      var careers = $$('.crow', rows).map(function (r) { var ins = $$('input', r); return [ins[0].value.trim(), ins[1].value.trim()]; }).filter(function (c) { return c[0]; });
      var tracks = [];
      var au = $('#ar-audio').files[0]; if (au) tracks.push([au.name.replace(/\.[^.]+$/, ''), '파일 업로드']);
      if (val('ar-audio-link')) tracks.push(['음원 링크', val('ar-audio-link')]);
      var vf = $('#ar-video').files[0], photo = $('#ar-photo').files[0];
      if (!fileOk(photo, '프로필 사진')) return;
      if (FEAT.signup === false) { toast('지금은 신규 등록을 잠시 쉬고 있어요'); return; }
      var row = {
        source: 'detail', name: val('ar-name'), phone: val('ar-phone'), lineup: picked($('#ar-lineup'))[0] || null, genres: picked($('#ar-genres')),
        link: val('ar-video-link') || val('ar-audio-link') || null,
        details: { age: +val('ar-age') || null, region: val('ar-region') || null, bio: val('ar-bio') || null, careers: careers,
                   audio_link: val('ar-audio-link') || null, video_link: val('ar-video-link') || null,
                   audio_file: au ? au.name : null, video_file: vf ? vf.name : null, instagram: sns.instagram, youtube: sns.youtube }
      };
      var btn = $('#ar-submit'); busy(btn, true);
      saveMember('artist', row, [{ folder: 'artist-photo', files: [photo], set: function (r, ps) { r.photo_path = ps[0]; } }]).then(function (where) {
        busy(btn, false); savedWhere(where);
        put('role', 'artist'); put('profile-artist', { name: row.name, phone: row.phone, lineup: row.lineup || '', genres: row.genres, link: row.link || '', instagram: sns.instagram, youtube: sns.youtube, at: TODAY });
        openSheet('sheet-done');
      }, function (e) { busy(btn, false); saveFail(e); });
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
      var cert = $('#vr-cert').files[0], photos = Array.prototype.slice.call($('#vr-photos').files || []).slice(0, 10);
      if (!fileOk(cert, '사업자등록증')) return;
      for (var i = 0; i < photos.length; i++) if (!fileOk(photos[i], '매장 사진')) return;
      if (FEAT.signup === false) { toast('지금은 신규 등록을 잠시 쉬고 있어요'); return; }
      var pv = profileOf('venue') || {};
      var row = {
        source: 'detail', venue_name: val('vr-name'), owner_name: pv.owner || null, phone: val('vr-phone'),
        area: (val('vr-addr') + ' ' + val('vr-addr2')).trim() || null, styles: picked($('#vr-styles')), open_days: picked($('#vr-days')),
        details: { category: picked($('#vr-cat'))[0] || null, biz_no: val('vr-biz'), capacity: +val('vr-cap') || null, hours: val('vr-time') || null,
                   pay: picked($('#vr-pay'))[0] || null, mood: val('vr-mood') || null, equipment: picked($('#vr-gear')) }
      };
      var btn = $('#vr-submit'); busy(btn, true);
      saveMember('venue', row, [
        { folder: 'venue-cert', files: [cert], set: function (r, ps) { r.cert_path = ps[0]; } },
        { folder: 'venue-photo', files: photos, set: function (r, ps) { r.photo_paths = ps; } }
      ]).then(function (where) {
        busy(btn, false); savedWhere(where);
        put('role', 'venue');
        openSheet('sheet-done');
      }, function (e) { busy(btn, false); saveFail(e); });
    });
  };

  PAGES.about = function () { };

  /* ---------- 관리자 사이트에서 정한 공지 · 점검 · 기능 · 팝업 ---------- */
  var FEAT_PAGES = { booking: ['booking.html'], tip: ['tip.html'], feed: ['feed.html'], clip: ['clip.html'], match: ['match.html', 'venue-match.html'] };
  var IS_MAINT = false;
  function safeLink(u) { u = String(u || '').trim(); return /^(https?:\/\/|[a-z0-9-]+\.html([?#].*)?$)/i.test(u) ? u : ''; }
  function blockScreen(title, msg, home) {
    var old = $('#cs-block'); if (old) old.remove();
    var d = document.createElement('div');
    d.className = 'cs-block'; d.id = 'cs-block'; d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'cs-block-t');
    d.innerHTML = '<span class="mark-badge lg" aria-hidden="true"></span><h2 id="cs-block-t"></h2><p></p>' + (home ? '<a class="btn" href="home.html">홈으로</a>' : '');
    var badge = $('.mark-badge'); if (badge) $('.mark-badge', d).innerHTML = badge.innerHTML;
    $('h2', d).textContent = title; $('p', d).textContent = msg;
    document.body.appendChild(d);
  }
  document.addEventListener('click', function (e) {
    var k = e.target.closest('[data-kakao-start]'); if (k) { e.preventDefault(); kakaoStart(k.getAttribute('data-kakao-start'), k.getAttribute('data-back')); return; }
    var o = e.target.closest('[data-kakao-logout]'); if (o) { e.preventDefault(); kakaoLogout(); }
  });
  function applySettings(rows) {
    var s = {}; (rows || []).forEach(function (r) { s[r.key] = r.value || {}; });
    AUTH = s.auth || {};
    if (AUTH.kakao) $$('[data-kakao]').forEach(function (el) { if (session() && (el.classList.contains('kakao-box') || el.hasAttribute('data-kakao-out'))) return; el.hidden = false; });
    var m = s.maintenance || {};
    if (m.on) { IS_MAINT = true; blockScreen('잠시 점검 중이에요', m.message || '곧 다시 만나요!', false); return; }
    FEAT = s.features || {};
    var here = location.pathname.split('/').pop() || 'index.html';
    Object.keys(FEAT_PAGES).forEach(function (k) {
      if (FEAT[k] !== false) return;
      FEAT_PAGES[k].forEach(function (f) {
        $$('a[href^="' + f + '"]').forEach(function (a) {
          var li = a.closest('.screens li'); if (li) { li.hidden = true; return; }
          if (a.closest('.igrid, .cattabs, .tabbar')) a.hidden = true;
        });
        if (here === f) blockScreen('이 기능은 잠시 쉬고 있어요', '곧 다시 열게요. 홈에서 다른 기능을 둘러보세요.', true);
      });
    });
    $$('.tabbar').forEach(function (tb) { tb.style.setProperty('--tabs', $$('a', tb).filter(function (a) { return !a.hidden; }).length); });
    if (FEAT.signup === false) $$('[data-form] button[type="submit"], #ar-submit, #vr-submit').forEach(function (b) { b.disabled = true; b.textContent = '지금은 신규 등록을 잠시 쉬고 있어요'; });
    var n = s.notice || {};
    if (n.on && n.text && page !== 'intro' && page !== 'clip') showNotice(n);
  }
  function showNotice(n) {
    var key = String(n.text).slice(0, 80), hid = store.get('csm-notice-hide', '');
    var main = $('#main'); if (!main || hid === key || $('#cs-notice')) return;
    var bar = document.createElement('div'), link = safeLink(n.link);
    bar.className = 'notice-bar'; bar.id = 'cs-notice'; bar.setAttribute('role', 'status');
    bar.innerHTML = '<span class="nb-ic" aria-hidden="true">공지</span>' + (link ? '<a class="nb-t"></a>' : '<span class="nb-t"></span>') + '<button type="button" class="nb-x" aria-label="공지 닫기">&times;</button>';
    var t = $('.nb-t', bar); t.textContent = n.text; if (link) t.setAttribute('href', link);
    $('.nb-x', bar).addEventListener('click', function () { store.set('csm-notice-hide', key); bar.remove(); });
    main.insertBefore(bar, main.firstChild);
  }
  function popClosed() { try { return JSON.parse(sessionStorage.getItem('csm-pop-closed') || '{}'); } catch (e) { return {}; } }
  function showPopup(list) {
    if (IS_MAINT || !list || !list.length || $('#cs-pop')) return;
    var role = st('role', ''), place = page === 'intro' ? 'start' : 'home', hide = store.get('csm-popup-hide', {}) || {}, closed = popClosed();
    var p = list.filter(function (x) {
      return (x.target === 'all' || x.target === role) && (x.place === 'all' || x.place === place) && hide[x.id] !== TODAY && !closed[x.id];
    })[0];
    if (!p) return;
    var bg = document.createElement('div'), img = /^https:\/\//.test(p.image_url || '') ? p.image_url : '', link = safeLink(p.link_url);
    bg.className = 'pop-bg'; bg.id = 'cs-pop';
    bg.innerHTML = '<div class="pop" role="dialog" aria-modal="true" aria-labelledby="cs-pop-t">' + (img ? '<img class="pop-img" alt="">' : '') +
      '<div class="pop-body"><h2 id="cs-pop-t"></h2><p class="pop-text"></p>' + (link ? '<a class="btn block pop-link"></a>' : '') + '</div>' +
      '<div class="pop-foot"><button type="button" data-k="today">오늘 하루 보지 않기</button><button type="button" data-k="close">닫기</button></div></div>';
    if (img) $('.pop-img', bg).src = img;
    $('#cs-pop-t', bg).textContent = p.title; $('.pop-text', bg).textContent = p.body || '';
    if (!p.body) $('.pop-text', bg).hidden = true;
    if (link) { var a = $('.pop-link', bg); a.textContent = p.link_label || '자세히 보기'; a.href = link; if (/^https?:/.test(link)) { a.target = '_blank'; a.rel = 'noopener'; } }
    var prev = document.activeElement;
    function close(today) {
      if (today) { hide[p.id] = TODAY; store.set('csm-popup-hide', hide); }
      closed[p.id] = 1; try { sessionStorage.setItem('csm-pop-closed', JSON.stringify(closed)); } catch (e) { /* 저장 불가 */ }
      bg.remove(); document.removeEventListener('keydown', esc1); if (prev && prev.focus) prev.focus();
    }
    function esc1(e) { if (e.key === 'Escape') close(false); }
    $('[data-k="today"]', bg).addEventListener('click', function () { close(true); });
    $('[data-k="close"]', bg).addEventListener('click', function () { close(false); });
    bg.addEventListener('click', function (e) { if (e.target === bg) close(false); });
    document.addEventListener('keydown', esc1);
    document.body.appendChild(bg);
    $('[data-k="close"]', bg).focus();
  }
  function loadRemote() {
    if (!SB_ON) return;
    var settings = sbReq('/rest/v1/app_settings?select=key,value').then(applySettings, function () { /* 서버 연결 불가: 기본 화면 유지 */ });
    if (page === 'intro' || page === 'home') {
      var pops = sbReq('/rest/v1/popups?select=id,title,body,image_url,link_url,link_label,target,place&order=sort.asc,created_at.desc');
      Promise.all([settings, pops]).then(function (r) { showPopup(r[1]); }, function () { /* 팝업 없음 */ });
    }
  }

  // 첫 화면: 연락 · 접촉 · 교제를 고르면 연결 그림과 설명 카드가 함께 바뀐다
  /* ---------- 실행 ---------- */
  var page = document.body.getAttribute('data-page');
  // 관리자가 보낸 '앱 연결 링크'로 다른 기기에서도 내 매장 · 프로필을 이어서 쓴다
  (function linkDevice() {
    var q = new URLSearchParams(location.search), m = q.get('member'), re = /^[0-9a-f-]{36}$/i;
    if (!m) return;
    var p = m.split('.');
    if (p.length === 3 && TABLE_OF[p[0]] && re.test(p[1]) && re.test(p[2])) { put('member-' + p[0], { id: p[1], token: p[2] }); put('role', p[0]); setTimeout(function () { toast('이 기기를 연결했어요'); }, 400); }
    q.delete('member');
    try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q.toString() : '') + location.hash); } catch (e) { /* 주소 변경 불가 */ }
  })();
  // 안드로이드 앱(홈 화면 아이콘)으로 열면: 이미 역할을 고른 사람은 첫 화면을 건너뛰고 홈으로
  if (page === 'intro' && new URLSearchParams(location.search).get('source') === 'app' && ROLE_LABEL[st('role')] && !location.hash) { location.replace('home.html'); return; }
  // 오프라인일 때 안내 화면 (https 사이트에서만 등록)
  if ('serviceWorker' in navigator && location.protocol === 'https:') { try { navigator.serviceWorker.register('sw.js').catch(function () { /* 무시 */ }); } catch (e) { /* 무시 */ } }
  function start() {
    if (PAGES[page]) PAGES[page]();
    autoVideos();
    loadRemote();
    // 화면 지도의 '오늘' 공연 줄
    var tl = $('[data-bind="tonight"]');
    if (tl) { var ns = nextShow(); tl.textContent = ns ? (ns.d === TODAY ? '오늘 ' : dayLabel(ns.d) + ' ') + ns.t + ' · ' + who(ns) + (isHang(ns.v) ? '' : ' · ' + ns.v) : '다음 일정 준비 중'; }
    // 예시 화면의 '다가오는 토요일' 날짜
    var sat = addDays(TODAY, 1); while (wd(sat) !== '토') sat = addDays(sat, 1);
    $$('[data-bind="next-sat"]').forEach(function (el) { el.textContent = md(sat); });
    $$('[data-bind="next-sat-label"]').forEach(function (el) { el.textContent = '다음 공연 ' + dayLabel(sat); });
  }
  // 공연 일정을 쓰는 화면은 데이터베이스 일정을 먼저 받는다 (1.5초 넘으면 받아 둔 일정 · 기본 일정으로 시작)
  var NEED_SHOWS = { home: 1, schedule: 1, booking: 1, tip: 1, feed: 1, clip: 1, singer: 1 };
  if (NEED_SHOWS[page] && SB_ON) {
    var started = false, go = function () { if (!started) { started = true; start(); } };
    loadShows().then(go); setTimeout(go, 1500);
  } else start();
})();
