/* ========================================
   intern-pit.js  -  社内車両（売上が立たないカード）の物差し   PitFlow v2.6.0
   ----------------------------------------
   ◎なにをするもの（2026-08-24・ゆうた指定）
     予約カードに「**社内区分**」を1つだけ付けられるようにする。
     　**中古**    … 自社の販売車両の整備（買ってくれたお客様の名前で立てる）
     　**代車**    … 自社の代車の整備（車検/12点/一般/B.P のどれか1つとセット）
     　**内部**    … 中古でも代車でもない社内の車
     この印が付いたカードは **お金のやり取りが1円も無い**。
     　・金額を聞く窓を出さない（工程を動かしても素通り）
     　・完TEL・洗車・伝票・表紙の印刷が無い
     　・概算金額／概算預かり日数／代車の貸出は入れられない
     　・売上に数えない（金額も台数も）
     　・でも **実績にはする**（アーカイブとして実績カレンダーの「数えない」側に乗る）

   🔴🔴 **数えない物差しは `pitCardNoSale()` 1本のまま。** ここでは作らない。
        `pit-share.js` の `pitCardNoSale` が「手で売上なしにした」か「社内車両」かを
        まとめて見る形にしてある。＝売上ビュー・作業サマリー・整備ダッシュ・マイダッシュ・
        クォーター突合（フロントマンPDF）・データチェック・期限の見張り・アーカイブ・来店履歴
        の **約20か所を1行も触らずに** 外せる。
        ⚠ 画面ごとに `c.internKind` を直に見ないこと。聞くのは下の関数に。

   ◎持ち方
     `c.internKind` … '' / 'used' / 'loanercar' / 'inhouse'（**1つだけ**）
     代車の相方は今までどおり `c.workType` / `c.workAddons`（新しい入れ物は作らない）

   ◎「社員」は別物
     社員は 保証・保険と同じ **付加**（`c.workSpecials` に入る）。売上も実績も**通常どおり**。
     効くのはデータチェックだけ（社割で金額が動くので、肌感の金額規則から外す）。
   ======================================== */
(function (w) {
  'use strict';

  /* 社内区分のマスター。増やすときはここ（作業タイプと同じ考え方＝コードが正） */
  w.PIT_INTERN_KINDS = [
    { id: 'used',      label: '中古', note: '自社の販売車両',
      solo: true,  msg: 'この車両は自社の販売車両なので、そのまま実績化します' },
    { id: 'loanercar', label: '代車', note: '自社の代車（作業タイプとセット）',
      solo: false, msg: 'この車両は自社代車車両なので、そのまま実績化します' },
    { id: 'inhouse',   label: '内部', note: '中古でも代車でもない社内の車',
      solo: true,  msg: 'この車両は社内車両なので、そのまま実績化します' }
  ];

  /* 🚙 代車の相方＝この4つだけ（ゆうた指定「代車車検・代車12点・代車一般・代車BP」）。
     ⚠ オイル・1Y・3M は代車では選ばせない。 */
  w.PIT_LOANER_MATES = ['shaken', '12pt', 'general', 'bp'];

  function kindOf(c){
    var k = c && c.internKind ? String(c.internKind) : '';
    return w.PIT_INTERN_KINDS.some(function (x) { return x.id === k; }) ? k : '';
  }
  function defOf(c){
    var k = kindOf(c); if (!k) return null;
    return w.PIT_INTERN_KINDS.filter(function (x) { return x.id === k; })[0] || null;
  }

  /* 🔴 社内車両かどうか。**聞くのはここ1本**（画面で c.internKind を直に見ない） */
  w.pitInternKind  = kindOf;
  w.pitCardIntern  = function (c) { return !!kindOf(c); };

  /* 代車の相方（車検/12点/一般/B.P のうち、いま選ばれている1つ）。無ければ '' */
  w.pitInternMate = function (c) {
    if (kindOf(c) !== 'loanercar') return '';
    var ids = [];
    if (c && c.workType) ids.push(c.workType);
    if (c && Array.isArray(c.workAddons)) ids = ids.concat(c.workAddons);
    for (var i = 0; i < ids.length; i++){
      if (w.PIT_LOANER_MATES.indexOf(ids[i]) >= 0) return ids[i];
    }
    return '';
  };

  /* 画面に出す名前。代車は相方をくっつけて「代車車検」「代車BP」のように出す。 */
  w.pitInternLabel = function (c) {
    var d = defOf(c); if (!d) return '';
    if (d.id !== 'loanercar') return d.label;
    var m = w.pitInternMate(c); if (!m) return d.label;
    var wt = ((w.state && w.state.workTypes) || []).filter(function (x) { return x.id === m; })[0];
    var lb = wt ? String(wt.label).replace(/\./g, '') : m;   /* B.P → BP */
    return d.label + lb;
  };

  /* 実績化するときに出す一言 */
  w.pitInternMsg = function (c) {
    var d = defOf(c);
    return d ? d.msg : '';
  };

  /* 🔧 社内区分を付け替える（画面はこれを呼ぶ）。中身のつじつまもここで取る。
     ・中古／内部 … 作業タイプ（基本・併用可）を全部おろす（単独で立つ）
     ・代車       … 相方4つ以外の作業タイプをおろす（相方は画面で選ばせる）
     ・どの区分でも … 概算金額・概算預かり日数・代車の貸出を空にする（入れられない項目） */
  w.pitInternSet = function (c, kind) {
    if (!c) return;
    var k = String(kind || '');
    if (!w.PIT_INTERN_KINDS.some(function (x) { return x.id === k; })) k = '';
    c.internKind = k;
    if (!k) return;

    var keep = (k === 'loanercar') ? w.PIT_LOANER_MATES : [];
    if (c.workType && keep.indexOf(c.workType) < 0) c.workType = null;
    if (Array.isArray(c.workAddons)) {
      c.workAddons = c.workAddons.filter(function (a) { return keep.indexOf(a) >= 0; });
    }
    /* 代車は相方1つだけ＝基本と併用可に同時に残さない */
    if (k === 'loanercar' && c.workType && Array.isArray(c.workAddons) && c.workAddons.length) {
      c.workAddons = [];
    }
    /* 付加（保証・保険・社員）も外す＝社内区分を選んでいる間は押せない決まりなので、残さない */
    if (Array.isArray(c.workSpecials) && c.workSpecials.length) c.workSpecials = [];
    /* お金と貸出は持たない */
    c.estAmount = ''; c.estHoldDays = '';
    c.feeAmount = ''; c.earlyDiscount = false;
    c.needLoaner = false; c.loanerId = ''; c.loanerFrom = ''; c.loanerTo = '';
    c.loanerFixed = false;
  };

  /* 🏁 完TEL済／完TEL依頼へドラッグした時＝**窓は1枚だけ出して、そのまま実績にする**。
     戻り値 true ＝ここで引き取った（呼び出し元は return する）。
     ⚠ 金額は1円も入れない。洗車・お礼LINE・売上日も触らない。
     ⚠ 実績日（completedAt）は今日。実績カレンダーの「数えない」側に出る。 */
  w.pitInternReturn = function (c) {
    if (!w.pitCardIntern(c)) return false;
    var msg = w.pitInternMsg(c);
    var det = '売上・完TEL・洗車・伝票はありません。実績カレンダーの「数えない」側に残ります。';
    var go = function () {
      var t = (typeof w.ymd === 'function') ? w.ymd(new Date()) : '';
      c.status      = 'returned';
      c.returnStage = '';
      c.returnDate  = c.returnDate || t;
      c.completedAt = t;
      c.amountFinal = '';                       /* 社内車両は金額を持たない */
      if (w.logFlow && typeof w.statusLabel === 'function') w.logFlow(c, '実績化（社内車両・売上なし）');
      if (w.PitDB) w.PitDB.save();
      if (w.state && w.state.currentView && w.showView) w.showView(w.state.currentView);
      if (w.PitPip && w.PitPip.isOpen && w.PitPip.isOpen()) w.PitPip.refresh();
      if (w.pitLog) w.pitLog('社内車両を実績化した', {
        cardId: c.id, kind: 'out',
        label: w.pitInternLabel(c) + (c.car ? ' / ' + c.car : '')
      });
      if (w.pitToast) w.pitToast('実績にしました（売上には数えません）');
    };
    if (w.pitAsk) w.pitAsk(msg, { title: '社内車両', ok: 'OK', detail: det }).then(function (yes) { if (yes) go(); });
    else go();
    return true;
  };

  /* 数える／数えないの内訳（売上ビュー・作業サマリーの「参考」1行が使う）。
     ◎なにに使うか（ゆうた 2026-08-24）
       「中古車の整備があったから今月は売上が少し届かなかった」の裏付け。
       ＝ **売上の数字のすぐ脇**に台数だけ出す。金額は1円も混ぜない。
     引数は「その月に数える対象のカード配列」。返すのは {total, used, loanercar, inhouse, noSale}。 */
  w.pitInternCount = function (cards) {
    var r = { total: 0, used: 0, loanercar: 0, inhouse: 0, noSale: 0 };
    (cards || []).forEach(function (c) {
      var k = kindOf(c);
      if (k) { r[k]++; r.total++; return; }
      if (w.pitCardNoSale && w.pitCardNoSale(c)) { r.noSale++; r.total++; }
    });
    return r;
  };

  /* 「参考：社内車両 ◯台（中古2・代車3・内部1）／売上なし1」の文字を作る。空なら '' */
  w.pitInternCountText = function (cards) {
    var r = w.pitInternCount(cards);
    if (!r.total) return '';
    var parts = [];
    if (r.used)      parts.push('中古' + r.used);
    if (r.loanercar) parts.push('代車' + r.loanercar);
    if (r.inhouse)   parts.push('内部' + r.inhouse);
    if (r.noSale)    parts.push('売上なし' + r.noSale);
    return '参考：数えていない ' + r.total + '台（' + parts.join('・') + '）';
  };
})(window);
