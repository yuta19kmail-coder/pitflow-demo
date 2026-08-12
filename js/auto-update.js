/* ============================================================
   auto-update.js — 全Flowアプリ共通「安全な時に自動更新」モジュール
   ------------------------------------------------------------
   役割：スタッフがバージョンを意識しなくても、常に最新版で動くようにする。
   仕組み：
     ・このページの動作中バージョン = <meta name="app-version" content="x.y.z">
     ・サーバーの最新 index.html を no-store で取り直してバージョンを読む
     ・新しければ「安全な時」に location.reload() で自動更新
   「安全な時」＝
     ・入力欄/選択/contenteditable にフォーカスが無い
     ・モーダル等が開いていない
     ・window.__appBusy が真でない（各アプリが重要操作中に立てられる任意のガード）
     ・かつ「タブに戻った直後」または「60秒以上 操作が無いアイドル時」
       （＝打ち込み中の作業を巻き込まないタイミングだけで更新）
   依存なし・自己完結。読み込むだけで動く。失敗しても本体に影響しない。
   ============================================================ */
(function () {
  try {
    var metaEl = document.querySelector('meta[name="app-version"]');
    var RUNNING = metaEl ? (metaEl.getAttribute('content') || '').trim() : '';
    if (!RUNNING) return; // 基準が無ければ何もしない（安全側）

    var VERSION_POLL_MS = 5 * 60 * 1000; // 5分ごとに最新を確認
    var TICK_MS         = 30 * 1000;     // 30秒ごとにアイドル判定
    var IDLE_MS         = 60 * 1000;     // 60秒 操作が無ければアイドル
    var pending   = null;   // 見つかった新しいバージョン
    var reloading = false;
    var lastActive = Date.now();
    var lastPoll   = 0;

    function markActive() { lastActive = Date.now(); }
    ['keydown', 'pointerdown', 'touchstart', 'mousedown', 'input', 'wheel'].forEach(function (ev) {
      document.addEventListener(ev, markActive, { passive: true, capture: true });
    });

    function deployedVersion() {
      var dir = location.pathname.replace(/[^/]*$/, ''); // 末尾のファイル名を落としてディレクトリに
      return fetch(dir + 'index.html?_=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.text() : ''; })
        .then(function (html) {
          var m = html.match(/<meta[^>]*name=["']app-version["'][^>]*content=["']([^"']+)["']/i)
               || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']app-version["']/i);
          return m ? m[1].trim() : '';
        })
        .catch(function () { return ''; });
    }

    function isSafe() {
      if (window.__appBusy) return false;
      var ae = document.activeElement;
      if (ae) {
        var tag = (ae.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae.isContentEditable) return false;
      }
      // よくあるモーダル/ダイアログが見えていれば避ける
      var dlg = document.querySelector('[role="dialog"], .modal, #modal, .modal-backdrop, .overlay, .crop-box');
      if (dlg && dlg.offsetParent !== null) return false;
      return true;
    }

    function doReload() {
      if (reloading) return;
      reloading = true;
      var t = document.createElement('div');
      t.textContent = '🆕 最新版に更新します…';
      t.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;'
        + 'background:#7c3aed;color:#fff;padding:10px 18px;border-radius:999px;'
        + 'font:600 14px -apple-system,BlinkMacSystemFont,"Segoe UI","Yu Gothic Medium","Meiryo",sans-serif;'
        + 'box-shadow:0 6px 20px rgba(0,0,0,.28)';
      (document.body || document.documentElement).appendChild(t);
      setTimeout(function () { location.reload(); }, 1400);
    }

    function tryReload() {
      if (!pending || reloading || document.hidden) return;
      if (isSafe()) doReload();
    }

    function poll() {
      lastPoll = Date.now();
      deployedVersion().then(function (dep) {
        if (dep && dep !== RUNNING) pending = dep;
      });
    }

    // タブに戻った瞬間＝まだ触っていない安全な瞬間。最新確認して安全なら即更新。
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { poll(); setTimeout(tryReload, 600); }
    });
    window.addEventListener('focus', function () { setTimeout(tryReload, 600); });

    setTimeout(poll, 8000); // 起動少し後に1回
    setInterval(function () {
      if (Date.now() - lastPoll >= VERSION_POLL_MS) poll();          // 5分ごとに最新確認
      if (pending && (Date.now() - lastActive) > IDLE_MS) tryReload(); // 60秒アイドルで更新
    }, TICK_MS);
  } catch (e) { /* 自動更新が失敗しても本体には一切影響させない */ }
})();
