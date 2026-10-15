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
  /* 🏷 v2.13.0 `desc` ＝**その印の意味**（ゆうた 2026-08-25 口述）。
     作業タイプ・付加と**同じ形**で持つ＝画面はどのマスターからでも同じように読める。
     ⚠ `note` は前からある短い添え書き。`desc` のほうが「なぜこれを押すか」。 */
  w.PIT_INTERN_KINDS = [
    { id: 'used',      label: '中古', note: '自社の販売車両',
      desc: '自社販売の中古車の納車整備時に付与（オーダー販売時の整備伝票有の場合は該当しない）',
      solo: true,  msg: 'この車両は自社の販売車両なので、そのまま実績化します' },
    { id: 'loanercar', label: '代車', note: '自社の代車（作業タイプとセット）',
      desc: '自社代車の整備時に使用',
      solo: false, msg: 'この車両は自社代車車両なので、そのまま実績化します' },
    { id: 'inhouse',   label: '内部', note: '中古でも代車でもない社内の車',
      desc: 'その他社長愛車など伝票が起きない時に使用',
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
  /* 🏢🔴 v2.187.0（棚卸し A-25／A-26・ゆうた決定 2026-10-15）**社内車両の実績化の物差し（純粋な関数）。**
     読むだけ・何も書かない。PitFlow（下の pitInternReturn）も MHS も、これの答えを当てる＝必ず同じ結果。
     ctx = { today:'YYYY-MM-DD' }
     返す＝ { ok, skip, ask, patch, logLines, audit, toast }（形は pit-share.js の pitMaintIntakePlan と同じ）
     ⚠ 完TELの関門（pitReturnCanDone）は呼ぶ側の道が見る（ドラッグで完TELへ入れる道は関門そのものなので）。 */
  w.pitInternReturnPlan = function (c, ctx) {
    if (!w.pitCardIntern(c)) return { ok: false, skip: true };
    var t = String((ctx && ctx.today) || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return { ok: false, code: 'PF-4012', why: '今日の日付が分かりません' };
    var patch = {
      status: 'returned',
      returnStage: '',
      returnDate: c.returnDate || t,
      completedAt: t,
      amountFinal: ''                          /* 社内車両は金額を持たない */
    };
    var audit = [{ action: '社内車両を実績化した', kind: 'out',
                   label: w.pitInternLabel(c) + (c.car ? ' / ' + c.car : '') + '　実績日 ' + t }];
    /* 🔧 v2.45.0（ゆうた指定）**残りの整備の候補が消えるのはここ＝完TEL関門を通った時。**（入庫した時ではない）
       片付け方は pit-share.js の pitMaintCompleteSpans 1本（終わりの日＝返車日→実績日） */
    var isMaint = w.pitCardMaint ? w.pitCardMaint(c) : !!(c.internKind === 'loanercar' && Array.isArray(c.maintSpans));
    if (isMaint && !w.pitMaintCompleteSpans){
      /* 片付けの物差し（pit-share.js）が古い＝同じ結果を約束できない。MHS は「PitFlow で開く」へ落とす */
      return { ok: false, code: 'PF-4013', why: '代車の整備は PitFlow で返車してください（部品が古い）', needPitFlow: true };
    }
    if (isMaint){
      var cs = w.pitMaintCompleteSpans(c, patch.returnDate || t);
      patch.maintSpans = cs.spans;
      if (cs.gone) audit.push({ action: '整備が終わったので残りの候補を消した', kind: 'loaner', label: '候補 ' + cs.gone + '本' });
    }
    var was = w.pitStatusJa ? w.pitStatusJa(c.status) : String(c.status || '');   /* v2.187.1 PitFlow と MHS で同じ日本語（表は pit-share.js 1本） */
    return {
      ok: true,
      ask: { msg: w.pitInternMsg(c), title: '社内車両', ok: 'OK',
             detail: '売上・完TEL・洗車・伝票はありません。実績カレンダーの「数えない」側に残ります。' },
      patch: patch,
      logLines: ['実績化（社内車両・売上なし・' + (was || '—') + ' → 返車済み・実績日 ' + t + '）'],
      audit: audit,
      toast: '実績にしました（売上には数えません）'
    };
  };
  function _todayYmd(){
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  w.pitInternReturn = function (c) {
    if (!w.pitCardIntern(c)) return false;
    var plan0 = w.pitInternReturnPlan(c, { today: _todayYmd() });
    /* v2.187.1 物差しが「できない」と言った時は ask が無い＝理由を出して止める（引き取った＝呼んだ側は進めない） */
    if (!plan0.ok || !plan0.ask) {
      if (w.pitAlert) w.pitAlert(plan0.why || '実績にできませんでした', { code: plan0.code || 'PF-4012' });
      else if (w.pitToast) w.pitToast(plan0.why || '実績にできませんでした', plan0.code);
      return true;
    }
    var go = function () {
      var plan = w.pitInternReturnPlan(c, { today: _todayYmd() });   /* 聞いている間に日が変わっても今日で */
      if (!plan.ok) { if (w.pitToast) w.pitToast(plan.why || '', plan.code); return; }
      Object.keys(plan.patch).forEach(function (k) { c[k] = plan.patch[k]; });
      plan.logLines.forEach(function (x) { if (w.logFlow) w.logFlow(c, x); });
      if (w.PitDB) w.PitDB.save();
      if (w.state && w.state.currentView && w.showView) w.showView(w.state.currentView);
      if (w.PitPip && w.PitPip.isOpen && w.PitPip.isOpen()) w.PitPip.refresh();
      plan.audit.forEach(function (a) { if (w.pitLog) w.pitLog(a.action, { cardId: c.id, kind: a.kind, label: a.label }); });
      if (w.pitToast) w.pitToast(plan.toast);
    };
    if (w.pitAsk) w.pitAsk(plan0.ask.msg, { title: plan0.ask.title, ok: plan0.ask.ok, detail: plan0.ask.detail }).then(function (yes) { if (yes) go(); });
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
