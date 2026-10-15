/* ============================================================
   coreflow-trace.js ── 調査の記録（CFTrace）全アプリ共通・2026-10-15 v1.0.0
   ------------------------------------------------------------
   ⚠ 本体は  D:\Claude\CoreFlowアプリ\_shared\coreflow-trace.js  だけ。
      各アプリの js\ にあるのは sync-shared.ps1 が配った写し（直しても次の配布で消える）。

   ◎なぜ作ったか（ゆうた 2026-10-15）
     🗣「人が見る形のログとは別に、Claude のデバッグ・調査用の、人が見て分からないくらい細かいログを全アプリに」
     🗣「人に依存しない動き（CoreNote で線が消える・CoreBoard で元に戻る・PitFlow でカードがどっか行った）も監視できるか」
     ＝ 開発全体メモ ⑧「バグは許容。何があってもどうだったかを確かめられれば人の手で戻せる」の土台。
     設計＝scratchpad\trace\_design.md の ①（サーバー側の帳簿 ② と毎晩の書き出し ③ は別）。

   ◎何をするか
     Firestore compat SDK の書く・受け取る関数に薄い皮をかぶせて、**アプリのコードを1行も直さずに**
     ・write … どこに・何を（変えた欄と前→後の短い要約）・きっかけ（人の操作か自動か）・結果・かかった ms
     ・recv … 届いた変化（変わった欄の名前・写しからか・自分の書き込みの跳ね返りか）
     ・sync … 線が切れた／戻った／購読が拒否された／同期ランプが赤になった
     ・err  … window.onerror・unhandledrejection・console.error/warn・エラー番号（CFErr）
     ・act  … 人の主な操作（押した・選んだ・送った・Enter 等）。**1文字ずつの入力・入力欄の中身は残さない**
     ・nav  … 起動・画面の切り替え（#…）・隠れた/戻った
     を端末のメモリにため（上限 2,000件の輪）、30秒ごと・エラーの時・タブが隠れた時に、まとめて
     Firestore のトップ `traceLogs/{自動id}` へ1書類で送る（REST・アプリの Firestore とは別の通り道）。

   ◎🔴 いちばん大事な決まり＝**アプリの動きを1つも変えない**
     ・包んだ関数は**元の戻り値をそのまま**返す（Promise もそのもの。then した別物を返さない）
     ・元の関数が投げた例外は**そのまま**投げ直す。記録の中で起きた例外は**全部ここで飲み込む**
     ・送りは fetch で直接（アプリの Firestore の「書きかけ」に混ざらない＝CarFlow の waitForPendingWrites・
       同期ランプ・hasPendingWrites に一切影響しない）
     ・送れない（ルール未設定＝permission-denied）→ その画面では**黙って止まる**（記録もやめる）
       ネットが無い・サーバーが重い → ためたまま次の機会に（上限を超えたら古い物から捨てる）
     ・画面には何も出さない

   ◎送らない所
     ・体験版（github.io）・localhost・ファイルで開いた時 … **皮もかぶせない**（何もしない）
     ・PitFlow の練習モード（PIT_CLOUD=false）・CarFlow 体験版（__DEMO_MODE）・PIT_DEMO … 送らない
     ・止める旗：localStorage.cf_trace_off = '1'（Claude の調べ用）

   ⚠ 読み込む場所：**firebase の SDK（firestore-compat）を読んだ直後・firebase-init.js やアプリの js より前**。
      （coreflow-sync.js はアプリの js の後ろで読む＝こちらが内側・CFSync が外側。両方とも元の動きを通す）
   ============================================================ */
(function (w, d) {
  'use strict';
  if (w.CFTrace) return;

  var LIB = '1.0.0';
  var OPT = w.CF_TRACE_OPT || {};            /* 見張り（test_trace.mjs）用の差し替え口。本番では使わない */
  var MAX = OPT.max || 2000;                 /* ためる上限（輪） */
  var FLUSH_MS = OPT.flushMs || 30000;       /* まとめて送る間隔 */
  var USER_WIN = 3000;                       /* 人の操作からこの ms 以内の書き込み＝人のきっかけ */
  var VAL_MAX = 200;                         /* 値の要約の長さ */
  var CMP_MAX = 600;                         /* 同じか比べる時に見る長さ（＋長さそのもの） */
  var FIELDS_MAX = 30;                       /* 1回の書き込みで細かく残す欄の数 */
  var RECV_DOCS_MAX = 20;                    /* 1回の受信で欄まで見る書類の数 */
  var CACHE_MAX = 8000;                      /* 「前」を覚えておく書類の数 */
  var LINE_MAX = 4000;                       /* 1行の長さの上限 */
  var DOC_LINES = 2000;                      /* 1書類の行数の上限（ルールと同じ） */
  var DOC_BYTES = OPT.docBytes || 700000;    /* 1書類の大きさ（バイト。1MiB の手前で切る） */
  var KEEPALIVE_BYTES = 56000;               /* 閉じる時の送り（keepalive は本文 64KB まで。名札の分を引く） */
  var DENIED_KEY = 'cf_trace_denied_v1';     /* 送りを断られた控え（1件だけ） */
  var CARRY_KEY = 'cf_trace_carry_v1:';
  var CARRY_CHARS = 150000;                  /* 持ち越しの上限（1タブぶん） */
  var TTL_MS = 10 * 86400000;                /* サーバーに置く日数＝10日 */

  /* ---------- 送ってよい所か（読み込んだ時に1回だけ決める） ---------- */
  function hostOk() {
    try {
      var h = String(w.location && w.location.hostname || '').toLowerCase();
      var pr = String(w.location && w.location.protocol || '');
      if (pr === 'tauri:' || h === 'tauri.localhost') return true;        /* FlowDesk（Windows のアプリ） */
      if (/(^|\.)kobayashi-motors\.com$/.test(h)) return true;
      if (/\.web\.app$/.test(h) || /\.firebaseapp\.com$/.test(h)) return true;
    } catch (e) {}
    return false;
  }
  function lsGet(k) { try { return w.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { w.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { w.localStorage.removeItem(k); } catch (e) {} }

  if (!(OPT.force || hostOk()) || lsGet('cf_trace_off') === '1') {
    w.CFTrace = { on: false, lib: LIB, status: function () { return { on: false, why: 'host-or-flag' }; } };
    return;
  }

  /* ---------- いまの状態 ---------- */
  var off = false;              /* true＝止まった（ルールで拒否・止める旗）。皮は残るが何もしない */
  var buf = [];                 /* ためている行（物） */
  var seq = 0, dropped = 0;
  var actSeq = 0, lastActAt = 0;
  var ORIG = {};                /* 包む前の本物 */
  var cache = new Map();        /* path → 最後に見た書類（「前」の値） */
  var myWrites = new Map();     /* path → 自分が書いた時刻（跳ね返りの見分け） */
  var TAB = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  var carryQ = [];              /* 前の画面から持ち越した分 [{tab, app, ver, pg, lines:[文字]}] */
  var sending = false, sendingAt = 0, lastSendAt = 0;
  var deniedSent = false;   /* 前に断られた控えを、今回の送りに入れたか */
  var console0 = {};

  function now() { return Date.now(); }
  function meta(n) { try { var m = d.querySelector('meta[name="' + n + '"]'); return m ? String(m.getAttribute('content') || '') : ''; } catch (e) { return ''; } }
  function appKey() {
    var k = meta('app-key'); if (k) return k;
    if (meta('desk-version')) return 'flowdesk';
    if (meta('m-version')) return 'flowgo';
    try { return String(w.location.hostname || '').split('.')[0] || '?'; } catch (e) { return '?'; }
  }
  function appVer() { return meta('app-version') || meta('desk-version') || meta('m-version') || ''; }
  function page() { try { var p = String(w.location.pathname || ''); return p.slice(p.lastIndexOf('/') + 1) || 'index.html'; } catch (e) { return ''; } }
  function devId() {
    var v = '';
    try { var m = d.cookie.match(/(?:^|;\s*)cf_dev=([^;]+)/); v = m ? decodeURIComponent(m[1]) : ''; } catch (e) {}
    if (!/^d[\w-]+$/.test(v)) v = lsGet('cf_dev') || '';
    return /^d[\w-]+$/.test(v) ? v.slice(0, 60) : '';      /* 無ければ作らない（作るのは usage-log・見やすさの役目） */
  }
  function cid() { try { var c = (w.fb && w.fb.currentCompanyId) || w.COMPANY_ID || w.companyId || ''; return c ? String(c).slice(0, 60) : ''; } catch (e) { return ''; } }
  function mid() {
    try {
      var m = w.fb && w.fb.currentMember;
      var v = m && (m.id || m.memberId || m._id);
      return v ? String(v).slice(0, 60) : '';
    } catch (e) { return ''; }
  }
  function authUser() {
    try {
      var F = w.firebase;
      if (!F || !F.apps || !F.apps.length || typeof F.auth !== 'function') return null;
      return F.auth().currentUser || null;
    } catch (e) { return null; }
  }
  function curUid() { var u = authUser(); return u ? String(u.uid || '') : ''; }

  /* ---------- 1行ためる ---------- */
  function push(o) {
    if (off) return null;
    o.t = o.t || now(); o.s = ++seq;
    var u = curUid(); if (u) o.u = u;
    buf.push(o);
    if (buf.length > MAX) { buf.shift(); dropped++; }
    return o;
  }

  /* ---------- 値を短く言う（上限付き）。比べる時は長めに＋長さを足す ---------- */
  function fvName(v) {
    try {
      if (!v || typeof v !== 'object') return '';
      var FV = w.firebase && w.firebase.firestore && w.firebase.firestore.FieldValue;
      var dl = v._delegate || v;
      var n = dl && dl._methodName;
      /* 印（serverTimestamp・deleteField・arrayUnion・arrayRemove・increment）。v8 は 'FieldValue.○○'、v9 以降は '○○' */
      if (typeof n === 'string' && ((FV && v instanceof FV) || n.indexOf('FieldValue.') === 0)) {
        n = n.replace(/^FieldValue\./, '');
        var x = '', op = dl._operand;
        if (dl._elements && dl._elements.length != null) x = ' ' + dl._elements.length;
        else if (op != null) x = ' ' + (typeof op === 'number' ? op : op.integerValue != null ? op.integerValue : op.doubleValue != null ? op.doubleValue : '');
        return '⟨' + n + x + '⟩';
      }
    } catch (e) {}
    return '';
  }
  /* ---------- 伏せ字（ゆうたが読める記録でも、本人だけの物・鍵は入れない） ----------
     ・鍵・合言葉らしい欄（token・secret・key・password を含む名前）の値（はい/いいえ は残す）
     ・「自分用」（secret:true）の書類（CoreNote・CoreBoard の自分用のノート・ボード・部品）は全部の欄の値
     ＝ 欄の名前と長さだけ残す（例 〔伏せ字〕#12） */
  var SECRET_RE = /token|secret|key|passw|pwd/i;
  function isSecretKey(k) { try { return SECRET_RE.test(String(k)); } catch (e) { return false; } }
  function mask(v) {
    var n = '';
    try {
      if (typeof v === 'string' || Array.isArray(v)) n = '#' + v.length;
      else if (v && typeof v === 'object' && !fvName(v)) n = '#' + Object.keys(v).length + 'keys';
      else if (fvName(v)) n = ' ' + fvName(v).replace(/ .*⟩$/, '⟩');
    } catch (e) {}
    return '〔伏せ字〕' + n;
  }
  function sv(v, lim) {
    lim = lim || VAL_MAX;
    var out = [], len = 0, nodes = 0;
    function add(s) { if (len >= lim) return; out.push(s); len += s.length; }
    function walk(x, depth) {
      if (len >= lim || ++nodes > 400) return;
      if (x === null) return add('null');
      var t = typeof x;
      if (t === 'undefined') return add('undef');
      if (t === 'string') return add(JSON.stringify(x.length > lim ? x.slice(0, lim) : x));
      if (t === 'number' || t === 'boolean') return add(String(x));
      if (t === 'function') return add('fn');
      if (x instanceof Date) return add('ts:' + x.getTime());
      var fv = fvName(x); if (fv) return add(fv);
      if (typeof x.toMillis === 'function' && x.seconds != null) { try { return add('ts:' + x.toMillis()); } catch (e) { return add('ts'); } }
      if (typeof x.path === 'string' && x.firestore && typeof x.id === 'string') return add('ref:' + x.path);
      if (x.latitude != null && x.longitude != null && typeof x.isEqual === 'function') return add('geo:' + x.latitude + ',' + x.longitude);
      if (typeof x.toBase64 === 'function') return add('bytes');
      if (depth > 6) return add('…');
      if (Array.isArray(x)) {
        add('[');
        for (var i = 0; i < x.length && len < lim; i++) { if (i) add(','); walk(x[i], depth + 1); }
        return add(']');
      }
      var ks; try { ks = Object.keys(x).sort(); } catch (e) { return add('?'); }
      add('{');
      for (var j = 0; j < ks.length && len < lim; j++) {
        if (j) add(','); add(ks[j] + ':');
        if (isSecretKey(ks[j]) && typeof x[ks[j]] !== 'boolean') add(mask(x[ks[j]])); else walk(x[ks[j]], depth + 1);
      }
      add('}');
    }
    try { walk(v, 0); } catch (e) { return '?'; }
    var s = out.join('');
    return s.length > lim ? s.slice(0, lim) + '…' : s;
  }
  function cmpKey(v) {
    var n = '';
    try { if (typeof v === 'string' || Array.isArray(v)) n = '#' + v.length; } catch (e) {}
    return sv(v, CMP_MAX) + n;
  }
  /* 配列の足した・抜いた数（上限付き。長すぎたら長さだけ） */
  function arrDiff(b, a) {
    var r = { bl: b.length, al: a.length };
    if (b.length > 300 || a.length > 300) return r;
    var cnt = new Map(), i, k;
    for (i = 0; i < b.length; i++) { k = sv(b[i], 80); cnt.set(k, (cnt.get(k) || 0) + 1); }
    var add = 0;
    for (i = 0; i < a.length; i++) { k = sv(a[i], 80); var c = cnt.get(k) || 0; if (c > 0) cnt.set(k, c - 1); else add++; }
    var del = 0; cnt.forEach(function (c) { del += c; });
    r.add = add; r.del = del;
    return r;
  }
  /* 1つの欄の 前→後 */
  function fieldRec(k, hasB, b, a, isDel, hide) {
    var o = { k: String(k).slice(0, 80) };
    if (hide || isSecretKey(k)) {
      if (hasB) o.b = (b === undefined) ? '∅' : (typeof b === 'boolean' ? String(b) : mask(b));
      o.a = isDel ? '∅' : (typeof a === 'boolean' ? String(a) : mask(a));
      o.hid = 1;
      return o;
    }
    if (hasB) o.b = (b === undefined) ? '∅' : sv(b);
    if (isDel) o.a = '∅';
    else {
      o.a = sv(a);
      if (hasB && Array.isArray(b) && Array.isArray(a)) {
        var r = arrDiff(b, a); o.b = '[' + r.bl + ']'; o.a = '[' + r.al + ']';
        if (r.add != null) { o.add = r.add; o.del = r.del; }
      } else if (Array.isArray(a)) o.a = '[' + a.length + '] ' + o.a;
    }
    return o;
  }
  function isDeleteFV(v) { return fvName(v).indexOf('⟨delete') === 0; }
  function fpName(k) {
    if (typeof k === 'string') return k;
    try { var ip = k && k._delegate && k._delegate._internalPath; if (ip && typeof ip.canonicalString === 'function') return ip.canonicalString(); } catch (e) {}
    return 'FieldPath';
  }
  function snapGet(snap, k) {
    try { if (!snap || !snap.exists) return undefined; return snap.get(k); } catch (e) { return undefined; }
  }
  /* data() は1つの受け取りにつき1回だけ作る（同じ書類を前→後で比べる時に作り直さない） */
  var dataMemo = (typeof WeakMap === 'function') ? new WeakMap() : null;
  function snapData(snap) {
    try {
      if (!snap || !snap.exists) return null;
      if (dataMemo && typeof snap === 'object') { var m = dataMemo.get(snap); if (m) return m; }
      var dd = snap.data() || {};
      if (dataMemo && typeof snap === 'object') dataMemo.set(snap, dd);
      return dd;
    } catch (e) { return null; }
  }
  function isSecretDoc(o) { try { return !!(o && o.secret === true); } catch (e) { return false; } }

  /* ---------- 自分用（本人だけの物）の見分け ----------
     ・付箋など（boardNotes・pitBoardNotes・mhsNotes）… secret:true／memberUids が書いた本人1人だけ（CFNoteBoard.rules.isSecret と同じ）
     ・CoreNote のノート（corenoteNotes/{nid}）… createdBy があって、members に本人以外がいない＝「自分だけ」（analytics-note.js の scopeOf と同じ）
     ・CoreNote の部品（corenoteParts/{nid}__{pid}・欄 nid）… 親のノートが自分だけなら伏せる。**親が分からない時も伏せる**
     ・CoreBoard のボード（coreboardBoards/{bid}）… scope が '個人'
     ・CoreBoard のカード（coreboardCards/{bid}__{cardId}・欄 bid）… 親のボードが個人なら伏せる（分からない時は伏せない）
     この画面で受け取った／書いた親の印を覚えておく（privOf） */
  var privOf = new Map();          /* 'n:<nid>' / 'b:<bid>' → true/false */
  function noteIsPriv(o) {
    if (!o) return null;
    var by = o.createdBy, mem = Array.isArray(o.members) ? o.members.filter(function (x) { return x && x !== by; }) : [];
    if (!by && !mem.length) return false;
    return !mem.length;
  }
  function stickyIsPriv(o) {
    if (!o) return false;
    if (typeof o.secret === 'boolean') return o.secret;
    var a = Array.isArray(o.memberUids) ? o.memberUids : (Array.isArray(o.m) ? o.m : []);
    return a.length === 1 && !!o.authorUid && a[0] === o.authorUid;
  }
  function privRemember(k, v) { if (v == null) return; privOf.set(k, !!v); if (privOf.size > 5000) privOf.delete(privOf.keys().next().value); }
  var RE_NOTE = /\/corenoteNotes\/([^/]+)$/, RE_PART = /\/corenoteParts\/([^/]+)$/, RE_BOARD = /\/coreboardBoards\/([^/]+)$/, RE_CARD = /\/coreboardCards\/([^/]+)$/;
  /* path の書類が自分用か。after＝書いた後の中身（分かる範囲）・before＝前の中身 */
  function docPriv(path, after, before) {
    try {
      var m, a = after || {}, b = before || {};
      var both = {}; var k;
      for (k in b) both[k] = b[k];
      for (k in a) both[k] = a[k];
      var sec = (a.secret === true || b.secret === true);           /* どこでも secret:true は自分用 */
      if ((m = RE_NOTE.exec(path))) { var pn = sec || noteIsPriv(both); privRemember('n:' + m[1], pn); return !!pn; }
      if ((m = RE_BOARD.exec(path))) { var pb = sec || both.scope === '個人'; privRemember('b:' + m[1], pb); return pb; }
      if ((m = RE_PART.exec(path))) {
        var nid = both.nid || String(m[1]).split('__')[0];
        var v = privOf.get('n:' + nid);
        return sec || (v === undefined ? true : v);        /* 親が分からない＝伏せる */
      }
      if ((m = RE_CARD.exec(path))) { var bid = both.bid || String(m[1]).split('__')[0]; return sec || privOf.get('b:' + bid) === true; }
      return sec || stickyIsPriv(both);
    } catch (e) { return RE_PART.test(String(path)); }
  }
  /* 受け取った書類から、親（ノート・ボード）の印だけを覚える（中身全部は作らない＝欄を3つだけ読む） */
  function privFromSnap(path, snap) {
    try {
      if (!snap || !snap.exists) return;
      var m;
      if ((m = RE_NOTE.exec(path))) privRemember('n:' + m[1], noteIsPriv({ createdBy: snap.get('createdBy'), members: snap.get('members') }));
      else if ((m = RE_BOARD.exec(path))) privRemember('b:' + m[1], snap.get('scope') === '個人');
    } catch (e) {}
  }

  /* 書き込みの中身 → 欄の 前→後 の一覧 */
  function summarize(op, path, args) {
    var prev = cache.get(path);
    var known = !!prev;
    var out = { f: [], same: 0, nf: 0 };
    function addF(rec) { out.nf++; if (out.f.length < FIELDS_MAX) out.f.push(rec); }
    if (op === 'delete') { if (known) out.ex = prev.exists ? 1 : 0; return out; }
    if (op === 'update') {
      var pairs = [];
      if (args.length === 1 && args[0] && typeof args[0] === 'object') {
        var o = args[0]; Object.keys(o).forEach(function (k) { pairs.push([k, o[k]]); });
      } else {
        for (var i = 0; i + 1 < args.length; i += 2) pairs.push([args[i], args[i + 1]]);
      }
      var upd = {}; pairs.forEach(function (p) { if (typeof p[0] === 'string' && p[0].indexOf('.') < 0) upd[p[0]] = p[1]; });
      var hideU = docPriv(path, upd, known ? snapData(prev) : null);
      if (hideU) out.hid = 1;
      pairs.forEach(function (p) {
        var del = isDeleteFV(p[1]);
        var b = known ? snapGet(prev, p[0]) : undefined;
        if (known && !del && !fvName(p[1]) && cmpKey(b) === cmpKey(p[1])) { out.same++; return; }
        addF(fieldRec(fpName(p[0]), known, b, p[1], del, hideU));
      });
      return out;
    }
    /* set / add */
    var data = args[0] || {}, opt = args[1] || {};
    var keys; try { keys = Object.keys(data); } catch (e) { keys = []; }
    var merge = !!(opt && (opt.merge || opt.mergeFields));
    if (opt && opt.mergeFields) out.mf = (opt.mergeFields || []).length;
    var bd = known ? snapData(prev) : null;
    var hideS = isSecretDoc(data) || isSecretDoc(bd) || docPriv(path, data, bd);
    if (hideS) out.hid = 1;
    keys.forEach(function (k) {
      var v = data[k], del = isDeleteFV(v);
      var b = bd ? bd[k] : undefined;
      if (bd && !del && !fvName(v) && cmpKey(b) === cmpKey(v)) { out.same++; return; }
      addF(fieldRec(k, !!bd, b, v, del, hideS));
    });
    if (!merge && bd) {           /* 丸ごと上書き＝前にあって今回無い欄は消える */
      Object.keys(bd).forEach(function (k) { if (!(k in data)) addF(fieldRec(k, true, bd[k], undefined, true, hideS)); });
    }
    if (known && !prev.exists) out.ex = 0;
    return out;
  }

  /* ---------- きっかけ（人か自動か） ---------- */
  function stackFns() {
    var st = '';
    try { st = String(new Error().stack || ''); } catch (e) { return []; }
    var out = [], ls = st.split('\n');
    for (var i = 1; i < ls.length && out.length < 6; i++) {
      var l = ls[i];
      if (/coreflow-trace|coreflow-sync|firebasejs|gstatic\.com/.test(l)) continue;
      var m = l.match(/at\s+(?:async\s+)?([^\s(]+)\s+\((.*?):(\d+):\d+\)/) || l.match(/at\s+()(.*?):(\d+):\d+/) || l.match(/^([^@]*)@(.*?):(\d+):\d+/);
      if (!m) continue;
      var file = String(m[2] || '').split(/[?#]/)[0]; file = file.slice(file.lastIndexOf('/') + 1);
      out.push((m[1] || '?') + '@' + file + ':' + m[3]);
    }
    return out;
  }
  function cause() {
    if (lastActAt && now() - lastActAt <= USER_WIN) return { k: 'user', a: actSeq };
    return { k: 'auto', st: stackFns() };
  }

  /* ---------- 書き込みの皮 ---------- */
  function errCode(e) { try { return String((e && (e.code || e.name)) || 'error').replace(/^firestore\//, '').slice(0, 40); } catch (_) { return 'error'; } }
  function resOf(e) { var c = errCode(e); return c === 'permission-denied' ? 'denied' : c; }
  function begin(op, path, args, extra) {
    if (off) return null;
    var o = { ev: 'write', p: String(path || '?').slice(0, 300), op: op };
    var sm = summarize(op === 'add' ? 'set' : op, String(path), args);
    o.f = sm.f; if (sm.same) o.same = sm.same; if (sm.nf > sm.f.length) o.nf = sm.nf;
    if (sm.mf != null) o.mf = sm.mf; if (sm.ex != null) o.ex = sm.ex; if (sm.hid) o.hid = 1;
    if (op === 'set' && args[1] && (args[1].merge || args[1].mergeFields)) o.op = 'set+merge';
    if (extra) for (var k in extra) o[k] = extra[k];
    o.c = cause();
    o._t0 = now();
    myWrites.set(o.p, o._t0);
    if (myWrites.size > 2000) { var it = myWrites.keys(); for (var i = 0; i < 500; i++) myWrites.delete(it.next().value); }
    return push(o);
  }
  function settle(rec, err, sync) {
    if (!rec) return;
    var ms = now() - rec._t0;
    if (rec._sent) {        /* もう送った行＝結果だけの短い行を足す */
      push({ ev: 'wres', ws: rec.s, res: err ? resOf(err) : 'ok', ms: ms, code: err ? errCode(err) : undefined,
             id: rec._newId, p: rec._newId ? rec.p.replace(/\/\+$/, '/' + rec._newId) : undefined });
      return;
    }
    rec.res = err ? resOf(err) : 'ok'; rec.ms = ms;
    if (err) { rec.code = errCode(err); if (sync) rec.thrown = 1; }
  }
  function watchP(rec, p, onOk) {
    if (!rec || !p || typeof p.then !== 'function') return;
    p.then(function (v) { try { if (onOk) onOk(v); settle(rec, null); } catch (e) {} },
           function (e) { try { settle(rec, e || { code: 'error' }); if (rec && rec.res && rec.res !== 'ok') soonFlush(); } catch (_) {} });
  }
  function wrapDocWrite(proto, name, key) {
    var orig = proto && proto[name];
    if (typeof orig !== 'function' || orig.__cft) return;
    ORIG[key] = orig;
    var f = function () {
      var rec = null;
      try { rec = begin(name, this && this.path, arguments); } catch (e) { rec = null; }
      var p;
      try { p = orig.apply(this, arguments); }
      catch (e) { try { settle(rec, e, true); } catch (_) {} throw e; }
      try { watchP(rec, p); } catch (e) {}
      return p;
    };
    f.__cft = 1;
    proto[name] = f;
  }
  function wrapAdd(proto) {
    var orig = proto && proto.add;
    if (typeof orig !== 'function' || orig.__cft) return;
    ORIG['CR.add'] = orig;
    var f = function () {
      var rec = null;
      try { rec = begin('add', (this && this.path) + '/+', arguments); } catch (e) { rec = null; }
      var p;
      try { p = orig.apply(this, arguments); }
      catch (e) { try { settle(rec, e, true); } catch (_) {} throw e; }
      /* 自動の id は Firestore が決める（アプリの書き方は変えない）＝分かった時に path を「…/<id>」に直す。
         もう送った行なら、結果の行（wres）に id と path を入れる */
      try { watchP(rec, p, function (ref) { if (rec && ref && ref.id) { rec._newId = String(ref.id); if (!rec._sent) { rec.id = rec._newId; rec.p = rec.p.replace(/\/\+$/, '/' + rec._newId); } } }); } catch (e) {}
      return p;
    };
    f.__cft = 1;
    proto.add = f;
  }
  /* まとめ書き（batch）：set/update/delete は中身を控えるだけ、commit で1行 */
  var batchOps = (typeof WeakMap === 'function') ? new WeakMap() : null;
  function wrapBatchOp(proto, name) {
    var orig = proto && proto[name];
    if (typeof orig !== 'function' || orig.__cft || !batchOps) return;
    ORIG['WB.' + name] = orig;
    var f = function (ref) {
      try {
        if (!off) {
          var list = batchOps.get(this); if (!list) { list = []; batchOps.set(this, list); }
          var rest = Array.prototype.slice.call(arguments, 1);
          var path = ref && ref.path;
          var sm = summarize(name, String(path), rest);
          var op = { p: String(path || '?').slice(0, 300), op: name, f: sm.f.slice(0, 10) };
          if (name === 'set' && rest[1] && (rest[1].merge || rest[1].mergeFields)) op.op = 'set+merge';
          if (sm.same) op.same = sm.same; if (sm.nf > op.f.length) op.nf = sm.nf; if (sm.hid) op.hid = 1;
          if (list.length < 50) list.push(op); else list.more = (list.more || 0) + 1;
          if (path) myWrites.set(String(path), now());
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    f.__cft = 1;
    proto[name] = f;
  }
  function wrapCommit(proto) {
    var orig = proto && proto.commit;
    if (typeof orig !== 'function' || orig.__cft) return;
    ORIG['WB.commit'] = orig;
    var f = function () {
      var rec = null;
      try {
        if (!off) {
          var list = (batchOps && batchOps.get(this)) || [];
          rec = push({ ev: 'write', op: 'batch', n: list.length + (list.more || 0), ops: list.slice(0), c: cause(), _t0: now() });
        }
      } catch (e) { rec = null; }
      var p;
      try { p = orig.apply(this, arguments); }
      catch (e) { try { settle(rec, e, true); } catch (_) {} throw e; }
      try { watchP(rec, p); } catch (e) {}
      return p;
    };
    f.__cft = 1;
    proto.commit = f;
  }
  /* 取引（transaction）：中の set/update/delete は1行ずつ（op＝tx.○○）、runTransaction で結果の1行 */
  function wrapTxOp(proto, name) {
    var orig = proto && proto[name];
    if (typeof orig !== 'function' || orig.__cft) return;
    ORIG['TX.' + name] = orig;
    var f = function (ref) {
      try { if (!off) { var o = begin(name, ref && ref.path, Array.prototype.slice.call(arguments, 1)); if (o) { o.op = 'tx.' + o.op; o.res = 'tx'; } } } catch (e) {}
      return orig.apply(this, arguments);
    };
    f.__cft = 1;
    proto[name] = f;
  }
  function wrapRunTx(proto) {
    var orig = proto && proto.runTransaction;
    if (typeof orig !== 'function' || orig.__cft) return;
    ORIG['FS.runTransaction'] = orig;
    var f = function () {
      var rec = null;
      try { if (!off) rec = push({ ev: 'write', op: 'tx', c: cause(), _t0: now() }); } catch (e) { rec = null; }
      var p;
      try { p = orig.apply(this, arguments); }
      catch (e) { try { settle(rec, e, true); } catch (_) {} throw e; }
      try { watchP(rec, p); } catch (e) {}
      return p;
    };
    f.__cft = 1;
    proto.runTransaction = f;
  }

  /* ---------- 受け取りの皮（onSnapshot） ---------- */
  function qPath(q) {
    try {
      if (typeof q.path === 'string') return q.path;
      var dq = q._delegate && q._delegate._query;
      if (dq) {
        if (dq.collectionGroup) return '**/' + dq.collectionGroup;
        if (dq.path && typeof dq.path.canonicalString === 'function') return dq.path.canonicalString() + '?q';
      }
    } catch (e) {}
    return '?';
  }
  function changedFields(prev, cur) {
    var a = snapData(prev), b = snapData(cur);
    if (!a || !b) return null;
    var out = [], seen = {};
    Object.keys(b).forEach(function (k) { seen[k] = 1; if (!(k in a) || cmpKey(a[k]) !== cmpKey(b[k])) out.push(k); });
    Object.keys(a).forEach(function (k) { if (!seen[k]) out.push('-' + k); });
    return out.slice(0, 40);
  }
  function isEcho(path, md) {
    if (md && md.hasPendingWrites) return 1;
    var t = myWrites.get(path); return (t && now() - t < 10000) ? 1 : 0;
  }
  function cacheSet(path, snap) {
    if (cache.has(path)) cache.delete(path);
    cache.set(path, snap);
    if (path.indexOf('/corenoteNotes/') > 0 || path.indexOf('/coreboardBoards/') > 0) privFromSnap(path, snap);
    if (cache.size > CACHE_MAX) { var it = cache.keys(); for (var i = 0; i < 500; i++) cache.delete(it.next().value); }
  }
  function recv(L, snap) {
    if (off || !snap) return;
    var md = snap.metadata || {};
    var fc = md.fromCache ? 1 : 0;
    if (typeof snap.docChanges === 'function') {          /* 一覧（Query） */
      var ch = snap.docChanges() || [];
      if (L.first) {
        L.first = false; L.fc = fc;
        for (var i = 0; i < ch.length; i++) { try { cacheSet(ch[i].doc.ref.path, ch[i].doc); } catch (e) {} }
        push({ ev: 'recv', p: L.p, first: 1, n: (snap.size != null ? snap.size : ch.length), fc: fc });
        return;
      }
      if (!ch.length) {
        if (fc !== L.fc) { L.fc = fc; push({ ev: 'sync', k: fc ? 'cache' : 'live', p: L.p }); }
        return;
      }
      L.fc = fc;
      var list = [];
      for (var j = 0; j < ch.length; j++) {
        var c = ch[j], dc = c.doc, path = '';
        try { path = dc.ref.path; } catch (e) {}
        if (j < RECV_DOCS_MAX) {
          var it = { id: String(dc.id || '').slice(0, 80), ty: c.type === 'added' ? 'a' : c.type === 'removed' ? 'r' : 'm' };
          if (c.type === 'modified') { var prev = cache.get(path); var f = prev ? changedFields(prev, dc) : null; if (f) it.f = f; }
          if (isEcho(path, md)) it.echo = 1;
          list.push(it);
        }
        if (c.type === 'removed') cache.delete(path); else cacheSet(path, dc);
      }
      var o = { ev: 'recv', p: L.p, ch: list, fc: fc };
      if (md.hasPendingWrites) o.pw = 1;
      if (ch.length > list.length) o.more = ch.length - list.length;
      push(o);
      return;
    }
    /* 1書類（DocumentReference） */
    var p2 = ''; try { p2 = snap.ref.path; } catch (e) { p2 = L.p; }
    var prev2 = cache.get(p2);
    cacheSet(p2, snap);
    if (L.first) { L.first = false; L.fc = fc; push({ ev: 'recv', p: p2, first: 1, ex: snap.exists ? 1 : 0, fc: fc }); return; }
    var f2 = null;
    if (prev2) {
      if (!!prev2.exists !== !!snap.exists) f2 = [snap.exists ? '+doc' : '-doc'];
      else f2 = changedFields(prev2, snap) || [];
    }
    if (f2 && !f2.length) {                     /* 中身は同じ＝写し／サーバーの切り替わりだけ */
      if (fc !== L.fc) { L.fc = fc; push({ ev: 'sync', k: fc ? 'cache' : 'live', p: p2 }); }
      return;
    }
    L.fc = fc;
    var o2 = { ev: 'recv', p: p2, fc: fc };
    if (f2) o2.f = f2;
    if (md.hasPendingWrites) o2.pw = 1;
    if (isEcho(p2, md)) o2.echo = 1;
    push(o2);
  }
  function wrapSnap(proto, key) {
    var orig = proto && proto.onSnapshot;
    if (typeof orig !== 'function' || orig.__cft) return;
    ORIG[key] = orig;
    var f = function () {
      var args = arguments;
      try {
        if (!off) {
          var L = { p: qPath(this), first: true, fc: -1 };
          var a = Array.prototype.slice.call(arguments);
          var done = false;
          for (var i = 0; i < a.length && !done; i++) {
            if (typeof a[i] === 'function') {
              a[i] = wrapNext(a[i], L); done = true;
              if (typeof a[i + 1] === 'function') a[i + 1] = wrapErr(a[i + 1], L);
            } else if (a[i] && typeof a[i] === 'object' && (typeof a[i].next === 'function' || typeof a[i].error === 'function')) {
              a[i] = wrapObs(a[i], L); done = true;
            }
          }
          if (done) args = a;
        }
      } catch (e) { args = arguments; }
      return orig.apply(this, args);
    };
    f.__cft = 1;
    proto.onSnapshot = f;
  }
  function wrapNext(cb, L) {
    return function () {
      try { recv(L, arguments[0]); } catch (e) {}
      return cb.apply(this, arguments);
    };
  }
  function wrapErr(cb, L) {
    return function () {
      try { var e = arguments[0]; push({ ev: 'sync', k: 'listen-err', p: L.p, code: errCode(e) }); soonFlush(); } catch (_) {}
      return cb.apply(this, arguments);
    };
  }
  function wrapObs(obs, L) {
    var o = {};
    if (typeof obs.next === 'function') o.next = function () { try { recv(L, arguments[0]); } catch (e) {} return obs.next.apply(obs, arguments); };
    if (typeof obs.error === 'function') o.error = function () { try { push({ ev: 'sync', k: 'listen-err', p: L.p, code: errCode(arguments[0]) }); soonFlush(); } catch (_) {} return obs.error.apply(obs, arguments); };
    if (typeof obs.complete === 'function') o.complete = function () { return obs.complete.apply(obs, arguments); };
    return o;
  }

  /* ---------- Firestore に皮をかぶせる ---------- */
  function patch() {
    var F = w.firebase && w.firebase.firestore;
    if (!F || !F.DocumentReference || !F.DocumentReference.prototype) return false;
    try {
      var DR = F.DocumentReference.prototype;
      wrapDocWrite(DR, 'set', 'DR.set'); wrapDocWrite(DR, 'update', 'DR.update'); wrapDocWrite(DR, 'delete', 'DR.delete');
      wrapSnap(DR, 'DR.onSnapshot');
      if (F.CollectionReference && F.CollectionReference.prototype) wrapAdd(F.CollectionReference.prototype);
      if (F.Query && F.Query.prototype) wrapSnap(F.Query.prototype, 'Q.onSnapshot');
      if (F.WriteBatch && F.WriteBatch.prototype) {
        wrapBatchOp(F.WriteBatch.prototype, 'set'); wrapBatchOp(F.WriteBatch.prototype, 'update'); wrapBatchOp(F.WriteBatch.prototype, 'delete');
        wrapCommit(F.WriteBatch.prototype);
      }
      if (F.Transaction && F.Transaction.prototype) {
        wrapTxOp(F.Transaction.prototype, 'set'); wrapTxOp(F.Transaction.prototype, 'update'); wrapTxOp(F.Transaction.prototype, 'delete');
      }
      if (F.Firestore && F.Firestore.prototype) wrapRunTx(F.Firestore.prototype);
    } catch (e) {}
    return true;
  }
  function tryPatch(n) { if (patch() || n <= 0) return; setTimeout(function () { tryPatch(n - 1); }, 200); }

  /* ---------- 人の操作（きっかけ）。capture で見るだけ・止めない ---------- */
  function isEditable(el) {
    try {
      if (!el) return false;
      if (el.isContentEditable) return true;
      var t = String(el.tagName || '').toLowerCase();
      if (t === 'textarea') return true;
      if (t === 'input') { var ty = String(el.type || '').toLowerCase(); return !/^(button|submit|reset|checkbox|radio|file|color|range|image)$/.test(ty); }
    } catch (e) {}
    return false;
  }
  /* 文字の頭だけ（大きな箱を押しても全部の文字を作らない＝上限付きで辿る。入力欄の中には入らない） */
  function headText(el, lim) {
    var out = '', nodes = 0, stack = [el];
    while (stack.length && out.length < lim * 2 && nodes++ < 200) {
      var n = stack.pop();
      if (!n) continue;
      if (n.nodeType === 3) { out += String(n.nodeValue || ''); continue; }
      if (n.nodeType !== 1 || (n !== el && isEditable(n))) continue;
      var t = String(n.tagName || '').toLowerCase();
      if (t === 'script' || t === 'style' || t === 'select') continue;
      for (var c = n.lastChild; c; c = c.previousSibling) stack.push(c);
    }
    return out.replace(/\s+/g, ' ').trim().slice(0, lim);
  }
  /* CoreNote・CoreBoard と、ノート・ボードのカードを出す画面（ダッシュボード＝coreflow・FlowDesk・FlowGo）では
     押した物の文字の頭を残さない（自分用のノート・ボードの題が入るため）。id・data-*・要素の種類だけ */
  var _noText = null;
  function noText() { if (_noText === null) _noText = /^(corenote|coreboard|coreflow|flowdesk|flowgo)$/.test(appKey()); return _noText; }
  function desc(el) {
    try {
      if (!el || el.nodeType !== 1) return '';
      var hit = el.closest ? el.closest('button,a,[role=button],[role=tab],[role=menuitem],[data-act],[data-action],[onclick],label,select,input,textarea,[data-id],[id]') : null;
      if (hit) el = hit;
      var s = String(el.tagName || '').toLowerCase();
      if (el.id) s += '#' + String(el.id).slice(0, 40);
      var cl = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/)[0];
      if (cl) s += '.' + cl.slice(0, 30);
      var at = el.attributes, nd = 0;
      for (var i = 0; at && i < at.length && nd < 3; i++) {
        var n = at[i].name;
        if (n.indexOf('data-') === 0 && n !== 'data-cf-ver') {
          var dv = (noText() && /title|name|text|body|label|memo/i.test(n)) ? '〔伏せ字〕' : String(at[i].value).slice(0, 30);
          s += '[' + n.slice(5, 25) + '=' + dv + ']'; nd++;
        }
      }
      if (el.type && /^(checkbox|radio)$/.test(el.type)) s += (el.checked ? '☑' : '☐');
      if (!noText() && !isEditable(el) && String(el.tagName).toLowerCase() !== 'select') {
        var tx = headText(el, 20);
        if (tx) s += ' "' + tx + '"';
      }
      return s.slice(0, 200);
    } catch (e) { return ''; }
  }
  function onAct(e) {
    try {
      if (off) return;
      var t = e.type, k = '';
      if (t === 'keydown') {
        var key = String(e.key || '');
        var combo = e.ctrlKey || e.metaKey || e.altKey;
        lastActAt = now();
        if (!(combo || /^(Enter|Escape|Delete|Tab|F\d+)$/.test(key))) return;    /* 1文字ずつは残さない（きっかけにはする） */
        if (/^(Control|Shift|Alt|Meta)$/.test(key)) return;
        k = (e.ctrlKey ? 'C-' : '') + (e.metaKey ? 'M-' : '') + (e.altKey ? 'A-' : '') + (key.length === 1 ? key.toLowerCase() : key);
      }
      actSeq++; lastActAt = now();
      var o = { ev: 'act', a: actSeq, k: t, el: desc(e.target) };
      if (k) o.key = k;
      push(o);
    } catch (_) {}
  }

  /* ---------- エラー ---------- */
  var conCount = 0, conWin = 0, conDrop = 0;
  function argStr(args) {
    var s = [];
    for (var i = 0; i < args.length && i < 6; i++) {
      var a = args[i];
      try {
        if (a instanceof Error) s.push((a.name || 'Error') + ': ' + a.message + (a.code ? ' [' + a.code + ']' : ''));
        else if (typeof a === 'string') s.push(a);
        else if (a && typeof a === 'object' && (a.code || a.message)) s.push(String(a.code || '') + ' ' + String(a.message || ''));
        else s.push(sv(a, 150));
      } catch (e) { s.push('?'); }
    }
    return s.join(' ').slice(0, 500);
  }
  function wrapConsole(name) {
    try {
      var c = w.console; if (!c || typeof c[name] !== 'function' || c[name].__cft) return;
      var orig = c[name]; console0[name] = orig;
      var f = function () {
        try {
          if (!off) {
            var t = now();
            if (t - conWin > 60000) { conWin = t; conCount = 0; }
            if (++conCount <= 60) {
              push({ ev: 'err', k: 'console.' + name, m: argStr(arguments) });
              if (name === 'error') soonFlush();
            } else conDrop++;
          }
        } catch (e) {}
        return orig.apply(this, arguments);
      };
      f.__cft = 1;
      c[name] = f;
    } catch (e) {}
  }
  function onErr(e) {
    try {
      if (off) return;
      var tg = e && e.target;
      if (tg && tg !== w && tg.tagName) {                  /* 画像・スクリプトの読み込み失敗 */
        push({ ev: 'err', k: 'resource', m: String(tg.tagName).toLowerCase() + ' ' + String(tg.src || tg.href || '').split('?')[0].slice(0, 200) });
        return;
      }
      push({ ev: 'err', k: 'onerror', m: String(e && e.message || '').slice(0, 500),
             src: String(e && e.filename || '').split('?')[0].split('/').pop() + ':' + (e && e.lineno || 0) + ':' + (e && e.colno || 0),
             st: (e && e.error && e.error.stack) ? String(e.error.stack).slice(0, 500) : undefined });
      soonFlush();
    } catch (_) {}
  }
  function onRej(e) {
    try {
      if (off) return;
      var r = e && e.reason;
      push({ ev: 'err', k: 'rejection', m: argStr([r]), st: (r && r.stack) ? String(r.stack).slice(0, 500) : undefined });
      soonFlush();
    } catch (_) {}
  }
  /* エラー番号（CFErr）と同期ランプ（CFSync）は、アプリの js の後で出来る＝あとから掛ける */
  var lastCode = '', lastCodeAt = 0;
  function noteCode(code) {
    try {
      if (off || !code) return;
      var t = now(); if (code === lastCode && t - lastCodeAt < 1500) return;
      lastCode = code; lastCodeAt = t;
      push({ ev: 'err', k: 'code', code: String(code).slice(0, 20) });
      soonFlush();
    } catch (e) {}
  }
  function hookLater() {
    try {
      var E = w.CFErr;
      if (E && !E.__cft) {
        E.__cft = 1;
        ['toast', 'el'].forEach(function (n) {
          var o = E[n]; if (typeof o !== 'function') return;
          E[n] = function () { try { noteCode(n === 'toast' ? arguments[1] : arguments[0]); } catch (e) {} return o.apply(this, arguments); };
        });
      }
    } catch (e) {}
    try {
      var S = w.CFSync;
      if (S && !S.__cft && typeof S.set === 'function') {
        S.__cft = 1;
        var oset = S.set;
        S.set = function (s) {
          try { var b = typeof S.state === 'function' ? S.state() : ''; if (!off && s !== b && /^(error|cache|offline)$/.test(String(s))) push({ ev: 'sync', k: 'lamp', st: String(s) }); } catch (e) {}
          return oset.apply(this, arguments);
        };
        var ofail = S.failed;
        if (typeof ofail === 'function') S.failed = function () { try { if (!off) push({ ev: 'sync', k: 'lamp', st: 'failed' }); } catch (e) {} return ofail.apply(this, arguments); };
      }
    } catch (e) {}
  }

  /* ---------- 画面の切り替え ---------- */
  function where() { try { return (String(w.location.pathname || '') + String(w.location.hash || '')).slice(0, 200); } catch (e) { return ''; } }

  /* ---------- 送る（REST・アプリの Firestore とは別の通り道） ---------- */
  function canSend() {
    if (off) return false;
    if (lsGet('cf_trace_off') === '1') { stop('flag'); return false; }
    if (w.PIT_DEMO === true || w.__DEMO_MODE === true || w.PIT_CLOUD === false) return false;
    try { if (w.navigator && w.navigator.onLine === false) return false; } catch (e) {}
    if (typeof w.fetch !== 'function') return false;
    return !!authUser();
  }
  /* 止まった理由。断られた（403）時は端末に1件だけ控え、次に送れた時に1行にして送る（CFTrace.status() でも見られる） */
  var stopWhy = '';
  function stop(why, info) {
    off = true; stopWhy = why || 'stop'; buf = []; carryQ = [];
    try { lsDel(CARRY_KEY + TAB); } catch (e) {}
    if (why === 'denied') {
      try { lsSet(DENIED_KEY, JSON.stringify(Object.assign({ at: now(), app: appKey(), ver: appVer(), lv: LIB }, info || {}))); } catch (e) {}
    }
    try { if (OPT.onStop) OPT.onStop(why); } catch (e) {}
  }
  /* 1書類の大きさは**バイト**で数える（日本語は1字3バイト。送る時は JSON の中の文字列なので " や \ の分も足す） */
  function u8(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += (c === 34 || c === 92) ? 2 : (c < 0x20 ? 6 : 1);
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
      else n += 3;
    }
    return n + 3;
  }
  function lineStr(o, uid) {
    var c = {}, k;
    for (k in o) { if (k.charAt(0) === '_' || o[k] === undefined) continue; c[k] = o[k]; }
    if (c.u === uid) delete c.u;
    var s; try { s = JSON.stringify(c); } catch (e) { s = '{"ev":"bad","s":' + o.s + '}'; }
    if (s.length > LINE_MAX) s = JSON.stringify({ t: o.t, s: o.s, ev: o.ev, p: o.p, op: o.op, cut: s.length, head: s.slice(0, LINE_MAX - 300) });
    return s;
  }
  /* buf の頭から、上限までを1書類ぶん取り出す（取り出した行は「送った」印） */
  function take(uid, maxBytes) {
    var lines = [], size = 0, n = 0;
    while (n < buf.length && lines.length < DOC_LINES) {
      var s = lineStr(buf[n], uid), b = u8(s);
      if (size + b > maxBytes && lines.length) break;
      lines.push(s); size += b; n++;
    }
    var taken = buf.splice(0, n);
    for (var i = 0; i < taken.length; i++) taken[i]._sent = 1;
    return { lines: lines, recs: taken };
  }
  function rid() { var c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', s = ''; for (var i = 0; i < 20; i++) s += c.charAt(Math.floor(Math.random() * c.length)); return s; }
  function projectId() { try { return (w.firebase.app().options || {}).projectId || ''; } catch (e) { return ''; } }
  /* 鍵（ID トークン）の発行時刻＝Google のサーバーの時計。端末の時計が大きくずれている時は、これを「いま」とみなす
     （ルールは expireAt を request.time〜11日で見る。ずれた端末の時計で作ると弾かれるため） */
  function tokTimes(tok) {
    try {
      var p = String(tok || '').split('.')[1]; if (!p) return null;
      p = p.replace(/-/g, '+').replace(/_/g, '/'); while (p.length % 4) p += '=';
      var j = JSON.parse(w.atob(p));
      return (j && j.iat) ? { iat: j.iat * 1000, exp: (j.exp || 0) * 1000 } : null;
    } catch (e) { return null; }
  }
  var skewMs = 0;           /* 端末の時計 −（鍵から見たサーバーの時計）。ずれていない時は 0 */
  function serverNow(tok) {
    var t = now(), tt = tokTimes(tok);
    if (!tt) return t;
    if (t < tt.iat - 120000 || (tt.exp && t > tt.exp + 120000)) { skewMs = t - tt.iat; return tt.iat; }
    skewMs = 0; return t;
  }
  function body(pid, env, lines, base) {
    var S = function (v) { return { stringValue: String(v == null ? '' : v) }; };
    var I = function (v) { return { integerValue: String(Math.floor(Number(v) || 0)) }; };
    var name = 'projects/' + pid + '/databases/(default)/documents/traceLogs/' + rid();
    var f = {
      uid: S(env.uid), dev: S(env.dev), app: S(env.app), ver: S(env.ver), lv: S(LIB), tab: S(env.tab), pg: S(env.pg),
      mid: S(env.mid), cid: S(env.cid), t0: I(env.t0), t1: I(env.t1), n: I(lines.length), drop: I(env.drop),
      tc: I(now()),       /* 送った時の端末の時計（サーバーは at との差で端末の時計のずれを直す） */
      lines: { arrayValue: { values: lines.map(function (s) { return { stringValue: s }; }) } },
      expireAt: { timestampValue: new Date((base || now()) + TTL_MS).toISOString() }
    };
    if (env.cy) f.cy = I(1);
    return JSON.stringify({ writes: [{ update: { name: name, fields: f }, currentDocument: { exists: false },
      updateTransforms: [{ fieldPath: 'at', setToServerValue: 'REQUEST_TIME' }] }] });
  }
  /* 鍵は毎回 Firebase に聞く（Firebase が有効な物を返す・切れていれば取り直す。こちらで使い回さない） */
  function getToken(u) { return Promise.resolve(u.getIdToken()); }
  function post(pid, tok, b, keep) {
    var url = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(pid) + '/databases/(default)/documents:commit';
    var o = { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok }, body: b };
    if (keep) o.keepalive = true;
    return w.fetch(url, o);
  }
  function envFor(u, extra) {
    var e = { uid: u.uid, dev: devId(), app: appKey(), ver: appVer(), tab: TAB, pg: page(), mid: mid(), cid: cid(), drop: dropped };
    if (extra) for (var k in extra) e[k] = extra[k];
    return e;
  }
  /* 1回の送り。reason='hide' の時は keepalive（閉じても届くように）で、取れている鍵だけで送る */
  function flush(reason) {
    try {
      if (off) return Promise.resolve(false);
      if (sending && now() - sendingAt < 120000) return Promise.resolve(false);
      if (!buf.length && !carryQ.length) return Promise.resolve(false);
      if (!canSend()) return Promise.resolve(false);
      var u = authUser(), pid = projectId();
      if (!u || !pid) return Promise.resolve(false);
      var keep = reason === 'hide';
      var limit = keep ? KEEPALIVE_BYTES : DOC_BYTES;
      var job;
      if (carryQ.length) {
        var c = carryQ[0], lines = [], size = 0;
        while (c.lines.length && lines.length < DOC_LINES && (size + u8(c.lines[0]) <= limit || !lines.length)) { size += u8(c.lines[0]); lines.push(c.lines.shift()); }
        if (!c.lines.length) carryQ.shift();
        job = { env: envFor(u, { tab: c.tab, app: c.app || appKey(), ver: c.ver || '', pg: c.pg || '', cy: 1, drop: 0 }), lines: lines, back: function () { carryQ.unshift({ tab: c.tab, app: c.app, ver: c.ver, pg: c.pg, lines: lines }); } };
      } else {
        var tk = take(u.uid, limit);
        var t0 = tk.recs.length ? tk.recs[0].t : now(), t1 = tk.recs.length ? tk.recs[tk.recs.length - 1].t : now();
        job = { env: envFor(u, { t0: t0, t1: t1 }), lines: tk.lines, back: function () {
          for (var i = 0; i < tk.recs.length; i++) delete tk.recs[i]._sent;
          buf = tk.recs.concat(buf);
          while (buf.length > MAX) { buf.shift(); dropped++; }
        } };
      }
      if (job.env.t0 == null) { job.env.t0 = now(); job.env.t1 = now(); }
      if (!job.lines.length) return Promise.resolve(false);
      /* 閉じる時（keep）も、鍵は新しく聞いてから keepalive で投げる（閉じた後でも届く。64KB まで） */
      sending = true; sendingAt = now(); if (keep) lastSendAt = now();
      var dropBefore = dropped;
      return getToken(u).then(function (tok) {
        return post(pid, tok, body(pid, job.env, job.lines, serverNow(tok)), keep);
      }).then(function (r) {
        sending = false; lastSendAt = now();
        var st = r && r.status;
        if (st >= 200 && st < 300) {
          if (dropBefore === dropped) dropped = 0;
          if (deniedSent) { lsDel(DENIED_KEY); deniedSent = false; }
          if (!buf.length && !carryQ.length) lsDel(CARRY_KEY + TAB);
          if (buf.length > MAX / 2 || carryQ.length) setTimeout(function () { flush('more'); }, 2000);
          return true;
        }
        if (st === 403) {          /* ルールがまだ／形が合わない／時計のずれ＝黙って止まる（控えを1件） */
          stop('denied', { kind: Math.abs(skewMs) > 12 * 3600000 ? 'clock' : 'rules', skewMs: skewMs });
          return false;
        }
        if (st === 400 || st === 413) return false;            /* 形が悪い・大きすぎる＝その分は捨てる（何度送っても同じ） */
        job.back(); return false;
      }, function () {
        sending = false; job.back(); return false;
      }).catch(function () { sending = false; return false; });
    } catch (e) { sending = false; return Promise.resolve(false); }
  }
  var soonT = 0, lastSoon = 0;
  function soonFlush() {
    if (off || soonT) return;
    var wait = Math.max(3000, 15000 - (now() - lastSoon));
    soonT = setTimeout(function () { soonT = 0; lastSoon = now(); flush('err'); }, wait);
  }

  /* ---------- 持ち越し（閉じる時に送り切れなかった分） ---------- */
  function saveCarry() {
    try {
      if (off || !buf.length) { lsDel(CARRY_KEY + TAB); return; }
      var uid = curUid(), lines = [], size = 0;
      for (var i = buf.length - 1; i >= 0; i--) {         /* 新しい方を優先して上限まで */
        var s = lineStr(buf[i], uid); if (size + s.length > CARRY_CHARS) break;
        lines.unshift(s); size += s.length;
      }
      lsSet(CARRY_KEY + TAB, JSON.stringify({ tab: TAB, app: appKey(), ver: appVer(), pg: page(), at: now(), lines: lines }));
    } catch (e) {}
  }
  function loadCarry() {
    try {
      var ls = w.localStorage; if (!ls) return;
      var keys = [];
      for (var i = 0; i < ls.length && keys.length < 5; i++) { var k = ls.key(i); if (k && k.indexOf(CARRY_KEY) === 0 && k !== CARRY_KEY + TAB) keys.push(k); }
      keys.forEach(function (k) {
        var v = null; try { v = JSON.parse(ls.getItem(k) || 'null'); } catch (e) {}
        lsDel(k);
        if (v && v.lines && v.lines.length && now() - (v.at || 0) < 9 * 86400000) carryQ.push({ tab: String(v.tab || ''), app: v.app, ver: v.ver, pg: v.pg, lines: v.lines.slice(-DOC_LINES) });
      });
    } catch (e) {}
  }

  /* ---------- 起動 ---------- */
  try {
    tryPatch(25);
    ['pointerdown', 'keydown', 'change', 'submit'].forEach(function (t) { d.addEventListener(t, onAct, true); });
    w.addEventListener('error', onErr, true);
    w.addEventListener('unhandledrejection', onRej);
    wrapConsole('error'); wrapConsole('warn');
    w.addEventListener('hashchange', function () { try { push({ ev: 'nav', k: 'hash', h: where() }); } catch (e) {} });
    w.addEventListener('popstate', function () { try { push({ ev: 'nav', k: 'pop', h: where() }); } catch (e) {} });
    w.addEventListener('online', function () { try { push({ ev: 'sync', k: 'online' }); } catch (e) {} });
    w.addEventListener('offline', function () { try { push({ ev: 'sync', k: 'offline' }); } catch (e) {} });
    d.addEventListener('visibilitychange', function () {
      try {
        if (off) return;
        if (d.visibilityState === 'hidden') {
          push({ ev: 'nav', k: 'hide' });
          saveCarry();
          if (now() - lastSendAt > 10000) flush('hide');
        } else { push({ ev: 'nav', k: 'show' }); lsDel(CARRY_KEY + TAB); }
      } catch (e) {}
    });
    w.addEventListener('pagehide', function () { try { if (!off) { saveCarry(); if (now() - lastSendAt > 3000) flush('hide'); } } catch (e) {} });
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', hookLater);
    w.addEventListener('load', function () { hookLater(); setTimeout(hookLater, 3000); });
    hookLater();
    loadCarry();
    push({ ev: 'nav', k: 'boot', h: where(), ua: String((w.navigator && w.navigator.userAgent) || '').slice(0, 160) });
    /* 前の画面で送りを断られていた＝その事実を1行に（送れたら控えを消す） */
    try { var dn = JSON.parse(lsGet(DENIED_KEY) || 'null'); if (dn && dn.at) { push({ ev: 'sync', k: 'trace-denied', was: dn }); deniedSent = true; } } catch (e) {}
    var iv = setInterval(function () { try { flush('tick'); } catch (e) {} }, FLUSH_MS);
    if (OPT.noTimer) clearInterval(iv);
  } catch (e) {}

  w.CFTrace = {
    on: true, lib: LIB, tab: TAB,
    /* アプリから足したい時（版で弾かれた・読み直した 等）。例：CFTrace.note('sync', { k:'rev-reject', p: path }) */
    note: function (ev, o) { try { var x = {}; if (o) for (var k in o) x[k] = o[k]; x.ev = /^(sync|err|nav|act)$/.test(ev) ? ev : 'note'; push(x); } catch (e) {} },
    flush: function () { return flush('manual'); },
    stopped: function () { return off; },
    /* Claude の調べ用：いまの様子（止まったか・理由・前に断られた控え・ためている数・時計のずれ） */
    status: function () {
      var dn = null; try { dn = JSON.parse(lsGet(DENIED_KEY) || 'null'); } catch (e) {}
      return { on: !off, stopped: off, why: stopWhy, denied: dn, buf: buf.length, carry: carryQ.length, dropped: dropped, lastSendAt: lastSendAt, skewMs: skewMs, lib: LIB, tab: TAB };
    },
    _t: { buf: function () { return buf; }, cache: cache, ORIG: ORIG, take: take, saveCarry: saveCarry, loadCarry: loadCarry, carryQ: function () { return carryQ; }, dropped: function () { return dropped; }, hookLater: hookLater, sv: sv }
  };
})(window, document);
