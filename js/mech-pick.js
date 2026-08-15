/* ========================================
   mech-pick.js  ── 点検担当者・整備担当者を選ぶチップ（PitFlow v1.97.0）
   ----------------------------------------
   ◎なにをするもの
     カード詳細の「整備」タブにある**担当者のチップ**を、**部品として1か所に出した**もの。
     ここから呼べば、どの画面でも**まったく同じ見た目・同じ動き・同じ配分バー**になる。

   ◎なぜ出したか（ゆうた指定 2026-08-15）
     「作業完了に入れた時に担当者が空なら注意を出す。**そのポップアップで担当者を入れられるようにしたい。
       チェックはメインと同じ。動くバーの表示もほしい**」
     ＝ 同じものを2か所に書くと、必ず片方だけ直って食い違う。**書くのはここだけ。**

   ◎持ち方は今までと同じ（過去のカードもそのまま読める）
     ・`c.inspectors[]` / `c.mechanics[]` … 名前の配列（同じ人が2回入れば ×2＝取り分が倍）
     ・`c.inspectorIds[]` / `c.mechanicIds[]` … 同じ並びのメンバー番号（改名しても実績が別人に割れないように）

   ◎使い方
     PitMechPick.on('cv', function(c){ 保存して描き直す });      ← 画面ごとに1回登録
     el.innerHTML = PitMechPick.html(c, 'cv');                   ← チップ＋配分バーを描く
     ⚠ 'cv' は**呼び出し元の名札**。押した時にどの画面を描き直すかを、これで見分ける。

   ◎配分（％）の計算はしない。mech-summary.js の pitMechAllocText 1本を呼ぶだけ。
   ======================================== */
(function () {
  'use strict';

  var MAX = 10;                     /* 1枚のカードに入れられる枠の上限 */
  var HOOK = {};                    /* 名札 → 押された時に呼ぶ関数 */

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(m){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); }
  function ic(n){ return '<i data-ic=' + n + ' data-ics=16></i>'; }
  function cardOf(id){ return (window.state && state.cards || []).find(function(x){ return x && x.id === id; }) || null; }

  /* 候補＝メンバー画面で「メカ」にチェックした人。まだ誰も付いていなければ全員（空にして困らないように） */
  function options(){
    var all = (window.state && state.staff) || [];
    var mech = all.filter(function (s){ return s && s.mech; });
    return (mech.length ? mech : all).map(function (s){ return s && s.name; }).filter(Boolean);
  }
  /* 名前の配列 → { 名前: 枠の数 } と、出てきた順 */
  function countOf(arr){
    var cnt = {}, order = [];
    (Array.isArray(arr) ? arr : []).forEach(function (n){
      if (!n) return;
      if (!(n in cnt)){ cnt[n] = 0; order.push(n); }
      cnt[n]++;
    });
    return { cnt: cnt, order: order };
  }
  function idKey(role){ return role === 'inspectors' ? 'inspectorIds' : 'mechanicIds'; }
  function idOf(name){
    var m = (name && window.pitStaffByName) ? pitStaffByName(name) : null;
    return m ? m.id : '';
  }
  /* 名前の配列と番号の配列を、必ず同じ長さで取り出す */
  function arrsOf(c, role){
    if (!Array.isArray(c[role])) c[role] = [];
    var ik = idKey(role);
    if (!Array.isArray(c[ik])) c[ik] = c[role].map(function (n){ return idOf(n); });
    return { arr: c[role], ids: c[ik] };
  }

  /* ---------- 描く ---------- */
  function blockHtml(c, role, title, icon, ns){
    var arr = Array.isArray(c[role]) ? c[role] : [];
    var co = countOf(arr);
    /* すでに入っている人が候補に無くても（退職・名簿外）チップに残す＝勝手に消えない */
    var opts = options().slice();
    co.order.forEach(function (n){ if (opts.indexOf(n) < 0) opts.push(n); });
    var kind = (role === 'inspectors') ? 'i' : 'm';
    var h = '<div class="cf-mech-block cf-mech-' + kind + '">'
          + '<div class="cf-label">' + icon + ' ' + title + '<em class="cf-mech-cnt">' + (arr.length ? arr.length + '枠' : 'なし') + '</em></div>'
          + '<div class="cf-mech-chips">';
    opts.forEach(function (n){
      var k = co.cnt[n] || 0;
      var full = (arr.length >= MAX && !k);
      var call = "PitMechPick.tap('" + esc(ns) + "','" + esc(c.id) + "','" + role + "','" + esc(n) + "')";
      var offc = "event.stopPropagation();PitMechPick.off('" + esc(ns) + "','" + esc(c.id) + "','" + role + "','" + esc(n) + "')";
      h += '<button type="button" class="cf-mchip' + (k ? ' on' : '') + (full ? ' full' : '') + '"'
        + (full ? ' disabled title="これ以上は増やせません（最大' + MAX + '枠）"' : ' onclick="' + call + '"')
        + '>' + esc(n) + (k > 1 ? '<i class="cf-mchip-x">×' + k + '</i>' : '')
        + (k ? '<span class="cf-mchip-off" title="外す" onclick="' + offc + '">✕</span>' : '')
        + '</button>';
    });
    h += '</div></div>';
    return h;
  }

  /* 点検＋整備の2ブロック＋説明＋配分バー。
     o.note=false で説明を消す／o.live=false で配分バーを消す（既定はどちらも出す） */
  function html(c, ns, o){
    o = o || {};
    if (!c) return '';
    var h = blockHtml(c, 'inspectors', '点検担当者', ic('search'), ns)
          + blockHtml(c, 'mechanics',  '整備担当者', ic('wrench'), ns);
    if (o.note !== false){
      h += '<div class="cf-mech-note">タップで追加／もう一度タップで <b>×2・×3…</b>（その人の取り分が増えます）／<b>✕</b> で外す。'
         + '整備担当が居なければ点検担当が全部、点検担当が居なければ点検料ぶんも整備担当へ回ります。</div>';
    }
    if (o.live !== false){
      h += '<div class="cf-mech-preview"' + (o.liveId ? ' id="' + esc(o.liveId) + '"' : '') + '>'
         + (window.pitMechAllocText ? pitMechAllocText(c) : '') + '</div>';
    }
    return h;
  }

  /* ---------- 押された ---------- */
  function fire(ns, c){ var f = HOOK[ns]; if (typeof f === 'function'){ try { f(c); } catch(e){ if (window.console) console.error(e); } } }

  /* タップ＝1枠増やす（同じ人をもう一度なら ×2・×3…＝取り分が増える） */
  function tap(ns, cardId, role, name){
    var c = cardOf(cardId); if (!c || !name) return;
    var A = arrsOf(c, role);
    if (A.arr.length >= MAX) return;
    A.arr.push(name); A.ids.push(idOf(name));
    fire(ns, c);
  }
  /* ✕ ＝その人を全部外す（×2 でも1回で消える。押し直しの手間を作らない） */
  function off(ns, cardId, role, name){
    var c = cardOf(cardId); if (!c || !name) return;
    var A = arrsOf(c, role);
    for (var i = A.arr.length - 1; i >= 0; i--){
      if (A.arr[i] === name){ A.arr.splice(i, 1); A.ids.splice(i, 1); }
    }
    fire(ns, c);
  }

  /* 担当者が1人も入っていないか（点検・整備どちらも空） */
  function isEmpty(c){
    if (!c) return false;
    var i = Array.isArray(c.inspectors) ? c.inspectors.filter(Boolean) : [];
    var m = Array.isArray(c.mechanics)  ? c.mechanics.filter(Boolean)  : [];
    return (i.length + m.length) === 0;
  }

  window.PitMechPick = {
    MAX: MAX,
    on: function (ns, fn){ HOOK[ns] = fn; },
    html: html,
    blockHtml: blockHtml,
    options: options,
    arrs: arrsOf,
    idOf: idOf,
    tap: tap,
    off: off,
    isEmpty: isEmpty
  };
})();
