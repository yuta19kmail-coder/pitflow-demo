/* ========================================
   myonly-pit.js  -  タスクボードの「担当車両」／「メンバー」スイッチ  PitFlow v1.48.0 →（v1.140.0 メンバー追加）
   ----------------------------------------
   ◎なにをするもの（ゆうた指定）
     タスクボード（1課／2課）で、**担当のカードだけを残して、ほかを一時的に隠す**スイッチ。

       ・**担当車両** … **自分**の担当だけ（v1.48.0）
       ・**メンバー**  … **選んだ1人**の担当だけ（🔴 v1.140.0 追加・ゆうた指定
                        「自分以外のメンバー（個人個人）だけでソートする機能も搭載する。
                          ボタンは担当車両とは分ける」）

     ・区切りラインのボタンの**左**に置く。
     ・もう一度押すと解除。**別のビューへ移った時点でも解除**（持ち越さない）。
     ・**担当車両**は、メンバー画面で「フロント」にチェックが入っている人にだけ出る。
       **メンバー**は誰にでも出る（他の人の受け持ちを見るためのもの）。
     ・🔴 **v1.140.0 担当車両とメンバーは同時に効かない。**（ゆうた 2026-08-18「同時に効かせたい場面はない」）
       片方を選ぶともう片方は外れる＝**いま誰で絞っているかが1つに決まる**。
     ・🔴 **v1.48.0：課をまたいで集める。** 押した盤に、**もう一方の課にあるその人の担当も
       同じ工程の列へ**並べる（1課で押しても2課で押しても、その人の車が1枚の盤に全部そろう）。
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
     ⚠ 差し込み口は task.js（`PitMyOnly.colCards` / `colBody` / `decorate`）と index.html のボタンだけ。
   ======================================== */
(function (w, d) {
  'use strict';

  var ME_KEY = 'pitflow_bn_me';
  var _on = false;        /* 担当車両（自分） */
  var _memId = '';        /* メンバー（選んだ1人）。空＝off */

  /* ---------- 名簿 ---------- */
  function staffList(){ return (w.state && state.staff) || []; }
  function byId(id){ return staffList().find(function(s){ return s && s.id === id; }) || null; }

  /* ---------- 自分 ---------- */
  function me(){
    var id = null;
    try { id = localStorage.getItem(ME_KEY); } catch(e){}
    if (!id){
      try { id = (w.fb && w.fb.currentMember && w.fb.currentMember.id) || null; } catch(e){}
    }
    if (!id) return null;
    return byId(id);
  }
  /* 「担当車両」ボタンを出してよい人か＝フロントにチェックが入っている人だけ */
  function allowed(){
    var m = me();
    return !!(m && m.front);
  }
  /* ---------- いま誰で絞っているか（1人だけ） ---------- */
  function active(){ return _on || !!_memId; }
  function target(){
    if (_memId) return byId(_memId);
    if (_on) return me();
    return null;
  }

  /* ---------- 絞り込み ---------- */
  /* true＝出す／false＝隠す。
     ⚠ スイッチが切れている時・相手が分からない時は**必ず true**＝いつもどおり全部出す。 */
  function passFor(c, m){
    if (!m || !c) return true;
    if (c.frontStaffId) return c.frontStaffId === m.id;
    var nm = String(c.frontStaff || c.staff || '').trim();
    if (!nm) return false;                       /* 担当が入っていないカードはその人のではない */
    if (nm === m.name) return true;
    var al = m.aliases || [];
    for (var i = 0; i < al.length; i++){ if (nm === al[i]) return true; }
    if (m.realName && nm === m.realName) return true;
    return false;
  }
  function pass(c){
    if (!active()) return true;
    return passFor(c, target());
  }

  /* ---------- 🔴 v1.48.0 課をまたいで集める（ゆうた指定） ----------
     ONの時は「いま見ているボードのカード」ではなく「**1課・2課ぜんぶからその人の担当**」を集めて、
     **同じ工程の列**に並べる（列のIDは1課も2課も同じ＝点検待ち/見積り中/…）。
     ⚠ OFFの時は今までどおり「そのボードのカードだけ」＝1バイトも変えない。
     ⚠ **データは触らない**＝カードの boardId はそのまま。だから
        別の課のカードを掴んで動かしても、**工程が変わるだけで課は変わらない**（dnd.js は status しか触らない）。 */
  function courseBoardIds(){
    return ((w.state && state.boards) || []).map(function(b){ return b && b.id; }).filter(Boolean);
  }
  function colCards(board, col){
    var all = (w.state && state.cards) || [];
    var here = all.filter(function(c){ return c && c.status === col.id && !c.returnStage; });
    if (!active()) return here.filter(function(c){ return c.boardId === board.id; });
    var m = target();
    if (!m) return here.filter(function(c){ return c.boardId === board.id; });   /* 相手が分からない時はいつもどおり */
    var ids = courseBoardIds();
    return here.filter(function(c){ return ids.indexOf(c.boardId) >= 0 && passFor(c, m); });
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
    if (!active() || !c || !board || c.boardId === board.id) return html;
    var lb = boardLabel(c.boardId);
    if (!lb) return html;
    return String(html).replace('<div class="pit-card pcm',
      '<div data-xboard="' + lb + '" class="pit-card pcm kb-xboard');
  }

  /* ---------- 🔴 v1.69.0 列の中身の組み立て（ゆうた指定） ----------
     絞り込みがONの時、列はこう並ぶ。

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
    return '<div class="kb-line kb-line-xb" title="ここから下は、よその課から集めてきた担当です">'
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
      if (!active() || c.boardId === board.id){ own.push(c); return; }
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

  /* ---------- 🔴 v1.140.0 盤面の上の帯（いま誰で絞っているか） ---------- */
  function bannerHtml(){
    if (!active()) return '';
    var m = target();
    var nm = (m && m.name) || '';
    return '<div class="kb-filtbar">' + (_on ? '<b>' + esc(nm) + '</b> さん（自分）の担当だけ出しています'
                                             : '<b>' + esc(nm) + '</b> さんの担当だけ出しています')
         + ' ─ 1課・2課をまたいで集めています'
         + '<button type="button" class="kb-filtbar-x" onclick="pitMemberFilterClear()">全部出す</button></div>';
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
    var mm = _memId ? byId(_memId) : null;
    Array.prototype.forEach.call(d.querySelectorAll('.kb-memfilt'), function(el){
      el.classList.toggle('on', !!_memId);
      /* 🔴 v1.140.1（ゆうた指定）**絵文字は付けない。**ほかのボタン（担当車両・区切りライン）と同じ見た目にそろえる */
      el.textContent = mm ? (mm.name || '') : 'メンバー';
      el.title = mm
        ? (mm.name + 'さんの担当だけ出しています。もう一度選ぶか「全員」で解除します')
        : '選んだ1人の担当のカードだけを出す（担当車両とは別。別のビューへ移ると解除されます）';
    });
  }
  function setOn(v){
    v = !!v;
    if (_on === v && !(_memId && v)) { paintButtons(); return; }
    _on = v;
    if (v) _memId = '';           /* 🔴 同時には効かない */
    paintButtons();
    rerender();
    if (w.pitToast){
      var m = me();
      pitToast(_on ? ((m && m.name ? m.name + 'さん' : '自分') + 'の担当を 1課・2課からまとめて出しています') : '全部のカードを出しました');
    }
  }
  function setMember(id){
    id = String(id || '');
    if (_memId === id && !_on){ paintButtons(); return; }
    _memId = id;
    if (id) _on = false;          /* 🔴 同時には効かない */
    paintButtons();
    rerender();
    if (w.pitToast){
      var m = id ? byId(id) : null;
      pitToast(m ? (m.name + 'さんの担当を 1課・2課からまとめて出しています') : '全部のカードを出しました');
    }
  }
  w.pitMyOnlyToggle = function(){
    if (!allowed()) return;
    setOn(!_on);
  };
  w.pitMemberFilterClear = function(){ _on = false; setMember(''); };

  /* ---------- 🔴 v1.140.0 メンバーを選ぶメニュー ----------
     ⚠ 出すのは**フロントの人**（＝フロント担当になりうる人）。辞めた人は出さない。
     ⚠ 盤面に何台あるかを右に出す＝0台の人を選んで「空だ」と驚かないように。 */
  /* 🔴 v1.140.1（ゆうた報告「メンバーの中の数字がちゃんと拾えてない・数字が全然合わない」）
     ⚠ v1.140.0 は **ID をキーにした数と、名前をキーにした数を別々に数えていた**。
        カードによって `frontStaffId` が入っていたり名前だけだったりするので、
        同じ人が2つに割れて**どちらか片方しか数えていなかった**（別名・本名も同じ）。
     🔴 直し＝**絞り込みに使っているのと同じ物差し（`passFor`）でそのまま数える。**
        ＝ここに出る台数は、その人を選んだ時に**実際に盤面に残る枚数と必ず一致する**。
     ⚠ 数える範囲も、押した時に集まる範囲（1課・2課ぜんぶ／盤面に乗っているカードだけ）にそろえてある。 */
  function boardCards(){
    var ids = courseBoardIds();
    return ((w.state && state.cards) || []).filter(function(c){
      if (!c || c.returnStage) return false;
      if (ids.indexOf(c.boardId) < 0) return false;
      if (w.PitBoardOrder && !PitBoardOrder.onBoard(c)) return false;
      return true;
    });
  }
  function candidates(){
    var cards = boardCards();
    var mid = (me() || {}).id;
    return staffList().filter(function(s){ return s && s.front && !s.left; })
      .map(function(s){
        var n = 0;
        cards.forEach(function(c){ if (passFor(c, s)) n++; });
        return { s: s, n: n, isMe: (s.id === mid) };
      });
  }
  var menu = null;
  function close(){ if (menu && menu.parentNode) menu.parentNode.removeChild(menu); menu = null; }
  function open(btn){
    if (menu){ close(); return; }
    var list = candidates();
    menu = d.createElement('div');
    menu.className = 'kb-dd';
    menu.innerHTML = '<div class="kb-dd-h">この人の担当だけ出す</div>'
      + (list.length ? list.map(function(o){
          return '<div class="kb-dd-i' + (o.s.id === _memId ? ' sel' : '') + '" data-memset="' + esc(o.s.id) + '">'
               + '<span class="kb-dd-ck">' + (o.s.id === _memId ? '✓' : '') + '</span>'
               + esc(o.s.name || '') + (o.isMe ? '（自分）' : '')
               + '<span class="kb-dd-sm">' + o.n + '台</span></div>';
        }).join('') : '<div class="kb-dd-empty">フロントの人が名簿にいません</div>')
      + '<div class="kb-dd-sep"></div>'
      + '<div class="kb-dd-i' + (!_memId ? ' sel' : '') + '" data-memset=""><span class="kb-dd-ck">'
      + (!_memId ? '✓' : '') + '</span>全員（解除）</div>';
    d.body.appendChild(menu);
    var r = btn.getBoundingClientRect();
    var left = Math.max(8, Math.min(r.right - menu.offsetWidth, (w.innerWidth || 1200) - menu.offsetWidth - 8));
    var top = r.bottom + 6;
    if (top + menu.offsetHeight > (w.innerHeight || 800) - 8) top = Math.max(8, r.top - menu.offsetHeight - 6);
    menu.style.left = left + 'px';
    menu.style.top  = top + 'px';
  }
  w.pitMemberFilterMenu = function(btn){ open(btn); };
  d.addEventListener('click', function(e){
    var it = e.target.closest && e.target.closest('[data-memset]');
    if (it){ e.preventDefault(); e.stopPropagation(); close(); setMember(it.getAttribute('data-memset')); return; }
    if (!menu) return;
    if (e.target.closest && (e.target.closest('.kb-dd') || e.target.closest('.kb-memfilt'))) return;
    close();
  }, true);
  w.addEventListener('resize', close);

  /* 🔴 別のビューへ移ったら解除（持ち越さない）。
     ⚠ showView を包むだけ＝views.js は触っていない。 */
  var _orig = w.showView;
  if (typeof _orig === 'function'){
    w.showView = function(v){
      if (active() && v !== 'course1' && v !== 'course2' && v !== 'task'){
        _on = false; _memId = '';   /* ここでは描き直さない＝これから描く画面に任せる */
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
                  colBody: colBody, courseName: courseName,
                  /* 🔴 v1.140.0 メンバー */
                  active: active, target: target, memberId: function(){ return _memId; },
                  setMember: setMember, bannerHtml: bannerHtml };
  console.log('[myonly-pit] ready（タスクボードの「担当車両」「メンバー」スイッチ）');
})(window, document);
