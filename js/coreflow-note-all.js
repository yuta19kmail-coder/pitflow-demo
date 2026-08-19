/* ========================================
   coreflow-note-all.js  -  付箋の「まとめて表示」（全アプリ共通の本体）
   ----------------------------------------
   🔴 **本体はここ（_shared）だけ。** アプリ側の js\ にあるのは配られたコピー。
      直す時は必ずここを直して `sync-shared.ps1` を走らせること。

   ◎なにをするもの（ゆうた指定 2026-08-19）
     🗣「PitFlow と CarFlow の**新規付箋の横にボタン**を作って。
     　　これをクリックすると **MHS・PitFlow・CarFlow 全アプリの付箋が集合して一斉表示**する。
     　　※MHSは既存でこの仕様。
     　　**返信やチェックなどはこの状態でできて**、もう一度押すか、ビューを切り替えたらデフォルトに戻る。
     　　ボタンは新規より目立たない形がいい」

     ＝ 押している間だけ、**よそのアプリの付箋も一緒に並べる**スイッチ。

   ◎決めごと
     🔴 **一時的な表示の切り替えだけ。**押している間しか他アプリを読まない（購読を張る／離すだけ）。
        ⚠ 自分のアプリの付箋のデータは1バイトも触らない。
     🔴 **もう一度押す／ビューを移る／画面を開き直す＝解除**（持ち越さない）。
     🔴 **よその付箋にできるのは「返信」と「チェック（済・回覧の確認）」だけ。**
        編集・消去・並び替えはできない（順番も色ラベルも、そのアプリのものだから）。
     ⚠ MHS は**もともと3つまとめて出す作り**なので、MHS にはこのボタンを付けない。

   ◎入れ物（Firestore・companies/{会社}/ の下）
        CarFlow  … boardNotes
        PitFlow  … pitBoardNotes      ⚠ pitNotes ではない（2026-08-18 の直し）
        MHS      … mhsNotes
     ⚠ 3つとも**同じ形**（id/title/body/color/noteType/memberUids/doneByUids/replies/status/order…）。
        だから並べて出せるし、返信も同じ部品（coreflow-note-reply.js）が使える。

   ◎使い方（アプリ側）
     CFNoteAll.setup({
       self:'pitflow',                       // 自分のアプリ（これは集めない）
       db:      function(){ return window.fb.db },
       company: function(){ return window.fb.company() },   // companies/{会社} の doc ref
       ready:   function(){ return 本番モードで読める状態か },
       onChange:function(){ 描き直し },
       toast:   function(msg){ }
     });
     ・ボタン … `CFNoteAll.toggle()` ／ 見た目は `CFNoteAll.isOn()`
     ・並べる … 自分の付箋 + `CFNoteAll.foreign()`
     ・保存   … `CFNoteAll.save(note, done)`（よその付箋だけ。`CFNoteAll.isForeign(note)` で見分ける）
   ======================================== */
(function (w, d) {
  'use strict';

  var COLS  = { carflow: 'boardNotes', pitflow: 'pitBoardNotes', mhs: 'mhsNotes' };
  var LABEL = { carflow: 'CarFlow',    pitflow: 'PitFlow',       mhs: 'MHS' };
  var ORDER = ['carflow', 'pitflow', 'mhs'];

  var cfg = {};
  var _on = false;
  var _bag = {};        /* app → 付箋の配列 */
  var _unsubs = [];
  var _busy = false;

  function call(fn, dflt) { try { return fn(); } catch (e) { console.warn('[note-all]', e); return dflt; } }
  function toast(m) { if (cfg.toast) call(function () { return cfg.toast(m); }); }
  function fire()   { if (cfg.onChange) call(function () { return cfg.onChange(); }); }
  function others() { return ORDER.filter(function (a) { return a !== cfg.self && COLS[a]; }); }

  /* このボタンを出してよいか＝クラウドに繋がっていて、名簿も読める本番モードの時だけ。
     ⚠ 練習用（サンプル・デモ）では出さない。よそのアプリのデータが無いので押しても何も起きない。 */
  /* ⚠ 2026-08-19：ボタンが出ない、が最初の版で起きた。**なぜ出ないのかを必ず残す。**
     　 黙って false を返すと、画面に何も出ないだけで原因が分からない。 */
  var _whyLogged = '';
  function why() {
    if (!cfg.self || !COLS[cfg.self]) return '自分のアプリが設定されていません（setup の self）';
    var db = cfg.db && call(function () { return cfg.db(); }, null);
    if (!db) return 'Firestore に繋がっていません（練習用モードでは出ません）';
    var co = cfg.company && call(function () { return cfg.company(); }, null);
    if (!co) return '会社のデータの入口が取れませんでした';
    if (cfg.ready && !call(function () { return !!cfg.ready(); }, false)) return 'まだ読み込み中です';
    return '';
  }
  function available() {
    var w2 = why();
    if (w2 && w2 !== _whyLogged) { _whyLogged = w2; console.log('[note-all] まとめて表示は出しません＝' + w2); }
    if (!w2) _whyLogged = '';
    return !w2;
  }

  function isOn() { return _on; }
  function isForeign(n) { return !!(n && n._app && n._app !== cfg.self); }
  function labelOf(n) { return (n && n._app && LABEL[n._app]) || ''; }
  function appOf(n) { return (n && n._app) || cfg.self; }

  /* いま集まっている「よそのアプリの付箋」。自分のぶんは入らない。 */
  function foreign() {
    if (!_on) return [];
    var out = [];
    others().forEach(function (a) { (_bag[a] || []).forEach(function (n) { out.push(n); }); });
    return out;
  }
  function count() { return foreign().length; }

  /* ---------- 集める・やめる ---------- */
  function stop() {
    _unsubs.forEach(function (u) { try { u(); } catch (e) {} });
    _unsubs = [];
    _bag = {};
  }
  function start() {
    stop();
    var co = call(function () { return cfg.company(); }, null);
    if (!co) return false;
    others().forEach(function (app) {
      var un = co.collection(COLS[app]).onSnapshot(function (snap) {
        var arr = [];
        snap.forEach(function (doc) {
          var o = doc.data() || {};
          o.id = doc.id;
          o._app = app;               /* どのアプリの付箋か（見た目と保存先に使う） */
          arr.push(o);
        });
        _bag[app] = arr;
        if (_on) fire();
      }, function (e) {
        console.warn('[note-all] ' + COLS[app] + ' の購読に失敗', e);
        toast(LABEL[app] + 'の付箋を読めませんでした');
      });
      _unsubs.push(un);
    });
    return true;
  }

  function on() {
    if (_on) return;
    if (!available()) { toast('この画面ではまとめて表示できません'); return; }
    if (_busy) return;
    _busy = true;
    _on = true;
    if (!start()) { _on = false; _busy = false; return; }
    _busy = false;
    fire();
    toast('CarFlow・PitFlow・MHS の付箋をまとめて出しています');
  }
  function off(silent) {
    if (!_on) { stop(); return; }
    _on = false;
    stop();
    fire();
    if (!silent) toast('このアプリの付箋だけに戻しました');
  }
  function toggle() { if (_on) off(); else on(); }

  /* ---------- よその付箋を保存する ----------
     ⚠ **返信とチェックだけ**（編集・消去はアプリ側で止めている）。
     ⚠ 丸ごと上書きではなく merge。よそのアプリが持っている項目（期限・画像など）を消さないため。 */
  function save(note, done) {
    if (!note || !note.id) { if (done) done(); return; }
    var app = appOf(note);
    var col = COLS[app];
    var co = call(function () { return cfg.company(); }, null);
    if (!col || !co) { toast('保存できませんでした'); return; }
    var body = {};
    ['replies', 'status', 'doneAt', 'doneByUid', 'doneByUids'].forEach(function (k) {
      if (note[k] !== undefined) body[k] = note[k];
    });
    try {
      if (w.fb && w.fb.serverTimestamp) body.updatedAt = w.fb.serverTimestamp();
    } catch (e) {}
    co.collection(col).doc(note.id).set(body, { merge: true })
      .then(function () { if (done) done(); })
      .catch(function (e) {
        console.error('[note-all] ' + col + ' の保存に失敗', e);
        toast(LABEL[app] + 'の付箋を保存できませんでした');
      });
  }

  /* ---------- 出どころの札 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function badgeHtml(note) {
    if (!isForeign(note)) return '';
    var a = appOf(note);
    return '<span class="cfa-src cfa-src-' + esc(a) + '">' + esc(LABEL[a]) + '</span>';
  }

  function setup(o) {
    cfg = o || {};
    return w.CFNoteAll;
  }

  w.CFNoteAll = {
    setup: setup, toggle: toggle, on: on, off: off,
    isOn: isOn, available: available, why: why, foreign: foreign, count: count,
    isForeign: isForeign, labelOf: labelOf, appOf: appOf, badgeHtml: badgeHtml, save: save,
    COLS: COLS, LABEL: LABEL
  };
  console.log('[coreflow-note-all] ready（付箋のまとめて表示・全アプリ共通）');
})(window, document);
