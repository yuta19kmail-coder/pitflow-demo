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
     ・🆕 2026-10-15 埋め込みの窓（iframe）の中も同じに見る（窓の中の入力欄・窓・window.__appBusy）
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

    /* 🆕 2026-10-15（棚卸し A-59）埋め込みの窓（iframe）の中も見る。
       前は本体の画面しか見ておらず、StockFlow の料金表（price.html を埋め込み）で打ち込み中でも
       「何もしていない」に見えて読み直し、打ちかけが消えた。
       ・カーソルが窓の中にある時は、窓の中の入力欄・開いている窓・window.__appBusy まで見る（同じ住所の窓だけ。よそは見られない＝安全側で「使用中」）
       ・窓の中で触った時も「操作あり」に数える（60秒アイドルの数え方） */
    function busyIn(doc, win, depth) {
      try {
        if (win && win.__appBusy) return true;
        var ae = doc.activeElement;
        if (ae) {
          var tag = (ae.tagName || '').toUpperCase();
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae.isContentEditable) return true;
          if ((tag === 'IFRAME' || tag === 'FRAME') && depth < 3) {
            var cd = null, cw = null;
            try { cw = ae.contentWindow; cd = ae.contentDocument || (cw && cw.document); } catch (e) { return true; }
            if (!cd) return true;
            if (busyIn(cd, cw, depth + 1)) return true;
          }
        }
        // よくあるモーダル/ダイアログが見えていれば避ける
        var dlg = doc.querySelector('[role="dialog"], .modal, #modal, .modal-backdrop, .overlay, .crop-box');
        if (dlg && dlg.offsetParent !== null) return true;
      } catch (e) { return true; }
      return false;
    }
    function isSafe() { return !busyIn(document, window, 0); }
    /* 埋め込みの窓の中の操作も「操作あり」に数える（同じ住所の窓だけ・1つの窓に1回だけ付ける） */
    function watchFrames() {
      try {
        Array.prototype.forEach.call(document.querySelectorAll('iframe'), function (f) {
          try {
            var cd = f.contentDocument; if (!cd || cd.__cfAuMark) return;
            cd.__cfAuMark = true;
            ['keydown', 'pointerdown', 'touchstart', 'mousedown', 'input', 'wheel'].forEach(function (ev) {
              cd.addEventListener(ev, markActive, { passive: true, capture: true });
            });
          } catch (e) {}
        });
      } catch (e) {}
    }
    document.addEventListener('load', function (e) { if (e.target && e.target.tagName === 'IFRAME') watchFrames(); }, true);
    window.__AUTO_UPDATE.isSafe = isSafe;   /* 見張り（test_autoupdate_iframe.mjs）用。画面の動きには関係しない */

    function doReload() {
      if (reloading) return;
      reloading = true;
      var t = document.createElement('div');
      t.textContent = '🆕 最新版に更新します…';
      /* 🎨 2026-10-17 前は紫（StockFlow の色）の決め打ちで、全アプリで紫が出ていた（ゆうた指摘・棚卸し C-10）。
         いまは共通のトースト（ui-dialog.js UI.toast）と同じ＝黒地＋左にアプリの色（--cf-app）の縦線 */
      t.style.cssText = 'position:fixed;left:50%;bottom:var(--cf-toast-bottom,24px);transform:translateX(-50%);z-index:2147483647;'
        + 'background:#15181e;color:#eef1f5;padding:9px 14px 9px 13px;border-radius:10px;'
        + 'border:1px solid rgba(255,255,255,.10);border-left:4px solid var(--cf-app,#94a3b8);'
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
      watchFrames();                                                  // 後から開いた埋め込みの窓にも印を付ける
      maybePoll();                                                    // 🔴 1時間ごとに最新確認
      if (pending && (Date.now() - lastActive) > IDLE_MS) tryReload(); // 60秒アイドルで更新
    }, TICK_MS);
  } catch (e) { /* 自動更新が失敗しても本体には一切影響させない */ }
})();

/* ============================================================
   🔴 2026-10-18 「戻る」で復元したページのデータベースの線を確かめる（全アプリ共通）
   ------------------------------------------------------------
   スマホでアプリから別のアプリを同じタブで開いて「戻る」と、ブラウザは止めておいた前のページを
   そのまま復元する（bfcache）。その間に端末の保存場所の線が切られていると、Firestore は
   「The client has already been terminated.」で以後の書き込みを全部断る（画面は普通に見える）。
   調査の記録：FlowGo（iPhone）10/18 06:38・08:31＝通知の「済」も保存されなかった／玄関（PC）10/17 22:51。
   ① 復元で戻ったら、データベースに軽く1回聞く。死んでいたら読み込み直す（生きていれば何もしない＝入力中の物を消さない）
   ② 死んだ線のエラーに当たったら、1回だけ読み込み直して「もう一度操作してください」と出す（20秒は繰り返さない）
   ⚠ FlowGo は自分の m.js で同じことをする（ここは読まない）。失敗しても本体には一切影響させない。
   ============================================================ */
(function () {
  try {
    var KEY = 'cf_revive_at', MSG = 'cf_revive_msg', GAP_MS = 20000;
    function dead(m) { return /client has already been terminated|AsyncQueue is already failed/i.test(String(m || '')); }
    function revive(why) {
      try {
        if (Date.now() - (+sessionStorage.getItem(KEY) || 0) < GAP_MS) return;   /* 読み込み直しの繰り返しを止める */
        sessionStorage.setItem(KEY, String(Date.now()));
        sessionStorage.setItem(MSG, '1');
      } catch (e) {}
      try { console.warn('[auto-update] データベースの線が切れていたので読み込み直します', why); } catch (e) {}
      location.reload();
    }
    function probe() {
      try {
        var fbase = window.firebase;
        if (!fbase || !fbase.apps || !fbase.apps.length || !fbase.firestore) return;
        var p = fbase.firestore().collection('_cf').doc('_alive').get({ source: 'cache' });
        if (p && p.catch) p.catch(function (e) { if (dead(e && (e.message || e))) revive('bfcache'); });
      } catch (e) { if (dead(e && (e.message || e))) revive('bfcache'); }
    }
    window.addEventListener('pageshow', function (e) { if (e && e.persisted) probe(); });
    window.addEventListener('error', function (e) { if (dead((e && e.message) || (e && e.error && e.error.message))) revive('error'); });
    window.addEventListener('unhandledrejection', function (e) { var r = e && e.reason; if (dead(r && (r.message || r))) revive('rejection'); });
    /* 読み込み直した後に1回だけ知らせる（押した操作は保存されていないので、もう一度押してもらう） */
    var told = false;
    function tell() {
      if (told) return; told = true;
      try { if (sessionStorage.getItem(MSG) !== '1') return; sessionStorage.removeItem(MSG); } catch (e) { return; }
      setTimeout(function () {
        try { if (window.UI && window.UI.toast) window.UI.toast('接続を立て直しました。もう一度操作してください'); } catch (e) {}
      }, 1500);
    }
    if (document.readyState === 'complete') tell(); else window.addEventListener('load', tell);
    window.__CF_REVIVE = { dead: dead, gapMs: GAP_MS };   /* 見張り用。画面の動きには関係しない */
  } catch (e) { /* 失敗しても本体には一切影響させない */ }
})();
