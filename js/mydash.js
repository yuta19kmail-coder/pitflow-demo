/* ========================================
   mydash.js  -  ダッシュボード（ビルダー）／PitFlow v0.126.0
   ----------------------------------------
   ◎これがTOPページ（旧「ダッシュボード」「整備ダッシュボード」を統合・置換）
     PitFlowの全要素を「BOX」化して、ユーザーが自分で組む。
     ・検索バーと付箋（全体タスク）は先頭に常時固定。
     ・BOXは 小/中/大/特大 の複数サイズ。サイズごとに情報量を出し分け。すべて本物のデータ。
     ・個人（担当者）フォーカスのBOX（自分／指定スタッフの 予約・タスク・返車・予約担当）。
     ・ビューやビュー内アンカー（例：予約の2ヶ月）へ飛ぶショートカットBOX。
     ・プリセット（用途別に複数レイアウトを保存・切替）。デフォルト雛形あり。
     ・配置はアカウント単位で保存（state.settings.myDash）。
   ======================================== */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function teamOf(c) { return c && c.boardId === 'import' ? 'import' : 'default'; }
  function teamColor(c) { return teamOf(c) === 'import' ? '#ec4899' : '#1db97a'; }
  function nm(c) { return (window.pitCustSurname ? pitCustSurname(c) : (c && c.customer)) || '（未入力）'; }
  function carOf(c) { return c && c.car ? String(c.car) : ''; }
  function amt(c) {
    if (!c) return 0;
    if (c.amountFinal != null) return +c.amountFinal || 0;
    if (c.amountOrder != null) return +c.amountOrder || 0;
    if (c.estAmount != null) return +c.estAmount || 0;
    var wt = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes[0] : c.workType;
    return window.pitEstAmount ? (pitEstAmount(wt, teamOf(c)) || 0) : 0;
  }
  /* 🔴 v1.61.0 「売上をどの日に数えるか」は物差し1本（js/sales-count.js）から取る。**写しを作らない**
        実績＝実績カウント日（completedAt）／まだ返していない車＝返車予定日 */
  function mdCountDate(c) { return window.pitSalesCountDate ? pitSalesCountDate(c) : String((c && (c.completedAt || c.returnDateFinal || c.returnDate)) || ''); }
  /* 🔴 v1.99.0 「売上なしでアーカイブ」した車は、実績・返車済みの台数に数えない（物差し＝pitCardNoSale） */
  function mdNoSale(c) { return !!(window.pitCardNoSale && pitCardNoSale(c)); }
  /* 🔴 v1.65.0 「返車の一覧にどの日で出すか」は return-slot.js の物差し1本。ここで条件を書き写さない。 */
  function mdRetDate(c) { return window.pitReturnListDate ? pitReturnListDate(c) : ((c && c.status !== 'returned' && c.status !== 'scrap') ? (c.returnDate || '') : ''); }
  function yen(n) { return '¥' + (Math.round(+n || 0)).toLocaleString('ja-JP'); }
  /* 🔴 v1.85.0 金額の書き方は**この3本だけ**。あちこちで組み立て直さないこと。
       man(n)     … 文章に混ぜる用。単位まで入り。 1,200円 ／ 24.4万 ／ 1.2億
       amtVal(n)  … kpi() の数字の部分だけ（単位なし）
       amtUnit(n) … kpi() の小さい単位（円／万／億）
     ⚠ 以前は man(n) が「24.4万」を返すのに、そのうしろへ manUnit(n) の「万」を足していて
        画面に **24.4万万** と出ていた（売上・受注残・生産・目標の5〜6か所／ゆうた指摘 2026-08-12）。
        man() と amtUnit() を**混ぜない**こと。 */
  function amtUnit(n) { var a = Math.abs(Math.round(+n || 0)); return a >= 100000000 ? '億' : a >= 10000 ? '万' : '円'; }
  function amtVal(n) {
    n = Math.round(+n || 0); var a = Math.abs(n);
    if (a >= 100000000) return (Math.round(n / 10000000) / 10) + '';
    if (a >= 10000) return (Math.round(n / 1000) / 10) + '';
    return n.toLocaleString('ja-JP');
  }
  function man(n) { return amtVal(n) + amtUnit(n); }
  function wtChip(c) {
    var id = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes[0] : c.workType;
    var w = (state.workTypes || []).find(function (x) { return x.id === id; });
    return w ? '<span class="md-wt" style="color:' + w.color + '">' + esc(w.label) + '</span>' : '';
  }
  function daysAgo(dateStr) {
    if (!dateStr) return null;
    var d = new Date(dateStr + 'T00:00:00'); if (isNaN(d)) return null;
    var t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((t - d) / 86400000);
  }

  // ---- 自分／スタッフ ----
  function meId() {
    var id = null; try { id = localStorage.getItem('pitflow_bn_me'); } catch (e) {}
    var staff = state.staff || [];
    if (id && staff.some(function (s) { return s.id === id; })) return id;
    var f = staff.find(function (s) { return s.front; }) || staff[0];
    return f ? f.id : null;
  }
  function nameOfId(id) { var s = (state.staff || []).find(function (x) { return x.id === id; }); return s ? s.name : ''; }
  function meName() { return nameOfId(meId()); }
  function assignableStaff() { return (state.staff || []).filter(function (s) { return s.front || s.reception; }); }
  // 個人BOXの対象名配列
  function targetNames(item) {
    if (!item || !item.p || item.p === 'me') return [meName()];
    if (Array.isArray(item.p)) return item.p.slice();
    return [String(item.p)];
  }
  function targetLabel(item) {
    if (!item || !item.p || item.p === 'me') return '自分の';
    var ns = targetNames(item);
    return (ns.length === 1 ? ns[0] : ns.join('・')) + 'の';
  }
  function inTarget(val, names) { return !!val && names.indexOf(val) >= 0; }
  function taskStaff(c) { return c.frontStaff || c.staff || ''; }

  // ---- 表示部品 ----
  /* 🔴 v1.85.0 0 は静かに沈める（ゆうた指摘）。
     「0件＝やることが無い」なので、件数があるときと同じ色で主張されると目印にならない。
     数字が 0 のときだけ色を捨てて灰色にする。 */
  function isZero(n) { return n === 0 || n === '0'; }
  function kpi(n, u, sub, cls) {
    return '<div class="md-kpi ' + (cls || '') + (isZero(n) ? ' zero' : '') + '"><div class="md-n">' + n + (u ? '<small>' + u + '</small>' : '') + '</div>' +
      (sub ? '<div class="md-sub">' + sub + '</div>' : '') + '</div>';
  }
  function rowCard(id, main, right, rcls) {
    var oc = id ? ' onclick="event.stopPropagation();openDetail(\'' + esc(id) + '\')"' : '';
    return '<div class="md-row md-int' + (id ? ' md-click' : '') + '"' + oc + '>' +
      '<span class="md-row-m">' + main + '</span>' + (right ? '<span class="md-row-r ' + (rcls || '') + '">' + right + '</span>' : '') + '</div>';
  }
  function bigCard(id, l1, l2, color) {
    var oc = id ? ' onclick="event.stopPropagation();openDetail(\'' + esc(id) + '\')"' : '';
    return '<div class="md-card md-int md-click" style="border-left-color:' + (color || 'var(--brand,#26a269)') + '"' + oc + '>' +
      '<div class="md-c1">' + l1 + '</div>' + (l2 ? '<div class="md-c2">' + l2 + '</div>' : '') + '</div>';
  }
  function empty(msg) { return '<div class="md-empty">' + esc(msg || '該当なし') + '</div>'; }
  function spark(vals, cap) {
    var mx = Math.max.apply(null, vals.concat(cap ? [cap] : [1])); if (mx <= 0) mx = 1;
    return '<div class="md-spark">' + vals.map(function (v) {
      var pct = Math.max(4, Math.round(v / mx * 100)); var over = (cap && v >= cap);
      return '<i style="height:' + pct + '%;' + (over ? 'background:var(--red,#ef4444);opacity:.9' : '') + '" title="' + v + '"></i>';
    }).join('') + '</div>';
  }
  function openFoot(view, label, range) {
    return '<div class="md-open md-int" onclick="event.stopPropagation();mydGo(\'' + view + '\'' + (range ? ",'" + range + "'" : '') + ')">↳ 「' + esc(label) + '」を開く</div>';
  }
  function calStrip(n) {
    var cols = window._dashCalCols ? _dashCalCols(0, n, C.today, C.tStr) : '';
    return '<div class="md-tiny" style="margin-top:8px">今後' + Math.round(n / 7) + '週間の空き（<span style="color:#1db97a">可</span>＝空きあり／<span style="color:#ef4444">終了</span>＝満枠／超過／休）</div>' +
      '<div class="md-cal-scroll"><div class="drc-grid"><div class="drc-col drc-lab"><div class="drc-h"></div><div class="drc-c"><i data-ic=car data-ics=16></i> 国産</div><div class="drc-c"><i data-ic=globe data-ics=16></i> 輸入</div></div>' + cols + '</div></div>';
  }
  function miniStat(label, n) { return '<div class="md-mini' + (n ? ' on' : '') + '"><div class="md-mini-n">' + n + '</div><div class="md-mini-l">' + label + '</div></div>'; }

  /* =========================================================
     🔴 v1.85.0 中身（チップ）＝「誰の何の車か」を出す
     ---------------------------------------------------------
     ◎なぜ（ゆうた 2026-08-12）
       「預かり中20台と言われても正直意味がない。山田 アクア／田中 プリウス
         みたいに個別の顧客情報が無いと、結局なんのアクションもできない」
       ＝**数字は見出し、中身が本体**。数字だけのBOXは中身に切り替えられるようにした。

     ◎かたち
       予約の**月ビューのチップと同じ**（`09:30 池田 様 スイフト 車検`）。
       現場が読み慣れている形なので、覚え直しが要らない。押せばカード詳細が開く。

     ⚠ ここで「どのカードを出すか」を新しく書かないこと。
        各BOXの pick() を body と list の**両方が呼ぶ**形にしてある（判定は1か所）。
     ========================================================= */
  function cpLim(sz) { return sz === 's' ? 3 : sz === 'm' ? 8 : sz === 'l' ? 16 : 40; }
  function cp(id, inner, hot) {
    var oc = id ? ' onclick="event.stopPropagation();openDetail(\'' + esc(id) + '\')"' : '';
    return '<span class="md-cp' + (id ? ' md-int md-click' : '') + (hot ? ' hot' : '') + '"' + oc + '>' + inner + '</span>';
  }
  function cpT(t) { return t ? '<span class="md-cp-t">' + esc(t) + '</span>' : ''; }          /* 時刻・日付 */
  function cpWho(c) { return '<span class="md-cp-w">' + esc(nm(c)) + ' 様 ' + esc(carOf(c)) + '</span>'; }
  function cpN(s, cls) { return s ? '<span class="md-cp-n' + (cls ? ' ' + cls : '') + '">' + esc(s) + '</span>' : ''; }
  function cpDai(c) { return c && c.needLoaner ? '<span class="md-cp-d" title="代車あり">代</span>' : ''; }
  /* 中身のかたまり。lim を超えたぶんは「ほか◯台」で数だけ（押すとBOXが開く） */
  function chipsOf(list, sz, make, emptyMsg, unit) {
    var lim = cpLim(sz);
    if (!list.length) return '<div class="md-cp-none">' + esc(emptyMsg || '該当なし') + '</div>';
    var h = '<div class="md-chips">' + list.slice(0, lim).map(make).join('');
    if (list.length > lim) h += '<span class="md-cp md-cp-more">ほか ' + (list.length - lim) + (unit || '台') + '</span>';
    return h + '</div>';
  }
  /* =========================================================
     🔴 v1.87.0 BOXを押したときの出しかた（ゆうた案 2026-08-12）
     ---------------------------------------------------------
       数字のBOX  → 押すと **細表示（チップ）** ＝「誰の何の車か」が1行ずつ
       中身のBOX  → 押すと **中表示（本物のカード）** ＝盤面と同じ見た目
       どちらも下に **「◯◯を開く」** が付く（ビューへ飛ぶ）
     ＝ 数字 → 細 → 中 → ビュー、と1段ずつ濃くなる。
     ⚠ カードの絵は `cardHtml(c, {compact:true})`（reserve.js）を借りる。
        ここで似たものを作らない＝盤面と見た目がズレるため。
     ========================================================= */
  function listOf(def, it) { try { return (def.pick ? def.pick(it) : []) || []; } catch (e) { console.error('[mydash] pick error', e); return []; } }
  function listBody(def, sz, it) {
    var list = listOf(def, it);
    return (def.head ? def.head(list, it) : '') + chipsOf(list, sz, def.chip, def.none, def.unit);
  }
  function cardsBody(def, sz, it, lim) {
    var list = listOf(def, it);
    if (!list.length) return '<div class="md-cp-none">' + esc(def.none || '該当なし') + '</div>';
    lim = lim || (sz === 's' ? 8 : sz === 'm' ? 16 : 40);
    var html = list.slice(0, lim).map(function (c) {
      return (typeof window.cardHtml === 'function') ? cardHtml(c, { compact: true }) : '';
    }).join('');
    return '<div class="md-cards">' + html + '</div>' +
      (list.length > lim ? '<div class="md-more-n">ほか ' + (list.length - lim) + (def.unit || '台') + '</div>' : '');
  }

  /* 中身モードの1行目＝小さい数字（BOXの見出しの下） */
  function lnum(n, u, sub) {
    return '<div class="md-lnum' + (isZero(n) ? ' zero' : '') + '"><b>' + n + '</b>' + (u ? '<small>' + u + '</small>' : '') +
      (sub ? '<span>' + sub + '</span>' : '') + '</div>';
  }

  // ---- 描画コンテキスト ----
  var C = null;
  function buildCtx() {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var y = today.getFullYear(), m = today.getMonth();
    var wkS = (window.startOfWeek ? startOfWeek(today) : today);
    /* 🚫 v1.50.0 翌営業日は MHS の定休日カレンダー（PitCal）で送る＝臨時休業も飛ばす */
    var nb = new Date(today);
    for (var _i = 0; _i < 31; _i++) { nb.setDate(nb.getDate() + 1); if (!(window.PitCal && PitCal.isClosed(ymd(nb)))) break; }
    C = {
      cards: state.cards || [], today: today, tStr: ymd(today), y: y, m: m,
      moS: ymd(new Date(y, m, 1)), moE: ymd(new Date(y, m + 1, 0)),
      wkS: ymd(wkS), wkE: ymd(addDays(wkS, 6)), nextBiz: ymd(nb),
      cap: (window._dashCap ? _dashCap() : ((state.settings && state.settings.lotCapacity) || 28)), _md: null
    };
    return C;
  }
  function mdTot() {
    if (C._md) return C._md;
    var t = { mC: 0, mA: 0, wC: 0, wA: 0, rC: 0, rA: 0, d1: null, d2: null };
    if (window._mdCalc) {
      var d1 = _mdCalc('div1', C.cards, C.moS, C.moE, C.wkS, C.wkE);
      var d2 = _mdCalc('div2', C.cards, C.moS, C.moE, C.wkS, C.wkE);
      ['mC', 'mA', 'wC', 'wA', 'rC', 'rA'].forEach(function (k) { t[k] = (d1[k] || 0) + (d2[k] || 0); });
      t.d1 = d1; t.d2 = d2;
    }
    C._md = t; return t;
  }
  function isShaken(c) { var a = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes : [c.workType]; return a.indexOf('shaken') >= 0; }
  function shakenStat() {
    var cnt = { decided: 0, done: 0, recheck: 0, cand: 0, unset: 0, decidedList: [], candList: [], unsetList: [] };
    C.cards.forEach(function (c) {
      if (!isShaken(c) || c.status === 'scrap') return;
      var s = c.inspSchedule || {};
      if (s.result === 'done') { cnt.done++; return; }
      (s.history || []).forEach(function (h) { if (h && h.result === 'recheck') cnt.recheck++; });
      if (s.decided) { cnt.decided++; cnt.decidedList.push(c); return; }
      var hasSlot = s.slots && Object.keys(s.slots).some(function (k) { return (s.slots[k] || []).length; });
      if (hasSlot) { cnt.cand++; cnt.candList.push(c); return; }
      if (c.status !== 'reserved' && c.status !== 'returned') { cnt.unset++; cnt.unsetList.push(c); }
    });
    return cnt;
  }
  function shakenRecords() {
    var recs = [];
    C.cards.forEach(function (c) {
      if (!isShaken(c)) return;
      var s = c.inspSchedule || {};
      if (s.result === 'done') recs.push({ iso: s.resultDate || s.decided, c: c, result: 'done', staff: s.resultStaff || '' });
      (s.history || []).forEach(function (h) { if (h && h.result === 'recheck' && h.date) recs.push({ iso: h.date, c: c, result: 'recheck', staff: h.staff || '' }); });
    });
    recs.sort(function (a, b) { return (b.iso || '').localeCompare(a.iso || ''); });
    return recs;
  }
  /* 🔴 v1.80.0 空きの判定は loaner-free.js の1本（引退・緊急・代車自身の車検を除く）。
     ⚠ ここで自分で数え直さないこと。以前は引退した代車まで「空き」に数えていた。 */
  function loanerStat(dStr) {
    var loaners = (window.pitLoanerUsableList ? pitLoanerUsableList() : (state.loaners || []));
    var busy = function (l, ds) { return window.pitLoanerBusyOn ? pitLoanerBusyOn(l, ds) : false; };
    var freeList = loaners.filter(function (l) { return !busy(l, dStr); });
    return { total: loaners.length, free: freeList.length, busy: loaners.length - freeList.length, freeList: freeList, busyFn: busy, loaners: loaners };
  }
  function csStat() {
    var active = function (c) { return c.status !== 'returned' && c.status !== 'scrap'; };
    var hasCoat = function (c) { var a = [].concat(c.workTypes || [], c.workAddons || [], [c.workType]); return a.indexOf('coat1y') >= 0 || a.indexOf('coat3m') >= 0; };
    var wash = C.cards.filter(function (c) { return c.needWash && c.returnStage === 'returnWait' && active(c); });
    return {
      washToday: wash.filter(function (c) { return c.returnDate === C.tStr && !c.washSalesDone; }),
      washTomorrow: wash.filter(function (c) { return c.returnDate === C.nextBiz && !c.washSalesDone; }),
      washWeek: wash.filter(function (c) { return c.returnDate > C.nextBiz && c.returnDate <= C.wkE && !c.washSalesDone; }),
      headlight: C.cards.filter(function (c) { return c.headlight && !c.headlightDone && active(c); }),
      coatReq: C.cards.filter(function (c) { return hasCoat(c) && c.coatingOK && !c.coatingDone && active(c); }),
      salesReq: C.cards.filter(function (c) { return c.salesReq && !c.salesReqDone && active(c); })
    };
  }
  var TASK_ACTIVE = ['check', 'estim', 'contact', 'parts', 'work'];
  var TASK_LABEL = { check: '点検', estim: '見積', contact: '連絡', parts: '部品', work: '作業' };

  /* =========================================================
     🔴 v1.85.0 「どのカードを出すか」＝物差し
     ---------------------------------------------------------
     数字（body）と 中身（list）が**同じ関数**を呼ぶ。
     ⚠ 片方だけ条件を足すと、数字と中身の台数が食い違う。必ずここを直すこと。
     ========================================================= */
  /* ⚠ v1.17.0：まだ保存していない新規予約（_draft）は出さない・数えない */
  function pickIntake() {
    return C.cards.filter(function (c) { return !c._draft && c.reserveDate === C.tStr && c.status !== 'scrap'; })
      .sort(function (a, b) { return pitTimeMin(a.reserveTime) - pitTimeMin(b.reserveTime); });   /* v1.33.0 */
  }
  /* =========================================================
     🔴 v1.86.0 未定欄をBOX化（ゆうた依頼 2026-08-12）
     ---------------------------------------------------------
     返車の未定欄＝完TEL待ち／返車日未定／返車時間未定／入金待ち
     予約の未定欄＝承認待ち／仮予約／未定（入庫日決まらず）／未入庫
     ⚠ **条件をここに書き写さない。** 画面（undetermined.js）と同じ物差しを呼ぶ。
        ・返車の振り分け＝`pitReturnPlace`（return-slot.js）**1本**。
          「returnStage が…かつ returnDate が…」と書き写すと、
          ホバー入力・返車ポップアップ・未定一覧・ここ の4か所が食い違う（v1.60.0 の教訓）。
        ・予約側は undetermined.js の renderReserveTbd と**同じ式**にしてある。
          あちらを直したらここも直すこと（式が2か所ある＝将来まとめたい宿題）。
     ========================================================= */
  function retPlace(c) { return window.pitReturnPlace ? pitReturnPlace(c) : null; }
  function pickRetPlace(p) { return C.cards.filter(function (c) { return retPlace(c) === p; }); }
  /* 予約の未定欄（undetermined.js renderReserveTbd と同じ条件） */
  function pickApproval() {
    return C.cards.filter(function (c) {
      return c.approvalPending && !c.archived && c.status !== 'returned' && c.status !== 'cancelled' && c.status !== 'scrap';
    });
  }
  function pickTentative() { return C.cards.filter(function (c) { return c.status === 'reserved' && c.tentative && !c.approvalPending; }); }
  function pickIntakeTbd() { return C.cards.filter(function (c) { return c.status === 'reserved' && c.intakeTbd && !c.tentative; }); }
  function pickNoShow() { return C.cards.filter(function (c) { return c.status === 'cancelled' && !c.archived; }); }

  function pickReturnOut() { return C.cards.filter(function (c) { return mdRetDate(c) === C.tStr; }); }
  /* ⚠ v1.86.0 ここは以前 `returnStage === 'callWait'` を**書き写していた**。
     未定ビューは `pitReturnPlace` で振り分けているので、条件が育つとズレる。物差しを1本に寄せた。 */
  function pickTelWait() { return pickRetPlace('callWait'); }
  function pickReturnWait() {
    return C.cards.filter(function (c) { return c.returnStage === 'returnWait' && c.status !== 'returned' && c.status !== 'scrap'; })
      .sort(function (a, b) { return (a.returnDate || '9999').localeCompare(b.returnDate || '9999'); });
  }
  function pickRetDateTbd() { return pickRetPlace('dateTbd'); }
  function pickRetTimeTbd() {
    return pickRetPlace('timeTbd').sort(function (a, b) {
      return String(a.returnDateFinal || a.returnDate || '9999').localeCompare(String(b.returnDateFinal || b.returnDate || '9999'));
    });
  }
  function pickPay() { return C.cards.filter(function (c) { return !mdNoSale(c) && c.status === 'returned' && c.paymentSeparate && !c.paymentDate; }); }
  function longHoldDays() { return (state.settings && state.settings.longHoldDays) || 7; }
  function pickLongHold() {
    var lim = longHoldDays();
    return C.cards.filter(function (c) {
      if (!(window._mdInShop ? _mdInShop(c) : (TASK_ACTIVE.indexOf(c.status) >= 0))) return false;
      var d = daysAgo(c.reserveDate); return d != null && d >= lim;
    }).sort(function (a, b) { return (daysAgo(b.reserveDate) || 0) - (daysAgo(a.reserveDate) || 0); });
  }
  /* 預かり中＝いま工場にある車。古い（長くいる）順に出す＝手が止まっている車が先頭に来る */
  function pickHold() {
    return C.cards.filter(function (c) { return window._mdInShop ? _mdInShop(c) : (TASK_ACTIVE.indexOf(c.status) >= 0); })
      .sort(function (a, b) { return (daysAgo(b.reserveDate) || 0) - (daysAgo(a.reserveDate) || 0); });
  }
  var ORDER_IN = ['parts', 'work', 'workDone', 'outsource'];
  function pickOrder() {
    return C.cards.filter(function (c) { return ORDER_IN.indexOf(c.status) >= 0 && c.status !== 'returned'; })
      .sort(function (a, b) { return amt(b) - amt(a); });
  }
  function pickResultMonth() {
    return C.cards.filter(function (c) { return !mdNoSale(c) && c.completedAt && c.completedAt >= C.moS && c.completedAt <= C.moE && (c.status === 'workDone' || c.status === 'returned'); })
      .sort(function (a, b) { return (b.completedAt || '').localeCompare(a.completedAt || ''); });
  }
  /* ---- 個人（担当者）フォーカス ---- */
  function pickPReserve(item) {
    var ns = targetNames(item);
    return C.cards.filter(function (c) { return (inTarget(c.frontStaff, ns) || inTarget(c.reserveStaff, ns)) && c.status !== 'returned' && c.status !== 'scrap' && c.reserveDate && c.reserveDate >= C.tStr; })
      .sort(function (a, b) { return a.reserveDate === b.reserveDate ? (pitTimeMin(a.reserveTime) - pitTimeMin(b.reserveTime)) : (a.reserveDate < b.reserveDate ? -1 : 1); });   /* v1.33.0 */
  }
  function pickPTask(item) {
    var ns = targetNames(item);
    return C.cards.filter(function (c) { return inTarget(taskStaff(c), ns) && TASK_ACTIVE.indexOf(c.status) >= 0 && !c.returnStage; })
      .sort(function (a, b) { return TASK_ACTIVE.indexOf(a.status) - TASK_ACTIVE.indexOf(b.status); });
  }
  function pickPReturn(item) {
    var ns = targetNames(item);
    return C.cards.filter(function (c) { var d = mdRetDate(c); return inTarget(taskStaff(c), ns) && d && d >= C.tStr; })
      .sort(function (a, b) { var da = mdRetDate(a), db = mdRetDate(b); return da === db ? ((window.pitReturnSortMin ? pitReturnSortMin(a) : 0) - (window.pitReturnSortMin ? pitReturnSortMin(b) : 0)) : (da < db ? -1 : 1); });   /* v1.65.0 物差し1本 */
  }
  function pickPResStaff(item) {
    var ns = targetNames(item);
    return C.cards.filter(function (c) { return inTarget(c.reserveStaff, ns) && c.bookedAt; })
      .sort(function (a, b) { return (b.bookedAt || '').localeCompare(a.bookedAt || ''); }).slice(0, 10);
  }
  function pickPSales(item) {
    var ns = targetNames(item);
    return C.cards.filter(function (c) { if (c.status !== 'returned') return false; var rd = mdCountDate(c); return rd >= C.moS && rd <= C.moE && inTarget(taskStaff(c), ns); })
      .sort(function (a, b) { return amt(b) - amt(a); });
  }
  /* 車検予定：未設定 → 候補 → 決定 の順（いちばん手が要るものが先） */
  function shakenKind(c) {
    var s2 = c.inspSchedule || {};
    if (s2.decided) return 'd';
    if (s2.slots && Object.keys(s2.slots).some(function (k) { return (s2.slots[k] || []).length; })) return 'c';
    return 'u';
  }
  function pickShakenPlan() {
    var s = shakenStat();
    return s.unsetList.concat(s.candList, s.decidedList);
  }
  function fmd(d) { return d ? (window.fmtMD ? fmtMD(d) : d) : ''; }
  function mdShift(dstr, n) {
    var d = new Date(String(dstr) + 'T00:00:00'); if (isNaN(d)) return dstr;
    d.setDate(d.getDate() + n); return ymd(d);
  }
  /* 🔴 v2.18.0 「その日に返した車」＝**ここ1本**。
     ⚠ 返車BOX（returnout）が同じ数え方を2か所に書いていたので、そちらもこれを呼ぶ形に寄せた。 */
  function mdReturnedOn(dstr) {
    return C.cards.filter(function (c) {
      return !mdNoSale(c) && c.status === 'returned' && (c.completedAt === dstr || c.returnDate === dstr);
    });
  }

  /* =========================================================
     💬💬 v2.18.0 今日のお礼LINE 送信リスト（ゆうた 2026-08-28）
     ---------------------------------------------------------
     🗣「完TEL関門時にLINEありになっている人で、今日返車した人の一覧。
     　　難しいカウント式は要らなくて、**チェックボックスで送ったか送ってないか**が分かれば」
     🗣「（日をまたいだら）**未送は残す**」／🗣「**日づけで切り替えができるか**」
     🔴 誰が対象か・送った印を書くのは **pit-share.js の1本**（`pitThanksNeeded` / `pitThanksSetSent`）。
        ここで条件を書き写さない。
     ⚠ 見ている日（`THX.day`）は**画面の都合＝保存しない**。BOXを置き直せば今日に戻る。
     ========================================================= */
  var THX = { day: null };                         /* null＝今日 */
  function thxDay() { return THX.day || C.tStr; }
  function thxList(dstr) {
    return mdReturnedOn(dstr).filter(function (c) { return window.pitThanksNeeded ? pitThanksNeeded(c) : false; });
  }
  function thxSent(c) { return !!(window.pitThanksSent && pitThanksSent(c)); }
  function thxLeft(list) { return (list || []).filter(function (c) { return !thxSent(c); }); }
  /* その日より前で、**まだ送っていない**人（3日分）＝夜中に送り忘れが黙って消えないため */
  function thxBack(dstr) {
    var out = [];
    for (var i = 1; i <= 3; i++) {
      var d = mdShift(dstr, -i);
      thxList(d).forEach(function (c) { if (!thxSent(c)) out.push({ c: c, d: d }); });
    }
    return out;
  }
  function thxRow(c, sub) {
    var on = thxSent(c);
    return '<div class="md-row md-int md-click thx-row' + (on ? ' on' : '') + '"'
      + ' onclick="event.stopPropagation();openDetail(\'' + esc(c.id) + '\')">'
      + '<span class="thx-cb' + (on ? ' on' : '') + '" onclick="event.stopPropagation();mydThanksToggle(\'' + esc(c.id) + '\')">'
      + (on ? '✓' : '') + '</span>'
      + '<span class="md-row-m">' + esc(nm(c)) + ' 様 ' + esc(carOf(c))
      + (sub ? '<i class="thx-sub">' + esc(sub) + '</i>' : '') + '</span>'
      + (on ? '<span class="md-row-r thx-at">' + esc(c.thanksLineSentAt || '') + '</span>' : '')
      + '</div>';
  }
  function thxBar(d) {
    var isT = (d === C.tStr);
    return '<div class="thx-bar md-int">'
      + '<button class="thx-nav" onclick="event.stopPropagation();mydThanksDay(-1)"><i data-ic=chevLeft data-ics=14></i></button>'
      + '<span class="thx-day">' + esc(fmd(d)) + (isT ? '（今日）' : '') + '</span>'
      + '<button class="thx-nav" onclick="event.stopPropagation();mydThanksDay(1)"><i data-ic=chevRight data-ics=14></i></button>'
      + (isT ? '' : '<button class="thx-today" onclick="event.stopPropagation();mydThanksDay(0)">今日へ</button>')
      + '</div>';
  }
  function thxBackHtml(d, sz) {
    var b = thxBack(d); if (!b.length) return '';
    var lim = (sz === 'l') ? 8 : 4;
    return '<div class="thx-back"><div class="thx-back-h">まだ送っていない（' + b.length + '件）</div>'
      + b.slice(0, lim).map(function (x) { return thxRow(x.c, fmd(x.d)); }).join('')
      + (b.length > lim ? '<div class="md-more-n">ほか ' + (b.length - lim) + '件</div>' : '')
      + '</div>';
  }
  /* =========================================================
     📅📅 v2.21.0 今週の返車予定（**暫定だけ**）（ゆうた 2026-08-28）
     ---------------------------------------------------------
     🗣「確定返車ではなくて **暫定返車予定が今週になっている車**を一覧表示するBOX」
     🗣「1週間分のカレンダーで**常に先の6日分**出るイメージ。**昨日だけ斜線で無効扱い**」
     🗣「チェックなどはいらない／**国産車輸入車関係なく一覧**で／上部に**総件数**」
     ◎かたち
       曜日の見出しは **月火水木金土日 で固定**。そこへ **昨日〜5日先の7日**を置く
       ＝ 7日は必ず全部の曜日に1つずつ入るので、**日付だけが日々ずれていく**（ゆうたの絵のとおり）。
     🔴 **拾うのは `plan`（＝受注のときのお客様への約束）だけ。**
        確定（fixed）・未完（pending）・待や当（sameday）・未定（tbd）は入れない。
        物差しは共通部品 `coreflow-return-plan.js` の `pitReturnPlanKind` / `pitReturnPlanDate` **1本**。
        ⚠ ここに「日付があれば暫定」と書き写さないこと（v1.153.0 の線引きが崩れる）。
     ⚠ **昨日のマスは斜線で無効**にするが、**中の車は消さない**
        （過ぎたのに約束のままの車＝いちばん見たいもの。黙って隠さない）。
     ========================================================= */
  function rpDays() {
    var out = [];
    for (var i = -1; i <= 5; i++) {
      var d = mdShift(C.tStr, i);
      out.push({ d: d, i: i, dow: new Date(d + 'T00:00:00').getDay(),
                 closed: !!(window.PitCal && PitCal.isClosed(d)) });
    }
    return out;
  }
  function rpAll() {
    if (!window.pitReturnPlanKind || !window.pitReturnPlanDate) return [];
    return C.cards.filter(function (c) {
      return c && !mdNoSale(c) && pitReturnPlanKind(c) === 'plan';
    });
  }
  function rpByDay() {
    var days = rpDays(), map = {}, n = 0;
    days.forEach(function (x) { map[x.d] = []; });
    rpAll().forEach(function (c) {
      var d = pitReturnPlanDate(c);
      if (map[d]) { map[d].push(c); n++; }
    });
    return { days: days, map: map, n: n };
  }
  function rpCalHtml(sz) {
    var R = rpByDay();
    var lim = (sz === 'xl') ? 8 : (sz === 'l') ? 4 : 2;
    var cells = new Array(7);                       /* 月=0 … 日=6 の固定の並び */
    R.days.forEach(function (x) {
      var col = (x.dow + 6) % 7;
      var list = R.map[x.d] || [];
      var dd = +x.d.split('-')[2];
      var h = '<div class="rp-cell' + (x.i < 0 ? ' past' : '') + (x.i === 0 ? ' today' : '')
            + (x.closed ? ' closed' : '') + '">'
            + '<div class="rp-d">' + (x.i === 0 ? '<b>今</b>' : '') + dd + (x.closed ? '<i>休</i>' : '') + '</div>';
      h += list.slice(0, lim).map(function (c) {
        return '<div class="rp-car md-int" onclick="event.stopPropagation();openDetail(\'' + esc(c.id) + '\')">'
             + '<span class="rp-n">' + esc(nm(c)) + '</span>'
             + (carOf(c) ? '<span class="rp-c">' + esc(carOf(c)) + '</span>' : '') + '</div>';
      }).join('');
      if (list.length > lim) h += '<div class="rp-more">+' + (list.length - lim) + '</div>';
      h += '</div>';
      cells[col] = h;
    });
    var head = ['月','火','水','木','金','土','日'].map(function (w, i) {
      return '<div class="rp-h' + (i === 5 ? ' sat' : i === 6 ? ' sun' : '') + '">' + w + '</div>';
    }).join('');
    return lnum(R.n, '台', '暫定の返車予定')
         + '<div class="rp-cal">' + head + cells.map(function (h) { return h || '<div class="rp-cell"></div>'; }).join('') + '</div>';
  }

  /* 押した時＝送った／送っていない を入れ替える。書き込みは pit-share.js の1本を通す */
  window.mydThanksToggle = function (id) {
    var c = (state.cards || []).find(function (x) { return x && x.id === id; });
    if (!c || !window.pitThanksSetSent) return;
    pitThanksSetSent(c, !thxSent(c));
    renderMyDash();
  };
  window.mydThanksDay = function (n) {
    if (!C) buildCtx();
    THX.day = (n === 0) ? null : mdShift(thxDay(), n);
    if (THX.day === C.tStr) THX.day = null;
    renderMyDash();
  };

  // ---------------------------------------------------------
  // 要素レジストリ（データBOX）
  //   dv … 既定の見せ方（'num'＝数字／'list'＝中身）。ゆうたと決めた割り振り。
  //   list … 中身（チップ）。無いBOXは［中身］［両方］を選べない（グレー）。
  // ---------------------------------------------------------
  var EL = {

    hold: {
      title: '預かり中', icon: '🅿️', jump: 'dashboard', sizes: ['s', 'm', 'l'], dv: 'num',
      pick: pickHold,
      head: function (list) { var held = window.dashOccupancy ? dashOccupancy(C.tStr) : list.length; return lnum(held, '台', '置場 ' + C.cap + '台中'); },
      chip: function (c) { var d = daysAgo(c.reserveDate), lim = longHoldDays(); return cp(c.id, cpWho(c) + wtChip(c) + cpN(d != null ? d + '日目' : ''), d != null && d >= lim); },
      none: '預かり中の車はありません',
      body: function (sz) {
        var held = window.dashOccupancy ? dashOccupancy(C.tStr) : 0;
        var d = window._dashHeldOnTeam ? _dashHeldOnTeam('default', C.tStr) : 0;
        var i = window._dashHeldOnTeam ? _dashHeldOnTeam('import', C.tStr) : 0;
        if (sz === 's') return kpi(held, '台', '国産' + d + '・輸入' + i, 'g');
        var ratio = C.cap ? held / C.cap : 0;
        var col = ratio >= 1 ? 'var(--red,#ef4444)' : ratio >= 0.9 ? '#f97316' : ratio >= 0.7 ? '#eab308' : 'var(--green,#1db97a)';
        return '<div class="md-inline">' + kpi(held, '台', '国産' + d + '・輸入' + i, 'g') + '</div>' +
          '<div class="md-bar"><i style="width:' + Math.min(100, Math.round(ratio * 100)) + '%;background:' + col + '"></i></div>' +
          '<div class="md-tiny">置場 ' + C.cap + '台中 ' + held + '台（' + Math.round(ratio * 100) + '%）</div>';
      },
      more: function () { var v = []; for (var i = 0; i < 14; i++) v.push(window.dashOccupancy ? dashOccupancy(ymd(addDays(C.today, i))) : 0); return '<div class="md-tiny">直近14日の預かり台数（赤＝満杯）</div>' + spark(v, C.cap) + openFoot('work', 'Pitリスト'); }
    },

    park: {
      title: '駐車場', icon: '🚗', jump: 'parking', sizes: ['s', 'l', 'xl'],
      body: function (sz) {
        var held = window.dashOccupancy ? dashOccupancy(C.tStr) : 0; var free = C.cap - held;
        /* ⚠ v1.85.0 単位の場所には単位（台）だけ。「空き／超過」は説明の行へ（ゆうた指摘） */
        if (sz === 's') return kpi(Math.abs(free), '台', (free >= 0 ? '空き' : '超過') + '／キャパ' + C.cap + '・預り' + held, free >= 0 ? 'g' : 'r');
        var sm = window.ParkingView && ParkingView.summaryHtml ? ParkingView.summaryHtml() : '';
        if (!sm) return '<div class="md-inline">' + kpi(Math.abs(free), '台', (free >= 0 ? '空き' : '超過') + '／キャパ' + C.cap, free >= 0 ? 'g' : 'r') + '</div>';
        return '<div class="md-embed' + (sz === 'xl' ? ' md-embed-tall' : '') + '">' + sm + '</div>';
      },
      more: function () { return openFoot('parking', '駐車場'); }
    },

    earliest: {
      title: '最短入庫日', icon: '⏱', jump: 'availcal', sizes: ['l', 'xl'],
      body: function (sz) {
        function cell(team, kind) {
          var d = window.dashEarliestIntake ? dashEarliestIntake(team, kind, C.today) : null;
          if (!d) return '<td><b class="md-el-d none">なし</b></td>';
          var isT = ymd(d) === C.tStr;
          return '<td><b class="md-el-d' + (isT ? ' ok' : '') + '">' + (isT ? '今日' : (d.getMonth() + 1) + '/' + d.getDate()) + '</b><span class="md-el-w">' + (isT ? 'OK' : '日月火水木金土'[d.getDay()] + '曜') + '</span></td>';
        }
        var tbl = '<table class="md-el"><tr><th></th><th>代車なし</th><th>代車あり</th><th>当日作業</th></tr>' +
          '<tr><td class="md-el-t"><i data-ic=car data-ics=16></i> 国産</td>' + cell('default', 'noLoaner') + cell('default', 'loaner') + cell('default', 'same') + '</tr>' +
          '<tr><td class="md-el-t"><i data-ic=globe data-ics=16></i> 輸入</td>' + cell('import', 'noLoaner') + cell('import', 'loaner') + cell('import', 'same') + '</tr></table>';
        if (sz === 'xl') return tbl + calStrip(28) + openFoot('availcal', '空きカレンダー');
        return tbl;
      },
      more: function () { return calStrip(28) + openFoot('availcal', '空きカレンダー'); }
    },

    reservefill: {
      title: '予約の埋まり', icon: '🗓', jump: 'availcal', sizes: ['l', 'xl'], noexp: true,
      body: function (sz) { return calStrip(sz === 'xl' ? 42 : 21); }
    },

    intake: {
      title: '今日の入庫', icon: '📥', jump: 'today', sizes: ['s', 'm', 'l', 'xl'], dv: 'list',
      pick: pickIntake,
      head: function (list) { var left = list.filter(function (c) { return c.status === 'reserved'; }).length; return lnum(list.length, '台', '未来店 ' + left + '台'); },
      chip: function (c) { return cp(c.id, cpT(c.reserveTime) + cpWho(c) + cpDai(c) + wtChip(c), c.status === 'reserved' && pitTimeMin(c.reserveTime) < 0); },
      none: '本日の入庫予定はありません',
      body: function (sz) {
        var list = pickIntake();
        var left = list.filter(function (c) { return c.status === 'reserved'; }).length;
        if (sz === 's') return kpi(list.length, '台', '未来店 ' + left + '台', 'g');
        if (!list.length) return empty('本日の入庫予定はありません');
        if (sz === 'm') return '<div class="md-list">' + list.slice(0, 6).map(function (c) { return rowCard(c.id, (c.reserveTime ? '<b>' + esc(c.reserveTime) + '</b> ' : '') + esc(nm(c)) + ' ' + esc(carOf(c)), wtChip(c)); }).join('') + (list.length > 6 ? '<div class="md-more-n">ほか ' + (list.length - 6) + '台</div>' : '') + '</div>';
        var lim = sz === 'xl' ? 40 : 8;
        return '<div class="md-scroll' + (sz === 'xl' ? ' md-scroll-tall' : '') + '">' + list.slice(0, lim).map(function (c) {
          return bigCard(c.id, esc(nm(c)) + ' 様 ' + esc(carOf(c)) + '　' + wtChip(c), (c.reserveTime ? esc(c.reserveTime) + '　' : '') + (teamOf(c) === 'import' ? '輸入' : '国産') + (c.needLoaner ? '・代車' : '') + (c.status === 'reserved' ? '' : '・入庫済'), teamColor(c));
        }).join('') + '</div>' + openFoot('today', '当日');
      },
      more: function () { return openFoot('today', '当日'); }
    },

    returnout: {
      title: '今日の返車', icon: '📤', jump: 'return', sizes: ['s', 'm', 'l'], dv: 'list',
      pick: pickReturnOut,
      head: function (list) {
        var done = mdReturnedOn(C.tStr).length;      /* 🔴 v2.18.0 数え方は mdReturnedOn 1本（写しをやめた） */
        return lnum(list.length + done, '台', '返車済 ' + done + '台');
      },
      chip: function (c) { return cp(c.id, cpT(c.returnTime) + cpWho(c) + wtChip(c)); },
      none: '本日の返車待ちはありません',
      body: function (sz) {
        var pend = pickReturnOut();
        var done = mdReturnedOn(C.tStr).length;      /* 🔴 v2.18.0 同上 */
        if (sz === 's') return kpi(pend.length + done, '台', '返車済 ' + done + '台', 'b');
        if (!pend.length) return empty('本日の返車待ちはありません');
        return '<div class="md-list">' + pend.slice(0, 8).map(function (c) { return rowCard(c.id, (c.returnTime ? '<b>' + esc(c.returnTime) + '</b> ' : '') + esc(nm(c)) + ' ' + esc(carOf(c)), wtChip(c)); }).join('') + '</div>' + (sz === 'l' ? openFoot('return', '返車') : '');
      },
      more: function () { return openFoot('return', '返車'); }
    },

    /* 💬 v2.18.0 今日のお礼LINE（送信リスト・チェックだけ） */
    thanksLine: {
      /* 🔴 `pick`（チップの一覧）を**わざと持たない**。
         持たせると「中身」の見せ方に切り替えられて、**チェックボックスの無いチップ**が出る＝
         このBOXの用が足りなくなる。`pick` が無いBOXは常に `body` で描かれる（`viewOf`）。 */
      title: 'お礼LINE', icon: '💬', jump: null, sizes: ['s', 'm', 'l'],
      body: function (sz) {
        var d = thxDay(), list = thxList(d), left = thxLeft(list);
        if (sz === 's') return kpi(left.length, '件', 'お礼LINE 未送', left.length ? 'o' : 'g');
        var lim = (sz === 'l') ? 14 : 6;
        return lnum(left.length, '件', 'まだ送っていない')
          + thxBar(d)
          + (list.length
              ? '<div class="md-list">' + list.slice(0, lim).map(function (c) { return thxRow(c); }).join('') + '</div>'
                + (list.length > lim ? '<div class="md-more-n">ほか ' + (list.length - lim) + '件</div>' : '')
              : empty('この日のお礼LINEはありません'))
          + thxBackHtml(d, sz);
      }
    },

    /* 📅 v2.21.0 今週の返車予定（暫定だけ・7日カレンダー） */
    returnPlanWeek: {
      /* 🔴 `pick` は持たない＝いつでも `body`（カレンダー）で描く。
         チップの一覧に切り替えられると「どの日か」が消えて、このBOXの用が足りなくなる。 */
      title: '今週の返車予定', icon: '📅', jump: 'return', sizes: ['s', 'm', 'l', 'xl'],
      body: function (sz) {
        if (sz === 's') { var R = rpByDay(); return kpi(R.n, '台', '暫定の返車予定', R.n ? 'o' : 'g'); }
        return rpCalHtml(sz) + (sz === 'l' || sz === 'xl' ? openFoot('return', '返車') : '');
      }
    },

    telwait: {
      title: '完TEL待ち', icon: '📞', jump: 'return', sizes: ['s', 'm', 'l'], dv: 'list',
      pick: pickTelWait,
      head: function (list) { return lnum(list.length, '件', '完了連絡がまだ'); },
      chip: function (c) { return cp(c.id, cpWho(c) + cpN(teamOf(c) === 'import' ? '輸入' : '国産')); },
      none: '完了連絡はぜんぶ済み', unit: '件',
      body: function (sz) {
        var list = pickTelWait();
        if (sz === 's') return kpi(list.length, '件', '完了連絡がまだ', list.length ? 'o' : 'g');
        if (!list.length) return empty('完TEL待ちはありません');
        return '<div class="md-list">' + list.slice(0, sz === 'l' ? 12 : 6).map(function (c) { return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), (teamOf(c) === 'import' ? '輸入' : '国産'), 'tag'); }).join('') + '</div>' + (sz === 'l' ? openFoot('return', '返車') : '');
      },
      more: function () { return openFoot('return', '返車の未定', 'tbd'); }
    },

    returnwait: {
      title: '返車待ち', icon: '🔔', jump: 'return', sizes: ['s', 'm', 'l'], dv: 'list',
      pick: pickReturnWait,
      head: function (list) { return lnum(list.length, '件', '完TEL済・返車待ち'); },
      chip: function (c) { return cp(c.id, cpWho(c) + cpN(c.returnDate ? fmd(c.returnDate) + (c.returnTime ? ' ' + c.returnTime : '') : '日未定'), c.returnDate === C.tStr); },
      none: '返車待ちはありません', unit: '件',
      body: function (sz) {
        var list = pickReturnWait();
        if (sz === 's') return kpi(list.length, '件', '完TEL済・返車待ち', 'o');
        if (!list.length) return empty('返車待ちはありません');
        return '<div class="md-list">' + list.slice(0, sz === 'l' ? 12 : 6).map(function (c) { return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), esc(c.returnDate ? (window.fmtMD ? fmtMD(c.returnDate) : c.returnDate) : '日未定'), 'tag'); }).join('') + '</div>' + (sz === 'l' ? openFoot('return', '返車') : '');
      },
      more: function () { return openFoot('return', '返車'); }
    },

    pay: {
      title: '入金待ち（売掛）', icon: '💰', jump: 'return', sizes: ['s', 'm', 'l'], dv: 'list',
      pick: pickPay,
      head: function (list) { var sum = list.reduce(function (a, c) { return a + amt(c); }, 0); return lnum(list.length, '件', man(sum) + ' 未回収'); },
      chip: function (c) { var d = daysAgo(c.returnDate); return cp(c.id, cpWho(c) + cpN((d != null ? d + '日前 ' : '') + yen(amt(c)), 'amt'), d != null && d >= 30); },
      none: '入金待ちはありません', unit: '件',
      body: function (sz) {
        var list = pickPay();
        var sum = list.reduce(function (a, c) { return a + amt(c); }, 0);
        if (sz === 's') return kpi(list.length, '件', man(sum) + ' 未回収', list.length ? 'pk' : 'g');
        if (!list.length) return empty('入金待ちはありません');
        return '<div class="md-inline">' + kpi(amtVal(sum), amtUnit(sum), '売掛 ' + list.length + '件', 'pk') + '</div>' +
          '<div class="md-list" style="margin-top:8px">' + list.slice(0, sz === 'l' ? 10 : 4).map(function (c) { return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)) + (c.returnDate ? '（' + (window.fmtMD ? fmtMD(c.returnDate) : c.returnDate) + '返）' : ''), yen(amt(c)), 'amt'); }).join('') + '</div>' + (sz === 'l' ? openFoot('return', '返車') : '');
      },
      more: function () { return openFoot('return', '返車'); }
    },

    /* ===== 返車の未定欄（v1.86.0）＝ 返車ビューの「未定」タブと同じ4つ =====
       完TEL待ち（telwait）と入金待ち（pay）は前からあるので、足したのは日未定・時間未定の2つ。 */
    retDateTbd: {
      title: '返車日未定', icon: '📅', jump: 'return', sizes: ['s', 'm', 'l', 'xl'], dv: 'list',
      pick: pickRetDateTbd,
      head: function (list) { return lnum(list.length, '件', '完TEL済・日にち待ち'); },
      chip: function (c) { return cp(c.id, cpWho(c) + wtChip(c) + cpN(c.amountFinal != null ? yen(c.amountFinal) : '', 'amt')); },
      none: '返車日未定はありません', unit: '件',
      body: function (sz) {
        var list = pickRetDateTbd();
        if (sz === 's') return kpi(list.length, '件', '完TEL済・日にち待ち', list.length ? 'o' : 'g');
        if (!list.length) return empty('返車日未定はありません');
        return '<div class="md-list">' + list.slice(0, sz === 's' ? 5 : 12).map(function (c) {
          return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), c.amountFinal != null ? yen(c.amountFinal) : '金額まだ', 'tag');
        }).join('') + '</div>' + (sz === 'l' ? openFoot('return', '返車の未定', 'tbd') : '');
      },
      more: function () { return openFoot('return', '返車の未定', 'tbd'); }
    },

    retTimeTbd: {
      title: '返車時間未定', icon: '🕒', jump: 'return', sizes: ['s', 'm', 'l', 'xl'], dv: 'list',
      pick: pickRetTimeTbd,
      head: function (list) { return lnum(list.length, '件', '日にち決定・時間待ち'); },
      chip: function (c) { var d = c.returnDateFinal || c.returnDate; return cp(c.id, cpT(fmd(d)) + cpWho(c) + wtChip(c), d === C.tStr); },
      none: '返車時間未定はありません', unit: '件',
      body: function (sz) {
        var list = pickRetTimeTbd();
        if (sz === 's') return kpi(list.length, '件', '日にち決定・時間待ち', list.length ? 'o' : 'g');
        if (!list.length) return empty('返車時間未定はありません');
        return '<div class="md-list">' + list.slice(0, sz === 's' ? 5 : 12).map(function (c) {
          return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), esc(fmd(c.returnDateFinal || c.returnDate) || '—'), 'tag');
        }).join('') + '</div>' + (sz === 'l' ? openFoot('return', '返車の未定', 'tbd') : '');
      },
      more: function () { return openFoot('return', '返車の未定', 'tbd'); }
    },

    /* ===== 予約の未定欄（v1.86.0）＝ 予約ビューの「未定」タブと同じ4つ ===== */
    approval: {
      title: '承認待ち', icon: '✅', jump: 'reserve', sizes: ['s', 'm', 'l', 'xl'], dv: 'list',
      pick: pickApproval,
      head: function (list) { return lnum(list.length, '台', '承認がまだ（枠は埋まっている）'); },
      chip: function (c) { return cp(c.id, cpT(fmd(c.reserveDate)) + cpWho(c) + wtChip(c), true); },
      none: '承認待ちはありません',
      body: function (sz) {
        var list = pickApproval();
        if (sz === 's') return kpi(list.length, '台', '承認がまだ', list.length ? 'r' : 'g');
        if (!list.length) return empty('承認待ちはありません');
        return '<div class="md-list">' + list.slice(0, 12).map(function (c) {
          return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), esc(fmd(c.reserveDate) || '日未定'), 'tag rd');
        }).join('') + '</div>' + (sz === 'l' ? openFoot('reserve', '予約の未定', 'tbd') : '');
      },
      more: function () { return '<div class="md-tiny">承認待ちでも<b>入庫カレンダー・代車の枠は埋まっています</b>。開いて表紙を印刷すると通常の予約になります。</div>' + openFoot('reserve', '予約の未定', 'tbd'); }
    },

    tentative: {
      title: '仮予約', icon: '✏️', jump: 'reserve', sizes: ['s', 'm', 'l', 'xl'], dv: 'list',
      pick: pickTentative,
      head: function (list) { return lnum(list.length, '台', '仮おさえ'); },
      chip: function (c) { return cp(c.id, cpT(fmd(c.reserveDate) || '日未定') + cpWho(c) + wtChip(c)); },
      none: '仮予約はありません',
      body: function (sz) {
        var list = pickTentative();
        if (sz === 's') return kpi(list.length, '台', '仮おさえ', list.length ? 'o' : 'g');
        if (!list.length) return empty('仮予約はありません');
        return '<div class="md-list">' + list.slice(0, 12).map(function (c) {
          return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), esc(fmd(c.reserveDate) || '日未定'), 'tag');
        }).join('') + '</div>' + (sz === 'l' ? openFoot('reserve', '予約の未定', 'tbd') : '');
      },
      more: function () { return openFoot('reserve', '予約の未定', 'tbd'); }
    },

    intakeTbd: {
      title: '入庫日未定', icon: '🅿️', jump: 'reserve', sizes: ['s', 'm', 'l', 'xl'], dv: 'list',
      pick: pickIntakeTbd,
      head: function (list) { return lnum(list.length, '台', 'パーツ待ち・入庫日決まらず'); },
      chip: function (c) { return cp(c.id, cpWho(c) + wtChip(c)); },
      none: '入庫日未定はありません',
      body: function (sz) {
        var list = pickIntakeTbd();
        if (sz === 's') return kpi(list.length, '台', '入庫日が決まらず', list.length ? 'o' : 'g');
        if (!list.length) return empty('入庫日未定はありません');
        return '<div class="md-list">' + list.slice(0, 12).map(function (c) { return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), wtChip(c)); }).join('') + '</div>' + (sz === 'l' ? openFoot('reserve', '予約の未定', 'tbd') : '');
      },
      more: function () { return openFoot('reserve', '予約の未定', 'tbd'); }
    },

    noShow: {
      title: '未入庫', icon: '🚫', jump: 'reserve', sizes: ['s', 'm', 'l', 'xl'], dv: 'list',
      pick: pickNoShow,
      head: function (list) { return lnum(list.length, '台', '来店なし・キャンセル'); },
      chip: function (c) {
        var d = daysAgo(c.cancelledAt);
        return cp(c.id, cpWho(c) + cpN(c.cancelledAt ? fmd(c.cancelledAt) + '取消' + (d != null ? '・あと' + Math.max(0, 30 - d) + '日' : '') : ''));
      },
      none: '未入庫はありません',
      body: function (sz) {
        var list = pickNoShow();
        if (sz === 's') return kpi(list.length, '台', '来店なし・キャンセル', list.length ? 'o' : 'g');
        if (!list.length) return empty('未入庫はありません');
        return '<div class="md-list">' + list.slice(0, 12).map(function (c) {
          return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), esc(c.cancelledAt ? fmd(c.cancelledAt) + ' 取消' : ''), 'tag');
        }).join('') + '</div>' + (sz === 'l' ? openFoot('reserve', '予約の未定', 'tbd') : '');
      },
      more: function () { return '<div class="md-tiny">1ヶ月（30日）たつと自動でキャンセル・アーカイブされます。</div>' + openFoot('reserve', '予約の未定', 'tbd'); }
    },

    maintMonth: {
      title: '今月 上げた', icon: '🔧', jump: null, sizes: ['s', 'm', 'l'],
      body: function (sz) {
        var t = mdTot();
        if (sz === 's') return kpi(t.mC, '台', man(t.mA), 'g');
        var h = '<div class="md-inline">' + kpi(t.mC, '台', '今月の完成', 'g') + kpi(amtVal(t.mA), amtUnit(t.mA), '売上（見込込）', 'b') + '</div>';
        if (sz === 'l' && t.d1 && t.d2) h += '<div class="md-list" style="margin-top:8px">' + rowCard(null, '<i data-ic=car data-ics=16></i> 1課（国産）', t.d1.mC + '台 / ' + man(t.d1.mA), 'tag') + rowCard(null, '<i data-ic=globe data-ics=16></i> 2課（輸入）', t.d2.mC + '台 / ' + man(t.d2.mA), 'tag') + '</div>';
        return h;
      },
      more: function () { var t = mdTot(); return '<div class="md-tiny">今週 上げた ' + t.wC + '台 / ' + man(t.wA) + '　残り ' + t.rC + '台</div>'; }
    },

    maintWeek: {
      title: '今週の生産', icon: '📆', jump: null, sizes: ['s', 'm', 'l'],
      body: function (sz) {
        var t = mdTot();
        if (sz === 's') return kpi(t.wC, '台', '残り ' + t.rC + '台', 'g');
        return '<div class="md-inline">' + kpi(t.wC, '台', '今週 上げた', 'g') + kpi(t.rC, '台', '今週 残り', t.rC > 0 ? 'o' : 'g') + '</div>' +
          '<div class="md-tiny" style="margin-top:6px">上げた ' + man(t.wA) + '／残り ' + man(t.rA) + '</div>';
      },
      more: function () { var t = mdTot(); return '<div class="md-tiny">今月 上げた ' + t.mC + '台 / ' + man(t.mA) + '</div>'; }
    },

    longhold: {
      title: '長期預かり', icon: '⏳', jump: 'work', sizes: ['s', 'm', 'l', 'xl'], dv: 'list',
      pick: pickLongHold,
      head: function (list) { return lnum(list.length, '台', longHoldDays() + '日以上'); },
      chip: function (c) { var d = daysAgo(c.reserveDate), lim = longHoldDays(); return cp(c.id, cpWho(c) + wtChip(c) + cpN(d + '日目'), d >= lim * 2); },
      none: '長期預かりはありません',
      body: function (sz) {
        var lim = longHoldDays();
        var list = pickLongHold();
        if (sz === 's') return kpi(list.length, '台', lim + '日以上', list.length ? 'r' : 'g');
        if (!list.length) return empty(lim + '日以上の長期預かりはありません');
        var lm = sz === 'xl' ? 40 : (sz === 'l' ? 12 : 5);
        return '<div class="md-' + (sz === 'xl' ? 'scroll md-scroll-tall' : 'list') + '">' + list.slice(0, lm).map(function (c) { var d = daysAgo(c.reserveDate); return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), d + '日目', d >= lim * 2 ? 'tag rd' : 'tag'); }).join('') + (list.length > lm ? '<div class="md-more-n">ほか ' + (list.length - lm) + '台</div>' : '') + '</div>';
      },
      more: function () { return openFoot('work', 'Pitリスト'); }
    },

    order: {
      title: '受注残', icon: '💵', jump: null, sizes: ['s', 'm', 'l'],
      pick: pickOrder,
      head: function (list) { var sum = list.reduce(function (a, c) { return a + amt(c); }, 0); return lnum(amtVal(sum), amtUnit(sum), '受注済・未返車 ' + list.length + '台'); },
      chip: function (c) { return cp(c.id, cpWho(c) + cpN(yen(amt(c)), 'amt')); },
      none: '受注残はありません',
      body: function (sz) {
        var list = pickOrder();
        var sum = list.reduce(function (a, c) { return a + amt(c); }, 0);
        if (sz === 's') return kpi(amtVal(sum), amtUnit(sum), '受注済・未返車 ' + list.length + '台', 'b');
        if (!list.length) return empty('受注残はありません');
        return '<div class="md-inline">' + kpi(amtVal(sum), amtUnit(sum), '受注残 ' + list.length + '台', 'b') + '</div>' +
          '<div class="md-list" style="margin-top:8px">' + list.slice(0, sz === 'l' ? 8 : 4).map(function (c) { return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), yen(amt(c)), 'amt'); }).join('') + '</div>';
      },
      more: function () { return ''; }
    },

    shakenPlan: {
      title: '車検予定', icon: '🔎', jump: 'shakencal', sizes: ['s', 'm', 'l', 'xl'], dv: 'list',
      pick: pickShakenPlan,
      head: function () { var s = shakenStat(); return lnum(s.unset, '台', '未設定 ／ 候補 ' + s.cand + '・決定 ' + s.decided); },
      chip: function (c) {
        var k = shakenKind(c), s2 = c.inspSchedule || {};
        var when = k === 'u' ? '日取り未定' : k === 'c' ? '候補あり'
                 : fmd(s2.decided) + (s2.decidedSlot === 'pm' ? ' 午後' : s2.decidedSlot === 'am' ? ' 午前' : '');
        return cp(c.id, cpT(when) + cpWho(c), k === 'u');
      },
      none: '車検の予定はありません',
      body: function (sz) {
        var s = shakenStat();
        if (sz === 's') return kpi(s.decided, '台', '候補 ' + s.cand + '・未設定 ' + s.unset, 'pu');
        var head = '<div class="md-inline">' + kpi(s.decided, '台', '決定', 'g') + kpi(s.cand, '台', '候補', 'o') + kpi(s.unset, '台', '未設定', s.unset ? 'r' : 'g') + '</div>';
        if (sz === 'm') return head;
        var mk = function (title, arr, lim) {
          if (!arr.length) return '';
          return '<div class="md-tiny" style="margin-top:8px">' + title + '</div><div class="md-list">' + arr.slice(0, lim).map(function (c) {
            var s2 = c.inspSchedule || {}; var when = s2.decided ? (window.fmtMD ? fmtMD(s2.decided) : s2.decided) + (s2.decidedSlot === 'pm' ? ' 午後' : s2.decidedSlot === 'am' ? ' 午前' : '') : '候補あり';
            return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), esc(when), 'tag');
          }).join('') + '</div>';
        };
        var lim = sz === 'xl' ? 30 : 6;
        return head + '<div class="' + (sz === 'xl' ? 'md-scroll md-scroll-tall' : '') + '">' + mk('<i data-ic=check data-ics=16></i> 決定済み', s.decidedList, lim) + mk('<i data-ic=clock data-ics=16></i> 行ける日候補', s.candList, lim) + '</div>' + openFoot('shakencal', '車検予定');
      },
      more: function () { return openFoot('shakencal', '車検予定'); }
    },

    shakenLog: {
      title: '車検履歴', icon: '📇', jump: 'shakenlog', sizes: ['s', 'm', 'l', 'xl'],
      body: function (sz) {
        var recs = shakenRecords(); var pre = C.moS.slice(0, 7);
        var mRecs = recs.filter(function (r) { return (r.iso || '').indexOf(pre) === 0; });
        var doneN = mRecs.filter(function (r) { return r.result === 'done'; }).length, reN = mRecs.filter(function (r) { return r.result === 'recheck'; }).length;
        if (sz === 's') return kpi(doneN, '台', '今月 済・再検 ' + reN, 'g');
        if (sz === 'm') return '<div class="md-tiny">直近の車検実績</div><div class="md-list">' + (recs.length ? recs.slice(0, 5).map(function (r) { return rowCard(r.c.id, (window.fmtMD ? fmtMD(r.iso) : r.iso) + ' ' + esc(nm(r.c)), r.result === 'done' ? '済' : '再検', r.result === 'done' ? 'tag gn' : 'tag rd'); }).join('') : empty('履歴はまだありません')) + '</div>';
        if (sz === 'l') {
          var by = {}; mRecs.forEach(function (r) { if (r.result === 'done' && r.staff) by[r.staff] = (by[r.staff] || 0) + 1; });
          var arr = Object.keys(by).map(function (k) { return { n: k, v: by[k] }; }).sort(function (a, b) { return b.v - a.v; });
          return '<div class="md-inline">' + kpi(doneN, '台', '今月 済', 'g') + kpi(reN, '件', '今月 再検', reN ? 'o' : 'g') + '</div>' +
            '<div class="md-tiny" style="margin-top:8px">担当別（今月・済）</div><div class="md-list">' + (arr.length ? arr.map(function (x) { return rowCard(null, esc(x.n), x.v + '台', 'tag'); }).join('') : empty('実績なし')) + '</div>' + openFoot('shakenlog', '車検履歴');
        }
        return '<div class="md-scroll md-scroll-tall">' + (recs.length ? recs.slice(0, 40).map(function (r) { return rowCard(r.c.id, (window.fmtMD ? fmtMD(r.iso) : r.iso) + '　' + esc(nm(r.c)) + ' ' + esc(carOf(r.c)) + (r.staff ? '（' + esc(r.staff) + '）' : ''), r.result === 'done' ? '済' : '再検', r.result === 'done' ? 'tag gn' : 'tag rd'); }).join('') : empty('履歴はまだありません')) + '</div>' + openFoot('shakenlog', '車検履歴');
      },
      more: function () { return openFoot('shakenlog', '車検履歴'); }
    },

    resultMonth: {
      title: '当月実績', icon: '✅', jump: 'result', sizes: ['s', 'm', 'l', 'xl'],
      pick: pickResultMonth,
      head: function (list) { var sum = list.reduce(function (a, c) { return a + amt(c); }, 0); return lnum(list.length, '台', '当月完成 / ' + man(sum)); },
      chip: function (c) { return cp(c.id, cpT(fmd(c.completedAt)) + cpWho(c) + wtChip(c)); },
      none: '当月の実績はまだありません',
      body: function (sz) {
        var list = pickResultMonth();
        var sum = list.reduce(function (a, c) { return a + amt(c); }, 0);
        if (sz === 's') return kpi(list.length, '台', man(sum), 'g');
        if (sz === 'm') { var rec = list.slice().sort(function (a, b) { return (b.completedAt || '').localeCompare(a.completedAt || ''); }); return '<div class="md-inline">' + kpi(list.length, '台', '当月 完成', 'g') + '</div><div class="md-list" style="margin-top:8px">' + (rec.length ? rec.slice(0, 5).map(function (c) { return rowCard(c.id, (window.fmtMD ? fmtMD(c.completedAt) : c.completedAt) + ' ' + esc(nm(c)) + ' ' + esc(carOf(c)), wtChip(c)); }).join('') : empty('当月の実績はまだありません')) + '</div>'; }
        var cells = window._resultMonthCells ? _resultMonthCells(C.y, C.m) : '';
        return '<div class="md-inline">' + kpi(list.length, '台', '当月完成 / ' + man(sum), 'g') + '</div><div class="md-embed' + (sz === 'xl' ? ' md-embed-tall' : '') + '"><div class="reserve-month md-month">' + cells + '</div></div>' + openFoot('result', '実績');
      },
      more: function () { return openFoot('result', '実績'); }
    },

    loaner: {
      title: '代車', icon: '🚙', jump: 'loaner', sizes: ['s', 'm', 'l', 'xl'],
      body: function (sz) {
        var st = loanerStat(C.tStr);
        var ef = window.dashLoanerEarliestFree ? dashLoanerEarliestFree(C.today) : null;
        var efStr = ef ? (ymd(ef) === C.tStr ? '今日' : (ef.getMonth() + 1) + '/' + ef.getDate()) : 'なし';
        if (sz === 's') return kpi(st.free, '台', '空き／稼働 ' + st.busy + '・全' + st.total + '台', st.free > 0 ? 'g' : 'r');
        if (sz === 'm') return '<div class="md-inline">' + kpi(st.free, '台', '空き／全' + st.total + '台', st.free > 0 ? 'g' : 'r') + kpi(efStr, '', '最短空き', 'b') + '</div>';
        var days = sz === 'xl' ? 21 : 14;
        var head = '<div class="md-lg-row md-lg-head"><span class="md-lg-name"></span>';
        for (var i = 0; i < days; i++) { var d = addDays(C.today, i); head += '<span class="md-lg-c md-lg-hc">' + (d.getMonth() + 1) + '/' + d.getDate() + '</span>'; }
        head += '</div>';
        var rows = st.loaners.map(function (l) { var r = '<div class="md-lg-row"><span class="md-lg-name">' + esc(l.name) + '<small>' + esc(l.model || '') + '</small></span>'; for (var i = 0; i < days; i++) { var ds = ymd(addDays(C.today, i)); r += '<span class="md-lg-c' + (st.busyFn(l, ds) ? ' busy' : ' free') + '"></span>'; } return r + '</div>'; }).join('');
        return '<div class="md-inline">' + kpi(st.free, '台', '空き／全' + st.total + '台 ・ 最短空き ' + efStr, st.free > 0 ? 'g' : 'r') + '</div><div class="md-cal-scroll md-lg"><div class="md-lg-grid">' + head + rows + '</div></div>' + openFoot('loaner', '代車カレンダー');
      },
      more: function () { return openFoot('loaner', '代車カレンダー'); }
    },

    sales: {
      title: '売上サマリー', icon: '💴', jump: 'sales', sizes: ['s', 'm', 'l', 'xl'],
      body: function (sz) {
        var act = C.cards.filter(function (c) { if (c.status !== 'returned') return false; var rd = mdCountDate(c); return rd >= C.moS && rd <= C.moE; });
        var sum = act.reduce(function (a, c) { return a + amt(c); }, 0);
        var tg = (state.settings && state.settings.target) || { monthMin: 15000000 };
        var pct = tg.monthMin ? Math.round(sum / tg.monthMin * 100) : 0;
        if (sz === 's') return kpi(amtVal(sum), amtUnit(sum), '当月実績 ' + act.length + '台', 'g');
        var col = pct >= 100 ? 'var(--green,#1db97a)' : pct >= 75 ? '#eab308' : '#f97316';
        var head = '<div class="md-inline">' + kpi(amtVal(sum), amtUnit(sum), '当月実績', 'g') + kpi(pct, '%', '目標達成', pct >= 100 ? 'g' : 'o') + '</div>' +
          '<div class="md-bar"><i style="width:' + Math.min(100, pct) + '%;background:' + col + '"></i></div><div class="md-tiny">最低目標 ' + man(tg.monthMin) + ' に対して ' + pct + '%（' + act.length + '台）</div>';
        if (sz === 'm') return head;
        var groups = [{ k: 'shaken', n: '車検' }, { k: '12pt', n: '12点' }, { k: 'general', n: '一般' }, { k: 'oil', n: 'オイル' }, { k: 'bp', n: 'B.P' }];
        var gmap = {}; groups.forEach(function (g) { gmap[g.k] = { n: g.n, c: 0, a: 0 }; });
        var other = { n: 'その他', c: 0, a: 0 };
        act.forEach(function (c) { var w = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes[0] : c.workType; var g = gmap[w] || other; g.c++; g.a += amt(c); });
        var all = groups.map(function (g) { return gmap[g.k]; }).concat([other]).filter(function (g) { return g.c; });
        var rowsH = all.map(function (g) { return '<tr><td class="t">' + esc(g.n) + '</td><td>' + g.c + '台</td><td class="amt">' + yen(g.a) + '</td><td>' + yen(g.c ? Math.round(g.a / g.c) : 0) + '</td></tr>'; }).join('');
        return head + '<div class="md-embed' + (sz === 'xl' ? ' md-embed-tall' : '') + '"><table class="md-tbl"><tr><th>作業</th><th>台数</th><th>売上</th><th>平均単価</th></tr>' + (rowsH || '<tr><td colspan="4">当月実績なし</td></tr>') + '</table></div>' + openFoot('sales', '売上');
      },
      more: function () { return openFoot('sales', '売上'); }
    },

    carsales: {
      title: '車販作業', icon: '🧽', jump: 'carsales', sizes: ['s', 'm', 'l'],
      body: function (sz) {
        var s = csStat();
        if (sz === 's') return kpi(s.washToday.length, '台', '今日の洗車', s.washToday.length ? 'o' : 'g');
        return '<div class="md-grid2">' + miniStat('<i data-ic=sun data-ics=16></i> 今日 洗車', s.washToday.length) + miniStat('<i data-ic=moon data-ics=16></i> 明日 洗車', s.washTomorrow.length) + miniStat('<i data-ic=calendar data-ics=16></i> 今週 洗車', s.washWeek.length) + miniStat('<i data-ic=bulb data-ics=16></i> ヘッドライト', s.headlight.length) + miniStat('<i data-ic=sparkle data-ics=16></i> コーティング', s.coatReq.length) + miniStat('<i data-ic=pencil data-ics=16></i> その他依頼', s.salesReq.length) + '</div>' + (sz === 'l' ? openFoot('carsales', '車販作業') : '');
      },
      more: function () { return openFoot('carsales', '車販作業'); }
    },

    course: {
      title: '課別タスク', icon: '📋', jump: 'course1', sizes: ['s', 'm', 'l'],
      body: function (sz) {
        var STAT = [{ k: 'check', i: '<i data-ic=search data-ics=16></i>' }, { k: 'estim', i: '<i data-ic=calculator data-ics=16></i>' }, { k: 'contact', i: '<i data-ic=phone data-ics=16></i>' }, { k: 'parts', i: '<i data-ic=box data-ics=16></i>' }, { k: 'work', i: '<i data-ic=wrench data-ics=16></i>' }];
        var cnt = function (board) { var o = {}; STAT.forEach(function (s) { o[s.k] = 0; }); C.cards.forEach(function (c) { if (c.boardId === board && !c.returnStage && o[c.status] != null) o[c.status]++; }); o._t = STAT.reduce(function (a, s) { return a + o[s.k]; }, 0); return o; };
        var d1 = cnt('default'), d2 = cnt('import');
        if (sz === 's') return kpi(d1._t + d2._t, '台', '作業中（両課）', 'b');
        var line = function (label, o, view) { return '<div class="md-course md-int" onclick="event.stopPropagation();mydGo(\'' + view + '\')"><span class="md-course-n">' + label + '</span>' + STAT.map(function (s) { return '<span class="md-course-c" title="' + TASK_LABEL[s.k] + '">' + s.i + '<b>' + o[s.k] + '</b></span>'; }).join('') + '</div>'; };
        return line('<i data-ic=car data-ics=16></i> 1課', d1, 'course1') + line('<i data-ic=globe data-ics=16></i> 2課', d2, 'course2');
      },
      more: function () { return ''; }
    },

    // ===== 個人（担当者）フォーカス =====
    p_reserve: {
      title: '予約一覧', icon: '📅', person: true, sizes: ['s', 'm', 'l'], dv: 'list',
      pick: pickPReserve,
      head: function (list) { return lnum(list.length, '件', '直近の担当予約'); },
      chip: function (c) { return cp(c.id, cpT(fmd(c.reserveDate) + (c.reserveTime ? ' ' + c.reserveTime : '')) + cpWho(c) + wtChip(c), c.reserveDate === C.tStr); },
      none: '担当の予約はありません', unit: '件',
      body: function (sz, item) {
        var list = pickPReserve(item);
        if (sz === 's') return kpi(list.length, '件', '直近の担当予約', 'b');
        if (!list.length) return empty('担当の予約はありません');
        return '<div class="md-list">' + list.slice(0, sz === 'l' ? 12 : 6).map(function (c) { return rowCard(c.id, esc((window.fmtMD ? fmtMD(c.reserveDate) : c.reserveDate)) + (c.reserveTime ? ' ' + esc(c.reserveTime) : '') + '　' + esc(nm(c)) + ' ' + esc(carOf(c)), wtChip(c)); }).join('') + '</div>';
      }, more: function () { return openFoot('reserve', '予約'); }
    },
    p_task: {
      title: 'タスク', icon: '📋', person: true, sizes: ['s', 'm', 'l'], dv: 'list',
      pick: pickPTask,
      head: function (list) { return lnum(list.length, '件', '自分のタスク'); },
      chip: function (c) { return cp(c.id, cpWho(c) + cpN(TASK_LABEL[c.status] || c.status)); },
      none: 'アクティブなタスクはありません', unit: '件',
      body: function (sz, item) {
        var list = pickPTask(item);
        if (sz === 's') return kpi(list.length, '件', '自分のタスク', list.length ? 'o' : 'g');
        var by = {}; TASK_ACTIVE.forEach(function (k) { by[k] = 0; }); list.forEach(function (c) { by[c.status]++; });
        var chips = '<div class="md-taskbar">' + TASK_ACTIVE.map(function (k) { return '<span class="md-tk"><b>' + by[k] + '</b>' + TASK_LABEL[k] + '</span>'; }).join('') + '</div>';
        if (sz === 'm') return chips;
        if (!list.length) return chips + empty('アクティブなタスクはありません');
        var sorted = list.slice().sort(function (a, b) { return TASK_ACTIVE.indexOf(a.status) - TASK_ACTIVE.indexOf(b.status); });
        return chips + '<div class="md-list" style="margin-top:8px">' + sorted.slice(0, 12).map(function (c) { return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), TASK_LABEL[c.status] || c.status, 'tag'); }).join('') + '</div>';
      }, more: function (sz, item) { return openFoot(teamHintView(item), 'タスクボード'); }
    },
    p_return: {
      title: '返車予定', icon: '📤', person: true, sizes: ['s', 'm', 'l'], dv: 'list',
      pick: pickPReturn,
      head: function (list) { return lnum(list.length, '件', '担当の返車予定'); },
      chip: function (c) { var d = mdRetDate(c); return cp(c.id, cpT(fmd(d) + (c.returnTime ? ' ' + c.returnTime : '')) + cpWho(c) + wtChip(c), d === C.tStr); },
      none: '担当の返車予定はありません', unit: '件',
      body: function (sz, item) {
        var list = pickPReturn(item);
        if (sz === 's') return kpi(list.length, '件', '担当の返車予定', 'b');
        if (!list.length) return empty('担当の返車予定はありません');
        return '<div class="md-list">' + list.slice(0, sz === 'l' ? 12 : 6).map(function (c) { return rowCard(c.id, esc((window.fmtMD ? fmtMD(c.returnDate) : c.returnDate)) + (c.returnTime ? ' ' + esc(c.returnTime) : '') + '　' + esc(nm(c)) + ' ' + esc(carOf(c)), wtChip(c)); }).join('') + '</div>';
      }, more: function () { return openFoot('return', '返車'); }
    },
    p_resstaff: {
      title: '予約担当 直近10件', icon: '📞', person: true, sizes: ['s', 'm', 'l'], dv: 'list',
      pick: pickPResStaff,
      head: function (list) { return lnum(list.length, '件', '受付した直近'); },
      chip: function (c) { return cp(c.id, cpT(fmd(c.bookedAt) + ' 受付') + cpWho(c) + wtChip(c)); },
      none: '予約担当の履歴はありません', unit: '件',
      body: function (sz, item) {
        var list = pickPResStaff(item);
        if (sz === 's') return kpi(list.length, '件', '受付した直近', 'pu');
        if (!list.length) return empty('予約担当の履歴はありません');
        return '<div class="md-list">' + list.map(function (c) { return rowCard(c.id, esc((window.fmtMD ? fmtMD(c.bookedAt) : c.bookedAt)) + '受付　' + esc(nm(c)) + ' ' + esc(carOf(c)), wtChip(c)); }).join('') + '</div>';
      }, more: function () { return openFoot('reserve', '予約'); }
    },
    p_sales: {
      title: '売上', icon: '💴', person: true, sizes: ['s', 'm', 'l'], dv: 'num',
      pick: pickPSales,
      head: function (list) { var sum = list.reduce(function (a, c) { return a + amt(c); }, 0); return lnum(amtVal(sum), amtUnit(sum), '当月 ' + list.length + '台'); },
      chip: function (c) { return cp(c.id, cpWho(c) + cpN(yen(amt(c)), 'amt')); },
      none: '当月の担当実績はありません',
      body: function (sz, item) {
        var list = pickPSales(item);
        var sum = list.reduce(function (a, c) { return a + amt(c); }, 0);
        if (sz === 's') return kpi(amtVal(sum), amtUnit(sum), '当月 ' + list.length + '台', 'g');
        var head = '<div class="md-inline">' + kpi(amtVal(sum), amtUnit(sum), '当月実績', 'g') + kpi(list.length, '台', '担当台数', 'b') + '</div>';
        if (sz === 'm') return head;
        var rec = list.slice().sort(function (a, b) { return amt(b) - amt(a); });
        return head + '<div class="md-list" style="margin-top:8px">' + (rec.length ? rec.slice(0, 10).map(function (c) { return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), yen(amt(c)), 'amt'); }).join('') : empty('当月の担当実績はありません')) + '</div>';
      }, more: function () { return openFoot('sales', '売上'); }
    }
  };
  function teamHintView(item) { return 'course1'; }

  var SZL = { s: '小', m: '中', l: '大', xl: '特大' };
  /* 🔴 v1.85.0 見せ方（BOXごと）。保存は layout の item.v。
     ⚠ v が無いBOXは **その種類の既定（def.dv）** で出す＝前からある人の画面が壊れない。
        既定は「読んだ瞬間に誰へ何をするかが決まるもの＝中身」「量や進み具合が主役＝数字」で振ってある。 */
  var VWL = { num: '数字', list: '中身', both: '両方' };
  function viewOf(it, def) {
    if (!def || !def.pick) return 'num';                 /* 中身を持たないBOXは数字だけ */
    var v = it && it.v;
    if (v === 'num' || v === 'list' || v === 'both') return v;
    return def.dv === 'list' ? 'list' : 'num';
  }

  // ---- ショートカット先 ----
  var SHORTCUTS = [
    { view: 'today', label: '当日', icon: '🌅' },
    { view: 'reserve', range: 'day', label: '予約(当日)', icon: '📅' },
    { view: 'reserve', range: 'week', label: '予約(週)', icon: '📅' },
    { view: 'reserve', range: 'month', label: '予約(月)', icon: '📅' },
    { view: 'reserve', range: '2month', label: '予約(2ヶ月)', icon: '📅' },
    { view: 'reserve', range: 'tbd', label: '予約(未定)', icon: '📅' },
    { view: 'return', range: 'tbd', label: '返車(未定)', icon: '📤' },
    { view: 'return', range: 'day', label: '返車(当日)', icon: '📤' },
    { view: 'return', range: 'week', label: '返車(週)', icon: '📤' },
    { view: 'return', range: 'month', label: '返車(月)', icon: '📤' },
    { view: 'availcal', label: '空きカレンダー', icon: '🗓️' },
    { view: 'carsales', label: '車販作業', icon: '🧽' },
    { view: 'loaner', label: '代車カレンダー', icon: '🚙' },
    { view: 'parking', label: '駐車場', icon: '🅿️' },
    { view: 'fleet', label: '車両管理', icon: '🚐' },
    { view: 'shakencal', label: '車検予定', icon: '🔎' },
    { view: 'shakenlog', label: '車検履歴', icon: '📇' },
    { view: 'course1', label: '1課', icon: '1️⃣' },
    { view: 'course2', label: '2課', icon: '2️⃣' },
    { view: 'work', label: 'Pitリスト', icon: '🏭' },
    { view: 'outsource', label: '外注', icon: '🤝' },
    { view: 'result', label: '実績', icon: '✅' },
    { view: 'sales', label: '売上', icon: '💴' },
    { view: 'customers', label: '顧客', icon: '👤' },
    { view: 'settings', label: '設定', icon: '⚙️' }
  ];

  // ナビ（レンジ付き）
  window.mydGo = function (view, range) {
    if (view === 'reserve' && range) state.reserveRange = range;
    if (view === 'return' && range) state.returnRange = range;
    if (window.showView) showView(view);
    if (range) setTimeout(function () {
      var mode = view === 'reserve' ? 'reserve' : (view === 'return' ? 'return' : null); if (!mode) return;
      document.querySelectorAll('.range-tabs[data-mode="' + mode + '"] button').forEach(function (b) { b.classList.toggle('active', b.dataset.range === range); });
    }, 0);
  };

  // ---------------------------------------------------------
  // プリセット・レイアウト（アカウント統一）
  // ---------------------------------------------------------
  function T(name) { return TEMPLATES[name] ? TEMPLATES[name]() : []; }
  var TEMPLATES = {
    '全体用': function () { return [{ e: 'earliest', s: 'l' }, { e: 'hold', s: 's' }, { e: 'park', s: 's' }, { e: 'intake', s: 's' }, { e: 'returnout', s: 's' }, { e: 'telwait', s: 's' }, { e: 'returnwait', s: 's' }, { e: 'maintWeek', s: 'm' }, { e: 'shakenPlan', s: 'm' }, { e: 'sales', s: 'm' }, { e: 'order', s: 'm' }, { e: 'resultMonth', s: 'l' }]; },
    '代車特化型': function () { return [{ e: 'loaner', s: 'xl' }, { e: 'earliest', s: 'l' }, { e: 'park', s: 's' }, { e: 'hold', s: 's' }, { e: 'sc', s: 's', view: 'loaner', label: '代車カレンダー', icon: '🚙' }, { e: 'sc', s: 's', view: 'availcal', label: '空きカレンダー', icon: '🗓️' }, { e: 'sc', s: 's', view: 'fleet', label: '車両管理', icon: '🚐' }]; },
    '受付用': function () { return [{ e: 'intake', s: 'm' }, { e: 'returnout', s: 'm' }, { e: 'telwait', s: 's' }, { e: 'returnwait', s: 's' }, { e: 'pay', s: 's' }, { e: 'earliest', s: 'l' }, { e: 'p_resstaff', s: 'm', p: 'me' }, { e: 'sc', s: 's', view: 'reserve', range: '2month', label: '予約(2ヶ月)', icon: '📅' }, { e: 'sc', s: 's', view: 'return', range: 'tbd', label: '返車(未定)', icon: '📤' }]; },
    '整備士用': function () { return [{ e: 'p_task', s: 'l', p: 'me' }, { e: 'longhold', s: 'm' }, { e: 'maintWeek', s: 'm' }, { e: 'shakenPlan', s: 'm' }, { e: 'course', s: 'm' }, { e: 'sc', s: 's', view: 'course1', label: '1課', icon: '1️⃣' }, { e: 'sc', s: 's', view: 'course2', label: '2課', icon: '2️⃣' }, { e: 'sc', s: 's', view: 'work', label: 'Pitリスト', icon: '🏭' }]; },
    'フロント用': function () { return [{ e: 'p_reserve', s: 'm', p: 'me' }, { e: 'p_return', s: 'm', p: 'me' }, { e: 'p_task', s: 'm', p: 'me' }, { e: 'telwait', s: 's' }, { e: 'returnwait', s: 's' }, { e: 'sales', s: 's' }, { e: 'p_resstaff', s: 'm', p: 'me' }]; },
    /* 🆕 v1.86.0 未定の取りこぼしを見る用（ゆうた依頼）。返車の未定4つ＋予約の未定4つ。 */
    '未定チェック用': function () {
      return [{ e: 'approval', s: 'm' }, { e: 'tentative', s: 'm' }, { e: 'intakeTbd', s: 'm' }, { e: 'noShow', s: 'm' },
              { e: 'telwait', s: 'm' }, { e: 'retDateTbd', s: 'm' }, { e: 'retTimeTbd', s: 'm' }, { e: 'pay', s: 'm' },
              { e: 'sc', s: 's', view: 'reserve', range: 'tbd', label: '予約(未定)', icon: '📅' },
              { e: 'sc', s: 's', view: 'return', range: 'tbd', label: '返車(未定)', icon: '📤' }];
    }
  };
  var TEMPLATE_NAMES = ['全体用', '代車特化型', '受付用', '整備士用', 'フロント用', '未定チェック用'];

  function md() {
    if (!state.settings) state.settings = {};
    var m = state.settings.myDash;
    if (!m || typeof m !== 'object') m = {};
    if (Array.isArray(m.layout) && !m.presets) { m = { v: 2, active: 0, presets: [{ name: 'マイビュー', layout: m.layout }] }; }
    if (!Array.isArray(m.presets) || !m.presets.length) { m = { v: 2, active: 0, presets: [{ name: '全体用', layout: T('全体用') }] }; }
    if (typeof m.active !== 'number' || m.active < 0 || m.active >= m.presets.length) m.active = 0;
    m.presets.forEach(function (p) { if (!p.layout) p.layout = []; if (!p.name) p.name = 'マイビュー'; });
    state.settings.myDash = m; return m;
  }
  function curLayout() { var m = md(); return (m.presets[m.active].layout || []).filter(function (it) { return it && (it.e === 'sc' || EL[it.e]); }); }
  function setCurLayout(arr) { var m = md(); m.presets[m.active].layout = arr; }
  function save(msg) { if (window.PitDB && PitDB.save) PitDB.save(true); if (msg) toast(msg); }

  // ---------------------------------------------------------
  // 描画
  // ---------------------------------------------------------
  function renderMyDash() {
    var host = $('view-mydash-body'); if (!host) return;
    buildCtx();
    if (!$('mydash-pinned')) {
      host.innerHTML =
        '<div id="mydash-pinned">' +
        '<div id="mydash-search-wrap"class="md-search"><input id="mydash-search-input"type="search"autocomplete="off"placeholder="検索（顧客・名前・車・ナンバー・予約番号・代車・日付…）"onfocus="pitSearchBind(\'mydash-search-wrap\',\'mydash-search-input\',\'mydash-search-results\')"oninput="pitSearchSoon(this.value,event)"><div id="mydash-search-results"class="pit-search-results"></div></div>'+
        '  <div id="mydash-notes-area"></div>' +
        '</div>' +
        '<div class="md-flow" id="mydash-flow"></div>' +
        '<div class="myd-fabbar">' +
        '  <button class="myd-fab primary" onclick="mydOpenPalette()">＋ ボックス</button>' +
        '  <button class="myd-fab" id="myd-edit-fab" onclick="mydToggleEdit()"><i data-ic=sliders data-ics=16></i> カスタマイズ</button>' +
        '  <button class="myd-fab" onclick="mydOpenPresets()"><i data-ic=settings data-ics=16></i> プリセット</button>' +
        '</div>';
      bindFlow();
    }
    window.PIT_BN_TARGET = 'mydash-notes-area';
    if (window.renderBoardNotes) renderBoardNotes();
    renderPresets();
    renderFlow();
  }
  window.renderMyDash = renderMyDash;

  function renderPresets() {
    var host = $('myd-presets'); if (!host) return;
    var m = md();
    host.innerHTML = m.presets.map(function (p, i) { return '<span class="myd-chip' + (i === m.active ? ' on' : '') + '" onclick="mydSwitchPreset(' + i + ')" title="' + esc(p.name) + '">' + esc(p.name) + '</span>'; }).join('');
  }

  function boxDef(it) {
    if (it.e === 'sc') return { title: it.label || 'ショートカット', icon: it.icon || '<i data-ic=link data-ics=16></i>', sizes: ['s', 'm'], shortcut: true };
    return EL[it.e];
  }

  function renderFlow() {
    var flow = $('mydash-flow'); if (!flow) return;
    var layout = curLayout();
    if (!layout.length) { flow.innerHTML = '<div class="md-empty" style="padding:30px;text-align:center">BOXがありません。右下の「＋ ボックス」から追加してください。</div>'; return; }
    flow.innerHTML = layout.map(function (it, idx) {
      var def = boxDef(it); if (!def) return '';
      var title = def.person ? (targetLabel(it) + ' ' + def.title) : def.title;
      var noexp = def.noexp || def.shortcut || it.s === 'xl';
      var tools = '';
      if (def.shortcut) {
        tools = '<span class="md-tools">' + sizeChips(it, def, idx) + moveTools(idx) + '</span>';
      } else {
        tools = '<span class="md-tools">' + sizeChips(it, def, idx) + viewChips(it, def, idx) + (def.person ? '<span class="md-tbtn" title="対象を選ぶ" onclick="mydPickTarget(event,' + idx + ')"><i data-ic=user data-ics=16></i></span>' : '') + moveTools(idx) + '</span>';
      }
      var bodyHtml, moreHtml = '';
      if (def.shortcut) {
        bodyHtml = '<div class="md-sc md-int" onclick="event.stopPropagation();mydGo(\'' + it.view + '\'' + (it.range ? ",'" + it.range + "'" : '') + ')"><span class="md-sc-ic">' + icoE(it.icon || '🔗') + '</span><span class="md-sc-l">' + esc(it.label || '') + '</span><span class="md-sc-go">開く →</span></div>';
      } else {
        /* 🔴 v1.85.0 見せ方は3つ。数字／中身（チップ）／両方。
           ⚠ 「両方」の数字は **必ず小サイズの形（kpi）** を使うこと。
              大きいサイズの body は中に一覧を持っていることがあり、そのまま出すと中身が二重になる。 */
        var vw = viewOf(it, def);
        if (vw === 'list') bodyHtml = safe(listBody, def, it.s, it);
        else if (vw === 'both') bodyHtml = safe(def.body, 's', it) + '<div class="md-bothsep"></div>' + safe(listBody, def, it.s, it);
        else bodyHtml = safe(def.body, it.s, it);
        /* 押して開いたとき＝1段濃くする（数字→細／中身→中）。中身を持たないBOXは今までどおり */
        if (!noexp) {
          var deep = '';
          if (def.pick) {
            var n = listOf(def, it).length;
            deep = (vw === 'num')
              /* 数字BOX → 細（チップ）。⚠ 数字は上に出ているので head は付けない */
              ? '<div class="md-deep-t">中身（' + n + (def.unit || '台') + '）</div>' + chipsOf(listOf(def, it), 'l', def.chip, def.none, def.unit)
              /* 中身BOX → 中（盤面と同じカード） */
              : '<div class="md-deep-t">カードで見る（' + n + (def.unit || '台') + '）</div>' + cardsBody(def, it.s, it);
          }
          moreHtml = '<div class="md-more">' + deep + safe(def.more, it.s, it) + '</div>';
        }
      }
      return '<section class="md-box md-' + it.s + (noexp ? ' md-noexp' : '') + (def.shortcut ? ' md-scbox' : '') + '" data-idx="' + idx + '" draggable="true">' +
        '<div class="md-bh"><span class="md-grip"><i data-ic=grip data-ics=16></i></span><span class="md-ic">' + icoE(def.icon) + '</span><h3>' + esc(title) + '</h3>' +
        (noexp ? '' : '<span class="md-caret"><i data-ic=chevDown data-ics=15></i></span>') + tools + '</div>' +
        '<div class="md-body">' + bodyHtml + '</div>' + moreHtml + '</section>';
    }).join('');
    bindDrag();
  }
  function sizeChips(it, def, idx) {
    return ['s', 'm', 'l', 'xl'].map(function (sz) { var ok = def.sizes.indexOf(sz) >= 0; return '<span class="md-szchip' + (ok ? '' : ' na') + (it.s === sz ? ' on' : '') + '"' + (ok ? ' onclick="mydResize(event,' + idx + ',\'' + sz + '\')"' : '') + '>' + SZL[sz] + '</span>'; }).join('');
  }
  /* 見せ方の切替チップ（カスタマイズ中だけ見える。サイズチップのすぐ右） */
  function viewChips(it, def, idx) {
    if (!def.pick) return '';                            /* 中身を持たないBOXには出さない */
    var cur = viewOf(it, def);
    return '<span class="md-vwsep"></span>' + ['num', 'list', 'both'].map(function (v) {
      return '<span class="md-vwchip' + (cur === v ? ' on' : '') + '" onclick="mydSetView(event,' + idx + ',\'' + v + '\')">' + VWL[v] + '</span>';
    }).join('');
  }
  function moveTools(idx) { return '<span class="md-tbtn" onclick="mydMove(event,' + idx + ',-1)">↑</span><span class="md-tbtn" onclick="mydMove(event,' + idx + ',1)">↓</span><span class="md-tbtn del" onclick="mydRemove(event,' + idx + ')"><i data-ic=close data-ics=16></i></span>'; }
  function safe(fn) {
    var a = [].slice.call(arguments, 1);
    try { return fn ? fn.apply(null, a) : ''; } catch (e) { console.error('[mydash] render error', e); return '<div class="md-empty">表示エラー</div>'; }
  }

  // ---------------------------------------------------------
  // 挙動
  // ---------------------------------------------------------
  function bindFlow() {
    var flow = $('mydash-flow');
    flow.addEventListener('click', function (e) {
      if (document.body.classList.contains('md-edit')) return;
      if (e.target.closest('.md-tools, .md-int, a, button')) return;
      var box = e.target.closest('.md-box'); if (!box) return;
      if (box.classList.contains('md-noexp')) return;
      if (box.classList.contains('md-exp')) box.classList.remove('md-exp'); else { collapseAll(); box.classList.add('md-exp'); }
    });
    document.addEventListener('click', function (e) {
      if (document.body.classList.contains('md-edit')) return;
      if (!e.target.closest('#mydash-flow') && !e.target.closest('.md-pal') && !e.target.closest('.myd-modal')) collapseAll();
    });
  }
  function collapseAll() { document.querySelectorAll('.md-box.md-exp').forEach(function (b) { b.classList.remove('md-exp'); }); }

  window.mydSetMe = function (id) { try { localStorage.setItem('pitflow_bn_me', id || ''); } catch (e) {} window.PIT_BN_TARGET = 'mydash-notes-area'; if (window.renderBoardNotes) renderBoardNotes(); renderFlow(); };
  window.mydRefresh = function () { renderMyDash(); };
  window.mydToggleEdit = function () { var on = document.body.classList.toggle('md-edit'); var f = $('myd-edit-fab'); if (f) f.classList.toggle('on', on); collapseAll(); if (!on) save('配置を保存しました'); };
  window.mydResize = function (e, idx, sz) { if (e) e.stopPropagation(); var l = curLayout(); if (!l[idx]) return; var def = boxDef(l[idx]); if (def.sizes.indexOf(sz) < 0) return; l[idx].s = sz; setCurLayout(l); renderFlow(); save(); };
  window.mydSetView = function (e, idx, v) {
    if (e) e.stopPropagation();
    var l = curLayout(); if (!l[idx]) return;
    var def = boxDef(l[idx]); if (!def || !def.pick) return;
    if (v !== 'num' && v !== 'list' && v !== 'both') return;
    l[idx].v = v; setCurLayout(l); renderFlow(); save();
  };
  window.mydMove = function (e, idx, dir) { if (e) e.stopPropagation(); var l = curLayout(); var j = idx + dir; if (j < 0 || j >= l.length) return; var t = l[idx]; l[idx] = l[j]; l[j] = t; setCurLayout(l); renderFlow(); save(); };
  window.mydRemove = function (e, idx) { if (e) e.stopPropagation(); var l = curLayout(); l.splice(idx, 1); setCurLayout(l); renderFlow(); save(); };

  var dragIdx = null;
  function bindDrag() {
    document.querySelectorAll('#mydash-flow .md-box').forEach(function (el) {
      el.addEventListener('dragstart', function (e) { if (!document.body.classList.contains('md-edit')) { e.preventDefault(); return; } dragIdx = +el.dataset.idx; e.dataTransfer.effectAllowed = 'move'; });
      el.addEventListener('dragover', function (e) { if (dragIdx == null) return; e.preventDefault(); el.classList.add('md-dragover'); });
      el.addEventListener('dragleave', function () { el.classList.remove('md-dragover'); });
      el.addEventListener('drop', function (e) { e.preventDefault(); el.classList.remove('md-dragover'); var to = +el.dataset.idx; if (dragIdx == null || dragIdx === to) return; var l = curLayout(); var mv = l.splice(dragIdx, 1)[0]; l.splice(to, 0, mv); dragIdx = null; setCurLayout(l); renderFlow(); save(); });
      el.addEventListener('dragend', function () { dragIdx = null; document.querySelectorAll('.md-box').forEach(function (b) { b.classList.remove('md-dragover'); }); });
    });
  }

  // ---- パレット（追加） ----
  window.mydOpenPalette = function () {
    var b = $('myd-pal-body');
    var dataEls = Object.keys(EL).filter(function (k) { return !EL[k].person; });
    var personEls = Object.keys(EL).filter(function (k) { return EL[k].person; });
    var dataSec = '<div class="md-pal-sec"><i data-ic=chart data-ics=16></i> 状況・数値</div>' + dataEls.map(function (k) {
      var d = EL[k];
      var chips = ['s', 'm', 'l', 'xl'].map(function (sz) { var ok = d.sizes.indexOf(sz) >= 0; return '<span class="md-szchip' + (ok ? '' : ' na') + '"' + (ok ? ' onclick="mydAdd(\'' + k + '\',\'' + sz + '\')"' : '') + '>' + SZL[sz] + '</span>'; }).join('');
      return '<div class="md-pe"><span class="md-pe-ic">' + icoE(d.icon) + '</span><span class="md-pe-n">' + esc(d.title) + '</span><span class="md-pe-sz">' + chips + '</span></div>';
    }).join('');
    // 個人BOX＝「誰のBOXを作るか」をここで選んでから追加（例：自分の売上／斎藤の売上）
    var opts = '<option value="__me__">自分</option>' + assignableStaff().map(function (s) { return '<option value="' + esc(s.name) + '">' + esc(s.name) + '</option>'; }).join('');
    var personSec = '<div class="md-pal-sec"><i data-ic=user data-ics=16></i> 個人（担当者）＝誰のBOXを作るか選んで追加</div>' + personEls.map(function (k) {
      var d = EL[k];
      var chips = ['s', 'm', 'l', 'xl'].map(function (sz) { var ok = d.sizes.indexOf(sz) >= 0; return '<span class="md-szchip' + (ok ? '' : ' na') + '"' + (ok ? ' onclick="mydAddPerson(\'' + k + '\',\'' + sz + '\')"' : '') + '>' + SZL[sz] + '</span>'; }).join('');
      return '<div class="md-pe"><span class="md-pe-ic">' + icoE(d.icon) + '</span><span class="md-pe-n">' + esc(d.title) + '</span><select class="md-pe-person" id="md-pers-' + k + '">' + opts + '</select><span class="md-pe-sz">' + chips + '</span></div>';
    }).join('') + '<div class="md-tiny">複数人（自分＋部下など）にしたい時は、追加後にBOXの <i data-ic=user data-ics=16></i> から選び直せます。</div>';
    var scSec = '<div class="md-pal-sec"><i data-ic=link data-ics=16></i> ショートカット（ビュー/アンカーへ飛ぶ）</div>' +
      '<div class="md-scgrid">' + SHORTCUTS.map(function (s, i) { return '<span class="md-scadd" onclick="mydAddSc(' + i + ')">' + icoE(s.icon) + ' ' + esc(s.label) + '</span>'; }).join('') + '</div>';
    b.innerHTML = dataSec + personSec + scSec +
      '<div class="md-pal-all"><button class="myd-fab primary" onclick="mydAddAll()"><i data-ic=download data-ics=16></i> 全部のせ（まず全部見る）</button><span class="md-tiny">初めての人向け：一旦すべて表示して、要らないBOXを消していけます</span></div>';
    $('myd-pal').classList.add('show');
  };
  window.mydClosePalette = function () { $('myd-pal').classList.remove('show'); };
  window.mydAdd = function (e, s) { var l = curLayout(); var it = { e: e, s: s }; if (EL[e] && EL[e].person) it.p = 'me'; l.push(it); setCurLayout(l); renderFlow(); save(); toast(EL[e].title + '（' + SZL[s] + '）を追加'); };
  window.mydAddPerson = function (e, s) {
    var sel = $('md-pers-' + e); var v = sel ? sel.value : '__me__';
    var it = { e: e, s: s, p: (v === '__me__' ? 'me' : [v]) };
    var l = curLayout(); l.push(it); setCurLayout(l); renderFlow(); save();
    toast((v === '__me__' ? '自分' : v) + 'の' + EL[e].title + '（' + SZL[s] + '）を追加');
  };
  window.mydAddSc = function (i) { var s = SHORTCUTS[i]; var l = curLayout(); l.push({ e: 'sc', s: 's', view: s.view, range: s.range, label: s.label, icon: s.icon }); setCurLayout(l); renderFlow(); save(); toast('ショートカット「' + s.label + '」を追加'); };
  window.mydAddAll = function () {
    var l = curLayout();
    Object.keys(EL).forEach(function (k) { var d = EL[k]; var s = d.sizes[0]; var it = { e: k, s: s }; if (d.person) it.p = 'me'; l.push(it); });
    setCurLayout(l); renderFlow(); save(); mydClosePalette(); toast('全BOXを追加しました');
  };

  // ---- 個人BOXの対象選択 ----
  var _pickIdx = null;
  window.mydPickTarget = function (e, idx) {
    if (e) e.stopPropagation(); _pickIdx = idx;
    var it = curLayout()[idx]; var cur = targetNames(it); var isMe = (!it.p || it.p === 'me');
    var opts = '<label class="md-pick-me"><input type="checkbox" id="md-pick-me" ' + (isMe ? 'checked' : '') + ' onchange="mydPickMeToggle()"> 自分（ログイン中の人）</label><div class="md-pick-list" id="md-pick-list">' +
      assignableStaff().map(function (s) { return '<label class="md-pick-i"><input type="checkbox" value="' + esc(s.name) + '"' + ((!isMe && cur.indexOf(s.name) >= 0) ? ' checked' : '') + (isMe ? ' disabled' : '') + '> ' + esc(s.name) + '<small>' + (s.division === 'div1' ? '1課' : s.division === 'div2' ? '2課' : '受付') + '</small></label>'; }).join('') + '</div>';
    $('myd-pick-body').innerHTML = opts;
    $('myd-pick').classList.add('show');
  };
  window.mydPickMeToggle = function () { var me = $('md-pick-me').checked; $('myd-pick-list').querySelectorAll('input').forEach(function (i) { i.disabled = me; if (me) i.checked = false; }); };
  window.mydPickApply = function () {
    var it = curLayout()[_pickIdx]; if (!it) return;
    if ($('md-pick-me').checked) { it.p = 'me'; }
    else { var ns = []; $('myd-pick-list').querySelectorAll('input:checked').forEach(function (i) { ns.push(i.value); }); it.p = ns.length ? ns : 'me'; }
    setCurLayout(curLayout()); renderFlow(); save(); mydPickClose();
  };
  window.mydPickClose = function () { $('myd-pick').classList.remove('show'); };

  // ---- プリセット設定 ----
  window.mydSwitchPreset = function (i) { var m = md(); if (i < 0 || i >= m.presets.length) return; m.active = i; save(); renderPresets(); renderFlow(); };
  window.mydOpenPresets = function () {
    var m = md();
    var rows = m.presets.map(function (p, i) {
      return '<div class="md-preset-row"><input class="md-preset-name" value="' + esc(p.name) + '" onchange="mydRenamePreset(' + i + ',this.value)">' +
        '<span class="md-preset-n">' + (p.layout ? p.layout.length : 0) + 'BOX</span>' +
        (i === m.active ? '<span class="md-preset-cur">表示中</span>' : '<button class="md-mini-btn" onclick="mydSwitchPreset(' + i + ');mydOpenPresets()">表示</button>') +
        (m.presets.length > 1 ? '<button class="md-mini-btn del" onclick="mydDeletePreset(' + i + ')"><i data-ic=trash data-ics=16></i></button>' : '') + '</div>';
    }).join('');
    var tmpl = '<select id="md-new-tmpl"><option value="">空（現在の配置をコピー）</option>' + TEMPLATE_NAMES.map(function (n) { return '<option value="' + n + '">' + n + '（デフォルト雛形）</option>'; }).join('') + '</select>';
    $('myd-preset-body').innerHTML = '<div class="md-preset-list">' + rows + '</div>' +
      '<div class="md-preset-add">' + tmpl + '<button class="myd-fab primary" onclick="mydAddPreset()">＋ プリセット追加</button></div>' +
      '<div class="md-tiny" style="margin-top:8px">用途別に配置を分けられます（例：自分用／管理用／全体俯瞰用）。デフォルト雛形から作って細部だけ直すのもOK。</div>';
    $('myd-preset').classList.add('show');
  };
  window.mydClosePresets = function () { $('myd-preset').classList.remove('show'); };
  window.mydRenamePreset = function (i, v) { var m = md(); if (m.presets[i]) { m.presets[i].name = (v || '').trim() || ('プリセット' + (i + 1)); save(); renderPresets(); } };
  window.mydDeletePreset = function (i) {
    var m = md(); if (m.presets.length <= 1) return;
    pitAsk('このプリセットを削除しますか？', { danger:true, ok:'削除する' }).then(function(yes){
      if (!yes) return;
      m.presets.splice(i, 1); if (m.active >= m.presets.length) m.active = m.presets.length - 1;
      save(); renderPresets(); renderFlow(); mydOpenPresets();
    });
  };
  window.mydAddPreset = function () {
    var m = md(); var t = $('md-new-tmpl') ? $('md-new-tmpl').value : '';
    var layout = t && TEMPLATES[t] ? T(t) : JSON.parse(JSON.stringify(curLayout()));
    var name = t || ('プリセット' + (m.presets.length + 1));
    m.presets.push({ name: name, layout: layout }); m.active = m.presets.length - 1;
    save('プリセット「' + name + '」を作成'); renderPresets(); renderFlow(); mydOpenPresets();
  };

  var _tt;
  function toast(msg) { var t = $('myd-toast'); if (!t) { t = document.createElement('div'); t.id = 'myd-toast'; t.className = 'md-toast'; document.body.appendChild(t); } t.textContent = msg; t.classList.add('show'); clearTimeout(_tt); _tt = setTimeout(function () { t.classList.remove('show'); }, 1800); }
  if (window.pitToast) { toast = function (m) { pitToast(m); }; }

})();
