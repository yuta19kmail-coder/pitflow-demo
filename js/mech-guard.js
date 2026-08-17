/* ========================================
   mech-guard.js  ── 作業完了に入れる時、担当者が空なら1回止める（PitFlow v1.97.0）
   ----------------------------------------
   ◎ゆうた指定（2026-08-15）
     「タスクボードで**作業完了に入れた時点**で、点検実施者・整備実施者がそれぞれ
       **一人も入ってない場合は入力しろよって注意を促すポップアップ**を表示するように」
     「そのポップアップで**担当者を入れられるようにしたい**。チェックは**メインと同じ**。
       **動くバーの表示もほしい**」

   ◎決めごと
     🔴 **止めない。**「このまま進める」で今までどおり動く（急いでいる時に足を引っ張らない）。
     🔴 チップも配分バーも **mech-pick.js の部品そのまま**＝カード詳細の整備タブと同じもの。
        ⚠ ここで作り直さないこと。
     🔴 出るのは **点検担当者・整備担当者がどちらも空** の時だけ。
        片方でも入っていれば出さない（整備だけ／点検だけ、は普通にある）。
     🔴 「作業完了」の列は会社ごとに変えられるので、**列の `terminal` の印**で見分ける
        （id を 'workDone' と決め打ちしない）。見つからない時だけ 'workDone' を使う。

   ◎どこから呼ばれるか
     phase-popup.js の maybeIntercept 1本。
     ＝ドラッグ・並び替え・◀▶ボタン、**どの動かし方でも同じように出る**。
     金額のポップアップが出る時は、**金額のあと**にこれが出る。
   ======================================== */
(function () {
  'use strict';

  var pending = null;      /* { card, go } */
  var built = false;

  function el(id){ return document.getElementById(id); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(m){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); }

  /* その盤面の「作業完了」の列はどれか */
  function doneColId(c){
    var boards = (window.state && state.boards) || [];
    var b = boards.find(function (x){ return x && x.id === ((c && c.boardId) || 'default'); });
    var cols = (b && b.cols || []).filter(function (x){ return x && !x.side; });
    var t = cols.find(function (x){ return x.terminal; });
    return t ? t.id : 'workDone';
  }

  function needed(c, to){
    if (!c || !to) return false;
    if (to !== doneColId(c)) return false;
    return window.PitMechPick ? PitMechPick.isEmpty(c) : false;
  }

  function build(){
    if (built) return; built = true;
    var bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.id = 'mg-backdrop';
    bd.innerHTML =
      '<div class="modal-box pp-box mg-box">'
      + '<div class="modal-head"><div class="modal-title">担当者が入っていません</div>'
      + '<button class="modal-close" onclick="PitMechGuard.close(0)"><i data-ic=close data-ics=16></i></button></div>'
      + '<div class="modal-body">'
      + '  <div class="pp-move" id="mg-move"></div>'
      + '  <div class="mg-warn"><i data-ic=warn data-ics=16></i> 点検担当者・整備担当者がどちらも空です。'
      +      'ここで入れておくと、作業サマリーの取り分にそのまま反映されます。</div>'
      + '  <div id="mg-pick"></div>'
      /* 🔴 ボタンは1つ。**入れたかどうかで文言だけ変わる**（同じことをするボタンを2つ並べない）。
         やめたい時は ✕ か外側を押す＝カードは動かない。 */
      + '  <div class="pp-actions">'
      + '    <button class="vh-btn primary" id="mg-ok" onclick="PitMechGuard.close(1)">このまま進める</button>'
      + '  </div>'
      + '</div></div>';
    document.body.appendChild(bd);
    /* 外側を押した＝やめる（移動しない）。入れた担当者はそのまま残す（本当の情報なので捨てない）。 */
    pitModalOutside(bd, function (){ PitMechGuard.close(0); });
    /* チップを押されたら、その場で描き直す（配分バーもライブで動く） */
    if (window.PitMechPick) PitMechPick.on('mg', function (c){
      try { if (window.PitDB) PitDB.save(); } catch(err){}
      paint(c);
    });
  }

  function paint(c){
    var box = el('mg-pick');
    if (box && window.PitMechPick) box.innerHTML = PitMechPick.html(c, 'mg', { liveId: 'mg-mech-live' });
    if (window.icHydrate) { try { icHydrate(box); } catch(e){} }
    var ok = el('mg-ok');
    if (ok) ok.textContent = (window.PitMechPick && PitMechPick.isEmpty(c)) ? 'このまま進める' : '入れて作業完了へ';
  }

  window.PitMechGuard = {
    needed: needed,
    doneColId: doneColId,
    /* go＝OKだった時に続ける処理（＝カードを実際に動かす） */
    open: function (card, go){
      build();
      pending = { card: card, go: go };
      el('mg-move').innerHTML =
        '<span class="pp-to">' + esc(((window.pitCustName ? pitCustName(card) : card.customer) || '（未入力）') + ' 様') + '</span>'
        + (card.car ? '<span class="pp-who">' + esc(card.car) + '</span>' : '');
      paint(card);
      el('mg-backdrop').classList.add('show');
      if (window.icHydrate) { try { icHydrate(el('mg-backdrop')); } catch(e){} }
    },
    close: function (ok){
      var bd = el('mg-backdrop'); if (bd) bd.classList.remove('show');
      var p = pending; pending = null;
      if (!p) return;
      if (!ok){ if (window.pitToast) pitToast('移動をやめました'); return; }
      try { p.go(); } catch(e){ if (window.console) console.error(e); }
    }
  };
})();
