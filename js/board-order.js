/* ========================================
   board-order.js  -  タスクボードの「マスター並び」  PitFlow v1.140.0
   ----------------------------------------
   ◎なにをするもの（ゆうた指定 2026-08-18）
     🗣「タスクビューのバーの位置が勝手に変わる。というか自動で並び替えが入る。
        あくまで**人が動かした順をマスター並び**として、その状態から動かないようにしたい」

     ＝ カード1枚ずつに **並び番号（boardOrder）** を持たせて、クラウドに保存する。
        看板の列は **いつでもこの番号の順にだけ**並べる。

   ◎なぜ必要だったか（v1.139.0 までの作り）
     🔴 **並び順はどこにも保存されていなかった。**
        看板の列は `state.cards` という**配列の順**をそのまま出していただけで、
        ドラッグは配列の中で入れ替える（dnd.js の reorder）だけ。カードのデータには書いていない。
        だから ──
        ・開き直すと Firestore が返す順（＝ほぼ**カードIDの順**）に戻る
        ・他の人の端末では**別の順**に見えている
        ・新しい予約・購読で届いたカードは**配列の末尾に push**される
        ・自動更新（v1.117.0）で読み直すたびに同じことが起きる
        ＝「勝手に並び替わる」のではなく、**人が決めた順を覚えていなかった**のが正体。

   ◎決めごと
     🔴 **番号が変わるのは「人がカードを掴んで落とした時」だけ。**
        読み込み・自動更新・他の人の編集では**1ミリも動かない**。
     🔴 **番号を書く所はこのファイルだけ。** ほかのファイルで `boardOrder` を直接いじらない。
     ⚠ 番号を持っていないカード（新しく来た・工程を移した）は **列のいちばん下**。黙って割り込ませない。
     ⚠ 番号を振るのは **いま盤面に乗っているカードだけ**（返車済み・アーカイブ・下書きには振らない）。
        全カードに振ると、何千件ものクラウド書き込みが一度に飛ぶ。

   ◎初回（2026-08-18 ゆうた指定「とりあえずいまの並びのまま振って」）
     `ensure()` が、番号を持っていないカードに **いま出ている順のまま** 10, 20, 30 … と振る。
     ⚠ 読み込み直後の並びは Firestore のドキュメントID順＝**どの端末でも同じ**なので、
        誰が最初に開いても同じ番号になる。
   ======================================== */
(function (w) {
  'use strict';

  var KEY  = 'boardOrder';
  var STEP = 10;

  function cards(){ return (w.state && state.cards) || []; }
  function boardIds(){
    return ((w.state && state.boards) || []).map(function(b){ return b && b.id; }).filter(Boolean);
  }
  /* 盤面に乗っている＝この列に並んでいるカードか。
     ⚠ ここが番号を振る範囲。広げると書き込みが増えるので、増やす時は理由を書くこと。 */
  function onBoard(c){
    if (!c || !c.id || c._draft) return false;
    if (c.returnStage) return false;                       /* 完TEL待ち・返車待ちは盤面から外れている */
    if (w.PitArchive && PitArchive.cardArchived && PitArchive.cardArchived(c)) return false;   /* アーカイブ（archive-pit.js の物差し1本） */
    if (boardIds().indexOf(c.boardId) < 0) return false;
    var b = ((w.state && state.boards) || []).find(function(x){ return x && x.id === c.boardId; });
    if (!b || !Array.isArray(b.cols)) return false;
    for (var i = 0; i < b.cols.length; i++){ if (b.cols[i].id === c.status) return true; }
    return false;
  }
  function gkey(c){ return String(c.boardId || '') + '|' + String(c.status || ''); }

  /* ---------- 読む ---------- */
  function orderOf(c){
    var v = c ? c[KEY] : null;
    return (typeof v === 'number' && isFinite(v)) ? v : null;
  }
  /* 並べる。番号が無いカードは**いちばん下**（そのままの順で）。 */
  function sort(list){
    var idx = {};
    (list || []).forEach(function(c, i){ if (c) idx[c.id] = i; });
    return (list || []).slice().sort(function(a, b){
      var oa = orderOf(a), ob = orderOf(b);
      if (oa == null && ob == null) return idx[a.id] - idx[b.id];
      if (oa == null) return 1;
      if (ob == null) return -1;
      return (oa - ob) || (idx[a.id] - idx[b.id]);
    });
  }

  /* ---------- 書く（人が動かした時だけ） ---------- */
  function group(c){
    return cards().filter(function(x){ return x && onBoard(x) && gkey(x) === gkey(c); });
  }
  /* その列を 10, 20, 30 … で振り直す。渡した並びがそのままマスター並びになる。 */
  function renumber(list){
    var n = 0;
    (list || []).forEach(function(x, i){
      var v = (i + 1) * STEP;
      if (x[KEY] !== v){ x[KEY] = v; n++; }
    });
    return n;
  }
  function maxOf(c){
    var m = 0;
    group(c).forEach(function(x){ var o = orderOf(x); if (o != null && o > m) m = o; });
    return m;
  }

  /* 🔴 人が掴んで、別のカードの上に落とした＝そのカードの**手前**に入れる。
     ⚠ 工程（status）は呼ぶ側が先に決めてから渡すこと（dnd.js がそうしている）。 */
  function moveBefore(c, target){
    if (!c || !target || c === target) return false;
    var list = sort(group(target)).filter(function(x){ return x !== c; });
    var i = list.indexOf(target);
    if (i < 0) i = list.length;
    list.splice(i, 0, c);
    var n = renumber(list);
    return n > 0;
  }
  /* 🔴 v1.140.1（ゆうた指定）**ドラッグで持ってきた時は「落とした場所」に入れる。**
     　 「ドラッグで並び変える時は一番下ではなくてドラッグしたところに初期にいれてほしい」
     before … その手前に入れたいカード。**null なら列のいちばん下**（＝下の余白に落とした時）。
     ⚠ 予約から入ってくる新しいカード（点検待ち）は今までどおり**いちばん下**。
        ここを通らない（`ensure` が末尾に振る）＝ゆうた「点検待ちは一番下に並ぶ形でOK」。 */
  function insertAt(c, before){
    if (!c) return false;
    if (!before || before === c) return moveToEnd(c);
    return moveBefore(c, before);
  }
  /* 列のいちばん下へ。新しく来たカード・◀▶で工程を送ったカードはこれ。 */
  function moveToEnd(c){
    if (!c || !onBoard(c)) return false;
    var v = maxOf(c) + STEP;
    if (c[KEY] === v) return false;
    c[KEY] = v;
    return true;
  }

  /* ---------- 初回・取りこぼしの番号ふり ----------
     番号を持っていないカードに、**いまの並びのまま**続き番号を振る。
     ⚠ 呼ばれるのは描く直前（task.js）。変わった時だけ保存する。 */
  var _busy = false;
  function ensure(){
    if (_busy) return false;
    if (!w.state || !Array.isArray(state.cards)) return false;
    /* クラウドを読み終わる前は触らない（PitDB と同じ鍵を見る） */
    if (w.PitDB && PitDB.mode === 'cloud' && !PitDB._loaded) return false;
    _busy = true;
    var by = {}, order = [];
    cards().forEach(function(c){
      if (!onBoard(c)) return;
      var k = gkey(c);
      if (!by[k]){ by[k] = []; order.push(k); }
      by[k].push(c);
    });
    var changed = 0;
    order.forEach(function(k){
      var list = by[k];
      var miss = list.filter(function(c){ return orderOf(c) == null; });
      if (!miss.length) return;
      /* 既にある番号の最大値の続きから、**いまの並びのまま**振る */
      var m = 0;
      list.forEach(function(c){ var o = orderOf(c); if (o != null && o > m) m = o; });
      miss.forEach(function(c){ m += STEP; c[KEY] = m; changed++; });
    });
    _busy = false;
    if (changed){
      console.log('[board-order] 並び番号を ' + changed + ' 枚に振りました（いまの並びのまま）');
      try { if (w.PitDB) PitDB.save(); } catch(e){}
    }
    return changed > 0;
  }

  w.PitBoardOrder = {
    KEY: KEY, sort: sort, orderOf: orderOf, ensure: ensure,
    moveBefore: moveBefore, moveToEnd: moveToEnd, insertAt: insertAt, onBoard: onBoard
  };
  console.log('[board-order] ready（タスクボードのマスター並び）');
})(window);
