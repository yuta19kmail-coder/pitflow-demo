/* ========================================
   coreflow-loaner-remain.js  -  代車の「あと何日か・何色か」（全アプリ共通の本体）
   ----------------------------------------
   🔴 **本体はここ（_shared）だけ。** アプリ側の js\ にあるのは配られたコピー。
      直す時は必ずここを直して `sync-shared.ps1` を走らせること。

   ◎なにをするもの（ゆうた指定 2026-08-19）
     🗣「あくまで **PitFlow の出張画面**だから、**PitFlow に完全に準拠**してほしい」

     ＝ 予約カード1枚を渡すと「代車が付いているか・返ってきたか・あと何日か・何色か」を返す。
     PitFlow でも CarFlow でも**同じ答え**になる。

   ◎なぜ切り出したか
     ⚠ CarFlow の「整備依頼業務」（PitFlow の車販作業をそのまま出す画面）が、
        **同じ計算を自分の中に写しで持っていた。**しかも古い版で、**返したかどうかを見ていなかった。**
        ＝ PitFlow では灰色の「返却済」の車が、**CarFlow では赤い「超過◯日」**で出ていた。
        （PitFlow は v1.82.0 で直したが、写しには届いていなかった）
     🔴 **写しを作らない。**判定はここ1本。

   ◎使い方（アプリ側）
     CFLoanerRemain.setup({
       assigns: function(){ ... 代車の貸出（貸した札）の配列 ... },
       colors:  function(){ ... { greenMin, amberMin } ... }
     });
     CFLoanerRemain.of(card)  → { has, back, at, due, rem, level }

   ◎決めごと（PitFlow の元の作りをそのまま持ってきている）
     🔴 **返ってきたかは「貸した札」が正。**カードの印は予備（札が無い時だけ見る）。
     🔴 **返ってきていたら日数は数えない**（level='back'）。返ってきた車を催促しない。
     ⚠ **車は返したのに代車が戻っていない時は、ちゃんと超過（黒）で出す。**これは知らせるべき事故。消さない。
     ⚠ 色の境目は設定から取る（既定＝4日以上は緑／2日以上は黄／それ未満は赤／マイナスは黒）。
   ======================================== */
(function (w) {
  'use strict';

  var cfg = {};

  function arr(v) { return Array.isArray(v) ? v : []; }
  function call(fn, dflt) { try { return fn(); } catch (e) { return dflt; } }
  function assigns() { return cfg.assigns ? arr(call(function () { return cfg.assigns(); }, [])) : []; }
  function colors()  { return (cfg.colors ? call(function () { return cfg.colors(); }, null) : null) || {}; }

  function _pd(s) { return new Date(String(s) + 'T00:00:00'); }
  function _today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function _diffDays(fromStr, toStr) {
    var a = _pd(fromStr), b = _pd(toStr);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    return Math.round((b - a) / 86400000);
  }

  /* 返ってきているか（＋返した日）。**貸した札が正・カードの印は予備。** */
  function backOf(c) {
    if (!c) return { back: false, at: '' };
    var a = assigns().find(function (x) { return x && x.cardId === c.id; });
    if (a && a.returned) return { back: true, at: a.returnedAt || a.toDate || '' };
    if (c.loanerReturned === true) return { back: true, at: c.loanerTo || '' };
    return { back: false, at: '' };
  }

  /* 色の段階。⚠ 境目を画面ごとに書かないこと。 */
  function levelOf(rem) {
    if (rem == null) return 'none';
    var s = colors();
    var g = (s.greenMin != null) ? s.greenMin : 4;
    var a = (s.amberMin != null) ? s.amberMin : 2;
    if (rem < 0)  return 'dead';    /* 期限を過ぎている＝まだ戻っていない */
    if (rem >= g) return 'green';
    if (rem >= a) return 'amber';
    return 'red';
  }

  /* 画面が使う唯一の物差し。
       has   … その予約に代車が付いているか
       back  … 返ってきたか
       at    … 返した日（back の時）
       due   … 返却予定日
       rem   … あと何日（マイナス＝超過／null＝期限未設定）
       level … 'back' | 'green' | 'amber' | 'red' | 'dead' | 'none' */
  function of(c) {
    if (!c || !c.needLoaner) return { has: false, back: false, at: '', due: '', rem: null, level: 'none' };
    var due = c.loanerTo || c.returnDateFinal || c.returnDate || '';
    var bk = backOf(c);
    if (bk.back) return { has: true, back: true, at: bk.at || due, due: bk.at || due, rem: null, level: 'back' };
    var rem = due ? _diffDays(_today(), due) : null;
    return { has: true, back: false, at: '', due: due, rem: rem, level: levelOf(rem) };
  }

  function setup(o) { cfg = o || {}; return w.CFLoanerRemain; }

  w.CFLoanerRemain = { setup: setup, of: of, backOf: backOf, levelOf: levelOf };
  console.log('[coreflow-loaner-remain] ready（代車の残り日数と色・全アプリ共通）');
})(window);
