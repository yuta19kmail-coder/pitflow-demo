/* ========================================
   coreflow-return-plan.js  -  返車予定の「どのくらい確かか」（全アプリ共通の本体）
   ----------------------------------------
   🔴 **本体はここ（_shared）だけ。** アプリ側の js\ にあるのは配られたコピー。
      直す時は必ずここを直して `sync-shared.ps1` を走らせること。

   ◎なにをするもの（ゆうた指定 2026-08-20）
     🗣「今日明日、今週の洗車予定に関しては、未完も含めて、**タスクボード上にあったとしても**、
     　　暫定返車予定・確定返車予定が今日明日 or 今週末にかぶるようなら**基本表示させる**」
     🗣「**とにかく状況によっては整備完了を待たずに洗車も始めないとスケジュールが追いつかなくなる**」
     🗣（別枠にしたら）「**このエリアの重要度が分からなくなるから、未定バッジをつけて一緒に並べた方がよくない？**」

     ＝ 予約カード1枚を渡すと「**いつ返す予定か**」と「**それはどのくらい確かか**」を返す。
     PitFlow の車販作業でも CarFlow の整備依頼業務でも**同じ答え**になる。

   ◎4段階（同じオレンジの濃淡で出す。色を増やさない）
     | 返り値    | 札        | 形          | 意味 |
     |-----------|-----------|-------------|------|
     | 'fixed'   | （なし）  | —           | **確定**＝完TELを通って決まった日 |
     | 'pending' | **未完**  | 塗りつぶし  | 確定返車日は入っているが、まだ完TEL前（盤面にいる） |
     | 'plan'    | **暫定**  | 枠だけ      | 受注のときのお客様への約束。**日が動くことがある** |
     | 'sameday' | **暫定**  | 枠だけ      | 待ち・当日返し＝入庫日に返る |
     | 'tbd'     | **未定**  | 破線の枠    | 完TELまで来たのに返車日が決まっていない＝**日を決めに行く車** |

   ◎🔴🔴 いちばん大事な線引き（ここを間違えると事故る）
     | どこ | 何で拾うか |
     |---|---|
     | **返車カレンダー・当日ビュー** | 🔴 **確定だけ**（＋未完）。**暫定は絶対に出さない** |
     | **洗車の予定（車販作業／整備依頼業務）** | **確定 → 未完 → 暫定 → 待・当** ＝段取り用に広く拾う |
     ⚠ 混ぜると v1.65.0 で潰した「**確定していない車が返車予定に出る**」が戻る。
     　 洗車は「先に手をつける」ための一覧、返車カレンダーは「お客様との約束の一覧」。**目的が違う。**

   ◎使い方（アプリ側）
     CFReturnPlan.date(card)  → 'YYYY-MM-DD' or ''      いつ返す予定か
     CFReturnPlan.kind(card)  → 'fixed'|'pending'|'plan'|'sameday'|'tbd'|''
     CFReturnPlan.badge(kind, size)  → 札のHTML（'mini' / 'std' / 'row'）。要らない時は ''
     ・window.pitReturnPending / pitReturnIsPending / pitReturnPlanDate / pitReturnPlanKind /
       pitPendingBadge / pitPlanBadge / pitTbdBadge にも入れてある（PitFlow の呼び名）

   ◎🔴 なぜ「未完」に **作業完了（workDone）** の条件が要るのか
     PitFlow は確定返車日の入力欄を「**作業完了に入ってから**」しか出していない。
     だから「作業完了で日付を持っている」＝**人が確定日として入れたもの**、と言い切れる。
     ⚠ ここを「日付があれば未完」に緩めると、作業完了より前の車が持っている日付＝
     　 **お客様への約束（B）**まで拾ってしまう。**緩めないこと。**
   ======================================== */
(function (w) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function dead(c) {
    return !c || c.status === 'returned' || c.status === 'scrap' || c.status === 'cancelled';
  }

  /* ── 待ち・当日返しが付いているか
     ⚠ 駐車場の「いちばん重い方」とは考え方が違う。**1つでも付いていれば当日返しがあり得る**＝
        取りこぼさない側に倒す。
     🔴 PitFlow は自分の `pitDropIsSameDay` を持っているので、**あればそちらを使う**（写しを増やさない）。
        下の1行は、それを持っていないアプリ（CarFlow）のためのもの。 */
  function sameDay(c) {
    if (w.pitDropIsSameDay) return !!w.pitDropIsSameDay(c);
    return !!c && [c.dropType, c.dropType2].some(function (t) { return t === 'wait' || t === 'sameDay'; });
  }

  /* ── B＝暫定（受注のときにお客様へ伝えた約束の日）
     ⚠ 旧データの吸収＝まだ盤面にいて（完TEL前）、待・当でもない車の日付は「約束」だった。 */
  function B(c) {
    if (w.pitReturnB) return String(w.pitReturnB(c) || '');
    if (!c) return '';
    if (c.returnDatePlan) return String(c.returnDatePlan);
    if (!c.returnStage && !sameDay(c) && c.returnDate) return String(c.returnDate);
    return '';
  }

  /* ── C＝確定（完TELを通った日／待・当は完TEL前でも確定日を持てる） */
  function C(c) {
    if (w.pitReturnC) return String(w.pitReturnC(c) || '');
    if (!c) return '';
    if (c.returnStage) return String(c.returnDate || '');
    if (sameDay(c)) return String(c.returnDate || '');
    return '';
  }

  /* ── 未完＝盤面にいるまま、確定返車日だけ先に入っている車
     🔴 returnStage は付けない＝**カードは盤面から消えない**。これは「出す側で拾う」だけ。 */
  function pending(c) {
    if (dead(c) || !c || c.status === 'reserved') return '';
    if (c.returnStage) return '';        /* すでに返車系にいる＝未完ではない */
    if (sameDay(c)) return '';           /* 待ち・当日返しは入庫日で出る */
    if (c.status !== 'workDone') return '';   /* 確定返車日を入れられるのは作業完了から */
    return String(c.returnDate || c.returnDateFinal || '');
  }
  function isPending(c) { return !!pending(c); }

  /* ── いつ返す予定か（確からしさの高い順に拾う） */
  function date(c) {
    if (dead(c)) return '';
    var v = C(c);       if (v) return v;
    v = pending(c);     if (v) return v;
    v = B(c);           if (v) return v;
    if (sameDay(c) && c.reserveDate) return String(c.reserveDate);
    return '';
  }
  function kind(c) {
    if (dead(c)) return '';
    if (C(c))       return 'fixed';
    if (pending(c)) return 'pending';
    if (B(c))       return 'plan';
    if (sameDay(c) && c.reserveDate) return 'sameday';
    if (c.returnStage) return 'tbd';    /* 完TELまで来たのに日が決まっていない */
    return '';
  }

  /* ── 札（言葉も形もここ1本。画面ごとに書き写さない）
     size … 'mini'（狭い所）／'std'／'row'（当日ビューの行＝となりの札と同じ寸法を借りる） */
  var LABEL = { pending: '未完', plan: '暫定', sameday: '暫定', tbd: '未定' };
  var TITLE = {
    pending: '返車日は確定していますが、まだ完TELを通っていません（作業はまだ終わっていません）',
    plan:    '受注のときにお客様へ伝えた返車予定です（まだ確定していないので、日が動くことがあります）',
    sameday: '入庫したその日に返る車です（返車時間はまだ決まっていません）',
    tbd:     '完TELまで来ていますが、返車日がまだ決まっていません（日を決めに行く車）'
  };
  var CLS = { pending: 'ret-pend', plan: 'ret-plan', sameday: 'ret-plan', tbd: 'ret-tbd' };

  function badge(k, size) {
    if (!k || !LABEL[k]) return '';       /* 確定には札を付けない */
    size = size || 'std';
    return '<span class="' + (size === 'row' ? 'tag-side ' : '') + CLS[k] + ' ret-pend-' + size
         + '" title="' + esc(TITLE[k]) + '">' + esc(LABEL[k]) + '</span>';
  }
  function badgeOf(c, size) { return badge(kind(c), size); }

  /* ── 触らせない時に出す言葉（未完の車は返車カレンダー・当日ビューで動かせない） */
  w.PIT_PENDING_LABEL = LABEL.pending;
  w.PIT_PENDING_TITLE = TITLE.pending;
  w.PIT_PENDING_WHY   = '完TELを通っていない車は、ここでは動かせません。タスクボードで完TEL済／完TEL依頼へ入れてください';
  w.PIT_PLAN_LABEL = LABEL.plan;  w.PIT_PLAN_TITLE = TITLE.plan;
  w.PIT_TBD_LABEL  = LABEL.tbd;   w.PIT_TBD_TITLE  = TITLE.tbd;

  /* PitFlow の呼び名でも使えるように（既存のコードをそのまま動かすため） */
  w.pitReturnPending   = pending;
  w.pitReturnIsPending = isPending;
  w.pitReturnPlanDate  = date;
  w.pitReturnPlanKind  = kind;
  w.pitPendingBadge = function (size) { return badge('pending', size); };
  w.pitPlanBadge    = function (size) { return badge('plan', size); };
  w.pitTbdBadge     = function (size) { return badge('tbd', size); };

  w.CFReturnPlan = { date: date, kind: kind, pending: pending, isPending: isPending,
                     badge: badge, badgeOf: badgeOf, sameDay: sameDay, B: B, C: C,
                     LABEL: LABEL, TITLE: TITLE, CLS: CLS };
  console.log('[coreflow-return-plan] ready（返車予定の確からしさ・全アプリ共通）');
})(window);
