/* ========================================
   cal-pit.js  -  会社の営業日カレンダーを読む（MHSが基準）  PitFlow v1.50.0
   ----------------------------------------
   ◎なにをするもの
     「その日は開いているか／何時から何時までか」を、**MHSの定休日カレンダー**から取って
     PitFlow のぜんぶの画面（予約・返車・車検予定・代車・駐車場・入庫ルール）に配る。

   ◎どこから読むか
     companies/<会社>/appSummaries/mhsCalendar   ← **1ドキュメントだけ**
     ＝ MHS が **日付に開いて配ってくれた**結果。
     {
       ver:1, from:'2026-07-01', to:'2027-10-31',
       biz:{ s:'09:00', e:'18:00' },            ふつうの営業時間
       dow:[3],                                  毎週の定休曜日（予備値）
       days:{ '2026-08-13':{c:1,l:'お盆休み',k:'range'},
              '2026-08-20':{h:'am',l:'棚卸し'} }
     }
     ⚠ **ふつうの営業日は入っていない**。入っている日＝なにかある日。

   🔴 なぜ PitFlow で計算しないのか
     休みは「積み上げルール（毎週／毎月第n曜／祝日／期間／単発）＋営業が最優先」に
     「日ごとの印（午前休み・午後休み・早締め）」が重なった合わせ技で、
     その知識は **MHS にしかない**。こちらに同じ計算を持つと、片方を直した時に必ずずれる。
     **直すなら MHS 側。ここには休業判定のロジックを足さないこと。**

   ◎届いていない時（予備値の三段構え）
     ① 前に届いた内容（localStorage に丸ごと保存）＝いちばん実態に近い
     ② それも無ければ dow だけ（前回の定休曜日）
     ③ それも無ければ FALLBACK_DOW（水曜）
     どの段でも **画面は止めない**。代わりに PitCal.notice() が注意文を返すので、
     日付を選ぶ画面の上に出す（＝古い休みで予約を入れてしまう事故を防ぐ）。

   ◎ほかのアプリでも使える
     見ているのは `window.fb`（Firestore）と localStorage だけ。**そのまま置けば動く**。
     ⚠ `state.settings` への写し（予備値の同期）は **PitFlow だけ**＝
       `window.PIT_CAL_MIRROR = 1` を立てたアプリでしかやらない（よその設定を壊さないため）。
     2026-08-05：CarFlow にも同じファイルを置いた（整備依頼業務の「翌営業日」をPitFlowと合わせるため）。

   ◎使い方（これだけ覚えればいい）
     PitCal.isClosed('2026-08-13')  → true  … 休業日
     PitCal.label('2026-08-13')     → 'お盆休み'
     PitCal.info(ds)   → {closed, openWin, half, end, label, kind, source}
     PitCal.hours(ds)  → {open:'09:00', close:'17:00', closed:false}
     PitCal.openTime(ds) / PitCal.cutoffTime(ds)
     PitCal.status()   → {state:'loading'|'ok'|'none'|'error', source, updatedAt, staleDays, outOfRange}
     PitCal.notice()   → 注意文（無ければ null）
   ======================================== */
(function () {
  'use strict';

  var LS = 'pitflow_mhscal_v1';
  var FALLBACK_DOW = [3];              /* 何も無い時の最後の砦＝水曜定休 */
  var STALE_DAYS = 3;                  /* これ以上古いと「古いかも」を出す */

  var CAL = null;                      /* 届いた（or 前に届いた）カレンダー */
  var SRC = 'none';                    /* 'mhs' 生 ／ 'cache' 前に届いた ／ 'none' 何も無い */
  var ERR = false;
  var GOT = false;                     /* Firestore から一度でも返事が来たか（中身が無い＝未配信も返事のうち） */
  var _unsub = null;
  var _started = false;

  /* ---------- 保存と読み出し（予備値） ---------- */
  function _saveCache(v) {
    try { localStorage.setItem(LS, JSON.stringify({ at: Date.now(), cal: v })); } catch (e) {}
  }
  function _loadCache() {
    try {
      var o = JSON.parse(localStorage.getItem(LS) || 'null');
      if (o && o.cal && o.cal.days) { CAL = o.cal; SRC = 'cache'; return true; }
    } catch (e) {}
    return false;
  }

  /* ---------- 購読 ---------- */
  function _doc() {
    if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
    return window.fb.db.collection('companies').doc(window.fb.currentCompanyId)
             .collection('appSummaries').doc('mhsCalendar');
  }
  /* 予定（mhs-pit.js）と同じ作り＝届いたら、いま開いている画面だけ描き直す */
  var _rt = null;
  function _redraw() {
    clearTimeout(_rt);
    _rt = setTimeout(function () {
      try { if (window.state && state.currentView && window.showView) showView(state.currentView); } catch (e) {}
      try { if (window.pitCardRepaint) window.pitCardRepaint(); } catch (e) {}
    }, 150);
  }
  function start() {
    if (_started) return;
    var d = _doc();
    if (!d) return;                    /* ログイン前・サンプルモードは何もしない（予備値で動く） */
    _started = true;
    try {
      _unsub = d.onSnapshot(function (snap) {
        GOT = true;
        /* 🔴 「まだ配られていない」も **返事のうち**。ここで黙って抜けると、
           画面はいつまでも「読み込み中」に見えて **注意書きが出ない**（＝未着に気づけない）。 */
        if (!snap.exists) { ERR = false; _redraw(); return; }   /* 未配信＝前の内容のまま使う */
        var v = snap.data() || {};
        var at = 0;
        try { at = (v.updatedAt && v.updatedAt.toMillis) ? v.updatedAt.toMillis() : 0; } catch (e) {}
        CAL = {
          ver: v.ver || 1, from: v.from || '', to: v.to || '',
          biz: v.biz || {}, dow: Array.isArray(v.dow) ? v.dow : [],
          days: v.days || {}, updatedAt: at
        };
        SRC = 'mhs'; ERR = false;
        _saveCache(CAL);
        _syncSettingsMirror();
        _redraw();
      }, function (err) {
        console.warn('[cal-pit] 営業日カレンダーを読めませんでした', err);
        ERR = true; _redraw();
      });
    } catch (e) { console.warn('[cal-pit] 購読に失敗', e); ERR = true; }
  }

  /* 🔴 取りこぼし対策。差し替え忘れた古いコード（state.settings.closedDow を直に見ている所）が
     残っていても、値そのものは MHS に追従させておく。**新しいコードはここを見ないこと。**
     🔴 このファイルは PitFlow 以外（CarFlow など）にも置く。よその `state.settings` を
        勝手に書き換えないよう、**PitFlow だけが立てる印**（window.PIT_CAL_MIRROR）がある時だけ写す。 */
  function _syncSettingsMirror() {
    if (!window.PIT_CAL_MIRROR) return;
    if (!window.state || !state.settings || !CAL) return;
    if (Array.isArray(CAL.dow)) state.settings.closedDow = CAL.dow.slice();
    if (CAL.biz && CAL.biz.s) state.settings.openTime = CAL.biz.s;
    if (CAL.biz && CAL.biz.e) state.settings.cutoffTime = CAL.biz.e;
  }

  /* ---------- 判定 ---------- */
  function _entry(ds) {
    if (!CAL || !CAL.days) return null;
    return CAL.days[ds] || null;
  }
  function _dowClosed(ds) {
    var dow = (CAL && Array.isArray(CAL.dow) && CAL.dow.length) ? CAL.dow
            : ((window.state && state.settings && state.settings.closedDow) || FALLBACK_DOW);
    var d = new Date(String(ds) + 'T00:00:00');
    if (isNaN(d.getTime())) return false;
    return dow.indexOf(d.getDay()) >= 0;
  }
  /* 配られた範囲の外か（＝その日は「MHSが何も言っていない」＝曜日だけで判断している） */
  function _outOfRange(ds) {
    if (!CAL || !CAL.from || !CAL.to) return true;
    return (ds < CAL.from || ds > CAL.to);
  }

  var PitCal = {};

  /* その日ぜんぶの情報。ここだけ見れば足りるように作ってある。 */
  PitCal.info = function (ds) {
    ds = String(ds || '');
    var out = { closed: false, openWin: false, half: '', end: '', label: '', kind: '',
                memo: '', source: SRC, exact: false };
    if (!ds) return out;
    var e = _entry(ds);
    if (e) {
      out.exact = true;
      out.label = e.l || '';
      out.kind  = e.k || '';
      if (e.c) { out.closed = true; if (!out.label) out.label = '定休'; }
      else if (e.o) { out.openWin = true; if (!out.label) out.label = '特別営業'; }
      else if (e.m) { out.memo = e.l || ''; out.label = ''; }
      else if (e.h) { out.half = e.h; out.end = e.e || ''; }
      return out;
    }
    /* 範囲内で days に無い＝MHSが「ふつうの営業日」と言っている（＝曜日で判断しない） */
    if (!_outOfRange(ds) && SRC === 'mhs') return out;
    /* 範囲外 or 未着＝曜日だけの予備判断 */
    if (_dowClosed(ds)) { out.closed = true; out.label = '定休'; out.kind = 'weekly'; }
    return out;
  };

  PitCal.isClosed = function (ds) { return !!PitCal.info(ds).closed; };
  /* 画面に出すひとこと（'お盆休み' / '定休' / '午前休み' / '〜15:00締' / '特別営業'）。無ければ '' */
  PitCal.label = function (ds) {
    var i = PitCal.info(ds);
    if (i.closed)  return i.label || '定休';
    if (i.openWin) return i.label || '特別営業';
    if (i.half === 'am')  return i.label ? ('午前休み・' + i.label) : '午前休み';
    if (i.half === 'pm')  return i.label ? ('午後休み・' + i.label) : '午後休み';
    if (i.half === 'end') return '〜' + (i.end || '') + '締';
    return '';
  };
  /* 🔴 v1.90.0 その日の「色」。全画面でこれ1つを見て色を決める＝画面ごとに食い違わない。
       'closed' 休み（赤） / 'short' 短縮営業＝午前休み・午後休み・早締め（オレンジ）
       'open'   特別営業＝ふだん休みの日に開ける（緑） / '' ふつうの営業日
     ⚠ v1.89.0 までは「休みか、そうでないか」の2択しか見ておらず、
        短縮営業が**ふつうの日と同じ灰色**で出ていた（ゆうた指摘 2026-08-13）。 */
  PitCal.tone = function (ds) {
    var i = PitCal.info(ds);
    if (i.closed)  return 'closed';
    if (i.openWin) return 'open';
    if (i.half)    return 'short';
    return '';
  };
  /* 画面に出す「受付 9:00〜17:00」の一行（休みの日は空）。ホバーや見出しで使う。 */
  PitCal.hoursText = function (ds) {
    var h = PitCal.hours(ds);
    if (h.closed) return '';
    return h.open + '〜' + h.close;
  };

  /* 休業ではないが注意がいる日（半休・早締め・特別営業）＝カレンダーに小さく出す用 */
  PitCal.mark = function (ds) {
    var i = PitCal.info(ds);
    if (i.closed) return '';
    return PitCal.label(ds);
  };

  /* その日の営業時間。午前休み・午後休み・早締めをちゃんと反映する。 */
  PitCal.hours = function (ds) {
    var biz = (CAL && CAL.biz) || {};
    var o = String(biz.s || (window.state && state.settings && state.settings.openTime) || '09:00');
    var c = String(biz.e || (window.state && state.settings && state.settings.cutoffTime) || '17:00');
    var i = PitCal.info(ds);
    if (i.closed) return { open: o, close: c, closed: true, half: '', note: i.label };
    if (i.half === 'am')  return { open: '13:00', close: c, closed: false, half: 'am',  note: '午前休み' };
    if (i.half === 'pm')  return { open: o, close: '12:00', closed: false, half: 'pm',  note: '午後休み' };
    if (i.half === 'end' && i.end) return { open: o, close: i.end, closed: false, half: 'end', note: '早締め' };
    return { open: o, close: c, closed: false, half: '', note: '' };
  };
  PitCal.openTime   = function (ds) { return PitCal.hours(ds).open; };
  PitCal.cutoffTime = function (ds) { return PitCal.hours(ds).close; };
  /* 締切の「時」だけ欲しい所（reserve.js の当日締切判定）向け */
  PitCal.cutoffHour = function (ds) {
    var h = parseInt(String(PitCal.cutoffTime(ds)).slice(0, 2), 10);
    return isNaN(h) ? 17 : h;
  };
  /* 毎週の定休曜日（見出しの色分けなど「日付が無い所」だけで使う） */
  PitCal.closedDow = function () {
    if (CAL && Array.isArray(CAL.dow) && CAL.dow.length) return CAL.dow.slice();
    return ((window.state && state.settings && state.settings.closedDow) || FALLBACK_DOW).slice();
  };

  /* 長期休み（お盆・年末年始…）＝MHSで「期間」で入れた休みのかたまり。
     [{from,to,label}] を日付順で返す。🧩ルールページの「休み前」「休み後」判定がこれを使う。
     ⚠ 単発の臨時休業（k==='date'）は含めない＝1日だけの休みは「長期休み」ではないため。 */
  var _brCache = null, _brKey = '';
  PitCal.breaks = function () {
    if (!CAL || !CAL.days) return [];
    var key = (CAL.updatedAt || 0) + ':' + Object.keys(CAL.days).length;
    if (_brCache && _brKey === key) return _brCache;
    var ks = Object.keys(CAL.days).filter(function (d) {
      var e = CAL.days[d]; return e && e.c && e.k === 'range';
    }).sort();
    var out = [], cur = null;
    ks.forEach(function (ds) {
      var lb = CAL.days[ds].l || '長期休み';
      if (cur && lb === cur.label && _next(cur.to) === ds) { cur.to = ds; return; }
      cur = { from: ds, to: ds, label: lb };
      out.push(cur);
    });
    _brCache = out; _brKey = key;
    return out;
  };
  function _next(ds) {
    var d = new Date(ds + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* いまの状態。設定画面と、日付を選ぶ画面の注意書きが使う。 */
  PitCal.status = function () {
    if (ERR) return { state: 'error', source: SRC, updatedAt: (CAL && CAL.updatedAt) || 0 };
    /* 🔴 ログイン前・サンプルモード（＝Firestore に繋がっていない）は 'offline'。
       ここを 'none' にすると、開発用サンプルでも「MHSが届いていません」の帯が出てしまう。 */
    if (!_doc()) return { state: 'offline', source: SRC, updatedAt: (CAL && CAL.updatedAt) || 0 };
    /* 返事が来る前だけ loading。返事が来て中身が無ければ none（＝MHSがまだ配っていない）。 */
    if (!CAL) return { state: (!GOT) ? 'loading' : 'none', source: 'none', updatedAt: 0 };
    var at = CAL.updatedAt || 0;
    var days = at ? Math.floor((Date.now() - at) / 86400000) : null;
    return {
      state: (SRC === 'mhs') ? 'ok' : 'cache',
      source: SRC, updatedAt: at, staleDays: days,
      stale: (days != null && days >= STALE_DAYS),
      from: CAL.from || '', to: CAL.to || ''
    };
  };
  /* 注意文（出す必要が無ければ null）。⚠ 「予定なし」と「届いていない」を混ぜないこと。 */
  PitCal.notice = function () {
    var st = PitCal.status();
    if (st.state === 'ok' && !st.stale) return null;
    if (st.state === 'offline') return null;                 /* ログイン前・サンプル＝配る相手がいない */
    if (st.state === 'error')  return 'MHSの営業日カレンダーを読めませんでした（通信または権限）。いまは前回の内容と定休曜日で表示しています。';
    if (st.state === 'loading') return null;                 /* 一瞬なので出さない */
    if (st.state === 'none')   return 'MHSの営業日カレンダーがまだ届いていません（誰かがMHSを開くと配られます）。いまは定休曜日だけで表示しています。臨時休業・長期休みは反映されていません。';
    if (st.state === 'cache')  return 'MHSの営業日カレンダーが今回まだ届いていません。前回届いた内容で表示しています。';
    return 'MHSの営業日カレンダーが ' + st.staleDays + '日前から更新されていません（誰かがMHSを開くと配られます）。臨時休業が反映されていない可能性があります。';
  };
  /* 日付を選ぶ画面の上に出す注意の帯。出す必要が無ければ空文字（＝なにも足さない）。 */
  PitCal.noticeHtml = function () {
    var t = PitCal.notice();
    if (!t) return '';
    return '<div class="cal-warn"><i data-ic=warn data-ics=16></i><span>' + t + '</span></div>';
  };
  /* 最終更新の表示用（'8/5 09:12'）。無ければ '' */
  PitCal.updatedLabel = function () {
    var at = (CAL && CAL.updatedAt) || 0;
    if (!at) return '';
    var d = new Date(at);
    return (d.getMonth() + 1) + '/' + d.getDate() + ' '
         + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };

  PitCal.start = start;
  PitCal.syncFallback = _syncSettingsMirror;   /* 設定を初期値に戻した直後に呼ぶ（予備値をMHSへ戻す） */

  /* ⚙️ 設定ページに出す「営業日・営業時間」カード＝**見るだけ**。直すのは MHS。
     🔴 ここに入力欄を戻さないこと。戻した瞬間、PitFlow と MHS のどちらが本当か分からなくなる。 */
  window.pitCalCardHtml = function () {
    var DOW = ['日', '月', '火', '水', '木', '金', '土'];
    var st = PitCal.status();
    var hrs = PitCal.hours(_todayDs());
    var dow = PitCal.closedDow();
    var brs = PitCal.breaks().slice(0, 6);
    var h = '';
    h += '<div class="ps-card">';
    h += '<div class="ps-h" style="display:flex;align-items:center;gap:10px"><i data-ic=clock data-ics=16></i> 営業日・営業時間'
       + '<span class="rl-ebadge" style="margin-left:auto">MHSが基準</span></div>';
    h += '<div class="ps-desc"><b>定休曜日・祝日の扱い・営業時間・長期休み・臨時休業・特別営業・午前/午後休み・早締め</b>は、'
       + '<b>MHS（マスターハブ・スケジュール）の会社カレンダー</b>が唯一の基準です。'
       + 'PitFlow のこの画面では<b>直せません</b>（直すと二重管理になるため）。'
       + '変更は MHS の <b>管理 ▸ 定休日カレンダー／設定</b> から。保存すると数秒でここにも届きます。</div>';
    h += PitCal.noticeHtml();
    h += '<div class="ps-grid">';
    h += '<span class="ps-lb">営業時間 <b style="font-size:15px">' + _e(hrs.open) + ' 〜 ' + _e(hrs.close) + '</b></span>';
    h += '<span class="ps-lb">毎週の定休 <b style="font-size:15px">' + (dow.length ? dow.map(function (i) { return DOW[i] + '曜'; }).join('・') : 'なし') + '</b></span>';
    h += '</div>';
    if (brs.length) {
      h += '<div class="ps-hint" style="margin-top:10px"><i data-ic=parasol data-ics=16></i> 登録されている長期休み：'
         + brs.map(function (b) { return '<b>' + _e(b.label) + '</b> ' + _e(b.from) + '〜' + _e(b.to); }).join('　／　') + '</div>';
    }
    h += '<div class="ps-hint">'
       + (st.updatedAt ? ('MHS更新 ' + PitCal.updatedLabel() + (st.stale ? '（' + st.staleDays + '日前・古い可能性）' : ''))
                      : 'まだ一度も届いていません')
       + (st.from ? ('　／　届いている範囲 ' + _e(st.from) + ' 〜 ' + _e(st.to)) : '')
       + '</div>';
    h += '</div>';
    return h;
  };
  function _todayDs() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function _e(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  /* 🧪 自動試験の差し込み口。**MHSと同じ形のカレンダーを手で入れる**ためだけのもの。
     ⚠ 本番の画面では誰も呼ばない（呼ばれても、次に MHS から届いた時点で上書きされる）。
        休みの日を作るのに Firestore を触りたくない＝試験のために本番データを汚さないため。 */
  PitCal.__inject = function (v) {
    CAL = { ver: v.ver || 1, from: v.from || '', to: v.to || '',
            biz: v.biz || {}, dow: Array.isArray(v.dow) ? v.dow : [],
            days: v.days || {}, updatedAt: Date.now() };
    SRC = 'mhs'; ERR = false; GOT = true;
    _syncSettingsMirror();
  };
  window.__PitCalTest = function (v) { PitCal.__inject(v); };

  window.PitCal = PitCal;

  /* 予備値をすぐ載せる（ログイン前でも画面が動くように）→ 繋がったら本物に差し替わる */
  _loadCache();
  _syncSettingsMirror();
  start();
  /* ログインが後から通る作りなので、繋がるまで少しだけ様子を見る */
  var _tries = 0;
  var _iv = setInterval(function () {
    if (_started || ++_tries > 40) { clearInterval(_iv); return; }
    start();
  }, 500);

  console.log('[cal-pit] ready（MHSが配る appSummaries/mhsCalendar を読みます・source=' + SRC + '）');
})();
