/* ========================================
   card-miss.js  -  カードの「入っていない項目」を数える、たった1本の物差し   PitFlow v1.168.0
   ----------------------------------------
   ◎なぜ切り出したか（2026-08-21）
     この表（🔴赤＝必須／🟡黄＝入れたほうがいい）は **card-detail.js の中に閉じて**いて、
     **画面が開いている時にしか使えなかった**（`root.querySelector` で赤枠を塗る処理と一体だったため）。
     点検（健康診断）は **画面を開かずに全カードを見る**ので、そのままでは表を写すしかない。
     🔴 **写しを作らない。** 表はここ1本に置き、
        ・card-detail.js …「どこに赤枠を塗るか」だけを受け持つ
        ・inspect-rules.js … 数えるだけ
     ⚠ 項目を足す・色を変えるのは **ここだけ**。片方だけ直すと、
        「保存はできるのに点検では怒られる」（またはその逆）が起きる。

   ◎表の決まり（ゆうた指定 2026-08-10 v1.76.0 ／ TEL は 2026-08-13 v1.89.0 で黄へ）
     🔴 赤（必須）… これが空だと**保存できない**
     🟡 黄（推奨）… 空でも保存できるが、**1回だけ聞く**

   ◎使い方
     pitCardMisses(c) → { red:[{key,label}], yellow:[{key,label}], need:[…], keys:[…] }
   ⚠ 読み込みは card-detail.js より前。state に触らない（カード1枚だけを見る）。
   ======================================== */
(function (w) {
  'use strict';

  function t(v){ return String(v == null ? '' : v).trim(); }

  /* 🔴🔴 ここがこの表の唯一の置き場所。**card-detail.js に書き戻さないこと。**
     ・key   … カード画面の入力欄 `[data-key="…"]`（赤枠を塗る先）
     ・label … 人に見せる名前（保存の関門のメッセージ・点検の一覧に出る）
     ・ok    … 入っているか
     ・lv    … 'red'（必須）/ 'yellow'（推奨） */
  function pitCardMisses(c) {
    c = c || {};
    var need = [
      /* --- 🔴 赤（必須） --- */
      { key:'kana',        label:'カナ',             ok: !!t(c.kana),        lv:'red' },
      { key:'repeat',      label:'初回／リピーター', ok: !!t(c.repeat),      lv:'red' },
      { key:'reserveDate', label:'入庫日',           ok: !!c.reserveDate,    lv:'red' },
      { key:'dropType',    label:'受付タイプ',       ok: !!c.dropType,       lv:'red' },
      { key:'workType',    label:'作業タイプ',
        ok: !!c.workType || !!((c.workAddons || []).length),                 lv:'red' },
      /* --- 🟡 黄（入れたほうがいい） --- */
      { key:'customer',    label:'お客様名（漢字）', ok: !!t(c.customer),    lv:'yellow' },
      { key:'tel',         label:'TEL',              ok: !!t(c.tel),         lv:'yellow' },
      { key:'boardId',     label:'国産車／輸入車',
        ok: c.boardId === 'default' || c.boardId === 'import',               lv:'yellow' },
      { key:'maker',       label:'メーカー',         ok: !!t(c.maker),       lv:'yellow' },
      { key:'car',         label:'車種（グレード）', ok: !!t(c.car),         lv:'yellow' },
      { key:'reserveTime', label:'入庫時刻',         ok: !!t(c.reserveTime), lv:'yellow' },
      { key:'menu',        label:'作業内容',         ok: !!t(c.menu),        lv:'yellow' }
    ];

    /* 🏢🏢 v2.6.0 社内車両（中古・代車・内部）は、作業タイプの決まりが変わる。
       ・中古／内部 … 単独で立つ＝**作業タイプは要らない**（区分そのものが中身）
       ・代車       … 車検／12点／一般／B.P のどれか **1つが必須**（＝「代車車検」等のセット）
       ⚠ 区分かどうかは intern-pit.js に聞く（ここで c.internKind を直に見ない）。 */
    /* 📦📦 v2.51.0（G-2・ゆうた 2026-09-01）**物販は車の情報が入らないことがある。**
       🗣「顧客名は入るが、それ以外のカルテナンバー、車種名などは入らないことがある」
       → **メーカー・車種だけ外す。**
       🔴🔴 **課（国産車／輸入車）は外さない。**
       　 🗣「課は**売上の計でずれる**からどちらかに振るようにしよう」
       　 ＝ 空のままにすると課別の売上の合計が合わなくなる。車が無くてもどちらかに振ること。
       ⚠ 入庫時刻も外さない（付ける・付けないは今までどおり自由）。
       ⚠ カルテNoは、そもそもこの表に無い。 */
    if (w.pitCardGoods && w.pitCardGoods(c)) {
      need = need.filter(function (n) { return n.key !== 'maker' && n.key !== 'car'; });
    }

    var internKind = w.pitInternKind ? w.pitInternKind(c) : '';
    if (internKind) {
      need = need.filter(function (n) { return n.key !== 'workType'; });
      if (internKind === 'loanercar') {
        need.push({ key:'workType', label:'代車の作業（車検/12点/一般/B.P）',
                    ok: !!(w.pitInternMate && w.pitInternMate(c)), lv:'red' });
      }
    }

    /* 代車を「必要」にした時だけの3つ（不要に戻したら表から消える＝赤枠も消える） */
    if (c.needLoaner) {
      need.push({ key:'loanerId',   label:'使用代車', ok: !!c.loanerId,   lv:'red' });
      need.push({ key:'loanerFrom', label:'貸出から', ok: !!c.loanerFrom, lv:'red' });
      need.push({ key:'loanerTo',   label:'貸出まで', ok: !!c.loanerTo,   lv:'red' });
    }

    /* 🔴 v1.40.0（ゆうた指定）車検の時だけ諸費用も必須。
       ⚠ 0 は「0円と決めた」ことがあるので通す＝空っぽ（未入力）だけを見る。
       ⚠ 車検かどうかは pit-share.js の `pitIsShaken` 1本に聞く（ここで配列を数えない）。 */
    var isShaken = w.pitIsShaken ? w.pitIsShaken(c)
                 : ((Array.isArray(c.workTypes) ? c.workTypes : []).indexOf('shaken') >= 0 || c.workType === 'shaken');
    /* 🏢 v2.6.0 社内車両は伝票が無いので、諸費用は要らない（代車車検でも聞かない）。 */
    if (isShaken && !internKind) {
      need.push({ key:'feeAmount', label:'諸費用（車検）',
                  ok: !(c.feeAmount == null || c.feeAmount === ''), lv:'red' });
    }

    var red = [], yellow = [];
    need.forEach(function (n) { if (!n.ok) (n.lv === 'red' ? red : yellow).push(n); });
    return {
      need:   need,
      keys:   need.map(function (n) { return n.key; }),
      red:    red,
      yellow: yellow
    };
  }

  /* 代車・車検を外した時に「色を消しに行く」キー（card-detail.js が使う）。
     ⚠ 上の表で条件付きに足しているものと同じ並びにしておくこと。 */
  w.PIT_MISS_OPTIONAL = ['loanerId', 'loanerFrom', 'loanerTo', 'feeAmount'];
  w.pitCardMisses = pitCardMisses;
})(window);
