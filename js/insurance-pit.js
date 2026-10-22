/* ================================================================================
   insurance-pit.js  -  🛡 **保険＝入金日で実績に乗せる**（物差しはここ1本）  PitFlow v2.9.0
   ================================================================================
   🗣 ゆうた指定（2026-08-25）
     「作業タイプのバッジの挙動で **保険** が付いたものは、リアル業務として**返車と入金が大きくずれる**。
       このため **作業→返車→請求書作成→売上** になる。
       自社の計算方法だと、**一番最後の売上日を実質的な返車日**と見て、そこで数字計上している。
       なのでこれをそのまま再現」

     ◎流れ（ゆうたが書いたとおり）
       保険のバッジあり
       ↓ 自動で売掛チェックが入る
       ↓ タスクボード上で素直に進める
       ↓ 完TEL関門を通す
       ↓ 返車ビューで当日を迎える（通常の返車フロー）
       ↓ 当日、返車完了を選択する
       ↓ **実績に乗らない。入金待ちに入る**
       ↓ **入金日を入れたタイミングを実績として登録**
       　（ただし、**本当の返車日は情報として記載する**）
     ◎「各データチェックやPDFチェックでもこのフローはOKとする」

   🔴🔴 決めごと（2026-08-25 ゆうた確定）
     ① **物差しは「保険バッジ」1本。** 売掛チェック（`paymentSeparate`）ではない。
        🗣「保険の時だけ」＝**手で売掛を付けただけの車は、今までどおり返車日で実績**。
        ⚠ だから売掛チェックを人が外しても、保険車の計上は壊れない
          （売掛チェックは「入金日の欄を出す」ための飾り。**計上の根拠にしない**）。
     ② **入金日が入るまで `completedAt`（実績カウント日）を入れない。**
        ＝ 実績カレンダー・月次の売上・作業サマリーのどこにも出ない。
        🔴 これは **「売上なしアーカイブ」（v1.99.0）とまったく同じ作法**。あちらの先例に倣う。
     ③ **本当の返車日は `returnDate` / `returnDateFinal` にちゃんと入れる。** 消さない。
        ＝ 返車カレンダー・当日ビュー・来店履歴は今までどおり動く。
     ④ **入金日を入れたら `completedAt = 入金日`。** 消したら `completedAt` も空に戻る。

   ⚠⚠ いちばん危ない所（2026-08-25 に洗い出した）
     `pitSalesCountDate` は `completedAt || returnDateFinal || returnDate` と**落ちる**作りだった。
     保険車の `completedAt` を空にしただけだと、**返車日に落ちて今までどおり計上されてしまう**。
     ＝ `sales-count.js` 側で**保険は入金日だけを見る**ように切ってある。ここを戻さないこと。

   ◎ここが返すもの（🔴 画面ごとに条件を書き写さないこと）
     pitCardInsurance(c) … 保険バッジが付いているか
     pitInsPayWait(c)    … 返車済みだが、まだ入金日が無い＝**実績に乗っていない**
     pitInsResultDate(c) … その車が実績に乗る日（保険＝入金日／ほかは今までどおり）
     pitInsOnBadge(c)    … 保険を付けた／外した時に、売掛チェックを合わせる
     pitInsOnReturn(c,d) … 返車完了。**返車日は入れる。実績日は保険なら入れない**（true を返したら呼び側は何もしない）
     pitInsSetPaid(c,d)  … 入金日を入れる／消す。実績日を合わせる
     pitInsNote(c)       … 画面に出す1行

   ⚠ 読み込みは state.js より後ろ、sales-count.js より**前**。
   ================================================================================ */
(function (w) {
  'use strict';

  function s(v){ return String(v == null ? '' : v); }
  function t(v){ return s(v).trim(); }

  /* 🛡 保険バッジ（作業タイプの「その他」の中の付加＝`workSpecials`）。
     ⚠ id は `state.js` の `PIT_WORK_SPECIALS` の `insurance`。**ここで綴りを増やさない。** */
  function isInsurance(c){
    if (!c) return false;
    var a = c.workSpecials;
    return Array.isArray(a) && a.indexOf('insurance') >= 0;
  }

  /* 返車済みだが、まだ入金日が無い＝**入金待ち。実績には乗っていない。** */
  function payWait(c){
    if (!isInsurance(c)) return false;
    if (s(c.status) !== 'returned') return false;
    return !t(c.paymentDate);
  }

  /* 🔴 その車が実績に乗る日。**集計はここを通す。**
     ⚠ 保険は `completedAt` にも `returnDate` にも落とさない。**入金日だけ。** */
  function resultDate(c){
    if (!c) return '';
    if (isInsurance(c)) return t(c.paymentDate);
    return t(c.completedAt) || t(c.returnDateFinal) || t(c.returnDate);
  }

  /* 保険を付けた／外した時に、売掛チェックを合わせる。
     ⚠ 付けた時は入れる（入金日の欄を出すため）。**外した時は勝手に消さない**
        ＝ 人が手で売掛にしていたかもしれないので、こちらから消す権利は無い。 */
  function onBadge(c){
    if (!c) return false;
    if (!isInsurance(c)) return false;
    if (c.paymentSeparate) return false;
    c.paymentSeparate = true;
    return true;
  }

  /* 返車完了（当日ビューの「返車済みにする」／完TELポップアップの実績化）。
     🔴 **返り true ＝ 実績日はこちらで決めたので、呼び側は `completedAt` を入れないこと。**
     ⚠ 返車日そのものは呼び側が入れている（`returnDate` / `returnDateFinal`）。ここでは触らない。 */
  function onReturn(c, rd){
    if (!c || !isInsurance(c)) return false;
    c.paymentSeparate = true;                 /* 入金日の欄を出す＝入金待ちの箱に並ぶ */
    if (t(c.paymentDate)) {
      c.completedAt = t(c.paymentDate);       /* もう入金日が分かっている＝その日で実績 */
    } else {
      c.completedAt = '';                     /* 🔴 実績に乗せない。返車日に落とさない */
    }
    if (w.logFlow) { try { logFlow(c, '返車完了（保険：入金待ち・実績はまだ／返車 ' + t(rd) + '）'); } catch (e) {} }
    return true;
  }

  /* 入金日を入れる／消す。**実績に乗る日はこれで決まる。**
     ⚠ 保険でない車は今までどおり（入金日はメモのまま。実績日は動かさない）。 */
  function setPaid(c, d){
    if (!c) return false;
    d = t(d);
    c.paymentDate = d || null;
    if (d && !c.paymentSeparate) c.paymentSeparate = true;
    if (!isInsurance(c)) return false;
    if (s(c.status) !== 'returned') return false;
    /* 🔴 保険＝入金日がそのまま実績カウント日。消したら実績からも外れる。 */
    c.completedAt = d || '';
    if (w.logFlow) {
      try { logFlow(c, d ? ('入金日を記録（保険：' + d + ' で実績に計上）') : '入金日を取り消し（保険：実績から外れました）'); } catch (e) {}
    }
    return true;
  }

  /* 🤝 v2.196.0（ゆうた指定 2026-10-22・モック「保険の協定待ち」案A）**協定待ち＝保険会社との協定がまだで、金額が決まっていない。**
     🗣「正確な売上金額が決まってない（保険会社との協定）場合がおおい」
     ◎新しい欄は作らない。**保険のバッジ ＋ 完TELを通った（作業完了・返車済み）＋ 確定金額が空** ＝ 協定待ち。
       ＝ 完TELの窓で「協定まだ」を選ぶと、確定金額を入れずに進む（return-popup.js）。
     ⚠ 完TELより前は、どの車も確定金額が空なのがふつう＝ここで「協定待ち」と呼ばない。
     🗣「協定まだの場合、売上の予定とかAIレポート的には見積もり金額を使用するようにして」
       ＝ 売上・AIレポートは pitFinalAmountOf（確定→受注→見積→概算）で拾う作りなので、**確定金額が空なら見積などで数える**。
          ⚠ だから返車を終える時に、協定待ちの車の確定金額を見積で**埋めないこと**（埋めると「協定ずみ」に見えて、どこで止まっているか分からなくなる）。 */
  function hasAmt(v){ return v != null && v !== ''; }
  function agreeWait(c){
    if (!isInsurance(c)) return false;
    var st = s(c.status);
    if (st !== 'workDone' && st !== 'returned') return false;
    return !hasAmt(c.amountFinal);
  }
  /* 協定待ちの間の「仮の金額」と、どの欄から拾ったか（売上・AIレポートと同じ順＝pitFinalAmountOf）。 */
  function agreeKari(c){
    if (!c) return { amt: 0, kind: '' };
    var kind = hasAmt(c.amountOrder) ? '受注' : hasAmt(c.amountQuote) ? '見積' : '概算';
    var amt = w.pitFinalAmountOf ? Number(w.pitFinalAmountOf(c)) || 0
            : Number(c.amountOrder || c.amountQuote || c.estAmount || 0) || 0;
    return { amt: amt, kind: kind };
  }
  /* 協定額（＝確定金額）を入れる／消す。**記録（前→後）はここ1本で残す。**
     ⚠ 空にすると、また協定待ちに戻る（完TELの窓で「協定まだ」を選び直した時など）。 */
  function setAgree(c, v, why){
    if (!c) return false;
    var before = hasAmt(c.amountFinal) ? Number(c.amountFinal) : null;
    var d = String(v == null ? '' : v).replace(/[^\d]/g, '');
    var after = d === '' ? null : Number(d);
    if (before === after) return false;
    c.amountFinal = after;
    var y = function (n) { return n == null ? '（なし）' : '¥' + Number(n).toLocaleString(); };
    var msg = (after == null ? '協定まだにした（確定金額 ' + y(before) + ' を外した）'
                             : '協定額を入れた（確定金額 ' + y(before) + ' → ' + y(after) + '）') + (why ? '・' + why : '');
    if (w.logFlow) { try { logFlow(c, msg); } catch (e) {} }
    if (w.pitLog) {
      try { pitLog(after == null ? '協定まだにした' : '協定額を入れた', { cardId: c.id, kind: 'result',
        label: ((w.pitCustName ? pitCustName(c) : c.customer) || '') + ' 様' + (c.car ? ' / ' + c.car : '') + ' / ' + y(before) + ' → ' + y(after) }); } catch (e) {}
    }
    return true;
  }

  /* 画面に出す1行。⚠ 言葉はここ1本。各画面で言い換えない。 */
  function note(c){
    if (!isInsurance(c)) return '';
    if (agreeWait(c)) {
      var k = agreeKari(c), rd0 = t(c.returnDateFinal) || t(c.returnDate);
      return '保険：協定待ち（仮 ¥' + k.amt.toLocaleString() + '・' + k.kind + '）'
           + (payWait(c) ? '・入金待ち（' + (rd0 ? '返車 ' + rd0 + '・' : '') + '協定額と入金日を入れるとその日で実績になります）' : '');
    }
    if (payWait(c)) {
      var rd = t(c.returnDateFinal) || t(c.returnDate);
      return '保険：入金待ち（' + (rd ? '返車 ' + rd + '・' : '') + '入金日を入れるとその日で実績になります）';
    }
    if (s(c.status) === 'returned' && t(c.paymentDate)) {
      var rd2 = t(c.returnDateFinal) || t(c.returnDate);
      return '保険：' + t(c.paymentDate) + ' の入金で実績' + (rd2 ? '（本当の返車は ' + rd2 + '）' : '');
    }
    return '保険：入金日で実績に計上します';
  }

  w.pitCardInsurance = isInsurance;
  w.pitInsPayWait    = payWait;
  w.pitInsResultDate = resultDate;
  w.pitInsOnBadge    = onBadge;
  w.pitInsOnReturn   = onReturn;
  w.pitInsSetPaid    = setPaid;
  w.pitInsNote       = note;
  w.pitInsAgreeWait  = agreeWait;   /* 🤝 v2.196.0 協定待ちか */
  w.pitInsAgreeKari  = agreeKari;   /* 🤝 協定待ちの間の仮の金額 { amt, kind } */
  w.pitInsSetAgree   = setAgree;    /* 🤝 協定額を入れる／消す（記録つき） */
})(window);
