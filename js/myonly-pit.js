/* ========================================
   myonly-pit.js  -  タスクボード「担当車両」スイッチ  PitFlow v1.48.0
   ----------------------------------------
   ◎なにをするもの（ゆうた指定）
     タスクボード（1課／2課）で、**自分が担当のカードだけを残して、ほかを一時的に隠す**スイッチ。
     ・区切りラインのボタンの**左**に置く。
     ・もう一度押すと解除。**別のビューへ移った時点でも解除**（持ち越さない）。
     ・**メンバー画面で「フロント」にチェックが入っている人にだけ**ボタンを出す。
     ・🔴 **v1.48.0：課をまたいで集める。** 押した盤に、**もう一方の課にある自分の担当も
       同じ工程の列へ**並べる（1課で押しても2課で押しても、自分の車が1枚の盤に全部そろう）。
       よその課から来たカードには **「国産」「輸入」の印**が付く（左の色帯も国産＝緑／輸入＝桃のまま）。

   ◎「自分」と「担当」
     ・自分 … ログインした時に `localStorage['pitflow_bn_me']` へ入っているメンバーID（auth-pit.js が入れる）。
              入っていなければ `fb.currentMember` から引く。付箋の「自分」と同じ考え方。
     ・担当 … カードの**フロント担当**（`frontStaff` / `frontStaffId`）。
              🔴 このスイッチはフロントの人向けなので、整備担当（メカ）では絞らない。
              ⚠ 名前は改名されることがあるので、**IDが入っていればID優先**。無ければ名前・別名で見る。

   ◎作りの決めごと
     🔴 **一時的な表示の切り替えだけ＝データは1バイトも触らない。** 保存もしない。
     ⚠ 覚えておく場所は画面の中（メモリ）だけ。**再読み込みでも解除**される。
     ⚠ 差し込み口は task.js の1行（`PitMyOnly.pass(c)` での絞り込み）と index.html のボタンだけ。
   ======================================== */
(function (w, d) {
  'use strict';

  var ME_KEY = 'pitflow_bn_me';
  var _on = false;

  /* ---------- 自分 ---------- */
  function me(){
    var staff = (w.state && state.staff) || [];
    var id = null;
    try { id = localStorage.getItem(ME_KEY); } catch(e){}
    if (!id){
      try { id = (w.fb && w.fb.currentMember && w.fb.currentMember.id) || null; } catch(e){}
    }
    if (!id) return null;
    return staff.find(function(s){ return s && s.id === id; }) || null;
  }
  /* ボタンを出してよい人か＝フロントにチェックが入っている人だけ */
  function allowed(){
    var m = me();
    return !!(m && m.front);
  }

  /* ---------- 絞り込み ---------- */
  /* task.js から呼ぶ。true＝出す／false＝隠す。
     ⚠ スイッチが切れている時・自分が分からない時は**必ず true**＝いつもどおり全部出す。 */
  function pass(c){
    if (!_on) return true;
    var m = me();
    if (!m || !c) return true;
    if (c.frontStaffId) return c.frontStaffId === m.id;
    var nm = String(c.frontStaff || c.staff || '').trim();
    if (!nm) return false;                       /* 担当が入っていないカードは自分のではない */
    if (nm === m.name) return true;
    var al = m.aliases || [];
    for (var i = 0; i < al.length; i++){ if (nm === al[i]) return true; }
    if (m.realName && nm === m.realName) return true;
    return false;
  }

  /* ---------- 🔴 v1.48.0 課をまたいで集める（ゆうた指定） ----------
     ONの時は「いま見ているボードのカード」ではなく「**1課・2課ぜんぶから自分の担当**」を集めて、
     **同じ工程の列**に並べる（列のIDは1課も2課も同じ＝点検待ち/見積り中/…）。
     ＝1課の盤で押しても2課の盤で押しても、**自分の車が全部1枚の盤に集まる**。
     ⚠ OFFの時は今までどおり「そのボードのカードだけ」＝1バイトも変えない。
     ⚠ 集めるのは **state.boards にある盤（＝課の盤）だけ**。よそのカードは混ぜない。
     ⚠ **データは触らない**＝カードの boardId はそのまま。だから
        別の課のカードを掴んで動かしても、**工程が変わるだけで課は変わらない**（dnd.js は status しか触らない）。 */
  function courseBoardIds(){
    return ((w.state && state.boards) || []).map(function(b){ return b && b.id; }).filter(Boolean);
  }
  function colCards(board, col){
    var all = (w.state && state.cards) || [];
    var here = all.filter(function(c){ return c && c.status === col.id && !c.returnStage; });
    if (!_on) return here.filter(function(c){ return c.boardId === board.id; });
    var m = me();
    if (!m) return here.filter(function(c){ return c.boardId === board.id; });   /* 自分が分からない時はいつもどおり */
    var ids = courseBoardIds();
    return here.filter(function(c){ return ids.indexOf(c.boardId) >= 0 && pass(c); });
  }
  /* 別の課から来たカードに印を付ける（見た目だけ）。
     ⚠ HTML の**組み立て直しはしない**＝根っこの class に足すだけ。中の作りを知らずに済む。
        印そのものは CSS の ::after が `data-xboard` の文字を出す。 */
  /* 🔴 v1.48.1（ゆうた指定）印は「1課／2課」ではなく **「国産／輸入」**。
     ⚠ 課の番号より**車の種類の方が現場の言葉**なので、そちらに合わせる。
     ⚠ 名前を変えたら **css/polish.css の `[data-xboard="…"]` の色分けも合わせること**（片方だけだと色が付かない）。 */
  var COURSE = { 'default': '国産', 'import': '輸入' };
  function boardLabel(id){
    if (COURSE[id]) return COURSE[id];
    var b = ((w.state && state.boards) || []).find(function(x){ return x && x.id === id; });
    return (b && b.name) || '';
  }
  function decorate(c, board, html){
    if (!_on || !c || !board || c.boardId === board.id) return html;
    var lb = boardLabel(c.boardId);
    if (!lb) return html;
    return String(html).replace('<div class="pit-card pcm',
      '<div data-xboard="' + lb + '" class="pit-card pcm kb-xboard');
  }

  /* ---------- 🔴 v1.69.0 列の中身の組み立て（ゆうた指定） ----------
     「担当車両」がONの時、列はこう並ぶ。

       ┌ 自分の課のカード（区切りラインは**元の位置のまま**）
       │   … 隠れたカードはバーの上下から消えるだけ。バーは動かない
       ├ ── 2課分 ────────────   ← このバー
       └ よその課から来たカード

     ⚠ 「◯課分」のバーは**見た目だけ**。保存しない・動かせない・消せない。
        全員で共有している本物の区切りライン（board-line.js）と混ぜないこと。
        だから `data-lineid` を持たせない＝ドラッグの対象にならない。
     ⚠ よその課が3つ以上に増えても、課ごとに1本ずつバーが付く。 */
  var COURSE_NO = { 'default': '1課', 'import': '2課' };
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function courseName(id){
    if (COURSE_NO[id]) return COURSE_NO[id];
    var b = ((w.state && state.boards) || []).find(function(x){ return x && x.id === id; });
    return (b && b.name) || '';
  }
  function groupBar(text){
    return '<div class="kb-line kb-line-xb" title="ここから下は、よその課から集めてきたあなたの担当です">'
         + '<span class="kb-line-bar"></span>'
         + '<span class="kb-line-t">' + esc(text) + '</span>'
         + '<span class="kb-line-bar"></span></div>';
  }
  /* task.js から呼ぶ。
     cards  … いま出すカード（絞り込み済み・順番どおり）
     allOwn … **絞り込む前**の、この盤・この列のカード（バーの位置を決めるのに使う）
     cardFn … カード1枚のHTML */
  function colBody(board, col, cards, allOwn, cardFn){
    var own = [], others = [], order = [], byBoard = {};
    (cards || []).forEach(function(c){
      if (!c) return;
      if (!_on || c.boardId === board.id){ own.push(c); return; }
      if (!byBoard[c.boardId]){ byBoard[c.boardId] = []; order.push(c.boardId); }
      byBoard[c.boardId].push(c);
      others.push(c);
    });

    var out = w.PitBoardLine
      ? PitBoardLine.renderColumn(board.id, col.id, own, cardFn, allOwn)
      : own.map(cardFn).join('');

    if (!others.length) return out;
    order.forEach(function(bid){
      var nm = courseName(bid);
      out += groupBar(nm ? nm + '分' : 'よその課分');
      out += byBoard[bid].map(cardFn).join('');
    });
    return out;
  }

  /* ---------- スイッチ ---------- */
  function rerender(){
    try {
      if (w._rerenderActiveBoard) return _rerenderActiveBoard();
      if (w.state && state.currentView && w.showView) showView(state.currentView);
    } catch(e){}
  }
  function paintButtons(){
    var show = allowed();
    Array.prototype.forEach.call(d.querySelectorAll('.kb-myonly'), function(el){
      el.style.display = show ? '' : 'none';
      el.classList.toggle('on', _on);
      var m = me();
      el.title = _on
        ? 'いま自分（' + ((m && m.name) || '') + '）の担当だけ出しています。1課・2課の両方から集めています。もう一度押すと全部出ます'
        : '自分の担当のカードだけを出す（1課・2課をまたいで集めます／別のビューへ移ると解除されます）';
    });
  }
  function setOn(v){
    v = !!v;
    if (_on === v) { paintButtons(); return; }
    _on = v;
    paintButtons();
    rerender();
    if (w.pitToast){
      var m = me();
      pitToast(_on ? ((m && m.name ? m.name + 'さん' : '自分') + 'の担当を 1課・2課からまとめて出しています') : '全部のカードを出しました');
    }
  }
  w.pitMyOnlyToggle = function(){
    if (!allowed()) return;
    setOn(!_on);
  };

  /* 🔴 別のビューへ移ったら解除（持ち越さない）。
     ⚠ showView を包むだけ＝views.js は触っていない。 */
  var _orig = w.showView;
  if (typeof _orig === 'function'){
    w.showView = function(v){
      if (_on && v !== 'course1' && v !== 'course2' && v !== 'task'){
        _on = false;          /* ここでは描き直さない＝これから描く画面に任せる */
        paintButtons();
      }
      var r = _orig.apply(this, arguments);
      /* 画面を描いたあとにボタンの出し入れを合わせる＝入った瞬間から正しく出る
         （名簿があとから届く場合の保険は下の定期チェック） */
      try { paintButtons(); } catch(e){}
      return r;
    };
  }

  /* 名簿が届いた後・画面を描いた後にボタンの出し入れを合わせる */
  d.addEventListener('DOMContentLoaded', paintButtons);
  w.addEventListener('load', paintButtons);
  w.setInterval(paintButtons, 2000);   /* 名簿はあとから届く（購読）。軽い処理なので定期で合わせる */

  w.PitMyOnly = { pass: pass, me: me, allowed: allowed, isOn: function(){ return _on; },
                  set: setOn, refresh: paintButtons,
                  colCards: colCards, decorate: decorate, boardLabel: boardLabel,
                  colBody: colBody, courseName: courseName };
  console.log('[myonly-pit] ready（タスクボードの「担当車両」スイッチ）');
})(window, document);
