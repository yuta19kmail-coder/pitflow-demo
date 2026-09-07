/* ============================================================
   coreflow-login-btn.js — 「Google でログイン」ボタンの見た目を全アプリでそろえる
   🔴 本体は _shared\coreflow-login-btn.js。直したら sync-shared.ps1 を走らせる。
      各アプリの js\coreflow-login-btn.js は配られたコピー＝直しても次の配布で消えます。
   ------------------------------------------------------------
   なぜ要るか（2026-09-06・ゆうた指摘「Googleボタンの色が各アプリでばらけてる」）

   直す前は10本でバラバラだった：
     ・CarFlow ＝ 緑→青のグラデ／PitFlow ＝ 緑のグラデ（意味のないグラデ）
     ・MHS・CoreMembers ＝ Googleのロゴが無い
     ・CoreFlow(玄関)・StockFlow ＝ 偽物の「G」の文字／横幅も他と違う
     ・角の丸み・文字の大きさ・幅も全部ちがう

   これから（ゆうた決定）：
     ・色 ＝ そのアプリの指定色（単色）。グラデは無し
     ・本物の Google ロゴ＋白い下敷き／文字は白・15px・太字／「Google でログイン」
     ・横幅いっぱい（最大340px）・角丸10px・内側の余白12px
     ・CoreFlow(玄関) だけは指定色がレインボーなので、
       白地＋レインボーの縁（ロゴと同じ渦の回り方）＋濃い文字（モックのA案）
       ⚠ レインボーで面を塗ると、黄〜黄緑で白文字が消え、黒文字にすると青・紫で沈む。
         だから縁で使う。

   置きかた
     各アプリの index.html に1行。ログインボタンに目印を1つ。
       <script src="js/coreflow-login-btn.js?v=1"></script>
       <button id="..." data-cf-login="carflow" ...>
     目印の中身は下の COLORS のキー。

   ⚠ ボタンの中身は作り直す（ロゴ＋文字）。文字は <span class="pl-label"> に入れるので、
      「ログイン中…」に書き換えているアプリ（CarFlow・PitFlow）もロゴが消えない。
   ⚠ PitFlow の練習用サイト（サンプルモード）では何もしない。
   壊れても本体に影響しない（全部 try で囲ってある）。
   ============================================================ */
(function () {
  'use strict';
  try {

    /* アプリの指定色。出どころ＝_shared\launcher.js と玄関の一覧（オーブの色）。
       🔴 色を変えるときは launcher.js と玄関の一覧も一緒に直すこと。 */
    var COLORS = {
      coreflow:     'rainbow',   // 玄関だけ特別（下の RAINBOW）
      mhs:          '#dc2626',
      carflow:      '#378ADD',
      stockflow:    '#7c3aed',
      pitflow:      '#1db97a',   // 玄関のオーブと同じ値にそろえた（アプリの中では #26a269 も使われている）
      coremembers:  '#ea580c',
      coreboard:    '#06b6d4',
      corenote:     '#ec4899',
      coretools:    '#64748b',
      coretemplate: '#6366f1'
    };

    /* 玄関のマークから15度ごとに実測した虹を、その角度のまま一周させたもの＝ロゴと同じ渦。 */
    var RAINBOW = 'conic-gradient(from 0deg at 50% 50%,'
      + '#f74f3f 0deg,#fe6b2a 15deg,#ff821f 30deg,#ff9a17 45deg,#feaa17 60deg,#ecc51c 75deg,'
      + '#c8de28 90deg,#97d835 105deg,#67ed39 120deg,#4bef47 135deg,#51d06a 150deg,#31cc87 165deg,'
      + '#26adb5 180deg,#2f8bd2 195deg,#1a6dfa 210deg,#2b5bfb 225deg,#434af0 240deg,#6a35d8 255deg,'
      + '#9629b5 270deg,#bc2492 285deg,#d70e86 300deg,#ec1168 315deg,#fb1e4f 330deg,#fe2d44 345deg,'
      + '#f74f3f 360deg)';

    /* 目印が無いアプリのための保険（ボタンのid）。⚠ 目印を付けるのが本筋。 */
    var BTN_IDS = ['btn-login', 'pl-google', 'cb-login-btn', 'cn-login-btn', 'ct-login-btn', 'gBtn'];

    var LABEL = 'Google でログイン';

    var GOOGLE_SVG =
      '<svg class="cf-gmark" width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
      + '<path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>'
      + '<path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>'
      + '<path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>'
      + '<path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"/>'
      + '</svg>';

    function installCss() {
      if (document.getElementById('cf-gbtn-style')) return;
      var css =
        /* 🔴 アプリ側のCSSより強く効かせる（10本とも自前のボタンの飾りを持っているため） */
        /* ⚠ display だけは !important にしない。
           アプリ側は「アプリ内ブラウザの時はボタンを隠す」「認証が済むまで出さない」を
           ボタンに直接 display で書いている。ここで強制すると、隠したいのに出てしまう。 */
        '.cf-gbtn{display:flex;align-items:center!important;justify-content:center!important;'
        + 'gap:10px!important;width:100%!important;max-width:340px!important;'
        + 'margin-left:auto!important;margin-right:auto!important;'
        + 'padding:12px!important;border:none!important;border-radius:10px!important;'
        + 'font-family:inherit!important;font-size:15px!important;font-weight:700!important;'
        + 'line-height:1.4!important;letter-spacing:0!important;text-align:center!important;'
        + 'color:#fff!important;cursor:pointer!important;box-shadow:none!important;'
        + 'background-image:none!important;background-color:var(--cf-gcolor,#64748b)!important;'
        + '-webkit-appearance:none;appearance:none}\n'
        + '.cf-gbtn:hover{filter:brightness(1.07)}\n'
        + '.cf-gbtn:active{filter:brightness(.95)}\n'
        + '.cf-gbtn:disabled{opacity:.6!important;cursor:default!important;filter:none!important}\n'
        /* ロゴは色の上に置くので白い下敷きを敷く（無いと色に埋もれる） */
        + '.cf-gbtn .cf-gmark{flex:0 0 auto;background:#fff;border-radius:3px;padding:2px;box-sizing:content-box}\n'
        + '.cf-gbtn .cf-glabel{white-space:nowrap}\n'
        /* CoreFlow(玄関)＝白地＋レインボーの縁（ロゴと同じ渦）＋濃い文字 */
        + '.cf-gbtn.cf-rainbow{color:#1f2937!important;'
        + 'border:2px solid transparent!important;'
        + 'background-color:transparent!important;'
        + 'background-image:linear-gradient(#fff,#fff),' + RAINBOW + '!important;'
        + 'background-origin:border-box!important;'
        + 'background-clip:padding-box,border-box!important}\n'
        + '.cf-gbtn.cf-rainbow:hover{filter:brightness(.98)}\n'
        + '.cf-gbtn.cf-rainbow .cf-gmark{background:transparent;padding:0}\n';
      var st = document.createElement('style');
      st.id = 'cf-gbtn-style';
      st.textContent = css;
      (document.head || document.documentElement).appendChild(st);
    }

    function findButton() {
      var b = document.querySelector('[data-cf-login]');
      if (b) return b;
      for (var i = 0; i < BTN_IDS.length; i++) {
        b = document.getElementById(BTN_IDS[i]);
        if (b) return b;
      }
      return null;
    }

    function apply() {
      /* PitFlow の練習用サイトは「サンプルで入る」ボタン＝Googleログインではないので触らない */
      if (window.PIT_CLOUD === false) return;

      var btn = findButton();
      if (!btn) return;

      var key = btn.getAttribute('data-cf-login') || '';
      var color = COLORS[key];
      if (!color) return;   // 目印が無い／知らないキーなら、何もしないで今のまま

      installCss();

      btn.classList.add('cf-gbtn');
      if (color === 'rainbow') {
        btn.classList.add('cf-rainbow');
      } else {
        btn.style.setProperty('--cf-gcolor', color);
      }

      /* 中身を作り直す。
         ⚠ 文字は <span class="pl-label"> に入れる。CarFlow と PitFlow は押した時に
            「ログイン中…」へ書き換えるので、入れものが無いとロゴごと消える。 */
      btn.innerHTML = GOOGLE_SVG + '<span class="pl-label cf-glabel">' + LABEL + '</span>';
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
    else apply();

    /* 見張り（試験）用。画面の動きには関係しない。 */
    window.__CF_GBTN = { colors: COLORS, rainbow: RAINBOW, apply: apply };

  } catch (e) { /* ボタンの見た目のために本体を止めない */ }
})();
