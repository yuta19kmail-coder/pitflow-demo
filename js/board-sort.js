/* ========================================
   board-sort.js  -  タスクボードの「一時並び替え」  PitFlow v1.140.0
   ----------------------------------------
   ◎なにをするもの（ゆうた指定 2026-08-18）
     マスター並び（board-order.js）はそのままに、**見るためだけに一時的に並べ替える**スイッチ。

       ・入庫日が早い順
       ・代車リミットが近い順
       ・金額が大きい順（暫定含め）

   ◎決めごと（2026-08-18 すり合わせ済み）
     🔴 **データは1バイトも触らない。保存もしない。**（「担当車両」と同じ考え方）
     🔴 **盤面ぜんぶの列に一括**で掛かる（列ごとではない）。
     🔴 **並び替え中はカードを動かせない。** 仮の並びのまま掴むとマスター並びが壊れるから。
        区切りラインは**薄く出したまま**（位置はマスター並びの「上から何枚目」を守る）。掴めない。
     ⚠ **別のビューへ移ったら解除。** 開き直しても解除。持ち越さない（メモリだけ）。
     ⚠ いま何順で見ているかは、盤面の上の**青い帯**と、カード右上の**数字のバッジ**で出しっぱなしにする。

   ◎物差しは借りるだけ（写しを作らない）
     ・代車の残り日数 … `pitLoanerRemainOf`（loaner-free.js／v1.80.0・v1.82.0 の1本）
     ・金額 … 確定 → 受注 → 見積 → 概算。無ければ作業タイプの概算（`pitEstAmount`）
       ⚠ ゆうた指定で **どの段の金額か（確/受/見/概）をバッジに出す**＝概算だけの車が
          上に来た時に「これはまだ概算だ」と分かるようにするため。
   ======================================== */
(function (w, d) {
  'use strict';

  var MODES = [
    { id:'master', label:'マスター並び',        sub:'人が動かした順' },
    { id:'in',     label:'入庫日が早い順',      sub:'古い車から' },
    { id:'loaner', label:'代車リミットが近い順', sub:'超過 → 残り少ない' },
    { id:'amt',    label:'金額が大きい順',      sub:'暫定含め' }
  ];
  var BTN = { master:'並び替え', in:'入庫日順', loaner:'代車リミット順', amt:'金額順' };
  var _mode = 'master';

  function isOn(){ return _mode !== 'master'; }
  function mode(){ return _mode; }
  function labelOf(m){ var x = MODES.find(function(o){ return o.id === m; }); return x ? x.label : ''; }

  /* ---------- 物差し ---------- */
  function inKey(c){
    var dte = (c && c.reserveDate) || '';
    if (!dte) return '9999-99-99 99:99';          /* 日付が無い車はいちばん下 */
    return dte + ' ' + ((c.reserveTime || '99:99'));
  }
  function remOf(c){
    if (!c || !c.needLoaner) return null;
    var r = w.pitLoanerRemainOf ? pitLoanerRemainOf(c) : null;
    if (r && r.rem != null) return r.rem;
    return (w.loanerRem ? loanerRem(c) : null);
  }
  /* 金額＝いま出せるいちばん確かなもの。段も一緒に返す。 */
  function amtOf(c){
    if (!c) return { v:0, tier:'概' };
    if (c.amountFinal != null && c.amountFinal !== '') return { v: +c.amountFinal || 0, tier:'確' };
    if (c.amountOrder != null && c.amountOrder !== '') return { v: +c.amountOrder || 0, tier:'受' };
    if (c.amountQuote != null && c.amountQuote !== '') return { v: +c.amountQuote || 0, tier:'見' };
    if (c.estAmount   != null && c.estAmount   !== '') return { v: +c.estAmount   || 0, tier:'概' };
    var wt = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes[0] : c.workType;
    var team = (c.boardId === 'import') ? 'import' : 'default';
    return { v: (w.pitEstAmount ? (pitEstAmount(wt, team) || 0) : 0), tier:'概' };
  }

  /* ---------- 並べる ----------
     渡された配列（マスター並び）を、いまのモードで並べ替えた**写し**を返す。
     ⚠ 元の配列も state.cards も触らない。 */
  function apply(list){
    list = list || [];
    if (!isOn()) return list;
    var idx = {};
    list.forEach(function(c, i){ if (c) idx[c.id] = i; });
    var tie = function(a, b){ return idx[a.id] - idx[b.id]; };   /* 同じ値ならマスター並びの順 */
    var out = list.slice();
    if (_mode === 'in'){
      out.sort(function(a, b){ var ka = inKey(a), kb = inKey(b); return ka < kb ? -1 : (ka > kb ? 1 : tie(a, b)); });
    } else if (_mode === 'loaner'){
      out.sort(function(a, b){
        var ra = remOf(a), rb = remOf(b);
        var va = (ra == null ? 99999 : ra), vb = (rb == null ? 99999 : rb);   /* 代車なしはいちばん下 */
        return (va - vb) || tie(a, b);
      });
    } else if (_mode === 'amt'){
      out.sort(function(a, b){ return (amtOf(b).v - amtOf(a).v) || tie(a, b); });
    }
    return out;
  }

  /* ---------- カードに数字のバッジを足す ----------
     ⚠ HTML の組み立て直しはしない＝根っこの class に足すだけ（myonly-pit.js の decorate と同じやり方）。 */
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function keyText(c){
    if (_mode === 'in'){
      var s = String((c && c.reserveDate) || '');
      if (!s) return '入庫日なし';
      var p = s.split('-');
      return (+p[1]) + '/' + (+p[2]) + (c.reserveTime ? ' ' + c.reserveTime : '');
    }
    if (_mode === 'loaner'){
      var r = remOf(c);
      if (r == null) return '代車なし';
      return r < 0 ? ('超過' + Math.abs(r) + '日') : ('残' + r + '日');
    }
    if (_mode === 'amt'){
      var a = amtOf(c);
      return a.tier + ' ¥' + Math.round(a.v).toLocaleString('ja-JP');
    }
    return '';
  }
  function decorate(c, html){
    if (!isOn() || !c) return html;
    return String(html).replace('<div class="pit-card pcm',
      '<div data-sortkey="' + esc(keyText(c)) + '" class="pit-card pcm kb-sortkey');
  }

  /* ---------- 盤面の上の帯 ---------- */
  function bannerHtml(){
    if (!isOn()) return '';
    return '<div class="kb-tmpbar">⇅ <b>' + esc(labelOf(_mode)) + '</b> で並べて見ています'
         + ' ─ <b>表示だけ</b>です。マスター並びは変わっていません／カードは動かせません'
         + '<button type="button" class="kb-tmpbar-x" onclick="pitBoardSortSet(\'master\')">マスター並びに戻す</button></div>';
  }

  /* ---------- ボタンとメニュー ---------- */
  function rerender(){
    try {
      if (w._rerenderActiveBoard) return _rerenderActiveBoard();
      if (w.state && state.currentView && w.showView) showView(state.currentView);
    } catch(e){}
  }
  function paintButtons(){
    Array.prototype.forEach.call(d.querySelectorAll('.kb-sortbtn'), function(el){
      el.classList.toggle('on', isOn());
      el.textContent = '⇅ ' + BTN[_mode];
      el.title = isOn()
        ? ('いま「' + labelOf(_mode) + '」で並べて見ています。データは変わっていません')
        : '一時的に並べ替えて見る（マスター並びは変わりません）';
    });
  }
  var menu = null;
  function close(){ if (menu && menu.parentNode) menu.parentNode.removeChild(menu); menu = null; }
  function open(btn){
    if (menu){ close(); return; }
    menu = d.createElement('div');
    menu.className = 'kb-dd';
    menu.innerHTML = '<div class="kb-dd-h">一時並び替え（見るだけ）</div>'
      + MODES.map(function(o, i){
          return (i === 1 ? '<div class="kb-dd-sep"></div>' : '')
            + '<div class="kb-dd-i' + (o.id === _mode ? ' sel' : '') + '" data-sortset="' + o.id + '">'
            + '<span class="kb-dd-ck">' + (o.id === _mode ? '✓' : '') + '</span>'
            + esc(o.label) + '<span class="kb-dd-sm">' + esc(o.sub) + '</span></div>';
        }).join('');
    d.body.appendChild(menu);
    place(menu, btn);
  }
  /* ボタンの真下に出す（はみ出したら押し戻す）。区切りラインの吹き出しと同じ考え方。 */
  function place(el, btn){
    var r = btn.getBoundingClientRect();
    var left = Math.max(8, Math.min(r.right - el.offsetWidth, (w.innerWidth || 1200) - el.offsetWidth - 8));
    var top = r.bottom + 6;
    if (top + el.offsetHeight > (w.innerHeight || 800) - 8) top = Math.max(8, r.top - el.offsetHeight - 6);
    el.style.left = left + 'px';
    el.style.top  = top + 'px';
  }
  w.pitBoardSortMenu = function(btn){ open(btn); };
  w.pitBoardSortSet = function(m){
    close();
    if (_mode === m) return;
    _mode = m;
    paintButtons();
    rerender();
    if (w.pitToast) pitToast(isOn() ? (labelOf(m) + 'で並べています（表示だけ・マスター並びは変わりません）') : 'マスター並びに戻しました');
  };
  d.addEventListener('click', function(e){
    var it = e.target.closest && e.target.closest('[data-sortset]');
    if (it){ e.preventDefault(); e.stopPropagation(); pitBoardSortSet(it.getAttribute('data-sortset')); return; }
    if (!menu) return;
    if (e.target.closest && (e.target.closest('.kb-dd') || e.target.closest('.kb-sortbtn'))) return;
    close();
  }, true);
  w.addEventListener('resize', close);

  /* 🔴 別のビューへ移ったら解除（持ち越さない）。myonly-pit.js と同じ包み方。 */
  var _orig = w.showView;
  if (typeof _orig === 'function'){
    w.showView = function(v){
      if (isOn() && v !== 'course1' && v !== 'course2' && v !== 'task'){ _mode = 'master'; paintButtons(); }
      var r = _orig.apply(this, arguments);
      try { paintButtons(); } catch(e){}
      return r;
    };
  }
  d.addEventListener('DOMContentLoaded', paintButtons);
  w.addEventListener('load', paintButtons);

  w.PitBoardSort = {
    isOn: isOn, mode: mode, apply: apply, decorate: decorate,
    bannerHtml: bannerHtml, label: labelOf, set: function(m){ w.pitBoardSortSet(m); },
    refresh: paintButtons, amtOf: amtOf, remOf: remOf
  };
  console.log('[board-sort] ready（タスクボードの一時並び替え）');
})(window, document);
