/* ========================================
   dnd.js  -  カードのドラッグ＆ドロップ移動（PitFlow v0.2.0）
   ----------------------------------------
   ネイティブ HTML5 ドラッグ＆ドロップ（デスクトップ主体）。
   ・ドラッグできるカード：`.pit-card[data-card-id]`
   ・ドロップ先：`[data-drop][data-drop-val]`
       data-drop="status"      … タスク看板：工程(c.status)を変更
       data-drop="bay"         … 作業ビュー：PIT枠(c.bayId)を変更（空文字＝未割当）
       data-drop="reserveTime" … 予約・当日：入庫時刻(c.reserveTime)を変更
       data-drop="returnTime"  … 返車・当日：返車時刻(c.returnTime)を変更
   ・クリック（openDetail）はネイティブ仕様でドラッグと両立（ドラッグ中はclick不発）。
   ======================================== */
(function () {

  /* 🔴 v1.71.0 返車の日時は **return-slot.js の唯一の入口（pitReturnSetDateTime）** を通す。
     ⚠ v1.70.0 まで、ドラッグだけ `c.returnDate` / `c.returnTime` に**直接書いて**いた。
        そのため returnStage が付け替わらず、**完TEL待ちの車は完TEL待ちのまま**残った
        （日付も時間も入っているのに「まだ電話していない」箱から出ない）。
     ⚠ 保存・描き直し・お知らせも pitReturnCommit にまとめてある。ここで書き写さない。 */
  function _returnDrop(c, date, time){
    if (window.pitReturnSetDateTime){
      var res = pitReturnSetDateTime(c, date, time);
      if (window.pitReturnCommit) return pitReturnCommit(c, res);
    } else {                                   /* 部品が無い時の保険（作りは今までどおり） */
      if (date !== undefined) c.returnDate = date || '';
      if (time !== undefined) c.returnTime = time || '';
    }
    if (window.PitDB) PitDB.save();
    if (state.currentView) showView(state.currentView);
    if (window.PitPip && PitPip.isOpen && PitPip.isOpen()) PitPip.refresh();
  }

  /* 🔴 v1.140.1（ゆうた指定）**落とした場所に入れる。**
     　 列の本体（カードの無い余白）に落とした時、v1.140.0 は必ず「いちばん下」に入れていた。
     ⚠ カードの上に落とした時は今までどおり `reorder`（そのカードの手前）＝ここは通らない。
     ⚠ 覚えるのは**その1回のドロップのあいだだけ**。使ったらすぐ捨てる（次のドロップに持ち越さない）。 */
  var _dropBefore = null;   /* 「このカードの手前に入れる」カードID。null＝いちばん下 */
  function anchorFromPoint(body, y, dragId) {
    var kids = Array.prototype.filter.call(body.children, function (el) {
      return el.hasAttribute && el.hasAttribute('data-card-id');
    });
    for (var i = 0; i < kids.length; i++) {
      var id = kids[i].getAttribute('data-card-id');
      if (id === dragId) continue;                    /* 自分は数えない */
      var r = kids[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return id;        /* まん中より上＝このカードの手前 */
    }
    return null;                                      /* どのカードより下＝いちばん下 */
  }

  function applyCardDrop(cardId, kind, val) {
    const c = state.cards.find(x => x.id === cardId);
    if (!c) return;

    // 完TEL済／完TEL依頼エリアへドロップ＝ポップアップで入力（カードは盤面から外れる）
    if (kind === 'callDone' || kind === 'callReq') {
      if (window.PitReturnPopup) PitReturnPopup.open(c, kind === 'callDone' ? 'callDone' : 'callReq');
      return;
    }

    if (kind === 'status') {
      var _fromStatus = c.status;
      var _changed = (c.status !== val);
      // 移動の本処理（ポップアップ確定後 or ポップアップ不要時に実行）
      var _commitStatus = function(){
        c.status = val;
        c.testDrive = false;   // メイン領域に置く＝試運転フラグOFF（試運転ゾーンから戻した時も解除）
        /* 🔴 v1.140.1 **落とした場所に入れる**（board-order.js）。余白の下の方に落とせば今までどおり末尾。
           ⚠ 番号を書くのは board-order.js だけ。ここで boardOrder を直接いじらない。 */
        if (window.PitBoardOrder){
          var _bf = _dropBefore ? state.cards.find(function (x) { return x.id === _dropBefore; }) : null;
          PitBoardOrder.insertAt(c, (_bf && _bf.status === val && _bf.boardId === c.boardId) ? _bf : null);
        }
        if (_changed){
          if (window.logPhaseMove) logPhaseMove(c, _fromStatus, val);
          else if (window.logFlow && typeof statusLabel === 'function') logFlow(c, statusLabel(val) + 'へ');
        }
        if (window.PitDB) PitDB.save();
        if (state.currentView) showView(state.currentView);
        if (window.PitPip && PitPip.isOpen && PitPip.isOpen()) PitPip.refresh();
      };
      // 見積中→連絡中／連絡中→パーツ待ち／→作業完了／→外注 は入力ポップアップを挟む
      if (_changed && window.PitPhasePopup && PitPhasePopup.maybeIntercept(c, _fromStatus, val, _commitStatus)) return;
      _commitStatus();
      return;
    } else if (kind === 'testdrive') {
      // 試運転サブゾーンへ＝同フェーズ内なら status 据え置きで testDrive=ON。別列から入れた時は status も変更。
      var _fromTd = c.status;
      var _changedTd = (c.status !== val);
      var _commitTd = function(){
        c.status = val; c.testDrive = true;
        if (_changedTd && window.PitBoardOrder) PitBoardOrder.moveToEnd(c);   /* v1.140.0 */
        if (_changedTd && window.logPhaseMove) logPhaseMove(c, _fromTd, val);
        if (window.PitDB) PitDB.save();
        if (state.currentView) showView(state.currentView);
        if (window.PitPip && PitPip.isOpen && PitPip.isOpen()) PitPip.refresh();
      };
      if (_changedTd && window.PitPhasePopup && PitPhasePopup.maybeIntercept(c, _fromTd, val, _commitTd)) return;
      _commitTd();
      return;
    } else if (kind === 'reorder') {
      // 看板内：カードの上にドロップ＝その手前へ差し込む（同フェーズ内の並び替え）。
      // 別フェーズのカードに落とした時はそのフェーズへ移動＋位置差し込み（必要ならポップアップ）。
      var t = state.cards.find(function (x) { return x.id === val; });
      if (!t || t === c) return;
      var _fromR = c.status;
      var _changedR = (c.status !== t.status);
      var _doReorder = function () {
        c.status = t.status;
        c.testDrive = !!t.testDrive;
        var ci = state.cards.indexOf(c); if (ci >= 0) state.cards.splice(ci, 1);
        var ti = state.cards.indexOf(t); if (ti < 0) ti = state.cards.length;
        state.cards.splice(ti, 0, c);
        /* 🔴 v1.140.0 **ここが「人が動かした順」＝マスター並び**。
           ⚠ 上の splice は配列の中を入れ替えるだけで、**どこにも保存されない**（v1.139.0 までの穴）。
              並び番号（boardOrder）を振り直して初めて、開き直しても・他の人の画面でも同じ順になる。
           ⚠ 番号を書くのは board-order.js だけ。ここで boardOrder を直接いじらない。 */
        if (window.PitBoardOrder) PitBoardOrder.moveBefore(c, t);
        if (_changedR && window.logPhaseMove) logPhaseMove(c, _fromR, c.status);
        if (window.PitDB) PitDB.save();
        if (state.currentView) showView(state.currentView);
        if (window.PitPip && PitPip.isOpen && PitPip.isOpen()) PitPip.refresh();
      };
      if (_changedR && window.PitPhasePopup && PitPhasePopup.maybeIntercept(c, _fromR, t.status, _doReorder)) return;
      _doReorder();
      return;
    } else if (kind === 'bay') {
      const nv = val || null;
      if (c.bayId === nv) return;
      c.bayId = nv;
      c.baySlot = null;                       // 枠の空きエリアへ落とした＝末尾扱い
    } else if (kind === 'baycell') {
      const p = val.split('|');               // "bayId|スロット番号"
      reorderIntoBay(c, p[0], parseInt(p[1], 10));
    } else if (kind === 'reserveTime') {
      c.reserveTime = val;
      if (state.reserveDate) c.reserveDate = ymd(state.reserveDate);
    } else if (kind === 'returnTime') {
      return _returnDrop(c, state.returnDate ? ymd(state.returnDate) : undefined, val);
    } else if (kind === 'reserveDate') {        // 月カレンダー：日付だけ変更
      if (c.reserveDate === val) return;
      /* 🔵 v1.74.1 ×・休の日は「それでも？」と聞く。聞くのが**アプリ内ダイアログ**になったので答えを待つ。
         ⚠ 続きは _finishDrop（保存＋描き直し）1本を通す＝写しを作らない。 */
      if (window.pitIntakeGuard){
        pitIntakeGuard(c, val, c.reserveDate, function (fin) {
          if (fin !== val) return;              // やめたら動かさない
          c.reserveDate = val;
          _finishDrop();
        });
        return;
      }
      c.reserveDate = val;
    } else if (kind === 'returnDate') {
      if (c.returnDate === val) return;
      return _returnDrop(c, val, undefined);
    } else if (kind === 'reserveDateTime') {     // 週カレンダー：日付＋時刻
      const p = val.split('|');
      /* v1.34.0 「時刻未定」の行（"日付|" で時刻が空）へ落としたら、時刻を空に戻す。
         ⚠ p[1] の真偽ではなく **区切りがあるかどうか** で見る（'' も正式な値だから）。 */
      const _setDT = function(){
        c.reserveDate = p[0];
        if (p.length > 1) c.reserveTime = p[1];
      };
      if (p[0] !== c.reserveDate && window.pitIntakeGuard){
        pitIntakeGuard(c, p[0], c.reserveDate, function (fin) {
          if (fin !== p[0]) return;             // やめたら動かさない
          _setDT();
          _finishDrop();
        });
        return;
      }
      _setDT();
    } else if (kind === 'returnDateTime') {
      const p = val.split('|');
      return _returnDrop(c, p[0], p.length > 1 ? p[1] : undefined);
    } else {
      return;
    }

    _finishDrop();

    /* 落としたあとの後始末（保存 → 描き直し → PiP同期）。
       🔵 v1.74.1 入庫日のガードが非同期になったので、**答えが返ってから**ここを通ることがある。
       ⚠ だから1本の関数にしてある。書き写さないこと。 */
    function _finishDrop(){
      if (window.PitDB) PitDB.save();
      if (state.currentView) showView(state.currentView);
      if (window.PitPip && PitPip.isOpen && PitPip.isOpen()) PitPip.refresh();  // PiP小窓も同期（2画面連携）
    }
  }
  window.applyCardDrop = applyCardDrop;

  /* 同じPIT枠内の並べ替え／別枠からの差し込み。idx＝落としたスロット位置に入れて baySlot を振り直す */
  function reorderIntoBay(c, bid, idx) {
    if (!bid) return;
    const statuses = window.WORK_STATUSES || ['check', 'estim', 'contact', 'parts', 'work'];
    const list = state.cards
      .filter(function (x) { return x !== c && x.bayId === bid && statuses.indexOf(x.status) >= 0; })
      .sort(function (a, b) { return (a.baySlot == null ? 1e9 : a.baySlot) - (b.baySlot == null ? 1e9 : b.baySlot); });
    if (isNaN(idx) || idx < 0 || idx > list.length) idx = list.length;  // 空きスロット等は末尾へ
    c.bayId = bid;
    list.splice(idx, 0, c);
    list.forEach(function (x, i) { x.baySlot = i; });                   // 0,1,2… で確定
  }

  let draggingId = null;
  let draggingFromPip = false;   // PiP内のカードをドラッグ中か（PiP外へ落としたら枠から外す）

  document.addEventListener('dragstart', function (e) {
    const card = e.target.closest('[data-card-id][draggable="true"]');
    if (!card) return;
    /* 🔴 v1.140.0 **一時並び替え中は看板のカードを動かせない**（ゆうた 2026-08-18 で確定）。
       ⚠ 仮の並びのまま掴むと「隣のカードの手前」がマスター並びの意味とズレて、並びが壊れる。
       ⚠ 止めるのは**看板の中だけ**＝当日・返車・PIT配置図などのドラッグには一切かからない。 */
    if (window.PitBoardSort && PitBoardSort.isOn() && card.closest('.kanban.pf-sorting')){
      e.preventDefault();
      if (window.pitToast) pitToast('並び替えて見ている間は動かせません。帯の「キャンセル」を押してください');
      return;
    }
    draggingId = card.dataset.cardId;
    draggingFromPip = !!card.closest('#pitpip');
    card.classList.add('dnd-dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', draggingId); } catch (_) {}
    }
  });

  document.addEventListener('dragend', function () {
    document.querySelectorAll('.dnd-dragging').forEach(el => el.classList.remove('dnd-dragging'));
    document.querySelectorAll('.dnd-over').forEach(z => z.classList.remove('dnd-over'));
    draggingId = null;
    draggingFromPip = false;
  });

  document.addEventListener('dragover', function (e) {
    // PiPのカードをPiPの外へ＝枠から外す操作。どこでもドロップ可（ゾーン強調はしない）
    if (draggingFromPip && !e.target.closest('#pitpip')) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.dnd-over').forEach(z => z.classList.remove('dnd-over'));
      return;
    }
    const zone = e.target.closest('[data-drop]');
    if (!zone) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    if (!zone.classList.contains('dnd-over')) {
      document.querySelectorAll('.dnd-over').forEach(z => z.classList.remove('dnd-over'));
      zone.classList.add('dnd-over');
    }
  });

  document.addEventListener('dragleave', function (e) {
    const zone = e.target.closest('[data-drop]');
    if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('dnd-over');
  });

  document.addEventListener('drop', function (e) {
    let id = draggingId;
    if (!id && e.dataTransfer) { try { id = e.dataTransfer.getData('text/plain'); } catch (_) {} }
    // PiPのカードをPiPの外に落とした → PIT枠から外す（bayId=null）。看板のグレーアウトも解除。
    if (id && draggingFromPip && !e.target.closest('#pitpip')) {
      e.preventDefault();
      document.querySelectorAll('.dnd-over').forEach(z => z.classList.remove('dnd-over'));
      applyCardDrop(id, 'bay', '');
      return;
    }
    const zone = e.target.closest('[data-drop]');
    if (!zone) return;
    e.preventDefault();
    zone.classList.remove('dnd-over');
    /* 🔴 v1.140.1 看板の列の余白に落とした時は「どのカードの手前か」を先に読む（applyCardDrop が使う） */
    _dropBefore = null;
    const body = zone.closest('.kanban-col-body[data-drop="status"]');
    if (body && zone.dataset.drop === 'status') _dropBefore = anchorFromPoint(body, e.clientY, id);
    if (id) applyCardDrop(id, zone.dataset.drop, zone.dataset.dropVal || '');
    _dropBefore = null;   /* 次のドロップに持ち越さない */
  });

})();
