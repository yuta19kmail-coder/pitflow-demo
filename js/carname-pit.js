/* ========================================
   carname-pit.js  -  メーカー／車種の入力候補（新規予約カード）  PitFlow v1.23.0
   ----------------------------------------
   ◎なにをするもの
     新規予約カードの **メーカー** と **車種（グレード）** に、
     ▼を押すと一覧、打ち込むと絞り込みの候補を出す。**手で打つのも今までどおりできる。**
     ねらいは「書き方のブレを減らす」こと。同じ車が「BMW」「ＢＭＷ」「bmw」で入ると、
     あとで数えるときにバラバラになる。

   ◎候補はどこから来るか
     **取り込んだ顧客データ（state.customers[].vehicles[]）だけ**。
     ＝整備ソフト（bizcloud）の車検証の記載そのもの。
     🔴 過去の予約カードからは拾わない。手打ちの打ち間違いを候補に混ぜないため。

   ◎絞り方
     ・メーカー … いま選んでいる**国産／輸入**で絞る。**未選択なら全部**出す。
     ・車種 …… いま入っているメーカーで絞る（CarFlow の autocomplete.js と同じ考え方）。
                メーカーが空なら、国産／輸入の範囲だけで絞る。
     ・多い順に並べる。右に台数を薄く出す＝どれが「よく使う書き方」か分かる。

   ⚠ メーカー名は**車検証の記載どおり**にしてある。だから
       ・ミニは**年式によって「BMW」と「MINI」の両方がある**（どちらも正しい）
       ・「ホンダオブザユーケー」「TMUK」のような製造工場名も、車検証にそう書いてあるもの
      勝手にまとめない。まとめると車検証と突き合わせられなくなる。

   ⚠ ひらがなで打っても引っかかる（「ぷ」→「プジョー」）。空白・「・」は無視して比べる。
   ⚠ IME で変換中（e.isComposing）は上下キーを横取りしない。変換候補と喧嘩するため。
   ======================================== */
(function (w, d) {
  'use strict';

  var MAX_SHOW = 30;          /* 一度に出す件数の上限（トヨタは車種114種あるので） */

  /* ---------- 文字をそろえる ---------- */
  function h2k(s) {           /* ひらがな → カタカナ */
    return String(s || '').replace(/[ぁ-ゖ]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) + 0x60);
    });
  }
  function fold(s) {          /* 比べる用：全角英数→半角・小文字・カタカナ・空白と中黒を落とす */
    var t = String(s == null ? '' : s);
    if (t.normalize) t = t.normalize('NFKC');
    return h2k(t).toLowerCase().replace(/[\s　・]/g, '');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /* ---------- 顧客データから辞書を作る ---------- */
  /* 6,000人ぶんを毎回なめると重いので、顧客データが入れ替わった時だけ作り直す。 */
  var _cache = null, _cacheKey = '';

  function _key() {
    var cs = (w.state && state.customers) || [];
    var n = 0;
    for (var i = 0; i < cs.length; i++) n += (cs[i] && cs[i].vehicles ? cs[i].vehicles.length : 0);
    return cs.length + '/' + n;
  }
  function build() {
    var k = _key();
    if (_cache && _cacheKey === k) return _cache;
    var maker = { '': {} };            /* boardId → { メーカー名: 台数 } */
    var car = {};                      /* boardId + '\t' + メーカー → { 車種: 台数 } */
    var board = {};                    /* メーカー → { boardId: 台数 } */
    var cs = (w.state && state.customers) || [];
    for (var i = 0; i < cs.length; i++) {
      var vs = (cs[i] && cs[i].vehicles) || [];
      for (var j = 0; j < vs.length; j++) {
        var v = vs[j] || {};
        var mk = String(v.maker || '').trim();
        var cr = String(v.car || '').trim();
        var bd = String(v.boardId || '');
        if (mk) {
          if (!maker[bd]) maker[bd] = {};
          maker[bd][mk] = (maker[bd][mk] || 0) + 1;
          maker[''][mk] = (maker[''][mk] || 0) + 1;
          if (!board[mk]) board[mk] = {};
          if (bd) board[mk][bd] = (board[mk][bd] || 0) + 1;
        }
        if (cr) {
          /* メーカー指定あり／なし の2通りで引けるように両方に積む */
          [bd + '\t' + mk, bd + '\t', '\t' + mk, '\t'].forEach(function (kk) {
            if (!car[kk]) car[kk] = {};
            car[kk][cr] = (car[kk][cr] || 0) + 1;
          });
        }
      }
    }
    _cache = { maker: maker, car: car, board: board };
    _cacheKey = k;
    return _cache;
  }
  /* 顧客データを入れ替えた直後など、明示的に作り直したい時 */
  w.pitCarNameReset = function () { _cache = null; _cacheKey = ''; };

  function toList(dict) {
    var out = [];
    for (var k in dict) if (dict.hasOwnProperty(k)) out.push({ v: k, n: dict[k] });
    out.sort(function (a, b) { return b.n - a.n || (a.v < b.v ? -1 : 1); });   /* 多い順・同数なら名前順 */
    return out;
  }

  /* メーカーの一覧。boardId が空なら全部（＝国産/輸入が未選択のとき） */
  function makers(boardId) {
    var m = build().maker[boardId || ''] || {};
    return toList(m);
  }
  /* 車種の一覧。メーカーで絞る。メーカーが空なら国産/輸入の範囲だけで絞る */
  function cars(boardId, maker) {
    var c = build().car[(boardId || '') + '\t' + String(maker || '').trim()] || {};
    return toList(c);
  }
  /* そのメーカーは国産か輸入か。データで多いほうを返す。分からなければ '' */
  function boardOf(maker) {
    var b = build().board[String(maker || '').trim()];
    if (!b) return '';
    var best = '', n = 0;
    for (var k in b) if (b[k] > n) { n = b[k]; best = k; }
    return best;
  }

  /* ---------- 絞り込み ---------- */
  /* 前から一致を先に、途中一致を後ろに。打った文字が空なら全部。 */
  function filter(list, q) {
    var qf = fold(q);
    if (!qf) return list.slice();
    var head = [], tail = [];
    for (var i = 0; i < list.length; i++) {
      var f = fold(list[i].v);
      var at = f.indexOf(qf);
      if (at === 0) head.push(list[i]);
      else if (at > 0) tail.push(list[i]);
    }
    return head.concat(tail);
  }

  /* ---------- 入力欄をコンボボックスにする ---------- */
  /* opt.list()      … () => [{v,n}]  そのとき出す候補
     opt.onPick(v)   … 候補を選んだ時（手打ちでは呼ばれない）
     ⚠ 値の保存は card-detail.js の input イベントに任せる。
        ここでは値を入れて input を発火するだけ＝保存の道を二重に作らない。 */
  function attach(inp, opt) {
    if (!inp || inp._cnDone) return;
    inp._cnDone = true;

    var wrap = d.createElement('div');
    wrap.className = 'cn-wrap';
    inp.parentNode.insertBefore(wrap, inp);
    wrap.appendChild(inp);

    var arrow = d.createElement('button');
    arrow.type = 'button';
    arrow.className = 'cn-arrow';
    arrow.tabIndex = -1;
    arrow.setAttribute('aria-label', '候補を出す');
    arrow.innerHTML = '<span class="cn-caret"></span>';
    wrap.appendChild(arrow);

    var dd = d.createElement('div');
    dd.className = 'cn-dd';
    wrap.appendChild(dd);

    var items = [], cur = -1, open = false;

    function close() { open = false; dd.classList.remove('show'); dd.innerHTML = ''; items = []; cur = -1; }

    function render(all) {
      var list = [];
      try { list = opt.list() || []; } catch (e) { list = []; }
      var hit = filter(list, all ? '' : inp.value);
      var more = hit.length - MAX_SHOW;
      items = hit.slice(0, MAX_SHOW);
      if (!items.length) { close(); return; }
      var qf = fold(all ? '' : inp.value);
      var html = '';
      items.forEach(function (it, i) {
        var disp = esc(it.v);
        if (qf) {
          /* 光らせる位置は「そろえた文字」で探しているので、元の文字とズレることがある。
             ズレたら光らせない（安全側）。 */
          var f = fold(it.v), at = f.indexOf(qf);
          if (at >= 0 && f.length === it.v.replace(/[\s　・]/g, '').length && at + qf.length <= it.v.length) {
            var raw = it.v;
            disp = esc(raw.slice(0, at)) + '<b>' + esc(raw.slice(at, at + qf.length)) + '</b>' + esc(raw.slice(at + qf.length));
          }
        }
        html += '<div class="cn-i' + (i === cur ? ' on' : '') + '" data-i="' + i + '">'
              + '<span class="cn-v">' + disp + '</span><span class="cn-n">' + it.n + '</span></div>';
      });
      if (more > 0) html += '<div class="cn-more">ほか ' + more + ' 件（打ち込むと絞れます）</div>';
      dd.innerHTML = html;
      dd.classList.add('show');
      open = true;
      place();
      Array.prototype.forEach.call(dd.querySelectorAll('.cn-i'), function (el) {
        el.addEventListener('mouseenter', function () { mark(+el.dataset.i); });
        /* pointerdown＋preventDefault＝blur より先に拾う（PCもタブレットも同じ動き） */
        el.addEventListener('pointerdown', function (e) { e.preventDefault(); pick(+el.dataset.i); });
      });
      var act = dd.querySelector('.cn-i.on');
      if (act && act.scrollIntoView) { try { act.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
    }

    /* 🔴 v1.28.0（ゆうた指定）候補は**入力欄の上**に出す。
       Windows の変換候補（IMEの予測）が入力欄の**下**に出るので、そこと重なると読めなくなるため。
       ⚠ 上の余白が足りない時だけ下に出す（画面の外へはみ出して読めなくなるのを防ぐ）。
       ⚠ 高さは残っている余白に合わせて縮める＝どちら向きでも切れずに収まる。
       ⚠ CSS の既定が「上」。ここは下に出す時だけ `cn-down` を付ける。 */
    function place() {
      dd.classList.remove('cn-down');
      dd.style.maxHeight = '';
      var GAP = 3, MINH = 110, MAXH = 262;
      var r = inp.getBoundingClientRect();
      var vh = w.innerHeight || (d.documentElement && d.documentElement.clientHeight) || 0;
      var up = r.top - GAP;            /* 入力欄より上に残っている高さ */
      var down = vh - r.bottom - GAP;  /* 入力欄より下に残っている高さ */
      var h = dd.offsetHeight;
      var useDown = (h > up) && (down > up);
      if (useDown) dd.classList.add('cn-down');
      var room = useDown ? down : up;
      if (h > room) dd.style.maxHeight = Math.max(MINH, Math.min(MAXH, room)) + 'px';
    }

    function mark(i) {
      cur = i;
      Array.prototype.forEach.call(dd.querySelectorAll('.cn-i'), function (el, k) { el.classList.toggle('on', k === cur); });
    }

    function pick(i) {
      if (i < 0 || i >= items.length) return;
      var v = items[i].v;
      inp.value = v;
      close();
      /* card-detail.js の input ハンドラに保存してもらう */
      try { inp.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
      if (typeof opt.onPick === 'function') opt.onPick(v);
    }

    inp.setAttribute('autocomplete', 'off');
    inp.addEventListener('input', function () { render(false); });
    inp.addEventListener('focus', function () { if (inp.value) render(false); });
    inp.addEventListener('blur', function () { setTimeout(close, 120); });
    inp.addEventListener('keydown', function (e) {
      if (e.isComposing || e.keyCode === 229) return;      /* 変換中は触らない */
      if (e.key === 'Escape') { if (open) { e.stopPropagation(); close(); } return; }
      if (!open) {
        if (e.key === 'ArrowDown') { e.preventDefault(); render(!inp.value); }
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); mark(cur + 1 >= items.length ? 0 : cur + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); mark(cur - 1 < 0 ? items.length - 1 : cur - 1); }
      else if (e.key === 'Enter' && cur >= 0) { e.preventDefault(); pick(cur); }
      else if (e.key === 'Tab' && cur >= 0) { e.preventDefault(); pick(cur); }
    });
    arrow.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (open) { close(); return; }
      inp.focus();
      render(true);                                        /* ▼は打った文字を無視して全件 */
    });
  }

  /* ---------- 新規予約カードに取り付ける ---------- */
  /* card-detail.js が renderCardForm のたびに呼ぶ。DOMは毎回作り直されるので、毎回付け直す。 */
  function mount(root, card, hooks) {
    if (!root || !card) return;
    hooks = hooks || {};
    var mk = root.querySelector('input[data-cn="maker"]');
    var cr = root.querySelector('input[data-cn="car"]');
    if (mk) attach(mk, {
      list: function () { return makers(card.boardId); },
      onPick: function (v) { if (hooks.onMaker) hooks.onMaker(v); }
    });
    if (cr) attach(cr, {
      list: function () { return cars(card.boardId, mk ? mk.value : card.maker); },
      onPick: function (v) { if (hooks.onCar) hooks.onCar(v); }
    });
  }

  w.PitCarName = {
    makers: makers, cars: cars, boardOf: boardOf,
    filter: filter, fold: fold, attach: attach, mount: mount
  };
})(window, document);
