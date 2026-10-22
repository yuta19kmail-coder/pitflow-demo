/* ========================================
   sales.js  -  売上ビュー（PitFlow）の受け口
   ----------------------------------------
   🧩 2026-10-20 PitFlow v2.195.0（ゆうた指定）**売上ビューの中身は共通部品へ移した。**
     🗣「MHS の MH実績の PitFlow タブには、PitFlow の月次売上の画面を**そのまま**出す」
       ＝ iframe はログインの入口が違って詰まる。見た目と中身は同じまま、仕組みを _shared の共通部品にして両方が使う。
     ・本体＝ _shared\coreflow-pit-sales.js（売上・クォーター・作業内容・フロント・来店属性・AIレポートのタブ）
             _shared\coreflow-pit-visit.js（来店属性）／_shared\coreflow-pit-airep.js（AIレポートの描き方）
             見た目＝ _shared\coreflow-pit-sales.css・coreflow-pit-visit.css・coreflow-pit-airep.css
     ・🔴 **直す時は _shared を直して sync-shared.ps1。** js/coreflow-pit-*.js は配られた写し（直すと次の配布で消える）
     ・中身・数え方・文言は1文字も変えていない（見張り＝_見張り/test_sales_shared.mjs が、PitFlow と借りる側の絵を突き合わせる）
     ・PitFlow に残っている物＝AIレポートの書き出し（sales-ai.js）・紙（sales-print.js）・数え方の物差し（sales-count.js ほか）
   ・ここは「PitFlow のデータ（window.state）と描く場所（#view-sales-body）で使う」と部品に伝えるだけ。
     今までの呼び口（renderSales・pitSalesMonthCollect・svReportModel・svSetTab …）は部品がそのまま出している。
   ======================================== */
(function(){
  'use strict';
  if (!window.CFPitSales) { if (window.console) console.error('[PitFlow] 売上ビューの部品（coreflow-pit-sales.js）が読めていない'); return; }
  CFPitSales.setup({});   /* 何も渡さない＝ window.state と #view-sales-body・月送りは PitFlow の ◀▶・タブと PDF は全部 */
})();
