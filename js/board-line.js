/* ========================================
   board-line.js  -  タスクボードの「区切りライン」  PitFlow v1.36.0 →（見た目と操作の調整 v1.37.0）
   ----------------------------------------
   ◎なにをするもの（ゆうた指定）
     タスクボードの列の中に、**カードとカードのあいだに引ける横線**を足す。
     使い方＝「**今日はここまで**」のような、**課ごとの共通認識としての区切り**。

   ◎操作
     ・完TEL済の**左**（少し離した所）にある「区切りライン」を、カードとカードのあいだへ**ドラッグ**＝入る。
     ・入ったラインは**そのままドラッグで移動**できる。**別の工程（列）へも移せる。**
     ・**枠の外（列の外）へ落とすと消える。**（v1.37.0 で ✕ ボタンは廃止＝消し方はこれだけ）
     ・**動かしている最中はゴーストが先に動く**＝どこに入るかが見えてから離せる（v1.37.0）。
     ・**名前は最初は無い＝ただの線。ダブルクリックで入れて、初めて文字が出る**（v1.37.0）。空にすると線だけに戻る。
     ・カードの**右クリック →「この下にラインを入れる」**でも入る。
     ・**ボタンをクリック＝使い方の吹き出しが出る**（v1.38.0／v1.39.0 で簡易表示に）。ドラッグの直後は開かない。
       くわしい説明はヘルプ画面の「課タスクボード」に置いてある。

   ◎保存
     🔴 **全員で共有**＝`state.settings.boardLines` に入れて `pitSettings/main` へ保存される
        （課ごとの共通認識に使うものなので、自分の端末だけに置かない）。
     形＝ { id, boardId, status, after, label }
       after … そのラインが「どのカードの下」にあるか。列の先頭は '__top'。
               ⚠ カードが工程を移ったり消えたりして相手が居なくなったら、**列の末尾に寄せて残す**（黙って消さない）。

   ◎作りの決めごと
     🔴 **既存の JS は触っていない。** 差し込み口は task.js の1行（`PitBoardLine.html(...)`）と
        ctxmenu-pit.js の1行（`PitBoardLine.ctxItem(...)`）だけ。
     ⚠ ドラッグは **HTML5 の dragstart/drop**（dnd.js のカード移動と同じ土俵）。
        ぶつからないよう、ラインのドラッグ中は `dnd.js` が見る `[data-card-id]` を持たない要素を使い、
        ドロップは**このファイルの中で完結**させて `e.stopPropagation()` で下へ流さない。
   ======================================== */
(function (w, d) {
  'use strict';

  var TOP = '__top';

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function lines(){
    if (!w.state) return [];
    if (!state.settings) state.settings = {};
    if (!Array.isArray(state.settings.boardLines)) state.settings.boardLines = [];
    return state.settings.boardLines;
  }
  function save(){ try { if (w.PitDB) PitDB.save(); } catch(e){} }
  function rerender(){
    try {
      if (w._rerenderActiveBoard) return _rerenderActiveBoard();
      if (w.state && state.currentView && w.showView) showView(state.currentView);
    } catch(e){}
  }
  function newId(){
    return 'bl' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  }
  function byId(id){
    var ls = lines();
    for (var i = 0; i < ls.length; i++){ if (ls[i].id === id) return ls[i]; }
    return null;
  }

  /* ---------- 描く ---------- */

  /* 🔴 v1.37.0（ゆうた指定）
     ・**×は付けない**＝消すのは「枠の外へドラッグ」だけ。
     ・**名前は最初は付いていない**＝ただの線。**ダブルクリックで入れて、初めて文字が出る。** */
  /* 🔴 v1.140.0 一時並び替え中は **薄く出したまま・掴めない**（ゆうた 2026-08-18 で確定）。
     ⚠ 黙って消さない＝「線がどこかへ行った」と思わせない。位置はマスター並びの
        「上から何枚目」を守る（下の renderColumn を見ること）。 */
  function tmpOn(){ return !!(w.PitBoardSort && PitBoardSort.isOn()); }
  function lineHtml(l){
    var t = String(l.label || '').trim();
    var tmp = tmpOn();
    return '<div class="kb-line' + (tmp ? ' kb-line-tmp' : '') + '"'
         + (tmp ? '' : ' draggable="true"') + ' data-lineid="' + esc(l.id) + '"'
         + ' title="' + (tmp ? '並び替えて見ている間は動かせません（マスター並びでの位置に出しています）'
                             : 'ドラッグで移動（枠の外へ出すと消えます）／ダブルクリックで名前を入れる') + '">'
         + '<span class="kb-line-bar"></span>'
         + (t ? '<span class="kb-line-t">' + esc(t) + '</span><span class="kb-line-bar"></span>' : '')
         + '</div>';
  }

  /* task.js から呼ぶ。その列のカードの並びに合わせてラインを挟み込んだHTMLを返す。
     cards    … その列に**いま出す**カードの配列（順番どおり／絞り込み済みのこともある）
     cardHtmlFn … カード1枚のHTMLを作る関数（task.js の cardHtml をそのまま渡す）
     allCards … 🔴 v1.69.0 追加。**絞り込む前**の、その列のカードの並び（省略時は cards と同じ）

     🔴 v1.69.0（ゆうた指定）「担当車両」で隠れたカードがあっても、**バーの位置は動かさない**。
        ⚠ v1.48.0〜v1.68.1 は「どのカードの下か」だけを見ていたので、
           相手のカードが隠れた瞬間にそのラインが**列のいちばん下へ落ちて**いた。
           ＝押すたびに区切りの位置が変わって見える（ゆうた報告）。
        直し＝**絞り込む前の並びの中での位置**でラインを並べ、
           いま出ているカードのあいだに落とし込む。
           隠れたカードは**バーの上下から消えるだけ**で、バーは同じ場所に残る。 */
  function renderColumn(boardId, status, cards, cardHtmlFn, allCards){
    var mine = lines().filter(function(l){ return l.boardId === boardId && l.status === status; });
    if (!mine.length) return cards.map(cardHtmlFn).join('');

    var full = (allCards && allCards.length) ? allCards : cards;
    var pos = {};                                  /* カードid → 絞り込む前の並びでの位置 */
    full.forEach(function(c, i){ if (c) pos[c.id] = i; });
    var END = full.length + 1;                     /* 相手が居なくなったライン＝末尾 */

    function at(l){
      if (l.after === TOP) return -1;              /* 列の先頭 */
      return (pos[l.after] != null) ? pos[l.after] : END;
    }
    var sorted = mine.slice().sort(function(a, b){ return at(a) - at(b); });

    var out = '', li = 0;

    /* 🔴 v1.140.0 一時並び替え中（board-sort.js）は、カードの並びが**マスター並びとは別物**になる。
       「どのカードの下か」で置くと、線が意味のない所へ飛ぶ。
       ⚠ そこで **「上から何枚目か」だけを守って**置く＝マスター並びで3枚目の下にあった線は、
          並び替えて見ている間も3枚目の下に出る。位置の意味は薄れるので**薄く**出す（lineHtml）。 */
    if (tmpOn()){
      var slot = sorted.map(function(l){
        var a = at(l);
        var n = (a < 0) ? 0 : (a + 1);
        return Math.min(n, cards.length);
      });
      cards.forEach(function(c, i){
        while (li < sorted.length && slot[li] <= i){ out += lineHtml(sorted[li]); li++; }
        out += cardHtmlFn(c);
      });
      while (li < sorted.length){ out += lineHtml(sorted[li]); li++; }
      return out;
    }

    cards.forEach(function(c){
      var ci = (pos[c.id] != null) ? pos[c.id] : END;
      /* このカードより前に来るラインを先に出す（同じ位置＝そのカードの「下」なので出さない） */
      while (li < sorted.length && at(sorted[li]) < ci){ out += lineHtml(sorted[li]); li++; }
      out += cardHtmlFn(c);
    });
    /* ⚠ 残り＝いちばん下のライン、相手のカードが居なくなったライン。**黙って消さない**。 */
    while (li < sorted.length){ out += lineHtml(sorted[li]); li++; }
    return out;
  }

  /* ---------- 入れる・動かす・消す ---------- */

  function put(boardId, status, after, label){
    var l = { id: newId(), boardId: boardId, status: status, after: after || TOP, label: label || '' };
    lines().push(l);
    save();
    return l;
  }
  function moveTo(id, boardId, status, after){
    var l = byId(id); if (!l) return;
    l.boardId = boardId; l.status = status; l.after = after || TOP;
    save();
  }
  function remove(id){
    var ls = lines();
    for (var i = 0; i < ls.length; i++){
      if (ls[i].id === id){ ls.splice(i, 1); save(); return true; }
    }
    return false;
  }

  /* 落とした位置（マウスのY）から「どのカードの下か」を決める。
     ⚠ カードの**まん中より上**なら「そのカードの上」＝ひとつ前のカードの下、という数え方。 */
  function afterFromPoint(body, y){
    var kids = Array.prototype.filter.call(body.children, function(el){
      /* 🔴 v1.69.0 よその課から集まってきたカード（`data-xboard`）は数に入れない。
         区切りラインは**自分の課の中の区切り**なので、
         「◯課分」より下に置けてしまうと、担当車両を切った瞬間に行き場を失う。 */
      return el.hasAttribute && el.hasAttribute('data-card-id') && !el.hasAttribute('data-xboard');
    });
    var after = TOP;
    for (var i = 0; i < kids.length; i++){
      var r = kids[i].getBoundingClientRect();
      if (y >= r.top + r.height / 2) after = kids[i].getAttribute('data-card-id');
      else break;
    }
    return after;
  }

  /* ---------- ドラッグ ---------- */

  var dragging = null;      /* {id} … 既にあるラインを動かしている */
  var draggingNew = false;  /* ボタンから引っぱってきた＝新しいライン */

  function colInfoOf(body){
    /* 列の本体（.kanban-col-body[data-drop="status"]）から boardId と status を割り出す。
       boardId は「いま見ているボード」。1課／2課ビューは列の入れ物のIDで分かる。 */
    var status = body.getAttribute('data-drop-val') || '';
    var boardId = '';
    var host = body.closest('.kanban');
    if (host && host.id === 'kanban-cols-1') boardId = 'default';
    else if (host && host.id === 'kanban-cols-2') boardId = 'import';
    else boardId = (w.state && state.currentBoardId) || 'default';
    return { boardId: boardId, status: status };
  }

  d.addEventListener('dragstart', function (e) {
    /* 🔴 v1.140.0 一時並び替え中は線を入れる・動かすのも止める（位置がマスター並びと合わないため） */
    if (tmpOn() && e.target.closest && (e.target.closest('[data-linenew]') || e.target.closest('[data-lineid]'))){
      e.preventDefault();
      if (w.pitToast) pitToast('並び替えて見ている間は区切りラインを動かせません');
      return;
    }
    var add = e.target.closest && e.target.closest('[data-linenew]');
    if (add){
      draggingNew = true; dragging = null;
      helpClose();
      add.classList.add('kb-line-drag');
      if (e.dataTransfer){ e.dataTransfer.effectAllowed = 'copy';
        try { e.dataTransfer.setData('text/plain', 'pit-board-line-new'); } catch(_){} }
      return;
    }
    var el = e.target.closest && e.target.closest('[data-lineid]');
    if (!el) return;
    dragging = { id: el.getAttribute('data-lineid') };
    draggingNew = false;
    el.classList.add('kb-line-drag');
    if (e.dataTransfer){ e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', 'pit-board-line'); } catch(_){} }
    e.stopPropagation();   /* dnd.js（カード移動）には渡さない */
  }, true);

  d.addEventListener('dragend', function () {
    _justDragged = Date.now();   /* 直後のクリックでヘルプを開かない */
    ghostOff();
    Array.prototype.forEach.call(d.querySelectorAll('.kb-line-drag'), function(el){ el.classList.remove('kb-line-drag'); });
    Array.prototype.forEach.call(d.querySelectorAll('.kb-line-over'), function(el){ el.classList.remove('kb-line-over'); });
    dragging = null; draggingNew = false;
  }, true);

  /* 🔴 v1.37.0（ゆうた指定）**ゴーストが先に動く**＝どこに入るかが動かしている最中に見える。
     ⚠ 本物のDOMに仮の線を差し込んで見せるだけ。**離すまでデータは変えない。**
     ⚠ 動かしている本人（既にある線）は薄くして、ゴーストと二重に見えないようにする。 */
  var ghost = null;
  function ghostEl(){
    if (ghost) return ghost;
    ghost = d.createElement('div');
    ghost.className = 'kb-line kb-line-ghost';
    ghost.innerHTML = '<span class="kb-line-bar"></span>';
    return ghost;
  }
  function ghostOff(){
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
  }
  /* 落とし位置（after）に合わせてゴーストを差し込む */
  function ghostTo(body, after){
    var g = ghostEl();
    if (after === TOP){
      if (body.firstChild !== g) body.insertBefore(g, body.firstChild);
      return;
    }
    var host = body.querySelector('[data-card-id="' + String(after).replace(/"/g, '') + '"]');
    if (!host){ ghostOff(); return; }
    if (host.nextSibling !== g) body.insertBefore(g, host.nextSibling);
  }

  d.addEventListener('dragover', function (e) {
    if (!dragging && !draggingNew) return;
    var body = e.target.closest && e.target.closest('.kanban-col-body[data-drop="status"]');
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = draggingNew ? 'copy' : 'move';
    Array.prototype.forEach.call(d.querySelectorAll('.kb-line-over'), function(el){
      if (el !== body) el.classList.remove('kb-line-over');
    });
    if (!body){ ghostOff(); return; }     /* 枠の外＝ゴーストを消す＝「離すと消える」が見て分かる */
    body.classList.add('kb-line-over');
    ghostTo(body, afterFromPoint(body, e.clientY));
  }, true);

  d.addEventListener('drop', function (e) {
    if (!dragging && !draggingNew) return;
    e.preventDefault();
    e.stopPropagation();   /* dnd.js のカード用ドロップに流さない */
    var body = e.target.closest && e.target.closest('.kanban-col-body[data-drop="status"]');
    ghostOff();
    Array.prototype.forEach.call(d.querySelectorAll('.kb-line-over'), function(el){ el.classList.remove('kb-line-over'); });
    if (!body){
      /* 🔴 枠の外に出した＝消す（新しく引っぱってきた分は、そもそも入れない） */
      if (dragging){ remove(dragging.id); if (w.pitToast) pitToast('区切りを消しました'); rerender(); }
      dragging = null; draggingNew = false;
      return;
    }
    var info = colInfoOf(body);
    var after = afterFromPoint(body, e.clientY);
    if (draggingNew) put(info.boardId, info.status, after, '');
    else moveTo(dragging.id, info.boardId, info.status, after);
    dragging = null; draggingNew = false;
    rerender();
  }, true);

  /* ---------- ダブルクリックで名前を入れる（v1.37.0・ゆうた指定） ----------
     ⚠ 1回クリックでは何も起きない＝ドラッグの掴み損ねで勝手に入力欄が出ない。
     ⚠ 空にすると名前なし（ただの線）に戻る。 */
  d.addEventListener('dblclick', function (e) {
    var el = e.target.closest && e.target.closest('[data-lineid]');
    if (!el) return;
    e.preventDefault(); e.stopPropagation();
    var l = byId(el.getAttribute('data-lineid')); if (!l) return;
    var ask = (w.UI && UI.prompt)
      ? UI.prompt('この区切りに書く言葉は？（空にすると線だけになります）', l.label || '', { placeholder: '例：今日はここまで' })
      : Promise.resolve(w.prompt ? w.prompt('この区切りに書く言葉は？（空にすると線だけになります）', l.label || '') : null);
    Promise.resolve(ask).then(function(v){
      if (v == null) return;
      l.label = String(v).trim();
      save(); rerender();
    });
  }, true);

  /* ---------- 🔴 v1.38.0（ゆうた指定）ボタンをクリック＝使い方の吹き出し ----------
     ⚠ ドラッグの直後にクリックが飛ぶことがあるので、**ドラッグした直後は開かない**。
     ⚠ 盤面から離れないよう、その場に小さく出す（ヘルプ画面へ行きたい人にはリンクを置く）。 */
  var _justDragged = 0;
  var helpBox = null;

  function helpClose(){
    if (helpBox && helpBox.parentNode) helpBox.parentNode.removeChild(helpBox);
    helpBox = null;
  }
  function helpOpen(btn){
    helpClose();
    helpBox = d.createElement('div');
    helpBox.className = 'kb-linehelp';
    /* 🔴 v1.39.0（ゆうた指定）**簡易表示**＝その場で読み切れる分量に。
       くわしい説明はヘルプ画面（課タスクボード）に置いてあるので、ここには畳まない。 */
    helpBox.innerHTML =
        '<div class="kb-linehelp-h">区切りラインの使い方'
      + '<button type="button" class="kb-linehelp-x" data-linehelpx="1" title="閉じる">×</button></div>'
      + '<ul class="kb-linehelp-l">'
      + '<li>カードとカードのあいだへ<b>ドラッグ</b>して入れる</li>'
      + '<li>入った線は<b>ドラッグで移動</b>（別の工程へも）</li>'
      + '<li><b>枠の外へ出すと消える</b></li>'
      + '<li><b>ダブルクリックで名前</b>（例：今日はここまで）</li>'
      + '</ul>';
    d.body.appendChild(helpBox);
    var r = btn.getBoundingClientRect();
    var top = r.bottom + 8;
    var left = Math.max(8, Math.min(r.left, (w.innerWidth || 1200) - helpBox.offsetWidth - 8));
    helpBox.style.top = top + 'px';
    helpBox.style.left = left + 'px';
    /* はみ出すなら上に出す */
    if (top + helpBox.offsetHeight > (w.innerHeight || 800) - 8){
      helpBox.style.top = Math.max(8, r.top - helpBox.offsetHeight - 8) + 'px';
    }
  }

  d.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-linehelpx]')){ helpClose(); return; }
    var btn = e.target.closest && e.target.closest('[data-linenew]');
    if (btn){
      if (Date.now() - _justDragged < 400) return;     /* ドラッグ直後は開かない */
      e.preventDefault(); e.stopPropagation();
      if (helpBox) helpClose(); else helpOpen(btn);
      return;
    }
    if (helpBox && !(e.target.closest && e.target.closest('.kb-linehelp'))) helpClose();
  }, true);
  w.addEventListener('resize', helpClose);
  d.addEventListener('keydown', function(e){ if (e.key === 'Escape') helpClose(); });

  /* ---------- 右クリックメニュー用（ctxmenu-pit.js から呼ぶ） ----------
     🔴 v1.133.0（ゆうた指摘）**出す条件はこの1本にまとめた。**
     🗣「右クリメニューも『ラインを引く』とかタスクビューでしか使えないのとかでてるよ」

     ◎なにが起きていた
       区切りラインは**タスク看板の列の中にしか無い**のに、条件が「カードの状態」だけだったので、
       **当日ビュー・返車・PIT配置図・駐車場・代車カレンダー・検索結果・マイダッシュ**でも
       右クリックに「この下にラインを入れる」が出ていた。
       押しても線は**その画面には出ない**（看板を開いた時だけ出る）＝ 何も起きていないように見える。

     ◎出す条件（2つとも満たした時だけ）
       ① いま見ているのが**タスク看板**（`task` ＝統合／`course1` ＝1課／`course2` ＝2課）
       ② そのカードが**盤面に乗っている**（予約・返車済み・キャンセル・廃車・**完TEL通過**は乗っていない）
     ⚠ ②の「完TELを通ったら盤面から外れる」は task.js の `!c.returnStage` と同じ物差し。
        別の式を書かないこと（片方だけ直すとズレる）。 */
  var BOARD_VIEWS = { task:1, course1:1, course2:1 };
  function onBoardView(){
    try { return !!BOARD_VIEWS[(w.state && state.currentView) || '']; } catch(e){ return false; }
  }
  function onBoardCard(c){
    if (!c) return false;
    var st = c.status || '';
    if (st === 'reserved' || st === 'returned' || st === 'cancelled' || st === 'scrap') return false;
    if (c.returnStage) return false;      /* 完TELを通った車は返車ビューへ移っていて、盤面に無い */
    return true;
  }
  function ctxItem(c){
    if (!c || !c.id) return null;
    if (!onBoardView()) return null;
    if (!onBoardCard(c)) return null;
    if (tmpOn()) return null;   /* 🔴 v1.140.0 一時並び替え中は入れられない（位置がマスター並びと合わないため） */
    return { ic: 'minus', label: 'この下にラインを入れる', sub: '区切り（今日はここまで 等）',
      run: function(){
        put(c.boardId || 'default', c.status || '', c.id, '');
        if (w.pitToast) pitToast('区切りを入れました');
        rerender();
      } };
  }

  w.PitBoardLine = {
    renderColumn: renderColumn, ctxItem: ctxItem,
    /* テスト用（出す条件をここ1本から確かめる） */
    _onBoardView: onBoardView, _onBoardCard: onBoardCard,
    put: put, moveTo: moveTo, remove: remove, all: lines, TOP: TOP
  };
  console.log('[board-line] ready（タスクボードの区切りライン）');
})(window, document);
