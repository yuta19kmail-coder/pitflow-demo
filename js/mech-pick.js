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

   ◎✅✅ v2.73.0（ゆうた指定 2026-09-05）**チェック担当者を3つ目の枠として足した。**
     🗣「予約詳細の整備のなか、作業者のエリアにチェック者を追加する。
     　　ここは**一人1回までしかクリックできない。複数人のクリックはできる**。
     　　無しも選べるが、**未選択は警告・データチェック対象**」
     🔴 決めごと（ここが点検・整備と違う所）
       ① **1人1枠まで。×2 は付かない。** もう一度押すと外れる（＝押し間違いを自分で戻せる）。
          ＝ チェックは「見た／見ていない」の1回きりで、取り分の重みではないため。
       ② **作業サマリーの配分には1ミリも影響しない**（ゆうた確定）。金額も台数も動かさない。
          ＝ ここは「誰が確かめたか」の記録。だから mech-summary.js は1文字も触っていない。
       ③ 候補は**全員**（フロント・受付も含む）。点検・整備は「メカ」に付けた人だけだが、
          チェックは工場長・フロントも押すので、名簿で絞らない。
       ④ **導入日（下の CHECKER_FROM）より前のカードでは、この枠を「入っていない」と言わない。**
          🔴 昔のカードには入りようが無いのに要対応が数千件出る＝**数えるべき抜けが埋もれる**。
          ⚠ 枠そのものは昔のカードにも出す（あとから入れられる）。**言わないだけ。**
     ・持ち方＝`c.checkers[]` / `c.checkerIds[]` / `c.checkersNone`（点検・整備とまったく同じ形）

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

  /* ✅ v2.73.0 3つの役を1か所にまとめた。**足す時はここだけ。**
     once … 1人1枠まで（×2 を作らない）／all … 候補を名簿で絞らない（全員出す） */
  var ROLES = [
    { role:'inspectors', title:'点検担当者', icon:'search', kind:'i', label:'点検担当' },
    { role:'mechanics',  title:'整備担当者', icon:'wrench', kind:'m', label:'整備担当' },
    { role:'checkers',   title:'チェック担当者', icon:'check', kind:'c', label:'チェック担当',
      once:true, all:true }
  ];
  function roleDef(role){
    for (var i = 0; i < ROLES.length; i++) if (ROLES[i].role === role) return ROLES[i];
    return { role:role, title:role, icon:'user', kind:'m', label:role };
  }

  /* 🔴🔴 v2.73.0 **チェック担当を「入っていない」と言い始める日**（ゆうた確定）。
     この日より前のカードでは、未入力でも**警告もデータチェックもしない**。
     ⚠ ここを空にすると過去ぜんぶが要対応になる。触る時は必ずゆうたに聞くこと。 */
  var CHECKER_FROM = '2026-09-05';
  function tt(x){ return String(x == null ? '' : x).trim(); }
  /* そのカードでチェック担当を**言うかどうか**。
     返車日（無ければ予約日）が導入日以降なら言う。日付がまったく無いカード＝これから通るので言う。 */
  function checkerScope(c){
    if (!c) return false;
    var d = tt(c.returnDate) || tt(c.reserveDate);
    return !d || d >= CHECKER_FROM;
  }

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(m){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); }
  function ic(n){ return '<i data-ic=' + n + ' data-ics=16></i>'; }
  function cardOf(id){ return (window.state && state.cards || []).find(function(x){ return x && x.id === id; }) || null; }

  /* 候補＝メンバー画面で「メカ」にチェックした人。まだ誰も付いていなければ全員（空にして困らないように）
     ✅ v2.73.0 チェック担当だけは**全員**（ゆうた確定＝工場長・フロントも押すため）。 */
  function options(role){
    var all = (window.state && state.staff) || [];
    if (roleDef(role).all) return all.map(function (s){ return s && s.name; }).filter(Boolean);
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
  function idKey(role){ return role === 'inspectors' ? 'inspectorIds' : (role === 'checkers' ? 'checkerIds' : 'mechanicIds'); }
  /* 🔴🔴 v1.174.0（ゆうた指定 2026-08-22）**「なし」＝該当者が本当にいない、という答え。**
     🗣「一番左にそれぞれ『なし』を作る。**リアルに該当者がいない場合に、忘れなのか リアルなのか
     　　をこれで判断するように**（オイル交換なら点検者はいないし、外注板金なら作業者がいない）」
     ◎持ち方＝`c.inspectorsNone` / `c.mechanicsNone`（true だけ）。**名前の配列には触らない。**
     🔴 3つの状態を区別する。**空っぽと「なし」はまったく別物。**
        ・**未入力** … 誰も入っていない／「なし」も押していない ＝ **忘れ**（データチェックが要対応で言う）
        ・**なし**   … 人が「居ない」と決めた ＝ **正しい状態**（もう言わない）
        ・**1人以上** … 名前が入っている
     ⚠ 配分（％）の計算は**1文字も変えない**（居ない側の取り分は今までどおり相手へ回る）。 */
  function noneKey(role){ return role === 'inspectors' ? 'inspectorsNone' : (role === 'checkers' ? 'checkersNone' : 'mechanicsNone'); }
  function isNone(c, role){ return !!(c && c[noneKey(role)]); }
  /* その役は「決まっている」か（人が入っている／なし と決めた）。空っぽだけが未入力。 */
  function isSettled(c, role){
    if (!c) return false;
    if (isNone(c, role)) return true;
    var a = Array.isArray(c[role]) ? c[role].filter(Boolean) : [];
    return a.length > 0;
  }
  /* まだ決まっていない役の名前（人に見せる言葉）。空なら全部決まっている。
     ✅ v2.73.0 チェック担当も同じ物差しに乗せた。ただし**導入日より前のカードでは言わない**
     （↑ CHECKER_FROM）。データチェックも作業完了の窓も、この1本を見ている。 */
  function unsettled(c){
    var out = [];
    if (!isSettled(c, 'inspectors')) out.push('点検担当');
    if (!isSettled(c, 'mechanics'))  out.push('整備担当');
    if (checkerScope(c) && !isSettled(c, 'checkers')) out.push('チェック担当');
    return out;
  }
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
    var def = roleDef(role);
    var arr = Array.isArray(c[role]) ? c[role] : [];
    var co = countOf(arr);
    /* すでに入っている人が候補に無くても（退職・名簿外）チップに残す＝勝手に消えない */
    var opts = options(role).slice();
    co.order.forEach(function (n){ if (opts.indexOf(n) < 0) opts.push(n); });
    var kind = def.kind;
    var none = isNone(c, role);
    /* 🔴 v1.174.0 見出しの右は3通りをはっきり言い分ける（前は空っぽも「なし」と書いていて、
       **忘れなのか居ないのかが読めなかった**。それを直すのが今回の中身）。 */
    /* ✅ v2.73.0 チェック担当は「枠」ではなく「人」。×2 が無いので枠と言うと意味がずれる。 */
    var cnt = arr.length ? (arr.length + (def.once ? '人' : '枠'))
                         : (none ? '該当者なし' : '未入力');
    var h = '<div class="cf-mech-block cf-mech-' + kind + (none ? ' is-none' : '') + '">'
          + '<div class="cf-label">' + icon + ' ' + title
          +   '<em class="cf-mech-cnt' + (arr.length ? '' : (none ? ' ok' : ' miss')) + '">' + cnt + '</em></div>'
          + '<div class="cf-mech-chips">';
    /* 🔴 いちばん左に「なし」。押すと入っている人は全部外れる（もう一度押すと未入力に戻る）。 */
    h += '<button type="button" class="cf-mchip cf-mnone' + (none ? ' on' : '') + '"'
      +  ' title="この車には該当者が居ません（忘れではない、と記録します）"'
      +  ' onclick="PitMechPick.none(\'' + esc(ns) + '\',\'' + esc(c.id) + '\',\'' + role + '\')">なし</button>';
    opts.forEach(function (n){
      var k = co.cnt[n] || 0;
      /* ✅ v2.73.0 1人1枠の役では、入っている人はもう一度押すと**外れる**（×2 にはならない）。
         だから `full`（これ以上増やせない）で押せなくしてはいけない＝戻せなくなる。 */
      var full = (!def.once && arr.length >= MAX && !k);
      var call = "PitMechPick.tap('" + esc(ns) + "','" + esc(c.id) + "','" + role + "','" + esc(n) + "')";
      var offc = "event.stopPropagation();PitMechPick.off('" + esc(ns) + "','" + esc(c.id) + "','" + role + "','" + esc(n) + "')";
      /* 🔴 v1.174.0 人のチップには目印を付ける（`cf-mperson`）。
         ＝ いちばん左に「なし」が入ったので、**「最初のチップ＝人」ではなくなった**。
         　 見た目のクラス（cf-mchip）で人を拾うと、見張りも操作も1つずれる（実際に試験が落ちた）。 */
      h += '<button type="button" class="cf-mchip cf-mperson' + (k ? ' on' : '') + (full ? ' full' : '') + '"'
        + (full ? ' disabled title="これ以上は増やせません（最大' + MAX + '枠）"' : ' onclick="' + call + '"')
        + '>' + esc(n) + ((!def.once && k > 1) ? '<i class="cf-mchip-x">×' + k + '</i>' : '')
        + (k ? '<span class="cf-mchip-off" title="外す" onclick="' + offc + '">✕</span>' : '')
        + '</button>';
    });
    h += '</div></div>';
    return h;
  }

  /* 点検＋整備＋チェックの3ブロック＋説明＋配分バー。
     o.note=false で説明を消す／o.live=false で配分バーを消す（既定はどちらも出す） */
  function html(c, ns, o){
    o = o || {};
    if (!c) return '';
    var h = '';
    ROLES.forEach(function (d){ h += blockHtml(c, d.role, d.title, ic(d.icon), ns); });
    if (o.note !== false){
      h += '<div class="cf-mech-note">タップで追加／もう一度タップで <b>×2・×3…</b>（その人の取り分が増えます）／<b>✕</b> で外す。'
         + '整備担当が居なければ点検担当が全部、点検担当が居なければ点検料ぶんも整備担当へ回ります。</div>';
      /* ✅ v2.73.0 チェック担当だけ動きが違うので、その1行を分けて書く（上の文と混ぜない）。 */
      h += '<div class="cf-mech-note cf-mech-note-c">チェック担当は <b>1人1回まで</b>（×2 は付きません）。'
         + 'もう一度タップすると外れます。<b>何人でも</b>選べます。取り分の計算には入りません。</div>';
    }
    if (o.live !== false){
      h += '<div class="cf-mech-preview"' + (o.liveId ? ' id="' + esc(o.liveId) + '"' : '') + '>'
         + (window.pitMechAllocText ? pitMechAllocText(c) : '') + '</div>';
    }
    return h;
  }

  /* ---------- 押された ---------- */
  function fire(ns, c){ var f = HOOK[ns]; if (typeof f === 'function'){ try { f(c); } catch(e){ if (window.console) console.error(e); } } }

  /* タップ＝1枠増やす（同じ人をもう一度なら ×2・×3…＝取り分が増える）
     ✅ v2.73.0 1人1枠の役（チェック担当）だけは、**もう一度押すと外れる**。
     　 🔴 「一人1回までしかクリックできない」＝ ×2 を作らない、が本体。
     　 　 ただ押せなくするだけだと**押し間違いを自分で戻せない**ので、2回目は外す動きにした。 */
  function tap(ns, cardId, role, name){
    var c = cardOf(cardId); if (!c || !name) return;
    var A = arrsOf(c, role);
    if (roleDef(role).once){
      if (A.arr.indexOf(name) >= 0){ off(ns, cardId, role, name); return; }
    } else if (A.arr.length >= MAX) return;
    A.arr.push(name); A.ids.push(idOf(name));
    c[noneKey(role)] = false;      /* 🔴 v1.174.0 人を入れたら「なし」は下りる（両立しない） */
    fire(ns, c);
  }
  /* 🔴 v1.174.0 「なし」＝該当者が居ないと決める。もう一度押すと**未入力に戻る**（決めていない状態）。
     ⚠ 人が入っている時に押すと、その人たちは外れる（「居ない」と言い切るので当然） */
  function none(ns, cardId, role){
    var c = cardOf(cardId); if (!c) return;
    var A = arrsOf(c, role);
    var on = !isNone(c, role);
    c[noneKey(role)] = on;
    if (on){ A.arr.length = 0; A.ids.length = 0; }
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

  /* 担当者が1人も入っていないか（点検・整備どちらも空）。
     ⚠ v1.174.0 これは**人が入っていないか**だけを見る（「なし」と決めたかは見ない）。
        入れ忘れの見分けは `isSettled` / `unsettled` のほう。 */
  function isEmpty(c){
    if (!c) return false;
    var i = Array.isArray(c.inspectors) ? c.inspectors.filter(Boolean) : [];
    var m = Array.isArray(c.mechanics)  ? c.mechanics.filter(Boolean)  : [];
    return (i.length + m.length) === 0;
  }

  /* ================================================================
     🧾 v2.73.0 **その役に誰が入っているかを、読む用に1行で出す。**
     ----------------------------------------------------------------
     ◎顧客ビューの伝票（ヘッダーと明細のあいだ）から呼ぶ。
     🔴 言葉は3通り。**空っぽと「なし」を混ぜない**（ここでも同じ）。
        ・人が入っている … 名前を並べる（×2 は点検・整備だけ付く）
        ・なし         … 「該当者なし」
        ・未入力       … 「未入力」を目立つ色で（＝データチェックが数えているもの）
     ⚠ 押せない。伝票は**読む所**なので、ここから直させない（直すのは予約詳細）。
     ================================================================ */
  function namesOf(c, role){
    var arr = Array.isArray(c && c[role]) ? c[role].filter(Boolean) : [];
    var co = countOf(arr);
    return co.order.map(function (n){
      var k = co.cnt[n] || 1;
      return (!roleDef(role).once && k > 1) ? (n + '×' + k) : n;
    });
  }
  function lineHtml(c){
    if (!c) return '';
    var h = '<div class="cf-mech-line">';
    ROLES.forEach(function (d){
      /* 導入日より前のカードは、チェック担当の欄そのものを出さない
         （入りようが無かった所に「未入力」の赤字を並べても、直しようが無い） */
      if (d.role === 'checkers' && !checkerScope(c)) return;
      var ns2 = namesOf(c, d.role);
      var st = ns2.length ? '' : (isNone(c, d.role) ? ' is-none' : ' is-miss');
      var tx = ns2.length ? ns2.join('・') : (isNone(c, d.role) ? '該当者なし' : '未入力');
      h += '<div class="cf-ml cf-ml-' + d.kind + st + '">'
        +    '<span class="cf-ml-t">' + esc(d.label) + '</span>'
        +    '<span class="cf-ml-v">' + esc(tx) + '</span>'
        +  '</div>';
    });
    return h + '</div>';
  }

  window.PitMechPick = {
    MAX: MAX,
    ROLES: ROLES,
    CHECKER_FROM: CHECKER_FROM,
    checkerScope: checkerScope,
    on: function (ns, fn){ HOOK[ns] = fn; },
    html: html,
    blockHtml: blockHtml,
    names: namesOf,
    line: lineHtml,
    options: options,
    arrs: arrsOf,
    idOf: idOf,
    tap: tap,
    off: off,
    none: none,
    isNone: isNone,
    isSettled: isSettled,
    unsettled: unsettled,
    isEmpty: isEmpty
  };
  /* 🔴 v1.174.0 データチェックからも同じ物差しを借りる（あちらで条件を書き写さない） */
  window.pitMechSettled  = function (c, role){ return isSettled(c, role); };
  window.pitMechUnsettled = function (c){ return unsettled(c); };
  /* 🧾 v2.73.0 顧客ビューの伝票から呼ぶ「担当の1行」。**見た目もここ1本**（伝票側で書き写さない） */
  window.pitMechLine     = function (c){ return lineHtml(c); };
  window.pitMechNames    = function (c, role){ return namesOf(c, role); };
})();
