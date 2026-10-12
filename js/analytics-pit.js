/* ================================================================================
   analytics-pit.js  -  📊 分析用の書き出し（Claude が読む表）  PitFlow v2.143.0（v2.177.0 受付の列・車検の表）
   ================================================================================
   ◎ゆうた指定（2026-10-05）
     🗣「ありとあらゆるデータをあなたに渡すってのがイメージの全容」
     🗣「ビッグデータを持てば、あなたが統合的に判断して、外部取締役ぐらいの感じになれるかな」
     決まりの本体＝`..\..\_記録\仕様\分析用の書き出し_全アプリ共通の決まり.md`（全アプリ共通）
     モック＝`..\_資料\01_モック\いま使っているもの\モック_分析用の書き出し_2026-10-05.html`

   ◎これは何
     入庫カード1枚＝1行の表（CSV）と、その列の説明書（辞書）を作る。
     🔴 **画面は持たない。** 毎晩サーバー（`_サーバー\functions\analytics.js`）が
        **本番のこのファイルをそのまま読み込んで**呼ぶ＝画面と表の数え方が必ず同じ。
     🔴 **数え方はここで作らない。** 実績・金額・課・フロント＝売上画面の `pitSalesMonthCollect`、
        実績日＝`pitSalesCountDate`、売上日＝`pitSalesDate`、作業タイプ＝`pitCardWorkTypes` …を借りるだけ。
        ここで足したのは「MINI のまとめ方」と「伝票の原価の引き方」の2つだけで、
        それも AIレポート（sales-ai.js）の中にあったものを**ここへ移して、向こうが借りる**形にした（写しを作らない）。

   ◎出さないもの（決まり §6）
     🔴 名前（フル）・電話・住所・ナンバー・メール・LINE の番号は**どの列にも入れない**。
     お客様は「苗字＋車種」の呼び名だけ（ゆうた指定）。苗字が切り出せない時は「（苗字不明）」＝下の名前を出さないため。

   ◎ここが返すもの
     pitCardMaker(c)        … メーカー（BMW の MINI と MINI は「MINI」）
     pitCardCost(c)         … その入庫の伝票の原価・部品・工賃（伝票が無ければ null）
     pitAnalyticsTable(opt) … { cols:[…], rows:[[…]], csv:'…', dict:'…（Markdown）', count:{…} }
   ⚠ 読み込みは pit-share / state / customers / sales-count / sales-date / insurance-pit / intern-pit /
      mech-pick / sales.js より**後ろ**、sales-ai.js より**前**（sales-ai が pitCardMaker / pitCardCost を借りる）。
   ================================================================================ */
(function (w) {
  'use strict';

  var VERSION = '2';   /* 🔴 列を足す・意味を変えたら上げる（辞書の頭に出る）
                          v2（2026-10-12）予約受付日・受付から入庫まで・予約担当・代車・取消の種類・取消日・取消理由を**後ろに**足した
                          ＋ 2枚目の表 pitflow.車検（1行＝1回の陸運局行き） */

  function s(v){ return v == null ? '' : String(v); }
  function t(v){ return s(v).trim(); }
  function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
  function S(){ return w.state || {}; }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function ymd(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function day(v){ var m = /^(\d{4}-\d{2}-\d{2})/.exec(t(v)); return m ? m[1] : ''; }
  function days(a, b){
    a = day(a); b = day(b); if (!a || !b) return null;
    var p = a.split('-'), q = b.split('-');
    return Math.round((new Date(+q[0], q[1] - 1, +q[2]) - new Date(+p[0], p[1] - 1, +p[2])) / 864e5);
  }
  function safe(fn, dflt){ try { var v = fn(); return v == null ? dflt : v; } catch (e) { return dflt; } }

  /* ================================================================
     🚗 メーカー（AIレポートから移した・物差しはここ1本）
     ⑧ BMW の MINI と MINI は「MINI」。メーカー欄だけでなく車種名で見る（いまのカードは BMW のミニが多い）
     ================================================================ */
  function isMini(c){
    var x = s(c && c.car) + ' ' + s(c && c.maker);
    return /ミニ|MINI|ﾐﾆ/i.test(x) && !/ミニカ|ミニキャブ|ミニバン/.test(s(c && c.car));
  }
  function pitCardMaker(c){ return isMini(c) ? 'MINI' : (t(c && c.maker) || 'メーカー未入力'); }

  /* ================================================================
     💰 伝票の原価（AIレポートから移した・物差しはここ1本）
     ◎出どころ＝クォーターチェックで車に書き込んだ伝票（予約番号でカードと結ぶ）
     ⚠ 工賃（作業）の原価は伝票上ほぼ0＝粗利は「部品の利益＋工賃」。人件費は入っていない
     ⚠ 伝票が無い車は null（＝分からない。0 にしない）
     ================================================================ */
  function pitCardCost(c){
    try {
      var h = w.pitVehByPlate ? w.pitVehByPlate(c.plate) : null;
      var d = h && h.veh && (h.veh.伝票 || []).filter(function (x) { return x && t(x.予約番号) && t(x.予約番号) === t(c.resNo); })[0];
      if (!d) return null;
      var o = { 原価: num(d.原価), 工賃: 0, 工賃原価: 0, 部品: 0, 部品原価: 0, 伝票: t(d.伝票) };
      (d.明細 || []).forEach(function (m) {
        if (!m) return;
        if (m.種 === '部品'){ o.部品 += num(m.金額); o.部品原価 += num(m.原価); }
        else if (m.種 === '作業'){ o.工賃 += num(m.金額); o.工賃原価 += num(m.原価); }
      });
      return o;
    } catch (e) { return null; }
  }

  /* ================================================================
     👤 呼び名＝苗字＋車種（決まり §6・ゆうた指定）
     🔴 下の名前を出さない。苗字が切り出せない時は「（苗字不明）」。
       ・姓の欄（sei）があればそれ → 無ければカナの姓（seiKana）
       ・それも無ければ pitCustSurname（姓と名のあいだに空白がある・法人の時だけ。空白が無い個人名は丸ごとになるので使わない）
     ================================================================ */
  /* 空白で姓と名が分かれている名前から姓を取る（法人はフル）。分かれていなければ ''（＝決めつけない） */
  function surOfFull(full){
    full = t(full); if (!full) return '';
    var sur = w.pitSurname ? t(w.pitSurname(full)) : '';
    if (/[㈱㈲]|\(同\)|会社|組合|法人/.test(sur)) return sur;
    return (/[\s　]/.test(full) && sur && sur !== full) ? sur : '';
  }
  var _custById = null;
  function custOf(c){
    if (!_custById){ _custById = {}; (S().customers || []).forEach(function (x) { if (x && x.id) _custById[x.id] = x; }); }
    return _custById[t(c.customerId)] || null;
  }
  function surnameOf(c){
    var a = t(c.sei) || t(c.seiKana);
    /* 🔴 v2.143.1 姓の欄にフルネームが空白区切りで丸ごと入っているカードがあった（本番で1件・2026-10-05）。
       会社名でなければ、最初の区切りまでだけ使う＝下の名前を出さない */
    if (a) return /[㈱㈲]|\(同\)|[（(][株有同][)）]|会社|組合|法人/.test(a) ? a : a.split(/[\s　]+/)[0];
    var full = w.pitCustName ? t(w.pitCustName(c)) : t(c.customer);
    var sur = surOfFull(full);
    if (sur) return sur;
    var cu = custOf(c);
    sur = cu ? (t(cu.sei) || surOfFull(cu.name)) : '';
    if (sur) return sur;
    return full ? '（苗字不明）' : '';
  }
  function callName(c){
    var a = surnameOf(c), car = t(c.car);
    return (a || '（名前なし）') + (car ? ' ' + car : '');
  }

  /* ラベル（設定の表から引く。直書きしない） */
  function labelIn(list, id){ var r = (list || []).filter(function (x) { return x && x.id === id; })[0]; return r ? t(r.label || r.name) : t(id); }
  function divOf(c){ if (c.division === 'div1' || c.division === 'div2' || c.division === 'recept') return c.division; return c.boardId === 'import' ? 'div2' : 'div1'; }

  /* 担当者：名前を「・」でつなぐ。「なし」と「未入力」は分ける（決まり §4） */
  function staffCol(c, role, noneKey){
    var a = Array.isArray(c[role]) ? c[role].map(t).filter(Boolean) : [];
    var seen = {}, out = [];
    a.forEach(function (n) { if (!seen[n]){ seen[n] = 1; out.push(n); } });
    if (out.length) return out.join('・');
    if (c[noneKey]) return 'なし';
    return '';   /* 空＝未入力 */
  }

  /* 🆕 v2 取り消しの種類。⚠ 人が押した予約キャンセル（cancelled）と、来なかった（noShow）は別物（card-view.js / today.js / overdue-pit.js） */
  function cancelKind(c){
    if (!c || c.status !== 'cancelled') return '';
    if (c.noShow && !c.cancelled) return '来店なし';
    return 'キャンセル';
  }

  /* CSV の1マス */
  function cell(v){
    if (v == null) return '';
    var x = (typeof v === 'number') ? String(v) : s(v);
    return /[",\r\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
  }

  /* ================================================================
     📊 表を作る
     opt.today … 書き出した日（省略＝今日）
     ================================================================ */
  var COLS = [
    ['アプリ', '常に pitflow'],
    ['ID', 'カードの番号。PitFlow で `?card=<ID>` を開くと予約詳細'],
    ['書き出した日', 'この表を作った日'],
    ['予約番号', 'カードの予約番号（伝票と結ぶ鍵）'],
    ['お客様番号', 'PitFlow の顧客台帳の番号（customerId）。空＝台帳と結んでいない'],
    ['車両番号', 'PitFlow の車両の番号（vehId）'],
    ['呼び名', '苗字＋車種。読む用で、数える・結ぶ鍵にはしない（同じ呼び名の別人がいる）。苗字が切り出せない時は（苗字不明）'],
    ['課', '1課（国産）／2課（輸入）／受付。カードの課（無ければ盤面から）'],
    ['状態', '予約・点検待ち…返車完了・キャンセル（画面の札と同じ言葉）'],
    ['売上の区分', '売上画面の6区分（実績／実績待／確定／予定／見込／予測）。キャンセル・売上なし・社内車両は空'],
    ['入庫日', '予約の入庫日（reserveDate）'],
    ['実際に入った日', '実入庫日（actualInAt）。まだ入っていなければ空'],
    ['返車日', '確定返車日（無ければ返車予定日）'],
    ['実績日', '実績に数える日（pitSalesCountDate）。保険は入金日。まだ実績でなければ空'],
    ['売上日', '伝票の日付（pitSalesDate）。無ければ完TEL日を借りる'],
    ['預かり日数', '実際に入った日 → 返車日（0＝当日返し）。どちらかが空なら空'],
    ['初回リピーター', 'カードの「初回／リピーター」'],
    ['何回目', '同じお客様番号のカードを入庫日順に数えた何回目か（キャンセルは数えない）。お客様番号が無ければ空'],
    ['受付タイプ', '待／当／預'],
    ['作業タイプ', '作業タイプ（基本＋併用）を「・」でつなぐ'],
    ['板金', '作業タイプに B.P があれば 1。AIレポートは板金を預かり日数の数字から外している'],
    ['付加', '保証／保険／社員 を「・」でつなぐ'],
    ['社内車両', '中古・代車・内部 のどれか（売上に数えない）'],
    ['売上なし', '売上なしアーカイブなら 1'],
    ['メーカー', 'BMW の MINI と MINI はまとめて MINI'],
    ['車種', 'カードの車種'],
    ['フロント担当', '売上画面と同じ拾い方'],
    ['点検担当', '名前を「・」でつなぐ。「なし」＝居ないと決めた。空＝未入力'],
    ['整備担当', '同上'],
    ['チェック担当', '同上（導入前のカードは空が正常）'],
    ['金額', '税抜・円。売上画面と同じ金額（確定 → 受注 → 見積 → 概算の順に拾う）'],
    ['伝票番号', 'クォーターチェックで結びついた伝票。空＝結びついていない'],
    ['原価', '伝票の原価（税抜）。空＝伝票が無い＝分からない（0 ではない）'],
    ['部品売上', '伝票の明細のうち部品の金額'],
    ['部品原価', '伝票の明細のうち部品の原価'],
    ['工賃', '伝票の明細のうち作業の金額（工賃の原価は伝票上ほぼ0）'],
    ['粗利', '金額 − 原価。原価が空なら空。人件費は入っていない'],
    ['粗利率', '粗利 ÷ 金額（%・小数1桁）'],
    ['1日あたり粗利', '粗利 ÷ 預かり日数（0日は1日として割る＝AIレポートと同じ）'],
    ['売掛', '入金日を分ける（売掛）なら 1'],
    ['入金日', '売掛・保険の入金日'],
    /* 🆕 v2（2026-10-12・ゆうた「受付部分の追加」）**後ろに足した**＝前の列の並びは変えない */
    ['予約受付日', '予約を受けた日（予約詳細の「予約受付日」bookedAt）。空＝入っていない（古いカード・入庫のあと入力など）'],
    ['受付から入庫まで', '予約受付日 → 入庫日の日数（0＝当日の予約）。どちらかが空なら空'],
    ['予約担当', '予約を受けた人（reserveStaff）。フロント担当とは別の人のことがある。空＝未入力'],
    ['代車', '代車「必要」なら 1'],
    ['取消の種類', 'キャンセル＝人が押した予約キャンセル／来店なし＝入庫日を過ぎても来なかった（自動・当日ビューの「来なかった」）。取り消していなければ空'],
    ['取消日', 'キャンセル・来店なしになった日（cancelledAt）'],
    ['取消理由', 'キャンセルの窓に書いた1行（任意・自由文）。来店なしは空']
  ];

  function pitAnalyticsTable(opt){
    opt = opt || {};
    var today = opt.today || ymd(new Date());
    _custById = null;   /* 顧客台帳の引き当ては毎回作り直す（前回の中身を使わない） */
    var st = S(), cards = (st.cards || []).filter(function (c) { return c && c.id; });

    /* 売上画面の集め方を借りる（区分・金額・課・フロント）。範囲は全部 */
    var byId = {};
    safe(function () {
      var C = w.pitSalesMonthCollect('2000-01-01', '2099-12-31');
      (C.rows || []).forEach(function (r) { if (r && r.c && r.c.id) byId[r.c.id] = r; });
      return 1;
    }, 0);
    var tierName = {};
    (w.PIT_SALES_TIERS || []).forEach(function (x) { tierName[x.id] = x.label; });

    /* 何回目＝同じお客様番号を入庫日順に（キャンセルは数えない） */
    var nth = {};
    var byCust = {};
    cards.forEach(function (c) {
      var k = t(c.customerId); if (!k || c.status === 'cancelled') return;
      (byCust[k] = byCust[k] || []).push(c);
    });
    Object.keys(byCust).forEach(function (k) {
      byCust[k].sort(function (a, b) { return (day(a.actualInAt) || day(a.reserveDate)).localeCompare(day(b.actualInAt) || day(b.reserveDate)); })
               .forEach(function (c, i) { nth[c.id] = i + 1; });
    });

    var specials = w.PIT_WORK_SPECIALS || [];
    var count = { 行: 0, 伝票あり: 0, 実績: 0 };
    var rows = cards.map(function (c) {
      var r = byId[c.id] || null;
      var ret = day(c.returnDateFinal) || day(c.returnDate);
      var inAt = day(c.actualInAt);
      var stay = days(inAt, ret);
      var amt = r ? num(r.amt) : num(safe(function () { return w.pitFinalAmountOf(c); }, 0));
      var co = pitCardCost(c);
      var gross = co ? amt - co.原価 : null;
      var wts = safe(function () { return w.pitCardWorkTypes(c); }, []).map(function (x) { return t(x && (x.label || x.name || x.id)); }).filter(Boolean);
      var bp = safe(function () { return w.pitCardWorkIds(c); }, []).indexOf('bp') >= 0;
      var sp = (Array.isArray(c.workSpecials) ? c.workSpecials : []).map(function (id) { return labelIn(specials, id); });
      var tier = r ? t(r.tier) : '';
      count.行++; if (co) count.伝票あり++; if (tier === 'actual') count.実績++;
      return [
        'pitflow', c.id, today, t(c.resNo), t(c.customerId), t(c.vehId), callName(c),
        labelIn(st.divisions, divOf(c)),
        safe(function () { return w.pitCardStatusText(c); }, t(c.status)),
        tier ? (tierName[tier] || tier) : '',
        day(c.reserveDate), inAt, ret,
        day(safe(function () { return w.pitSalesCountDate(c); }, '')),
        day(safe(function () { return w.pitSalesDate(c); }, '')),
        stay,
        c.repeat ? labelIn(st.repeatTypes, c.repeat) : '',
        nth[c.id] || '',
        [c.dropType, c.dropType2].filter(Boolean).map(function (id) { return labelIn(st.dropTypes, id); }).join('・'),
        wts.join('・'),
        bp ? 1 : '',
        sp.join('・'),
        safe(function () { return w.pitInternLabel(c); }, ''),
        safe(function () { return w.pitCardNoSale(c); }, false) ? 1 : '',
        pitCardMaker(c), t(c.car),
        r ? t(r.front) : t(c.frontStaff),
        staffCol(c, 'inspectors', 'inspectorsNone'),
        staffCol(c, 'mechanics', 'mechanicsNone'),
        staffCol(c, 'checkers', 'checkersNone'),
        amt,
        co ? co.伝票 : '',
        co ? co.原価 : '',
        co ? co.部品 : '', co ? co.部品原価 : '', co ? co.工賃 : '',
        gross == null ? '' : gross,
        (gross == null || !amt) ? '' : Math.round(gross / amt * 1000) / 10,
        (gross == null || stay == null) ? '' : Math.round(gross / Math.max(1, stay)),
        c.paymentSeparate ? 1 : '',
        day(c.paymentDate),
        /* 🆕 v2 受付 */
        day(c.bookedAt),
        days(c.bookedAt, c.reserveDate),
        t(c.reserveStaff),
        c.needLoaner ? 1 : '',
        cancelKind(c),
        cancelKind(c) ? day(c.cancelledAt) : '',
        (cancelKind(c) === 'キャンセル') ? t(c.cancelReason).replace(/[\r\n\t]+/g, ' ') : ''
      ];
    });

    var head = COLS.map(function (x) { return x[0]; });
    var csv = '﻿' + [head].concat(rows).map(function (r) { return r.map(cell).join(','); }).join('\r\n') + '\r\n';
    return { cols: head, rows: rows, csv: csv, dict: dict(today, count), count: count };
  }

  /* ================================================================
     📖 辞書（表と必ず一緒に置く・決まり §5）
     ================================================================ */
  function dict(today, count){
    var L = [];
    L.push('# pitflow.csv の辞書（版 ' + VERSION + '）');
    L.push('');
    L.push('- 書き出した日：' + today + '（PitFlow ' + t(w.PIT_APP_VERSION || '') + '）');
    L.push('- 1行＝入庫カード1枚。全部のカード（予約・キャンセル・売上なしも含む）。');
    L.push('- 行数：' + (count ? count.行 : '') + '／うち実績 ' + (count ? count.実績 : '') + '／伝票と結びついた ' + (count ? count.伝票あり : ''));
    L.push('- 数え方は PitFlow の画面と同じ部品を借りている（売上画面・AIレポートと数字が一致する）。');
    L.push('- 決まり＝`CoreFlowアプリ\\_記録\\仕様\\分析用の書き出し_全アプリ共通の決まり.md`');
    L.push('');
    L.push('## 読むときの注意');
    L.push('- 🔴 空と0は別。空＝分からない／入っていない。');
    L.push('- 🔴 原価・粗利は伝票と結びついた車だけ（クォーターチェックで伝票を書き込んだ車）。比べる時は「何台中何台か」を必ず添える。');
    L.push('- 保険は入金日で実績（実績日＝入金日）。売上の頑張りとは分けて見る（AIレポートの決まり）。');
    L.push('- 社内車両（中古・代車・内部）・売上なしは売上に数えない。売上の区分も空。');
    L.push('- 板金（B.P）は預かりが長くなるのが普通。預かり日数・1日あたりの比較からは外して見る。');
    L.push('- 2026-03 より前は伝票（原価）が無い。PitFlow を使い始めた頃のカードは入庫日・工程の記録がばらつく。');
    L.push('- 呼び名は読む用。数える・結ぶのはお客様番号・車両番号。');
    L.push('- 出す時の段：ゆうた宛ては全部言ってよい。社員が見る物では個人の比較・評価を出さない（決まり §6.5）。');
    L.push('');
    L.push('## 列');
    L.push('');
    L.push('| 列 | 中身 |');
    L.push('|---|---|');
    COLS.forEach(function (x) { L.push('| ' + x[0] + ' | ' + x[1].replace(/\|/g, '／') + ' |'); });
    L.push('');
    return L.join('\n');
  }

  /* ================================================================
     🚗 2枚目の表：車検（v2・2026-10-12・ゆうた「車検の追加」）
     ----------------------------------------------------------------
     1行＝**1回の陸運局行き**（合格も不合格も）。カード1枚に何行も付く（不合格 → 再検 → 合格）。
     ◎どこから
       ・不合格（とマスター入力で足した合格の行）… inspSchedule.history[]
       ・最後の合格 ……………………………………… inspSchedule.result === 'done'（resultDate 等）
       ⚠ マスター入力は合格も history に行として持つことがある＝同じ日の合格が両方にあれば1行にする
     ◎結果の言葉は車検予定の窓と同じ（pit-share.js pitShakenChoices の分かれ道）
       一発合格／再検合格（その場で直した）／再検で合格（不合格のあと）／不合格
     🔴 理由は pit-share.js pitShakenHistNote 1本（note／古い why）。回送担当は記録のまま（フルネーム）。
     ================================================================ */
  var SHK_COLS = [
    ['アプリ', '常に pitflow'],
    ['ID', 'カードの番号＝pitflow.csv の ID と同じ（カード1枚に何行も付く）。PitFlow で `?card=<ID>` を開くと予約詳細'],
    ['書き出した日', 'この表を作った日'],
    ['予約番号', 'カードの予約番号'],
    ['お客様番号', 'customerId'],
    ['車両番号', 'vehId'],
    ['呼び名', '苗字＋車種（pitflow.csv と同じ）'],
    ['課', '1課（国産）／2課（輸入）／受付'],
    ['メーカー', 'BMW の MINI と MINI はまとめて MINI'],
    ['車種', 'カードの車種'],
    ['社内車両', '中古・代車・内部 のどれか（代車・社用車の車検）。空＝お客様の車'],
    ['何回目の行き', 'このカードで陸運局へ行った何回目か（日付順）'],
    ['行った日', '陸運局へ行った日'],
    ['時間帯', 'AM／PM'],
    ['結果', '一発合格／再検合格（その場で直した）／再検で合格（不合格のあと）／不合格'],
    ['それまでの不合格', 'この行より前の不合格の回数（0＝初回）'],
    ['回送担当', '陸運局へ行った人（1人目・記録のままの名前）。担当別の数はこの人で数える。空＝未入力'],
    ['2人目', '一緒に行った2人目（数えない・見せるだけ）'],
    ['2人目の理由', '2人目がいる理由（研修・同乗 など）'],
    ['落ちた理由', '不合格・再検合格の時の1行（光軸・サイドスリップ など）。合格は空'],
    ['陸運局', '行った陸運局（名前）'],
    ['R', 'ラウンド（1〜4）。空＝未定'],
    ['入庫日', 'カードの入庫日'],
    ['カードの状態', '画面の札と同じ言葉（返車完了 など）']
  ];
  function shkReLabel(prevFails, kind){
    if (kind === 'fail') return '不合格';
    if (prevFails > 0) return '再検で合格';
    return kind === 'repass' ? '再検合格（その場で直した）' : '一発合格';
  }
  function pitAnalyticsShakenTable(opt){
    opt = opt || {};
    var today = opt.today || ymd(new Date());
    _custById = null;
    var st = S(), cards = (st.cards || []).filter(function (c) { return c && c.id && !c._draft; });
    var hn = function (h) { return w.pitShakenHistNote ? w.pitShakenHistNote(h) : t(h && (h.note || h.why)); };
    var count = { 行: 0, 台: 0, 不合格: 0 };
    var rows = [];
    cards.forEach(function (c) {
      var sc = c.inspSchedule;
      if (!sc || typeof sc !== 'object') return;
      if (!safe(function () { return w.pitIsShaken(c); }, false)) return;
      var trips = [];
      (Array.isArray(sc.history) ? sc.history : []).forEach(function (h) {
        if (!h || !day(h.date)) return;
        var kind = (h.result === 'pass') ? 'pass' : (h.result === 'repass') ? 'repass' : 'fail';
        trips.push({ d: day(h.date), slot: h.slot === 'pm' ? 'PM' : 'AM', kind: kind, staff: t(h.staff), staff2: t(h.staff2), note2: t(h.staff2Note),
                     why: (kind === 'pass') ? '' : hn(h), office: t(h.officeName), round: num(h.round) || '' });
      });
      var dd = day(sc.resultDate || sc.decided);
      if (sc.result === 'done' && dd){
        var dup = trips.some(function (x) { return x.kind !== 'fail' && x.d === dd; });
        if (!dup) trips.push({ d: dd, slot: (sc.resultSlot || sc.decidedSlot) === 'pm' ? 'PM' : 'AM', kind: sc.repass ? 'repass' : 'pass',
                               staff: t(sc.resultStaff), staff2: (t(sc.resultStaff2) !== t(sc.resultStaff)) ? t(sc.resultStaff2) : '', note2: t(sc.resultStaff2Note),
                               why: sc.repass ? t(sc.repassNote) : '', office: t(sc.officeName), round: num(sc.round) || '' });
      }
      if (!trips.length) return;
      trips.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0); });
      count.台++;
      var fails = 0;
      trips.forEach(function (x, i) {
        rows.push([
          'pitflow', c.id, today, t(c.resNo), t(c.customerId), t(c.vehId), callName(c),
          labelIn(st.divisions, divOf(c)), pitCardMaker(c), t(c.car),
          safe(function () { return w.pitInternLabel(c); }, ''),
          i + 1, x.d, x.slot, shkReLabel(fails, x.kind), fails,
          x.staff, x.staff2, x.staff2 ? x.note2 : '', x.why.replace(/[\r\n\t]+/g, ' '), x.office, x.round,
          day(c.reserveDate), safe(function () { return w.pitCardStatusText(c); }, t(c.status))
        ]);
        count.行++;
        if (x.kind === 'fail'){ fails++; count.不合格++; }
      });
    });
    var head = SHK_COLS.map(function (x) { return x[0]; });
    var csv = '﻿' + [head].concat(rows).map(function (r) { return r.map(cell).join(','); }).join('\r\n') + '\r\n';
    return { name: 'pitflow.車検', cols: head, rows: rows, csv: csv, dict: shkDict(today, count), count: count };
  }
  function shkDict(today, count){
    var L = [];
    L.push('# pitflow.車検.csv の辞書（版 ' + VERSION + '）');
    L.push('');
    L.push('- 書き出した日：' + today + '（PitFlow ' + t(w.PIT_APP_VERSION || '') + '）');
    L.push('- 1行＝**1回の陸運局行き**（合格・不合格とも）。カード1枚に何行も付く。カードの中身（金額など）は pitflow.csv を ID で引く。');
    L.push('- 行数：' + count.行 + '（' + count.台 + '台ぶん）／うち不合格 ' + count.不合格);
    L.push('- 決まり＝`CoreFlowアプリ\\_記録\\仕様\\分析用の書き出し_全アプリ共通の決まり.md`');
    L.push('');
    L.push('## 読むときの注意');
    L.push('- 🔴 **台数は「結果が合格の行」を数える**（不合格の行は同じ車の途中の記録）。不合格の率は「不合格の行 ÷ 行った回数」か「不合格が1回以上あった台 ÷ 台」かを必ず言い分ける。');
    L.push('- 再検合格（その場で直した）は**1回の行き**（その場で直して受かった）。再検で合格は不合格で持ち帰ったあとの回。');
    L.push('- 担当別の数は回送担当（1人目）で数える（PitFlow の車検履歴と同じ）。2人目は数えない。');
    L.push('- 記録の抜け（担当・理由が空）はデータチェックの S09〜S14 で直している最中。空は「分からない」。');
    L.push('- まだ行っていない予定は入れていない（行った記録だけ）。');
    L.push('- 出す時の段：ゆうた宛ては全部言ってよい。社員が見る物では個人の比較・評価を出さない（決まり §6.5）。');
    L.push('');
    L.push('## 列');
    L.push('');
    L.push('| 列 | 中身 |');
    L.push('|---|---|');
    SHK_COLS.forEach(function (x) { L.push('| ' + x[0] + ' | ' + x[1].replace(/\|/g, '／') + ' |'); });
    L.push('');
    return L.join('\n');
  }

  w.pitAnalyticsShakenTable = pitAnalyticsShakenTable;
  w.pitCardMaker = pitCardMaker;
  w.pitCardCost = pitCardCost;
  w.pitAnalyticsTable = pitAnalyticsTable;
  w.PIT_ANALYTICS_VERSION = VERSION;
})(window);
