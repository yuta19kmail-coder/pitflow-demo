/* ========================================
   overdue-pit.js  -  「当日を過ぎたもの」を自動で正しい場所へ動かす  PitFlow v1.101.0
   ----------------------------------------
   ◎ゆうた指定（2026-08-15）
     「当日を過ぎた時点で**入庫が完了していない車両**に関しては、
       予約→未定の**未入庫**のエリアに自動で移動する。
       **返車が完了してない車両**に関しては**全て日付未定**にし、
       返車→未定の**返車日未定**エリアに自動で移動する」

   ◎なぜ要るか
     日付が過ぎた予約・返車は、**どのカレンダーにも出なくなって静かに消える**。
     「今日」を見ている限り気づけないので、取り残しがそのまま溜まっていた。
     過ぎたものは**必ずどこかの箱に落ちる**ようにして、目で拾えるようにする。

   ◎決めごと（ゆうたに確認済み・2026-08-15）
     🔴 **動かすのは本予約だけ。** 仮予約（仮おさえ）と承認待ちは動かさない。
        ＝承認待ちが勝手に未入庫へ消えると、**承認され忘れに誰も気づけなくなる**（v1.74.0 の決めごと）。
     🔴 **自動の「未入庫」と、人が押す「予約キャンセル」は別物。**
        ・未入庫（ここ）＝来なかっただけ。今までどおり**1ヶ月で自動アーカイブ**。**来店履歴には出さない**
        ・予約キャンセル（card-view.js）＝人が決めたもの。すぐアーカイブし、**来店履歴に「キャンセル」で残す**
     🔴 **返車は待ち・当日返しの車も対象**（ゆうた指定）。
        ⚠ ただし**待ち・当日返しの車のデータは書き換えない**。盤面には残したまま、
           「返車日未定」に**出す側の判定**（return-slot.js の pitReturnPlace）で拾う。
           入庫日は消せない（本当に入庫した日だから）ので、書き換えでは表せない。
     🔴 **黙って動かすが、必ずフローに1行残す。**（いつ・なぜ動いたかが分からないと、現場が混乱する）
     ⚠ **1日1回ではなく、画面を描くたびに見る。** 開いている端末が日をまたいでも効く。
        変わったものが無ければ**保存しない**（無駄な通信をしない）。

   ◎この1本が持つもの（各画面は呼ぶだけ）
     pitIntakeOverdue(c, td)  … 入庫日を過ぎたのに、まだ入庫していない本予約か
     pitReturnOverdue(c, td)  … 返車予定日を過ぎたのに、まだ返していない車か（完TELを通ったもの）
     pitAutoOverdue()         … 実際に動かす。動かした数を返す
   ⚠ 読み込みは return-slot.js より後ろ（pitReturnSetDateTime を使う）。呼び出しは views.js の showView から。
   ======================================== */
(function (w, d) {
  'use strict';

  var _busy = false;

  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function today(){ var t = new Date(); t.setHours(0,0,0,0); return t.getFullYear() + '-' + pad(t.getMonth()+1) + '-' + pad(t.getDate()); }
  function cards(){ return (w.state && Array.isArray(state.cards)) ? state.cards : []; }
  function flow(c, txt){ try { if (w.logFlow) logFlow(c, txt); } catch(e){} }

  /* ===== ① 入庫の期限切れ ===== */
  function pitIntakeOverdue(c, td){
    if (!c || c.status !== 'reserved') return false;   /* 入庫済み以降はそもそも対象外 */
    if (c.tentative)       return false;               /* 🔴 仮予約は動かさない（ゆうた指定） */
    if (c.approvalPending) return false;               /* 🔴 承認待ちも動かさない（ゆうた指定） */
    if (c.intakeTbd)       return false;               /* 入庫日がまだ決まっていない＝過ぎようがない */
    if (c.archived)        return false;
    if (c._draft)          return false;               /* 書きかけの下書き（blank-cards.js） */
    td = td || today();
    return !!c.reserveDate && String(c.reserveDate) < td;
  }

  /* ===== ② 返車の期限切れ（完TELを通った車＝日付を持っている車） =====
     ⚠ 待ち・当日返しで完TEL前の車はここでは触らない（データを書き換えられないため）。
        あちらは pitReturnPlace が「返車日未定」に出す。 */
  function pitReturnOverdue(c, td){
    if (!c) return false;
    if (!c.returnStage) return false;
    if (c.status === 'returned' || c.status === 'scrap' || c.status === 'cancelled' || c.status === 'reserved') return false;
    if (w.pitCardNoSale && pitCardNoSale(c)) return false;   /* 売上なしで片付けた車は触らない */
    td = td || today();
    return !!c.returnDate && String(c.returnDate) < td;
  }

  /* ===== 実際に動かす ===== */
  function pitAutoOverdue(){
    if (_busy) return 0;
    /* ⚠ クラウドを読み終わる前に触らない（v1.2.1 の決めごと＝読む前に書かない） */
    if (w.PIT_CLOUD && w.PitDB && !w.PitDB._loaded) return 0;

    _busy = true;
    var td = today(), n = 0;
    try {
      cards().forEach(function (c) {
        if (pitIntakeOverdue(c, td)){
          var was = c.reserveDate;
          c.status      = 'cancelled';   /* ＝未入庫の箱。1ヶ月で自動アーカイブ（undetermined.js） */
          c.noShow      = true;          /* 🔴 自動で来なかった印。人が押した「予約キャンセル」と混ぜない */
          c.noShowAt    = td;
          c.cancelledAt = c.cancelledAt || td;   /* 1ヶ月の数えはじめ（今までと同じ入れ物） */
          c.bayId = null; c.baySlot = null;
          /* 🔄 v1.155.0（ゆうた確定）**自動で未入庫にする時、代車の予定は外さない。**
             🗣「**2・3 は勘違いしてくるってパターンが結構あるから、未入庫に入る時点では残しておいて**」
             ＝ 来なかったように見えても、あとから連絡が来てそのまま入庫することがよくある。
                自動で外すと、戻した時に**押さえ直し**になる（先に別の人へ貸されているかもしれない）。
             🔴 外すのは**人が決める**（未入庫の一覧の「代車予定クリア」）か、
                **30日たって自動アーカイブされる時**（undetermined.js の `pitAutoArchive`）。
             ⚠ v1.154.0 はここで自動で外していた。**わざと戻した。**
             ⚠ 何が残っているかは、あとで追えるようにフローに書く。 */
          var _lo = (w.pitLoanerPlanOf ? w.pitLoanerPlanOf(c.id) : { n: 0, text: '' });
          flow(c, '入庫日（' + was + '）を過ぎたので未入庫へ（自動）'
                + (_lo.n ? '（代車の予定はそのまま：' + _lo.text + '）' : ''));
          n++;
          return;
        }
        if (pitReturnOverdue(c, td)){
          var wasR = c.returnDate;
          if (w.pitReturnSetDateTime) pitReturnSetDateTime(c, '', '');
          else { c.returnDate = ''; c.returnTime = ''; }
          c.returnDateFinal = null;      /* 確定返車日も過ぎている＝もう確定ではない */
          flow(c, '返車予定日（' + wasR + '）を過ぎたので返車日未定へ（自動）');
          n++;
        }
      });
      if (n && w.PitDB && w.PitDB.save) PitDB.save();
    } catch (e) {
      console.warn('[overdue-pit] 自動移動でつまずきました', e);
    }
    _busy = false;
    return n;
  }

  w.pitIntakeOverdue = pitIntakeOverdue;
  w.pitReturnOverdue = pitReturnOverdue;
  w.pitAutoOverdue   = pitAutoOverdue;
  console.log('[overdue-pit] ready（当日を過ぎた予約・返車の自動移動）');
})(window, document);
