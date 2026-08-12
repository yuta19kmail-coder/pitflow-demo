/* ========================================
   work-content.js  -  作業内容テンプレート（症状ホイール＋チップ）／PitFlow v0.70.0
   ----------------------------------------
   新規予約カードの「内容」欄に、時計式の3段ホイール（部位→症状→補足）＋
   単独メモ系のフラットチップを出す。電話しながらクルクル回して内容を組み立て、
   「＋ 入れる」で c.menu（内容テキスト）に1行ずつ追記する。

   データは state.settings.workContent に保持し、設定画面（settings.js）から
   部位・症状・補足・対象部位（組み合わせ/除外）・各チップを自由に編集できる。

   公開：window.WorkContent = {
     builderHtml(), mount(),                       // 新規予約フォーム側
     addPhrase(), chip(btn),                        // フォーム内ボタンから
     settingsCardHtml(), mountSettings(),           // 設定画面側
     wc* （設定編集の各操作）
   }
   ======================================== */
(function () {
  'use strict';

  const IH = 40; // ホイール1行の高さ

  // 既定値（設定が空の時に自動シード。以後は設定画面で編集）
  const DEFAULT = {
    parts: ['エンジン', 'ミッション', 'ブレーキ', 'タイヤ', '足回り', 'エアコン', 'クラッチ', '電装', 'マフラー', 'ボディ/外装'],
    symptoms: [
      { name: '異音', parts: 'all', sub: ['ガタガタ', 'キー', 'ガラガラ', 'ガシャガシャ', 'カラカラ', 'ウィーン'] },
      { name: '漏れ', parts: 'all', sub: ['オイル', 'クーラント(水)', 'ATF', 'ブレーキフルード'] },
      { name: '振動', parts: 'all', sub: ['アイドリング中', '走行中', 'ブレーキ時'] },
      { name: '調子が悪い', parts: 'all', sub: [] },
      { name: '警告灯点灯', parts: ['エンジン', '電装', 'ブレーキ', 'エアコン'], sub: ['エンジン', 'ABS', 'エアバッグ', 'バッテリー', '油圧'] },
      { name: '冷風が出ない', parts: ['エアコン'], sub: ['全く出ない', 'たまに', 'ぬるい'] },
      { name: '効きが悪い', parts: ['ブレーキ', 'クラッチ'], sub: ['甘い', '奥まで踏む', '引きずり'] },
      { name: '滑る', parts: ['ミッション', 'クラッチ'], sub: [] },
      { name: 'すり減り/パンク', parts: ['タイヤ'], sub: ['溝なし', '片減り', 'パンク'] },
      { name: 'ガタつき', parts: ['足回り', 'タイヤ'], sub: [] },
      { name: '白煙/黒煙', parts: ['エンジン', 'マフラー'], sub: ['白煙', '黒煙'] },
      { name: '凹み/ヒビ/割れ/傷', parts: ['ボディ/外装'], sub: ['凹み', 'ヒビ', '割れ', '傷'] }
    ],
    /* ⚠ v1.15.1：見出し（label）は **設定として保存される文字**。ここにHTML（<i data-ic=…>）を書かないこと。
          書くと esc() を通って「タグが文字として」画面に出る（2026-08-02 の不具合）。
          印は絵文字で持ち、描く時に icoText() が線画アイコンへ読み替える。 */
    chipGroups: [
      { label: '🔧 作業・依頼', fill: false, items: ['点検', '車検も一緒に', 'テスター診断', '予防整備', 'トルコン太郎（ATF交換）', 'タイベル交換', 'コーティング', '板金'] },
      { label: '💬 来店・見積・連絡', fill: false, items: ['概算伝え済み', '点検料伝え済み', '他店見積あり', 'ディーラー見積あり', '現車見せに来店', 'ディーラー保証あり', '連絡は別の人へ'] },
      { label: '📦 部品 / 🚩 条件', fill: false, items: ['中古パーツ', 'リビルト品', '社外品', '持ち込み', 'もしかしたら無理かも', 'パーツ無いかも', '長期休み中の預かりOK', '直るなら依頼'] },
      { label: '⏳ 預かり期間', fill: false, items: ['当日仕上げ', '1week', '2week', '直り次第'] },
      { label: '🚗 車両情報（押すと「：」が入る→数値）', fill: true, items: ['車検満了日：', '年式：', '走行距離：', '購入時期：'] }
    ]
  };

  /* ---------- 🔴 v1.44.0 探し物は「いま開いているフォームの中」だけ ----------
     入庫カードのフォームは置き場所が2つある（全画面＝#md-body／ポップアップ＝#md-body-modal）。
     前に開いた方が残っていると **同じ id の欄が2つ**でき、`document.querySelector` は
     **先に見つかる＝前のカードの欄**を掴む。その結果「車検満了日：」等のチップが
     **別のカードの内容欄に入ってしまう**（2026-08-04 の不具合）。
     ⚠ card-detail.js 側で使わない入れ物は空にしているが、ここでも**必ず入れ物の中から探す**。
     ⚠ `_cardBodyId` は card-detail.js が持っている「いま描いている入れ物の id」。 */
  function hostEl() {
    var id = (typeof _cardBodyId !== 'undefined' && _cardBodyId) ? _cardBodyId : 'md-body';
    return document.getElementById(id) || document;
  }
  function q(sel)  { return hostEl().querySelector(sel); }
  function qa(sel) { return [].slice.call(hostEl().querySelectorAll(sel)); }
  /* id で探す時も入れ物の中から＝重複しても取り違えない */
  function byId(id) { return hostEl().querySelector('#' + id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* v1.15.1：保存されている見出しを描く時はこちら。esc したうえで、絵文字と
     （古い保存に混ざってしまった）<i data-ic=…> を線画アイコンに読み替える。
     ⚠ 属性の中（value="…"）には使わないこと＝SVGは入らない。そこは esc のまま。 */
  function escI(s) { return window.icoText ? icoText(s) : esc(s); }
  function cfg() {
    if (!state.settings) state.settings = {};
    const wc = state.settings.workContent;
    if (!wc || !Array.isArray(wc.parts) || !Array.isArray(wc.symptoms) || !Array.isArray(wc.chipGroups)) {
      state.settings.workContent = JSON.parse(JSON.stringify(DEFAULT));
    }
    return state.settings.workContent;
  }
  function save() { try { if (window.PitDB) PitDB.save(); } catch (e) {} }

  // 内容テキストエリア（c.menu）へ1行追記
  function appendMenu(t) {
    const ta = q('textarea.cf-input[data-key="menu"]');
    if (!ta) return;
    const cur = (ta.value || '').replace(/\n+$/, '');
    ta.value = cur ? (cur + '\n' + t) : t;
    ta.dispatchEvent(new Event('input', { bubbles: true })); // 既存の自動保存を発火
    ta.focus();
  }

  // v0.88.0 タグチップのトグル用：内容(c.menu)テキストエリアの行操作
  function _menuTA(){ return q('textarea.cf-input[data-key="menu"]'); }
  function _menuHasLine(t){ var ta=_menuTA(); if(!ta) return false; return (ta.value||'').split('\n').some(function(l){ return l.trim()===t; }); }
  function removeMenuLine(t){
    var ta=_menuTA(); if(!ta) return;
    var removed=false;
    var out=(ta.value||'').split('\n').filter(function(l){ if(!removed && l.trim()===t){ removed=true; return false; } return true; });
    ta.value=out.join('\n').replace(/\n+$/,'');
    ta.dispatchEvent(new Event('input',{bubbles:true}));
  }
  // タグチップ（fillでないもの）の押下状態を、いま内容に入っているかで同期（再描画後も保つ）
  function syncChips(){
    var ta=_menuTA(); if(!ta) return;
    var lines=(ta.value||'').split('\n').map(function(l){ return l.trim(); });
    qa('.wc-chip[data-fill="0"]').forEach(function(b){
      b.classList.toggle('wc-on', lines.indexOf(b.textContent.trim())>=0);
    });
  }

  // =========================================
  // 新規予約フォーム側：ビルダー
  // =========================================
  function builderHtml() {
    const c = cfg();
    let h = '<div class="wc-tpl">';
    // v0.90.0 内容テンプレ＝ボタンクリックで右カラムに大きく開く（クリックで開閉・固定）。3列一覧（部位→症状→補足）。
    h += '<div class="wc-trigrow"><button type="button" class="wc-trigger" onclick="WorkContent.togglePanel(this)"><i data-ic=briefcase data-ics=16></i> 内容テンプレを選ぶ<span class="wc-arr">クリックで右に開く <i data-ic=chevRight data-ics=15></i></span></button></div>';
    h += '<div class="wc-panel" id="wc-panel">';
    h += '<div class="wc-panel-h"><span><i data-ic=briefcase data-ics=16></i> 内容テンプレ（部位 → 症状 → 補足）</span><button type="button" class="wc-x" onclick="WorkContent.closePanel()" title="閉じる"><i data-ic=close data-ics=16></i></button></div>';
    h += '<div class="wc-cols">'
       + '<div class="wc-listcol"><div class="wc-lh">部位</div><div class="wc-list" id="wc-c1"></div></div>'
       + '<div class="wc-listcol"><div class="wc-lh">症状</div><div class="wc-list" id="wc-c2"></div></div>'
       + '<div class="wc-listcol"><div class="wc-lh">補足</div><div class="wc-list" id="wc-c3"></div></div>'
       + '</div>';
    h += '<div class="wc-foot"><div class="wc-prev2" id="wc-prev2">症状を選んでください</div>'
       + '<button type="button" class="wc-ins" id="wc-ins" onclick="WorkContent.insert()" disabled>挿入する</button></div>';
    h += '</div>';
    // タグチップ群（従来どおりインライン・内容欄の下に続く）
    c.chipGroups.forEach(function (g) {
      h += '<div class="wc-flat-h">' + escI(g.label) + '</div><div class="wc-chips">';
      g.items.forEach(function (it) {
        h += '<button type="button" class="wc-chip' + (g.fill ? ' fill' : '') + '" data-fill="' + (g.fill ? 1 : 0) + '" onclick="WorkContent.chip(this)">' + esc(it) + '</button>';
      });
      h += '</div>';
    });
    h += '</div>';
    return h;
  }

  // ===== v0.89.0 テンプレ3列一覧（部位/症状/補足）＝クリックで選択（緑アクティブ）→挿入 =====
  var _selP = '', _selS = '', _selSub = '';
  function symsFor(part) { return cfg().symptoms.filter(function (s) { return s.parts === 'all' || (Array.isArray(s.parts) && s.parts.indexOf(part) >= 0); }); }
  function subsOf(sname) { var s = cfg().symptoms.find(function (x) { return x.name === sname; }); return (s && s.sub) ? s.sub : []; }
  function _qq(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  function _li(text, on, onclick, dim) { return '<div class="wc-li' + (on ? ' on' : '') + (dim ? ' dim' : '') + '"' + (onclick ? ' onclick="' + onclick + '"' : '') + '>' + esc(text) + '</div>'; }
  function _renderC1() { var el = byId('wc-c1'); if (!el) return; el.innerHTML = cfg().parts.map(function (p) { return _li(p, p === _selP, "WorkContent.pickPart('" + _qq(p) + "')"); }).join(''); }
  function _renderC2() { var el = byId('wc-c2'); if (!el) return; var list = _selP ? symsFor(_selP) : cfg().symptoms; el.innerHTML = list.map(function (s) { return _li(s.name, s.name === _selS, "WorkContent.pickSym('" + _qq(s.name) + "')"); }).join(''); }
  function _renderC3() { var el = byId('wc-c3'); if (!el) return; var subs = _selS ? subsOf(_selS) : []; if (!subs.length) { el.innerHTML = _li(_selS ? '（補足なし）' : '症状を選ぶと出ます', false, '', true); return; } el.innerHTML = subs.map(function (x) { return _li(x, x === _selSub, "WorkContent.pickSub('" + _qq(x) + "')"); }).join(''); }
  function _phrase() { if (!_selS) return ''; return (_selP ? _selP + ' ' : '') + _selS + (_selSub ? '（' + _selSub + '）' : ''); }
  function _updPrev2() { var el = byId('wc-prev2'); var ins = byId('wc-ins'); var p = _phrase(); if (el) el.innerHTML = p ? ('追加：<b>' + esc(p) + '</b>') : '症状を選んでください'; if (ins) ins.disabled = !p; }
  function renderTpl() { _renderC1(); _renderC2(); _renderC3(); _updPrev2(); }

  function mount(root) {
    if (!byId('wc-c1')) return; // 内容セクションが無い画面では何もしない
    _selP = ''; _selS = ''; _selSub = '';
    renderTpl();
    syncChips();   // v0.88.0 既に内容に入っているタグは「押した見た目」で開く
  }
  window.WorkContent = window.WorkContent || {};
  window.WorkContent.builderHtml = builderHtml;
  window.WorkContent.mount = mount;
  window.WorkContent.pickPart = function (p) { _selP = (_selP === p) ? '' : p; if (_selP && !symsFor(_selP).some(function (s) { return s.name === _selS; })) { _selS = ''; _selSub = ''; } renderTpl(); };
  window.WorkContent.pickSym = function (s) { _selS = (_selS === s) ? '' : s; _selSub = ''; _renderC2(); _renderC3(); _updPrev2(); };
  window.WorkContent.pickSub = function (x) { _selSub = (_selSub === x) ? '' : x; _renderC3(); _updPrev2(); };
  window.WorkContent.insert = function () { var p = _phrase(); if (!p) return; appendMenu(p); _selS = ''; _selSub = ''; _renderC2(); _renderC3(); _updPrev2(); };

  // v0.90.0 パネル開閉（クリックで固定）。開いた時は右カラム(.cfp-side)にぴったり重ねて「右カラムに大きく表示」されているように見せる。
  // v0.97.2 パネルは「トリガーボタンの上下中央」に合わせて配置し、左カラム(.cfp-main)スクロールに追従する。
  function _placePanel(p){
    var btn = q('.wc-trigger');
    var br  = btn ? btn.getBoundingClientRect() : null;
    var side = q('.cfp-side');
    var clamp = function(top, hh){ return Math.max(8, Math.min(top, window.innerHeight - hh - 8)); };
    if (side){
      var r = side.getBoundingClientRect();
      var hh = Math.round(r.height * 0.5);   // 大きさ（高さ約50%）は据え置き
      var top = br ? (br.top + br.height / 2 - hh / 2) : (r.top + (r.height - hh) / 2);
      p.style.right = ''; p.style.bottom = '';
      p.style.left = r.left + 'px'; p.style.top = clamp(top, hh) + 'px'; p.style.width = r.width + 'px'; p.style.height = hh + 'px';
    } else {
      // 右カラムが無い画面（既存カードのモーダル等）＝ボタンの高さ中央・画面右に出すフォールバック
      var hh2 = Math.round(window.innerHeight * 0.5);
      var top2 = br ? (br.top + br.height / 2 - hh2 / 2) : (window.innerHeight * 0.25);
      p.style.left = ''; p.style.bottom = ''; p.style.right = '24px'; p.style.top = clamp(top2, hh2) + 'px'; p.style.width = 'min(420px, 92vw)'; p.style.height = hh2 + 'px';
    }
  }
  // 左カラムスクロール／リサイズでパネル位置を追従させる（開いている間だけ）
  var _wcReposition = null;
  var _wcScroller  = null;   /* ⚠ 掴んだ相手を覚えておく＝別のフォームを開いた後でも確実に外せる */
  function _bindReposition(p){
    _unbindReposition();
    _wcReposition = function(){ if (p.classList.contains('open')) _placePanel(p); else _unbindReposition(); };
    _wcScroller = q('.cfp-main');
    if (_wcScroller) _wcScroller.addEventListener('scroll', _wcReposition, { passive: true });
    window.addEventListener('resize', _wcReposition);
    window.addEventListener('scroll', _wcReposition, { passive: true });
  }
  function _unbindReposition(){
    if (!_wcReposition) return;
    if (_wcScroller) _wcScroller.removeEventListener('scroll', _wcReposition);
    window.removeEventListener('resize', _wcReposition);
    window.removeEventListener('scroll', _wcReposition);
    _wcReposition = null; _wcScroller = null;
  }
  window.WorkContent.togglePanel = function (btn) {
    var p = byId('wc-panel'); if (!p) return;
    if (p.classList.contains('open')) { p.classList.remove('open'); if (btn) btn.classList.remove('on'); _unbindReposition(); return; }
    p.style.right = ''; _placePanel(p);
    p.classList.add('open');
    if (btn) btn.classList.add('on');
    _bindReposition(p);
    renderTpl();
  };
  window.WorkContent.closePanel = function () {
    var p = byId('wc-panel'); if (p) p.classList.remove('open');
    var b = q('.wc-trigger'); if (b) b.classList.remove('on');
    _unbindReposition();
  };
  // v0.88.0 タグチップ＝トグル。押すと内容に入り「押した見た目(wc-on)」に／もう一度押すと内容から消えて戻る。
  //   ※「車検満了日：」等の fill チップは後から値を打つので従来どおり挿入のみ。
  window.WorkContent.chip = function (btn) {
    if (!btn) return;
    var t = btn.textContent.trim();
    if (btn.dataset.fill === '1'){ appendMenu(t); return; }
    if (_menuHasLine(t)){ removeMenuLine(t); btn.classList.remove('wc-on'); }
    else { appendMenu(t); btn.classList.add('wc-on'); }
  };
  window.WorkContent.syncChips = syncChips;

  // =========================================
  // 設定画面側：編集UI
  // =========================================
  function settingsCardHtml() {
    return '<div class="ps-card"><div class="ps-h"><i data-ic=briefcase data-ics=16></i> 作業内容テンプレート（症状ホイール）</div>'
      + '<div class="ps-desc">新規予約の「内容」で使う <b>部位・症状・補足</b>（時計式ホイール）と <b>各チップ</b> を編集します。症状は「対象部位」を限定でき、変な組み合わせ（例：エンジンに冷風が出ない）を自動で出さなくできます。<br><b>カプセルはつまんで動かすと並び替えできます</b>（よく使うものを前へ）。並びはそのまま新規予約の画面に出ます。</div>'
      + '<div id="wc-settings"></div></div>';
  }
  function inp(val, ph, oninput, cls, w) {
    return '<input class="wc-i ' + (cls || '') + '" ' + (w ? 'style="width:' + w + '" ' : '') + 'value="' + esc(val) + '" placeholder="' + esc(ph || '') + '" ' + oninput + '>';
  }
  function renderEditor() {
    const box = document.getElementById('wc-settings'); if (!box) return;
    const c = cfg();
    let h = '';

    // 部位
    h += '<div class="wc-s-h"><i data-ic=wrench data-ics=16></i> 部位<button class="wc-s-add" onclick="WorkContent.wcAddPart()">＋ 追加</button></div>';
    h += '<div class="wc-s-chips" data-wc-grp="parts">';
    c.parts.forEach(function (p, i) {
      h += '<span class="wc-s-chip" data-wc-i="' + i + '" title="つまんで動かすと並び替えできます">' + esc(p) + '<button onclick="WorkContent.wcDelPart(' + i + ')"><i data-ic=close data-ics=16></i></button></span>';
    });
    h += '</div>';

    // 症状
    h += '<div class="wc-s-h" style="margin-top:14px"><i data-ic=warn data-ics=16></i> 症状（対象部位・補足）<button class="wc-s-add" onclick="WorkContent.wcAddSym()">＋ 追加</button></div>';
    h += '<div class="wc-s-syms">';
    c.symptoms.forEach(function (s, i) {
      const all = (s.parts === 'all');
      h += '<div class="wc-s-sym">';
      h += '<div class="wc-s-row">' + inp(s.name, '症状名', 'onchange="WorkContent.wcSymName(' + i + ',this.value)"', 'name', '8em');
      h += '<select class="wc-i" onchange="WorkContent.wcSymScope(' + i + ',this.value)"><option value="all"' + (all ? ' selected' : '') + '>全部位</option><option value="some"' + (all ? '' : ' selected') + '>限定</option></select>';
      if (!all) h += inp((s.parts || []).join('、'), '対象部位（、区切り）', 'onchange="WorkContent.wcSymParts(' + i + ',this.value)"', 'parts', '14em');
      h += '<button class="wc-s-del" onclick="WorkContent.wcDelSym(' + i + ')"><i data-ic=close data-ics=16></i> 削除</button></div>';
      h += '<div class="wc-s-row"><span class="wc-s-lab">補足</span>' + inp((s.sub || []).join('、'), '補足（、区切り・任意）', 'onchange="WorkContent.wcSymSub(' + i + ',this.value)"', 'sub', '100%') + '</div>';
      h += '</div>';
    });
    h += '</div>';

    // チップ群
    c.chipGroups.forEach(function (g, gi) {
      h += '<div class="wc-s-h" style="margin-top:14px">' + escI(g.label) + '<button class="wc-s-add" onclick="WorkContent.wcAddChip(' + gi + ')">＋ 追加</button></div>';
      h += '<div class="wc-s-chips" data-wc-grp="chip:' + gi + '">';
      g.items.forEach(function (it, ii) {
        h += '<span class="wc-s-chip" data-wc-i="' + ii + '" title="つまんで動かすと並び替えできます">' + esc(it) + '<button onclick="WorkContent.wcDelChip(' + gi + ',' + ii + ')"><i data-ic=close data-ics=16></i></button></span>';
      });
      h += '</div>';
    });

    box.innerHTML = h;
  }
  function mountSettings() {
    renderEditor();
    var box = document.getElementById('wc-settings');
    /* 配線は1回だけ。renderEditor は中身を作り直すので、入れ物側で受ける（各カプセルには付けない）。 */
    if (box && !box._wcSortBound) { box._wcSortBound = 1; box.addEventListener('pointerdown', _wcDown); }
  }

  /* ===== 🔀 v1.30.0（ゆうた指定）カプセルの並び替え =====
     部位・各チップのカプセルを、つまんで動かすと並べ替えられる。並びはそのまま新規予約の画面に出る。
     🔴 HTML5のドラッグではなく **pointer イベント**で作る＝PCもタブレットも同じ動き（dnd.js のカードとは別物）。
     ⚠ ×（削除）の上から始めた時は並び替えにしない＝消したいのに動くと困る。
     ⚠ 4px 動かすまでは始めない＝軽く触っただけで並びが変わらない。
     ⚠ **同じグループの中だけ**で動く（部位を「作業・依頼」の列へは移せない）。
     ⚠ 動かしている間はDOMを入れ替えて見せ、離した時に**その並びを設定へ書き戻す**。 */
  var _wcDrag = null;
  function _wcDown(e){
    if (e.button != null && e.button !== 0) return;                 /* 右クリック等は無視 */
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('button')) return;                                /* ×は削除のまま */
    var el = t.closest('.wc-s-chip');
    if (!el) return;
    var row = el.parentElement;
    if (!row || !row.getAttribute('data-wc-grp')) return;
    _wcDrag = { el: el, row: row, x: e.clientX, y: e.clientY, on: false };
    window.addEventListener('pointermove', _wcMove);
    window.addEventListener('pointerup', _wcUp);
    window.addEventListener('pointercancel', _wcUp);
  }
  function _wcAt(row, x, y){
    var hit = null;
    Array.prototype.forEach.call(row.querySelectorAll('.wc-s-chip'), function (el){
      var r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) hit = el;
    });
    return hit;
  }
  function _wcMove(e){
    var d = _wcDrag; if (!d) return;
    if (!d.on){
      if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 4) return;
      d.on = true;
      d.el.classList.add('wc-s-drag');
      document.body.classList.add('wc-s-dragging');
    }
    if (e.cancelable) e.preventDefault();                           /* 画面のスクロールに持っていかれないように */
    var over = _wcAt(d.row, e.clientX, e.clientY);
    if (!over || over === d.el) return;
    /* いま掴んでいるものより後ろにあるものへ重ねたら「その後ろ」へ、前なら「その前」へ */
    var after = !!(d.el.compareDocumentPosition(over) & Node.DOCUMENT_POSITION_FOLLOWING);
    d.row.insertBefore(d.el, after ? over.nextSibling : over);
  }
  function _wcUp(){
    var d = _wcDrag; _wcDrag = null;
    window.removeEventListener('pointermove', _wcMove);
    window.removeEventListener('pointerup', _wcUp);
    window.removeEventListener('pointercancel', _wcUp);
    if (!d) return;
    d.el.classList.remove('wc-s-drag');
    document.body.classList.remove('wc-s-dragging');
    if (!d.on) return;                                              /* 動かしていない＝ただのタップ */
    _wcCommit(d.row);
  }
  /* 画面の並び（data-wc-i＝もとの番号）を、そのまま設定の配列に写す。 */
  function _wcCommit(row){
    var grp = row.getAttribute('data-wc-grp') || '';
    var order = Array.prototype.map.call(row.querySelectorAll('.wc-s-chip'), function (el){ return +el.getAttribute('data-wc-i'); });
    var c = cfg();
    var pick = function (arr){
      var out = order.map(function (i){ return arr[i]; }).filter(function (x){ return x !== undefined; });
      return (out.length === arr.length) ? out : arr;                /* 数が合わない時は触らない（安全側） */
    };
    if (grp === 'parts') c.parts = pick(c.parts);
    else if (grp.indexOf('chip:') === 0){
      var gi = +grp.slice(5);
      if (!c.chipGroups[gi]) return;
      c.chipGroups[gi].items = pick(c.chipGroups[gi].items);
    } else return;
    save();
    renderEditor();
    if (window.pitToast) pitToast('並び順を保存しました');
  }
  /* テスト用に外へ出す（画面からは使わない） */
  window.WorkContent._wcCommit = _wcCommit;

  // ---- 編集操作（すべて cfg() を書き換え→保存→再描画）----
  const W = window.WorkContent;
  W.settingsCardHtml = settingsCardHtml;
  W.mountSettings = mountSettings;
  /* 🔵 v1.75.0 ブラウザ純正の prompt / confirm をやめてアプリ内ダイアログ（pitAskText / pitAsk）に。 */
  W.wcAddPart = function () { pitAskText('追加する部位名は？', '', { ok:'追加' }).then(function (v) { v = (v || '').trim(); if (!v) return; cfg().parts.push(v); save(); renderEditor(); }); };
  W.wcDelPart = function (i) { cfg().parts.splice(i, 1); save(); renderEditor(); };
  W.wcAddSym = function () { pitAskText('追加する症状名は？', '', { ok:'追加' }).then(function (v) { v = (v || '').trim(); if (!v) return; cfg().symptoms.push({ name: v, parts: 'all', sub: [] }); save(); renderEditor(); }); };
  W.wcDelSym = function (i) { const s = cfg().symptoms[i]; pitAsk('症状「' + (s ? s.name : '') + '」を削除しますか？', { danger:true, ok:'削除する' }).then(function (yes) { if (!yes) return; cfg().symptoms.splice(i, 1); save(); renderEditor(); }); };
  W.wcSymName = function (i, v) { v = (v || '').trim(); if (v) { cfg().symptoms[i].name = v; save(); } };
  W.wcSymScope = function (i, v) { cfg().symptoms[i].parts = (v === 'all') ? 'all' : []; save(); renderEditor(); };
  W.wcSymParts = function (i, v) { cfg().symptoms[i].parts = String(v || '').split(/[、,]/).map(function (x) { return x.trim(); }).filter(Boolean); save(); };
  W.wcSymSub = function (i, v) { cfg().symptoms[i].sub = String(v || '').split(/[、,]/).map(function (x) { return x.trim(); }).filter(Boolean); save(); };
  W.wcAddChip = function (gi) { pitAskText('追加するチップの文言は？', '', { ok:'追加' }).then(function (v) { v = (v || '').trim(); if (!v) return; cfg().chipGroups[gi].items.push(v); save(); renderEditor(); }); };
  W.wcDelChip = function (gi, ii) { cfg().chipGroups[gi].items.splice(ii, 1); save(); renderEditor(); };

  console.log('[work-content] ready');
})();
