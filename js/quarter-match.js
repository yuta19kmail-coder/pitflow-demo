/* ================================================================================
   quarter-match.js  -  🧾 クォーターチェック② 売上チェックリストPDF × PitFlow の突き合わせ
                        （**物差しだけ**。画面は quarter.js）  PitFlow v1.181.0
   ================================================================================
   ◎ゆうたの狙い（2026-08-08 から変わっていない）
     🗣「**顧客＝金額＝日付の3セットが、PitFlow と整備ソフトとで完全に同期すること**」
        今までアナログボードでやっていたことを、そのまま画面に持ってくる。
        修正は**どちら側からも**入る。**真実に寄せる**イメージ。

   ◎ここが受け持つこと ＝ **数える・結ぶ・検算する。** 画面は1文字も作らない。
     🔴 判定を画面（quarter.js）に書き写さないこと。食い違ったら直しようがなくなる。

   ◎🔴🔴 2026-08-08 に実データ（8/1〜8/7・67枚）で決めたこと。**変えないこと。**
     ① 金額の対応 …… `PitFlow の確定金額 ＝ 伝票計 − 一般消費税 − 非課税行`
        ⚠ 「消費税×10」で戻すのはダメ（15枚で2〜5円ずれた）。読み取り側（quarter-pdf.js）の仕事。
     ② **±1円は一致とみなす**（整備ソフトが明細ごとに丸めているぶん）。
        ⚠ ただし**検算の足し算からは外さない**。表示上「一致」でも、差額の内訳には入れる。
     ③ 担当は**名寄せ表**で寄せる（専務＝小林和枝／社長＝小林政幸／チーフ＝小林裕太／﨑＝崎）
     ④ 日付は**3段階**
        | 同じクォーターの中 | ✅ 出さない（実務で普通に起きる） |
        | クォーターをまたぐ | 🟡 全件 要確認（人が見て決める） |
        | 月をまたぐ        | 🔴 全件NG（月次の実績が変わる） |
        ⚠ 区切りは **sales.js の `pitQuarterOf` 1本**を借りる。ここで 1-7／8-15 と書かない。
     ⑤ 1台で複数伝票＝基本ない／1伝票で複数台＝基本まざる（混ざる時は PitFlow 側も合わせて作る）

   ◎🔴🔴 いちばん大事な決めごと（2026-08-08 の教訓）
     🔴 **合計が合うまで数字を出さない。**
        差額の内訳（整備ソフトだけ／PitFlowだけ／期間の外／金額ちがい）を足して、
        実際の差と**ぴったり合うか毎回検算する**。合わない＝どこかを取りこぼしている。
     🔴 **「無い」と言う前に、窓を広げて探す。**
        期間ぴったりで切ると、日付がズレている車が丸ごと消えて「無い車」に化ける。
        ＝ PitFlow 側は**比べたい期間より前後に広く**集める（既定 14日）。
        （v1＝ぴったりでは「無い車22件」に見えたものが、v2＝前後14日で12件まで減った）

   ◎ここが返すもの
     pitQCollect(opt)          … PitFlow 側の材料を state から集める（**読むだけ**）
     pitQMatch(soft, pit, opt) … 突き合わせて、内訳と検算まで入った結果を返す
     pitQNormPlate / pitQNormName / pitQStaffName / pitQDateGap … ならしの物差し

   ⚠ 読み込みは sales.js（pitQuarterOf）／sales-count.js（pitSalesCountDate）より後ろ。
   ================================================================================ */
(function (w) {
  'use strict';

  function s(v){ return String(v == null ? '' : v); }
  function t(v){ return s(v).trim(); }
  function num(v){ v = +s(v).replace(/[^0-9\-]/g, ''); return isFinite(v) ? v : 0; }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function ymd(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function toD(v){
    var p = s(v).split('-');
    if (p.length !== 3) return null;
    var d = new Date(+p[0], (+p[1]) - 1, +p[2]);
    return isNaN(d.getTime()) ? null : d;
  }
  function shift(v, n){ var d = toD(v); if (!d) return ''; d.setDate(d.getDate() + n); return ymd(d); }
  function daysBetween(a, b){ var da = toD(a), db = toD(b); return (da && db) ? Math.round((db - da) / 86400000) : null; }

  /* ================================================================
     1. ならし（同じものを同じと見るための下ごしらえ）
     ----------------------------------------------------------------
     🔴 ここを緩めすぎると**別の車を同じ車として結んでしまう**。
        逆に厳しすぎると「無い車」が増える。2026-08-08 の実データで、この強さがちょうどよかった。
     ================================================================ */

  /* 全角→半角（英数字と記号だけ）。⚠ かな・漢字は触らない */
  function toHalf(v){
    return s(v).replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }).replace(/　/g, ' ');
  }

  /* ナンバー（登録番号）。`江東 300 せ 8134` ／ `江東300せ8134` を同じにする。
     ⚠ 空白の入り方が整備ソフトと PitFlow で違う。**空白は全部落として**比べる。
     ⚠ ハイフン（12-34）も落とす＝どちらの書き方でも当たるように。 */
  function normPlate(v){
    return toHalf(v).replace(/[\s\-‐‑–—ー]/g, '').toUpperCase();
  }

  /* 🔴 異体字の寄せ（人名でよく出るものだけ）。
     ⚠ ここに無い字は寄せない＝**知らない字を勝手に別人にしない**。 */
  var KANJI = { '﨑':'崎', '邉':'辺', '邊':'辺', '髙':'高', '濵':'浜', '﨏':'沢', '德':'徳', '瀨':'瀬', '嶋':'島' };
  function fixKanji(v){
    return s(v).replace(/[﨑邉邊髙濵﨏德瀨嶋]/g, function (c) { return KANJI[c] || c; });
  }

  /* 顧客名。空白・法人の書き方のゆれを落として比べる。
     ⚠ 「(有)」「有限会社」「(株)」「株式会社」は落とす＝請求先名と呼び名がばらけるため。 */
  function normName(v){
    return fixKanji(toHalf(v))
      .replace(/[\s]/g, '')
      .replace(/\(有\)|（有）|有限会社|\(株\)|（株）|株式会社|\(合\)|合同会社/g, '')
      .toUpperCase();
  }

  /* 🔴 担当の名寄せ（ゆうた確定 2026-08-08）。
     ⚠ 役職で書かれることがある。**表はここ1本**。増えたらここに足す。 */
  var STAFF_ALIAS = {
    '専務': '小林和枝',
    '社長': '小林政幸',
    'チーフ': '小林裕太',
    '裕太': '小林裕太',
    '祐太': '小林裕太',
    '康起': '箱崎康起'
  };
  function staffName(v){
    var x = fixKanji(toHalf(v)).replace(/\s/g, '');
    if (!x) return '';
    if (STAFF_ALIAS[x]) return STAFF_ALIAS[x];
    /* 整備ソフト側は請求先名がくっついて出ることがある（例「Agency株式会社箱﨑康起」）。
       ⚠ 名寄せ表の名前が**末尾に含まれていたら**その人とみなす。 */
    for (var k in STAFF_ALIAS){
      if (Object.prototype.hasOwnProperty.call(STAFF_ALIAS, k) && x.slice(-k.length) === k) return STAFF_ALIAS[k];
    }
    return x;
  }

  /* ================================================================
     2. 日付の3段階（ゆうた確定）
     ----------------------------------------------------------------
     🔴 クォーターの区切りは **sales.js の `pitQuarterOf` 1本**。ここで書き写さない。
     ⚠ 月またぎは必ずQもまたぐので、**先に月を見てから**Qを見る。
     ================================================================ */
  function qOf(dateStr){
    if (w.pitQuarterOf) { try { return w.pitQuarterOf(dateStr); } catch (e) {} }
    return null;
  }
  function dateGap(softDate, pitDate){
    var a = t(softDate), b = t(pitDate);
    if (!a || !b) return { days: null, kind: 'unknown', label: '' };
    var n = daysBetween(a, b);
    if (n === 0) return { days: 0, kind: 'same', label: '同じ' };
    var sign = (n > 0 ? '+' : '') + n + '日';
    if (a.slice(0, 7) !== b.slice(0, 7)) return { days: n, kind: 'crossMonth', label: '月またぎ（' + sign + '）' };
    var qa = qOf(a), qb = qOf(b);
    if (qa && qb && (qa.y !== qb.y || qa.m1 !== qb.m1 || qa.qi !== qb.qi)){
      return { days: n, kind: 'crossQ', label: 'Qまたぎ（' + sign + '）' };
    }
    return { days: n, kind: 'sameQ', label: '同じQ内（' + sign + '）' };
  }

  /* ================================================================
     3. PitFlow 側の材料を集める（**読むだけ・1バイトも書き換えない**）
     ----------------------------------------------------------------
     🔴 期間の判定・数える日・確度は **PitFlow の物差しをそのまま借りる**（写しを作らない）。
     🔴 集める窓は、比べたい期間より**前後に広い**（既定 14日）。
        ＝ 日付がズレている車を「無い車」に化けさせないため（2026-08-08 の教訓）。
     ================================================================ */
  function collect(opt){
    opt = opt || {};
    var from = t(opt.from), to = t(opt.to), padDays = (opt.pad == null ? 14 : +opt.pad);
    var wFrom = shift(from, -padDays), wTo = shift(to, padDays);
    var cards = opt.cards || (w.state && w.state.cards) || [];
    var countDate = w.pitSalesCountDate || function (c) { return s(c.completedAt || c.returnDateFinal || c.returnDate); };
    var noSale = function (c) { return !!(w.pitCardNoSale && w.pitCardNoSale(c)); };
    var nameOf = function (c) { return s(w.pitCustName ? w.pitCustName(c) : c.customer); };

    var rows = [];
    cards.forEach(function (c) {
      if (!c || c._draft) return;
      var cd = s(countDate(c));
      var rd = s(c.returnDateFinal || c.returnDate || '');
      var sd = s(c.reserveDate || '');
      var hit = (cd && cd >= wFrom && cd <= wTo) || (rd && rd >= wFrom && rd <= wTo) || (sd && sd >= wFrom && sd <= wTo);
      if (!hit) return;
      rows.push({
        id: s(c.id),
        予約番号: s(c.resNo),
        状態: s(c.status),
        売上なし: noSale(c),
        数える日: cd,
        実績カウント日: s(c.completedAt),
        確定返車日: s(c.returnDateFinal),
        返車日: s(c.returnDate),
        入庫日: sd,
        ナンバー: s(c.plate),
        顧客名: nameOf(c),
        車種: s(c.car),
        確定金額: num(c.amountFinal),
        フロント担当: s(c.frontStaff || c.staff),
        対象期間内: !!(cd && cd >= from && cd <= to),
        実績: (s(c.status) === 'returned' && !noSale(c))
      });
    });
    rows.sort(function (a, b) {
      return a.数える日 === b.数える日 ? (a.ナンバー < b.ナンバー ? -1 : 1) : (a.数える日 < b.数える日 ? -1 : 1);
    });
    return { 期間: { from: from, to: to }, 集めた範囲: { from: wFrom, to: wTo, 前後: padDays }, 明細: rows };
  }

  /* ================================================================
     4. 突き合わせ
     ----------------------------------------------------------------
     ◎鍵（同じ車と判断するもの・この順番）
       ① ナンバー ＋ 売上日がぴったり
       ② ナンバー（日付はズレていてよい＝広げた窓の中でいちばん近い日）
       ③ 顧客名 ＋ 金額（±1円）
       それでも外れたら**結ばない**（勝手に結ばない）。
     ⚠ 1枚の伝票に結べる PitFlow のカードは**1枚だけ**。取り合いにならないよう、
        ①→②→③ の順で**先に決まったものから抜いていく**。
     ================================================================ */
  function match(soft, pit, opt){
    opt = opt || {};
    var from = t(opt.from), to = t(opt.to);
    var softRows = (soft || []).map(function (r, i) {
      return {
        i: i,
        売上日: t(r.売上日),
        伝票: t(r.伝票),
        ナンバー: t(r.ナンバー),
        顧客名: t(r.顧客名),
        車種: t(r.車種),
        金額: num(r.金額),
        受付担当: t(r.受付担当),
        _plate: normPlate(r.ナンバー),
        _name: normName(r.顧客名)
      };
    });
    /* 🔴 比べる相手は「実績になっている車」だけ。
       ⚠ まだ返車済みにしていない車は**PitFlow の売上に乗っていない**ので、
          結んでしまうと「金額が合っている」と嘘をつく。**カードが有ることだけ別に言う。** */
    var all = (pit || []).map(function (r, i) {
      return {
        i: i, 生: r,
        数える日: t(r.数える日),
        ナンバー: t(r.ナンバー),
        顧客名: t(r.顧客名),
        確定金額: num(r.確定金額),
        フロント担当: t(r.フロント担当),
        状態: t(r.状態),
        /* ⚠ 「実績になっている車か」は、集める側（pitQCollect）が付けてくれる。
           付いていない材料（前に手で書き出した JSON など）から来た時は、状態で見る。 */
        実績: (r.実績 != null) ? !!r.実績 : (t(r.状態) === 'returned'),
        対象期間内: !!r.対象期間内,
        予約番号: t(r.予約番号),
        返車日: t(r.返車日 || r.確定返車日),
        _plate: normPlate(r.ナンバー),
        _name: normName(r.顧客名),
        _used: false
      };
    });
    var act = all.filter(function (r) { return r.実績 && r.数える日; });

    var pairs = [];
    function take(sr, pr, how){
      pr._used = true;
      var gap = dateGap(sr.売上日, pr.数える日);
      var diff = sr.金額 - pr.確定金額;
      pairs.push({
        soft: sr, pit: pr, 結び方: how,
        日付: gap,
        差: diff,
        金額一致: Math.abs(diff) <= 1,          /* ②±1円は一致とみなす（表示の話） */
        担当一致: (staffName(sr.受付担当) === staffName(pr.フロント担当)),
        期間の外: !pr.対象期間内
      });
    }

    /* ① ナンバー＋売上日 */
    softRows.forEach(function (sr) {
      if (!sr._plate) return;
      var hit = act.filter(function (p) { return !p._used && p._plate === sr._plate && p.数える日 === sr.売上日; })[0];
      if (hit) take(sr, hit, 'ナンバー＋日付');
    });
    /* ② ナンバーだけ（いちばん日が近いもの） */
    softRows.forEach(function (sr) {
      if (!sr._plate || pairs.some(function (p) { return p.soft.i === sr.i; })) return;
      var cand = act.filter(function (p) { return !p._used && p._plate === sr._plate; });
      if (!cand.length) return;
      cand.sort(function (a, b) {
        return Math.abs(daysBetween(sr.売上日, a.数える日) || 999) - Math.abs(daysBetween(sr.売上日, b.数える日) || 999);
      });
      take(sr, cand[0], 'ナンバー');
    });
    /* ③ 顧客名＋金額（±1円）。⚠ ナンバーが空の伝票（仮登録車など）の受け皿 */
    softRows.forEach(function (sr) {
      if (pairs.some(function (p) { return p.soft.i === sr.i; })) return;
      if (!sr._name) return;
      var cand = act.filter(function (p) {
        return !p._used && p._name && p._name === sr._name && Math.abs(p.確定金額 - sr.金額) <= 1;
      });
      if (cand.length) take(sr, cand[0], '顧客名＋金額');
    });

    /* ---- 結ばれなかったもの ---- */
    var softOnly = softRows.filter(function (sr) { return !pairs.some(function (p) { return p.soft.i === sr.i; }); })
      .map(function (sr) {
        /* 🔴 「無い」と言い切る前に、**実績になっていないカードが無いか**まで見る。
           ＝ 2026-08-08 に「無い22件」の半分が「まだ返車済みにしていないだけ」だった。 */
        var card = all.filter(function (p) { return p._plate && sr._plate && p._plate === sr._plate; })[0]
                || all.filter(function (p) { return p._name && sr._name && p._name === sr._name; })[0]
                /* 🔴 ここだけ**名前の部分一致まで**見る。
                   ＝ 整備ソフト側は「仮登録車両あけぼの自動車」のように、前置きが付くことがある。
                   ⚠ これは**結ぶ**ためではない（金額には1円も影響しない）。
                      「カードが有るかもしれない」と**言うだけ**なので、ここだけ緩めてよい。
                      逆に金額を結ぶ所（①②③）は**絶対に緩めない**＝別の車を同じ車にしてしまう。 */
                || all.filter(function (p) {
                     if (!p._name || !sr._name) return false;
                     var a = p._name, b = sr._name;
                     if (a.length < 3 || b.length < 3) return false;
                     return a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
                   })[0]
                || null;
        return { soft: sr, カード: card };
      });
    var pitOnly = act.filter(function (p) { return !p._used && p.対象期間内; });

    /* ================================================================
       5. 合計と検算（🔴 合わなければ数字を出さない）
       ----------------------------------------------------------------
       差 ＝ 整備ソフトの合計 − PitFlow（対象期間の実績）の合計
       内訳 ＝ ①整備ソフトだけ（＋） ②PitFlowだけ（−） ③期間の外（＋） ④金額ちがい（±）
       ⚠ ④は**±1円のぶんも足す**（表示は一致でも、数字はズレているから）。
       ================================================================ */
    var softTotal = softRows.reduce(function (a, r) { return a + r.金額; }, 0);
    var pitInPeriod = act.filter(function (p) { return p.対象期間内; });
    var pitTotal = pitInPeriod.reduce(function (a, r) { return a + r.確定金額; }, 0);

    var onlySoftAmt = softOnly.reduce(function (a, r) { return a + r.soft.金額; }, 0);
    var onlyPitAmt  = pitOnly.reduce(function (a, r) { return a + r.確定金額; }, 0);
    var outAmt      = pairs.filter(function (p) { return p.期間の外; })
                           .reduce(function (a, p) { return a + p.soft.金額; }, 0);
    var diffAmt     = pairs.filter(function (p) { return !p.期間の外; })
                           .reduce(function (a, p) { return a + p.差; }, 0);

    var real = softTotal - pitTotal;
    var sum  = onlySoftAmt - onlyPitAmt + outAmt + diffAmt;

    /* ---- 🔴 「まとめて返車済みにした日」を見つける（2026-08-08 の本命） ----
       期間の外に落ちた車の「数える日」が**同じ日に固まっていたら**、
       それは週明けにまとめて返車済みにしたしるし。**先頭に出す。** */
    var byDay = {};
    pairs.filter(function (p) { return p.期間の外 && p.pit.数える日; }).forEach(function (p) {
      var k = p.pit.数える日;
      byDay[k] = byDay[k] || { 日: k, 台数: 0, 金額: 0 };
      byDay[k].台数++; byDay[k].金額 += p.soft.金額;
    });
    var lump = Object.keys(byDay).map(function (k) { return byDay[k]; })
      .filter(function (x) { return x.台数 >= 3; })
      .sort(function (a, b) { return b.金額 - a.金額; });

    var crossQ = pairs.filter(function (p) { return p.日付.kind === 'crossQ'; });
    var crossM = pairs.filter(function (p) { return p.日付.kind === 'crossMonth'; });
    var amtNg  = pairs.filter(function (p) { return !p.金額一致; });
    var staffNg = pairs.filter(function (p) { return !p.担当一致 && t(p.soft.受付担当) && t(p.pit.フロント担当); });

    return {
      期間: { from: from, to: to },
      整備ソフト: { 枚数: softRows.length, 金額: softTotal },
      PitFlow:   { 台数: pitInPeriod.length, 金額: pitTotal },
      差: { 台数: softRows.length - pitInPeriod.length, 金額: real },
      内訳: {
        整備ソフトだけ: { 台数: softOnly.length, 金額: onlySoftAmt },
        PitFlowだけ:   { 台数: pitOnly.length,  金額: -onlyPitAmt },
        期間の外:      { 台数: pairs.filter(function (p) { return p.期間の外; }).length, 金額: outAmt },
        金額ちがい:    { 台数: amtNg.length, 金額: diffAmt }
      },
      /* 🔴 これが false の時は、画面は数字を出さずに「読み取りに失敗した」と言うこと */
      検算: { 合う: (real === sum), 実際の差: real, 内訳の合計: sum, ずれ: real - sum },
      結びついた: pairs,
      金額ちがい: amtNg,
      Qまたぎ: crossQ,
      月またぎ: crossM,
      担当ちがい: staffNg,
      整備ソフトだけ: softOnly,
      PitFlowだけ: pitOnly,
      まとめ返車: lump
    };
  }

  w.pitQNormPlate = normPlate;
  w.pitQNormName  = normName;
  w.pitQStaffName = staffName;
  w.pitQDateGap   = dateGap;
  w.pitQCollect   = collect;
  w.pitQMatch     = match;
  w.PIT_Q_STAFF_ALIAS = STAFF_ALIAS;
})(window);
