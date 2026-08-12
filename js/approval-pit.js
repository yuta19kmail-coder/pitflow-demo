/* ========================================
   approval-pit.js  -  新規予約の「承認」制度（v1.74.0）
   ----------------------------------------
   ◎ゆうた指定（そのまま）
     ・新規予約で承認という制度を新規作成。通常どおり入力していって、最終保存の所で
       「その他保存」に **新規で 承認に回して保存 を追加**
     ・この時点で **入庫カレンダーや代車は枠として埋まる**
     ・仮予約の「仮」と同じ要領で **「承」** を付ける
     ・予約ビューの未定欄に **承認待ちBOX** を新設し、そこにカードが並ぶ
     ・そこから予約内容を開くと **承認して印刷して保存** ボタンがあり、
       承認者が内容を確認・表紙印刷する。ここまで行くと承認マークが取れて
       **本予約として承認BOXから消え、通常の予約と同じになる**
     ・承認者は **アカウントの縛りなし。だれでも承認を出せる**
       ※ あくまでリアル業務の方でルール化する

   ◎決めごと（2026-08-10 ゆうた確定）
     🔴 **仮予約とは別物。** 承認に回した予約は「仮」ではなく**本予約扱い**（枠は埋まる）で、
        承認待ちの印だけが付く。だから `tentative` とは**同時に立てない**。
     🔴 **承認待ちのまま入庫日が来てタスクボードへ動かしたら、1回だけ聞いて通す**（現場を止めない）。
        通したあとも承認待ちの印は残る＝あとから承認できる。
     🔴 **押した人の名前はフローに残す**（アカウントで縛らない代わりに、記録で追える）。
     🔴 印は **案A＝青の丸「承」**（仮＝オレンジと一目で見分けられる）。
        ⚠ **カード詳細だけは印を出さず、文字で「承認待」**（ゆうた指定。仮予約側も「仮予約」の文字だけに揃えた）。

   ◎保存の形
     ・**`approvalPending`（true/false）だけ。** 承認した人・日時は**フローに残すので項目にしない**（写しを作らない）。

   ◎この1本が持つもの（各画面は呼ぶだけ）
     pitApprovalPending(c)          … 承認待ちか
     pitApprovalBadge(c, where)     … 印のHTML（name/mini/edge/lo/hover/stamp）
     pitApprovalCardCls(c)          … カードに足すクラス
     pitApproveCard(id, alsoPrint)  … 承認する（＝印を外す）
     pitAskApprovalBeforeIntake(c, next) … 入庫の前に1回だけ聞く
   ======================================== */
(function () {
  'use strict';

  function pending(c){ return !!(c && c.approvalPending); }
  window.pitApprovalPending = pending;

  /* 🔵 印＝青の丸「承」。出る場所で大きさだけ変える（CSSは polish.css）。
     🔴 印のHTMLを組み立てるのはここだけ。画面ごとに書き写さない。 */
  var CLS = {
    name : 'appr-name',      /* 予約カード＝「様」のすぐ後ろ */
    mini : 'appr-mini',      /* 週ビューのミニカード＝バッジ群の右 */
    edge : 'appr-edge',      /* 月／2ヶ月カレンダーの行＝右端 */
    lo   : 'appr-lo',        /* 代車カレンダーのバー */
    hover: 'ph-b appr-hb',   /* ホバー情報カードのバッジ列 */
    stamp: 'appr-stamp'      /* 予約標準カード＝上寄り中央の丸スタンプ */
  };
  function badge(c, where){
    if (!pending(c)) return '';
    return '<span class="' + (CLS[where] || CLS.name) + '" title="承認待ち">承</span>';
  }
  window.pitApprovalBadge = badge;

  /* カードの左ボーダー＝仮予約は点線、承認待ちは二重線（色は課の色のまま） */
  function cardCls(c){ return pending(c) ? ' is-approval' : ''; }
  window.pitApprovalCardCls = cardCls;

  function _me(){
    try { if (window.pitFlowMe) return pitFlowMe() || ''; } catch(e){}
    return '';
  }

  /* ===================================================================
     ✓ 承認する＝印を外して、ふつうの予約に戻す
     ・alsoPrint … true なら表紙を印刷してから承認（ゆうたの本線）
     🔴 承認できるのは誰でも。**止めない。**（ルールは現場側で決める＝ゆうた指定）
     ⚠ 誰が承認したかは必ずフローと操作ログに残す。
     =================================================================== */
  function approve(id, alsoPrint){
    var c = (window.state && state.cards) ? state.cards.find(function(x){ return x.id === id; }) : null;
    if (!c) return;
    if (!pending(c)) return;                       /* 二度押し・すでに承認済みは何もしない */

    if (alsoPrint && window.pitPrintCover){
      try { pitPrintCover(c.id); } catch(e){}
    }
    c.approvalPending = false;

    var who = _me();
    var txt = '承認した' + (alsoPrint ? '（表紙を印刷）' : '（印刷なし）') + (who ? '／' + who : '');
    try { if (window.logFlow) logFlow(c, txt); } catch(e){}
    try {
      if (window.pitLog) pitLog('予約を承認した', { cardId: c.id, kind: 'approval',
        label: ((window.pitCustName ? pitCustName(c) : c.customer) || '') + ' 様' + (c.car ? ' / ' + c.car : '') });
    } catch(e){}

    try { if (window.PitDB) PitDB.save(true); } catch(e){}
    try { if (window.state && state.currentView && window.showView) showView(state.currentView); } catch(e){}
    try { if (window.renderCardView && document.getElementById('md-body-modal')) renderCardView(c, 'md-body-modal'); } catch(e){}
    try { if (window.pitToast) pitToast('✓ 承認しました' + (alsoPrint ? '（表紙を印刷しました）' : '')); } catch(e){}
  }
  window.pitApproveCard = approve;

  /* ===================================================================
     🚪 承認待ちのまま入庫させようとした時＝**1回だけ聞いて通す**（ゆうた指定）
     ⚠ 止めない。承認者が不在の日に現場が動けなくなるほうが困る。
     ⚠ 通しても印は残る（あとから承認できる）。
     使い方＝ pitAskApprovalBeforeIntake(card, function(){ ここに本来の処理 });
     =================================================================== */
  function askBeforeIntake(c, next){
    if (!pending(c)) { next(); return; }
    var msg    = 'この予約は承認待ちです。このまま入庫（点検待ち）にしますか？';
    var detail = '※ 進めても承認待ちの印は残ります。あとから承認できます。';
    if (window.UI && UI.confirm){
      UI.confirm(msg, { title: 'まだ承認されていません', detail: detail, ok: 'このまま入庫する', cancel: 'やめる' })
        .then(function(ok){ if (ok) next(); });
      return;
    }
    if (window.confirm(msg + '\n\n' + detail)) next();
  }
  window.pitAskApprovalBeforeIntake = askBeforeIntake;

  /* ===================================================================
     🧾 予約詳細のいちばん上に出す「承認バー」
     ⚠ ここだけは**丸い印を出さない**（ゆうた指定：カード詳細は文字だけ）。
     =================================================================== */
  function barHtml(c){
    if (!pending(c)) return '';
    return '<div class="cv-apbar">'
      + '<div class="cv-apt">この予約は承認待ちです</div>'
      + '<div class="cv-apnote">内容を確認して、問題なければ承認してください。承認すると印が取れて、ふつうの予約になります（承認待ちBOXからも消えます）。</div>'
      + '<div class="cv-apacts">'
      +   '<button type="button" class="cv-apok" onclick="pitApproveCard(\'' + c.id + '\', true)"><i data-ic=printer data-ics=16></i> 承認して印刷して保存</button>'
      +   '<button type="button" class="cv-apsub" onclick="pitApproveCard(\'' + c.id + '\', false)"><i data-ic=check data-ics=16></i> 承認のみ（刷らない）</button>'
      +   '<span class="cv-apwho">承認した人の名前はフローに残ります</span>'
      + '</div></div>';
  }
  window.pitApprovalBarHtml = barHtml;

})();
