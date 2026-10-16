/* =========================================================
   coreflow-date.js ─ 📅 CFDate＝日本時間の日付の共通部品（棚卸し C-02）  v1.0.0  2026-10-16
   ---------------------------------------------------------
   🔴 全アプリ共通の本体はここ。アプリの js\coreflow-date.js・サーバーの cf-date.js は写し（sync-shared.ps1 が配る）。

   なぜ：「今日」を作る小さな関数が全アプリで100個以上ばらばら・祝日の取り方が4通り・サーバーは祝日を知らない。
         toISOString().slice(0,10) は世界時間＝日本の朝0〜9時は前の日になる（S-40・A-07 で踏んだ）。
   決めごと：
     ・日付の文字は 'YYYY-MM-DD'（日本時間）。端末の時計の地域が日本でなくても、サーバー（世界時間）でも同じ答え
     ・月を動かす時は1日に寄せてから（A-04）。日付つきで動かす時は月末に寄せる（1/31 の1か月後＝2/28）
     ・年の無い古い時刻（'M/D HH:MM'）は「今年。ただし今より先なら去年」として読む（A-08）
     ・新しく書く時刻は数値（ms）で持つ。'M/D HH:MM' だけを保存しない
     ・新しいコードで toISOString() を日付に使わない（見張り _shared\test_date.mjs が全アプリを見る）
     ・古い関数（各アプリの ymd・todayStr など）は、そのファイルを触った時に CFDate へ寄せる

   使い方（画面）：<script src="js/coreflow-date.js?v=0"></script> → window.CFDate
   使い方（サーバー）：const CFDate = require('./cf-date');
     CFDate.today()                 → '2026-10-16'
     CFDate.ymd(ms|Date)            → その時刻の日本時間の日付
     CFDate.ym(x) 'YYYY-MM'／md(x) 'M/D'／hm(x) 'HH:MM'／stamp(x) 'YYYY-MM-DD HH:MM'／fileStamp(x) 'YYYYMMDD_HHMM'
     CFDate.parts(x)                → { y, m, d, h, mi, s, dow }（日本時間）
     CFDate.isYmd(s)                → 正しい 'YYYY-MM-DD' か（2/30 は false）
     CFDate.normYmd(s)              → '2026/10/5'・全角・'2026-10-05T…' を 'YYYY-MM-DD' に。年が無い・おかしい＝null
     CFDate.addDays(ymd, n)／addMonths(ymd|ym, n)／diffDays(a, b)（b−a の日数）／dow(ymd)（0=日）
     CFDate.startMs(ymd)            → その日の日本時間 0:00 の ms
     CFDate.toMs(v, nowMs)          → 数値・'YYYY-MM-DD[ HH:MM]'・ISO・'M/D HH:MM' を ms に。読めない＝null
     CFDate.onDayChange(fn)         → 日付が変わったら fn(新しい日, 前の日)（1分ごとに見る・画面だけ）
     CFDate.holidays.name(ymd) / .is(ymd) / .onLoad(fn)   → 祝日（画面だけ。取り方はここ1本）
   ========================================================= */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var JST = 9 * 3600000, DAY = 86400000;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function msOf(x) {
    if (x == null) return Date.now();
    if (typeof x === 'number') return x;
    if (x instanceof Date) return x.getTime();
    if (typeof x.toMillis === 'function') return x.toMillis();      /* Firestore の Timestamp */
    var t = toMs(x); return t == null ? NaN : t;
  }
  function parts(x) {
    var ms = msOf(x); if (!isFinite(ms)) return null;
    var d = new Date(ms + JST);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), dow: d.getUTCDay() };
  }
  function ymd(x) { var p = parts(x); return p ? p.y + '-' + pad(p.m) + '-' + pad(p.d) : ''; }
  function today() { return ymd(); }
  function ym(x) { var p = parts(x); return p ? p.y + '-' + pad(p.m) : ''; }
  function md(x) { var p = parts(x); return p ? p.m + '/' + p.d : ''; }
  function hm(x) { var p = parts(x); return p ? pad(p.h) + ':' + pad(p.mi) : ''; }
  function stamp(x) { var p = parts(x); return p ? ymd(x) + ' ' + pad(p.h) + ':' + pad(p.mi) : ''; }
  function fileStamp(x) { var p = parts(x); return p ? '' + p.y + pad(p.m) + pad(p.d) + '_' + pad(p.h) + pad(p.mi) : ''; }

  /* 'YYYY-MM-DD' を世界時間の0時の Date に（暦の計算だけに使う。地域に左右されない） */
  function utc(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return (d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]) ? d : null;
  }
  function fromUtc(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function isYmd(s) { return !!utc(s); }
  function normYmd(s) {
    if (s == null) return null;
    var t = String(s).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[／．]/g, '/').replace(/[－ー−]/g, '-').trim();
    var m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[T\s].*)?$/.exec(t);
    if (!m) return null;
    var v = m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    return isYmd(v) ? v : null;
  }
  function addDays(s, n) { var d = utc(s); if (!d) return ''; d.setUTCDate(d.getUTCDate() + (+n || 0)); return fromUtc(d); }
  /* 月を動かす。'YYYY-MM' なら 'YYYY-MM'、'YYYY-MM-DD' なら日を月末に寄せて返す（A-04：1日に寄せてから動かす） */
  function addMonths(s, n) {
    var str = String(s || ''), m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(str);
    if (!m) return '';
    var base = new Date(Date.UTC(+m[1], +m[2] - 1 + (+n || 0), 1));
    var head = base.getUTCFullYear() + '-' + pad(base.getUTCMonth() + 1);
    if (m[3] == null) return head;
    var last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
    return head + '-' + pad(Math.min(+m[3], last));
  }
  function diffDays(a, b) { var x = utc(a), y = utc(b); return (x && y) ? Math.round((y - x) / DAY) : NaN; }
  function dow(s) { var d = utc(s); return d ? d.getUTCDay() : NaN; }
  function startMs(s) { var d = utc(s); return d ? d.getTime() - JST : NaN; }
  function monthEnd(s) { var m = /^(\d{4})-(\d{2})/.exec(String(s || '')); if (!m) return ''; return fromUtc(new Date(Date.UTC(+m[1], +m[2], 0))); }

  /* いろいろな書き方の時刻を ms に（A-08）。
     ⚠ new Date('10/15 10:00') は 2001年 になる（V8）。だから年の無い形は先に自分で読む */
  function toMs(v, nowMs) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v instanceof Date) { var t0 = v.getTime(); return isNaN(t0) ? null : t0; }
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
    var s = String(v).trim();
    if (/^\d{10,}$/.test(s)) return +s;
    var m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
    if (m) {                                                   /* 地域の無い日付・時刻＝日本時間 */
      var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
      return (d.getUTCMonth() === +m[2] - 1) ? d.getTime() - JST : null;
    }
    m = /^(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(s);
    if (m) {                                                   /* 年の無い古い書き方＝今年。今より先なら去年 */
      var now = nowMs == null ? Date.now() : nowMs, y = parts(now).y;
      var at = Date.UTC(y, +m[1] - 1, +m[2], +(m[3] || 0), +(m[4] || 0)) - JST;
      if (at > now + DAY) at = Date.UTC(y - 1, +m[1] - 1, +m[2], +(m[3] || 0), +(m[4] || 0)) - JST;
      return at;
    }
    if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) { var t = Date.parse(s); return isNaN(t) ? null : t; }   /* 地域つきの ISO */
    return null;
  }

  /* ---------- 日付が変わったら（画面だけ） ---------- */
  var dayFns = [], dayNow = null, dayTimer = null;
  function onDayChange(fn) {
    if (typeof fn !== 'function') return;
    dayFns.push(fn);
    if (dayTimer || typeof setInterval !== 'function' || typeof window === 'undefined') return;
    dayNow = today();
    dayTimer = setInterval(function () {
      var t = today(); if (t === dayNow) return;
      var old = dayNow; dayNow = t;
      dayFns.forEach(function (f) { try { f(t, old); } catch (e) { console.warn('[CFDate] onDayChange', e); } });
    }, 60000);
  }

  /* ---------- 祝日（画面だけ・取り方はここ1本） ----------
     出典＝holidays-jp（キー不要）。端末に7日控える（cf_holidays_v1）。取れなくても控えで続ける。
     会社の休み（営業日）は MHS の会社カレンダーが正（cal-pit.js・appSummaries/mhsCalendar）。ここは国の祝日だけ */
  var HOL_URL = 'https://holidays-jp.github.io/api/v1/date.json', HOL_LS = 'cf_holidays_v1', HOL_AGE = 7 * DAY;
  var holFns = [], holStarted = false;
  /* 使うアプリだけが取りに行く（最初に聞かれた時に控えを読み、古ければ裏で取り直す） */
  var holidays = {
    map: {}, loaded: false,
    name: function (s) { holStart(); return holidays.map[s] || null; },
    is: function (s) { holStart(); return !!holidays.map[s]; },
    onLoad: function (fn) { holStart(); if (typeof fn === 'function') { holFns.push(fn); if (holidays.loaded) { try { fn(holidays.map); } catch (e) {} } } }
  };
  function holSet(map) {
    holidays.map = map || {}; holidays.loaded = true;
    holFns.forEach(function (f) { try { f(holidays.map); } catch (e) { console.warn('[CFDate] holidays.onLoad', e); } });
  }
  function holStart() {
    if (holStarted) return; holStarted = true;
    if (typeof window === 'undefined' || typeof fetch !== 'function') return;
    var at = 0;
    try { var o = JSON.parse(localStorage.getItem(HOL_LS) || 'null'); if (o && o.map) { holidays.map = o.map; holidays.loaded = true; at = o.at || 0; } } catch (e) {}
    if (Date.now() - at <= HOL_AGE) return;
    fetch(HOL_URL, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('status ' + r.status); return r.json(); })
      .then(function (map) { try { localStorage.setItem(HOL_LS, JSON.stringify({ at: Date.now(), map: map })); } catch (e) {} holSet(map); })
      .catch(function (e) { console.warn('[CFDate] 祝日の取得に失敗・控えで続ける', e); });
  }

  var CFDate = {
    VERSION: VERSION,
    parts: parts, ymd: ymd, today: today, ym: ym, md: md, hm: hm, stamp: stamp, fileStamp: fileStamp,
    isYmd: isYmd, normYmd: normYmd, addDays: addDays, addMonths: addMonths, diffDays: diffDays, dow: dow,
    startMs: startMs, monthEnd: monthEnd, toMs: toMs, onDayChange: onDayChange, holidays: holidays
  };
  if (typeof module === 'object' && module.exports) module.exports = CFDate;
  if (root) root.CFDate = CFDate;
})(typeof window !== 'undefined' ? window : null);
