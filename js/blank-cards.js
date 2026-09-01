/* ========================================
   blank-cards.js  -  新規予約の「下書き」と、空カードの消去（PitFlow）
   v1.17.0（2026-08-02）
   ----------------------------------------
   ◎ 何を解決したものか

   【もとの不具合】
     「＋ 新規予約」を押すと、**入力する前に**カードが1枚できて即保存されていた。
     （v0.83.1／v0.87.1：入力の途中でスマホの入力が丸ごと消える事故の対策だった）
     ところが「保存する」と「← 戻る」が**中で同じ処理を呼んでいた**ので、
     やめたつもりでもカードが残り、
       ・入庫日＝作った日／状態＝予約  なので「今日の入庫」「預かり中」に数えられる
       ・時間が空なので予約ビューのどの枠にも出ない（件数だけ増えて中身が見えない）
     という、画面から見つけられない幽霊カードになっていた。

   【今の作り（v1.17.0・ゆうた決定）】
     新規予約は **「下書き（_draft）」** で始まる。
       ・下書きの間は **クラウドにも端末の本保存にも書かない**（db-pit.js が外している）
         ＝どこにも数えられないし、他の端末にも出ない。
       ・**保存する／仮予約で登録／印刷して保存** を押した時に下書きを外す＝ここで初めて保存。
       ・**← やめる** で捨てる。何か入力があれば必ず確認する（card-detail.js の pitCancelCard）。
     入力が消えないように、書きかけは **この端末の中だけ**（localStorage）に控える。
     次に「＋ 新規予約」を押した時に「続きから開きますか？」と聞く。

   ◎ このファイルの持ち場
     ① 書きかけの控え（保存・復元・破棄）
     ② カード画面から出た時に、確定していない下書きを state から外す
     ③ 設定の「空の予約カードを消去する」＝**v1.16.0 より前に溜まった分**の後始末
        🔴 v1.135.0 言葉を「片付ける」から「消去」に変えた（v1.136.0 で「消す」→「消去」に再統一）（ゆうた指定の言葉そろえ）。
           ⚠ **「アーカイブ」にはしない。** ここは `state.cards` から本当に消していて、
              アーカイブ（＝印を立てるだけ・データは消さない）とは中身が違う。
              同じ言葉にすると「戻せるはず」と思わせてしまう。
        （新しく増えることはもう無いので、これは掃除用）

   ⚠ 「空」の判定はホワイトリスト方式（pitIsBlankCard）。逆にしないこと。
      項目が増えた時に「入力があるのに空と判定して消す」事故になる。

   公開：pitIsBlankCard / pitDropDraft / pitKeepDraft / pitClearDraftKeep
         pitOpenBlankClean / pitSweepDraft
   ======================================== */
(function (w, d) {
  'use strict';

  var KEEP_KEY = 'pitflow_draft_card';   /* 書きかけの控え（この端末だけ） */

  /* ---- 人が入れる項目（ここに無いものは「空か」の判定に使わない） ---- */
  var TEXTS = [
    'customer', 'kana', 'tel', 'plate', 'maker', 'car', 'model',
    'menu', 'memo', 'karteNo', 'lstepId', 'lineId', 'lineStatus',
    'reserveTime', 'returnDate', 'returnDatePlan', 'returnDateFinal', 'decided',
    'boardId', 'division', 'frontStaff', 'workType', 'dropType', 'dropType2',
    'estHoldDays', 'repeat', 'customerId', 'outsource', 'outsourceDate',
    'loanerId', 'loanerModel', 'phase', 'bayId'
  ];
  var FLAGS = [
    'consult', 'needLoaner', 'needWash', 'urgent', 'tentative', 'testDrive',
    'headlight', 'coatingOK', 'salesReq', 'emergency'
  ];
  var NUMS = ['estAmount', 'amountQuote', 'amountOrder', 'amountFinal'];
  var LISTS = ['contacts', 'workSpecials', 'checks', 'slots'];

  function _has(v) {
    if (v == null) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (typeof v === 'boolean') return v === true;
    if (typeof v === 'number') return true;              /* 0 も「入れた」扱い */
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  }

  /* このカードは「何も入力されていない」か？ */
  function isBlank(c) {
    if (!c || typeof c !== 'object') return false;
    if (c._sample) return false;                            /* サンプルは触らない */
    if (c.status && c.status !== 'reserved') return false;  /* 動かしたカードは触らない */
    var i;
    for (i = 0; i < TEXTS.length; i++) if (_has(c[TEXTS[i]])) return false;
    for (i = 0; i < FLAGS.length; i++) if (_has(c[FLAGS[i]])) return false;
    for (i = 0; i < NUMS.length;  i++) if (_has(c[NUMS[i]]))  return false;
    for (i = 0; i < LISTS.length; i++) if (_has(c[LISTS[i]])) return false;
    /* 🔴 v1.56.1 「ログが1件を超えたら触った」は**緩すぎた**。
       「予約作成」「表紙を印刷して保存」のような**自動で付く記録**まで数えていたので、
       中身が空のまま印刷して保存したカードが**空カード検出から丸ごと漏れていた**
       （2026-08-06 の本番で6枚。どれも log は 予約作成 → 表紙を印刷して保存 の2つだけ）。
       ⚠ 「人が触った」とみなすのは
          **手で足した記録（manual）** と **工程が動いた記録（type:'phase'）** だけ。 */
    if (Array.isArray(c.log) && c.log.some(function (e) {
      return e && (e.manual === true || e.type === 'phase');
    })) return false;
    return true;
  }
  w.pitIsBlankCard = isBlank;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function confirmBox(msg, opt) {
    if (w.UI && w.UI.confirm) return w.UI.confirm(msg, opt || {});
    return Promise.resolve(w.confirm(msg + (opt && opt.detail ? '\n\n' + opt.detail : '')));
  }

  /* =========================================================
     ① 書きかけの控え（この端末の中だけ）
     ========================================================= */
  function draftInState() {
    return ((w.state && w.state.cards) || []).filter(function (c) { return c && c._draft; })[0] || null;
  }

  /* いまの下書きを端末に控える（中身が空なら控えない＝ゴミを残さない）
     ⚠ **下書きが画面に無い時は何もしない**こと。ここで消してしまうと、
        「やめる」で state から外した直後に PitDB.save が走って控えごと消え、
        「続きから開く」が効かなくなる（作っている最中に踏んだ罠）。
        控えを消してよいのは、保存できた時と「新しく作る」を選んだ時だけ＝clearKeep()。 */
  function keepDraft() {
    var c = draftInState();
    if (!c) return;
    try {
      if (isBlank(c)) { localStorage.removeItem(KEEP_KEY); return; }   /* 画面の下書きが空になった＝控えも要らない */
      localStorage.setItem(KEEP_KEY, JSON.stringify({ at: Date.now(), card: c }));
    } catch (e) { /* 容量オーバー等。控えは保険なので黙って諦める */ }
  }
  w.pitKeepDraft = keepDraft;

  function readKeep() {
    try {
      var raw = localStorage.getItem(KEEP_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.card || isBlank(o.card)) return null;
      return o;
    } catch (e) { return null; }
  }
  function clearKeep() { try { localStorage.removeItem(KEEP_KEY); } catch (e) {} }
  w.pitClearDraftKeep = clearKeep;

  /* 下書きを state から外す。keepAlso=true なら端末の控えも消す（＝完全に無かったことに） */
  function dropDraft(id, alsoClearKeep) {
    if (!w.state || !Array.isArray(w.state.cards)) return;
    w.state.cards = w.state.cards.filter(function (c) { return !(c && c._draft && (!id || c.id === id)); });
    if (alsoClearKeep) clearKeep();
    try { if (w.PitDB) w.PitDB.save(true); } catch (e) { console.warn('[draft] 保存でエラー', e); }
  }
  w.pitDropDraft = dropDraft;

  /* カード画面から出た時に、確定していない下書きを外す（控えは残す＝続きから開ける） */
  function sweepDraft() {
    var c = draftInState();
    if (!c) return;
    keepDraft();          /* 先に控えてから */
    dropDraft(c.id, false);
    console.log('[draft] 保存されていない新規予約を画面から外しました（書きかけはこの端末に控えあり）');
  }
  w.pitSweepDraft = sweepDraft;

  /* ---- 入力のたびに控える（PitDB.save に相乗り） ---- */
  function hookSave() {
    if (!w.PitDB || typeof w.PitDB.save !== 'function' || w.PitDB.save.__draftWrap) return false;
    var orig = w.PitDB.save;
    var f = function () { try { keepDraft(); } catch (e) {} return orig.apply(this, arguments); };
    f.__draftWrap = 1;
    w.PitDB.save = f;
    return true;
  }

  /* ---- 「＋ 新規予約」＝控えがあれば「続きから？」を先に聞く ---- */
  function hookOpeners() {
    ['openNewReserve', 'custNewReserveFor', 'custNewReserveFromCard'].forEach(function (nm) {
      var f = w[nm];
      if (typeof f !== 'function' || f.__draftWrap) return;
      var g = function () {
        var self = this, args = arguments;
        sweepDraft();                       /* 前の書きかけが画面に残っていたら外す */
        var keep = (nm === 'openNewReserve') ? readKeep() : null;   /* 顧客から作る時は復元しない（別の客の書きかけを混ぜない） */
        if (!keep) return f.apply(self, args);
        var when = new Date(keep.at);
        var who  = ((window.pitCustName ? pitCustName(keep.card) : keep.card.customer) || '').trim();
        confirmBox('書きかけの予約があります。続きから開きますか？', {
          title: '書きかけの予約',
          detail: '保存せずに閉じたぶんです（' + (when.getMonth() + 1) + '/' + when.getDate() + ' ' +
                  ('0' + when.getHours()).slice(-2) + ':' + ('0' + when.getMinutes()).slice(-2) + '）' +
                  (who ? '／お客様：' + esc(who) : '') +
                  '。「新しく作る」を選ぶと、この書きかけは捨てます。',
          ok: '続きから開く', cancel: '新しく作る'
        }).then(function (yes) {
          if (yes) {
            var c = keep.card; c._draft = true;
            if (!Array.isArray(w.state.cards)) w.state.cards = [];
            if (!w.state.cards.some(function (x) { return x.id === c.id; })) w.state.cards.push(c);
            if (w.openCard) w.openCard(c.id, 'page');
          } else {
            clearKeep();
            f.apply(self, args);
          }
        });
        return undefined;
      };
      g.__draftWrap = 1;
      w[nm] = g;
    });
  }

  /* ---- 別の画面へ移る時／タブを閉じる時 ---- */
  function hookLeave() {
    if (typeof w.showView === 'function' && !w.showView.__draftWrap) {
      var sv = w.showView;
      var h = function (v) {
        /* カード画面の中では外さない（＝入力中に消えない）。出る時だけ。 */
        if (v !== 'card') { try { sweepDraft(); } catch (e) {} }
        return sv.apply(this, arguments);
      };
      h.__draftWrap = 1; w.showView = h;
    }
  }
  w.addEventListener('beforeunload', function () { try { keepDraft(); } catch (e) {} });

  /* =========================================================
     ② 設定の「空カード消去」は v2.50.0 で外した（下のコメント参照）
     ⚠ ここにあった `canShow` / `blanks` / `injectCSS` は**どこからも呼ばれなくなったので消した。**
        使われない関数を残すと、次に読む人が「まだ生きている」と勘違いする。
     ========================================================= */

  /* 🗑 v2.50.0（ゆうた確定 2026-09-01）**設定画面の「空の予約カードを消去する」を外した。**
     ◎なぜ
       これは **v1.17.0 より前に溜まったぶんの後始末**で、
       このファイル自身が「いまは保存を押すまでカードができない作りなので、
       **これ以上増えることはありません**」と書いていた＝**1回きりの道具**。
       済んだ道具を設定画面に置き続けると、毎日開く人の目には**ただの雑音**になる。
     🔴 **空のカードを作らせない仕掛け（下の hookOpeners / hookLeave / hookSave）は残してある。**
        外したのは「溜まったものを掃除するボタン」だけ。**防ぐ側は現役。**
     ⚠ また掃除が要るようになったら、`_to_delete` ではなくここの履歴から戻すこと。 */

  function boot() {
    hookOpeners();
    hookLeave();
    var a = hookSave();
    if (!a) setTimeout(boot, 300);   /* まだ読み込まれていない物があれば少し待って掛け直す */
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();
  console.log('[draft] ready');
})(window, document);
