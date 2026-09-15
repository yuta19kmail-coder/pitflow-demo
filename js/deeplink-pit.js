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

/* ========================================
   ?fd=<やること>  -  FlowDesk のショートカットから「新規◯◯」をいきなり開く  PitFlow v2.118.0
   ----------------------------------------
   ◎なにをするもの
     `https://pitflow.kobayashi-motors.com/?fd=new-reserve`   → 新規予約の画面
     `https://pitflow.kobayashi-motors.com/?fd=new-customer`  → 新規顧客登録
     知らない値は**何もしない**（ふつうに開くだけ）。

   ◎画面の指定（#/today など）と一緒に来た時
     画面の切り替えは coreflow-nav.js が起動時に済ませている（main.js の showView を包んでいる）。
     こちらはログインとデータ読み込みの後に動くので、**画面 → やること** の順になる。
     新規予約を閉じると、その画面に戻る（card-detail.js の _returnView）。

   ◎待ち方（?card= と同じ考え方）
     ・ログイン画面が出ている間は**いつまでも待つ**（時間切れで捨てない）
     ・本番はクラウドの読み込み（PitDB._loaded）まで待つ。練習モードはログインだけでよい
     ・動かす前にアドレスから ?fd= を消す（# の画面はそのまま）＝再読み込みで二重に開かない
   ======================================== */
(function () {
  'use strict';

  var m = /[?&]fd=([^&#]*)/.exec(location.search || '');
  if (!m) return;

  var act = '';
  try { act = decodeURIComponent(m[1]); } catch (e) { act = m[1]; }

  /* やること → 呼ぶ関数の名前。足す時はここに1行 */
  var ACTIONS = {
    'new-reserve':  'openNewReserve',
    'new-customer': 'custNewCustomer'
  };
  var fn = ACTIONS[act];
  if (!fn) return;   // 知らない値は無視

  function stripParam(){
    try {
      var u = new URL(location.href);
      u.searchParams.delete('fd');
      history.replaceState(history.state, '', u.pathname + (u.search || '') + (u.hash || ''));   // coreflow-nav の印（state）は残す
    } catch (e) {}
  }

  function ready(){
    var login = document.getElementById('pit-login');
    if (login && login.offsetParent !== null) return false;              // ログイン画面が出ている
    if (!document.body.classList.contains('pit-authed')) return false;   // まだ入っていない
    if (!window.state || !state.currentView) return false;                // 起動の画面がまだ
    if (window.PIT_CLOUD && !(window.PitDB && PitDB._loaded)) return false; // 本番はデータ待ち
    return typeof window[fn] === 'function';
  }

  var started = Date.now();
  function tick(){
    if (ready()){
      stripParam();
      try { window[fn](); } catch (e) { console.error('[deeplink] ?fd=' + act, e); }
      return;
    }
    /* はじめの25秒はこまめに、そのあとはゆっくり（ログインを待っている間） */
    setTimeout(tick, (Date.now() - started) < 25000 ? 300 : 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(tick, 300); });
  else setTimeout(tick, 300);
})();
