/* ========================================
   board-notes.js  -  付箋ボード（PitFlow の差し込み）PitFlow v2.109.0
   ----------------------------------------
   🔴 v2.109.0（ゆうた指定 2026-09-13）付箋は **中身も見た目も全アプリ共通の部品**（_shared/coreflow-note-board.js）で描く。
      🗣「付箋に関しては見ためもだけど　なかみも共通にした方がいいのでは？？」
      ここに残すのは **PitFlow だけの事情** だけ：
        ・保存        … state.boardNotes に置いて PitDB.save()（クラウドは pitBoardNotes へ差分保存）
        ・名簿        … state.staff（🔴 自社「小林モータース」は人ではないので担当・自分に出さない）
        ・一括で選ぶ   … 1課・2課・受付課・その他（PIT_DIVS）＋受付ぜんぶ
        ・添付        … 画像・PDF をファイル置き場（pitBoardNotes/）へ（部品がやる・v2.110.0）
        ・まとめて表示 … よその付箋は返信とチェックだけ（coreflow-note-all.js）
   🔴 「自分」＝ **ログインした人**（fb.currentMember.id）。名簿に見つからなくても**他人を自分にしない**。
      ⚠ ログインしない見本（デモ）だけ、今までどおり端末に覚えた人／先頭のフロント担当。
   ⚠ 付箋の決まり（自分用・済から3日で隠す・回覧・保存の形）は部品の1本。ここに書き写さない。
   ======================================== */
(function () {
  'use strict';

  const ME_KEY = 'pitflow_bn_me';
  const DEF_LABELS = { red: '緊急', orange: '今日中', yellow: '今週中', green: '連絡', blue: '余裕' };

  function _toast(msg) { if (window.pitToast) pitToast(msg); }
  /* 🔴 **書く用**＝PitFlow 自身の付箋の配列。ここに よその付箋を混ぜないこと（push/splice の相手） */
  function _notes() { if (!Array.isArray(state.boardNotes)) state.boardNotes = []; return state.boardNotes; }
  /* 🔴 **読む用**＝画面に出す全部（まとめて表示がONなら よそのアプリの付箋も混ざる） */
  function _all() {
    const mine = _notes();
    if (!window.CFNoteAll || !CFNoteAll.isOn()) return mine;
    return mine.concat(CFNoteAll.foreign());
  }
  function _foreign(n) { return !!(window.CFNoteAll && CFNoteAll.isForeign(n)); }
  /* よその付箋にできるのは「返信」と「チェック」だけ（ゆうた指定）。編集・消去・並び替えは止める。 */
  function _denyForeign(n) {
    if (!_foreign(n)) return false;
    _toast('まとめて表示中です。' + (window.CFNoteAll ? CFNoteAll.labelOf(n) : 'よそのアプリ') + 'の付箋は、そのアプリで直してください');
    return true;
  }

  /* 辞めた人も引けるようにする（付箋に残った名前が空欄にならないように） */
  function _staffById(id) {
    return ((window.state && state.staff) || []).find(s => s.id === id)
        || (window.pitStaffById ? window.pitStaffById(id) : null)
        || null;
  }
  /* 🔴 v1.51.0：付箋の担当・自分に「小林モータース」を出さない（人ではなく整備ソフト側の受け皿）。
     ⚠ 名前を出す方（_staffById）は素の state.staff を見る＝昔の付箋に入っていても名前は出る。 */
  function _bnStaff() { return ((window.state && state.staff) || []).filter(s => !s.isSelf); }

  /* 「自分」。🔴 ログインしていれば本人（名簿の番号・ログインID の順）。見本だけ端末の選択 */
  function _meIds() {
    const m = window.fb && window.fb.currentMember;
    if (m && m.id) return [m.id, window.fb.currentUser && window.fb.currentUser.uid].filter(Boolean);
    let id = null;
    try { id = localStorage.getItem(ME_KEY); } catch (e) {}
    const staff = _bnStaff();
    if (id && staff.some(s => s.id === id)) return [id];
    const front = staff.find(s => s.front) || staff[0];
    return front ? [front.id] : [];
  }
  window.bnSetMe = function (id) {
    try { localStorage.setItem(ME_KEY, id || ''); } catch (e) {}
    renderBoardNotes();
  };

  function _labels() {
    if (!state.boardLabels || typeof state.boardLabels !== 'object') state.boardLabels = {};
    Object.keys(DEF_LABELS).forEach(c => { if (state.boardLabels[c] == null) state.boardLabels[c] = DEF_LABELS[c]; });
    return state.boardLabels;
  }

  /* 🔴 v1.142.0 保存先は付箋の出どころで変わる（まとめて表示・coreflow-note-all.js）。
     ⚠ **よその付箋を PitDB に保存しない。** PitFlow のデータではないので、書くと二重に増える。 */
  function _save(note) {
    if (note && _foreign(note) && window.CFNoteAll) return new Promise(res => CFNoteAll.save(note, res));
    if (window.PitDB && PitDB.save) PitDB.save();
    return Promise.resolve();
  }

  /* 「まとめて表示」のボタン（新規より控えめ）。⚠ 出すのは本番モードだけ（部品の available が決める） */
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

  if (window.CFNoteBoard) {
    CFNoteBoard.mount({
      app: 'pitflow',
      me: _meIds,
      notes: _all,
      members: () => _bnStaff().map(s => ({ id: s.id, name: s.name, photo: s.photo || '' })),
      member: id => { const s = _staffById(id); return s ? { name: s.name, photo: s.photo || '' } : null; },
      /* v1.6.0：部署は CoreMembers 由来の4分類（1課/2課/受付課/その他）。兼任の人は両方に出る。 */
      quickGroups: () => {
        const staff = _bnStaff();
        const divs = window.PIT_DIVS || (state.divisions || []);
        const g = divs.map(dv => ({
          label: dv.label,
          ids: staff.filter(s => (Array.isArray(s.divisions) && s.divisions.includes(dv.id)) || s.division === dv.id).map(s => s.id)
        }));
        g.push({ label: '受付ぜんぶ', ids: staff.filter(s => s.reception).map(s => s.id) });
        return g;
      },
      labels: () => _labels(),
      save: (note, info) => { if (info && info.isNew && !_foreign(note)) _notes().push(note); return _save(note); },
      remove: note => {
        const i = _notes().findIndex(x => x.id === note.id);
        if (i >= 0) _notes().splice(i, 1);
        return _save();
      },
      reorder: list => { state.boardNotes = list; return _save(); },
      /* 🔴 v2.110.0 画像も PDF も付けられる（CarFlow と同じ）。置き場＝companies/{会社}/pitBoardNotes/。
         ⚠ 見本・デモ（クラウドなし）は置き場が無いので、画像だけ付箋に直接持つ（部品が判断する） */
      attach: {
        accept: 'image/*,application/pdf,.pdf',
        storage: { folder: 'pitBoardNotes', company: () => (window.PIT_CLOUD && window.fb && window.fb.currentCompanyId) || null }
      },
      isForeign: _foreign,
      badgeHtml: n => (window.CFNoteAll ? CFNoteAll.badgeHtml(n) : ''),
      headerExtraHtml: _allBtnHtml,
      /* 表示先はビューごとに切替可能（マイダッシュボードは 'mydash-notes-area'）。既定は従来のダッシュボード。 */
      targets: () => [document.getElementById(window.PIT_BN_TARGET || 'board-notes-area') || document.getElementById('board-notes-area')],
      /* 🔵 v1.75.0 聞くのはアプリ内ダイアログ（pitAsk）。ブラウザ純正の confirm は使わない */
      ask: (msg, opt) => (window.pitAsk ? pitAsk(msg, { danger: !!(opt && opt.danger), ok: (opt && opt.ok) || 'OK' }) : Promise.resolve(false)),
      toast: _toast
    });
  }

  function renderBoardNotes() { if (window.CFNoteBoard) CFNoteBoard.render(); }
  window.renderBoardNotes = renderBoardNotes;
  /* 前からある呼び口（他のファイル・見張りが使う）。中身は部品へ渡すだけ */
  window.openBoardNoteModal = function (noteId, opts) {
    const n = noteId ? _all().find(x => x.id === noteId) : null;
    if (n && _denyForeign(n)) return;
    if (window.CFNoteBoard) CFNoteBoard.openEditor(noteId || null, opts);
  };
  window.openBoardNoteActions = id => window.CFNoteBoard && CFNoteBoard.menu(id);
  window.markBoardNoteDone = id => window.CFNoteBoard && CFNoteBoard.markDone(id);
  window.markBoardNoteUndone = id => window.CFNoteBoard && CFNoteBoard.markUndone(id);
  window.markCirculationSelf = id => window.CFNoteBoard && CFNoteBoard.circulate(id);
  window.deleteBoardNoteFromCard = function (id) {
    const n = _all().find(x => x.id === id);
    if (n && _denyForeign(n)) return;
    if (window.CFNoteBoard) CFNoteBoard.remove(id);
  };
  window.openBnImage = url => window.CFNoteBoard && CFNoteBoard.preview(url);

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
      /* ⚠ 出す・出さないは「クラウドに繋がっているか」だけで決める（本番モード＝PIT_CLOUD）。 */
      ready:    function () { return !!(window.PIT_CLOUD && window.fb && window.fb.db); },
      onChange: function () { renderBoardNotes(); },
      toast:    function (msg) { _toast(msg); }
    });
    var _origShow = window.showView;
    if (typeof _origShow === 'function') {
      window.showView = function (v) {
        if (CFNoteAll.isOn()) CFNoteAll.off(true);   /* ここでは描き直さない＝これから描く画面に任せる */
        return _origShow.apply(this, arguments);
      };
    }
  }

  console.log('[board-notes] ready (PitFlow・共通部品につないだ)');
})();
