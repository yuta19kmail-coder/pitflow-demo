/* ========================================
   app-summary.js — CoreFlow のダッシュボードへ PitFlow の概況を配る（appSummaries/pitflow）v2.108.0
   ----------------------------------------
   🗣 ゆうた 2026-09-13「コアフローのダッシュボードを仕上げる」
      「基本考えうる全てを作成して欲しい　時間かかっていい」／売上は「金額も出す」

   ◎配る形（CoreFlow の dash.js が読む）
     { updatedAt, v:2,
       metrics:[{label,value,tone}], items:[{main,sub,right,warn,q}],      … 「PitFlow 概況」BOX
       sections:{ intake:{title,metrics,items,more}, … },                   … 項目ごとのBOX（30種あまり）
       perUser:{ [メンバーid]:{ metrics, items, sections:{reserve,task,ret,resstaff,sales} } } }  … 「自分の◯◯」BOX
     ・q ＝ 押した時に開く PitFlow の行き先（`card=<カードID>` → deeplink-pit.js が受ける）
     ・perUser の鍵＝**メンバーid（portalMembers の文書id）**。state.staff の id と同じ。

   🔴 **どの車を数えるかは mydash.js の物差し（window.PIT_DASH_API）を借りるだけ。**
      ここで条件を書かない＝ PitFlow のBOXと CoreFlow の数字が食い違わない。
   🔴 **本番（PIT_CLOUD）でログインしている時だけ配る。** 見本データを本番のダッシュボードに混ぜない。
   ⚠ お客様は **名字＋車名だけ**（電話・住所は載せない）。CoreFlow のメンバーなら誰でも読める場所だから。
   ⚠ 書けない時は console.warn だけ（画面の邪魔をしない）。
   ======================================== */
(function () {
  'use strict';
  var KEY = 'pitflow', INTERVAL = 10 * 60 * 1000, LIM = 30, PLIM = 15;
  var W = '日月火水木金土';

  function A() { return window.PIT_DASH_API; }
  function str(v) { return v == null ? '' : String(v); }
  function man(n) {
    n = Math.round(+n || 0); var a = Math.abs(n);
    if (a >= 100000000) return (Math.round(n / 10000000) / 10) + '億';
    if (a >= 10000) return (Math.round(n / 1000) / 10) + '万';
    return n.toLocaleString('ja-JP') + '円';
  }
  function yen(n) { return '¥' + Math.round(+n || 0).toLocaleString('ja-JP'); }
  function md(d) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(d)); return m ? (+m[2]) + '/' + (+m[3]) : ''; }
  function mdw(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(d)); if (!m) return '';
    return (+m[2]) + '/' + (+m[3]) + '(' + W[new Date(+m[1], +m[2] - 1, +m[3]).getDay()] + ')';
  }
  function daysAgo(ds) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(ds)); if (!m) return null;
    var t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((t - new Date(+m[1], +m[2] - 1, +m[3])) / 86400000);
  }
  function wt(c) {
    var id = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes[0] : c.workType;
    var w = ((window.state && state.workTypes) || []).find(function (x) { return x.id === id; });
    return w ? str(w.label) : '';
  }
  function team(c) { return c && c.boardId === 'import' ? '輸入' : '国産'; }
  function subOf() { return Array.prototype.slice.call(arguments).filter(Boolean).join('・'); }
  function row(c, sub, right, warn) {
    var who = (str(A().nm(c)) + ' 様 ' + str(A().carOf(c))).trim();
    return { main: who, sub: str(sub), right: str(right), warn: !!warn, q: (c && c.id) ? 'card=' + encodeURIComponent(c.id) : '' };
  }
  function line(main, sub, right, warn) { return { main: str(main), sub: str(sub), right: str(right), warn: !!warn, q: '' }; }
  function met(label, value, tone) { return { label: str(label), value: str(value), tone: tone || 'info' }; }
  function toneN(n, t) { return n ? t : 'good'; }
  function total(list) { return list.reduce(function (a, c) { return a + (+A().amt(c) || 0); }, 0); }
  function sec(title, metrics, items, lim) {
    lim = lim || LIM; items = items || [];
    var o = { title: title, metrics: metrics || [], items: items.slice(0, lim) };
    if (items.length > lim) o.more = items.length - lim;
    return o;
  }
  var ORDER_LABEL = { parts: '部品', work: '作業', workDone: '作業完了', outsource: '外注' };

  /* ---------- 全社の概況 ---------- */
  function buildSections(C) {
    var P = A(), S = {};
    function add(key, fn) { try { S[key] = fn(); } catch (e) { console.warn('[appSummary:pitflow] ' + key, e); } }

    add('intake', function () {
      var l = P.pickIntake(), notYet = l.filter(function (c) { return c.status === 'reserved'; });
      return sec('今日の入庫', [met('入庫予定', l.length + '台', 'good'), met('未来店', notYet.length + '台', toneN(notYet.length, 'gold')),
                                met('代車あり', l.filter(function (c) { return c.needLoaner; }).length + '台', 'purple')],
        l.map(function (c) { return row(c, subOf(wt(c), team(c), c.needLoaner ? '代車' : '', c.status === 'reserved' ? '' : '入庫済'), c.reserveTime || '時間未定'); }));
    });
    add('returnout', function () {
      var l = P.pickReturnOut(), done = P.returnedOn(C.tStr);
      return sec('今日の返車', [met('今日の返車', (l.length + done.length) + '台', 'info'), met('返車済', done.length + '台', 'good'), met('これから', l.length + '台', toneN(l.length, 'gold'))],
        l.map(function (c) { return row(c, subOf(wt(c), team(c)), c.returnTime || '時間未定'); }));
    });
    add('hold', function () {
      var l = P.pickHold(), lim = P.longHoldDays();
      var held = window.dashOccupancy ? dashOccupancy(C.tStr) : l.length;
      var d = window._dashHeldOnTeam ? _dashHeldOnTeam('default', C.tStr) : 0, i = window._dashHeldOnTeam ? _dashHeldOnTeam('import', C.tStr) : 0;
      var free = C.cap - held;
      return sec('預かり中', [met('預かり中', held + '台', 'good'), met('国産・輸入', d + '台・' + i + '台', 'info'),
                             met(free >= 0 ? '置場の空き' : '置場の超過', Math.abs(free) + '台', free >= 0 ? 'good' : 'warn'), met('置場', C.cap + '台', 'info')],
        l.map(function (c) { var n = P.holdDays(c); return row(c, subOf(wt(c), team(c)), n != null ? n + '日目' : '', n != null && n >= lim); }));
    });
    add('park', function () {
      var items = [], full = 0;
      for (var k = 0; k < 14; k++) {
        var ds = ymd(addDays(C.today, k)), n = window.dashOccupancy ? dashOccupancy(ds) : 0;
        if (n >= C.cap) full++;
        items.push(line(mdw(ds) + (k === 0 ? ' 今日' : ''), n >= C.cap ? '満杯' : '', n + ' / ' + C.cap + '台', n >= C.cap));
      }
      return sec('置場の見込み（2週間）', [met('今日', items[0].right, 'good'), met('満杯の日', full + '日', toneN(full, 'warn'))], items);
    });
    add('longhold', function () {
      var l = P.pickLongHold(), lim = P.longHoldDays();
      var twice = l.filter(function (c) { return (P.holdDays(c) || 0) >= lim * 2; }).length;
      return sec('長期預かり', [met(lim + '日以上', l.length + '台', toneN(l.length, 'warn')), met((lim * 2) + '日以上', twice + '台', toneN(twice, 'warn'))],
        l.map(function (c) { var n = P.holdDays(c); return row(c, subOf(wt(c), team(c)), n + '日目', n >= lim * 2); }));
    });
    add('earliest', function () {
      function ed(tm, kind) {
        var d = window.dashEarliestIntake ? dashEarliestIntake(tm, kind, C.today) : null;
        if (!d) return 'なし';
        var ds = ymd(d); return ds === C.tStr ? '今日' : mdw(ds);
      }
      var dn = ed('default', 'noLoaner'), dl = ed('default', 'loaner'), inl = ed('import', 'noLoaner'), il = ed('import', 'loaner'), same = ed('default', 'same');
      return sec('最短入庫日', [met('国産・代車なし', dn, 'good'), met('国産・代車あり', dl, 'info'), met('輸入・代車なし', inl, 'purple'), met('輸入・代車あり', il, 'purple'), met('当日作業', same, 'gold')],
        [line('国産', '代車なし', dn), line('国産', '代車あり', dl), line('輸入', '代車なし', inl), line('輸入', '代車あり', il), line('当日作業', 'オイルなど', same)]);
    });
    add('fill', function () {
      var rc = (state.settings && state.settings.reserveCap) || { 'default': 5, 'import': 3 };
      var capD = rc['default'] != null ? rc['default'] : 5, capI = rc['import'] != null ? rc['import'] : 3;
      var items = [], fullDays = 0, first = null;
      for (var k = 0; k < 21; k++) {
        var ds = ymd(addDays(C.today, k));
        var eD = window.pitEffective ? pitEffective(ds, 'capDefault', capD) : { value: capD };
        var eI = window.pitEffective ? pitEffective(ds, 'capImport', capI) : { value: capI };
        var closed = (window.PitCal && PitCal.isClosed(ds)) || eD.closed;
        var nD = window.dashIntake ? dashIntake('default', ds) : 0, nI = window.dashIntake ? dashIntake('import', ds) : 0;
        var full = !closed && nD >= eD.value && nI >= eI.value;
        var r = closed ? line(mdw(ds), (window.PitCal && PitCal.label(ds)) || '休み', '休')
                       : line(mdw(ds), full ? '満枠' : '', '国産 ' + nD + '/' + eD.value + '・輸入 ' + nI + '/' + eI.value, full);
        if (full) fullDays++;
        if (k === 0) first = r;
        items.push(r);
      }
      return sec('予約の埋まり（3週間）', [met('今日', first ? first.right : '', 'info'), met('満枠の日', fullDays + '日', toneN(fullDays, 'gold'))], items);
    });
    add('inspect', function () {
      var o = P.insStat(), gs = P.insGroups(), L = { red: '要対応', amber: '確認', gray: '気づき' };
      return sec('データチェック', [met('要対応', o.red + '件', toneN(o.red, 'warn')), met('確認', o.amber + '件', toneN(o.amber, 'gold')), met('気づき', o.gray + '件', 'info'), met('終わった記録', o.past + '件', 'info')],
        gs.map(function (g) {
          var names = g.items.slice(0, 4).map(function (f) { return [f.name, f.car].filter(Boolean).join(' '); }).filter(Boolean).join('／');
          return line(g.title, (L[g.level] || '') + (names ? '・' + names : ''), g.items.length + '件', g.level === 'red');
        }));
    });
    add('thanks', function () {
      var l = P.thxList(C.tStr), left = P.thxLeft(l);
      return sec('お礼LINE（今日）', [met('まだ送っていない', left.length + '件', toneN(left.length, 'gold')), met('今日の対象', l.length + '件', 'info')],
        l.map(function (c) { var sent = P.thxSent(c); return row(c, wt(c), sent ? '送った' : '未送', !sent); }));
    });
    add('rpweek', function () {
      var R = P.rpByDay(), items = [];
      R.days.forEach(function (x) { if (x.i < 0) return; (R.map[x.d] || []).forEach(function (c) { items.push(row(c, subOf(wt(c), team(c)), mdw(x.d), x.d === C.tStr)); }); });
      return sec('今週の暫定返車予定', [met('暫定の返車予定', R.n + '台', toneN(R.n, 'gold')), met('今日', (R.map[C.tStr] || []).length + '台', 'info')], items);
    });

    /* ---- 返車の未定 ---- */
    var tw = [], rw = [], rdt = [], rtt = [], pay = [];
    try { tw = P.pickTelWait(); rw = P.pickReturnWait(); rdt = P.pickRetDateTbd(); rtt = P.pickRetTimeTbd(); pay = P.pickPay(); } catch (e) { console.warn('[appSummary:pitflow] retTbd', e); }
    var pay30 = pay.filter(function (c) { var d = daysAgo(c.returnDate); return d != null && d >= 30; });
    add('retTbd', function () {
      return sec('返車の未定', [met('完TEL待ち', tw.length + '件', toneN(tw.length, 'gold')), met('返車日未定', rdt.length + '件', toneN(rdt.length, 'gold')),
                               met('返車時間未定', rtt.length + '件', toneN(rtt.length, 'gold')), met('入金待ち', pay.length + '件・' + man(total(pay)), toneN(pay.length, 'warn'))],
        [].concat(tw.map(function (c) { return row(c, subOf('完TEL待ち', team(c)), ''); }),
                  rdt.map(function (c) { return row(c, '返車日未定', c.amountFinal != null ? yen(c.amountFinal) : '金額まだ'); }),
                  rtt.map(function (c) { var d = c.returnDateFinal || c.returnDate; return row(c, '返車時間未定', md(d), d === C.tStr); }),
                  pay.map(function (c) { return row(c, '入金待ち', yen(A().amt(c))); })), 60);
    });
    add('telwait', function () { return sec('完TEL待ち', [met('完了連絡がまだ', tw.length + '件', toneN(tw.length, 'gold'))], tw.map(function (c) { return row(c, subOf(wt(c), team(c)), ''); })); });
    add('returnwait', function () {
      var t = rw.filter(function (c) { return c.returnDate === C.tStr; }).length;
      return sec('返車待ち', [met('完TEL済・返車待ち', rw.length + '件', toneN(rw.length, 'gold')), met('今日返す', t + '件', 'info')],
        rw.map(function (c) { return row(c, wt(c), c.returnDate ? md(c.returnDate) + (c.returnTime ? ' ' + c.returnTime : '') : '日未定', c.returnDate === C.tStr); }));
    });
    add('retDateTbd', function () { return sec('返車日未定', [met('完TEL済・日にち待ち', rdt.length + '件', toneN(rdt.length, 'gold'))], rdt.map(function (c) { return row(c, wt(c), c.amountFinal != null ? yen(c.amountFinal) : '金額まだ'); })); });
    add('retTimeTbd', function () { return sec('返車時間未定', [met('日にち決定・時間待ち', rtt.length + '件', toneN(rtt.length, 'gold'))], rtt.map(function (c) { var d = c.returnDateFinal || c.returnDate; return row(c, wt(c), md(d), d === C.tStr); })); });
    add('pay', function () {
      return sec('入金待ち（売掛）', [met('未回収', man(total(pay)), toneN(pay.length, 'warn')), met('件数', pay.length + '件', 'info'), met('30日以上', pay30.length + '件', toneN(pay30.length, 'warn'))],
        pay.map(function (c) { var d = daysAgo(c.returnDate); return row(c, subOf(c.returnDate ? md(c.returnDate) + ' 返車' : '', d != null ? d + '日前' : ''), yen(A().amt(c)), d != null && d >= 30); }));
    });

    /* ---- 予約の未定 ---- */
    var ap = [], tt = [], itb = [], ns = [];
    try { ap = P.pickApproval(); tt = P.pickTentative(); itb = P.pickIntakeTbd(); ns = P.pickNoShow(); } catch (e) { console.warn('[appSummary:pitflow] resTbd', e); }
    add('resTbd', function () {
      return sec('予約の未定', [met('承認待ち', ap.length + '台', toneN(ap.length, 'warn')), met('仮予約', tt.length + '台', toneN(tt.length, 'gold')),
                               met('入庫日未定', itb.length + '台', toneN(itb.length, 'gold')), met('未入庫', ns.length + '台', toneN(ns.length, 'gold'))],
        [].concat(ap.map(function (c) { return row(c, subOf('承認待ち', wt(c)), md(c.reserveDate) || '日未定', true); }),
                  tt.map(function (c) { return row(c, subOf('仮予約', wt(c)), md(c.reserveDate) || '日未定'); }),
                  itb.map(function (c) { return row(c, subOf('入庫日未定', wt(c)), ''); }),
                  ns.map(function (c) { return row(c, '未入庫', c.cancelledAt ? md(c.cancelledAt) + ' 取消' : ''); })), 60);
    });
    add('approval', function () { return sec('承認待ち', [met('承認がまだ', ap.length + '台', toneN(ap.length, 'warn'))], ap.map(function (c) { return row(c, wt(c), md(c.reserveDate) || '日未定', true); })); });
    add('tentative', function () { return sec('仮予約', [met('仮おさえ', tt.length + '台', toneN(tt.length, 'gold'))], tt.map(function (c) { return row(c, wt(c), md(c.reserveDate) || '日未定'); })); });
    add('intakeTbd', function () { return sec('入庫日未定', [met('入庫日が決まらず', itb.length + '台', toneN(itb.length, 'gold'))], itb.map(function (c) { return row(c, wt(c), ''); })); });
    add('noShow', function () {
      return sec('未入庫', [met('来店なし・キャンセル', ns.length + '台', toneN(ns.length, 'gold'))],
        ns.map(function (c) { var d = daysAgo(c.cancelledAt); return row(c, c.cancelledAt ? md(c.cancelledAt) + ' 取消' : '', d != null ? 'あと' + Math.max(0, 30 - d) + '日' : ''); }));
    });

    /* ---- 生産・お金 ---- */
    add('production', function () {
      var t = P.mdTot(), d1 = t.d1 || {}, d2 = t.d2 || {};
      return sec('生産（今月・今週）', [met('今月 上げた', t.mC + '台・' + man(t.mA), 'good'), met('今週 上げた', t.wC + '台・' + man(t.wA), 'info'),
                                     met('今週 残り', t.rC + '台・' + man(t.rA), toneN(t.rC, 'gold')), met('1課／2課（今月）', (d1.mC || 0) + '台／' + (d2.mC || 0) + '台', 'purple')],
        [line('1課（国産）', '今月 上げた', (d1.mC || 0) + '台 / ' + man(d1.mA)), line('2課（輸入）', '今月 上げた', (d2.mC || 0) + '台 / ' + man(d2.mA)),
         line('1課（国産）', '今週 上げた', (d1.wC || 0) + '台 / ' + man(d1.wA)), line('2課（輸入）', '今週 上げた', (d2.wC || 0) + '台 / ' + man(d2.wA)),
         line('1課（国産）', '今週 残り', (d1.rC || 0) + '台 / ' + man(d1.rA), !!d1.rC), line('2課（輸入）', '今週 残り', (d2.rC || 0) + '台 / ' + man(d2.rA), !!d2.rC)]);
    });
    add('order', function () {
      var l = P.pickOrder();
      return sec('受注残', [met('受注残', man(total(l)), 'info'), met('台数', l.length + '台', 'info')],
        l.map(function (c) { return row(c, subOf(wt(c), ORDER_LABEL[c.status] || ''), yen(A().amt(c))); }));
    });
    add('result', function () {
      var l = P.pickResultMonth();
      return sec('当月実績', [met('当月 完成', l.length + '台', 'good'), met('金額', man(total(l)), 'info')],
        l.map(function (c) { return row(c, wt(c), md(c.completedAt)); }));
    });
    /* 売上＝返車済みで「数える日」が今月（mydash の売上サマリーと同じ数え方） */
    var act = C.cards.filter(function (c) { if (c.status !== 'returned') return false; var d = P.countDate(c); return d >= C.moS && d <= C.moE; });
    add('sales', function () {
      var sum = total(act), tg = (state.settings && state.settings.target) || { monthMin: 15000000, monthMax: 20000000 };
      var pct = tg.monthMin ? Math.round(sum / tg.monthMin * 100) : 0;
      var groups = [{ k: 'shaken', n: '車検' }, { k: '12pt', n: '12点' }, { k: 'general', n: '一般' }, { k: 'oil', n: 'オイル' }, { k: 'bp', n: 'B.P' }];
      var gmap = {}; groups.forEach(function (g) { gmap[g.k] = { n: g.n, c: 0, a: 0 }; });
      var other = { n: 'その他', c: 0, a: 0 };
      act.forEach(function (c) { var w = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes[0] : c.workType; var g = gmap[w] || other; g.c++; g.a += (+A().amt(c) || 0); });
      var rows = groups.map(function (g) { return gmap[g.k]; }).concat([other]).filter(function (g) { return g.c; })
        .map(function (g) { return line(g.n, '平均 ' + yen(Math.round(g.a / g.c)), g.c + '台・' + yen(g.a)); });
      return sec('売上（今月）', [met('当月売上', man(sum), 'good'), met('目標達成', pct + '%', pct >= 100 ? 'good' : 'gold'),
                               met('最低目標まで', sum >= tg.monthMin ? '達成' : 'あと' + man(tg.monthMin - sum), sum >= tg.monthMin ? 'good' : 'gold'),
                               met('台数・平均単価', act.length + '台・' + man(act.length ? sum / act.length : 0), 'info'),
                               met('最低目標', man(tg.monthMin), 'info'), met('上の目標', tg.monthMax ? man(tg.monthMax) : '—', 'purple')], rows);
    });
    add('salesStaff', function () {
      var by = {}, order = [];
      act.forEach(function (c) { var n = str(P.taskStaff(c)) || '担当なし'; if (!by[n]) { by[n] = { n: n, c: 0, a: 0 }; order.push(by[n]); } by[n].c++; by[n].a += (+A().amt(c) || 0); });
      order.sort(function (a, b) { return b.a - a.a; });
      return sec('売上 担当別（今月）', [met('担当', order.length + '人', 'info')], order.map(function (x) { return line(x.n, x.c + '台', yen(x.a)); }));
    });
    add('salesDays', function () {
      var items = [], sum7 = 0;
      for (var k = 0; k < 7; k++) {
        var ds = ymd(addDays(C.today, -k));
        var l = C.cards.filter(function (c) { return c.status === 'returned' && P.countDate(c) === ds; });
        var a = total(l); sum7 += a;
        items.push(line(mdw(ds) + (k === 0 ? ' 今日' : ''), l.length + '台', yen(a)));
      }
      return sec('売上 この7日', [met('7日の合計', man(sum7), 'good'), met('今日', items[0].right, 'info')], items);
    });

    /* ---- 車検 ---- */
    add('shakenPlan', function () {
      var s = P.shakenStat(), l = P.pickShakenPlan();
      return sec('車検予定', [met('決定', s.decided + '台', 'good'), met('候補', s.cand + '台', 'gold'), met('未設定', s.unset + '台', toneN(s.unset, 'warn')), met('再検あり', s.recheck + '件', 'info')],
        l.map(function (c) {
          var k = P.shakenKind(c), s2 = c.inspSchedule || {};
          var when = k === 'u' ? '日取り未定' : k === 'c' ? '候補あり' : md(s2.decided) + (s2.decidedSlot === 'pm' ? ' 午後' : s2.decidedSlot === 'am' ? ' 午前' : '');
          return row(c, k === 'd' ? '決定' : k === 'c' ? '候補' : '未設定', when, k === 'u');
        }));
    });
    var recs = []; try { recs = P.shakenRecords(); } catch (e) {}
    var mRecs = recs.filter(function (r) { return str(r.iso).indexOf(C.moS.slice(0, 7)) === 0; });
    add('shakenLog', function () {
      var ok = mRecs.filter(function (r) { return r.result === 'done'; }).length, re = mRecs.length - ok;
      return sec('車検履歴', [met('今月 合格', ok + '台', 'good'), met('今月 不合格', re + '件', toneN(re, 'gold'))],
        recs.map(function (r) { return row(r.c, subOf(md(r.iso), r.staff), r.result === 'done' ? '合格' : '不合格', r.result !== 'done'); }));
    });
    add('shakenStaff', function () {
      var by = {}, arr = [];
      mRecs.forEach(function (r) { if (r.result !== 'done') return; var n = str(r.staff) || '担当なし'; if (!by[n]) { by[n] = { n: n, v: 0 }; arr.push(by[n]); } by[n].v++; });
      arr.sort(function (a, b) { return b.v - a.v; });
      return sec('車検 担当別（今月）', [met('担当', arr.length + '人', 'info')], arr.map(function (x) { return line(x.n, '合格', x.v + '台'); }));
    });

    /* ---- 代車・車販・課 ---- */
    add('loaner', function () {
      var st = P.loanerStat(C.tStr);
      var ef = window.dashLoanerEarliestFree ? dashLoanerEarliestFree(C.today) : null;
      var efs = ef ? (ymd(ef) === C.tStr ? '今日' : mdw(ymd(ef))) : 'なし';
      var soon = 0, lim60 = ymd(addDays(C.today, 60));
      var items = st.loaners.map(function (l) {
        var busy = st.busyFn(l, C.tStr), free14 = 0;
        for (var k = 0; k < 14; k++) if (!st.busyFn(l, ymd(addDays(C.today, k)))) free14++;
        var le = (l.lease && window.pitLeaseEnd) ? pitLeaseEnd(l) : '';
        var warn = !!(le && le <= lim60); if (warn) soon++;
        var sub = subOf(str(l.model), '2週間で空き ' + free14 + '日', le ? 'リースアップ ' + (window.pitLeaseLabel ? pitLeaseLabel(l) : md(le)) : '');
        return line(l.name, sub, busy ? '貸出中' : '空き', warn);
      });
      return sec('代車', [met('今日の空き', st.free + '台', st.free ? 'good' : 'warn'), met('貸出中', st.busy + '台', 'info'), met('最短の空き', efs, 'purple'), met('リースアップ間近', soon + '台', toneN(soon, 'gold'))], items);
    });
    add('carsales', function () {
      var s = P.csStat();
      return sec('車販作業', [met('今日 洗車', s.washToday.length + '台', toneN(s.washToday.length, 'gold')), met('明日 洗車', s.washTomorrow.length + '台', 'info'), met('今週 洗車', s.washWeek.length + '台', 'info'),
                             met('ヘッドライト', s.headlight.length + '台', 'info'), met('コーティング', s.coatReq.length + '台', 'purple'), met('その他依頼', s.salesReq.length + '台', 'info')],
        [].concat(s.washToday.map(function (c) { return row(c, '洗車・今日', md(c.returnDate), true); }),
                  s.washTomorrow.map(function (c) { return row(c, '洗車・明日', md(c.returnDate)); }),
                  s.washWeek.map(function (c) { return row(c, '洗車・今週', md(c.returnDate)); }),
                  s.headlight.map(function (c) { return row(c, 'ヘッドライト', ''); }),
                  s.coatReq.map(function (c) { return row(c, 'コーティング', ''); }),
                  s.salesReq.map(function (c) { return row(c, 'その他依頼', ''); })), 60);
    });
    add('course', function () {
      /* 数え方は mydash.js の「課別タスク」BOXと同じ（boardId × status・返車の段に入った車は外す） */
      var ST = ['check', 'estim', 'contact', 'parts', 'work'], L = P.TASK_LABEL || {};
      function cnt(board) { var o = { _t: 0 }; ST.forEach(function (k) { o[k] = 0; }); C.cards.forEach(function (c) { if (c.boardId === board && !c.returnStage && o[c.status] != null) { o[c.status]++; o._t++; } }); return o; }
      var d1 = cnt('default'), d2 = cnt('import'), items = [];
      [['1課（国産）', d1], ['2課（輸入）', d2]].forEach(function (p) { ST.forEach(function (k) { items.push(line(p[0], L[k] || k, p[1][k] + '台')); }); });
      return sec('課別タスク', [met('1課 作業中', d1._t + '台', 'good'), met('2課 作業中', d2._t + '台', 'purple')], items);
    });
    add('pitlist', function () {
      /* 🆕 v2.111.0 ピットリスト（FlowDesk の状況の列・CoreFlow のBOX）。
         数え方は「課別タスク」と同じ（status で工程・返車の段に入った車は外す）＋作業完了。長くいる車が先 */
      var ST = ['check', 'estim', 'contact', 'parts', 'work', 'workDone'], L = Object.assign({}, P.TASK_LABEL || {}, { workDone: '作業完了' });
      var by = {}; ST.forEach(function (k) { by[k] = []; });
      C.cards.forEach(function (c) { if (by[c.status] && !c.returnStage) by[c.status].push(c); });
      var items = [], n = 0, lim = P.longHoldDays();
      ST.forEach(function (k) {
        n += by[k].length;
        by[k].sort(function (a, b) { return (P.holdDays(b) || 0) - (P.holdDays(a) || 0); }).forEach(function (c) {
          var d = P.holdDays(c);
          items.push(row(c, subOf(L[k] || k, window.pitDivisionLabel ? pitDivisionLabel(c) : ''), d != null ? d + '日目' : '', d != null && d >= lim));
        });
      });
      return sec('ピットリスト', [met('盤面の車', n + '台', 'good')].concat(ST.map(function (k) { return met(L[k] || k, by[k].length + '台', k === 'workDone' ? 'purple' : 'info'); })), items, 60);
    });
    return S;
  }

  /* ---------- 自分（担当者ごと） ----------
     🔴 担当の見分けは mydash.js の個人BOXと同じ＝**名前**で見る（pickP◯◯ に {p:[名前]} を渡す）。
     鍵は state.staff の id（＝ portalMembers の文書id）。CoreFlow 側は自分のメンバーidで引く。 */
  function buildPerUser(C) {
    var P = A(), out = {};
    ((window.state && state.staff) || []).forEach(function (s) {
      if (!s || !s.id || s.isSelf || !s.name) return;
      try {
        var it = { p: [s.name] };
        var pr = P.pickPReserve(it), pt = P.pickPTask(it), pret = P.pickPReturn(it), prs = P.pickPResStaff(it), psl = P.pickPSales(it);
        if (!pr.length && !pt.length && !pret.length && !prs.length && !psl.length) return;
        var L = P.TASK_LABEL || {};
        var todayRes = pr.filter(function (c) { return c.reserveDate === C.tStr; });
        var todayRet = pret.filter(function (c) { return P.retDate(c) === C.tStr; });
        out[s.id] = {
          name: str(s.name),
          metrics: [met('担当の予約', pr.length + '件', 'info'), met('タスク', pt.length + '件', toneN(pt.length, 'gold')),
                    met('返車予定', pret.length + '件', 'info'), met('今月の売上', man(total(psl)) + '（' + psl.length + '台）', 'good')],
          items: [].concat(todayRes.map(function (c) { return row(c, subOf('今日の入庫', wt(c)), c.reserveTime || ''); }),
                           todayRet.map(function (c) { return row(c, subOf('今日の返車', wt(c)), c.returnTime || ''); }),
                           pt.map(function (c) { return row(c, subOf('タスク', wt(c)), L[c.status] || c.status); })).slice(0, PLIM),
          sections: {
            reserve: sec('自分の予約', [met('直近の担当予約', pr.length + '件', 'info'), met('今日', todayRes.length + '件', 'good')],
              pr.map(function (c) { return row(c, wt(c), md(c.reserveDate) + (c.reserveTime ? ' ' + c.reserveTime : ''), c.reserveDate === C.tStr); }), PLIM),
            task: sec('自分のタスク', ['check', 'estim', 'contact', 'parts', 'work'].map(function (k) { return met(L[k] || k, pt.filter(function (c) { return c.status === k; }).length + '件', 'info'); }),
              pt.map(function (c) { return row(c, wt(c), L[c.status] || c.status); }), PLIM),
            ret: sec('自分の返車予定', [met('担当の返車予定', pret.length + '件', 'info'), met('今日', todayRet.length + '件', 'good')],
              pret.map(function (c) { var d = P.retDate(c); return row(c, wt(c), md(d) + (c.returnTime ? ' ' + c.returnTime : ''), d === C.tStr); }), PLIM),
            resstaff: sec('自分が受けた予約（直近10件）', [met('受付した直近', prs.length + '件', 'purple')],
              prs.map(function (c) { return row(c, wt(c), md(c.bookedAt) + ' 受付'); }), PLIM),
            sales: sec('自分の売上（今月）', [met('当月実績', man(total(psl)), 'good'), met('担当台数', psl.length + '台', 'info')],
              psl.map(function (c) { return row(c, wt(c), yen(A().amt(c))); }), PLIM)
          }
        };
      } catch (e) { console.warn('[appSummary:pitflow] perUser ' + s.id, e); }
    });
    return out;
  }

  function build() {
    var P = A(); if (!P) return null;
    var C = P.ctx();
    var S = buildSections(C), pu = buildPerUser(C);
    function pick(k, i) { var x = S[k] && S[k].metrics && S[k].metrics[i]; return x ? x.value : '—'; }
    function tone(k, i) { var x = S[k] && S[k].metrics && S[k].metrics[i]; return x ? x.tone : 'info'; }
    var metrics = [
      met('預かり中', pick('hold', 0), 'good'), met('今日の入庫', pick('intake', 0), 'info'), met('今日の返車', pick('returnout', 0), 'purple'),
      met('当月売上', pick('sales', 0) + '（' + pick('sales', 1) + '）', 'good'),
      met('データチェック 要対応', pick('inspect', 0), tone('inspect', 0)),
      met('長期預かり', pick('longhold', 0), tone('longhold', 0))
    ];
    function tag(label) { return function (x) { return { main: x.main, sub: label + (x.sub ? '・' + x.sub : ''), right: x.right, warn: x.warn, q: x.q }; }; }
    var items = [].concat(((S.intake || {}).items || []).map(tag('入庫')), ((S.returnout || {}).items || []).map(tag('返車'))).slice(0, LIM);
    return { v: 2, metrics: metrics, items: items, sections: S, perUser: pu };
  }
  window._pitflowSummaryBuild = build;   // 見張り・確認用（書き込みはしない）

  function publish() {
    if (!(window.fb && window.fb.db && window.fb.currentUser) || window.PIT_CLOUD !== true) return;
    try {
      var doc = build(); if (!doc) return;
      doc.updatedAt = window.fb.serverTimestamp ? window.fb.serverTimestamp() : firebase.firestore.FieldValue.serverTimestamp();
      var cid = window.fb.currentCompanyId || window.COMPANY_ID || 'kobayashi_motors';
      window.fb.db.collection('companies').doc(cid).collection('appSummaries').doc(KEY)
        .set(doc, { merge: false })
        .catch(function (e) { console.warn('[appSummary:pitflow] 配信できませんでした', e && e.code); });
    } catch (e) { console.warn('[appSummary:pitflow]', e); }
  }
  window._pitflowSummaryPublish = publish;
  var tries = 0;
  var boot = setInterval(function () {
    tries++;
    if (window.PIT_CLOUD === false) { clearInterval(boot); return; }   /* 見本・デモでは配らない */
    var ok = window.fb && window.fb.currentUser && window.PIT_CLOUD === true && window.PIT_DASH_API &&
             window.state && Array.isArray(state.cards) && state.cards.length > 0 && window.PIT_MEMBERS_READY;
    if (ok) { clearInterval(boot); setTimeout(publish, 3000); setInterval(publish, INTERVAL); }
    else if (tries > 240) { clearInterval(boot); }   /* 20分ログインが無ければやめる（次に開いた時にまた待つ） */
  }, 5000);
})();
