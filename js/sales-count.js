/* ========================================
   sales-count.js  -  「売上をどの月に数えるか」を決める、たった1本の物差し
   ----------------------------------------
   PitFlow v1.61.0（2026-08-06・ゆうた指定）

   ◎ゆうた指定
     「売上サマリー等の集計に、受注済みの確定金額が入っている車両でも、
       返車予定が当月内でなければ、その時までずらす。
       基本的には**返車予定日が月内かどうか**が分けるポイント」

   ◎これまで（不具合）
     売上ビューの「確定（受注済）」「予定」「見込」は、**進行中というだけで無条件に当月**へ積んでいた。
     返車予定が翌月の車まで今月の着地見込みに乗ってしまい、月をまたぐたびに数字が二重に見えた。

   ◎これから（決めごと）
     🔴 **1台につき「数える日」は1つだけ**。その日が入っている月に、その台の金額を積む。

     | 状態 | 数える日 |
     |---|---|
     | 実績（返車済み） | **実績カウント日 `completedAt`**（無ければ確定返車日→返車日） |
     | 進行中（受注済・見積提示済・入庫済） | **返車予定日 `returnDate`** |
     | 予約（未入庫） | **返車予定日**。無ければ **入庫予定日＋概算 預かり日数** |

     - **返車予定日が空（未定）＝当月に寄せる**（決まった時点で自動でその月へ移る）
     - **返車予定日が過ぎている（遅れている）＝当月に寄せる**（締めた過去の月の数字を後から動かさない）
     - **実績だけは日付そのまま**（過去は過去のまま。寄せない）

   ◎使い方
     - `pitSalesCountDate(c)` … その車の金額を数える日（'YYYY-MM-DD'／未定は ''）
     - `pitSalesTier(c)`      … 確度の区分（actual/confirmed/planned/prospect/forecast／対象外は null）
     - `pitSalesInRange(c, fromStr, toStr, todayStr)` … その期間に数えるか（true/false）

   🔴 **写しを作らないこと。** 期間で絞る集計は必ずこの3本を通す。
      （sales.js / mydash.js / mech-summary.js / maintdash.js が呼んでいる）

   ◎ v1.99.0（2026-08-15・ゆうた指定）**「売上なしでアーカイブ」した車**
     🔴 **売上0円で返した車は、実績にも売上にも一切乗せない。** ただし**来店した事実は残す**
        （＝お客様の来店履歴には出す。次に来た時に前回なにをしたか分かるように）。
     🔴 **その車かどうかの物差しは `pitCardNoSale(c)` 1本。** 画面ごとに `c.noSale` を直に見ないこと。
        ⚠ 印が付いた車は `pitSalesTier` が **null**／`pitSalesInRange` が **false**／
           `pitSalesCountDate` が **''**（数える日が無い）を返す。＝期間の集計を通る道は全部ふさいである。
     🔴 **実績カウント日（completedAt）は入れない。** 実績カレンダー・月次の実績・ダッシュボードは
        全部この日付で拾っているので、**日付を入れない＝どこにも数えられない**が一番事故が少ない（二重の守り）。

   ⚠ 読み込みは state.js より後ろ、使う側（sales.js / mydash.js …）より前。
   ======================================== */
(function(){
  'use strict';

  var CONFIRMED = ['parts','work','workDone','outsource'];   // 受注済＝パーツ待ち以降

  /* ===== ⓪「売上なしでアーカイブ」した車か =====
     🔴 v1.103.0 **判定そのものは `js/pit-share.js` に移した**（MHS からも借りるため）。
        ここは呼ぶだけ。**条件をここに書き戻さないこと。** */
  function pitCardNoSale(c){ return window.pitCardNoSale ? window.pitCardNoSale(c) : !!(c && c.noSale); }

  function s(v){ return (v == null) ? '' : String(v); }
  function n(v){ v = +v; return isFinite(v) ? v : 0; }
  function pad(x){ return (x < 10 ? '0' : '') + x; }
  function ymdL(d){ return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
  function addStr(str, days){
    var p = s(str).split('-'); if (p.length !== 3) return '';
    var d = new Date(+p[0], (+p[1])-1, +p[2]); if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + days); return ymdL(d);
  }
  function today(){ var t = new Date(); t.setHours(0,0,0,0); return ymdL(t); }

  /* 概算の預かり日数（カードの指定 → 作業タイプ別の目安 → 5日） */
  function holdOf(c){
    if (c && c.estHoldDays != null && c.estHoldDays !== '') return Math.max(0, n(c.estHoldDays));
    if (window.pitEstHold){
      try { return Math.max(0, n(pitEstHold(c.workType, c.dropType, window.pitTeamKey ? pitTeamKey(c) : 'default'))); } catch(e){}
    }
    return 5;
  }

  /* 🆕 v1.156.0（ゆうた指定）**案内用の「暫定預かり日数」。まだ決まっていなければ null。**
     ⚠ 上の holdOf は最後に必ず 5 を返す（売上の見込みには日付が要るため）。
     　 最短入庫日の案内は「**作業タイプを選んだか／まだか**」で決まりが変わるので、
     　 決まっていない時は **null** と答えるこちらを使う。
     🔴 元になる表は settings の estHold（作業タイプ別の目安）1本。ここで日数を決め打ちしない。 */
  function planHoldOf(c){
    if (!c) return null;
    if (c.estHoldDays != null && c.estHoldDays !== ''){
      var v = Math.max(0, n(c.estHoldDays));
      return v > 0 ? v : null;
    }
    var wt = c.workType || ((Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes[0] : '');
    if (!wt) return null;                 /* 作業タイプ未選択＝まだ決まっていない */
    if (window.pitEstHold){
      try {
        var h = Math.max(0, n(pitEstHold(wt, c.dropType, window.pitTeamKey ? pitTeamKey(c) : 'default')));
        return h > 0 ? h : null;          /* 待ち・当日返しは 0＝代車の話にならない */
      } catch (e) {}
    }
    return null;
  }

  /* ===== ①その車の金額を「いつ」数えるか =====
     🔴 v1.65.0（ゆうた確定）返車日は**3段のチェーン**になった（return-slot.js）。
        まだ返していない車は **C（確定返車日）→ B（受注時の約束）→ A（概算＝入庫日＋預かり日数）** の順に見る。
        ゆうた指定「予定で月内に入るか入らないかは B を見る」＋ 完TEL済なら C のほうが確かなので C を先に。
     ⚠ ここで日付を組み立てないこと。**物差しは return-slot.js の 1本**。 */
  function pitSalesCountDate(c){
    if (!c) return '';
    if (pitCardNoSale(c)) return '';        /* 🔴 v1.99.0 売上なし＝数える日そのものが無い */
    /* 実績＝実績カウント日が正。返車日は予備（v1.57.0 で completedAt が売上の基準になった） */
    if (c.status === 'returned') return s(c.completedAt) || s(c.returnDateFinal) || s(c.returnDate);
    if (window.pitReturnDates){
      var d = pitReturnDates(c);
      return s(d.c) || s(d.b) || s(d.a);
    }
    /* 部品が無い時の保険（読み込み順が崩れた場合） */
    if (s(c.returnDatePlan)) return s(c.returnDatePlan);
    if (s(c.returnDate)) return s(c.returnDate);
    if (s(c.reserveDate)) return addStr(s(c.reserveDate), holdOf(c));
    return '';   /* ＝未定 */
  }

  /* ===== ②確度の区分（状態だけで決まる。期間は見ない） ===== */
  function pitSalesTier(c){
    if (!c || c.status === 'scrap') return null;
    if (pitCardNoSale(c)) return null;      /* 🔴 v1.99.0 売上なし＝どの区分にも入れない */
    var st = c.status;
    if (st === 'returned') return 'actual';                                            /* 実績＝返車済み */
    if (st === 'reserved') return 'forecast';                                          /* 予測＝未入庫の予約 */
    if (c.returnStage || CONFIRMED.indexOf(st) >= 0) return 'confirmed';               /* 確定＝受注済（パーツ待ち以降・完TEL待ち） */
    if (st === 'contact') return 'planned';                                            /* 予定＝連絡中（見積提示済） */
    if (st === 'check' || st === 'estim') return 'prospect';                            /* 見込＝入庫済・受注前 */
    return null;
  }

  /* ===== ③その期間（月・クォーター）に数えるか ===== */
  function pitSalesInRange(c, fromStr, toStr, todayStr){
    if (!c) return false;
    if (pitCardNoSale(c)) return false;     /* 🔴 v1.99.0 売上なし＝どの期間にも数えない */
    todayStr = todayStr || today();
    var d = pitSalesCountDate(c);

    /* 実績＝日付そのまま。過去も未来も寄せない */
    if (c.status === 'returned') return !!d && d >= fromStr && d <= toStr;

    /* 🔴 まだ返していない車は、もう終わった期間には出さない（締めた月の数字を後から動かさない） */
    if (toStr < todayStr) return false;

    var isCur = (todayStr >= fromStr && todayStr <= toStr);   /* いま見ている期間が「今」を含むか */
    if (!d) return isCur;                          /* 返車予定日が未定＝当月に寄せる */
    if (d >= fromStr && d <= toStr) return true;   /* 期間内＝そのまま */
    if (d > toStr) return false;                   /* 先の月＝そちらへずらす（ここには出さない） */
    return isCur;                                  /* 予定日が過ぎている＝当月に寄せる */
  }

  window.pitSalesCountDate = pitSalesCountDate;
  window.pitSalesTier      = pitSalesTier;
  window.pitSalesInRange   = pitSalesInRange;
  window.pitSalesHoldOf    = holdOf;
  window.pitCardHoldDays   = planHoldOf;   /* 🆕 v1.156.0 案内用（未選択なら null） */
})();
