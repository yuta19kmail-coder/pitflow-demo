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
     pitQCrossLink(groups)     … 🔗 v2.8.0 **組をまたいで**名札を貼り直す（数字はさわらない）
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
     2-2. 🗓 PDF の期間を、クォーターごとに割る（v2.0.0・ゆうた指定 2026-08-23）
     ----------------------------------------------------------------
     🗣「**入れたPDFに対して日付で自動でQ割り振りできないかな？**」
     🗣「リアルな運用で言えばQごとにチェックを入れたいからQごとのデータにはなる。
     　　ただ**多少日付がズレても、その分も別Qとしてチェックを一部入れる**みたいな感じであれば楽だな」

     ◎やること＝**PDFが言っている期間**を、クォーターの窓で切り分ける。
       ・8/1〜8/7 なら … 8月Q1 が1つだけ（**まるごと**）
       ・8/1〜8/8 なら … 8月Q1（まるごと）＋ 8月Q2 の**一部**（8/8 だけ）
       ・8/1〜8/31 なら … Q1〜Q4 が4つとも（全部まるごと）

     🔴🔴 いちばん大事な決めごと ── **「一部」は「まるごと」と同じ顔をさせない。**
        一部のQは、そのQの日をぜんぶ含んでいない。
        なのに**そのQの窓（8/8〜8/15）で PitFlow 側を集めると、
        PDF に載っていない日の実績が丸ごと「PitFlowだけ」に化ける**。
        ＝ だから一部のQは、**PDFに入っている日の範囲だけ**を期間にする。
        ＝ そして **「済」にしない**（そのQを見終わっていないから）。呼ぶ側が `全部` を見て決める。

     🔴 区切りは **sales.js の `pitQuarterOf` 1本**。ここで 1-7／8-15 と書かない。
     ⚠ 期間が読めなかった時は、**伝票の日付の いちばん古い〜新しい** で代わりに切る
        （それしか手がかりが無いので。呼ぶ側に `期間の出どころ` で正直に伝える）。

     戻り＝[{ label, no, q, from, to, 全部, 伝票 }]（古い順）
     ================================================================ */
  function splitByQuarter(term, slips){
    slips = slips || [];
    var from = t(term && term.from), to = t(term && term.to), src = 'PDF';
    if (!from || !to){
      var ds = slips.map(function (r) { return t(r.売上日); }).filter(Boolean).sort();
      if (!ds.length) return { 期間: null, 期間の出どころ: 'なし', 組: [] };
      from = ds[0]; to = ds[ds.length - 1]; src = '伝票の日付';
    }
    if (from > to){ var sw = from; from = to; to = sw; }

    var out = [], cur = from, guard = 0;
    while (cur <= to && guard++ < 200){
      var q = qOf(cur);
      if (!q) break;
      var gs = (q.s > from ? q.s : from);          /* 窓とPDFの重なり */
      var ge = (q.e < to   ? q.e : to);
      var rows = slips.filter(function (r) { var d = t(r.売上日); return d && d >= gs && d <= ge; });
      out.push({
        no: q.no, q: q, label: q.label,
        from: gs, to: ge,
        /* 🔴 そのQの窓をまるごと含んでいるか。ここが「済にしてよいか」の唯一の判断 */
        全部: (gs === q.s && ge === q.e),
        伝票: rows
      });
      cur = shift(q.e, 1);
    }
    return { 期間: { from: from, to: to }, 期間の出どころ: src, 組: out };
  }

  /* ================================================================
     3. PitFlow 側の材料を集める（**読むだけ・1バイトも書き換えない**）
     ----------------------------------------------------------------
     🔴 期間の判定・数える日・確度は **PitFlow の物差しをそのまま借りる**（写しを作らない）。
     🔴 集める窓は、比べたい期間より**前後に広い**。
        ＝ 日付がズレている車を「無い車」に化けさせないため（2026-08-08 の教訓）。

     🔴🔴 v2.8.0（ゆうた 2026-08-25）**窓は2つある。混ぜないこと。**
        | ① 見える窓（ここ・既定 **45日**） | 「カードが有るかどうか」を**言うため**だけ |
        | ② 結ぶ窓（`match` の `結ぶ幅`・**14日**） | **お金を結ぶ**ため。ここは1ミリも緩めない |
        ＝ 窓を広げても **`pairs` は1件も変わらない → 検算は1円も動かない。**
        ⚠ ①だけ広げるのが肝。①②を一緒に広げると、
           「1か月半おきに来る同じ車」の**別の入庫**と結んで、金額の嘘が出る。
     ================================================================ */
  function collect(opt){
    opt = opt || {};
    var from = t(opt.from), to = t(opt.to), padDays = (opt.pad == null ? 45 : +opt.pad);
    var wFrom = shift(from, -padDays), wTo = shift(to, padDays);
    var cards = opt.cards || (w.state && w.state.cards) || [];
    var countDate = w.pitSalesCountDate || function (c) { return s(c.completedAt || c.returnDateFinal || c.returnDate); };
    /* 💴 v1.185.0 カードが持っている「売上日」（伝票が立った日）。🔴 物差しは sales-date.js の1本。
       ⚠ ここで `c.salesDate || c.completeCallAt` と書き写さないこと。 */
    var salesDate = w.pitSalesDate || function (c) { return s(c.salesDate || c.completeCallAt); };
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
        売上日: s(salesDate(c)),          /* 💴 v1.185.0 伝票が立った日（PDF側の売上日と直接くらべる相手） */
        実績カウント日: s(c.completedAt),
        確定返車日: s(c.returnDateFinal),
        返車日: s(c.returnDate),
        入庫日: sd,
        ナンバー: s(c.plate),
        顧客名: nameOf(c),
        車種: s(c.car),
        /* 🚗 v2.2.0 車体番号＝お客様の車に入っている番号（customers.js の1本から引く） */
        車体番号: s(w.pitVehVin ? w.pitVehVin(c.plate) : ''),
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
     🚗 v2.2.0 「同じ車か」の物差し（ここ1本）
     ----------------------------------------------------------------
     🔴 **車体番号がそろっていれば、それが答え。**（ゆうた 2026-08-24）
        車種の呼び方のちがい（「ＷＲＸ」と「スバル インプレッサ」）は見ない。
     ⚠ PitFlow 側に車体番号が無いうちは、車種で見るしかない。
        1回でも入庫して番号が入れば、そのあとは番号で見る。
     ⚠ 車種は**片方が短いだけ**のことが多いので、**どちらかがどちらかを含んでいれば同じ**とみなす。
     ================================================================ */
  function normCar(v){
    return toHalf(s(v)).replace(/[\s　・]/g, '').toUpperCase();
  }
  function sameCar(pair){
    var sv = t(pair && pair.soft && pair.soft.車体番号).toUpperCase();
    var pv = t(pair && pair.pit && pair.pit.車体番号).toUpperCase();
    if (sv && pv) return (sv === pv) ? 'vinOK' : 'vinNG';
    var sc = normCar(pair && pair.soft && pair.soft.車種);
    var pc = normCar(pair && pair.pit && pair.pit.車種);
    if (!sc || !pc) return 'ok';                       /* 片方が空＝言わない */
    return (sc.indexOf(pc) >= 0 || pc.indexOf(sc) >= 0) ? 'ok' : 'carNG';
  }

  /* ================================================================
     📅 v2.2.0 日付の答えは「**売上日どうし**」1本（ゆうた 2026-08-24）
     ----------------------------------------------------------------
     🔴 前はフロントマンの売上日と PitFlow の実績日（＝返車日）をくらべていた。
        返車日は「車を返した日」で、伝票を立てた日とは意味がちがう。
        🗣「実績日は返車日だから、常に当日ビューから返車済みにする。ほぼズレない」
        ＝ 実績日は**事実として出すだけ**。良し悪しを言わない。
     ⚠ PitFlow の売上日は 2026-08 に足したばかり。始めのうちは「入っていません」がずらっと出る。
        **それが正しい姿**（隠さない）。
     ================================================================ */
  function salesGap(pair){
    var sd = t(pair && pair.soft && pair.soft.売上日);
    var pd = t(pair && pair.pit && pair.pit.売上日);
    if (!pd) return { kind: 'none', 日: null, label: 'PitFlow に売上日が入っていません' };
    var n = daysBetween(sd, pd), sg = (n > 0 ? '+' : '');
    if (n === 0) return { kind: 'same', 日: 0, label: '売上日が一致' };
    var g = dateGap(sd, pd);
    if (g.kind === 'crossMonth') return { kind: 'crossMonth', 日: n, label: '売上日が月またぎ（' + sg + n + '日）' };
    if (g.kind === 'crossQ')     return { kind: 'crossQ',     日: n, label: '売上日がQまたぎ（' + sg + n + '日）' };
    return { kind: 'diff', 日: n, label: '売上日が ' + sg + n + '日 ちがう' };
  }

  /* ================================================================
     🗂 v2.2.0 入り口は4つだけ（ゆうた 2026-08-24）
     ----------------------------------------------------------------
     🗣「金額が違う／日付が違う／データがちがう／OK の4グループで事足りない？」
     🔴 **1件は1か所にしか出ない。** 重いほうから順に見て、最初に当たった所へ入れる。
        ＝ 4つを足すと全部になる。「どこかで二重に数えている」が起きない。
     🔴 見る順番＝**お金が動くものが先**。だからお金の内訳もこの4つでそのまま合う
        （検算「内訳＝差」がこの並びのまま生きる）。
     🔴 ~~**OK ＝ 差に1円も効いていない**が条件~~
        → 🔔 **v2.8.3 でここだけ変えた**（ゆうた 2026-08-25「**あくまでお知らせで、扱いはOK**」）。
        下の `crossOnly` だけは、差に効いていても OK に入る。
        ⚠ その代わり、**画面の OK の箱は「0円」と決め打ちしないこと**（実際の効きを出す）。
           決め打ちのままだと「4つを足すと差になる」が崩れる。→ quarter.js の groupBar 参照。
     ⚠ 担当ちがいはお金が動かないので最後。ほかに何も無い車だけがここに出る。
     ================================================================ */
  function effect(pair){
    /* その1件が「差」にいくら効いているか */
    return pair.期間の外 ? num(pair.soft.金額) : (num(pair.soft.金額) - num(pair.pit.確定金額));
  }

  /* ================================================================
     🔔 v2.8.3 **返車日だけQをまたいだ「正常」な組み合わせ**（ゆうた 2026-08-25）
     ----------------------------------------------------------------
     🗣「結局直しようがないような？？？」
     🗣「そのケースは **あくまでお知らせで、扱いは OK にしてほしい**」

     ◎実データ（8/1〜8/23・109枚）で見たもの
       期間の外 18件のうち **16件が、金額ぴったり0円差・同じ車・売上日どうしも一致**。
       例）伝票 071 … 売上日 8/6（Q1）／カードの売上日 8/6（一致）／実績日 8/8（Q2）／870,020円・差0円
       ＝ **伝票は8/6に切って、車は8/8に返した。どちらも正しい。直す先が無い。**
       なのに「日付がちがう ⚠15件」として赤黄と同じ顔で並び、**本当に直す8件が埋もれていた。**

     🔴🔴 **月をまたいだら、ここには入れない**（ゆうた 2026-08-25「ダメなのは月またぎ」）。
        2026-08-08 に決めた3段階をそのまま守る。
        | 同じQの中   | ✅ 出さない |
        | Qをまたぐ   | 🟡 要確認 ← **金額・車・売上日が全部合っていれば、ここだけ「お知らせ」に落とす** |
        | 月をまたぐ  | 🔴 **全件NG。月次の実績が変わるので、合っていようが直す** |

     🔴 4つとも揃って初めて「お知らせ」。1つでも欠けたら今までどおり「日付がちがう」。
        ＝ 売上日が入っていないカード（`kind:'none'`）は**確かめようが無いので入れない**。
     ================================================================ */
  function crossOnly(pair){
    if (!pair || !pair.期間の外) return false;
    /* 🔴 月またぎは問答無用で外す */
    if (pair.日付 && pair.日付.kind === 'crossMonth') return false;
    if (!pair.同じ車) return false;                       /* 車体番号／車種が合っている */
    if (!pair.金額一致) return false;                     /* ±1円まで */
    if (!pair.売上日差 || pair.売上日差.kind !== 'same') return false;  /* 売上日どうしがぴったり */
    return true;
  }

  function groupOf(pair){
    var id = sameCar(pair);
    if (id === 'vinNG' || id === 'carNG') return 'data';   /* 別の車かも＝結びつけが怪しい */
    /* 🔔 v2.8.3 直す先が無いもの＝OK（お知らせは画面が1行出す）。⚠ 期間の外の判定より先 */
    if (crossOnly(pair))                   return 'ok';
    if (pair.期間の外)                     return 'date';   /* お金は動くが、原因は日付 */
    if (effect(pair) !== 0)                return 'money';  /* 1円でもちがえば金額の話 */
    if (salesGap(pair).kind !== 'same')    return 'date';
    if (!pair.担当一致)                    return 'data';
    return 'ok';
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
        車体番号: t(r.車台 || r.車体番号),      /* 🚗 v2.2.0 伝票が持っている車体番号 */
        /* 🧾 v2.2.0 伝票の中身は**そのまま連れて行く**。
           ⚠ ここで捨てると、書き込み（quarter-write.js）が空の伝票を作ってしまう。
              「合っているか」の判定は PDF を読んだ側（quarter-pdf.js）の1本きり。ここでは作らない。 */
        明細: Array.isArray(r.明細) ? r.明細 : [],
        明細が合う: !!r.明細が合う,
        明細合計: num(r.明細合計),
        法定: Array.isArray(r.法定) ? r.法定 : [],
        原価: num(r.原価),
        消費税: num(r.消費税),
        伝票計: num(r.伝票計),
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
        売上日: t(r.売上日),               /* 💴 v1.185.0 カード側の売上日。無い材料（古い書き出し）なら空 */
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
        車種: t(r.車種),
        車体番号: t(r.車体番号),               /* 🚗 v2.2.0 PitFlow 側の車体番号（入っていなければ空） */
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
        期間の外: !pr.対象期間内,
        /* 💴 v1.185.0 カードが自分の売上日を持っていて、それが伝票の日とちがう。
           🔴 **お金は1円も動かない**（金額の話ではない）ので、**検算の足し算には入れない。**
           ⚠ 売上日を持っていないカードは「ちがう」と言わない（無いものを間違い扱いしない）。 */
        売上日ちがい: !!(pr.売上日 && pr.売上日 !== sr.売上日)
      });
      /* 🚗📅🗂 v2.2.0 同一性・売上日どうし・どのグループか・差にいくら効くか。
         🔴 判定は**この物差し1本**。画面（quarter.js）で綴り直さないこと。 */
      var _p = pairs[pairs.length - 1];
      _p.同一性 = sameCar(_p);
      _p.同じ車 = (_p.同一性 !== 'vinNG' && _p.同一性 !== 'carNG');
      _p.売上日差 = salesGap(_p);
      _p.効き = effect(_p);
      _p.組 = groupOf(_p);
      /* 🔔 v2.8.3 「直す先が無い」印。画面はこれを見てお知らせの1行を出すだけ（自分で判定しない） */
      _p.正常なQまたぎ = crossOnly(_p);
    }

    /* 🔴🔴 v2.8.0 **結ぶ窓（既定＝期間の前後14日）**。ここが「お金を結んでよい範囲」。
       ⚠ 集める窓（`pitQCollect` の前後45日）を広げたのは**カードが有ると言うため**であって、
          結ぶためではない。結ぶ側まで広げると、1か月半おきに来る同じ車の
          **別の入庫**と結んで、金額の嘘が出る（2026-08-08 の教訓と同じ道）。
       🔴 既定の 14 は **v2.8.0 より前の「集める窓」と1日も違わない**。
          ＝ 窓を広げても `pairs` は1件も変わらない ＝ **検算は1円も動かない。**
       ⚠ ①-a（ナンバー＋売上日がぴったり同じ）だけは窓で切らない。
          **同じ日に同じナンバーで伝票が立っている＝同じ車**で、迷いようがない。 */
    var LINKPAD = (opt.結ぶ幅 == null ? 14 : +opt.結ぶ幅);
    var lFrom = shift(from, -LINKPAD), lTo = shift(to, LINKPAD);
    /* ⚠ 見る日は **v2.8.0 より前の `pitQCollect` が窓に当てていた日と同じ4つ**
       （売上日／数える日／返車日／入庫日）。1つでも窓に入っていれば結んでよい。
          ここを減らすと、前は結べていた車が結べなくなる＝**直したつもりで壊す。** */
    function near(p){
      if (!lFrom || !lTo) return true;          /* 期間が読めない時は今までどおり全部 */
      var g = p.生 || {};
      var ds = [p.売上日, p.数える日, p.返車日, t(g.入庫日), t(g.返車日 || g.確定返車日)];
      for (var i = 0; i < ds.length; i++){
        var d = t(ds[i]);
        if (d && d >= lFrom && d <= lTo) return true;
      }
      return false;
    }

    /* ①-a ナンバー＋**カードの売上日**（💴 v1.185.0）
       🔴 ここがいちばん確か＝**同じ「売上日」どうし**をくらべている。
       ⚠ 売上日を持っていないカード（この仕組みより前に返した車）は空なので、ここには当たらない。
          その車は下の ①-b（数える日）と ② が今までどおり拾う＝**取りこぼしは増えない。** */
    softRows.forEach(function (sr) {
      if (!sr._plate || !sr.売上日) return;
      var hit = act.filter(function (p) { return !p._used && p._plate === sr._plate && p.売上日 && p.売上日 === sr.売上日; })[0];
      if (hit) take(sr, hit, 'ナンバー＋売上日');
    });
    /* ①-b ナンバー＋数える日（返車日）。v1.181.0 からの道。**そのまま残す。** */
    softRows.forEach(function (sr) {
      if (!sr._plate || pairs.some(function (p) { return p.soft.i === sr.i; })) return;
      var hit = act.filter(function (p) { return !p._used && p._plate === sr._plate && p.数える日 === sr.売上日; })[0];
      if (hit) take(sr, hit, 'ナンバー＋日付');
    });
    /* ② ナンバーだけ（いちばん日が近いもの）。⚠ v2.8.0 **結ぶ幅の中だけ** */
    softRows.forEach(function (sr) {
      if (!sr._plate || pairs.some(function (p) { return p.soft.i === sr.i; })) return;
      var cand = act.filter(function (p) { return !p._used && p._plate === sr._plate && near(p); });
      if (!cand.length) return;
      /* 💴 v1.185.0 「いちばん日が近い」の測り方＝**カードの売上日があればそちら**で測る。
         ＝ 同じナンバーの車が窓の中に2台いる時、返車日ではなく売上日で近いほうを選ぶ。 */
      cand.sort(function (a, b) {
        var da = daysBetween(sr.売上日, a.売上日 || a.数える日);
        var db = daysBetween(sr.売上日, b.売上日 || b.数える日);
        return Math.abs(da == null ? 999 : da) - Math.abs(db == null ? 999 : db);
      });
      take(sr, cand[0], 'ナンバー');
    });
    /* ③ 顧客名＋金額（±1円）。⚠ ナンバーが空の伝票（仮登録車など）の受け皿 */
    softRows.forEach(function (sr) {
      if (pairs.some(function (p) { return p.soft.i === sr.i; })) return;
      if (!sr._name) return;
      var cand = act.filter(function (p) {
        return !p._used && p._name && p._name === sr._name && Math.abs(p.確定金額 - sr.金額) <= 1 && near(p);
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
       🔗 v2.8.0（ゆうた報告 2026-08-25）**Qをまたいだ車を、二度言わない**
       ----------------------------------------------------------------
       🗣「今PitFlowとフロントマンのそれぞれにデータがないが量産される。
       　　多分Qまたぎの車両を紐づけられてないんだと思う。
       　　例 Q1 フロントマンになし／Q2 PitFlowになし → セットの車では？」

       ◎起きていたこと（手元で組んで再現した）
         伝票 8/10（Q2）・カードの数える日 8/5（Q1）の車を、8/1〜8/15 のPDFで見ると
         　Q2 … 伝票と結ばれる（期間の外）  ← 正しい
         　Q1 … **PitFlowだけ**に出る       ← 嘘。伝票はちゃんと在る（隣のQに）
         `pitQMatch` は**1組ぶんしか知らない**ので、隣の組で結ばれたことが見えていなかった。
         月まるごとのPDF（4組）だと、Qの境目の車が全部これをやる＝**量産**。

       🔴🔴 直し方の決めごと ── **金額は1円も動かさない。**
         `内訳` も `検算` もそのまま。**名札（`別のQ`）を1枚貼るだけ。**
         ＝ 検算がこの並びのまま生きる。赤が「本当に無い車」だけになる。

       ここでは**自分の組だけで分かること**を貼る（＝カード自身の売上日）。
       組をまたいで見るのは下の `crossLink`（呼ぶのは quarter.js が全組を数え終わったあと）。
       ================================================================ */
    function qLabel(dateStr){
      var q = qOf(t(dateStr));
      return q ? q.label : '';
    }
    /* 🟡 カードが自分の売上日を持っていて、それがこの期間の外＝**伝票は別のQに立っている。** */
    pitOnly.forEach(function (p) {
      p.別のQ = '';
      var sd = t(p.売上日);
      if (!sd || !from || !to) return;
      if (sd >= from && sd <= to) return;
      p.別のQ = 'このカードの売上日は ' + sd + '（' + (qLabel(sd) || '別のQ') + '）です';
    });
    /* 🟡 伝票のほうは、カードが**この期間の外の実績**なら、それを言う。
       ⚠ 「結ぶ」話ではない（お金は1円も動かない）。**言うだけ。**
       🔴 言い方に気をつけること。**「同じナンバーのカード」**であって
          「この伝票の相手」とは言わない（同じ車が2回入庫していることがある）。
          だから**確定金額もいっしょに出す**＝目で見て別の入庫だと分かる。 */
    softOnly.forEach(function (x) {
      x.カード別Q = '';
      var c = x.カード; if (!c) return;
      var cd = t(c.数える日);
      if (!cd || !from || !to) return;
      if (cd >= from && cd <= to) return;
      x.カード別Q = '同じナンバーのカードは ' + cd + '（' + (qLabel(cd) || '別のQ') + '）の実績です'
                  + '（確定 ' + num(c.確定金額).toLocaleString('ja-JP') + '円'
                  + (Math.abs(num(c.確定金額) - num(x.soft.金額)) <= 1 ? '・伝票と同じ金額' : '・伝票とちがう金額') + '）';
    });

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
    var sdNg    = pairs.filter(function (p) { return p.売上日ちがい; });   /* 💴 v1.185.0 */

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
      売上日ちがい: sdNg,          /* 💴 v1.185.0 カードの売上日が伝票とちがう（お金は動かない・直すのは日付だけ） */
      /* 🗂 v2.2.0 入り口は4つ。1件は1か所にしか出ない */
      グループ: {
        データ: pairs.filter(function (p) { return p.組 === 'data'; }),
        金額:   pairs.filter(function (p) { return p.組 === 'money'; }),
        日付:   pairs.filter(function (p) { return p.組 === 'date'; }),
        OK:     pairs.filter(function (p) { return p.組 === 'ok'; })
      },
      別の車かも: pairs.filter(function (p) { return !p.同じ車; }),
      整備ソフトだけ: softOnly,
      PitFlowだけ: pitOnly,
      まとめ返車: lump
    };
  }

  /* ================================================================
     🔗 v2.8.0 組をまたいで見る（**1回のPDFの中だけ**）
     ----------------------------------------------------------------
     ◎もらうもの … quarter.js が作る組の配列 `[{ label, from, to, res }, ...]`
     ◎やること   … ある組で「PitFlowだけ」に落ちたカードが、
                    **別の組で伝票と結ばれていたら**、その事実で名札を上書きする。
     🔴 **数字には一切さわらない。** `内訳`・`検算`・`結びついた` は読むだけ。
     ⚠ 呼ぶのは**全部の組を数え終わったあと**（1組だけ数えた時点では意味がない）。
     ⚠ 何度呼んでも同じ結果になるように書く（直すたびに呼ばれる）。
     ================================================================ */
  function cardIdOf(x){
    if (!x) return '';
    return t((x.生 && x.生.id) || x.id);
  }
  function crossLink(groups){
    groups = (groups || []).filter(function (g) { return g && g.res; });
    if (groups.length < 2) return groups;
    /* ① どのカードが、どの組で、どの伝票と結ばれたか */
    var byCard = {};
    groups.forEach(function (g) {
      (g.res.結びついた || []).forEach(function (p) {
        var id = cardIdOf(p.pit);
        if (id) byCard[id] = { label: t(g.label), 売上日: t(p.soft.売上日), 伝票: t(p.soft.伝票) };
      });
    });
    /* ② 名札を貼り直す */
    groups.forEach(function (g) {
      (g.res.PitFlowだけ || []).forEach(function (x) {
        var m = byCard[cardIdOf(x)];
        if (!m || m.label === t(g.label)) return;
        x.別のQ = '伝票は ' + m.label + '（' + m.売上日 + '・' + (m.伝票 || '伝票番号なし') + '）にあります';
        x.別のQ確定 = true;                     /* 🔴 実際に結ばれた＝いちばん強い証拠 */
      });
      (g.res.整備ソフトだけ || []).forEach(function (x) {
        var m = byCard[cardIdOf(x.カード)];
        /* ⚠ そのカードが**別の伝票**と結ばれているなら、この伝票の相手ではない。
           ＝「カードは別のQにあります」と言ってはいけない。今までどおり黄のまま置く。 */
        if (m && m.伝票 !== t(x.soft.伝票)) x.カード別Q = '';
      });
    });
    return groups;
  }

  w.pitQNormPlate = normPlate;
  w.pitQNormName  = normName;
  w.pitQStaffName = staffName;
  w.pitQDateGap   = dateGap;
  w.pitQCollect   = collect;
  w.pitQSplit     = splitByQuarter;   /* 🗓 v2.0.0 PDF の期間をクォーターごとに割る */
  w.pitQMatch     = match;
  w.pitQCrossLink = crossLink;    /* 🔗 v2.8.0 組をまたいで見る（Qまたぎの車を二度言わない） */
  w.pitQSameCar   = sameCar;      /* 🚗 v2.2.0 同じ車か（車体番号→無ければ車種） */
  w.pitQSalesGap  = salesGap;     /* 📅 v2.2.0 売上日どうしのズレ */
  w.pitQEffect    = effect;       /* 🗂 v2.2.0 その1件が差にいくら効くか */
  w.pitQGroupOf   = groupOf;      /* 🗂 v2.2.0 4つのどれに入るか */
  w.pitQCrossOnly = crossOnly;    /* 🔔 v2.8.3 返車日だけQをまたいだ「正常」＝お知らせ扱い */
  w.PIT_Q_STAFF_ALIAS = STAFF_ALIAS;
})(window);
