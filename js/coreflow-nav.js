/* ========================================
   coreflow-nav.js  ―  ブラウザの「戻る」で、通ってきた画面順に戻る（CoreFlow 全アプリ共通）
   ----------------------------------------
   ◎なにをするもの
     いままで各アプリは「住所（URL）が1つだけ」だった。画面を10回切り替えても
     ブラウザから見れば1回も動いていないので、**戻るを押すとアプリの外まで一気に出て**
     しまっていた（PitFlow で戻る → CoreFlow）。
     この部品を読み込むと、画面ごとに住所が付く（`…#/loaner` のように）。
     戻るは**通ってきた順に1つずつ**戻り、**最初に入った画面まで戻って初めて**外へ出る。

   ◎ついでに効くこと
     ・再読み込みしても同じ画面のまま（いまは毎回トップに戻る）
     ・画面の住所を人に送れる（「代車カレンダー見て」がリンクで渡せる）
     ・タブレット／スマホの「戻る」ボタンが効く

   ◎使いかた（各アプリの index.html の、いちばん最後の script のあとに1行）
     CoreflowNav.wire({ fn:'showView' });                        // ふつうはこれだけ
     CoreflowNav.wire({ fn:'switchTab', apply:function(orig,k){   // 引数が特殊なアプリ
       orig.call(window, k, document.querySelector('.tab[data-view="'+k+'"]'));
     }});

   ◎設計のきまり（🔴 触る人へ）
     ・**アプリ側のコードは1行も書き換えない。** もとの関数を包むだけ。
       だから「離れますか？」の確認や権限チェックは**今までどおり必ず通る**。
     ・**足跡は『実際に画面が変わった時』だけ残す。**
       PitFlow のように `showView(いまの画面)` で背後を描き直す作りがあるので、
       要求した画面ではなく**呼んだあとの現在地**を見て判断する。
       ＝ 権限で追い返された時（CoreMembers）も、下書きがあって止まった時（PitFlow の代車）も、
         住所と画面がズレない。
     ・**戻る／進むで呼んだ時は足跡を残さない。** 残すと戻れなくなる。
     ・関数が見つからなければ**何もしない**（読み込んでも壊れない）。
   ======================================== */
(function (w) {
  'use strict';
  if (w.CoreflowNav) return;

  var C = null, orig = null, started = false, applying = false, lastKey = '';

  function nowKey(fallback) {
    if (C && typeof C.current === 'function') {
      try { return String(C.current() || ''); } catch (e) { return ''; }
    }
    return String(fallback || '');
  }
  function domKey() {
    var el = document.querySelector('.view.active');
    return el ? String(el.id || '').replace(/^view-/, '') : '';
  }
  function hashKey() {
    var h = String(location.hash || '');
    if (h.indexOf('#/') !== 0) return '';
    var raw = h.slice(2);
    try { return decodeURIComponent(raw); } catch (e) { return raw; }
  }
  function write(k, replace) {
    var url = location.pathname + (location.search || '') + (k ? '#/' + encodeURIComponent(k) : '');
    try { history[replace ? 'replaceState' : 'pushState']({ cfnav: k }, '', url); } catch (e) {}
  }
  function callOrig(k) {
    if (C && typeof C.apply === 'function') C.apply(orig, k);
    else orig.call(w, k);
  }

  function wire(opts) {
    C = opts || {};
    if (!C.fn || typeof w[C.fn] !== 'function') return false;   // 無ければ何もしない
    if (typeof C.current !== 'function' && C.current !== false) C.current = domKey;
    orig = w[C.fn];

    w[C.fn] = function () {
      var asked  = arguments.length ? String(arguments[0] == null ? '' : arguments[0]) : '';
      var before = nowKey(lastKey);
      var r      = orig.apply(this, arguments);
      var after  = nowKey(asked);
      lastKey    = after || lastKey;
      if (applying) return r;                       // 戻る／進むの最中は足跡を残さない

      if (!started) {
        started = true;
        var init = hashKey();
        if (init && init !== after) {               // 住所に画面が書いてある＝そこを開き直す
          applying = true;
          try { callOrig(init); } catch (e) {}
          applying = false;
          after = nowKey(init);
        }
        write(after, true);                         // 最初の1歩は「置き換え」＝戻るで外へ出られる
        return r;
      }
      if (after && after !== before) write(after, false);
      return r;
    };

    w.addEventListener('popstate', function () {
      if (!started) return;
      var k = hashKey() || C.home || '';
      if (!k) return;
      var cur = nowKey(lastKey);
      if (k === cur) return;
      applying = true;
      try { callOrig(k); } catch (e) {}
      applying = false;
      // 画面側が「離れない」と答えた時（下書きの確認・権限）は、住所を今いる画面へ戻す
      var after = nowKey(k);
      lastKey = after || lastKey;
      if (after && after !== k) write(after, false);
    });
    return true;
  }

  w.CoreflowNav = { wire: wire, _key: hashKey };
})(window);
