/* ================================================================================
   force-reload-pit.js  -  📣 **全端末を、今すぐ最新版に入れ替える合図**  PitFlow v2.8.2
   ================================================================================
   🗣「強制リロードを全端末でかけるデプロイはできない？」（ゆうた 2026-08-25・本番が止まった日）

   ◎なぜ要るか
     `auto-update.js` は**もう全端末に入っている**が、確かめに行くのは **1時間に1回**
     （2026-08-17 にゆうたが「操作中に戻されて不便」と言って絞った数字。🔴 戻さないこと）。
     ふだんはそれでいい。**でも今日みたいに「古い版が1台残っているだけで全体が止まる」時、
     1時間は長すぎる。** 出したその場で全部を入れ替える手が要る。

   ◎やること ＝ **クラウドに合図を1つ置くだけ。**
     `pitSettings/main` の `settings.forceReloadAt`（時刻の文字列）が**前に見たものと変わったら**、
     その端末は最新版を読み直す。PitDB が設定を購読しているので、**合図は1〜2秒で全端末に届く**。

   ◎🔴🔴 ここは「勝手にリロードする」仕掛け＝**空回りしたら業務が止まる。**
     　　　だから守りを4枚重ねてある。1枚も外さないこと。
     ① **見た合図は localStorage に、リロードする前に**書く（`pitflow_force_reload`）。
        ＝読み直したあとは「もう見た合図」になるので、二度と反応しない。
     ② localStorage が使えない端末（プライベートモードなど）では **何もしない**。
        ＝控えを残せない＝止まらなくなるので、**やらないほうを選ぶ**。
     ③ 1回の読み込みで**リロードは1回まで**（`_done`）。
     ④ 打ち込み中は待つ（入力欄・選択・contenteditable にカーソル／モーダルが開いている／
        `window.__appBusy`）。⚠ ここは `auto-update.js` の「安全な時」と同じ考え方。
        ⚠ ただし**待つのは最大60秒**。そのあとは業務より復旧を優先して読み直す
        （そもそも「全部止まっている」時に押す物なので）。

   ◎誰が押すか … **管理者だけ**（設定ページの「全端末を今すぐ更新する」）。
   ◎合図を出した端末自身も、同じ道でリロードされる（自分だけ古いまま、が起きない）。

   ⚠ これは**版を配る仕掛けではない**。配るのは `deploy-pitflow.ps1`。
      これは「配り終わったあと、全端末に今すぐ読み直させる」だけ。出す前に押しても意味がない。
   ================================================================================ */
(function (w, d) {
  'use strict';

  var KEY   = 'pitflow_force_reload';
  var WAIT  = 60 * 1000;      // 打ち込み中でも、これ以上は待たない
  var TICK  = 2 * 1000;
  var _done = false;          // ③ 1回の読み込みでリロードは1回まで
  var _timer = 0, _since = 0, _want = '';

  function s(v){ return String(v == null ? '' : v); }

  /* ② 控えを残せない端末では、この仕掛けを丸ごと止める */
  function store(v){
    try {
      if (v === undefined) return w.localStorage.getItem(KEY);
      w.localStorage.setItem(KEY, s(v));
      return s(v);
    } catch (e) { return null; }
  }
  function usable(){
    try { w.localStorage.setItem(KEY + '_t', '1'); w.localStorage.removeItem(KEY + '_t'); return true; }
    catch (e) { return false; }
  }

  /* ④ 打ち込みを巻き込まない（auto-update.js と同じ考え方） */
  function safe(){
    if (w.__appBusy) return false;
    var ae = d.activeElement;
    if (ae) {
      var tag = (ae.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae.isContentEditable) return false;
    }
    var dlg = d.querySelector('[role="dialog"], .modal, #modal, .modal-backdrop, .overlay, .crop-box');
    if (dlg && dlg.offsetParent !== null) return false;
    return true;
  }

  function go(){
    if (_done) return;
    _done = true;
    if (_timer) { clearInterval(_timer); _timer = 0; }
    store(_want);                                  // 🔴 ① 読み直す**前**に控える
    var t = d.createElement('div');
    t.textContent = '📣 全端末の更新です。読み直します…';
    t.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;'
      + 'background:#dc2626;color:#fff;padding:10px 18px;border-radius:999px;'
      + 'font:700 14px -apple-system,BlinkMacSystemFont,"Segoe UI","Yu Gothic Medium","Meiryo",sans-serif;'
      + 'box-shadow:0 6px 20px rgba(0,0,0,.28)';
    (d.body || d.documentElement).appendChild(t);
    /* ⚠ 読み直しは `w.pitForceReloadNow` 越しに呼ぶ。**見張り（test_force_reload.mjs）が
       ここだけ差し替えて、本当にページを飛ばさずに「呼ばれたか」を数えるため。**
       `location.reload` は差し替えられない（ブラウザが許さない）ので、この継ぎ目が要る。 */
    setTimeout(function () { (w.pitForceReloadNow || reloadNow)(); }, 1200);
  }
  function reloadNow(){ w.location.reload(); }

  /* PitDB が設定を読んだ・受け取ったときに呼ばれる。**判断はここ1本。** */
  function check(settings){
    if (_done || !usable()) return false;
    var at = s(settings && settings.forceReloadAt).trim();
    if (!at) return false;
    var seen = store();
    if (seen === null) return false;               // ② 控えが読めない＝やらない
    if (seen === at) return false;                 // もう見た合図
    _want = at;
    if (!_since) _since = Date.now();
    if (safe() || (Date.now() - _since) > WAIT) { go(); return true; }
    /* 打ち込み中＝手が空くまで待つ（最大60秒） */
    if (!_timer) _timer = setInterval(function () { check(w.state && w.state.settings); }, TICK);
    return false;
  }

  /* 🔴 初めてこの版を開いた端末は、いまの合図を「見たこと」にして黙らせる。
     ＝ 入れた瞬間に全端末が1回よけいに読み直す、を起こさない。 */
  function seed(settings){
    if (!usable()) return;
    if (store() !== null) return;                  // すでに控えがある＝ふつうに見る
    store(s(settings && settings.forceReloadAt).trim());
  }

  /* 管理者が押す。合図＝押した時刻。**中身に意味は無い。前と違うことだけが意味。** */
  function fire(){
    if (!w.PitDB || !w.state) return false;
    if (!w.state.settings) w.state.settings = {};
    w.state.settings.forceReloadAt = new Date().toISOString();
    w.PitDB.save(true);
    if (w.showToast) showToast('全端末に「今すぐ更新」を送りました', '');
    /* 自分も同じ道で読み直す（保存が上がりきる間だけ待つ） */
    setTimeout(function () { check(w.state.settings); }, 2500);
    return true;
  }

  /* 設定ページのボタンから。⚠ 純正の confirm は使わない（アプリ内の窓＝pitAsk） */
  function ask(){
    var msg = '開いている全部の端末を、いま最新版に読み直させます。\n\n'
            + '打ち込み中の端末は、手が空いてから（最大60秒）読み直します。\n'
            + '⚠ 新しい版を「出したあと」に押してください。';
    if (w.pitAsk) {
      w.pitAsk(msg, { ok: '全端末を更新する' }).then(function (yes) { if (yes) fire(); });
    } else { fire(); }
  }

  w.pitForceReloadNow   = reloadNow;   /* ⚠ 見張りが差し替える継ぎ目。ふつうは触らない */
  w.pitForceReloadCheck = check;
  w.pitForceReloadSeed  = seed;
  w.pitForceReloadFire  = fire;
  w.pitForceReloadAsk   = ask;
})(window, document);
