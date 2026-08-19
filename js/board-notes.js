/* ========================================
   board-notes.js （PitFlow v0.63.0）
   ----------------------------------------
   ダッシュボードの「全体タスク（付箋ボード）」UI。CarFlow の付箋機能を
   PitFlow（localStorage＋state.staff）向けに移植したもの。機能は同等：

     ・付箋カード（5色）。タイトル / 本文 / 期限 / 担当メンバー / 画像 / 作成者
     ・「⋮」メニューで 編集 / 済 / 未済に戻す / 返信 / 消去
     ・「済」スタンプが大きく押される（クリックで透かして中身を読める）
     ・実行（誰か1人がやればOK）／回覧（担当全員が各自で確認）
     ・DnD で並び替え
     ・画像はカード内サムネ → クリックで全画面プレビュー
     ・色ごとのラベル（緊急 / 今日中 …）は state.boardLabels

   PitFlow の事情に合わせた点：
     ・データは state.boardNotes に持ち、PitDB.save() で localStorage 永続化。
     ・「自分」はサンプルログインのため、ヘッダの「自分：」セレクタで選ぶ
       （localStorage 'pitflow_bn_me'）。担当者/作成者/回覧チェック/自分用に使う。
     ・画像は Firebase Storage が無いので、縮小した dataURL を付箋に直接保持。
   ======================================== */
(function () {
  'use strict';

  const NOTE_COLORS = ['red', 'orange', 'yellow', 'green', 'blue'];
  const ME_KEY = 'pitflow_bn_me';

  // 編集モーダルのコンテキスト
  const _editor = { editingId: null, photoData: null, photoChanged: false, members: [] };
  let _dragId = null;
  let _activeMenuNoteId = null;
  let _activeReplyNoteId = null;

  // -----------------------------------------
  // ヘルパー
  // -----------------------------------------
  function _toast(msg) { if (window.pitToast) pitToast(msg); }
  /* 🔴 v1.142.0 保存先は付箋の出どころで変わる（まとめて表示・coreflow-note-all.js）。
     ⚠ **よその付箋を PitDB に保存しない。** PitFlow のデータではないので、書くと二重に増える。 */
  function _save(note) {
    if (note && window.CFNoteAll && CFNoteAll.isForeign(note)) { CFNoteAll.save(note, function () { renderBoardNotes(); }); return; }
    if (window.PitDB && PitDB.save) PitDB.save();
  }
  /* 🔴 **書く用**＝PitFlow 自身の付箋の配列。ここに よその付箋を混ぜないこと（push/splice の相手） */
  function _notes() { if (!Array.isArray(state.boardNotes)) state.boardNotes = []; return state.boardNotes; }
  /* 🔴 **読む用**＝画面に出す全部（まとめて表示がONなら よそのアプリの付箋も混ざる） */
  function _all() {
    var mine = _notes();
    if (!window.CFNoteAll || !CFNoteAll.isOn()) return mine;
    return mine.concat(CFNoteAll.foreign());
  }
  function _find(id) { return _all().find(function (x) { return x && x.id === id; }) || null; }
  function _foreign(n) { return !!(window.CFNoteAll && CFNoteAll.isForeign(n)); }
  /* よその付箋にできるのは「返信」と「チェック」だけ（ゆうた指定）。編集・消去・並び替えは止める。 */
  function _denyForeign(n) {
    if (!_foreign(n)) return false;
    _toast('まとめて表示中です。' + (window.CFNoteAll ? CFNoteAll.labelOf(n) : 'よそのアプリ') + 'の付箋は、そのアプリで直してください');
    return true;
  }
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function _newId() { return 'bn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function _newReplyId() { return 'rep_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function _isTouchDevice() { return ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0); }

  // 「自分」（現在のメンバーID）。未設定なら先頭のフロント担当 → 先頭スタッフ。
  function _meId() {
    let id = null;
    try { id = localStorage.getItem(ME_KEY); } catch (e) {}
    /* 自社（小林モータース）は「自分」になれない＝人ではないので候補から外す */
    const staff = _bnStaff();
    if (id && staff.some(s => s.id === id)) return id;
    const front = staff.find(s => s.front) || staff[0];
    return front ? front.id : null;
  }
  window.bnSetMe = function (id) {
    try { localStorage.setItem(ME_KEY, id || ''); } catch (e) {}
    renderBoardNotes();
  };

  /* v1.8.0：辞めた人も引けるようにする（付箋に残った名前が空欄にならないように） */
  function _staffById(id) {
    return (state.staff || []).find(s => s.id === id)
        || (window.pitStaffById ? window.pitStaffById(id) : null)
        || null;
  }
  function _staffName(id) { const s = _staffById(id); return s ? s.name : ''; }

  /* 🔴 v1.51.0（ゆうた指定）：付箋の担当に「小林モータース」を出さない。
     あれは人ではなく、整備ソフト側で担当が「小林モータース」になっている分の**受け皿**。
     付箋は「人に伝える」ものなので、受け皿を混ぜない（アカウント扱いしない）。
     ⚠ フロント担当・予約担当・完TEL担当の候補では今までどおり出る＝state.staff 自体は変えない。
     ⚠ 名前を出す（_staffName / _renderAvatar）方は素の state.staff を見る＝
        **昔の付箋に「小林モータース」が入っていても、名前とアイコンはちゃんと出る。** */
  function _bnStaff() { return ((window.state && state.staff) || []).filter(s => !s.isSelf); }
  function _isLeft(id) { const s = _staffById(id); return !!(s && s.left); }
  function _staffInitial(id) {
    const n = _staffName(id);
    return n ? n.slice(0, 1) : '?';
  }

  // 担当はサンプルの並び（state.staff の順）で表示
  function _sortIds(ids) {
    if (!Array.isArray(ids)) return [];
    const order = (state.staff || []).map(s => s.id);
    return ids.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }

  // シークレット付箋＝作成者が「自分ひとりだけ」を担当に選んだ付箋（本人だけに見える）
  function _isSecretNote(note) {
    if (!note) return false;
    const m = Array.isArray(note.memberUids) ? note.memberUids : [];
    return m.length === 1 && !!note.authorUid && m[0] === note.authorUid;
  }

  function _maxOrder() {
    let m = -1;
    _notes().forEach(n => { if (typeof n.order === 'number' && n.order > m) m = n.order; });
    return m;
  }

  function _ensureLabels() {
    if (!state.boardLabels || typeof state.boardLabels !== 'object') state.boardLabels = {};
    const def = { red: '緊急', orange: '今日中', yellow: '今週中', green: '連絡', blue: '余裕' };
    NOTE_COLORS.forEach(c => { if (state.boardLabels[c] == null) state.boardLabels[c] = def[c]; });
    return state.boardLabels;
  }

  function _formatDeadline(d) {
    if (!d) return '';
    try {
      const dt = new Date(d + 'T00:00:00');
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const diff = Math.round((dt - today) / 86400000);
      const md = `${dt.getMonth() + 1}/${dt.getDate()}`;
      if (diff === 0) return md + '（本日）';
      if (diff === 1) return md + '（明日）';
      if (diff > 0) return md + `（あと${diff}日）`;
      return md + `（${-diff}日経過）`;
    } catch (e) { return d; }
  }
  function _isOverdue(d) {
    if (!d) return false;
    try {
      const dt = new Date(d + 'T00:00:00');
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return (dt - today) < 0;
    } catch (e) { return false; }
  }

  function _formatReplyTime(ms) {
    if (!ms) return '';
    try {
      const d = new Date(ms);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
    } catch (e) { return ''; }
  }
  function _canDeleteReply(reply) {
    if (!reply) return false;
    return reply.uid && reply.uid === _meId();
  }

  /* 👤 アバター。CoreMembers の顔写真があれば写真、無ければ頭文字（v1.21.0）
     ⚠ 以前は頭文字しか出しておらず、CoreMembers に写真が入っていても反映されなかった。
        写真は members-pit.js が state.staff[].photo に入れてくれている（他の画面と同じ出どころ）。 */
  function _renderAvatar(id, sizePx) {
    const s = _staffById(id);
    const name = (s && s.name) || _staffName(id) || '?';
    const init = _staffInitial(id);
    const sz = sizePx || 22;
    const style = `width:${sz}px;height:${sz}px;font-size:${Math.round(sz * 0.42)}px`;
    const photo = s && s.photo;
    const inner = photo ? `<img src="${_esc(photo)}" alt="" loading="lazy">` : _esc(init);
    return `<span class="bn-av${photo ? ' has-photo' : ''}" title="${_esc(name)}" style="${style}">${inner}</span>`;
  }

  /* 🔴 v1.141.0（ゆうた指定 2026-08-18）返信は **全アプリ共通の部品**（_shared/coreflow-note-reply.js）に寄せた。
     　 「通常の付箋で返信が入れられるように。**回覧でも返信を入れられるように**したい。
     　　 またこれは**ピット、MHS、CarFlow 全部の付箋に実装**して」
     ⚠ **回覧かどうかで出し分けない。** 以前はここで `circulate` を弾いて、回覧には返信を出していなかった。
     ⚠ 返信の一覧も「返信を書く…」の欄も、部品が1つのHTMLで返す。**ここで組み立て直さない。**
     ⚠ 部品が読み込めていない時のための保険だけ残してある（下の _repliesFallback）。 */
  function _renderReplies(note) {
    if (window.CFNoteReply) return CFNoteReply.html(note);
    return _repliesFallback(note);
  }
  function _repliesFallback(note) {
    const replies = (note && Array.isArray(note.replies)) ? note.replies : [];
    if (replies.length === 0) return '';
    const rows = replies.map(r => {
      const av = _renderAvatar(r.uid, 22);
      const time = _formatReplyTime(r.at);
      return `<div class="bn-reply">
        <span class="bn-reply-av">${av}</span>
        <div class="bn-reply-bubble">
          <div class="bn-reply-text">${_esc(r.text || '')}</div>
          ${time ? `<span class="bn-reply-time">${_esc(time)}</span>` : ''}
        </div>
      </div>`;
    }).join('');
    return `<div class="bn-replies">${rows}</div>`;
  }

  // =========================================
  // メイン：ダッシュボードに描画
  // =========================================
  function renderBoardNotes() {
    // 表示先はビューごとに切替可能（マイダッシュボードは 'mydash-notes-area'）。既定は従来のダッシュボード。
    const target = document.getElementById(window.PIT_BN_TARGET || 'board-notes-area')
      || document.getElementById('board-notes-area');
    if (!target) return;

    _ensureLabels();
    const labels = state.boardLabels || {};

    const labelChipsHtml = NOTE_COLORS.filter(c => labels[c])
      .map(c => `<span class="bn-label-chip bn-label-${c}">${_esc(labels[c])}</span>`).join('');

    // 「自分」セレクタ
    const meId = _meId();
    /* 「自分」の選択肢にも自社（小林モータース）は出さない＝人ではないので自分になれない */
    const meOpts = _bnStaff().map(s =>
      `<option value="${_esc(s.id)}" ${s.id === meId ? 'selected' : ''}>${_esc(s.name)}</option>`).join('');

    // シークレット付箋は作成者本人以外には出さない
    /* 🔴 v1.142.0 出すのは _all()＝自分の付箋＋（まとめて表示ONなら）よそのアプリの付箋。
       ⚠ 並びは今までどおり order 順。**よその付箋は後ろにまとめる**＝自分の盤の順番が崩れない。 */
    const cards = _all()
      .filter(n => !(_isSecretNote(n) && n.authorUid !== meId))
      .sort((a, b) => {
        const fa = _foreign(a) ? 1 : 0, fb2 = _foreign(b) ? 1 : 0;
        if (fa !== fb2) return fa - fb2;
        return (a.order || 0) - (b.order || 0);
      });

    const cardsHtml = cards.length === 0
      ? '<div class="bn-empty">付箋はまだありません。「＋ 付箋を追加」から最初の1枚を作りましょう。</div>'
      : cards.map(n => {
          try { return _renderNoteCard(n); }
          catch (err) {
            console.error('[board-notes] render error', n && n.id, err);
            return `<div class="bn-card bn-color-yellow"><div class="bn-title"><i data-ic=warn data-ics=16></i> 表示エラー</div></div>`;
          }
        }).join('');

    target.innerHTML = `
      <div class="bn-header">
        <div class="bn-header-left">
          <span class="bn-header-icon"><i data-ic=pin data-ics=16></i></span>
          <span class="bn-header-title">全体タスク</span>
          <div class="bn-label-chips">${labelChipsHtml}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          ${_allBtnHtml()}
          <button class="bn-add-btn" onclick="openBoardNoteModal(null)">＋ 付箋を追加</button>
        </div>
      </div>
      <div class="bn-grid" ondragover="boardNoteOnDragOver(event)" ondrop="boardNoteOnDropArea(event)">${cardsHtml}</div>
    `;
  }
  window.renderBoardNotes = renderBoardNotes;

  /* 🔴 v1.142.0（ゆうた指定 2026-08-19）「まとめて表示」のボタン。
     🗣「新規付箋の横にボタン。押すと MHS・PitFlow・CarFlow 全アプリの付箋が集合して一斉表示。
     　　もう一度押すか、ビューを切り替えたらデフォルトに戻る。**ボタンは新規より目立たない形がいい**」
     ⚠ 出すのは**本番モードだけ**（練習用にはよそのアプリのデータが無いので押しても何も起きない）。
     ⚠ 中身は coreflow-note-all.js。ここは呼ぶだけ。 */
  function _allBtnHtml() {
    if (!window.CFNoteAll || !CFNoteAll.available()) return '';
    const on = CFNoteAll.isOn();
    const n = on ? CFNoteAll.count() : 0;
    return `<button type="button" class="cfa-btn${on ? ' on' : ''}" onclick="pitNoteAllToggle()"
      title="${on ? 'CarFlow・MHS の付箋も一緒に出しています。もう一度押すと PitFlow だけに戻ります'
                  : 'CarFlow・MHS の付箋も一緒に出す（別の画面へ移ると戻ります）'}"
      >まとめて表示${on && n ? `<span class="cfa-n">+${n}</span>` : ''}</button>`;
  }
  window.pitNoteAllToggle = function () { if (window.CFNoteAll) CFNoteAll.toggle(); };

  function _renderNoteCard(note) {
    const color = NOTE_COLORS.includes(note.color) ? note.color : 'yellow';
    const done = note.status === 'done';
    const overdue = !done && _isOverdue(note.deadline);
    const authorName = note.authorUid ? _staffName(note.authorUid) : '';
    const authorAv = note.authorUid ? _renderAvatar(note.authorUid, 18) : '';
    const sortedMembers = _sortIds(note.memberUids || []);
    const memberAvatars = sortedMembers.map(id => _renderAvatar(id, 22)).join('');

    const labelText = (state.boardLabels && state.boardLabels[color]) || '';
    const isSecret = _isSecretNote(note);
    const secretBadge = isSecret
      ? `<span class="bn-secret-badge" title="あなただけに見える付箋です（他の人の画面には出ません）"><i data-ic=lock data-ics=16></i> 自分用</span>` : '';
    const titleHtml = note.title ? _esc(note.title) : '<span class="bn-empty-title">(無題)</span>';
    const bodyHtml = _esc(note.body || '');
    const imgHtml = note.imageURL
      ? `<img class="bn-img" src="${_esc(note.imageURL)}" alt="" onclick="event.stopPropagation();openBnImage('${_esc(note.imageURL)}')">` : '';
    const deadlineHtml = note.deadline
      ? `<div class="bn-deadline ${overdue ? 'is-overdue' : ''}">${overdue ? '<i data-ic=warn data-ics=16></i> ' : '<i data-ic=clock data-ics=16></i> '}${_esc(_formatDeadline(note.deadline))}</div>` : '';

    /* 🔴 v1.142.0 よその付箋は**並び替えできない**（順番はそのアプリのものだから） */
    const dragAttrs = (!_isTouchDevice() && !_foreign(note))
      ? `draggable="true"
           ondragstart="boardNoteOnDragStart(event, '${_esc(note.id)}')"
           ondragover="boardNoteOnDragOver(event)"
           ondrop="boardNoteOnDrop(event, '${_esc(note.id)}')"
           ondragend="boardNoteOnDragEnd(event)"` : '';

    // 回覧（circulate）＝担当各自が「済」を入れる方式
    const isCirculate = note.noteType === 'circulate';
    let membersHtml, circRow = '';
    if (isCirculate) {
      const doneSet = new Set(note.doneByUids || []);
      const uids = note.memberUids || [];
      const notDone = _sortIds(uids.filter(u => !doneSet.has(u)));
      const doneU = _sortIds(uids.filter(u => doneSet.has(u)));
      const ordered = notDone.concat(doneU);
      membersHtml = ordered.length
        ? ordered.map((uid, i) => {
            const isD = doneSet.has(uid);
            const av = _renderAvatar(uid, 22);
            const check = isD
              ? `<span style="position:absolute;right:-3px;bottom:-3px;width:13px;height:13px;border-radius:50%;background:#9ca3af;color:#fff;font-size:9px;line-height:13px;text-align:center;border:1.5px solid #fff">✓</span>` : '';
            return `<span style="position:relative;display:inline-block;margin-left:${i ? -6 : 0}px;z-index:${isD ? 1 : 2}"><span style="display:inline-block;opacity:${isD ? 0.4 : 1}">${av}</span>${check}</span>`;
          }).join('')
        : '<span class="bn-no-member">担当なし</span>';
      const total = uids.length;
      const dn = uids.filter(u => doneSet.has(u)).length;
      const typeChip = `<span style="font-size:10px;padding:2px 7px;border-radius:7px;background:rgba(99,102,241,.18);color:#4338ca;border:1px solid rgba(99,102,241,.35)"><i data-ic=refresh data-ics=16></i> 回覧 ${dn}/${total}</span>`;
      let selfBtn = '';
      const myId = _meId();
      if (myId && uids.includes(myId)) {
        const iAmDone = doneSet.has(myId);
        selfBtn = `<button class="bn-actionsheet-btn" style="width:auto;font-size:11px;padding:3px 8px;${iAmDone ? 'opacity:.7' : ''}" onclick="event.stopPropagation();markCirculationSelf('${_esc(note.id)}')">${iAmDone ? '確認済み（取消）' : '✓ 自分が確認'}</button>`;
      }
      circRow = `<div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap">${typeChip}${selfBtn}</div>`;
    } else {
      membersHtml = memberAvatars || '<span class="bn-no-member">担当なし</span>';
    }

    return `
      <div class="bn-card bn-color-${color} ${done ? 'is-done' : ''} ${overdue ? 'is-overdue' : ''} ${_foreign(note) ? 'cfa-foreign' : ''}"
           data-note-id="${_esc(note.id)}"
           ${done ? 'onclick="bnToggleDonePeek(event)"' : ''}
           ${dragAttrs}>
        ${done ? '<div class="bn-done-stamp">済</div>' : ''}
        ${labelText ? `<div class="bn-card-label">${_esc(labelText)}</div>` : ''}
        <button class="bn-menu-btn" onclick="event.stopPropagation();openBoardNoteActions('${_esc(note.id)}')" title="メニュー">⋮</button>
        <div class="bn-title">${(window.CFNoteAll ? CFNoteAll.badgeHtml(note) : '')}${secretBadge}${titleHtml}</div>
        ${imgHtml}
        ${bodyHtml ? `<div class="bn-body">${bodyHtml}</div>` : ''}
        ${deadlineHtml}
        ${circRow}
        ${/* 🔴 返信は「回覧の確認」の下。確認ボタンより上に置くと、回覧の車が押す所を見失う */''}
        ${_renderReplies(note)}
        <div class="bn-footer">
          <div class="bn-members">${membersHtml}</div>
          <div class="bn-author">${authorAv}<span class="bn-author-name">${_esc(authorName)}</span></div>
        </div>
      </div>`;
  }

  // -----------------------------------------
  // ⋮ アクションシート
  // -----------------------------------------
  function openBoardNoteActions(noteId) {
    _activeMenuNoteId = noteId;
    const note = _find(noteId);
    const t = document.getElementById('bn-actionsheet-title');
    if (t) t.textContent = note && note.title ? note.title : '付箋メニュー';
    const isDone = !!(note && note.status === 'done');
    const dEl = document.getElementById('bn-action-done');
    const uEl = document.getElementById('bn-action-undone');
    if (dEl) dEl.style.display = isDone ? 'none' : '';
    if (uEl) uEl.style.display = isDone ? '' : 'none';
    /* 🔴 v1.142.0 よその付箋にできるのは「返信」と「チェック（済・回覧の確認）」だけ（ゆうた指定）。
       ⚠ ボタンを消すだけにしない＝実行する関数の中でも _denyForeign で止めている。 */
    const isFgn = _foreign(note);
    const eEl = document.getElementById('bn-action-edit');
    const xEl = document.getElementById('bn-action-delete');
    if (eEl) eEl.style.display = isFgn ? 'none' : '';
    if (xEl) xEl.style.display = isFgn ? 'none' : '';
    /* 🔴 v1.141.0 **回覧でも返信できる**（ゆうた指定）。以前はここで隠していた。
       ⚠ 「済にする／戻す」は回覧では出さないまま＝回覧の完了は各自の「✓ 自分が確認」で決まる。 */
    const rEl = document.getElementById('bn-action-reply');
    if (rEl) rEl.style.display = '';
    const m = document.getElementById('modal-bn-actions');
    if (m) m.classList.add('show');
  }
  window.openBoardNoteActions = openBoardNoteActions;

  function closeBoardNoteActions() {
    const m = document.getElementById('modal-bn-actions');
    if (m) m.classList.remove('show');
    _activeMenuNoteId = null;
  }
  window.closeBoardNoteActions = closeBoardNoteActions;

  window.bnActionEdit = function () { const id = _activeMenuNoteId; closeBoardNoteActions(); if (id) openBoardNoteModal(id); };
  window.bnActionDone = function () { const id = _activeMenuNoteId; closeBoardNoteActions(); if (id) markBoardNoteDone(id); };
  window.bnActionUndone = function () { const id = _activeMenuNoteId; closeBoardNoteActions(); if (id) markBoardNoteUndone(id); };
  window.bnActionDelete = function () { const id = _activeMenuNoteId; closeBoardNoteActions(); if (id) deleteBoardNoteFromCard(id); };
  window.bnActionReply = function () { const id = _activeMenuNoteId; closeBoardNoteActions(); if (id) openBoardNoteReply(id); };

  // -----------------------------------------
  // 返信
  // -----------------------------------------
  function openBoardNoteReply(noteId) {
    const note = _notes().find(x => x.id === noteId);
    if (!note) return;
    _activeReplyNoteId = noteId;
    const t = document.getElementById('bn-reply-note-title');
    if (t) t.textContent = note.title || note.body || '付箋';
    const ta = document.getElementById('bn-reply-text');
    if (ta) ta.value = '';
    const m = document.getElementById('modal-bn-reply');
    if (m) m.classList.add('show');
    setTimeout(() => { if (ta) ta.focus(); }, 50);
  }
  window.openBoardNoteReply = openBoardNoteReply;

  function closeBoardNoteReply() {
    const m = document.getElementById('modal-bn-reply');
    if (m) m.classList.remove('show');
    _activeReplyNoteId = null;
  }
  window.closeBoardNoteReply = closeBoardNoteReply;

  function submitBoardNoteReply() {
    const id = _activeReplyNoteId;
    const n = _notes().find(x => x.id === id);
    if (!n) { closeBoardNoteReply(); return; }
    const ta = document.getElementById('bn-reply-text');
    const text = ((ta && ta.value) || '').trim();
    if (!text) { _toast('返信内容を入力してください'); return; }
    if (!Array.isArray(n.replies)) n.replies = [];
    n.replies.push({ id: _newReplyId(), uid: _meId() || null, text: text, at: Date.now() });
    _save();
    closeBoardNoteReply();
    renderBoardNotes();
  }
  window.submitBoardNoteReply = submitBoardNoteReply;

  function deleteBoardNoteReply(noteId, replyId) {
    const n = _notes().find(x => x.id === noteId);
    if (!n || !Array.isArray(n.replies)) return;
    const r = n.replies.find(x => x.id === replyId);
    if (!r) return;
    if (!_canDeleteReply(r)) { _toast('自分の返信だけ消せます'); return; }
    /* 🔵 v1.75.0 聞くのはアプリ内ダイアログ（pitAsk）＝答えは後から returns（非同期）。 */
    pitAsk('この返信を消しますか？', { danger: true, ok: '消す' }).then(function (yes) {
      if (!yes) return;
      n.replies = n.replies.filter(x => x.id !== replyId);
      _save();
      renderBoardNotes();
    });
  }
  window.deleteBoardNoteReply = deleteBoardNoteReply;

  // 済カードをタップ → 「済」を薄く透かす（もう一度で戻る）
  window.bnToggleDonePeek = function (e) {
    try {
      const tgt = e && e.target;
      if (tgt && tgt.closest && tgt.closest('a,button,.bn-img,.bn-reply-del')) return;
      const card = e && e.currentTarget;
      if (card) card.classList.toggle('bn-peek');
    } catch (err) {}
  };

  // -----------------------------------------
  // 済 / 未済 / 回覧 / 消去
  // -----------------------------------------
  function markBoardNoteDone(noteId) {
    const n = _find(noteId);
    if (!n) return;
    n.status = 'done';
    n.doneAt = Date.now();
    n.doneByUid = _meId() || null;
    _save(n);
    renderBoardNotes();
  }
  window.markBoardNoteDone = markBoardNoteDone;

  function markBoardNoteUndone(noteId) {
    const n = _find(noteId);
    if (!n) return;
    n.status = 'open';
    n.doneAt = null;
    n.doneByUid = null;
    if (n.noteType === 'circulate') n.doneByUids = [];
    _save(n);
    renderBoardNotes();
  }
  window.markBoardNoteUndone = markBoardNoteUndone;

  function markCirculationSelf(noteId) {
    const n = _find(noteId);
    if (!n) return;
    const uid = _meId();
    if (!uid) { _toast('「自分」を選んでください'); return; }
    if (!Array.isArray(n.doneByUids)) n.doneByUids = [];
    const i = n.doneByUids.indexOf(uid);
    if (i >= 0) n.doneByUids.splice(i, 1); else n.doneByUids.push(uid);
    const uids = n.memberUids || [];
    const allDone = uids.length > 0 && uids.every(u => n.doneByUids.includes(u));
    if (allDone) { n.status = 'done'; n.doneAt = Date.now(); n.doneByUid = uid; }
    else { n.status = 'open'; n.doneAt = null; }
    _save(n);
    renderBoardNotes();
  }
  window.markCirculationSelf = markCirculationSelf;

  function deleteBoardNoteFromCard(noteId) {
    const n = _find(noteId);
    if (!n) return;
    if (_denyForeign(n)) return;
    pitAsk(`付箋「${n.title || '(無題)'}」を消去しますか？`, { danger: true, ok: '消去する' }).then(function (yes) {
      if (!yes) return;
      const i = _notes().findIndex(x => x.id === noteId);
      if (i >= 0) _notes().splice(i, 1);
      _save();
      renderBoardNotes();
    });
  }
  window.deleteBoardNoteFromCard = deleteBoardNoteFromCard;

  // =========================================
  // 編集モーダル
  // =========================================
  function openBoardNoteModal(noteId) {
    _editor.editingId = noteId || null;
    _editor.photoData = null;
    _editor.photoChanged = false;
    _editor.members = [];

    const note = noteId ? _find(noteId) : null;
    if (note && _denyForeign(note)) return;
    const isNew = !note;

    document.getElementById('bn-modal-title').textContent = isNew ? '付箋を追加' : '付箋を編集';
    document.getElementById('bn-inp-title').value = note ? (note.title || '') : '';
    document.getElementById('bn-inp-body').value = note ? (note.body || '') : '';
    document.getElementById('bn-inp-deadline').value = note ? (note.deadline || '') : '';
    _editor.members = note ? (note.memberUids || []).slice() : [];

    const initialColor = note ? (note.color || 'yellow') : 'yellow';
    NOTE_COLORS.forEach(c => { const r = document.getElementById('bn-color-' + c); if (r) r.checked = (c === initialColor); });

    const initialType = (note && note.noteType === 'circulate') ? 'circulate' : 'execute';
    const rExec = document.getElementById('bn-type-execute');
    const rCirc = document.getElementById('bn-type-circulate');
    if (rExec) rExec.checked = (initialType === 'execute');
    if (rCirc) rCirc.checked = (initialType === 'circulate');

    _renderPhotoPreview(note);
    _renderMemberPicker();

    document.getElementById('modal-board-note').classList.add('show');
  }
  window.openBoardNoteModal = openBoardNoteModal;

  function closeBoardNoteModal() {
    document.getElementById('modal-board-note').classList.remove('show');
    _editor.editingId = null;
    _editor.photoData = null;
    _editor.photoChanged = false;
  }
  window.closeBoardNoteModal = closeBoardNoteModal;

  function _imgPreviewHtml(src) {
    return `<img src="${_esc(src)}" alt="" style="max-width:100%;max-height:200px;border-radius:6px"><br>
      <button class="bn-actionsheet-btn" style="width:auto;font-size:12px;padding:5px 10px;margin-top:6px" onclick="bnRemovePhoto()">削除</button>`;
  }
  function _renderPhotoPreview(note) {
    const wrap = document.getElementById('bn-inp-photo-preview');
    if (!wrap) return;
    wrap.innerHTML = (note && note.imageURL) ? _imgPreviewHtml(note.imageURL) : '';
    _setFileName(note && note.imageURL ? '画像あり' : '');
  }
  /* 📎 選んだファイル名をボタンの横に出す（v1.21.0）。
     ⚠ input を隠したので、何も出さないと「選べたのか分からない」状態になる。 */
  function _setFileName(t) {
    const el = document.getElementById('bn-file-name');
    if (el) el.textContent = t || '';
  }

  // 画像選択時：縮小（最大長辺1000px）して dataURL 化（localStorage 容量対策）
  window.bnOnPhotoChange = function (input) {
    const file = input && input.files && input.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { _toast('画像ファイルを選んでください'); input.value = ''; return; }
    _setFileName(file.name.length > 26 ? file.name.slice(0, 24) + '…' : file.name);
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1000;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) { const r = Math.min(MAX / w, MAX / h); w = Math.round(w * r); h = Math.round(h * r); }
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = cv.toDataURL('image/jpeg', 0.82);
        _editor.photoData = dataUrl;
        _editor.photoChanged = true;
        const wrap = document.getElementById('bn-inp-photo-preview');
        if (wrap) wrap.innerHTML = _imgPreviewHtml(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  window.bnRemovePhoto = function () {
    _editor.photoData = null;
    _editor.photoChanged = true;
    const wrap = document.getElementById('bn-inp-photo-preview');
    if (wrap) wrap.innerHTML = '';
    _setFileName('');
    /* ⚠ input を空に戻さないと「同じ写真をもう一度選ぶ」が効かない（change が起きないため） */
    const inp = document.querySelector('.bn-file input[type=file]');
    if (inp) inp.value = '';
  };

  function _renderMemberPicker() {
    const wrap = document.getElementById('bn-inp-members');
    if (!wrap) return;
    const list = _bnStaff();

    // 一括選択（全員 / クリア / 1課 / 2課 / 受付）
    const quick = document.getElementById('bn-group-quick');
    if (quick) {
      const btn = (label, onclick, extra) => `<button type="button" class="bn-actionsheet-btn" style="width:auto;font-size:11px;padding:3px 8px;${extra || ''}" onclick="${onclick}">${label}</button>`;
      let qhtml = btn('全員', 'bnQuickSelectAll()') + btn('クリア', 'bnQuickClear()', 'opacity:.7');
      /* v1.6.0：部署は CoreMembers 由来の4分類（1課/2課/受付課/その他）。兼任の人は両方に出る。 */
      const _divs = window.PIT_DIVS || (state.divisions || []);
      _divs.forEach(d => { qhtml += btn('<i data-ic=users data-ics=16></i> ' + _esc(d.label), `bnQuickSelectDivision('${_esc(d.id)}')`); });
      qhtml += btn('<i data-ic=phone data-ics=16></i> 受付ぜんぶ', 'bnQuickSelectReception()');
      quick.innerHTML = qhtml;
    }

    wrap.innerHTML = list.map(s => {
      const checked = _editor.members.includes(s.id);
      return `<label class="bn-member-pick ${checked ? 'is-checked' : ''}">
          <input type="checkbox" ${checked ? 'checked' : ''} onchange="bnToggleMember('${_esc(s.id)}', this.checked)">
          ${_renderAvatar(s.id, 24)}<span>${_esc(s.name)}</span>
        </label>`;
    }).join('');
    if (!list.length) wrap.innerHTML = '<div style="font-size:11px;color:var(--text3)">メンバーがいません</div>';
  }

  window.bnQuickSelectAll = function () { _editor.members = _bnStaff().map(s => s.id); _renderMemberPicker(); };
  window.bnQuickClear = function () { _editor.members = []; _renderMemberPicker(); };
  window.bnQuickSelectDivision = function (divId) {
    const inDiv = _bnStaff().filter(s =>
      (Array.isArray(s.divisions) && s.divisions.includes(divId)) || s.division === divId
    ).map(s => s.id);
    if (!inDiv.length) { _toast('この部署のメンバーがいません'); return; }
    const allIn = inDiv.every(u => _editor.members.includes(u));
    if (allIn) _editor.members = _editor.members.filter(u => !inDiv.includes(u));
    else inDiv.forEach(u => { if (!_editor.members.includes(u)) _editor.members.push(u); });
    _renderMemberPicker();
  };
  window.bnQuickSelectReception = function () {
    const recp = _bnStaff().filter(s => s.reception).map(s => s.id);
    if (!recp.length) { _toast('受付メンバーがいません'); return; }
    const allIn = recp.every(u => _editor.members.includes(u));
    if (allIn) _editor.members = _editor.members.filter(u => !recp.includes(u));
    else recp.forEach(u => { if (!_editor.members.includes(u)) _editor.members.push(u); });
    _renderMemberPicker();
  };

  window.bnToggleMember = function (uid, checked) {
    if (checked) { if (!_editor.members.includes(uid)) _editor.members.push(uid); }
    else { _editor.members = _editor.members.filter(x => x !== uid); }
    const wrap = document.getElementById('bn-inp-members');
    if (wrap) {
      wrap.querySelectorAll('.bn-member-pick').forEach(el => {
        const inp = el.querySelector('input[type="checkbox"]');
        if (!inp) return;
        const isMatch = inp.getAttribute('onchange') && inp.getAttribute('onchange').indexOf("'" + uid + "'") >= 0;
        if (isMatch) el.classList.toggle('is-checked', checked);
      });
    }
  };

  function saveBoardNoteFromModal() {
    const title = (document.getElementById('bn-inp-title').value || '').trim();
    const body = (document.getElementById('bn-inp-body').value || '').trim();
    const deadline = (document.getElementById('bn-inp-deadline').value || '').trim();
    let color = 'yellow';
    NOTE_COLORS.forEach(c => { const r = document.getElementById('bn-color-' + c); if (r && r.checked) color = c; });
    const rCirc = document.getElementById('bn-type-circulate');
    const noteType = (rCirc && rCirc.checked) ? 'circulate' : 'execute';

    if (!title && !body) { _toast('タイトルか本文のどちらかは入力してください'); return; }

    const isNew = !_editor.editingId;
    let note = isNew
      ? { id: _newId(), title, body, color, noteType, deadline: deadline || null, memberUids: _editor.members.slice(), doneByUids: [], authorUid: _meId(), status: 'open', order: _maxOrder() + 1, imageURL: '', replies: [] }
      : _notes().find(x => x.id === _editor.editingId);
    if (!note) { _toast('対象の付箋が見つかりません'); return; }

    if (!isNew) {
      note.title = title; note.body = body; note.color = color; note.noteType = noteType;
      note.deadline = deadline || null; note.memberUids = _editor.members.slice();
      if (!Array.isArray(note.doneByUids)) note.doneByUids = [];
    }
    note.secret = _isSecretNote(note);

    // 画像（dataURL）の差し替え／削除
    if (_editor.photoChanged) {
      note.imageURL = _editor.photoData || '';
    }

    if (isNew) _notes().push(note);
    _save();
    closeBoardNoteModal();
    renderBoardNotes();
  }
  window.saveBoardNoteFromModal = saveBoardNoteFromModal;

  // =========================================
  // DnD 並び替え
  // =========================================
  function boardNoteOnDragStart(e, noteId) {
    _dragId = noteId;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', noteId); } catch (err) {}
    e.currentTarget.classList.add('is-dragging');
  }
  window.boardNoteOnDragStart = boardNoteOnDragStart;

  function boardNoteOnDragOver(e) {
    if (!_dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }
  window.boardNoteOnDragOver = boardNoteOnDragOver;

  function boardNoteOnDrop(e, targetNoteId) {
    e.preventDefault();
    e.stopPropagation();
    const sourceId = _dragId;
    if (!sourceId || sourceId === targetNoteId) return;
    const list = _notes().slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const fromIdx = list.findIndex(x => x.id === sourceId);
    const toIdx = list.findIndex(x => x.id === targetNoteId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    list.forEach((n, i) => { n.order = i; });
    state.boardNotes = list;
    _save();
    renderBoardNotes();
  }
  window.boardNoteOnDrop = boardNoteOnDrop;

  function boardNoteOnDropArea(e) { e.preventDefault(); }
  window.boardNoteOnDropArea = boardNoteOnDropArea;

  function boardNoteOnDragEnd(e) {
    _dragId = null;
    document.querySelectorAll('.bn-card.is-dragging').forEach(c => c.classList.remove('is-dragging'));
  }
  window.boardNoteOnDragEnd = boardNoteOnDragEnd;

  // =========================================
  // 画像プレビュー
  // =========================================
  window.openBnImage = function (url) {
    if (!url) return;
    const m = document.getElementById('modal-bn-image');
    const img = document.getElementById('bn-image-img');
    if (img) img.src = url;
    if (m) m.classList.add('show');
  };
  window.closeBnImage = function () {
    const m = document.getElementById('modal-bn-image');
    if (m) m.classList.remove('show');
  };

  /* =========================================
     🔴 v1.141.0 付箋の返信＝全アプリ共通の部品（_shared/coreflow-note-reply.js）につなぐ。
     ⚠ **アプリごとに違うところだけを関数で渡す。** 部品の中に PitFlow の事情を書かない。
        ・「自分」    … PitFlow は認証ではなく localStorage の選択（_meId）
        ・保存        … PitDB.save()（クラウドは pitBoardNotes へ差分保存）
        ・確認ダイアログ … 標準の confirm ではなく pitAsk（v1.75.0 の決めごと）
     ========================================= */
  if (window.CFNoteReply) {
    CFNoteReply.setup({
      getNote:    function (id) { return _find(id); },
      getMe:      function () { return _meId(); },
      avatarHtml: function (uid, px) { return _renderAvatar(uid, px); },
      /* 🔴 v1.142.0 まとめて表示中は、よその付箋への返信を**そのアプリの入れ物**へ書く。 */
      save:       function (note, done) {
        if (_foreign(note) && window.CFNoteAll) { CFNoteAll.save(note, function () { if (done) done(); }); return; }
        _save(); if (done) done();
      },
      rerender:   function () { renderBoardNotes(); },
      toast:      function (msg, code) { _toast(msg, code); },
      ask:        function (msg, cb) {
        if (window.pitAsk) pitAsk(msg, { danger: true, ok: '消す' }).then(function (yes) { cb(!!yes); });
        else cb(true);
      }
    });
  }

  /* =========================================
     🔴 v1.142.0 「まとめて表示」＝全アプリ共通の部品（_shared/coreflow-note-all.js）につなぐ。
     ⚠ 出すのは**本番モード（クラウド）だけ**。練習用（サンプル・デモ）ではボタンを出さない。
     ⚠ 別のビューへ移ったら解除（下の showView の包み）。**持ち越さない。**
     ========================================= */
  if (window.CFNoteAll) {
    CFNoteAll.setup({
      self:     'pitflow',
      db:       function () { return window.fb && window.fb.db; },
      company:  function () { return window.fb && window.fb.company && window.fb.company(); },
      ready:    function () { return !!(window.PitDB && PitDB.mode === 'cloud' && PitDB._loaded); },
      onChange: function () { renderBoardNotes(); },
      toast:    function (msg) { _toast(msg); }
    });
    /* 別のビューへ移ったら解除（myonly-pit.js と同じ包み方＝views.js は触らない） */
    var _origShow = window.showView;
    if (typeof _origShow === 'function') {
      window.showView = function (v) {
        if (CFNoteAll.isOn()) CFNoteAll.off(true);   /* ここでは描き直さない＝これから描く画面に任せる */
        return _origShow.apply(this, arguments);
      };
    }
  }

  console.log('[board-notes] ready (PitFlow)');
})();
