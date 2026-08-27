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

   ◎🔴 v2.15.0（2026-08-27・ゆうた報告）**区切りラインも、この番号の列に並ぶ。**
     🗣「並びが強制的に動かされる」「ラインが一番下に来ている時に、ラインの下にカードを配置できない」
     ＝ ラインの位置が「**どのカードの下か**」だけで保存されていたのが正体。
        相手のカードが工程を移る・返車になると相手を失い、**列の末尾に落ちて**、
        そこから先は**どのカードよりも下**の扱い＝二度と下に置けなくなっていた。
     🔴 直し＝**ラインにも同じ並び番号を持たせて、カードと1本の物差しで並べる。**
        ここは「カード」と「カード以外のもの（＝区切りライン）」をまとめて番号を振る。
        ⚠ カード以外のものは `useExtra()` で**登録してもらう**＝このファイルは
           「区切りライン」という言葉を知らないままでいる（board-line.js の都合を持ち込まない）。

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

  /* ---------- 🔴 v2.15.0 カード以外の「列に並ぶもの」（＝区切りライン） ----------
     board-line.js が起動時に登録する。登録が無ければ今までどおりカードだけを見る。
     形 … { list(boardId,status) → 配列, orderOf(x) → 番号 or null, setOrder(x, v) } */
  var _extra = null;
  function useExtra(o){ _extra = o; }
  function extras(boardId, status){
    if (!_extra) return [];
    try { return _extra.list(boardId, status) || []; } catch(e){ return []; }
  }
  function eOrder(x){ try { return _extra ? _extra.orderOf(x) : null; } catch(e){ return null; } }
  function eSet(x, v){ try { if (_extra) _extra.setOrder(x, v); } catch(e){} }

  /* カードと「カード以外」を1本に混ぜて、番号の順に並べる。
     ⚠ 番号を持っていないものは**いちばん下**（今までのカードの決めごとと同じ）。 */
  function merged(boardId, status, cardList){
    var items = [];
    (cardList || []).forEach(function(c, i){ items.push({ k:'c', o:c, v:orderOf(c), i:i }); });
    extras(boardId, status).forEach(function(x, i){ items.push({ k:'e', o:x, v:eOrder(x), i:1e6 + i }); });
    return items.sort(function(a, b){
      if (a.v == null && b.v == null) return a.i - b.i;
      if (a.v == null) return 1;
      if (b.v == null) return -1;
      return (a.v - b.v) || (a.i - b.i);
    });
  }
  /* その列を 10, 20, 30 … で振り直す。渡した並びがそのままマスター並びになる。
     🔴 v2.15.0 カードも区切りラインも**同じ数直線**に乗せる。 */
  function renumberItems(items){
    var n = 0;
    (items || []).forEach(function(it, i){
      var v = (i + 1) * STEP;
      if (it.k === 'e'){ if (eOrder(it.o) !== v){ eSet(it.o, v); n++; } }
      else            { if (it.o[KEY]  !== v){ it.o[KEY] = v;  n++; } }
    });
    return n;
  }

  /* ---------- 書く（人が動かした時だけ） ---------- */
  function group(c){
    return cards().filter(function(x){ return x && onBoard(x) && gkey(x) === gkey(c); });
  }
  function colItems(boardId, status, exclude){
    var list = sort(cards().filter(function(x){
      return x && onBoard(x) && x.boardId === boardId && x.status === status;
    }));
    return merged(boardId, status, list).filter(function(it){ return it.o !== exclude; });
  }

  /* 🔴 人が掴んで、別のカードの上に落とした＝そのカードの**手前**に入れる。
     ⚠ 工程（status）は呼ぶ側が先に決めてから渡すこと（dnd.js がそうしている）。
     ⚠ v2.15.0 振り直すのは**区切りラインも入れた1本の並び**＝線の位置がずれない。 */
  function moveBefore(c, target){
    if (!c || !target || c === target) return false;
    var items = colItems(target.boardId, target.status, c);
    var i = -1;
    for (var k = 0; k < items.length; k++){ if (items[k].k === 'c' && items[k].o === target){ i = k; break; } }
    if (i < 0) i = items.length;
    items.splice(i, 0, { k:'c', o:c });
    return renumberItems(items) > 0;
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
  /* 列のいちばん下へ。新しく来たカード・◀▶で工程を送ったカードはこれ。
     🔴 v2.15.0 **区切りラインの番号も見る。** 見ないと、いちばん下に線がある列では
        「いちばん下へ」が**線の1つ上**にしかならない＝ゆうた報告の
        「ラインの下にカードを配置できない」がここ。 */
  function maxOf(c){
    var m = 0;
    colItems(c.boardId, c.status, c).forEach(function(it){
      if (it.v != null && it.v > m) m = it.v;
    });
    return m;
  }
  function moveToEnd(c){
    if (!c || !onBoard(c)) return false;
    var v = maxOf(c) + STEP;
    if (c[KEY] === v) return false;
    c[KEY] = v;
    return true;
  }

  /* 🔴 v2.15.0 カード以外のもの（区切りライン）を「このカードの下」へ置く。
     afterId … カードのid。空・'__top' なら列の先頭。**そのカードが列に居なければ末尾。**
     ⚠ 置いたあと列ぜんぶを振り直す＝番号がぶつからない・すき間の計算が要らない。 */
  function placeExtraAfter(x, boardId, status, afterId){
    if (!x) return false;
    var items = colItems(boardId, status, x);
    var idx;
    if (!afterId || afterId === '__top') idx = 0;
    else {
      var j = -1;
      for (var i = 0; i < items.length; i++){
        if (items[i].k === 'c' && items[i].o && items[i].o.id === afterId) j = i;
      }
      idx = (j < 0) ? items.length : (j + 1);
    }
    items.splice(idx, 0, { k:'e', o:x });
    return renumberItems(items) > 0;
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
      /* 既にある番号の最大値の続きから、**いまの並びのまま**振る
         🔴 v2.15.0 区切りラインの番号も最大値に入れる
            ＝いちばん下に線がある列に新しいカードが来ても、**線の下**に付く。 */
      var m = 0;
      list.forEach(function(c){ var o = orderOf(c); if (o != null && o > m) m = o; });
      extras(list[0].boardId, list[0].status).forEach(function(x){
        var o = eOrder(x); if (o != null && o > m) m = o;
      });
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
    KEY: KEY, STEP: STEP, sort: sort, orderOf: orderOf, ensure: ensure,
    moveBefore: moveBefore, moveToEnd: moveToEnd, insertAt: insertAt, onBoard: onBoard,
    /* 🔴 v2.15.0 カード以外の「列に並ぶもの」（区切りライン） */
    useExtra: useExtra, placeExtraAfter: placeExtraAfter, colItems: colItems
  };
  console.log('[board-order] ready（タスクボードのマスター並び）');
})(window);
