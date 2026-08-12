/* ========================================
   demo-pit.js  -  デモ版（練習用サイト）だけの上乗せ
   v1.77.0（2026-08-12）
   ----------------------------------------
   🔴 **このファイルは `window.PIT_DEMO === true` の時しか何もしない。**
      本番（pitflow.kobayashi-motors.com）では**1ミリも画面が変わらない**。
      ＝デモ版のために本体を分けない／写しを作らない ための作り。

   ◎ なぜこうしたか（ここが肝）
     CarFlow-Demo は「本体をまるごとコピーした別リポジトリ」で作った結果、
     **本体が進んでもデモが古いまま止まった**（v1.8.79 で放置）。
     PitFlow は同じ轍を踏まない。デモ版は
       **本体のコピー ＋ フラグ1行**（`window.PIT_DEMO = true`）だけの差にする。
     だからデモ版の中身はこのファイルに集める。**デモ用の別ソースを作らない。**

   ◎ PIT_DEMO は誰が立てるか
     ・デモ版サイト … `make-demo.ps1` が index.html に1行差し込む
     ・手元で見たい時 … URL の末尾に **`?demo=1&demoui=1`**
       （`?demo=1` だけだと「サンプルモード」になるだけ＝試験が使う道。
         見た目まで変えると 55本の試験が巻き込まれるので**別のスイッチにした**）

   ◎ デモ版で足すもの（これだけ）
     ① 版の横に **「デモ版」** の印（ログイン画面・トップバー）
     ② 開いた最初の1回だけ「これは練習用です」と伝える（この端末に覚える）
     ③ 設定の「まっさらにする」を使えるようにする（→ reset-pit.js 側で見ている）
   ======================================== */
(function () {
  var w = window, d = document;

  /* ---- デモ版かどうか（唯一の判定） ----
     🔴 ここが物差し。ほかの場所で location.search を読み直さないこと。 */
  function isDemo() {
    if (w.PIT_DEMO === true) return true;
    return /[?&]demoui=1/.test(location.search || '');
  }
  /* 他のファイルからも同じ物差しを使えるように公開する（reset-pit.js が使う） */
  w.pitIsDemo = isDemo;

  if (!isDemo()) return;          /* 🔴 本番はここで終わり＝何も起きない */
  w.PIT_DEMO = true;              /* ?demoui=1 で来た時も旗を立てておく */

  var SEEN_KEY = 'pitflow_demo_welcomed';

  /* ---------- ① 「デモ版」の印 ---------- */
  function injectCSS() {
    if (d.getElementById('pit-demo-css')) return;
    var st = d.createElement('style');
    st.id = 'pit-demo-css';
    st.textContent =
      '.pit-demo-tag{display:inline-flex;align-items:center;gap:4px;margin-left:6px;padding:1px 7px;' +
        'border-radius:999px;font-size:10.5px;font-weight:700;letter-spacing:.04em;line-height:1.7;' +
        'background:rgba(245,158,11,.16);color:#f59e0b;border:1px solid rgba(245,158,11,.45);' +
        'white-space:nowrap;vertical-align:middle}' +
      '.login-ver .pit-demo-tag{font-size:10px}';
    d.head.appendChild(st);
  }

  function tag() {
    var s = d.createElement('span');
    s.className = 'pit-demo-tag';
    s.textContent = 'デモ版';
    return s;
  }

  /* 版の表示は2か所（ログイン画面 .login-ver ／ トップバー .ver）。
     ⚠ 版の数字そのものは書き換えない＝「本体のどの版か」が分からなくなるため。印を**足すだけ**。 */
  function mark() {
    injectCSS();
    ['.login-ver', '.ver'].forEach(function (sel) {
      var el = d.querySelector(sel);
      if (!el) return;
      if (el.querySelector('.pit-demo-tag')) return;   /* 二重に付けない */
      el.appendChild(tag());
    });
    /* タイトルにも出す＝タブがいくつも開いている時に取り違えない */
    if (d.title.indexOf('デモ版') < 0) d.title = 'デモ版 ' + d.title;
  }

  /* ---------- ② 最初の1回だけ案内 ---------- */
  function welcomed() {
    try { return !!localStorage.getItem(SEEN_KEY); } catch (e) { return false; }
  }

  /* 🔴 順番の話（ここを間違えると初対面がぐちゃぐちゃになる）
     ログインすると **お知らせのポップアップ**（news-pit.js）が 900ms 後に出る。
     初めて開いた人には「ここは練習用です」を**先に**読ませたい。
     なので初回だけ、お知らせを**押さえておいて**、案内を閉じたら**すぐ出す**。
     ⚠ お知らせを消してしまわないこと（デモでも新機能の説明として読ませたい）。 */
  function holdNews() {
    if (welcomed()) return;              /* 2回目以降は普通どおり（押さえない） */
    w._nwPopShown = true;                /* news-pit.js の「もう出した」印を先に立てる */
  }
  function releaseNews() {
    if (!w._nwPopShown) return;
    w._nwPopShown = false;
    setTimeout(function () { try { if (w.pitNewsMaybePopup) w.pitNewsMaybePopup(); } catch (e) {} }, 300);
  }

  function welcome() {
    if (welcomed()) return false;
    if (!w.pitAlert) return false;                 /* ask-pit.js より後ろで呼ぶ前提 */
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) {}
    pitAlert('ここは練習用のデモ版です', {
      detail:
        '本番のデータには一切つながっていません。何をしても、実際の予約やお客様の情報は変わりません。\n\n' +
        '・保存されるのは、いま見ているこの端末の中だけです\n' +
        '・お客様・車・電話番号はすべて架空のものです\n' +
        '・散らかったら 設定 ▸ 開発用サンプル から作り直せます\n\n' +
        '好きなだけ触って、好きなだけ壊してください。',
      ok: 'はじめる'
    }).then(releaseNews);                          /* 閉じたら、押さえていたお知らせを出す */
    return true;
  }

  /* ---------- 立ち上げ ---------- */
  /* 印はログイン画面が出る前から付けたいので、DOM ができ次第すぐ。
     案内は「中に入った ＆ 画面に窓が出ていない」時だけ。
     ⚠ ログイン直後は**お知らせのポップアップ**（news-pit.js・`#nw-pop`）が出ることがある。
        そこへ重ねると、下の窓が押せなくなって現場が詰む。**必ず空くのを待つ。** */
  function busy() {
    var uid = d.getElementById('uid-ov');
    if (uid && uid.classList.contains('open')) return true;      /* アプリ内ダイアログ */
    var nw = d.getElementById('nw-pop');
    if (nw && nw.offsetParent !== null) return true;             /* お知らせのポップアップ */
    return false;
  }
  function boot() {
    mark();
    holdNews();                       /* 🔴 ログインより前に押さえる（900ms に間に合わせる） */
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (tries > 600) { clearInterval(t); releaseNews(); return; }  /* 5分見て諦める＋押さえを外す */
      if (!d.body.classList.contains('pit-authed')) return;          /* まだログイン画面 */
      if (busy()) return;                                            /* 何か窓が出ている＝待つ */
      clearInterval(t);
      mark();                                                        /* トップバーは入ってから描かれる */
      if (!welcome()) releaseNews();    /* 案内を出さなかった時も、押さえは必ず外す */
    }, 500);
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
