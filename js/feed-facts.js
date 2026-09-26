/* ========================================
   feed-facts.js — FlowDesk の通知のもとになる「いまの PitFlow の事実」をサーバーへ渡す（feedFacts/pitflow）v2.111.0
   ----------------------------------------
   🗣 ゆうた 2026-09-14「いいよ　ここでは予定されているものは実行していい」（通知と表示を全アプリ作りきる・1段目 PitFlow）

   ◎なにをするもの
     入庫・返車の時間過ぎ／長期預かり／今日の累積売上／営業目標／個人の受注金額 の通知は、
     サーバーの時計（5分ごと・_サーバー/functions/feed-pit.js）が **ここで置いた事実** を読んで、一人ひとりの設定で出す。
     🔴 **どの車が今日の入庫か・預かり何日目か・今月の売上はいくら か は、PitFlow の物差し（window.PIT_DASH_API）を借りるだけ。**
        サーバーに条件を書き写さない＝PitFlow の画面と通知が食い違わない。

   ◎置き場  companies/{会社}/feedFacts/pitflow
     🔴 **誰も読めない**（サーバーだけ）。個人の受注金額が入るので appSummaries（全員が読める）には置かない。
     書けるのは会社のメンバーが自分の名前（by）で。最後に書いた人の数え方が正（中身はどの端末でも同じ物差し）

   ◎形
     { v, by, day, month, updatedAt,
       staff:{ 名前: メンバーid }, names:{ メンバーid: 名前 }, memberDivs:{ メンバーid: [div1…] }, divLabels:{ div1:'1課' … },
       cards:{ カードid: { t:'山田様 プリウス', div, staff:[メンバーid] } },          … 今動いている車だけ
       intake:[{ id, time }],   … 今日の入庫予定で、まだ入庫していない・時刻がある車
       ret:[{ id, time }],      … 今日の返車予定で、まだ返車していない・時刻がある車
       hold:[{ id, days }],     … 預かり中の車と日数
       🆕 2026-09-19 受付まわりの8つ（どれも PIT_DASH_API の物差しから作る）
       retTbd:[{id}], retTimeTbd:[{id}],   … 返車日未定／返車時間未定（受付が決めに行く車）
       thanks:[{id}],                      … その日のお礼LINEで、まだ送っていない人
       sameDay:[{id,time}],                … その日の 待ち・当返 で、まだ返していない車
       shakenCand:[{id}], shakenUnset:[{id}], … 車検の「行ける日候補が出た」／「店にいるのに予定なし」
       loaner:[{id,rem}],                  … 代車の残り日数（マイナス＝超過）
       dataCheck:{ n, red, amber },        … PitFlow のデータチェックで見つかっている数
       sales:{ sum, goalMin, goalMax, today, byDiv:{div:金額}, byStaff:{メンバーid:{order, sales}} } }

   🔴 本番（PIT_CLOUD）でログインしている時だけ置く。見本データを本番に混ぜない
   ⚠ 1分ごとに作り直して、中身が変わった時だけ書く（最低でも10分に1回は書く＝サーバーが「古い」と判断しないように）
   ======================================== */
(function () {
  'use strict';
  var KEY = 'pitflow', CHECK_MS = 60 * 1000, KEEPALIVE_MS = 10 * 60 * 1000;
  var ACTIVE = ['check', 'estim', 'contact', 'parts', 'work', 'workDone', 'outsource'];

  function A() { return window.PIT_DASH_API; }
  function str(v) { return v == null ? '' : String(v); }
  function hm(s) { var m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(str(s).trim()); return m ? ('0' + (+m[1])).slice(-2) + ':' + m[2] : ''; }
  function title(c) { var P = A(); return (str(P.nm(c)) + '様 ' + str(P.carOf(c))).trim(); }

  function build() {
    var P = A(); if (!P || !window.state) return null;
    var C = P.ctx();
    var staff = {}, names = {}, memberDivs = {};
    ((state.staff) || []).forEach(function (s) {
      if (!s || !s.id || s.isSelf || !s.name) return;
      staff[String(s.name).trim()] = s.id; names[s.id] = String(s.name);
      var ds = Array.isArray(s.divisions) ? s.divisions : (s.division ? [s.division] : []);
      if (ds.length) memberDivs[s.id] = ds.slice(0, 4);
    });
    var divLabels = {};
    (window.PIT_DIVS || []).forEach(function (d) { divLabels[d.id] = (window.pitDivisionLabelById && pitDivisionLabelById(d.id)) || d.label; });
    function staffIds(c) {
      var out = [];
      [c.frontStaff, c.staff].forEach(function (nm) { var id = staff[str(nm).trim()]; if (id && out.indexOf(id) < 0) out.push(id); });
      return out;
    }
    var cards = {};
    function keep(c) { if (c && c.id && !cards[c.id]) cards[c.id] = { t: title(c), div: str(c.division), staff: staffIds(c) }; }

    var intake = P.pickIntake().filter(function (c) { return c.status === 'reserved' && hm(c.reserveTime); })
      .map(function (c) { keep(c); return { id: c.id, time: hm(c.reserveTime) }; });
    var ret = P.pickReturnOut().filter(function (c) { return c.status !== 'returned' && hm(c.returnTime); })
      .map(function (c) { keep(c); return { id: c.id, time: hm(c.returnTime) }; });
    var hold = P.pickHold().map(function (c) { var d = P.holdDays(c); keep(c); return { id: c.id, days: d == null ? 0 : d }; });
    (C.cards || []).forEach(function (c) { if (ACTIVE.indexOf(c.status) >= 0 || c.status === 'reserved') keep(c); });

    /* 売上＝PitFlow の「売上（今月）」BOXと同じ物差し（実績＝返車済みで、実績カウント日が今月） */
    var act = P.pickResultMonth ? C.cards.filter(function (c) { var d = P.countDate(c); return c.status === 'returned' && d >= C.moS && d <= C.moE; }) : [];
    var sum = 0, today = 0, byDiv = {};
    act.forEach(function (c) {
      var a = +P.amt(c) || 0; sum += a;
      if (P.countDate(c) === C.tStr) today += a;
      if (c.division) byDiv[c.division] = (byDiv[c.division] || 0) + a;
    });
    var byStaff = {};
    ((state.staff) || []).forEach(function (s) {
      if (!s || !s.id || s.isSelf || !s.name) return;
      var it = { p: [s.name] };
      var sales = P.pickPSales(it).reduce(function (x, c) { return x + (+P.amt(c) || 0); }, 0);
      var open = P.pickOrder().filter(function (c) { return str(P.taskStaff(c)) === s.name; }).reduce(function (x, c) { return x + (+P.amt(c) || 0); }, 0);
      if (sales || open) byStaff[s.id] = { sales: sales, order: sales + open };
    });
    /* =================================================================
       🆕 2026-09-19 受付まわりの8つの通知のもと（FlowDesk 画面 v1.18.0）
       🗣 ゆうた「通知の項目自体をふやすのもあり」→ 8つ選んでもらった物
       🔴 **どれも物差しは PIT_DASH_API から借りるだけ**（条件をここで書き写さない）
          ＝ PitFlow の画面で見える物と、通知で言う事が食い違わない
       ================================================================= */
    var idsOf = function (list) { return (list || []).map(function (c) { keep(c); return { id: c.id }; }); };
    /* 返車日未定・返車時間未定＝受付が「決めに行く」車（mydash の同じ BOX と同じ物差し） */
    var retTbd = idsOf(P.pickRetDateTbd ? P.pickRetDateTbd() : []);
    var retTimeTbd = idsOf(P.pickRetTimeTbd ? P.pickRetTimeTbd() : []);
    /* お礼LINE＝その日返した車のうち、まだ送っていない人（pitThanksNeeded／pitThanksSent が物差し） */
    var thxAll = P.thxList ? P.thxList(C.tStr) : [];
    var thanks = idsOf(P.thxLeft ? P.thxLeft(thxAll) : []);
    /* 当返・待ち＝その日のうちに返す車で、まだ返していない物 */
    var sameDay = (C.cards || []).filter(function (c) {
      return c.reserveDate === C.tStr && (c.dropType === 'wait' || c.dropType === 'sameDay') && c.status !== 'returned' && c.status !== 'scrap' && c.status !== 'cancelled';
    }).map(function (c) { keep(c); return { id: c.id, time: hm(c.reserveTime) }; });
    /* 車検＝行ける日候補が出た物／店にいるのに予定が無い物（shakenStat が物差し） */
    var sk = P.shakenStat ? P.shakenStat() : { candList: [], unsetList: [] };
    var shakenCand = idsOf(sk.candList), shakenUnset = idsOf(sk.unsetList);
    /* 代車＝返す日を過ぎた／残りわずか（pitLoanerRemainOf が物差し。ここで日付を引き算しない） */
    var loaner = [];
    (C.cards || []).forEach(function (c) {
      if (!c || !(window.pitLoanerOf ? pitLoanerOf(c) : c.needLoaner)) return;
      if (c.status === 'returned' || c.status === 'scrap' || c.status === 'cancelled') return;
      var R2 = window.pitLoanerRemainOf ? pitLoanerRemainOf(c) : null;
      if (!R2 || R2.back || R2.rem == null) return;
      keep(c); loaner.push({ id: c.id, rem: R2.rem });
    });
    /* データの抜け＝PitFlow のデータチェックと同じ数（insStat） */
    var ins = P.insStat ? P.insStat() : null;
    var tg = (state.settings && state.settings.target) || {};
    return {
      v: 1, day: C.tStr, month: C.tStr.slice(0, 7),
      staff: staff, names: names, memberDivs: memberDivs, divLabels: divLabels,
      cards: cards, intake: intake, ret: ret, hold: hold,
      retTbd: retTbd, retTimeTbd: retTimeTbd, thanks: thanks, sameDay: sameDay,
      shakenCand: shakenCand, shakenUnset: shakenUnset, loaner: loaner,
      dataCheck: ins ? { n: ins.n || 0, red: ins.red || 0, amber: ins.amber || 0 } : null,
      sales: { sum: sum, goalMin: +tg.monthMin || 0, goalMax: +tg.monthMax || 0, today: today, byDiv: byDiv, byStaff: byStaff }
    };
  }
  window._pitFeedFactsBuild = build;   // 見張り・確認用（書き込みはしない）

  var lastJson = '', lastAt = 0;
  function publish(force) {
    if (!(window.fb && window.fb.db && window.fb.currentUser && window.fb.currentMember && window.fb.currentMember.id) || window.PIT_CLOUD !== true) return;
    try {
      var doc = build(); if (!doc) return;
      var json = JSON.stringify(doc), now = Date.now();
      if (!force && json === lastJson && now - lastAt < KEEPALIVE_MS) return;   /* 変わっていなければ書かない（10分に1回は書く） */
      doc.by = window.fb.currentMember.id;
      doc.updatedAt = window.fb.serverTimestamp ? window.fb.serverTimestamp() : firebase.firestore.FieldValue.serverTimestamp();
      var cid = window.fb.currentCompanyId || window.COMPANY_ID || 'kobayashi_motors';
      lastJson = json; lastAt = now;
      window.fb.db.collection('companies').doc(cid).collection('feedFacts').doc(KEY).set(doc)
        .catch(function (e) { lastJson = ''; console.warn('[feedFacts:pitflow] 置けませんでした', e && e.code); });
    } catch (e) { console.warn('[feedFacts:pitflow]', e); }
  }
  window._pitFeedFactsPublish = publish;
  var tries = 0;
  var boot = setInterval(function () {
    tries++;
    if (window.PIT_CLOUD === false) { clearInterval(boot); return; }   /* 見本・デモでは置かない */
    var ok = window.fb && window.fb.currentUser && window.PIT_CLOUD === true && window.PIT_DASH_API &&
             window.state && Array.isArray(state.cards) && state.cards.length > 0 && window.PIT_MEMBERS_READY;
    if (ok) { clearInterval(boot); setTimeout(function () { publish(true); }, 4000); setInterval(function () { publish(false); }, CHECK_MS); }
    else if (tries > 240) { clearInterval(boot); }
  }, 5000);
})();
