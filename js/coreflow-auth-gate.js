/* ============================================================
   coreflow-auth-gate.js — ログイン画面の「待つ」を全アプリ共通にする
   🔴 本体は _shared\coreflow-auth-gate.js。直したら sync-shared.ps1 を走らせる。
      各アプリの js\coreflow-auth-gate.js は配られたコピー＝直しても次の配布で消えます。
   ------------------------------------------------------------
   なぜ要るか（2026-09-06・調査_2026-09-06_全アプリのログイン.html）

   スマホ：Googleでアカウントを選んで戻ってくると、アプリはその「戻ってきた分」を
     裏で受け取っている最中。数秒かかる。ところが画面は待たずにログイン画面と
     ボタンを出していたので、**戻ってきたのに未ログインに見えた**。
     押すとやり直しになるので、本当にループした。

   PC：ページを開いた直後、まだ「前回のログインを思い出し中」なのにボタンが出ていた。
     押すとGoogleの窓が開き、その最中に思い出しが終わって**窓の後ろに本画面が出た**。

   ＝どちらも「返事を待っていない」という同じ1つの穴。ここで両方ふさぐ。

   何をするか
     ① 返事が来るまで、ログインボタンを出さない（アプリ側が出そうとしても勝つ）
     ② Googleへ行く時に「行ってきます」の印を端末に残す。戻ってきて印があれば
        ボタンではなく「ログインの続きをしています…」を出して待つ
     ③ 待ちすぎたらボタンを戻して理由を出す（固まらないように）
     ④ 押したのに何も起きなかった時、8秒でボタンを押せる状態に戻す

   さわらないもの
     🔴 だれが入れるかの判定（名簿・在籍・アプリごとの使える/使わない）には一切触らない。
     🔴 ログインのやり方（別窓か、飛ばすか）にも触らない。**出し入れの見せ方だけ。**

   置きかた
     各アプリの index.html の、Firebase の読み込みのすぐ後に1行入れる。
       <script src="js/coreflow-auth-gate.js?v=1"></script>
     早い場所に置くこと（遅いとボタンが一瞬見えてしまう）。

   壊れても本体に影響しない（全部 try で囲ってある）。
   ============================================================ */
(function () {
  'use strict';
  try {

    var WAIT_CLASS  = 'cfauth-wait';   // これが付いている間はボタンを出さない
    var KEY         = 'cfauth_going';  // 「Googleへ行ってきます」の印
    var FRESH_MS    = 120000;  // 印が effective なのは2分まで
    var GRACE_MS    =   8000;  // 戻り直後に「未ログイン」が来ても、これだけは待つ
    var HARD_MS     =  15000;  // 何の返事も来なくても、これで必ずボタンを出す
    var ALIVE_MS    =   6000;  // 押したのにページが残っている＝別窓方式（PC）。印を消す
    var LEAVE_MS    =  60000;  // 押してからこの間にページを離れたら＝飛んだ。印を付け直す
    var REENABLE_MS =   8000;  // 押したのに何も起きない時、ボタンを押せる状態に戻す
    var FIND_TRIES  =     50;  // Firebase が現れるのを 100ms×50＝5秒 待つ

    /* 各アプリのログインボタン／「確認中…」の入れもの。
       ⚠ アプリを増やしたらここに足す。足し忘れても壊れない（そのアプリだけ効かない）。 */
    var BTN_IDS = [
      'btn-login',      // CoreFlow(玄関) / MHS / CoreMembers / CarFlow / StockFlow
      'pl-google',      // PitFlow
      'cb-login-btn',   // CoreBoard
      'cn-login-btn',   // CoreNote
      'ct-login-btn',   // CoreTools
      'gBtn'            // CoreTemplate
    ];
    var LOAD_IDS = [
      'login-loading',      // CarFlow / StockFlow
      'pl-loading',         // PitFlow
      'cb-login-loading',   // CoreBoard
      'cn-login-loading',   // CoreNote
      'ct-login-loading'    // CoreTools
    ];

    var released = false;
    var graceTimer = null;
    var msgEl = null;
    var root = document.documentElement;

    /* ---------- 印（端末に残す。ページが開き直されても消えない） ---------- */
    function markGoing() {
      try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
    }
    function clearGoing() {
      try { localStorage.removeItem(KEY); } catch (e) {}
    }
    function goingFresh() {
      try {
        var t = parseInt(localStorage.getItem(KEY) || '0', 10);
        return !!t && (Date.now() - t) < FRESH_MS;
      } catch (e) { return false; }
    }

    /* ---------- ボタンを隠す仕掛け（アプリ側が出そうとしても勝つ） ---------- */
    function installCss() {
      var hide = [];
      var i;
      for (i = 0; i < BTN_IDS.length; i++)  hide.push('html.' + WAIT_CLASS + ' #' + BTN_IDS[i]);
      for (i = 0; i < LOAD_IDS.length; i++) hide.push('html.' + WAIT_CLASS + ' #' + LOAD_IDS[i]);
      var css = hide.join(',') + '{display:none!important}\n'
        + '#cfauth-msg{display:none;align-items:center;justify-content:center;gap:8px;'
        + 'margin:18px 0 2px;font-size:13px;line-height:1.7;opacity:.85;text-align:center}\n'
        + '#cfauth-msg .cfauth-dot{width:8px;height:8px;border-radius:50%;background:currentColor;'
        + 'flex:0 0 auto;animation:cfauth-pulse 1.1s ease-in-out infinite}\n'
        + '@keyframes cfauth-pulse{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}\n';
      var st = document.createElement('style');
      st.id = 'cfauth-style';
      st.textContent = css;
      (document.head || root).appendChild(st);
    }

    /* ---------- 待っている間に出す文 ---------- */
    function buildMsg() {
      var btn = null;
      for (var i = 0; i < BTN_IDS.length && !btn; i++) btn = document.getElementById(BTN_IDS[i]);
      if (!btn || !btn.parentNode) return;
      msgEl = document.createElement('div');
      msgEl.id = 'cfauth-msg';
      btn.parentNode.insertBefore(msgEl, btn);
      showWaiting();
    }
    function showWaiting() {
      if (!msgEl || released) return;
      msgEl.innerHTML = '<span class="cfauth-dot"></span><span></span>';
      msgEl.lastChild.textContent = goingFresh()
        ? 'ログインの続きをしています…'
        : '認証状態を確認中…';
      msgEl.style.color = '';
      msgEl.style.display = 'flex';
    }
    function showNote(text) {
      if (!msgEl) return;
      msgEl.innerHTML = '';
      msgEl.textContent = text;
      msgEl.style.color = '#e11d48';
      msgEl.style.display = 'block';
    }

    /* ---------- ボタンを出す（＝待つのをやめる） ---------- */
    function release(note) {
      if (released) return;
      released = true;
      if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
      clearGoing();
      try { root.classList.remove(WAIT_CLASS); } catch (e) {}
      if (msgEl) {
        if (note) showNote(note);
        else msgEl.style.display = 'none';
      }
    }

    /* ---------- ここから本番 ---------- */
    root.classList.add(WAIT_CLASS);
    installCss();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', buildMsg);
    } else {
      buildMsg();
    }

    /* 「Google でログイン」を押した ＝ これから Google へ行くかもしれない。
       ⚠ document の捕まえ方で先に拾う（ボタン自身の onclick より前に走らせるため）。 */
    document.addEventListener('click', function (ev) {
      try {
        var t = ev.target;
        if (!t || !t.closest) return;
        var btn = t.closest('button,a');
        if (!btn) return;
        if (BTN_IDS.indexOf(btn.id) < 0 && !btn.hasAttribute('data-cfauth-login')) return;

        markGoing();
        /* 別窓方式（PC）だとページはこのまま残る。残っていたら印は用済み。 */
        setTimeout(clearGoing, ALIVE_MS);
        /* 押したのに何も起きない時に、固まったままにしない。 */
        setTimeout(function () { try { btn.disabled = false; } catch (e) {} }, REENABLE_MS);
      } catch (e) {}
    }, true);

    /* Firebase が用意できるのを待って、ログイン状態の返事を受ける。 */
    function findAuth() {
      try {
        if (window.fb && window.fb.auth && window.fb.auth.onAuthStateChanged) return window.fb.auth;
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) return firebase.auth();
      } catch (e) {}
      return null;
    }

    var tries = 0;
    (function waitForAuth() {
      if (released) return;
      /* PitFlow の練習用サイト（サンプルモード）は Google ログインを使わない。 */
      if (window.PIT_CLOUD === false) { release(); return; }
      var a = findAuth();
      if (a) { wire(a); return; }
      if (++tries > FIND_TRIES) { release(); return; }   // ログイン画面ではないページ等
      setTimeout(waitForAuth, 100);
    })();

    function wire(auth) {
      try {
        auth.onAuthStateChanged(function (user) {
          if (user) { release(); return; }          // 入れた → ログイン画面ごと消える
          if (goingFresh()) {
            /* Google から戻ってきた直後。「まだ誰もログインしていません」が
               先に一度来ることがあるので、ここでボタンを出してはいけない。 */
            if (!graceTimer) {
              showWaiting();
              graceTimer = setTimeout(function () {
                graceTimer = null;
                release('ログインの確認に時間がかかっています。もう一度「Google でログイン」を押してみてください。');
              }, GRACE_MS);
            }
            return;
          }
          release();                                 // 普通のログアウト状態 → ボタンを出す
        });
      } catch (e) { release(); return; }

      /* 保険：何の返事も来なくても、必ずボタンは出す。 */
      setTimeout(function () { release(); }, HARD_MS);
    }

    /* 見張り（試験）から状態を確かめられるようにしておく。画面の動きには関係しない。 */
    window.__CFAUTH_GATE = {
      isWaiting: function () { return !released; },
      goingFresh: goingFresh,
      release: release
    };

  } catch (e) {
    /* 万一ここで転んでも、ボタンが出ないまま固まるのだけは避ける */
    try { document.documentElement.classList.remove('cfauth-wait'); } catch (e2) {}
  }
})();
