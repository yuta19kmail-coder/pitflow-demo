/* ========================================
   modal-outside.js ── 窓の「外側を押したらやめる」の決めごと（PitFlow v1.109.0）
   ----------------------------------------
   ◎直したこと（2026-08-17・ゆうた報告）
     🗣「タスクボードから完TEL済みにドラッグすると『やめました』と出てはじかれる」

     ・完TEL済の窓で **返車時間を触ってから**「返車予定に入れる」を押すと、
       押した瞬間に時間の候補パネルが閉じて、**ボタンが上へ跳ねて逃げる**。
       指を離す頃にはそこにボタンが無いので、ブラウザは
       **「窓の外側を押した」**として伝えてくる。
       ＝入力ぜんぶが「やめた」扱いで捨てられ、カードは盤面に戻っていた。
     ・完TEL依頼の窓には返車時間の欄が無いので、こちらだけ今までどおり通っていた。

   ◎決めごと
     🔴 **押し始めた場所が外側の時だけ、やめる。**
        押し始めが窓の中なら、指を離した場所が外でも**やめない**。
     🔴 窓ごとに書かない。**ここ1本**を通す（写しを作ると、また同じ事故が起きる）。

   ◎使いかた
     pitModalOutside(背景の要素, function(){ …やめる時の処理… });
     ⚠ 「押したのは外側か」は **その要素そのものが押されたか**で見る（中身は素通し）。
   ======================================== */
(function (w) {
  'use strict';

  function pitModalOutside(bd, onCancel){
    if (!bd || typeof onCancel !== 'function') return;
    if (bd.getAttribute('data-outside') === '1') return;   /* 二重配線よけ */
    bd.setAttribute('data-outside', '1');

    var fromOutside = false;
    var mark = function (e){ fromOutside = (e.target === bd); };
    /* pointerdown が効かない環境でも mousedown で拾える（どちらも同じ答えになる） */
    bd.addEventListener('pointerdown', mark);
    bd.addEventListener('mousedown', mark);

    bd.addEventListener('click', function (e){
      if (e.target !== bd) return;     /* 中身を押した＝やめない */
      if (!fromOutside) return;        /* 🔴 押し始めは中身だった＝やめない */
      fromOutside = false;
      onCancel();
    });
  }

  w.pitModalOutside = pitModalOutside;
})(window);
