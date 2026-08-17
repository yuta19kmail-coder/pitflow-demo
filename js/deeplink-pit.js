/* ========================================
   deeplink-pit.js  -  カードへの直リンク（?card=<カードID>）  PitFlow v1.18.0
   ----------------------------------------
   ◎なにをするもの
     `https://pitflow.kobayashi-motors.com/?card=c1750000000` のように開くと、
     そのカードの詳細をいきなり開く。**MHS の Todayボードの「詳細を見る」**が
     ここへ飛んでくる（他アプリからカードを指せるようにするための入口）。

   ◎なぜ「待つ」作りなのか
     本番モードでは、ログイン → クラウド読み込み が終わるまで state.cards は空。
     なので「カードが state に入るまで少しずつ様子を見る」方式にした。
     見つかったら開いて終わり。見つからないまま時間切れになったら、
     短いお知らせを出すだけで**何も壊さない**（ふつうにトップが開いているだけ）。

   ◎お約束
     ・既存のコードには一切触らない。読み込むだけで効く。
     ・開いたらアドレスから ?card= を消す（再読み込みで二重に開かない・共有もしやすい）。
   ======================================== */
(function () {
  'use strict';

  var m = /[?&]card=([^&#]+)/.exec(location.search || '');
  if (!m) return;

  var id = '';
  try { id = decodeURIComponent(m[1]); } catch (e) { id = m[1]; }
  if (!id) return;

  var WAIT_MS  = 25000;   // 最長で待つ時間（ログイン＋クラウド読み込みぶん）
  var STEP_MS  = 300;
  var started  = Date.now();

  function stripParam(){
    try {
      var u = new URL(location.href);
      u.searchParams.delete('card');
      history.replaceState(null, '', u.pathname + (u.search || '') + (u.hash || ''));
    } catch (e) {}
  }

  function tick(){
    /* ログイン画面が出ている間は待つ（本番モードのログイン待ち） */
    var login = document.getElementById('pit-login');
    var waitingLogin = !!(login && login.offsetParent !== null);

    if (!waitingLogin && window.state && Array.isArray(state.cards) && state.cards.length){
      var found = state.cards.some(function (c){ return c && c.id === id; });
      if (found){
        stripParam();
        if (window.pitOpenCardDetail) pitOpenCardDetail(id);
        else if (window.openDetail)   openDetail(id);
        return;
      }
      /* カードが読み込み済みなのに無い＝消された／別会社のID */
      if (window.PitDB && PitDB._loaded){
        stripParam();
        if (window.pitToast) pitToast('そのカードは見つかりませんでした（削除された可能性があります）', 'PF-0050');
        return;
      }
    }

    if (Date.now() - started > WAIT_MS){
      stripParam();
      if (window.pitToast) pitToast('カードを開けませんでした。検索から探してください', 'PF-0051');
      return;
    }
    setTimeout(tick, STEP_MS);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(tick, STEP_MS); });
  else setTimeout(tick, STEP_MS);
})();
