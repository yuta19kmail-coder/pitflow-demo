/* ========================================
   ctxmenu-pit.js  -  右クリックメニュー（PitFlow 全体）  v1.20.0
   ----------------------------------------
   ◎考え方（ゆうた指定）
     「専用メニューというより、あくまで便利になる機能として」。
     ＝ **今できることへの近道**だけを載せる。ここでしかできない操作は作らない。
        右クリックを知らない人が今までどおり使えることが大前提。

   ◎どこで出るか（右クリックした所から上へ辿って、最初に当たったものが対象）
     予約カード      [data-card-id]        … 全ビュー共通（タスクボード・予約・当日・返車・実績・PIT配置図・駐車場）
     顧客の行        tr.ct-clickrow        … 顧客一覧
     車両の行        .fl-row-click         … 車両管理
     代車の貸出      [data-aid]            … 代車カレンダー
     付箋            [data-note-id]        … 付箋ボード
     カレンダーの日  [data-drop="reserveDate"] / .cfs-day[data-ds]

   🔴 既存ファイルを1行も触らずに済ませている
     顧客・車両・駐車場の行は `data-*` を持っていないが、**onclick 属性に書いてある
     ID を読み取る**ことで対象を特定している（`idFromOnclick`）。
     ⚠ そのため、呼び出し名（custOpen / fleetOpenDetail / openDetail）を変えたら
        ここも直すこと。テストが見張っている。

   ◎ブラウザ標準メニューとの関係（ゆうた指定）
     ・対象の上でだけ差し替える。**余白・文字・入力欄の上では今までどおり**
       （コピー／貼り付け／検証がふつうに使える）
     ・**Shift＋右クリックでいつでもブラウザ標準に戻せる**（逃げ道）
   ◎スマホの長押しは対象外（ドラッグと喧嘩するため。必要になったら別途）
   ======================================== */
(function () {
  'use strict';

  var PITFLOW_BASE = 'https://pitflow.kobayashi-motors.com';
  var MENU_ID = 'pit-ctx';
  var _openSub = null;

  /* ===== 小道具 ===== */
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function ico(n, s){ try { if (window.IC && IC.has(n)) return IC(n, s || 16); } catch(e){} return ''; }
  function toast(m){ if (window.pitToast) pitToast(m); }
  function card(id){ return (window.state && state.cards || []).find(function(x){ return x.id === id; }) || null; }

  /* onclick 属性から ID を抜く＝既存の描画コードを触らずに対象を特定する */
  function idFromOnclick(el, fn){
    if (!el || !el.getAttribute) return '';
    var s = el.getAttribute('onclick') || '';
    var m = new RegExp(fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\(\\\\?'([^'\\\\]+)").exec(s);
    return m ? m[1] : '';
  }

  /* 直した後：保存して、いま開いている画面を描き直す */
  function refresh(){
    try { if (window.PitDB) PitDB.save(); } catch(e){}
    try { if (window.state && state.currentView && window.showView) showView(state.currentView); } catch(e){}
  }

  function copy(text, what){
    var t = String(text == null ? '' : text);
    if (!t){ toast(what + 'は入っていません'); return; }
    var done = function(){ toast(what + 'をコピーしました：' + (t.length > 22 ? t.slice(0,22) + '…' : t)); };
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(t).then(done).catch(function(){ fallback(); });
    } else fallback();
    function fallback(){
      try {
        var ta = document.createElement('textarea');
        ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done();
      } catch(e){ toast('コピーできませんでした'); }
    }
  }

  /* ===== メニューの部品 ===== */
  var SEP  = { sep: true };
  function HEAD(t){ return { head: t }; }

  /* ===== 対象ごとのメニュー ===== */

  /* 🚗 予約カード（全ビュー共通・いちばん使う） */
  function cardMenu(c){
    var items = [];
    var st = c.status;

    items.push({ ic:'clipboard', label:'詳細を開く', run: function(){ if (window.openDetail) openDetail(c.id); } });
    items.push({ ic:'external', label:'別タブで開く', sub:'2枚並べて見比べられる',
      run: function(){ try { window.open(PITFLOW_BASE + '/?card=' + encodeURIComponent(c.id), '_blank', 'noopener'); } catch(e){} } });
    items.push({ ic:'printer', label:'表紙を印刷', run: function(){ if (window.pitPrintCover) pitPrintCover(c.id); } });
    items.push(SEP);

    /* 状態に合う操作だけ出す（合わないものは出さない） */
    if (st === 'reserved'){
      items.push({ ic:'download', label:'入庫済みにする', sub:'タスクの「点検待ち」へ',
        run: function(){ if (window.pitTodayCheckIn) pitTodayCheckIn(c.id); refresh(); } });
    }
    if (st && st !== 'reserved' && st !== 'returned' && st !== 'scrap' && st !== 'cancelled'){
      items.push({ ic:'upload', label:'返車済みにする', sub:'実績（確定売上）に固める',
        run: function(){ if (window.pitTodayReturn) pitTodayReturn(c.id); refresh(); } });
    }

    /* 工程を変える＝ドラッグの代わり。今いる列は選べない */
    var board = (window.state && state.boards || []).find(function(b){ return b.id === (c.boardId || 'default'); });
    if (board && st !== 'reserved' && st !== 'returned'){
      var cols = (board.cols || []).filter(function(x){ return !x.side; });
      if (cols.length){
        items.push({ ic:'kanban', label:'工程を変える', items: cols.map(function(col){
          return { ic: (col.id === st ? 'check' : ''), label: col.name, disabled: (col.id === st),
            run: function(){
              var cc = card(c.id); if (!cc) return;
              cc.status = col.id;
              if (window.logFlow) logFlow(cc, '工程を変更（' + col.name + '）');
              if (window.pitLog) pitLog('工程を変更（右クリック）', { cardId: cc.id, kind:'phase', label: label(cc) + ' / ' + col.name });
              refresh(); toast('「' + col.name + '」へ移しました');
            } };
        }) });
      }
    }

    /* v1.36.0 タスクボードの区切りライン（board-line.js）。盤面に乗っているカードだけ。 */
    if (window.PitBoardLine && st !== 'reserved' && st !== 'returned'){
      var _bl = PitBoardLine.ctxItem(c);
      if (_bl) items.push(_bl);
    }

    items.push({ ic: c.urgent ? 'ban' : 'bolt', label: c.urgent ? '急ぎを外す' : '急ぎにする',
      run: function(){ var cc = card(c.id); if (!cc) return; cc.urgent = !cc.urgent; refresh();
        toast(cc.urgent ? '急ぎにしました' : '急ぎを外しました'); } });

    items.push(SEP);
    items.push({ ic:'copy', label:'コピー', items: [
      { label:'顧客名',        run: function(){ copy(c.customer, '顧客名'); } },
      { label:'ナンバー',      run: function(){ copy(c.plate, 'ナンバー'); } },
      { label:'電話番号',      run: function(){ copy(c.tel, '電話番号'); } },
      { label:'メーカー・車種', run: function(){ copy(((c.maker || '') + ' ' + (c.car || '')).trim(), '車種'); } },
      { label:'このカードのURL', run: function(){ copy(PITFLOW_BASE + '/?card=' + encodeURIComponent(c.id), 'URL'); } }
    ]});
    return items;

    function label(x){ return (x.customer ? x.customer + ' 様' : '') + (x.car ? ' / ' + x.car : ''); }
  }

  /* 👤 顧客の行 */
  function customerMenu(id){
    var cu = (window.state && state.customers || []).find(function(x){ return x.id === id; }) || {};
    return [
      { ic:'user', label:'顧客詳細を開く', run: function(){ if (window.custOpen) custOpen(id); } },
      SEP,
      { ic:'copy', label:'コピー', items: [
        { label:'名前',   run: function(){ copy(cu.name, '名前'); } },
        { label:'カナ',   run: function(){ copy(cu.kana, 'カナ'); } },
        { label:'電話番号', run: function(){ copy(cu.tel, '電話番号'); } }
      ]}
    ];
  }

  /* 🚙 車両（車両管理） */
  function vehicleMenu(id){
    var v = (window.state && state.loaners || []).concat((window.state && state.companyCars) || [])
      .find(function(x){ return x.id === id; }) || {};
    return [
      { ic:'car', label:'車両を開く', run: function(){ if (window.fleetOpenDetail) fleetOpenDetail(id); } },
      SEP,
      { ic:'copy', label:'コピー', items: [
        { label:'呼び名',   run: function(){ copy(v.name || ((v.no || '') + ' ' + (v.car || '')).trim(), '呼び名'); } },
        { label:'ナンバー', run: function(){ copy(v.plate, 'ナンバー'); } }
      ]}
    ];
  }

  /* 🔑 代車の貸出 */
  function assignMenu(aid, el){
    var items = [{ ic:'key', label:'この貸出を開く', run: function(){ if (window.loBadgeDetail) loBadgeDetail(aid); } }];
    var cid = el && el.getAttribute && el.getAttribute('data-card-id');
    if (cid && card(cid)) items.push({ ic:'clipboard', label:'この予約カードを開く', run: function(){ if (window.openDetail) openDetail(cid); } });
    return items;
  }

  /* 📌 付箋 */
  function noteMenu(id){
    return [{ ic:'sticky', label:'付箋を開く', run: function(){ if (window.openBoardNoteModal) openBoardNoteModal(id); } }];
  }

  /* 📅 カレンダーの日 */
  function dayMenu(ds){
    var md = String(ds).split('-');
    var lbl = md.length >= 3 ? (+md[1]) + '/' + (+md[2]) : ds;
    return [
      HEAD(lbl + ' の予定'),
      { ic:'plus', label:'この日で新規予約', sub:'入庫日を ' + lbl + ' にして開く',
        run: function(){
          if (!window.openNewReserve) return;
          openNewReserve();
          /* openNewReserve が作った下書きに入庫日を入れてから描き直す */
          try {
            var list = (state.cards || []).filter(function(x){ return x._draft; });
            var c = list[list.length - 1];
            if (c){ c.reserveDate = ds; c.intakeTbd = false; if (window.renderCardForm) renderCardForm(c); }
          } catch(e){}
        } },
      { ic:'calendar', label:'この日の予約カレンダーへ', run: function(){ if (window.pitGotoReserveDate) pitGotoReserveDate(ds); } },
      { ic:'copy', label:'日付をコピー', run: function(){ copy(ds, '日付'); } }
    ];
  }

  /* ===== 右クリックした所から対象を探す（上から順に・最初に当たったもの） ===== */
  var TARGETS = [
    /* ⚠ 代車の貸出バッジは data-aid と data-card-id を両方持っている（loaner.js）。
       押した人は「貸出」を触っているつもりなので、カードより先に見る。 */
    { sel: '[data-aid]', get: function(el){
        var id = el.getAttribute('data-aid'); return id ? { title:'代車の貸出', items: assignMenu(id, el) } : null; } },
    { sel: '[data-card-id]', get: function(el){
        var c = card(el.getAttribute('data-card-id')); return c ? { title: ttl(c), items: cardMenu(c) } : null; } },
    { sel: '[data-note-id]', get: function(el){
        var id = el.getAttribute('data-note-id'); return id ? { title:'付箋', items: noteMenu(id) } : null; } },
    { sel: 'tr.ct-clickrow', get: function(el){
        var id = idFromOnclick(el, 'custOpen');
        if (!id) return null;
        var cu = (window.state && state.customers || []).find(function(x){ return x.id === id; });
        return { title: (cu && cu.name) || '顧客', items: customerMenu(id) }; } },
    { sel: '.fl-row-click', get: function(el){
        var id = idFromOnclick(el, 'fleetOpenDetail');
        return id ? { title:'車両', items: vehicleMenu(id) } : null; } },
    { sel: '[data-drop="reserveDate"][data-drop-val]', get: function(el){
        var ds = el.getAttribute('data-drop-val'); return ds ? { title:'', items: dayMenu(ds) } : null; } },
    { sel: '.cfs-day[data-ds]', get: function(el){
        var ds = el.getAttribute('data-ds'); return ds ? { title:'', items: dayMenu(ds) } : null; } }
  ];
  function ttl(c){
    return ((window.pitSurname ? pitSurname(c.customer) : c.customer) || '（未入力）') + ' 様'
         + (c.car ? '　' + c.car : '');
  }

  function findTarget(from){
    for (var i = 0; i < TARGETS.length; i++){
      var el = from.closest ? from.closest(TARGETS[i].sel) : null;
      if (!el) continue;
      var got = null;
      try { got = TARGETS[i].get(el); } catch(e){ console.warn('[ctxmenu] 対象の読み取りに失敗', e); }
      if (got && got.items && got.items.length) return got;
    }
    return null;
  }

  /* ===== 描く ===== */
  function close(){
    var m = document.getElementById(MENU_ID);
    if (m) m.remove();
    _openSub = null;
  }
  function itemHtml(it, idx){
    if (it.sep)  return '<div class="pcx-sep"></div>';
    if (it.head) return '<div class="pcx-head">' + esc(it.head) + '</div>';
    var arrow = it.items ? '<span class="pcx-arrow">' + ico('chevRight', 14) + '</span>' : '';
    return '<button class="pcx-i' + (it.disabled ? ' is-off' : '') + (it.items ? ' has-sub' : '') + (it.danger ? ' danger' : '') + '"'
      + ' data-i="' + idx + '"' + (it.disabled ? ' disabled' : '') + '>'
      + '<span class="pcx-ic">' + (it.ic ? ico(it.ic, 16) : '') + '</span>'
      + '<span class="pcx-tx"><b>' + esc(it.label) + '</b>' + (it.sub ? '<span>' + esc(it.sub) + '</span>' : '') + '</span>'
      + arrow + '</button>';
  }
  function place(el, x, y){
    /* いったん出してから大きさを測って、画面からはみ出すなら内側へ寄せる */
    el.style.left = '0px'; el.style.top = '0px'; el.style.visibility = 'hidden';
    var r = el.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight, pad = 8;
    var L = (x + r.width + pad > vw) ? Math.max(pad, x - r.width) : x;
    var T = (y + r.height + pad > vh) ? Math.max(pad, vh - r.height - pad) : y;
    el.style.left = L + 'px'; el.style.top = T + 'px'; el.style.visibility = '';
  }

  function open(target, x, y){
    close();
    var wrap = document.createElement('div');
    wrap.id = MENU_ID;
    wrap.className = 'pcx';
    wrap.innerHTML = (target.title ? '<div class="pcx-title">' + esc(target.title) + '</div>' : '')
                   + target.items.map(itemHtml).join('');
    document.body.appendChild(wrap);
    place(wrap, x, y);

    wrap.addEventListener('click', function(e){
      var b = e.target.closest('.pcx-i'); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      var it = target.items[+b.dataset.i];
      if (!it || it.disabled) return;
      if (it.items) { openSub(b, it.items); return; }
      close();
      try { it.run(); } catch(err){ console.error('[ctxmenu] 実行でエラー', err); toast('うまくいきませんでした'); }
    });
    /* 子メニューはホバーでも開く（マウスで流れるように） */
    wrap.addEventListener('mouseover', function(e){
      var b = e.target.closest('.pcx-i'); if (!b) return;
      var it = target.items[+b.dataset.i];
      if (it && it.items) openSub(b, it.items); else killSub();
    });
  }

  function killSub(){
    var s = document.getElementById(MENU_ID + '-sub');
    if (s) s.remove();
    _openSub = null;
  }
  function openSub(anchor, items){
    if (_openSub === anchor) return;
    killSub();
    _openSub = anchor;
    var sub = document.createElement('div');
    sub.id = MENU_ID + '-sub';
    sub.className = 'pcx pcx-sub';
    sub.innerHTML = items.map(itemHtml).join('');
    document.body.appendChild(sub);
    var r = anchor.getBoundingClientRect();
    place(sub, r.right + 2, r.top - 4);
    sub.addEventListener('click', function(e){
      var b = e.target.closest('.pcx-i'); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      var it = items[+b.dataset.i];
      if (!it || it.disabled) return;
      close();
      try { it.run(); } catch(err){ console.error('[ctxmenu] 実行でエラー', err); toast('うまくいきませんでした'); }
    });
  }

  /* ===== つなぎこみ ===== */
  document.addEventListener('contextmenu', function(e){
    /* 🔴 Shift＋右クリック＝ブラウザ標準の逃げ道（ゆうた指定）。検証したい時に使う */
    if (e.shiftKey){ close(); return; }
    /* 入力中の文字を触っている時は邪魔しない（コピー・貼り付けを残す） */
    var t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')){ close(); return; }
    /* 文字を選んでいる時も標準のまま（コピーしたいはず） */
    var selText = '';
    try { selText = String(window.getSelection ? window.getSelection() : '').trim(); } catch(_){}
    if (selText){ close(); return; }

    var target = t && t.closest ? findTarget(t) : null;
    if (!target){ close(); return; }   /* 対象でなければ今までどおりブラウザ標準 */

    e.preventDefault();
    open(target, e.clientX, e.clientY);
  });

  document.addEventListener('mousedown', function(e){
    var m = document.getElementById(MENU_ID);
    if (!m) return;
    var s = document.getElementById(MENU_ID + '-sub');
    if (m.contains(e.target) || (s && s.contains(e.target))) return;
    close();
  });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') close(); });
  window.addEventListener('resize', close);
  window.addEventListener('blur', close);
  document.addEventListener('scroll', close, true);

  window.pitCtxClose = close;
  window.__pitCtxFind = findTarget;   /* テスト用 */
  console.log('[ctxmenu] ready（Shift＋右クリックでブラウザ標準）');
})();
