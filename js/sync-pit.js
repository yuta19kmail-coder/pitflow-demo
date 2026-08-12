/* ========================================
   sync-pit.js  -  同期ランプ（PitFlow）
   ----------------------------------------
   ◎なにをするもの
     TOPバー右上の小さいランプで、いまの保存の状態を出す。
       ・同期中   … クラウドへ書いている最中（黄）
       ・同期済み … 書き終わって、みんなと同じ状態（緑・脈打つ）
       ・受信     … 他の人の変更が入ってきた（青くひと呼吸）
       ・オフライン … ネットが切れている（赤・止まる）
       ・保存できません … 書き込みに失敗した（赤・要注意）
       ・端末保存 … サンプルモード（この端末の中だけ／灰）
     クリックすると、いつ同期したか・何に繋がっているかが出る。

   ◎どこから呼ばれるか
     db-pit.js が、書き始め／書き終わり／失敗／受信 のたびに PitSync.set() を呼ぶ。
     ネットの切断は online / offline を自分で見ている。
   ======================================== */
(function (w, d) {
  'use strict';

  var _state = 'idle';       // idle | saving | recv | offline | error | local
  var _lastAt = 0;           // 最後に同期できた時刻
  var _pending = 0;          // 書いている最中の数
  var _tRecv = null;

  function el() { return d.querySelector('.sync-indicator'); }
  function fmt(ms) {
    if (!ms) return 'まだ同期していません';
    var t = new Date(ms), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(t.getHours()) + ':' + p(t.getMinutes()) + ':' + p(t.getSeconds());
  }

  var LABEL = {
    idle:    '同期済み',
    saving:  '同期中',
    recv:    '受信',
    offline: 'オフライン',
    error:   '保存エラー',
    local:   '端末保存'
  };

  function paint() {
    var e = el();
    if (!e) return;
    var s = _state;
    if (!w.PIT_CLOUD) s = 'local';
    else if (!navigator.onLine) s = 'offline';

    e.className = 'sync-indicator sync-' + s;
    e.innerHTML = '<span class="sync-dot"></span><span class="sync-text">' + LABEL[s] + '</span>';

    var tip;
    if (s === 'local')        tip = 'この端末の中だけに保存しています（サンプル）';
    else if (s === 'offline') tip = 'ネットに繋がっていません。直した内容は画面には残っていますが、まだ全員には届いていません';
    else if (s === 'error')   tip = '保存できませんでした。通信を確認してください';
    else if (s === 'saving')  tip = 'クラウドへ保存しています…';
    else                      tip = '最後の同期 ' + fmt(_lastAt);
    e.title = tip;
  }

  var PitSync = {
    /* db-pit.js から呼ばれる */
    saving: function () {
      _pending++;
      if (_state !== 'offline') { _state = 'saving'; paint(); }
    },
    saved: function () {
      _pending = Math.max(0, _pending - 1);
      _lastAt = Date.now();
      if (_pending === 0) { _state = 'idle'; paint(); }
    },
    failed: function () {
      _pending = Math.max(0, _pending - 1);
      _state = 'error'; paint();
    },
    received: function () {
      _lastAt = Date.now();
      if (_state === 'saving') return;
      _state = 'recv'; paint();
      clearTimeout(_tRecv);
      _tRecv = setTimeout(function () { if (_state === 'recv') { _state = 'idle'; paint(); } }, 1200);
    },
    connected: function () { _state = 'idle'; _lastAt = Date.now(); paint(); },
    set: function (s) { _state = s; paint(); },
    refresh: paint
  };
  w.PitSync = PitSync;

  /* クリックしたら中身を出す（トーストで簡単に） */
  w.pitSyncSample = function () {   /* 名前は今までのまま＝index.html を触らずに済む */
    var msg;
    if (!w.PIT_CLOUD) {
      msg = 'この端末の中だけに保存しています（サンプル）。本番のアドレスで開くと全員で共有されます。';
    } else if (!navigator.onLine) {
      msg = 'ネットに繋がっていません。直した内容はこの画面には残っていますが、まだ全員には届いていません。';
    } else if (_state === 'error') {
      msg = '保存できませんでした。通信を確認して、もう一度直してみてください。';
    } else {
      var when = _lastAt ? '（最後の同期 ' + fmt(_lastAt) + '）' : '（開いてから、まだ保存はしていません）';
      msg = '全員と共有中です' + when;   /* v1.1.2：他アプリと同じ文言に（ログイン名は出さない） */
    }
    /* v1.1.1：画面下のトーストではなく、ランプのすぐそばにふきだしで出す（全アプリ共通の部品を借りる） */
    if (w.CFSync && w.CFSync.bubble) w.CFSync.bubble(msg);
    else if (w.showToast) showToast(msg); else if (w.pitToast) pitToast(msg);
  };

  w.addEventListener('online', function () { _state = 'idle'; paint(); });
  w.addEventListener('offline', function () { _state = 'offline'; paint(); });

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', paint);
  else paint();
})(window, document);
