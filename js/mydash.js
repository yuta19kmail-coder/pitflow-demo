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
  /* 🔴 v1.65.0 「返車の一覧にどの日で出すか」は return-slot.js の物差し1本。ここで条件を書き写さない。 */
  function mdRetDate(c) { return window.pitReturnListDate ? pitReturnListDate(c) : ((c && c.status !== 'returned' && c.status !== 'scrap') ? (c.returnDate || '') : ''); }
  function yen(n) { return '¥' + (Math.round(+n || 0)).toLocaleString('ja-JP'); }
  function man(n) { n = Math.round(+n || 0); if (Math.abs(n) >= 10000) return (Math.round(n / 1000) / 10) + '万'; return n.toLocaleString('ja-JP'); }
  function manUnit(n) { return Math.abs(Math.round(+n || 0)) >= 10000 ? '万' : '円'; }
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
  function kpi(n, u, sub, cls) {
    return '<div class="md-kpi ' + (cls || '') + '"><div class="md-n">' + n + (u ? '<small>' + u + '</small>' : '') + '</div>' +
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
  function openFoot(view, label) {
    return '<div class="md-open md-int" onclick="event.stopPropagation();mydGo(\'' + view + '\')">↳ 「' + esc(label) + '」を開く</div>';
  }
  function calStrip(n) {
    var cols = window._dashCalCols ? _dashCalCols(0, n, C.today, C.tStr) : '';
    return '<div class="md-tiny" style="margin-top:8px">今後' + Math.round(n / 7) + '週間の空き（<span style="color:#1db97a">可</span>＝空きあり／<span style="color:#ef4444">終了</span>＝満枠／超過／休）</div>' +
      '<div class="md-cal-scroll"><div class="drc-grid"><div class="drc-col drc-lab"><div class="drc-h"></div><div class="drc-c"><i data-ic=car data-ics=16></i> 国産</div><div class="drc-c"><i data-ic=globe data-ics=16></i> 輸入</div></div>' + cols + '</div></div>';
  }
  function miniStat(label, n) { return '<div class="md-mini' + (n ? ' on' : '') + '"><div class="md-mini-n">' + n + '</div><div class="md-mini-l">' + label + '</div></div>'; }

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
    var cnt = { decided: 0, done: 0, recheck: 0, cand: 0, unset: 0, decidedList: [], candList: [] };
    C.cards.forEach(function (c) {
      if (!isShaken(c) || c.status === 'scrap') return;
      var s = c.inspSchedule || {};
      if (s.result === 'done') { cnt.done++; return; }
      (s.history || []).forEach(function (h) { if (h && h.result === 'recheck') cnt.recheck++; });
      if (s.decided) { cnt.decided++; cnt.decidedList.push(c); return; }
      var hasSlot = s.slots && Object.keys(s.slots).some(function (k) { return (s.slots[k] || []).length; });
      if (hasSlot) { cnt.cand++; cnt.candList.push(c); return; }
      if (c.status !== 'reserved' && c.status !== 'returned') cnt.unset++;
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
  function loanerStat(dStr) {
    var loaners = state.loaners || [], asg = state.loanerAssigns || [];
    var busy = function (l, ds) { return asg.some(function (a) { return a.loanerId === l.id && a.fromDate <= ds && a.toDate >= ds; }); };
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

  // ---------------------------------------------------------
  // 要素レジストリ（データBOX）
  // ---------------------------------------------------------
  var EL = {

    hold: {
      title: '預かり中', icon: '🅿️', jump: 'dashboard', sizes: ['s', 'm', 'l'],
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
      more: function () { var v = []; for (var i = 0; i < 14; i++) v.push(window.dashOccupancy ? dashOccupancy(ymd(addDays(C.today, i))) : 0); return '<div class="md-tiny">直近14日の預かり台数（赤＝満杯）</div>' + spark(v, C.cap); }
    },

    park: {
      title: '駐車場', icon: '🚗', jump: 'parking', sizes: ['s', 'l', 'xl'],
      body: function (sz) {
        var held = window.dashOccupancy ? dashOccupancy(C.tStr) : 0; var free = C.cap - held;
        if (sz === 's') return kpi(Math.abs(free), (free >= 0 ? '空き' : '超過'), 'キャパ' + C.cap + '・預り' + held, free >= 0 ? 'g' : 'r');
        var sm = window.ParkingView && ParkingView.summaryHtml ? ParkingView.summaryHtml() : '';
        if (!sm) return '<div class="md-inline">' + kpi(Math.abs(free), free >= 0 ? '空き' : '超過', 'キャパ' + C.cap, free >= 0 ? 'g' : 'r') + '</div>';
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
      title: '今日の入庫', icon: '📥', jump: 'today', sizes: ['s', 'm', 'l', 'xl'],
      body: function (sz) {
        /* ⚠ v1.17.0：まだ保存していない新規予約（_draft）は出さない・数えない */
        var list = C.cards.filter(function (c) { return !c._draft && c.reserveDate === C.tStr && c.status !== 'scrap'; }).sort(function (a, b) { return pitTimeMin(a.reserveTime) - pitTimeMin(b.reserveTime); });   /* v1.33.0 */
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
      title: '今日の返車', icon: '📤', jump: 'return', sizes: ['s', 'm', 'l'],
      body: function (sz) {
        var pend = C.cards.filter(function (c) { return mdRetDate(c) === C.tStr; });
        var done = C.cards.filter(function (c) { return c.status === 'returned' && (c.completedAt === C.tStr || c.returnDate === C.tStr); }).length;
        if (sz === 's') return kpi(pend.length + done, '台', '返車済 ' + done + '台', 'b');
        if (!pend.length) return empty('本日の返車待ちはありません');
        return '<div class="md-list">' + pend.slice(0, 8).map(function (c) { return rowCard(c.id, (c.returnTime ? '<b>' + esc(c.returnTime) + '</b> ' : '') + esc(nm(c)) + ' ' + esc(carOf(c)), wtChip(c)); }).join('') + '</div>' + (sz === 'l' ? openFoot('return', '返車') : '');
      },
      more: function () { return openFoot('return', '返車'); }
    },

    telwait: {
      title: '完TEL待ち', icon: '📞', jump: 'return', sizes: ['s', 'm', 'l'],
      body: function (sz) {
        var list = C.cards.filter(function (c) { return c.returnStage === 'callWait' && c.status !== 'returned' && c.status !== 'scrap'; });
        if (sz === 's') return kpi(list.length, '件', '完了連絡がまだ', list.length ? 'o' : 'g');
        if (!list.length) return empty('完TEL待ちはありません');
        return '<div class="md-list">' + list.slice(0, sz === 'l' ? 12 : 6).map(function (c) { return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), (teamOf(c) === 'import' ? '輸入' : '国産'), 'tag'); }).join('') + '</div>' + (sz === 'l' ? openFoot('return', '返車') : '');
      },
      more: function () { return openFoot('return', '返車'); }
    },

    returnwait: {
      title: '返車待ち', icon: '🔔', jump: 'return', sizes: ['s', 'm', 'l'],
      body: function (sz) {
        var list = C.cards.filter(function (c) { return c.returnStage === 'returnWait' && c.status !== 'returned' && c.status !== 'scrap'; }).sort(function (a, b) { return (a.returnDate || '9999').localeCompare(b.returnDate || '9999'); });
        if (sz === 's') return kpi(list.length, '件', '完TEL済・返車待ち', 'o');
        if (!list.length) return empty('返車待ちはありません');
        return '<div class="md-list">' + list.slice(0, sz === 'l' ? 12 : 6).map(function (c) { return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), esc(c.returnDate ? (window.fmtMD ? fmtMD(c.returnDate) : c.returnDate) : '日未定'), 'tag'); }).join('') + '</div>' + (sz === 'l' ? openFoot('return', '返車') : '');
      },
      more: function () { return openFoot('return', '返車'); }
    },

    pay: {
      title: '入金待ち（売掛）', icon: '💰', jump: 'return', sizes: ['s', 'm', 'l'],
      body: function (sz) {
        var list = C.cards.filter(function (c) { return c.status === 'returned' && c.paymentSeparate && !c.paymentDate; });
        var sum = list.reduce(function (a, c) { return a + amt(c); }, 0);
        if (sz === 's') return kpi(list.length, '件', man(sum) + manUnit(sum) + ' 未回収', list.length ? 'pk' : 'g');
        if (!list.length) return empty('入金待ちはありません');
        return '<div class="md-inline">' + kpi(man(sum), manUnit(sum), '売掛 ' + list.length + '件', 'pk') + '</div>' +
          '<div class="md-list" style="margin-top:8px">' + list.slice(0, sz === 'l' ? 10 : 4).map(function (c) { return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)) + (c.returnDate ? '（' + (window.fmtMD ? fmtMD(c.returnDate) : c.returnDate) + '返）' : ''), yen(amt(c)), 'amt'); }).join('') + '</div>' + (sz === 'l' ? openFoot('return', '返車') : '');
      },
      more: function () { return openFoot('return', '返車'); }
    },

    maintMonth: {
      title: '今月 上げた', icon: '🔧', jump: null, sizes: ['s', 'm', 'l'],
      body: function (sz) {
        var t = mdTot();
        if (sz === 's') return kpi(t.mC, '台', man(t.mA) + manUnit(t.mA), 'g');
        var h = '<div class="md-inline">' + kpi(t.mC, '台', '今月の完成', 'g') + kpi(man(t.mA), manUnit(t.mA), '売上（見込込）', 'b') + '</div>';
        if (sz === 'l' && t.d1 && t.d2) h += '<div class="md-list" style="margin-top:8px">' + rowCard(null, '<i data-ic=car data-ics=16></i> 1課（国産）', t.d1.mC + '台 / ' + man(t.d1.mA) + manUnit(t.d1.mA), 'tag') + rowCard(null, '<i data-ic=globe data-ics=16></i> 2課（輸入）', t.d2.mC + '台 / ' + man(t.d2.mA) + manUnit(t.d2.mA), 'tag') + '</div>';
        return h;
      },
      more: function () { var t = mdTot(); return '<div class="md-tiny">今週 上げた ' + t.wC + '台 / ' + man(t.wA) + manUnit(t.wA) + '　残り ' + t.rC + '台</div>'; }
    },

    maintWeek: {
      title: '今週の生産', icon: '📆', jump: null, sizes: ['s', 'm', 'l'],
      body: function (sz) {
        var t = mdTot();
        if (sz === 's') return kpi(t.wC, '台', '残り ' + t.rC + '台', 'g');
        return '<div class="md-inline">' + kpi(t.wC, '台', '今週 上げた', 'g') + kpi(t.rC, '台', '今週 残り', t.rC > 0 ? 'o' : 'g') + '</div>' +
          '<div class="md-tiny" style="margin-top:6px">上げた ' + man(t.wA) + manUnit(t.wA) + '／残り ' + man(t.rA) + manUnit(t.rA) + '</div>';
      },
      more: function () { var t = mdTot(); return '<div class="md-tiny">今月 上げた ' + t.mC + '台 / ' + man(t.mA) + manUnit(t.mA) + '</div>'; }
    },

    longhold: {
      title: '長期預かり', icon: '⏳', jump: null, sizes: ['s', 'm', 'l', 'xl'],
      body: function (sz) {
        var lim = (state.settings && state.settings.longHoldDays) || 7;
        var list = C.cards.filter(function (c) {
          if (!(window._mdInShop ? _mdInShop(c) : (TASK_ACTIVE.indexOf(c.status) >= 0))) return false;
          var d = daysAgo(c.reserveDate); return d != null && d >= lim;
        }).sort(function (a, b) { return (daysAgo(b.reserveDate) || 0) - (daysAgo(a.reserveDate) || 0); });
        if (sz === 's') return kpi(list.length, '台', lim + '日以上', list.length ? 'r' : 'g');
        if (!list.length) return empty(lim + '日以上の長期預かりはありません');
        var lm = sz === 'xl' ? 40 : (sz === 'l' ? 12 : 5);
        return '<div class="md-' + (sz === 'xl' ? 'scroll md-scroll-tall' : 'list') + '">' + list.slice(0, lm).map(function (c) { var d = daysAgo(c.reserveDate); return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), d + '日目', d >= lim * 2 ? 'tag rd' : 'tag'); }).join('') + (list.length > lm ? '<div class="md-more-n">ほか ' + (list.length - lm) + '台</div>' : '') + '</div>';
      },
      more: function () { return ''; }
    },

    order: {
      title: '受注残', icon: '💵', jump: null, sizes: ['s', 'm', 'l'],
      body: function (sz) {
        var IN = ['parts', 'work', 'workDone', 'outsource'];
        var list = C.cards.filter(function (c) { return IN.indexOf(c.status) >= 0 && c.status !== 'returned'; });
        var sum = list.reduce(function (a, c) { return a + amt(c); }, 0);
        if (sz === 's') return kpi(man(sum), manUnit(sum), '受注済・未返車 ' + list.length + '台', 'b');
        list.sort(function (a, b) { return amt(b) - amt(a); });
        if (!list.length) return empty('受注残はありません');
        return '<div class="md-inline">' + kpi(man(sum), manUnit(sum), '受注残 ' + list.length + '台', 'b') + '</div>' +
          '<div class="md-list" style="margin-top:8px">' + list.slice(0, sz === 'l' ? 8 : 4).map(function (c) { return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), yen(amt(c)), 'amt'); }).join('') + '</div>';
      },
      more: function () { return ''; }
    },

    shakenPlan: {
      title: '車検予定', icon: '🔎', jump: 'shakencal', sizes: ['s', 'm', 'l', 'xl'],
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
      body: function (sz) {
        var list = C.cards.filter(function (c) { return c.completedAt && c.completedAt >= C.moS && c.completedAt <= C.moE && (c.status === 'workDone' || c.status === 'returned'); });
        var sum = list.reduce(function (a, c) { return a + amt(c); }, 0);
        if (sz === 's') return kpi(list.length, '台', man(sum) + manUnit(sum), 'g');
        if (sz === 'm') { var rec = list.slice().sort(function (a, b) { return (b.completedAt || '').localeCompare(a.completedAt || ''); }); return '<div class="md-inline">' + kpi(list.length, '台', '当月 完成', 'g') + '</div><div class="md-list" style="margin-top:8px">' + (rec.length ? rec.slice(0, 5).map(function (c) { return rowCard(c.id, (window.fmtMD ? fmtMD(c.completedAt) : c.completedAt) + ' ' + esc(nm(c)) + ' ' + esc(carOf(c)), wtChip(c)); }).join('') : empty('当月の実績はまだありません')) + '</div>'; }
        var cells = window._resultMonthCells ? _resultMonthCells(C.y, C.m) : '';
        return '<div class="md-inline">' + kpi(list.length, '台', '当月完成 / ' + man(sum) + manUnit(sum), 'g') + '</div><div class="md-embed' + (sz === 'xl' ? ' md-embed-tall' : '') + '"><div class="reserve-month md-month">' + cells + '</div></div>' + openFoot('result', '実績');
      },
      more: function () { return openFoot('result', '実績'); }
    },

    loaner: {
      title: '代車', icon: '🚙', jump: 'loaner', sizes: ['s', 'm', 'l', 'xl'],
      body: function (sz) {
        var st = loanerStat(C.tStr);
        var ef = window.dashLoanerEarliestFree ? dashLoanerEarliestFree(C.today) : null;
        var efStr = ef ? (ymd(ef) === C.tStr ? '今日' : (ef.getMonth() + 1) + '/' + ef.getDate()) : 'なし';
        if (sz === 's') return kpi(st.free, '台空き', '稼働 ' + st.busy + '/' + st.total, st.free > 0 ? 'g' : 'r');
        if (sz === 'm') return '<div class="md-inline">' + kpi(st.free, '空き', '/' + st.total + '台', st.free > 0 ? 'g' : 'r') + kpi(efStr, '', '最短空き', 'b') + '</div>';
        var days = sz === 'xl' ? 21 : 14;
        var head = '<div class="md-lg-row md-lg-head"><span class="md-lg-name"></span>';
        for (var i = 0; i < days; i++) { var d = addDays(C.today, i); head += '<span class="md-lg-c md-lg-hc">' + (d.getMonth() + 1) + '/' + d.getDate() + '</span>'; }
        head += '</div>';
        var rows = st.loaners.map(function (l) { var r = '<div class="md-lg-row"><span class="md-lg-name">' + esc(l.name) + '<small>' + esc(l.model || '') + '</small></span>'; for (var i = 0; i < days; i++) { var ds = ymd(addDays(C.today, i)); r += '<span class="md-lg-c' + (st.busyFn(l, ds) ? ' busy' : ' free') + '"></span>'; } return r + '</div>'; }).join('');
        return '<div class="md-inline">' + kpi(st.free, '空き', '/' + st.total + '台 ・ 最短空き ' + efStr, st.free > 0 ? 'g' : 'r') + '</div><div class="md-cal-scroll md-lg"><div class="md-lg-grid">' + head + rows + '</div></div>' + openFoot('loaner', '代車カレンダー');
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
        if (sz === 's') return kpi(man(sum), manUnit(sum), '当月実績 ' + act.length + '台', 'g');
        var col = pct >= 100 ? 'var(--green,#1db97a)' : pct >= 75 ? '#eab308' : '#f97316';
        var head = '<div class="md-inline">' + kpi(man(sum), manUnit(sum), '当月実績', 'g') + kpi(pct, '%', '目標達成', pct >= 100 ? 'g' : 'o') + '</div>' +
          '<div class="md-bar"><i style="width:' + Math.min(100, pct) + '%;background:' + col + '"></i></div><div class="md-tiny">最低目標 ' + man(tg.monthMin) + '万 に対して ' + pct + '%（' + act.length + '台）</div>';
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
      title: '予約一覧', icon: '📅', person: true, sizes: ['s', 'm', 'l'],
      body: function (sz, item) {
        var ns = targetNames(item);
        var list = C.cards.filter(function (c) { return (inTarget(c.frontStaff, ns) || inTarget(c.reserveStaff, ns)) && c.status !== 'returned' && c.status !== 'scrap' && c.reserveDate && c.reserveDate >= C.tStr; }).sort(function (a, b) { return a.reserveDate === b.reserveDate ? (pitTimeMin(a.reserveTime) - pitTimeMin(b.reserveTime)) : (a.reserveDate < b.reserveDate ? -1 : 1); });   /* v1.33.0 */
        if (sz === 's') return kpi(list.length, '件', '直近の担当予約', 'b');
        if (!list.length) return empty('担当の予約はありません');
        return '<div class="md-list">' + list.slice(0, sz === 'l' ? 12 : 6).map(function (c) { return rowCard(c.id, esc((window.fmtMD ? fmtMD(c.reserveDate) : c.reserveDate)) + (c.reserveTime ? ' ' + esc(c.reserveTime) : '') + '　' + esc(nm(c)) + ' ' + esc(carOf(c)), wtChip(c)); }).join('') + '</div>';
      }, more: function () { return openFoot('reserve', '予約'); }
    },
    p_task: {
      title: 'タスク', icon: '📋', person: true, sizes: ['s', 'm', 'l'],
      body: function (sz, item) {
        var ns = targetNames(item);
        var list = C.cards.filter(function (c) { return inTarget(taskStaff(c), ns) && TASK_ACTIVE.indexOf(c.status) >= 0 && !c.returnStage; });
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
      title: '返車予定', icon: '📤', person: true, sizes: ['s', 'm', 'l'],
      body: function (sz, item) {
        var ns = targetNames(item);
        var list = C.cards.filter(function (c) { var d = mdRetDate(c); return inTarget(taskStaff(c), ns) && d && d >= C.tStr; }).sort(function (a, b) { var da = mdRetDate(a), db = mdRetDate(b); return da === db ? ((window.pitReturnSortMin ? pitReturnSortMin(a) : 0) - (window.pitReturnSortMin ? pitReturnSortMin(b) : 0)) : (da < db ? -1 : 1); });   /* v1.65.0 物差し1本 */
        if (sz === 's') return kpi(list.length, '件', '担当の返車予定', 'b');
        if (!list.length) return empty('担当の返車予定はありません');
        return '<div class="md-list">' + list.slice(0, sz === 'l' ? 12 : 6).map(function (c) { return rowCard(c.id, esc((window.fmtMD ? fmtMD(c.returnDate) : c.returnDate)) + (c.returnTime ? ' ' + esc(c.returnTime) : '') + '　' + esc(nm(c)) + ' ' + esc(carOf(c)), wtChip(c)); }).join('') + '</div>';
      }, more: function () { return openFoot('return', '返車'); }
    },
    p_resstaff: {
      title: '予約担当 直近10件', icon: '📞', person: true, sizes: ['s', 'm', 'l'],
      body: function (sz, item) {
        var ns = targetNames(item);
        var list = C.cards.filter(function (c) { return inTarget(c.reserveStaff, ns) && c.bookedAt; }).sort(function (a, b) { return (b.bookedAt || '').localeCompare(a.bookedAt || ''); }).slice(0, 10);
        if (sz === 's') return kpi(list.length, '件', '受付した直近', 'pu');
        if (!list.length) return empty('予約担当の履歴はありません');
        return '<div class="md-list">' + list.map(function (c) { return rowCard(c.id, esc((window.fmtMD ? fmtMD(c.bookedAt) : c.bookedAt)) + '受付　' + esc(nm(c)) + ' ' + esc(carOf(c)), wtChip(c)); }).join('') + '</div>';
      }, more: function () { return openFoot('reserve', '予約'); }
    },
    p_sales: {
      title: '売上', icon: '💴', person: true, sizes: ['s', 'm', 'l'],
      body: function (sz, item) {
        var ns = targetNames(item);
        var list = C.cards.filter(function (c) { if (c.status !== 'returned') return false; var rd = mdCountDate(c); return rd >= C.moS && rd <= C.moE && inTarget(taskStaff(c), ns); });
        var sum = list.reduce(function (a, c) { return a + amt(c); }, 0);
        if (sz === 's') return kpi(man(sum), manUnit(sum), '当月 ' + list.length + '台', 'g');
        var head = '<div class="md-inline">' + kpi(man(sum), manUnit(sum), '当月実績', 'g') + kpi(list.length, '台', '担当台数', 'b') + '</div>';
        if (sz === 'm') return head;
        var rec = list.slice().sort(function (a, b) { return amt(b) - amt(a); });
        return head + '<div class="md-list" style="margin-top:8px">' + (rec.length ? rec.slice(0, 10).map(function (c) { return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), yen(amt(c)), 'amt'); }).join('') : empty('当月の担当実績はありません')) + '</div>';
      }, more: function () { return openFoot('sales', '売上'); }
    }
  };
  function teamHintView(item) { return 'course1'; }

  var SZL = { s: '小', m: '中', l: '大', xl: '特大' };

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
    'フロント用': function () { return [{ e: 'p_reserve', s: 'm', p: 'me' }, { e: 'p_return', s: 'm', p: 'me' }, { e: 'p_task', s: 'm', p: 'me' }, { e: 'telwait', s: 's' }, { e: 'returnwait', s: 's' }, { e: 'sales', s: 's' }, { e: 'p_resstaff', s: 'm', p: 'me' }]; }
  };
  var TEMPLATE_NAMES = ['全体用', '代車特化型', '受付用', '整備士用', 'フロント用'];

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
        '<div id="mydash-search-wrap"class="md-search"><input id="mydash-search-input"type="search"autocomplete="off"placeholder="検索（顧客・名前・車・ナンバー・予約番号・代車・日付…）"onfocus="pitSearchBind(\'mydash-search-wrap\',\'mydash-search-input\',\'mydash-search-results\')"oninput="pitSearchInput(this.value)"><div id="mydash-search-results"class="pit-search-results"></div></div>'+
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
        tools = '<span class="md-tools">' + sizeChips(it, def, idx) + (def.person ? '<span class="md-tbtn" title="対象を選ぶ" onclick="mydPickTarget(event,' + idx + ')"><i data-ic=user data-ics=16></i></span>' : '') + moveTools(idx) + '</span>';
      }
      var bodyHtml, moreHtml = '';
      if (def.shortcut) {
        bodyHtml = '<div class="md-sc md-int" onclick="event.stopPropagation();mydGo(\'' + it.view + '\'' + (it.range ? ",'" + it.range + "'" : '') + ')"><span class="md-sc-ic">' + icoE(it.icon || '🔗') + '</span><span class="md-sc-l">' + esc(it.label || '') + '</span><span class="md-sc-go">開く →</span></div>';
      } else {
        bodyHtml = safe(def.body, it.s, it);
        if (!noexp) moreHtml = '<div class="md-more">' + safe(def.more, it.s, it) + '</div>';
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
  function moveTools(idx) { return '<span class="md-tbtn" onclick="mydMove(event,' + idx + ',-1)">↑</span><span class="md-tbtn" onclick="mydMove(event,' + idx + ',1)">↓</span><span class="md-tbtn del" onclick="mydRemove(event,' + idx + ')"><i data-ic=close data-ics=16></i></span>'; }
  function safe(fn, sz, it) { try { return fn ? fn(sz, it) : ''; } catch (e) { console.error('[mydash] render error', e); return '<div class="md-empty">表示エラー</div>'; } }

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
