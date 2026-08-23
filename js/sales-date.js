/* ================================================================================
   sales-date.js  -  💴 「売上日」＝伝票が立った日。たった1本の物差し   PitFlow v1.185.0→v2.0.0
   ================================================================================
   ◎なぜ要るか（ゆうた指定 2026-08-23・すり合わせ済み）
     🗣「実績日＝返車日と、売上日＝PDFの日付の2軸が必要なんだよねやっぱり」
     🗣「実績日＝売上日があってなければならない（同月内）は月末エリアだけで、
     　　それ以外はQ跨ぎになるだけだから、別に参考的に表示でOKになるかなと」
     🗣「完TEL済みor依頼を通る時がほぼほぼ売上日。そこで自動入力（ズレた場合手入力）」

   ◎🔴🔴 いちばん大事な決めごと ── **完TEL日と売上日は「別物」。数字だけ引っ張る。**
     🗣 ゆうた「またログの完TEL日とはあくまで分けてね。日付の数字としては引っ張るけどってイメージ」
       ・**完TEL日**（`completeCallAt`）… お客様に電話した日。**記録（ログ）**。
       ・**売上日**（`salesDate`）　　　 … 整備ソフトの伝票が立った日。**数字の軸**。
     ふだんは同じ日になるが、**別の事実**。だから別々に持ち、**初期値だけ引っ張る**。
     ⚠ 片方を直したらもう片方も動く、にはしない（＝v1.180.0 の「印が2つある」とは別の話。
        あれは**同じ1つの事実**に印が2つあったから起きた。ここは事実が2つある）。

   ◎🔴 読むのは、いつでもここ1本（`pitSalesDate`）。
     カードが自分の売上日を持っていなければ、**完TEL日を借りて**答える。
     ＝ この仕組みより前に返した車も、日付が出る（借り物かどうかは `pitSalesDateBorrowed` で分かる）。
     ⚠ 画面ごとに `c.salesDate || c.completeCallAt` と書き写さないこと。
        書き写した日から、借り方の決まりが2つに割れる。

   ◎🔴 売上を数える日は**1ミリも変えない**（ゆうた確定＝A案）。
     🗣「会社的にもともとAだから Aのまま」
     ＝ 売上・ダッシュボード・実績カレンダー・フロント別・メカ配分は、いままでどおり
       **`pitSalesCountDate`（返車日）** で数える。売上日は**参考の軸**。
     ⚠ ここから `pitSalesCountDate` を書き換える道は**作らない**。締めた月の数字が動くから。

   ◎ここが返すもの
     pitSalesDate(c)          … 売上日（'' ＝ まだ無い）
     pitSalesDateOwn(c)       … そのカード自身が持っている売上日だけ（借り物は '' ）
     pitSalesDateBorrowed(c)  … いま出している日が「完TEL日を借りたもの」か
     pitSalesDateSeed(c)      … 入力欄の初期値（自分の → 完TEL日 → 今日）
     pitSetSalesDate(c, v)    … 売上日を入れる（🔴 書き込みはここ1本）
     pitMarkCompleteCall(c)   … 完TEL日（ログ）を記録する（🔴 書き込みはここ1本・上書きしない）
     pitSalesDateGap(c)       … 売上日と数える日のズレ { kind, label, days }

   ⚠ 読み込みは state.js より後ろ、使う側（return-slot / card-view / return-popup /
      inspect-rules / quarter-match）より**前**。
   ================================================================================ */
(function (w) {
  'use strict';

  function s(v){ return String(v == null ? '' : v); }
  function t(v){ return s(v).trim(); }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function today(){
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  /* 'YYYY-MM-DD' の形をしているものだけ日付として扱う（変な文字は無かったことにする） */
  function ok(v){ return /^\d{4}-\d{2}-\d{2}$/.test(t(v)) ? t(v) : ''; }

  /* ===== ① そのカード自身が持っている売上日（人が入れた／完TELの時に入った値） ===== */
  function own(c){ return c ? ok(c.salesDate) : ''; }

  /* ===== ② 完TEL日（ログ）。⚠ ここは**読むだけ**。 ===== */
  function callAt(c){ return c ? ok(c.completeCallAt) : ''; }

  /* ===== ③ 売上日を読む（🔴 画面はいつでもこれを呼ぶ） =====
     自分の売上日 → 無ければ完TEL日を借りる → それも無ければ '' */
  function salesDate(c){ return own(c) || callAt(c); }

  /* いま出している日が「借り物」か（＝カードはまだ自分の売上日を持っていない） */
  function borrowed(c){ return !own(c) && !!callAt(c); }

  /* ===== ④ 入力欄の初期値 =====
     🔴 ゆうた指定「完TEL時のポップアップに金額と共に出るイメージ」。
        すでに決まっているものがあればそれ、無ければ完TEL日、それも無ければ今日。
     ⚠ ここで**勝手に保存しない**。人が「OK」を押したときだけ入る。 */
  function seed(c){ return own(c) || callAt(c) || today(); }

  /* ===== ⑤ 売上日を入れる（🔴 書き込みはここ1本） =====
     ⚠ 空を渡したら空に戻す（＝「まだ決まっていない」に戻せる道を残す）。
     戻り＝実際に変わったか（true/false）。ログを出す側が、これを見て「変わった時だけ」書く。 */
  function setDate(c, v){
    if (!c) return false;
    var before = own(c);
    var after = ok(v);
    if (before === after) return false;
    c.salesDate = after;
    return true;
  }

  /* ===== ⑥ 完TEL日（ログ）を記録する（🔴 書き込みはここ1本） =====
     🔴 **上書きしない。** 完TELは「依頼 → 済」で2回通るのがふつうで、
        上書きにすると「お客様に繋がらず2日後にかけ直した」だけで日付が動いてしまう。
        伝票が立つのは1回目のほうなので、**最初に通った日を残す**（ゆうた確認済み）。
     戻り＝記録した（または既にあった）日。 */
  function markCall(c, when){
    if (!c) return '';
    if (!callAt(c)) c.completeCallAt = ok(when) || today();
    return callAt(c);
  }

  /* ===== ⑦ 売上日と「数える日」のズレ =====
     🔴 3段階の言い方は **quarter-match.js の `pitQDateGap` 1本**を借りる。
        （クォーターチェックの画面と、カードの表示と、データチェックで
          言い方が食い違わないように。ここで「月またぎ」と綴らない。）
     ⚠ 物差しが読み込まれていない時は **kind:'' を返して何も言わない**。
        知らないことを、それらしく言わない（2026-08-13 の決めごと）。
     ⚠ 比べる相手は `pitSalesCountDate`（＝実績なら実績カウント日）。
        まだ返していない車は「返車**予定**日」なので、呼ぶ側で実績だけに絞ること。 */
  function gap(c){
    var none = { kind: '', label: '', days: null };
    if (!c) return none;
    var sd = salesDate(c);
    var cd = w.pitSalesCountDate ? t(w.pitSalesCountDate(c)) : '';
    if (!sd || !cd) return none;
    if (!w.pitQDateGap) return none;
    try { return w.pitQDateGap(sd, cd) || none; } catch (e) { return none; }
  }

  /* ================================================================
     ⑧ 🔒 予約詳細カードで、この売上日を直せるか（v2.0.0・ゆうた指定 2026-08-23）
     ----------------------------------------------------------------
     🗣「**売上日も同様に基本はアーカイブはロック管理者のみ修正可能、
     　　データチェックからはそこだけ修正できる特例権限って扱いにして**」

     ◎決めごと
       ・**アーカイブ（返車済み）になる前** … **誰でも**直せる（返車日と同じ扱い）
       ・**アーカイブ（返車済み）になった後** … 🔒 **管理者だけ**
         ＝ 返し終わった車の記録は「会社の履歴」なので、勢いで触れないようにする
           （確定金額・実績カウント日・確定返車日と同じ考え方・v1.170.0/v1.171.0）

     🔴🔴 **ただし特例が2つある。ここを通さない道が「わざと」ある。**
       ① **データチェックの「ここを直す」** … アーカイブ済みでも**誰でも**直せる
       ② **クォーターチェックの直すボタン** … 同じく**誰でも**
       ＝ どちらも「**出ている数を 0 にする**」ための画面。
         そこで管理者を待たされると、**指摘が出ているのに直す道が無い**状態になる。
         🟢 売上日は**売上の数字を1円も動かさない**ので、開いても事故にならない。
         ⚠ 確定金額・実績カウント日は**数字が動く**ので、この特例に**入れない**（今までどおり管理者だけ）。

     ⚠ 名前に **OnCard** と付けてあるのは、**この鍵を通らない道が正しく存在する**ことを
        呼ぶ側に分からせるため。`pitCanEditSalesDate` という名前にすると、
        特例の2か所が「鍵を無視している」ように見えて、いつか塞がれてしまう。
     🔴 「管理者か」の物差しは **card-view.js の `pitCanEditFinal` 1本**。ここで役割を判定しない。
     ================================================================ */
  function canEditOnCard(c){
    if (!c) return false;
    if (s(c.status) !== 'returned') return true;      /* アーカイブ前は今までどおり誰でも */
    return w.pitCanEditFinal ? !!w.pitCanEditFinal() : false;
  }

  /* 月がちがうか（＝データチェックが注意を出す唯一の条件）。
     🔴 ゆうた指定「同月内でなければならないのは月末エリアだけ。それ以外はQ跨ぎになるだけだから参考表示でOK」 */
  function crossMonth(c){ return gap(c).kind === 'crossMonth'; }

  w.pitSalesDate         = salesDate;
  w.pitSalesDateOwn      = own;
  w.pitSalesCallDate     = callAt;
  w.pitSalesDateBorrowed = borrowed;
  w.pitSalesDateSeed     = seed;
  w.pitSetSalesDate      = setDate;
  w.pitMarkCompleteCall  = markCall;
  w.pitSalesDateGap      = gap;
  w.pitSalesDateCrossMonth = crossMonth;
  w.pitCanEditSalesDateOnCard = canEditOnCard;
})(window);
