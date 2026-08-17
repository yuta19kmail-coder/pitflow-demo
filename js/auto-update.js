/* ============================================================
   auto-update.js — 全アプリ共通「安全な時に自動更新」モジュール
   🔴 本体は _shared\auto-update.js。直したら sync-shared.ps1 を走らせる。
      各アプリの js\auto-update.js は配られたコピー＝直しても次の配布で消えます。
   ------------------------------------------------------------
   役割：スタッフが版を意識しなくても、常に最新版で動くようにする。
   仕組み：
     ・このページの動作中バージョン = <meta name="app-version" content="x.y.z">
     ・サーバーの最新 index.html を no-store で取り直してバージョンを読む
     ・新しければ「安全な時」に location.reload() で自動更新

   🔴🔴 2026-08-17 ゆうた指定 ── **確かめに行くのは1時間に1回**
     🗣「更新入ると操作中に強制的に戻ったりして不便だったから、**1時間に1回にして**」
     それまでは **5分ごと**に確認し、さらに**タブに戻るたびに毎回**確認していた。
     ＝ちょっと別のウィンドウを見て戻っただけで画面が入れ替わる、が起きていた。
     いまは **確認そのものを1時間に1回**に絞ってある（タブに戻った時も、
     前の確認から1時間たっていなければ確認しない）。
     ⚠ この2つの数字を小さく戻さないこと。戻すと同じ不便が再発する。

   「安全な時」＝
     ・入力欄/選択/contenteditable にフォーカスが無い
     ・モーダル等が開いていない
     ・window.__appBusy が真でない（各アプリが重要操作中に立てられる任意のガード）
     ・かつ「タブに戻った直後」または「60秒以上 操作が無いアイドル時」
       （＝打ち込み中の作業を巻き込まないタイミングだけで更新）
   ⚠ 更新は「同じ画面に戻る」＝ coreflow-nav.js が住所に画面名を持たせているアプリは、
      再読み込みしても見ていた画面のまま戻る（v1.107.0〜）。
   依存なし・自己完結。読み込むだけで動く。失敗しても本体に影響しない。
   ============================================================ */
(function () {
  try {
    var metaEl = document.querySelector('meta[name="app-version"]');
    var RUNNING = metaEl ? (metaEl.getAttribute('content') || '').trim() : '';
    if (!RUNNING) return; // 基準が無ければ何もしない（安全側）

    var VERSION_POLL_MS = 60 * 60 * 1000; // 🔴 1時間に1回だけ最新を確認（2026-08-17 ゆうた指定）
    var TICK_MS         = 30 * 1000;      // 30秒ごとにアイドル判定
    var IDLE_MS         = 60 * 1000;      // 60秒 操作が無ければアイドル
    var pending   = null;   // 見つかった新しいバージョン
    var reloading = false;
    var lastActive = Date.now();
    var lastPoll   = 0;

    /* 見張り（test_autoupdate.mjs）から数字を確かめられるようにしておく。
       🔴 画面の動きには一切関係しない。消さないこと。 */
    window.__AUTO_UPDATE = { running: RUNNING, pollMs: VERSION_POLL_MS, idleMs: IDLE_MS, tickMs: TICK_MS };

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
    /* 🔴 前の確認から1時間たっていなければ確認しない。
       ここを素の poll() に戻すと「タブに戻るたびに確認」＝ゆうたが不便と言った動きに戻る。 */
    function maybePoll() { if (Date.now() - lastPoll >= VERSION_POLL_MS) poll(); }

    // タブに戻った瞬間＝まだ触っていない安全な瞬間。
    // すでに見つけてある新版があればここで入れ替える（確認そのものは1時間に1回のまま）。
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { maybePoll(); setTimeout(tryReload, 600); }
    });
    window.addEventListener('focus', function () { setTimeout(tryReload, 600); });

    setTimeout(poll, 8000); // 起動少し後に1回
    setInterval(function () {
      maybePoll();                                                    // 🔴 1時間ごとに最新確認
      if (pending && (Date.now() - lastActive) > IDLE_MS) tryReload(); // 60秒アイドルで更新
    }, TICK_MS);
  } catch (e) { /* 自動更新が失敗しても本体には一切影響させない */ }
})();
