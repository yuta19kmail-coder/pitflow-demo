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
  /* 🔴 v2.22.0 **自動でやったことに人の名前を押さない。**（card-tabs.js の `logFlowAuto` 1本）
     ⚠ 自動処理は「画面を開いた端末」で走る。今までは、その端末にたまたまログインしていた人の
        名前がフローに残っていた＝**やっていない人がやったことになっていた**（実際に起きた）。 */
  function flow(c, txt){ try { if (w.logFlowAuto) logFlowAuto(c, txt); else if (w.logFlow) logFlow(c, txt); } catch(e){} }
  /* 操作ログ（車ごとのフローとは別の、全体の記録）。こちらも「自動」で残す。 */
  function op(action, c, why){
    try {
      if (!w.pitLog) return;
      var tag = w.pitCardTag ? w.pitCardTag(c) : ((c && c.customer) || '');
      w.pitLog(action, { auto: true, cardId: c && c.id, kind: 'auto',
        label: tag + (why ? ' / ' + why : '') });
    } catch(e){}
  }

  /* ===== ① 入庫の期限切れ =====
     🔴🔴 v2.22.0（2026-08-28・**事故を受けて**・ゆうた確定）
     -------------------------------------------------------------------
     ◎なにが起きたか
       予約 C63175 が**タスクボードから消えて未入庫にいた**（入庫した実績ごと消えていた）。
       操作ログには**人が動かした記録が1行も無い**＝**人は押していない**。
       残っていたのは自動処理の1行だけだった。
       🗣 ゆうた「**このカードがなくなったり、勝手に動いたり（タスクボード以外で）は
       　　マジでわからなくなるし、下手したら探し出せないからマジでなくしてほしい**」
     ◎正体
       ここは `status === 'reserved'` **だけ**を見ていて、
       **その車が本当に入庫したかどうか（`actualInAt`）を見ていなかった。**
       何かの拍子に status が 'reserved' に巻き戻ると（端末どうしの行き違い・
       入庫の保存がクラウドに届かなかった等）、**入庫済みの車まで未入庫へ落ちる。**
       しかも落ちた先で `bayId` も消すので、盤面から本当に見えなくなる。
     ◎決めごと（ゆうた確定）
       🔴 **実入庫日（`actualInAt`）がある車は、入庫日が過ぎていても絶対に自動で動かさない。**
       　 原因が何であっても、**盤面から車が消える事故はここで止まる。**
       🔴 黙って見逃さない＝そういう車は**データチェックに赤で出す**（inspect-rules.js の F11）。
       ⚠ 「入庫を取り消して予約に戻す」は `actualInAt` も消す（card-view.js）＝
       　 本当に入庫を取り消した車は、今までどおりちゃんと未入庫へ落ちる。
     ===================================================================== */
  function pitIntakeOverdue(c, td){
    if (!c || c.status !== 'reserved') return false;   /* 入庫済み以降はそもそも対象外 */
    if (c.actualInAt)      return false;               /* 🔴 v2.22.0 入庫した実績がある＝動かさない */
    if (c.tentative)       return false;               /* 🔴 仮予約は動かさない（ゆうた指定） */
    if (c.approvalPending) return false;               /* 🔴 承認待ちも動かさない（ゆうた指定） */
    if (c.intakeTbd)       return false;               /* 入庫日がまだ決まっていない＝過ぎようがない */
    if (c.archived)        return false;
    if (c._draft)          return false;               /* 書きかけの下書き（blank-cards.js） */
    td = td || today();
    return !!c.reserveDate && String(c.reserveDate) < td;
  }

  /* ===== ② 返車の期限切れ（完TELを通った車＝日付を持っている車） =====
     🔴🔴🔴 v2.25.0（2026-08-29・ゆうた指定）**ここでデータを書き換えるのをやめた。**
       それまでは returnDate を空にしていた＝**人が入れた返車日を、入れた1秒後に消していた**
       （予約 J32544。8/25 と入れる→消される→データチェックが「空」と赤→また入れる、の無限ループ）。
       🗣「返車日が決まる→来ない→**これは残した状態で**また未定に戻る→決める→返す」
       ＝ いまは **`return-slot.js` の `pitReturnPlace`（出す側）が未定の箱に出す。**
          データは1文字も触らない。**この関数は判定としてだけ残してある。**
     ⚠ 待ち・当日返しで完TEL前の車はここでは触らない（データを書き換えられないため）。
        あちらも pitReturnPlace が「返車日未定」に出す。＝**いまは全部この道1本。** */
  function pitReturnOverdue(c, td){
    if (!c) return false;
    if (!c.returnStage) return false;
    if (c.status === 'returned' || c.status === 'scrap' || c.status === 'cancelled' || c.status === 'reserved') return false;
    if (w.pitCardNoSale && pitCardNoSale(c)) return false;   /* 売上なしで片付けた車は触らない */
    td = td || today();
    return !!c.returnDate && String(c.returnDate) < td;
  }

  /* ===== 実際に動かす ===== */

  /* 1台ぶんの入れ替え（判定は済んでいる前提。ここでは判定しない） */
  function 未入庫へ(c, td){
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
    /* 🔴 v2.22.0 **操作ログにも残す。** ここが空だったせいで「ログには残ってない」になり、
       　 誰が動かしたのか（本当は誰も動かしていないのか）が分からなかった。 */
    op('未入庫へ自動で移動', c, '入庫日 ' + was + ' を過ぎたため');
  }

  /* 手元の写しで、動かす候補を拾う（ここではまだ動かさない） */
  function 候補を拾う(td){
    var out = [];
    cards().forEach(function (c) {
      if (!c || !c.id) return;
      if (pitIntakeOverdue(c, td)) out.push({ id: c.id, kind: 'in' });
    });
    return out;
  }
  function 動かす(list, td){
    var n = 0;
    list.forEach(function (x) {
      var c = cards().filter(function (y) { return y && y.id === x.id; })[0];
      if (!c) return;
      if (x.kind === 'in') { 未入庫へ(c, td); n++; }
    });
    if (n && w.PitDB && w.PitDB.save) PitDB.save();
    return n;
  }

  /* 🔴🔴🔴 v2.24.0 **動かす前に、その車だけサーバーを読み直す**（2026-08-29・事故を受けて）
     -------------------------------------------------------------------
     ◎なにが起きたか（2026-08-28 13:37:03）
       開きっぱなしの画面の線が切れ、**前日の入庫・工程・返車がその画面に届いていなかった。**
       そこでこの自動処理が走り、5件を「来なかった車」と判断して未入庫へ落とした。
       保存は**カードまるごと差し替え**なので、他の人が進めた作業も一緒に消えた。
       🗣 ゆうた「普通にあってはならないこと」
     ◎ここで直すこと
       🔴 **手元の写しだけで決めない。動かすと決めた車は、必ずサーバーの今の姿で判定し直す。**
       🔴 **1件でも読み直せなかったら、今回は何も動かさない。**
          読めない＝手元が古いかもしれない、ということ。**分からない時は触らないのが正解。**
     ⚠ v2.22.0 の「実入庫日があれば動かさない」は、**古い写しの実入庫日**を見ていたので効かなかった。
        関門そのものは正しい。**見る紙が古かった**だけ。だから読み直しが要る。
     ⚠ 読み直しは `PitDB.refreshDoc`（画面の写しと差分の控えの両方を本物に合わせる）。
        ここで自前に `state` を書き換えないこと＝控えがズレて、次の保存で別の事故になる。 */
  function pitAutoOverdue(){
    if (_busy) return 0;
    /* ⚠ クラウドを読み終わる前に触らない（v1.2.1 の決めごと＝読む前に書かない） */
    if (w.PIT_CLOUD && w.PitDB && !w.PitDB._loaded) return 0;

    var td = today();
    var 候補 = 候補を拾う(td);
    if (!候補.length) return 0;

    /* サンプルモード（この端末だけ）＝読み直す相手がいないので、今までどおり */
    var クラウド = !!(w.PIT_CLOUD && w.PitDB && w.PitDB.mode === 'cloud' && w.PitDB.refreshDoc);
    if (!クラウド) {
      _busy = true;
      var n = 0;
      try { n = 動かす(候補, td); } catch (e) { console.warn('[overdue-pit] 自動移動でつまずきました', e); }
      _busy = false;
      return n;
    }

    _busy = true;
    var 読めた = true;
    Promise.all(候補.map(function (x) {
      return w.PitDB.refreshDoc('cards', x.id).catch(function (e) { 読めた = false; return null; });
    })).then(function () {
      try {
        if (!読めた) {
          /* 🔴 読み直せなかった＝手元が古いかもしれない。**今回は1台も動かさない。** */
          console.warn('[overdue-pit] サーバーを読み直せませんでした。今回は何も動かしません');
          return;
        }
        /* 🔴 本物の姿で、もう一度判定する。ここで消える候補が「他の人が進めていた車」 */
        var 本物 = 候補を拾う(td).filter(function (x) {
          return 候補.some(function (y) { return y.id === x.id; });
        });
        var やめた = 候補.length - 本物.length;
        if (やめた) console.log('[overdue-pit] ' + やめた + '台は、サーバーの姿を見て動かすのをやめました');
        動かす(本物, td);
      } catch (e) {
        console.warn('[overdue-pit] 自動移動でつまずきました', e);
      } finally { _busy = false; }
    }, function () { _busy = false; });

    return 0;   /* クラウドでは非同期。数は返せない（呼び出し側は使っていない） */
  }

  w.pitIntakeOverdue = pitIntakeOverdue;
  w.pitReturnOverdue = pitReturnOverdue;
  w.pitAutoOverdue   = pitAutoOverdue;
  console.log('[overdue-pit] ready（当日を過ぎた予約・返車の自動移動）');
})(window, document);
