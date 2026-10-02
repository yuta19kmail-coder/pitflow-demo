/* ================================================================================
   sales-ai.js  -  🤖 売上ビュー「AIレポート」タブ（月次レポート）  PitFlow v2.132.0
   ================================================================================
   ◎ゆうた指定（2026-10-02）
     🗣「売上の来店属性のよこにAIレポートタブを新設。AIを使った所感というかレポート」
     🗣「トリガーは4期までのすべてのPDF書き込みが終わったタイミング＝月締め」
     🗣「多方面からその月を見て、該当の車はアーカイブカードにリンクを張りながら、
        屈託、忖度なく、半年後とかに見た時にその時に戻れるようなしっかりとした内容」
     モック＝`PitFlow\_資料\01_モック\いま使っているもの\モック_AIレポート_2026-10-02.html`（ゆうた OK）

   ◎🔴 決めごと（モックのやり取りで確定）
     ① **月締め**＝その月の Q1〜Q4 すべてで「残り0」＋「伝票の書き込みが全部済み（中身が変わった0）」。
        判定はクォーターチェックの物差しをそのまま借りる（pitQMatch / pitQNokori / pitQWriteCount）。
     ② **書き出す・書き出し直すのは管理者だけ**（pitCanEditFinal）。読むのは全員。
        サーバー（pfAsk）でも管理者しか呼べない＝画面のボタンを消すだけにしない。
     ③ **書き出したら固定。** 数字・目標・AIの文を `pitSettings/aireport-YYYY-MM` に丸ごと残す。
        あとでカードや目標を直しても、このレポートの中は変わらない（半年後に「その時」へ戻るため）。
     ④ **数字はコードが出す。AI は文だけ書く。** AI に計算させない（数字の作り話を防ぐ）。
     ⑤ 1課・2課は分けて考える。総評だけまとめる。各課の最後に課題、最後に全体の課題、締めに「改善した未来」。
     ⑥ スライド＝A月に売上日、B月に返車で、A月の実績にならない車。
     ⑦ 保険（入金日で実績）は頑張りから外して「ボーナス枠」。課の分析にも入れない。
     ⑧ メーカーは BMW の MINI と MINI をまとめて「MINI」（開発全体メモの大前提）。
     ⑨ 外注に出している日数は課題に数えない（自社の場所も手も使わない）。
     ⑩ 止まった理由は引継ぎメモ（と書き換えの記録）から読む。理由のある止まりと無い止まりを分ける。
     ⑪ 人＝メンバーの「フロント」「メカ」チェックの人が主役（フロント＝売上・メカ＝生産）。

   ◎ここが返すもの
     pitAiRepMonth(wrap, head, y, m)  … タブの中身を描く（sales.js から呼ぶ）
     pitAiRepFacts(y, m)              … その月の数字を全部まとめる（AI に渡すもの＝画面に出すもの）
     pitAiRepGo()                     … 書き出す／書き出し直す（管理者）
     pitAiRepModel()                  … PDF 出力の形（sales.js の svReportModel から）
   ================================================================================ */
(function (w) {
  'use strict';

  var MODEL = 'claude-opus-5-5';
  /* ⚠ Opus 5.5 は「考える」ぶんも出力に数える（止められない）。16000 では考えるだけで使い切り、文が途中で切れた。
     40000＝9分（サーバーの待ち時間）に収まる目安。考える深さは medium（このモデルの標準）を明示。 */
  var MAX_TOKENS = 40000;
  var EFFORT = 'medium';

  function s(v){ return String(v == null ? '' : v); }
  function t(v){ return s(v).trim(); }
  function num(v){ v = +v; return isFinite(v) ? v : 0; }
  function esc(x){ return s(x).replace(/[&<>"']/g, function (m) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]; }); }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function ymd(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function man(n){ var m = num(n) / 10000; return (Math.abs(m) >= 100 ? Math.round(m) : Math.round(m * 10) / 10).toLocaleString() + '万'; }
  function yen(n){ return Math.round(num(n)).toLocaleString() + '円'; }
  function pct(a, b){ return b ? Math.round(a / b * 100) : 0; }
  function days(a, b){ if (!a || !b) return null; var p = s(a).split('-'), q = s(b).split('-');
    return Math.round((new Date(+q[0], q[1] - 1, +q[2]) - new Date(+p[0], p[1] - 1, +p[2])) / 864e5); }
  function md(v){ var p = s(v).split('-'); return p.length === 3 ? (+p[1]) + '/' + (+p[2]) : ''; }
  function S(){ return w.state || {}; }
  function co(){ try { return (w.fb && w.fb.company) ? w.fb.company() : null; } catch (e) { return null; } }
  function isAdmin(){ try { return !!(w.pitCanEditFinal && w.pitCanEditFinal()); } catch (e) { return false; } }
  function docId(ym){ return 'aireport-' + ym; }
  /* 🔴 課の名前と色は設定の表（state.divisions）から引く。ここに直書きしない（test_pit_rules ③） */
  function divRow(k){ return (S().divisions || []).filter(function (x) { return x && x.id === k; })[0] || null; }
  function divName(k){ var r = divRow(k); return r ? s(r.label) : ''; }
  function divColor(k){ var r = divRow(k); return r ? s(r.color) : ''; }
  var DIVS = [['div1', '国産'], ['div2', '輸入']];

  /* 画面の覚え（月ごと）。読み込みは1回だけ・描き直しで何度も読まない */
  var MEM = {};
  function M(ym){ return MEM[ym] || (MEM[ym] = { ym: ym }); }

  /* ================================================================
     🚗 車の見分け
     ================================================================ */
  /* ⑧ BMW の MINI と MINI は「MINI」。メーカー欄だけでなく車種名で見る（いまのカードは BMW のミニが多い） */
  function isMini(c){
    var x = s(c.car) + ' ' + s(c.maker);
    return /ミニ|MINI|ﾐﾆ/i.test(x) && !/ミニカ|ミニキャブ|ミニバン/.test(s(c.car));
  }
  function makerOf(c){ return isMini(c) ? 'MINI' : (t(c.maker) || 'メーカー未入力'); }
  /* お名前は pit-share.js の1本（pitCustSurname）から。ここで組み立てない（test_pit_rules ②） */
  function seiOf(c){ return w.pitCustSurname ? t(w.pitCustSurname(c)) : t(c.sei); }
  function frontOf(c){ return t(c.frontStaff) || t(c.staff) || '（未割当）'; }
  function shortFront(n){ return s(n).split(/[ 　]/)[0]; }
  function courseOf(c){ if (c.division === 'div1' || c.division === 'div2') return c.division; return c.boardId === 'import' ? 'div2' : 'div1'; }
  function insOf(c){ try { return !!(w.pitCardInsurance && w.pitCardInsurance(c)); } catch (e) { return false; } }
  function amtOf(c){ return w.pitFinalAmountOf ? num(w.pitFinalAmountOf(c)) : (num(c.amountFinal) || num(c.amountOrder) || num(c.amountQuote)); }
  function countDate(c){ return w.pitSalesCountDate ? s(w.pitSalesCountDate(c)) : s(c.completedAt); }
  function salesDate(c){ return w.pitSalesDate ? s(w.pitSalesDate(c)) : s(c.salesDate || c.completeCallAt); }
  function noSale(c){ return !!(w.pitCardNoSale && w.pitCardNoSale(c)); }
  /* 🔴 v2.135.0（ゆうた「データチェックで0にしたはずなのに、作業タイプ不明と言われる」）
     ◎正体＝ここが c.workType だけを見ていた。いまのカードは workTypes（配列）に入っている（B.P・3M など）。
     🔴 作業タイプは pit-share.js の1本（pitCardWorkTypes）から読む。データチェックと同じ物差し。 */
  function wtLabelOf(c){
    var a = w.pitCardWorkTypes ? w.pitCardWorkTypes(c) : (c.workType ? [{ label: c.workType }] : []);
    var l = a.map(function (x) { return t(x && (x.label || x.name || x.id)); }).filter(Boolean);
    return l.length ? l.join('・') : '未入力';
  }
  function phaseLabel(k){ try { return w.statusLabel ? (w.statusLabel(k) || k) : k; } catch (e) { return k; } }
  function mechsOf(c){
    var a = Array.isArray(c.mechanics) ? c.mechanics : [];
    var seen = {}, out = [];
    a.forEach(function (n) { n = t(n); if (n && !seen[n]){ seen[n] = 1; out.push(n); } });
    return out;
  }
  /* 🔴 v2.135.0（ゆうた「メカ未記入と言われるのがなん箇所かある」）
     ◎正体＝名前が空なら「未入力」と数えていた。でも空には2種類ある：
       ・「なし」を押した（外注の板金・物販など）＝ **正しい状態**
       ・本当に入れ忘れ ＝ データチェック T03 が言うもの
     🔴 入れ忘れかどうかは mech-pick.js の1本（pitMechUnsettled）で決める。データチェックと同じ物差し。 */
  function mechMissing(c){ try { return w.pitMechUnsettled ? w.pitMechUnsettled(c) : []; } catch (e) { return []; } }
  /* 状態を動かした記録から、工程ごとの日数（最後の工程は実績になった日まで） */
  function phasesOf(c, endDate){
    var log = (c.log || []).filter(function (l) { return l && l.type === 'phase' && l.at; })
                           .sort(function (a, b) { return a.at - b.at; });
    /* 最後の工程は「実績になった日の0時」まで（返車の記録が無い車で、1日多く数えないため） */
    var out = {}, end = endDate ? new Date(endDate + 'T00:00:00').getTime() : null;
    for (var i = 0; i < log.length; i++){
      var to = t(log[i].to); if (!to || to === 'returned') continue;
      var a = log[i].at, b = (i + 1 < log.length) ? log[i + 1].at : end;
      if (b == null || b < a) continue;
      out[to] = (out[to] || 0) + (b - a) / 864e5;
    }
    Object.keys(out).forEach(function (k) { out[k] = Math.round(out[k] * 10) / 10; });
    return out;
  }
  /* ⑩ 止まった理由を読むための材料：いまの引継ぎメモと、その書き換えの記録（日付つき） */
  function memoTrail(c){
    var a = [];
    (c.log || []).forEach(function (l) {
      var lb = s(l && l.label);
      if (/^編集：引継ぎメモ/.test(lb)) a.push(ymd(new Date(l.at)) + ' ' + lb.replace(/^編集：引継ぎメモ\s*/, '').slice(0, 160));
    });
    return { いま: t(c.handoffMemo).slice(0, 300), 書き換え: a.slice(-8), 症状: t(c.menu).slice(0, 160) };
  }

  /* ================================================================
     📊 その月の数字（＝AIに渡すもの＝画面に出すもの）
     🔴 実績・課・金額の拾い方は売上ビューと同じ（pitSalesMonthCollect の rows）。写しを作らない。
     ================================================================ */
  function facts(y, m0){
    var moS = ymd(new Date(y, m0, 1)), moE = ymd(new Date(y, m0 + 1, 0));
    var pS = ymd(new Date(y, m0 - 1, 1)), pE = ymd(new Date(y, m0, 0));
    var ym = moS.slice(0, 7);
    var C = w.pitSalesMonthCollect(moS, moE), P = w.pitSalesMonthCollect(pS, pE);
    var tg = w.pitSalesTarget(), dt = { div1: w.pitSalesDivTarget('div1'), div2: w.pitSalesDivTarget('div2') };
    var ratioD = (S().settings && S().settings.target && S().settings.target.ratioD != null) ? +S().settings.target.ratioD : 50;
    var biz = (w.pitQAlloc ? w.pitQAlloc(y, m0 + 1) : null), bizP = (w.pitQAlloc ? w.pitQAlloc(m0 === 0 ? y - 1 : y, m0 === 0 ? 12 : m0) : null);

    var cars = {};   /* id → 1行の顔（苗字 車種｜課｜フロント）。レポートの中で車を指す時はここを引く */
    function reg(c){ cars[c.id] = { id: c.id, 苗字: seiOf(c), 車種: t(c.car), 課: divName(courseOf(c)), 課の色: divColor(courseOf(c)), フロント: shortFront(frontOf(c)) }; return c.id; }

    var acts = C.rows.filter(function (r) { return r.tier === 'actual'; });
    /* 📋 通知表のための前月（保険は外す・課ごと／全体）＝台単価と預かりの中央値 */
    function statsOf(list){
      var a = list.filter(function (r) { return r.tier === 'actual' && !insOf(r.c); });
      var sum = a.reduce(function (x, r) { return x + r.amt; }, 0);
      var st = a.map(function (r) { return days(r.c.actualInAt, r.c.completedAt); }).filter(function (v) { return v != null; }).sort(function (p, q) { return p - q; });
      return { 台単価: a.length ? Math.round(sum / a.length) : null, 預かり中央値: st.length ? st[Math.floor(st.length / 2)] : null };
    }
    var prevStats = { 全体: statsOf(P.rows),
                      div1: statsOf(P.rows.filter(function (r) { return r.course === 'div1'; })),
                      div2: statsOf(P.rows.filter(function (r) { return r.course === 'div2'; })) };
    var total = acts.reduce(function (a, r) { return a + r.amt; }, 0);
    /* 大物＝1台で月の実績の10%以上（「大物が無ければ」の地力を言うため） */
    var bigLine = total * 0.10;

    var rows = acts.map(function (r) {
      var c = r.c, stay = days(c.actualInAt, c.completedAt);
      var ph = phasesOf(c, c.completedAt);
      reg(c);
      return { id: c.id, 課: r.course, 保険: insOf(c), 大物: r.amt >= bigLine, 金額: r.amt,
               メーカー: makerOf(c), 作業: wtLabelOf(c), フロント: shortFront(r.front), メカ: mechsOf(c).map(shortFront),
               担当の入れ忘れ: mechMissing(c),
               入庫: s(c.actualInAt), 完了: s(c.completedAt), 返車予定: s(c.returnDatePlan), 預かり: stay, 工程: ph,
               メモ: memoTrail(c) };
    });

    /* ---- 課ごと（保険は外す＝⑦） ---- */
    var div = {};
    DIVS.forEach(function (D) {
      var k = D[0];
      var a = rows.filter(function (r) { return r.課 === k && !r.保険; });
      var sum = a.reduce(function (x, r) { return x + r.金額; }, 0);
      var st = a.filter(function (r) { return r.預かり != null; });
      var stays = st.map(function (r) { return r.預かり; }).sort(function (p, q) { return p - q; });
      var dsum = st.reduce(function (x, r) { return x + Math.max(1, r.預かり); }, 0);
      var nb = st.filter(function (r) { return !r.大物; });
      var nbSum = nb.reduce(function (x, r) { return x + r.金額; }, 0), nbDays = nb.reduce(function (x, r) { return x + Math.max(1, r.預かり); }, 0);
      var bk = [['〜3日', 0, 3], ['4〜7日', 4, 7], ['8〜14日', 8, 14], ['15〜30日', 15, 30], ['31日〜', 31, 99999]].map(function (b) {
        var x = st.filter(function (r) { return r.預かり >= b[1] && r.預かり <= b[2] && !r.大物; });
        var sm = x.reduce(function (q, r) { return q + r.金額; }, 0), dd = x.reduce(function (q, r) { return q + Math.max(1, r.預かり); }, 0);
        return { 帯: b[0], 台数: x.length, 金額: sm, のべ日数: dd, 一日あたり: dd ? Math.round(sm / dd) : 0, 台単価: x.length ? Math.round(sm / x.length) : 0 };
      });
      var bigs = st.filter(function (r) { return r.大物; }).map(function (r) {
        return { id: r.id, 金額: r.金額, 預かり: r.預かり, 一日あたり: Math.round(r.金額 / Math.max(1, r.預かり)) };
      });
      /* 工程（外注は⑨で課題に数えないが、日数は見せる） */
      var phT = {}, phN = {};
      st.forEach(function (r) { Object.keys(r.工程).forEach(function (p) { phT[p] = (phT[p] || 0) + r.工程[p]; phN[p] = (phN[p] || 0) + 1; }); });
      var phases = ['contact', 'estim', 'parts', 'work', 'outsource', 'check', 'scrap', 'workDone'].filter(function (p) { return phT[p]; }).map(function (p) {
        return { 工程: phaseLabel(p), key: p, 日数: Math.round(phT[p]), 台数: phN[p], 一台あたり: Math.round(phT[p] / phN[p] * 10) / 10 };
      });
      var wd = st.filter(function (r) { return r.工程.workDone != null; });
      var fr = {}; a.forEach(function (r) { var f = r.フロント; fr[f] = fr[f] || { 名前: f, 台数: 0, 売上: 0 }; fr[f].台数++; fr[f].売上 += r.金額; });
      var me = {}; a.forEach(function (r) {
        var ms = r.メカ.length ? r.メカ : [r.担当の入れ忘れ.indexOf('整備担当') >= 0 ? '整備担当の入れ忘れ' : '整備担当なし（外注・物販など）'];
        ms.forEach(function (n) { me[n] = me[n] || { 名前: n, 台数: 0, 生産: 0 }; me[n].台数++; me[n].生産 += r.金額 / ms.length; });
      });
      var mk = {}; a.forEach(function (r) { var q = r.メーカー; mk[q] = mk[q] || { メーカー: q, 台数: 0, 金額: 0 }; mk[q].台数++; mk[q].金額 += r.金額; });
      var wt = {}; a.forEach(function (r) { var q = r.作業; wt[q] = wt[q] || { 作業: q, 台数: 0, 金額: 0 }; wt[q].台数++; wt[q].金額 += r.金額; });
      var late = a.filter(function (r) { return r.返車予定 && r.完了 && r.完了 > r.返車予定; })
                  .map(function (r) { return { id: r.id, 返車予定: r.返車予定, 完了: r.完了, 遅れ: days(r.返車予定, r.完了), 金額: r.金額 }; })
                  .sort(function (p, q) { return q.遅れ - p.遅れ; });
      var top = a.slice().sort(function (p, q) { return q.金額 - p.金額; }).slice(0, 6).map(function (r) {
        return { id: r.id, 作業: r.作業, 金額: r.金額, 預かり: r.預かり, 一日あたり: r.預かり != null ? Math.round(r.金額 / Math.max(1, r.預かり)) : null, 症状: r.メモ.症状 };
      });
      var slow = st.slice().sort(function (p, q) { return q.預かり - p.預かり; }).slice(0, 6).map(function (r) {
        return { id: r.id, 預かり: r.預かり, 工程: r.工程, 金額: r.金額, 一日あたり: Math.round(r.金額 / Math.max(1, r.預かり)),
                 入庫: r.入庫, 完了: r.完了, 返車予定: r.返車予定, メモ: r.メモ };
      });
      /* 改善した未来（モックの計算そのまま・車ごとに）
         作業完了→返車は1日まで／8〜14日の仕事は7日まで／31日以上（大物を除く）は30日で区切る */
      var fWd = 0, fMid = 0, fLong = 0;
      st.forEach(function (r) {
        var a1 = Math.max(0, (r.工程.workDone || 0) - 1);
        var s1 = r.預かり - a1;
        fWd += a1;
        if (r.預かり >= 8 && r.預かり <= 14 && s1 > 7){ fMid += s1 - 7; }
        else if (r.預かり >= 31 && !r.大物 && s1 > 30){ fLong += s1 - 30; }
      });
      var perDayNB = nbDays ? Math.round(nbSum / nbDays) : 0;
      var freed = Math.round(fWd + fMid + fLong);
      div[k] = {
        名前: divName(k) + '（' + D[1] + '）', 短い名前: divName(k), 色: divColor(k),
        実績: sum, 台数: a.length, 台単価: a.length ? Math.round(sum / a.length) : 0,
        前月の台単価: prevStats[k].台単価, 前月の預かり中央値: prevStats[k].預かり中央値,
        目標: dt[k], 前月: (P.rows.filter(function (r) { return r.tier === 'actual' && r.course === k && !insOf(r.c); })
                         .reduce(function (x, r) { return x + r.amt; }, 0)),
        大物を除く: { 実績: sum - bigs.reduce(function (x, b) { return x + b.金額; }, 0), 一日あたり: perDayNB },
        大物: bigs,
        預かり: { 中央値: stays.length ? stays[Math.floor(stays.length / 2)] : null,
                 平均: stays.length ? Math.round(stays.reduce(function (x, v) { return x + v; }, 0) / stays.length * 10) / 10 : null,
                 のべ: dsum, 一日あたり: dsum ? Math.round(sum / dsum) : 0, 平均在庫台数: Math.round(dsum / 30 * 10) / 10 },
        日数帯: bk, 工程: phases,
        作業完了から返車: { 台数: wd.length, のべ日数: Math.round(wd.reduce(function (x, r) { return x + r.工程.workDone; }, 0)),
                         三日以上: wd.filter(function (r) { return r.工程.workDone >= 3; }).length },
        フロント: Object.keys(fr).map(function (q) { return fr[q]; }).sort(function (p, q) { return q.売上 - p.売上; }),
        メカ: Object.keys(me).map(function (q) { me[q].生産 = Math.round(me[q].生産); return me[q]; }).sort(function (p, q) { return q.生産 - p.生産; }),
        メーカー: Object.keys(mk).map(function (q) { return mk[q]; }).sort(function (p, q) { return q.金額 - p.金額; }),
        作業: Object.keys(wt).map(function (q) { return wt[q]; }).sort(function (p, q) { return q.金額 - p.金額; }),
        予定遅れ: { 台数: late.length, 上位: late.slice(0, 5) },
        引っぱった車: top, 時間がかかった車: slow,
        未来: { 空く日数: freed, 内訳: { 作業完了から返車: Math.round(fWd), 中くらいの仕事: Math.round(fMid), 長期預かり: Math.round(fLong) },
                伸ばせる売上: Math.round(freed * perDayNB), 空く置き場: Math.round(freed / 30 * 10) / 10,
                見込み: sum - bigs.reduce(function (x, b) { return x + b.金額; }, 0) + Math.round(freed * perDayNB) },
        /* 🔴 v2.135.0 データチェック（T03・作業タイプ）と同じ物差し。「なし」を押した車は抜けに数えない */
        入力の抜け: { 作業タイプ: a.filter(function (r) { return r.作業 === '未入力'; }).length,
                    担当: a.filter(function (r) { return r.担当の入れ忘れ.length; }).map(function (r) { return { id: r.id, 入っていない役: r.担当の入れ忘れ }; }),
                    整備担当なしを選んだ: a.filter(function (r) { return !r.メカ.length && r.担当の入れ忘れ.indexOf('整備担当') < 0; }).length }
      };
    });

    /* ---- スライド（⑥）・月をまたいだ車 ---- */
    var slides = [], slid = [], insWait = [], insWd = [];
    (S().cards || []).forEach(function (c) {
      if (!c || noSale(c) || c.status === 'scrap' || c.status === 'cancelled') return;
      var sd = salesDate(c), cd = countDate(c), ins = insOf(c);
      if (sd && sd.slice(0, 7) === ym && !(cd && cd.slice(0, 7) === ym)){
        reg(c);
        var o = { id: c.id, 売上日: sd, 実績の日: cd, 状態: phaseLabel(c.status), 金額: amtOf(c), 課: courseOf(c) };
        if (ins) insWait.push(o); else slides.push(o);
        return;
      }
      if (!ins && s(c.returnDatePlan) >= moS && s(c.returnDatePlan) <= moE && !(cd && cd <= moE && c.status === 'returned' && cd >= moS)
          && !(c.completedAt && c.completedAt <= moE) && (!sd || sd.slice(0, 7) !== ym)){
        reg(c);
        var wdAt = (c.log || []).filter(function (l) { return l && l.type === 'phase' && l.to === 'workDone'; }).map(function (l) { return ymd(new Date(l.at)); }).pop() || '';
        slid.push({ id: c.id, 返車予定: c.returnDatePlan, 状態: phaseLabel(c.status), 作業完了: wdAt, 返車: s(c.completedAt), 金額: amtOf(c), 課: courseOf(c) });
      }
      if (ins && c.status === 'workDone'){ reg(c); insWd.push({ id: c.id, 金額: amtOf(c), 状態: phaseLabel(c.status) }); }
    });
    var insAct = rows.filter(function (r) { return r.保険; }).map(function (r) { return { id: r.id, 金額: r.金額 }; });

    /* ---- 人（⑪） ---- */
    var staff = (S().staff || []).filter(function (p) { return p && !p.isSelf && (p.front || p.mech); }).map(function (p) {
      return { 名前: t(p.name || p.realName), 課: divName(p.division) || '', フロント: !!p.front, メカ: !!p.mech, 入社: s(p.joinedAt) };
    });
    var joined = (S().staff || []).filter(function (p) { return p && s(p.joinedAt).slice(0, 7) === ym; })
                   .map(function (p) { return { 名前: t(p.name || p.realName), フロント: !!p.front, メカ: !!p.mech, 入社: p.joinedAt }; });
    var left = Object.keys(w.PIT_FORMER || {}).map(function (k) { return w.PIT_FORMER[k]; })
                 .filter(function (f) { return f && s(f.leftAt).slice(0, 7) === ym; }).map(function (f) { return { 名前: t(f.name), 退職: f.leftAt }; });

    /* ---- 休み ---- */
    var closed = [], openHol = [];
    for (var d = 1; d <= C.lastDay; d++){
      var ds = ym + '-' + pad(d);
      var isC = !!(w.PitCal && w.PitCal.isClosed && w.PitCal.isClosed(ds));
      var lb = (w.PitCal && w.PitCal.label) ? s(w.PitCal.label(ds)) : '';
      var hol = (w.Holidays && w.Holidays.name) ? s(w.Holidays.name(ds)) : '';
      var dow = '日月火水木金土'.charAt(new Date(y, m0, d).getDay());
      if (isC) closed.push({ 日: ds, 曜日: dow, 理由: lb || hol || '休み' });
      else if (hol || dow === '土' || dow === '日') openHol.push({ 日: ds, 曜日: dow, 祝日: hol });
    }

    /* ---- 全体 ---- */
    var bigAll = rows.filter(function (r) { return r.大物; });
    var allSt = rows.filter(function (r) { return !r.保険 && r.預かり != null; }).map(function (r) { return r.預かり; }).sort(function (p, q) { return p - q; });
    var allNi = rows.filter(function (r) { return !r.保険; });
    var allWd = rows.filter(function (r) { return !r.保険 && r.工程.workDone != null; });
    var insSum = insAct.reduce(function (x, r) { return x + r.金額; }, 0);
    var bigSum = bigAll.reduce(function (x, r) { return x + r.金額; }, 0);
    var zeroRuns = [], run = null;
    for (var k = 1; k <= C.lastDay; k++){
      var inc = C.cum[k] - C.cum[k - 1];
      if (inc === 0){ if (!run) run = { from: k, to: k }; else run.to = k; }
      else if (run){ if (run.to - run.from >= 2) zeroRuns.push(run); run = null; }
    }
    if (run && run.to - run.from >= 2) zeroRuns.push(run);
    var bestDays = []; for (var q = 1; q <= C.lastDay; q++) bestDays.push({ 日: q, 実績: C.cum[q] - C.cum[q - 1] });
    bestDays.sort(function (a, b) { return b.実績 - a.実績; });
    var half = Math.min(15, C.lastDay);

    var OUT = {
      版: 2, 月: ym, 期間: { from: moS, to: moE },
      目標: { 下限: tg.min, 上限: tg.max, 国産の割合: ratioD, 課: dt },
      全体: {
        実績: total, 台数: acts.length, 台単価: acts.length ? Math.round(total / acts.length) : 0,
        前月: P.tiers.actual.sum, 前月台数: P.tiers.actual.count,
        立ち上げ月: P.tiers.actual.count === 0,
        台単価_保険を除く: allNi.length ? Math.round(allNi.reduce(function (x, r) { return x + r.金額; }, 0) / allNi.length) : null,
        前月の台単価: prevStats.全体.台単価, 預かり中央値: allSt.length ? allSt[Math.floor(allSt.length / 2)] : null, 前月の預かり中央値: prevStats.全体.預かり中央値,
        作業完了から返車: { 台数: allWd.length, のべ日数: Math.round(allWd.reduce(function (x, r) { return x + r.工程.workDone; }, 0)) },
        営業日: biz ? biz.total : null, 前月営業日: bizP ? bizP.total : null,
        一日あたり: (biz && biz.total) ? Math.round(total / biz.total) : null,
        前月一日あたり: (bizP && bizP.total) ? Math.round(P.tiers.actual.sum / bizP.total) : null,
        うち保険: insSum, 大物: bigAll.map(function (r) { return { id: r.id, 金額: r.金額, 預かり: r.預かり, 割合: pct(r.金額, total) }; }),
        地力: total - bigSum - insSum,
        前半: C.cum[half], 実績0円が続いた日: zeroRuns.map(function (r) { return r.from + '〜' + r.to + '日'; }),
        よく積めた日: bestDays.slice(0, 3).map(function (b) { return { 日: b.日, 実績: b.実績 }; }),
        日ごとの累計: C.cum
      },
      課: div,
      スライド: slides, 予定から次の月にずれた車: slid,
      保険: { 実績に入った: insAct, 入金待ち: insWait, 作業完了のまま: insWd },
      人: { フロントとメカ: staff, 入った人: joined, 辞めた人: left },
      休み: { 休んだ日: closed, 営業した土日祝: openHol },
      未来: { 空く日数: div.div1.未来.空く日数 + div.div2.未来.空く日数,
              伸ばせる売上: div.div1.未来.伸ばせる売上 + div.div2.未来.伸ばせる売上,
              空く置き場: Math.round((div.div1.未来.空く日数 + div.div2.未来.空く日数) / 30 * 10) / 10,
              見込み: total - bigSum - insSum + div.div1.未来.伸ばせる売上 + div.div2.未来.伸ばせる売上 },
      車: cars
    };
    OUT.通知表 = grades(OUT);
    return OUT;
  }

  /* ================================================================
     📋 通知表（◎○△×）── ゆうた 2026-10-02「テキストはあまり読まない。最低△にしていきたい、と話がしやすい」
     🔴 判定はコードが決める（AI に決めさせない）。物差しはここ1本。
       売上＝目標（上限以上◎／下限以上○／下限の90%以上△／それ未満×）
       単価＝前月比（+5%以上◎／±5%○／-15%まで△／それ未満×）
       預かり＝日数の中央値の前月比（短いほど良い：10%以上短い◎／10%増まで○／30%増まで△／それ以上×）
       返車＝作業完了→返車の1台あたり日数（1日以内◎／1.5日○／2.5日△／それ以上×）
     ⚠ 前月が無い（PitFlow を使い始めた月など）は「—」。
     ================================================================ */
  var GRADE_RULE = { 売上: '目標の上限以上◎・下限以上○・下限の90%以上△', 単価: '前月比 +5%以上◎・±5%以内○・-15%まで△',
                     預かり: '日数の中央値が前月より10%以上短い◎・10%増まで○・30%増まで△', 返車: '作業完了→返車 1台あたり 1日以内◎・1.5日以内○・2.5日以内△' };
  function g4(v, a, b, c){ return v == null ? '—' : (v >= a ? '◎' : (v >= b ? '○' : (v >= c ? '△' : '×'))); }
  function gLow(v, a, b, c){ return v == null ? '—' : (v <= a ? '◎' : (v <= b ? '○' : (v <= c ? '△' : '×'))); }
  function gradeOne(sales, lo, hi, unit, unitP, med, medP, wdDays, wdN){
    var r = {};
    r.売上 = { 評価: (lo ? (sales >= hi ? '◎' : (sales >= lo ? '○' : (sales >= lo * 0.9 ? '△' : '×'))) : '—'), 値: lo ? '下限の' + pct(sales, lo) + '%' : '' };
    var ur = (unit && unitP) ? unit / unitP : null;
    r.単価 = { 評価: g4(ur, 1.05, 0.95, 0.85), 値: (ur == null ? '前月なし' : man(unit) + '（前月 ' + man(unitP) + '）') };
    var mr = (med != null && medP) ? med / medP : null;
    r.預かり = { 評価: gLow(mr, 0.9, 1.1, 1.3), 値: (mr == null ? '前月なし' : '中央値 ' + med + '日（前月 ' + medP + '日）') };
    var wd = wdN ? Math.round(wdDays / wdN * 10) / 10 : null;
    r.返車 = { 評価: gLow(wd, 1.0, 1.5, 2.5), 値: (wd == null ? '記録なし' : '完了→返車 ' + wd + '日') };
    return r;
  }
  function grades(F){
    var G = F.全体, o = {};
    o.全体 = gradeOne(G.実績, F.目標.下限, F.目標.上限, G.台単価_保険を除く, G.前月の台単価, G.預かり中央値, G.前月の預かり中央値,
                      G.作業完了から返車 ? G.作業完了から返車.のべ日数 : 0, G.作業完了から返車 ? G.作業完了から返車.台数 : 0);
    ['div1', 'div2'].forEach(function (k) {
      var D = F.課[k]; if (!D) return;
      o[k] = gradeOne(D.実績, D.目標 && D.目標.min, D.目標 && D.目標.max, D.台単価, D.前月の台単価, D.預かり && D.預かり.中央値, D.前月の預かり中央値,
                      D.作業完了から返車 ? D.作業完了から返車.のべ日数 : 0, D.作業完了から返車 ? D.作業完了から返車.台数 : 0);
    });
    return o;
  }
  function gradeHtml(r){
    if (!r) return '';
    return '<div class="air-card">' + ['売上', '単価', '預かり', '返車'].map(function (k) {
      var x = r[k] || { 評価: '—', 値: '' };
      var c = { '◎': 'g1', '○': 'g2', '△': 'g3', '×': 'g4' }[x.評価] || 'g0';
      return '<div class="air-g ' + c + '" title="' + esc(GRADE_RULE[k]) + '"><span>' + k + '</span><b>' + esc(x.評価) + '</b><i>' + esc(x.値) + '</i></div>';
    }).join('') + '</div>';
  }

  /* ================================================================
     🔒 月締め（①）── クォーターチェックの物差しをそのまま借りる
     ================================================================ */
  function closeState(ym){
    var out = { qs: [], closed: false };
    if (!w.pitQLoadList || !w.pitQMonthPlan || !w.pitQLoadRun || !w.pitQMatch || !w.pitQCollect || !w.pitQNokori || !w.pitQWriteCount){
      out.err = 'クォーターチェックの部品が読み込めていません'; return Promise.resolve(out);
    }
    var marks = w.pitQLoadMarks ? w.pitQLoadMarks().catch(function () { return []; }) : Promise.resolve([]);
    return Promise.all([w.pitQLoadList(), marks]).then(function (r) {
      var plans = w.pitQMonthPlan(ym, r[0] || []);
      return Promise.all(plans.map(function (x) {
        return w.pitQLoadRun(w.pitQRunId(x.from, x.to)).then(function (doc) { return { x: x, doc: doc }; })
                .catch(function () { return { x: x, doc: null }; });
      }));
    }).then(function (got) {
      var groups = [];
      got.forEach(function (g) {
        var x = g.x, doc = g.doc, den = (doc && Array.isArray(doc.伝票)) ? doc.伝票 : [];
        var part = doc && doc.全部 === false && w.pitQReadRange ? w.pitQReadRange(doc) : null;
        var from = part ? part.from : x.from, to = part ? part.to : x.to;
        var res = den.length ? w.pitQMatch(den, w.pitQCollect({ from: from, to: to }).明細, { from: from, to: to }) : null;
        groups.push({ no: x.no, label: x.label, from: from, to: to, 全部: !!(doc && den.length && !part), soft: den, res: res, qf: x.from, qt: x.to });
      });
      var live = groups.filter(function (g) { return g.res; });
      if (w.pitQCrossLink && live.length > 1) w.pitQCrossLink(live);
      groups.forEach(function (g) {
        var q = { no: g.no, label: 'Q' + g.no, from: g.qf, to: g.qt, 読んだ: !!g.res, 全部: g.全部 };
        if (g.res){
          q.残り = w.pitQNokori(g.res);
          var wc = w.pitQWriteCount(g.res);
          q.書けた = wc.書けた; q.対象 = wc.対象; q.未 = wc.未.length; q.変わった = (wc.変わった || []).length;
        }
        q.done = !!(g.res && g.全部 && q.残り === 0 && q.未 === 0 && q.変わった === 0);
        out.qs.push(q);
      });
      out.closed = out.qs.length === 4 && out.qs.every(function (q) { return q.done; });
      return out;
    });
  }

  /* ================================================================
     🗄 保存（③）
     ================================================================ */
  function loadSaved(ym){
    var c = co();
    if (!w.PIT_CLOUD || !c) return Promise.resolve(null);
    return c.collection('pitSettings').doc(docId(ym)).get().then(function (sn) { return sn.exists ? sn.data() : null; });
  }
  /* ⚡ v2.133.1 書き出したレポートは変わらない＝このパソコンに控えを置いて、開いた瞬間に出す。
     ⚠ 控えは「速く出すため」だけ。本物は pitSettings の書類。開いたら裏で読み直し、書き出し直されていたら差し替える。
     ⚠ 使えない時（プライベートウィンドウ等）は黙って本物だけを読む。 */
  function ckey(ym){ var c = co(); return 'pitAiRep:' + ((c && c.id) || '') + ':' + ym; }
  function cacheGet(ym){ try { var v = w.localStorage.getItem(ckey(ym)); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function cachePut(ym, body){ try { if (body) w.localStorage.setItem(ckey(ym), JSON.stringify(body)); else w.localStorage.removeItem(ckey(ym)); } catch (e) {} }
  function save(ym, body){
    var c = co();
    if (!w.PIT_CLOUD || !c) return Promise.reject(new Error('練習用サイトでは残せません'));
    return c.collection('pitSettings').doc(docId(ym)).set(body);
  }

  /* ================================================================
     🤖 AI に渡す決めごと
     ================================================================ */
  var SYSTEM = [
    'あなたは小林モータース（千葉の整備工場。1課＝国産、2課＝輸入）の月次レポートを書く経営アドバイザーです。',
    '社長・チーフ（ゆうた）が半年後に読み返しても「その月に何が起きていたか」へ戻れる、しっかりした文章を書きます。',
    '',
    '【絶対の決まり】',
    '・数字は渡された資料（JSON）にあるものだけを使う。自分で計算した新しい数字・推測の数字は書かない。割合や差も資料にあるか、資料の2つの数字から明らかに言えるものだけ。',
    '・屈託なく、忖度なく書く。良かった点も悪かった点もはっきり言う。ただし人を責める書き方ではなく、仕組みと段取りの話にする。',
    '・「日数がかかった。気を付けよう」で終わらせない。必ず一段深く掘る：1日あたりいくら稼げているか／平均と比べてどうか／どの工程で止まったか／どの工程を詰められたか／詰めたらどのくらいの日数・枠が空くか。原因と解決まで書く。',
    '・1課と2課は性格が違う（1課＝台数で回す、2課＝単価で稼ぐ）。預かり日数や台単価を混ぜて語らない。総評だけ全体でまとめる。',
    '・保険の車は入金日で実績になるので、作業した月と実績の月がずれる。頑張りの評価には入れず「ボーナス」として扱う。',
    '・外注に出している日数は、自社の場所も手も使わないので課題に数えない。',
    '・「大物」（1台で月の10%以上）は月の数字を大きく動かす。大物を除いた「地力」でも必ず語る。',
    '・メーカーは BMW のMINI と MINI をまとめて「MINI」として扱っている（資料もそうなっている）。',
    '・止まった理由が引継ぎメモ（メモ.いま／メモ.書き換え）に書いてある車は「理由のある止まり」（例：ドイツからのBO）として分けて書く。書いていない車は「理由の無い止まり」。理由のある止まりを責めない。',
    '・工程ごとの日数は、PitFlow でカードの状態を動かした記録から数えている。PitFlow を使い始める前の期間は記録に無いので、長く預かった車ほど工程の合計が預かり日数より短い。そこを断定に使わない。',
    '・フロント＝売上をつくる人、メカ＝生産する人。受付と作業が同じ人に集まっていないかを見る。',
    '・会社の方針：社長・専務は年齢もあり、現場（メカ）とフロントから手を放していく。2課のチーフと蓮沼さんも、もっとクリエイティブな仕事に注力するため現場から手を放していく。この4人の割合が下がるのは前進で、その分ほかの人に仕事が偏るのは許容されている。**この4人に仕事を戻す提案はしない。** 偏りは残りのフロント・メカの中で見る。',
    '・このレポートは、チーフ（ゆうた）が自分で数字を見たら言うことの代わり。上の方針に立って書く。',
    '・予約は基本いっぱいで、フロントは予約の獲得にほとんど関わっていない。**予約を取る話は避ける**（次の予約につなげる・予約を増やす・お客さんを呼び込む、などを課題や打ち手にしない）。**早く回して台数を増やす話はよい**（返す速さ・作業の順番・判断待ちを詰めて、同じ予約の枠でより多くの車をこなす）。1台の中身（提案・見積り）を上げる話もよい。',
    '・資料の「通知表」（売上・単価・預かり・返車を ◎○△× で付けたもの。判定は PitFlow が決めた）を必ず踏まえる。△と×の項目は、課題の中で「どうすれば最低△、できれば○にできるか」を具体的に書く。評価を自分で付け直さない。',
    '・月締めの後に書くレポートなので、その月の作業は全部終わっている前提でよい。',
    '・資料の「全体.立ち上げ月」が true の月は PitFlow を使い始めた月。入庫日やカードの登録日がばらばらなので、預かり日数（0日など）を断定の材料にしない。',
    '・入力の抜けは資料の「入力の抜け」だけを使う（データチェックと同じ物差し）。整備担当に「なし」を選んだ車（外注・物販など）は抜けではない。',
    '',
    '【車の書き方】',
    '・車を指すときは必ず {{car:ID}} と書く（ID は資料の「車」の id）。画面で「苗字 車種｜課｜フロント」の1行と、カードを開くリンクに変わる。苗字や車種を自分で書き足さない。',
    '',
    '【文の書き方】',
    '・日本語。です・ます調ではなく、だ・である調で短く言い切る（レポートの地の文）。',
    '・大事な所は **太字** にする（1段落に1〜2か所まで）。',
    '・1段落は2〜4文。箇条書きの記号は使わない（配列の要素が1段落になる）。',
    '・金額は「万」で書く（例：1,569万、30.8万、7,648円のように1万円未満だけ円）。資料の円の値を四捨五入して万にするのはよい。「15,691,553円」のような円の細かい桁は書かない。',
    '・人の名前は苗字に「さん」を付ける（例：椎名さん）。社長・専務・チーフは役職のまま。',
    '・「改善した未来」は、資料の「未来」の数字を使って、良い未来を具体的に描く（空く日数・いつも空く置き場・伸ばせる売上・人の動き）。伸ばせる売上は「予約は基本いっぱいなので、空いた枠はそのまま次の車に回せる」前提で書く（予約を取りに行く話にしない）。',
    '',
    '【答えの形】次の JSON だけを返す（前後に説明を書かない）。',
    '{',
    '  "総評": ["段落", ...],            // 3〜5段落。1課2課まとめて。地力・大物・営業日・前月比・月の流れ',
    '  "保険": "段落",                   // ボーナス枠の一言（無ければ空文字）',
    '  "div1": { "日数帯": ["段落"], "工程": ["段落"], "引っぱった車": ["段落"], "時間がかかった車": ["段落"], "スライド": ["段落"], "人": ["段落"], "課題": ["1つの課題＝1段落", ...] },',
    '  "div2": { 同じ形 },',
    '  "全体の課題": ["1つの課題＝1段落", ...],   // 3〜5個',
    '  "未来": { "div1": ["段落", ...], "div2": ["段落", ...], "全体": ["段落", ...] },',
    '  "MTG": {',
    '    "div1": { "ひとこと": "1行", "数字": ["短い数字の札", ...], "良かった": ["要点", ...], "足りない": ["要点", ...], "来月やること": ["要点", ...], "聞かれたら": [{ "問": "…", "答": "…" }] },',
    '    "div2": { "ひとこと": "1行", "数字": [...], "ほめる": [...], "次の一歩": [...], "来月やること": [...] },',
    '    "全体": { "ひとこと": "1行", "数字": [...], "良かった": [...], "これから": [...], "伝えたいこと": [...] }',
    '  }',
    '}',
    '',
    '【MTG（社長・専務・チーフだけが見る、MTGで話す要点）】',
    '・社長・専務は従業員を雇ってこなかったこともあり、MTGで話す・数字を見るのに慣れていない。社長は1課長でもある。社長がMTGでそのまま使える**要点**を書く（台本ではない）。',
    '・div1＝社長が1課長として話す（1課をどう直すか）。div2＝2課をほめる場で使う（名前と数字を出してほめる）。全体＝MTGの最初か最後に。',
    '・ひとことで言うと、を1行（20〜35字）。ツボを押さえた言い方にする（例：「早く返す力はある。あとは長い車を早く片づけて回す」）。',
    '・数字は2〜3個。覚えやすく言い換えた短い札にする（例：「あと106万＝1台あたり +1.4万」「返車1日 ◎」）。資料の数字だけを使う。',
    '・各項目は1〜3個の要点。1つ35字くらいまで。です・ますは付けない体言止めでよい。人は「◯◯さん」。',
    '・来月やることは、やることがはっきり見える言い方で2つまで（例：「長くなりそうな車は毎週、片づける日を決める」）。',
    '・聞かれたらは1つだけ。社長が答えに詰まりそうな問いと、その短い答え。',
    '・本文と同じ方針を守る（4人に仕事を戻さない・予約を取る話はしない・早く回して台数を増やす話と1台の中身の話はよい・保険はボーナス）。車の {{car:ID}} はここでは使わない。'
  ].join('\n');

  function slimForAi(F){
    /* 日ごとの累計は長いだけなので、AI には要点だけ（画面のグラフは F のまま描く） */
    var o = JSON.parse(JSON.stringify(F));
    delete o.全体.日ごとの累計;
    return o;
  }
  function parse(txt){
    var a = s(txt).indexOf('{'), b = s(txt).lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(s(txt).slice(a, b + 1)); } catch (e) { return null; }
  }

  /* ================================================================
     ✍ 書き出す（管理者）
     ================================================================ */
  /* ================================================================
     ⏳ v2.134.0（ゆうた「月を開いただけで Q のチェックを始めないで。10月はライブだから AI は絶対ない。
        10月の読み込みを待たないと月も戻れない。書き出すを押してから Q のチェック、NG ならはじく、
        OK なら AI が書き出しています、みたいなインストール状況の進行表示に」）
     ◎ 押す → 確かめの窓 → ①締めを確かめる → ②数字をまとめる → ③AI が書く（経過時間と目安のバー）→ ④保存
     ◎ ①で締まっていなければ、そこで止める（どのQが何件残っているかを出す）。
     ⚠ 進み具合は U.run に持つ（別の画面へ行って戻っても続きが見える）。
     ================================================================ */
  var STEPS = ['締めを確かめる', '数字をまとめる', 'AI が書く', '保存する'];
  var AI_SEC = 210;     /* 目安（9月の試し書きで 211秒） */
  var timer = 0;
  function nowYm(){ var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function isPast(ym){ return ym < nowYm(); }
  function step(U, i, st, note){ if (U.run && U.run.steps[i]){ U.run.steps[i].state = st; if (note != null) U.run.steps[i].note = note; } }
  function tick(){
    var U = null; Object.keys(MEM).forEach(function (k) { if (MEM[k].run && MEM[k].run.t0 && MEM[k].busy) U = MEM[k]; });
    if (!U){ clearInterval(timer); timer = 0; return; }
    var sec = Math.round((Date.now() - U.run.t0) / 1000);
    var el = document.getElementById('air-run-t'), bar = document.getElementById('air-run-bar');
    if (el) el.textContent = Math.floor(sec / 60) + ':' + pad(sec % 60) + ' 経過（目安 3〜4分）';
    if (bar) bar.style.width = Math.min(96, Math.round(sec / AI_SEC * 100)) + '%';
  }
  function ngNote(c){
    if (!c || c.err) return s(c && c.err);
    return (c.qs || []).filter(function (q) { return !q.done; }).map(function (q) {
      return q.label + (!q.読んだ ? '（PDF未）' : (!q.全部 ? '（一部だけ）' : '（残り' + q.残り + '・書き込み ' + q.書けた + '/' + q.対象 + (q.変わった ? '・変わった ' + q.変わった : '') + '）'));
    }).join('　');
  }

  w.pitAiRepGo = function (){
    var ym0 = w._svYM; if (!ym0) return;
    var ym = ym0.y + '-' + pad(ym0.m + 1), U = M(ym);
    if (U.busy) return;
    if (!w.PIT_CLOUD){ U.err = '練習用サイトでは書き出せません（本番の PitFlow で使ってください）'; rerender(); return; }
    if (!isAdmin()){ if (w.UI && w.UI.alert) w.UI.alert('レポートを書き出せるのは、設定権限（管理）のある人だけです。', { title: '書き出せません', code: 'PF-0023' }); return; }
    if (!isPast(ym)){ U.err = 'この月はまだ終わっていません。月が終わって締めたあとに書き出せます。'; rerender(); return; }
    if (!w.firebase || !w.firebase.app || !w.firebase.app().functions){ U.err = 'AIに聞く窓口が読み込めていません。画面を開き直してください。'; rerender(); return; }
    var again = !!(U.saved && U.saved.数字);
    var ask = w.pitAsk ? w.pitAsk(again ? (ym0.m + 1) + '月のレポートを書き出し直しますか？' : (ym0.m + 1) + '月のレポートを書き出しますか？',
      { detail: (again ? ['・いま残っているレポートは、新しく書き出したものに置きかわります'] : [])
                .concat(['・先に Q1〜Q4 が締まっているかを確かめ、締まっていなければ書き出しません',
                         '・AI が文章を書くので、3〜4分ほどかかります（1回ごとに料金がかかります）']).join('\n'),
        ok: again ? '書き出し直す' : '書き出す' }) : Promise.resolve(true);
    ask.then(function (yes) {
      if (!yes) return;
      U.err = ''; U.busy = true; U.check = null;
      U.run = { steps: STEPS.map(function (l) { return { label: l, state: 'wait', note: '' }; }), t0: 0, again: again };
      step(U, 0, 'run'); rerender();
      var cur = 0, F = null, c0 = null;
      closeState(ym).then(function (c) {
        c0 = c;
        if (!c.closed){ U.check = c; throw { 止める: true, note: ngNote(c) }; }
        step(U, 0, 'ok', 'Q1〜Q4 すべて残り0・書き込み済み');
        cur = 1; step(U, 1, 'run'); rerender();
        F = facts(ym0.y, ym0.m);
        step(U, 1, 'ok', F.全体.台数 + '台・' + man(F.全体.実績));
        cur = 2; step(U, 2, 'run'); U.run.t0 = Date.now(); rerender();
        if (!timer) timer = setInterval(tick, 1000);
        var fn = w.firebase.app().functions('asia-northeast1').httpsCallable('pfAsk', { timeout: 540000 });
        return fn({ model: MODEL, system: SYSTEM, max_tokens: MAX_TOKENS, effort: EFFORT,
                    user: (ym0.y + '年' + (ym0.m + 1) + '月') + 'の資料です。決められた JSON の形だけで答えてください。\n\n```json\n'
                        + JSON.stringify(slimForAi(F)) + '\n```' });
      }).then(function (r) {
        var d = (r && r.data) || {};
        if (d.stop === 'max_tokens') throw new Error('AIの文が長すぎて途中で切れました。もう一度書き出してください。');
        var got = parse(d.text);
        if (!got) throw new Error('AIの返事を読み取れませんでした。もう一度書き出してください。');
        step(U, 2, 'ok', Math.round((Date.now() - U.run.t0) / 1000) + '秒');
        cur = 3; step(U, 3, 'run'); rerender();
        var me = (w.pitFlowMe && w.pitFlowMe()) || '';
        var body = { 月: ym, 書き出した日時: new Date().toISOString(), 書き出した人: me,
                     AI: { model: s(d.model || MODEL), usage: d.usage || null }, 数字: F, 文: got, 締め: c0 };
        return save(ym, body).then(function () { cachePut(ym, body); return body; });
      }).then(function (body) {
        step(U, 3, 'ok');
        U.busy = false; U.saved = body; U.close = markClosed(body.締め); U.loaded = true; U.run = null;
        if (w.pitLog) w.pitLog('AIレポートを書き出した', { kind: 'sales', label: ym + (again ? '（書き出し直し）' : '') });
        if (w.pitToast) w.pitToast((ym0.m + 1) + '月のレポートを書き出しました');
        rerender();
      }).catch(function (e) {
        U.busy = false;
        if (e && e.止める){ step(U, 0, 'ng', e.note); U.err = (ym0.m + 1) + '月はまだ締まっていないので、書き出しませんでした。'; }
        else { step(U, cur, 'ng', s(e && e.message ? e.message : e)); U.err = '書き出せませんでした：' + s(e && e.message ? e.message : e); }
        rerender();
      });
    });
  };

  function runHtml(U){
    var R = U.run; if (!R) return '';
    var ic = { ok: '✓', ng: '✕', wait: '・' };
    var h = '<div class="air-run' + (U.busy ? '' : ' end') + '"><div class="air-run-h">' + (U.busy ? 'レポートを書き出しています' : '書き出しを止めました') + '</div><ol>';
    R.steps.forEach(function (x, i) {
      h += '<li class="' + x.state + '"><span class="ic">' + (x.state === 'run' ? '<span class="air-sp"></span>' : (ic[x.state] || '')) + '</span>'
         + '<b>' + esc(x.label) + '</b>' + (x.note ? '<i>' + esc(x.note) + '</i>' : '');
      if (i === 2 && x.state === 'run'){
        var sec = R.t0 ? Math.round((Date.now() - R.t0) / 1000) : 0;
        h += '<div class="air-bar"><i id="air-run-bar" style="width:' + Math.min(96, Math.round(sec / AI_SEC * 100)) + '%"></i></div>'
           + '<span class="air-run-t" id="air-run-t">' + Math.floor(sec / 60) + ':' + pad(sec % 60) + ' 経過（目安 3〜4分）</span>';
      }
      h += '</li>';
    });
    return h + '</ol></div>';
  }

  function rerender(){ if (w._svTab === 'ai' && w.renderSales) w.renderSales(); }

  /* ================================================================
     🖼 描く
     ================================================================ */
  /* 工程の色は css（sales-ai.css の .air-pc-◯◯）で持つ＝js に色を書かない */

  function carChip(F, id){
    var c = F.車 && F.車[id];
    if (!c) return '<span class="air-car x">（車が見つかりません）</span>';
    /* 🧾 v2.135.0（ゆうた「やっぱりガタガタして読みにくい。全部フォントを小さくして1行に溶け込ませたい。
       BOX をやめて緑とピンクのアンダーラインでもいい」）
       ＝ 枠をやめ、文の中に溶け込む1行（苗字 車種・課・フロント）。下線は課の色（設定の表の色）。どこを押してもカードが開く */
    return '<span class="air-car" role="button" tabindex="0"' + (c.課の色 ? ' style="--dc:' + esc(c.課の色) + '"' : '')
         + ' onclick="pitAiRepOpen(\'' + esc(id) + '\')"><span class="nm">' + esc(c.苗字 + ' ' + c.車種) + '</span>'
         + '<span class="mt">' + esc([c.課, c.フロント].filter(Boolean).join('・')) + '</span></span>';
  }
  function dvChip(label, color){ return '<span class="air-dv"' + (color ? ' style="--dc:' + esc(color) + '"' : '') + '>' + esc(label) + '</span>'; }
  /* AI の文 → HTML。{{car:ID}} を車の1行に、**…** を太字に */
  function txt(F, v){
    return esc(v).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
                 .replace(/\{\{car:([A-Za-z0-9_\-]+)\}\}/g, function (_, id) { return carChip(F, id); });
  }
  function paras(F, a){
    a = Array.isArray(a) ? a : (a ? [a] : []);
    return a.map(function (p) { return '<p class="air-ai">' + txt(F, p) + '</p>'; }).join('');
  }
  function kpi(label, val, sub, cls){
    return '<div class="air-kpi"><span>' + esc(label) + '</span><b' + (cls ? ' class="' + cls + '"' : '') + '>' + val + '</b>'
         + (sub ? '<i>' + sub + '</i>' : '') + '</div>';
  }
  function diffTxt(a, b){ var d = a - b; return (d >= 0 ? '+' : '−') + man(Math.abs(d)); }

  function cumSvg(F){
    var cum = F.全体.日ごとの累計 || [], n = cum.length - 1; if (n < 1) return '';
    var W = 1100, H = 230, L = 60, R = 20, T = 16, B = 30;
    var maxY = Math.max(F.目標.上限 * 1.05, cum[n] * 1.05);
    function x(d){ return L + (W - L - R) * (d / n); } function y(v){ return T + (H - T - B) * (1 - v / maxY); }
    var closed = {}; (F.休み.休んだ日 || []).forEach(function (d) { closed[+s(d.日).slice(8)] = 1; });
    var h = '';
    for (var d = 1; d <= n; d++) if (closed[d]) h += '<rect x="' + x(d - 1) + '" y="' + T + '" width="' + (x(d) - x(d - 1)) + '" height="' + (H - T - B) + '" class="air-c-closed"/>';
    var step = maxY > 15e6 ? 5e6 : 2e6;
    for (var v = 0; v <= maxY; v += step) h += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="air-c-grid"/><text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" class="air-c-ax" text-anchor="end">' + (v / 1e4) + '万</text>';
    h += '<line x1="' + x(0) + '" y1="' + y(0) + '" x2="' + x(n) + '" y2="' + y(F.目標.下限) + '" class="air-c-lo"/>';
    h += '<line x1="' + x(0) + '" y1="' + y(0) + '" x2="' + x(n) + '" y2="' + y(F.目標.上限) + '" class="air-c-hi"/>';
    h += '<text x="' + (x(n) - 4) + '" y="' + (y(F.目標.下限) + 14) + '" class="air-c-lot" text-anchor="end">下限ペース</text>';
    h += '<text x="' + (x(n) - 4) + '" y="' + (y(F.目標.上限) - 6) + '" class="air-c-hit" text-anchor="end">上限ペース</text>';
    var p = ''; for (var i = 0; i <= n; i++) p += (i ? 'L' : 'M') + x(i) + ' ' + y(cum[i]);
    h += '<path d="' + p + '" class="air-c-line"/>';
    for (var k = 1; k <= n; k += 3) h += '<text x="' + x(k) + '" y="' + (H - 10) + '" class="air-c-ax" text-anchor="middle">' + k + '</text>';
    h += '<text x="' + x(n) + '" y="' + (y(cum[n]) - 10) + '" class="air-c-end" text-anchor="end">' + man(cum[n]) + '</text>';
    return '<div class="air-chart"><svg viewBox="0 0 ' + W + ' ' + H + '" width="100%">' + h + '</svg></div>';
  }

  function divHtml(F, A, k){
    var D = F.課[k], T = (A && A[k]) || {};
    var h = '<h2 class="air-part dv"' + (D.色 ? ' style="--dc:' + esc(D.色) + '"' : '') + ' id="air-' + k + '">' + esc(D.名前) + '</h2>';
    var lo = D.目標 ? D.目標.min : 0;
    h += '<div class="air-kpis">'
       + kpi('実績（保険を除く）', man(D.実績), '下限 ' + man(lo) + ' に対して ' + pct(D.実績, lo) + '%／前月比 ' + diffTxt(D.実績, D.前月), D.実績 >= lo ? 'up' : 'dn')
       + kpi('台数・台単価', D.台数 + '台・' + man(D.台単価), D.大物.length ? '大物を除くと ' + man(D.大物を除く.実績) : '')
       + kpi('預かり日数', '中央値 ' + (D.預かり.中央値 == null ? '—' : D.預かり.中央値 + '日'), '平均 ' + (D.預かり.平均 == null ? '—' : D.預かり.平均 + '日') + '／のべ ' + D.預かり.のべ + '日')
       + kpi('預かり1日あたりの稼ぎ', yen(D.預かり.一日あたり), D.大物.length ? '大物を除くと ' + yen(D.大物を除く.一日あたり) : '')
       + '</div>' + gradeHtml((F.通知表 || grades(F))[k]);

    h += '<section><h3>預かり日数ごとの稼ぎ方' + (D.大物.length ? '<small>（大物は別の行）</small>' : '') + '</h3><table class="air-t"><tr><th>預かり</th><th class="n">台数</th><th class="n">金額</th><th class="n">のべ日数</th><th class="n">1日あたり</th><th class="n">台単価</th></tr>';
    var best = Math.max.apply(null, D.日数帯.map(function (b) { return b.台数 ? b.一日あたり : 0; }));
    var worst = Math.min.apply(null, D.日数帯.filter(function (b) { return b.台数; }).map(function (b) { return b.一日あたり; }).concat([Infinity]));
    D.日数帯.forEach(function (b) {
      if (!b.台数) return;
      var cls = b.一日あたり === best ? ' class="up"' : (b.一日あたり === worst ? ' class="dn"' : '');
      h += '<tr><td>' + esc(b.帯) + '</td><td class="n">' + b.台数 + '台</td><td class="n">' + man(b.金額) + '</td><td class="n">' + b.のべ日数 + '日</td><td class="n"><b' + cls + '>' + yen(b.一日あたり) + '</b></td><td class="n">' + man(b.台単価) + '</td></tr>';
    });
    D.大物.forEach(function (b) {
      h += '<tr class="air-muted"><td>大物 ' + carChip(F, b.id) + '</td><td class="n">1台</td><td class="n">' + man(b.金額) + '</td><td class="n">' + b.預かり + '日</td><td class="n">' + yen(b.一日あたり) + '</td><td class="n">' + man(b.金額) + '</td></tr>';
    });
    h += '</table>' + paras(F, T.日数帯) + '</section>';

    var phSum = D.工程.reduce(function (x, p) { return x + p.日数; }, 0);
    h += '<section><h3>どの工程で日数を使ったか<small>（PitFlow で状態を動かした記録がある分だけ）</small></h3>';
    if (phSum){
      h += '<div class="air-ph">' + D.工程.map(function (p) { return '<i class="air-pc-' + esc(p.key) + '" style="width:' + (p.日数 / phSum * 100) + '%" title="' + esc(p.工程) + '"></i>'; }).join('') + '</div>'
         + '<div class="air-legend">' + D.工程.map(function (p) { return '<span class="air-pc-' + esc(p.key) + '">' + esc(p.工程) + ' ' + p.日数 + '日（' + p.台数 + '台・' + p.一台あたり + '日）</span>'; }).join('') + '</div>';
    }
    h += paras(F, T.工程) + '</section>';

    h += '<section><h3>引っぱった車</h3><table class="air-t"><tr><th>車</th><th>作業</th><th class="n">金額</th><th class="n">預かり</th><th class="n">1日あたり</th></tr>';
    D.引っぱった車.forEach(function (r) {
      h += '<tr><td>' + carChip(F, r.id) + '</td><td>' + esc(r.作業) + '</td><td class="n">' + man(r.金額) + '</td><td class="n">' + (r.預かり == null ? '—' : r.預かり + '日') + '</td><td class="n">' + (r.一日あたり == null ? '—' : yen(r.一日あたり)) + '</td></tr>';
    });
    h += '</table>';
    h += '<div class="air-mini">' + D.メーカー.slice(0, 6).map(function (x) { return esc(x.メーカー) + ' ' + x.台数 + '台・' + man(x.金額); }).join('　／　') + '</div>';
    h += '<div class="air-mini">' + D.作業.map(function (x) { return esc(x.作業) + ' ' + x.台数 + '台・' + man(x.金額); }).join('　／　') + '</div>';
    h += paras(F, T.引っぱった車) + '</section>';

    h += '<section><h3>時間がかかった車</h3><table class="air-t"><tr><th>車</th><th class="n">預かり</th><th>どこで止まったか（記録）</th><th>引継ぎメモ</th><th class="n">金額</th><th class="n">1日あたり</th></tr>';
    D.時間がかかった車.forEach(function (r) {
      var ph = Object.keys(r.工程).sort(function (a, b) { return r.工程[b] - r.工程[a]; }).slice(0, 3)
                 .map(function (p) { return esc(phaseLabel(p)) + ' ' + r.工程[p] + '日'; }).join('・') || '（記録なし）';
      var late = (r.返車予定 && r.完了 > r.返車予定) ? '<br><span class="air-tag r">返車予定 ' + md(r.返車予定) + ' → 完了 ' + md(r.完了) + '</span>' : '';
      h += '<tr><td>' + carChip(F, r.id) + '</td><td class="n"><span class="air-tag ' + (r.預かり >= 31 ? 'r' : 'o') + '">' + r.預かり + '日</span></td><td>' + ph + late + '</td><td class="air-memo">' + esc(r.メモ.いま || '—') + '</td><td class="n">' + man(r.金額) + '</td><td class="n">' + yen(r.一日あたり) + '</td></tr>';
    });
    h += '</table><div class="air-mini">返車予定より遅れて完了 ' + D.予定遅れ.台数 + '台／作業完了→返車 ' + D.作業完了から返車.台数 + '台・のべ ' + D.作業完了から返車.のべ日数 + '日（3日以上 ' + D.作業完了から返車.三日以上 + '台）</div>';
    h += paras(F, T.時間がかかった車) + '</section>';

    var sl = F.スライド.filter(function (x) { return x.課 === k; });
    var sd = F.予定から次の月にずれた車.filter(function (x) { return x.課 === k; });
    h += '<section><h3>スライド・月をまたいだ車</h3>';
    h += '<table class="air-t"><tr><th>この月に売上日 → この月の実績にならなかった車（スライド）</th><th>いま</th><th class="n">金額</th></tr>'
       + (sl.length ? sl.map(function (x) { return '<tr><td>' + carChip(F, x.id) + '</td><td>' + esc(x.状態) + (x.実績の日 ? '（実績 ' + md(x.実績の日) + '）' : '') + '</td><td class="n">' + man(x.金額) + '</td></tr>'; }).join('')
                    : '<tr><td colspan="3" class="air-muted">0台</td></tr>') + '</table>';
    if (sd.length){
      h += '<table class="air-t"><tr><th>返車予定がこの月 → 次の月にずれた車（売上日はまだ）</th><th>いま</th><th class="n">金額</th></tr>'
         + sd.map(function (x) { return '<tr><td>' + carChip(F, x.id) + '</td><td>' + esc(x.状態) + (x.作業完了 ? '（' + md(x.作業完了) + ' 作業完了）' : '') + (x.返車 ? '（' + md(x.返車) + ' 返車）' : '') + '</td><td class="n">' + man(x.金額) + '</td></tr>'; }).join('') + '</table>';
    }
    h += paras(F, T.スライド) + '</section>';

    h += '<section><h3>人（フロント＝売上／メカ＝生産）</h3><div class="air-two"><table class="air-t"><tr><th>フロント</th><th class="n">台数</th><th class="n">売上</th><th class="n">比率</th></tr>'
       + D.フロント.map(function (f) { return '<tr><td>' + esc(f.名前) + '</td><td class="n">' + f.台数 + '台</td><td class="n">' + man(f.売上) + '</td><td class="n">' + pct(f.売上, D.実績) + '%</td></tr>'; }).join('')
       + '</table><table class="air-t"><tr><th>メカ（複数担当は均等割り）</th><th class="n">台数</th><th class="n">生産</th><th class="n">比率</th></tr>'
       + D.メカ.map(function (f) { return '<tr><td>' + esc(f.名前) + '</td><td class="n">' + f.台数 + '台</td><td class="n">' + man(f.生産) + '</td><td class="n">' + pct(f.生産, D.実績) + '%</td></tr>'; }).join('')
       + '</table></div>' + paras(F, T.人) + '</section>';

    h += '<div class="air-issue"><h3>' + esc(D.短い名前 || '') + 'の課題</h3><ol>'
       + (T.課題 || []).map(function (p) { return '<li>' + txt(F, p) + '</li>'; }).join('') + '</ol></div>';
    return h;
  }

  function reportHtml(R){
    var F = R.数字, A = R.文 || {}, G = F.全体;
    var h = '<div class="air-rep">';
    h += '<div class="air-rh"><h2>' + esc(F.月.replace('-', '年').replace(/^(\d+年)0?/, '$1')) + '月 月次レポート</h2>'
       + '<div class="meta">書き出し ' + esc(s(R.書き出した日時).slice(0, 16).replace('T', ' ')) + (R.書き出した人 ? '・' + esc(R.書き出した人) : '')
       + '<br>この時点のデータと目標で固定（あとでカードや目標を変えても、この中は変わりません）</div></div>';
    h += '<div class="air-toc"><a onclick="pitAiRepJump(\'all\')">全体</a>' + DIVS.map(function (D) { return '<a onclick="pitAiRepJump(\'' + D[0] + '\')">' + esc(F.課[D[0]].名前) + '</a>'; }).join('') + '<a onclick="pitAiRepJump(\'issues\')">全体の課題</a><a onclick="pitAiRepJump(\'future\')">改善した未来</a></div>';

    /* 全体 */
    h += '<h2 class="air-part all" id="air-all">全体の総評</h2><div class="air-kpis">'
       + kpi('実行金額（実績）', man(G.実績), G.台数 + '台／目標 ' + man(F.目標.下限) + '〜' + man(F.目標.上限))
       + kpi('下限に対して', pct(G.実績, F.目標.下限) + '%', G.実績 >= F.目標.上限 ? '上限も達成' : '上限まで あと' + man(F.目標.上限 - G.実績), G.実績 >= F.目標.下限 ? 'up' : 'dn')
       + kpi('前月', man(G.前月), diffTxt(G.実績, G.前月) + '（' + (G.前月 ? Math.round((G.実績 - G.前月) / G.前月 * 1000) / 10 : 0) + '%）', G.実績 >= G.前月 ? 'up' : 'dn')
       + kpi('営業日', (G.営業日 == null ? '—' : G.営業日 + '日'), '前月 ' + (G.前月営業日 == null ? '—' : G.前月営業日 + '日') + '／1日あたり ' + (G.一日あたり ? man(G.一日あたり) : '—') + '（前月 ' + (G.前月一日あたり ? man(G.前月一日あたり) : '—') + '）')
       + '</div>';
    var GR = F.通知表 || grades(F);
    h += gradeHtml(GR.全体);
    h += '<table class="air-t"><tr><th></th><th class="n">実績</th><th class="n">目標（下限〜上限）</th><th class="n">下限に対して</th><th class="n">前月</th><th class="n">台数</th><th class="n">台単価</th><th class="n">預かり（中央値）</th></tr>';
    DIVS.forEach(function (D) {
      var x = F.課[D[0]];
      h += '<tr><td>' + dvChip(x.短い名前, x.色) + ' ' + D[1] + '</td><td class="n">' + man(x.実績) + '</td><td class="n">' + man(x.目標.min) + '〜' + man(x.目標.max) + '</td><td class="n"><b class="' + (x.実績 >= x.目標.min ? 'up' : 'dn') + '">' + pct(x.実績, x.目標.min) + '%</b></td><td class="n">' + man(x.前月) + '</td><td class="n">' + x.台数 + '台</td><td class="n">' + man(x.台単価) + '</td><td class="n">' + (x.預かり.中央値 == null ? '—' : x.預かり.中央値 + '日') + '</td></tr>';
    });
    h += '</table>' + cumSvg(F);
    h += '<div class="air-sum">' + paras(F, A.総評) + '</div>';

    var I = F.保険;
    h += '<div class="air-bonus"><h3>保険（ボーナス枠）</h3><table class="air-t">'
       + '<tr><th>この月の実績に入った保険</th><td>' + (I.実績に入った.length ? I.実績に入った.map(function (x) { return carChip(F, x.id) + ' ' + man(x.金額); }).join('　') : '0台') + '</td></tr>'
       + '<tr><th>この月に売上日・入金待ち（次の月以降のボーナス候補）</th><td>' + (I.入金待ち.length ? I.入金待ち.map(function (x) { return carChip(F, x.id) + ' ' + (x.金額 ? man(x.金額) : '金額未入力'); }).join('　') : '0台') + '</td></tr>'
       + '<tr><th>作業完了・返車待ちの保険</th><td>' + (I.作業完了のまま.length ? I.作業完了のまま.map(function (x) { return carChip(F, x.id) + ' ' + man(x.金額); }).join('　') : '0台') + '</td></tr>'
       + '</table>' + (A.保険 ? paras(F, [A.保険]) : '') + '</div>';

    h += divHtml(F, A, 'div1') + divHtml(F, A, 'div2');

    h += '<h2 class="air-part all" id="air-issues">全体の課題</h2><div class="air-issue"><ol>'
       + (A.全体の課題 || []).map(function (p) { return '<li>' + txt(F, p) + '</li>'; }).join('') + '</ol></div>';

    var Fu = A.未来 || {};
    h += '<h2 class="air-part all" id="air-future">改善した未来</h2><div class="air-future">';
    DIVS.forEach(function (D) {
      var u = F.課[D[0]].未来;
      h += '<div class="air-fut"><h3>' + dvChip(F.課[D[0]].短い名前, F.課[D[0]].色) + '改善した未来</h3><div class="big">'
         + '<div>空く預かり日数<b>約' + u.空く日数 + '日</b>のべ ' + F.課[D[0]].預かり.のべ + '日の ' + pct(u.空く日数, F.課[D[0]].預かり.のべ) + '%</div>'
         + '<div>いつも空いている置き場<b>約' + u.空く置き場 + '台分</b></div>'
         + '<div>大物なしの実績の見込み<b>約' + man(u.見込み) + '</b>いまは ' + man(F.課[D[0]].大物を除く.実績) + '</div></div>'
         + paras(F, Fu[D[0]])
         + '<div class="how">計算：作業完了→返車を1日まで（' + u.内訳.作業完了から返車 + '日）＋8〜14日の仕事を7日に（' + u.内訳.中くらいの仕事 + '日）＋31日以上（大物を除く）を30日で区切る（' + u.内訳.長期預かり + '日）。空いた日数 × この課の1日あたり（大物を除く）' + yen(F.課[D[0]].大物を除く.一日あたり) + '。</div></div>';
    });
    var Fa = F.未来;
    h += '<div class="air-fut all"><h3>全体の改善した未来</h3><div class="big">'
       + '<div>空く預かり日数<b>約' + Fa.空く日数 + '日</b></div>'
       + '<div>いつも空いている置き場<b>約' + Fa.空く置き場 + '台分</b></div>'
       + '<div>大物なしの地力<b>' + man(G.地力) + ' → 約' + man(Fa.見込み) + '</b>下限 ' + man(F.目標.下限) + '</div></div>'
       + paras(F, Fu.全体)
       + '<div class="how">⚠ 伸ばせる売上は、予約は基本いっぱい＝空いた枠はそのまま次の車に回せる、という前提で数えています。月をまたいだ車の分は月の入れ替わりで相殺されるので足していません。</div></div></div>';

    h += '<div class="air-foot"><b>このレポートが使ったもの</b>（書き出した時点の PitFlow のデータ）<ul>'
       + '<li>実績＝売上ビューと同じ数え方。課＝カードの課。メーカーは BMW の MINI と MINI をまとめて「MINI」</li>'
       + '<li>目標＝書き出した時点の月目標（下限 ' + man(F.目標.下限) + '・上限 ' + man(F.目標.上限) + '・国産 ' + F.目標.国産の割合 + '%）</li>'
       + '<li>預かり日数＝入庫日〜実績カウント日。工程ごとの日数＝カードの状態を動かした記録（PitFlow を使い始める前の期間は含まない）</li>'
       + '<li>大物＝1台で月の実績の10%以上。保険は課の分析に入れず、ボーナス枠に分けた</li>'
       + '<li>人＝メンバーで「フロント」「メカ」のチェックがある人。メカの生産は複数担当なら均等割り</li>'
       + '<li>文章＝AI（' + esc((R.AI && R.AI.model) || '') + '）。数字はすべて PitFlow が計算したもの</li></ul></div>';
    return h + '</div>';
  }

  /* ================================================================
     🔒 v2.136.0（ゆうた指定 2026-10-03）**MTGで話すこと**＝レポートのいちばん下のさらに下。
     🗣「特定アカウントからしか表示できない裏表示。俺と社長と専務のアカウントのみ」
     🗣「社長・専務は MTG・発表が下手。数字を見る・管理するのもやったことがない。何を言えばいいか、
        社長は1課長でもあるから1課をどう直すか、を比較的簡単に、ツボを押さえてる感で。2課（ほめる時にも）と全体も。台本ではなく要点で」
     🔴 見える人＝PitFlow のログインの名前が「チーフ」「社長」「専務」の3人だけ。ほかの人には枠そのものを出さない。
     ⚠ これは**画面に出さないだけ**。書類（pitSettings）は社内の人なら読める作り（Firestore のルールは触っていない）。
     ================================================================ */
  var MTG_VIEWERS = ['チーフ', '社長', '専務'];
  function canSeeMtg(){
    try { var me = t(w.pitFlowMe ? w.pitFlowMe() : ''); return MTG_VIEWERS.indexOf(me) >= 0; } catch (e) { return false; }
  }
  function mtgList(label, arr, cls){
    arr = (Array.isArray(arr) ? arr : (arr ? [arr] : [])).filter(Boolean);
    if (!arr.length) return '';
    return '<div class="air-mb ' + (cls || '') + '"><div class="lab">' + esc(label) + '</div><ul>'
         + arr.map(function (x) { return '<li>' + esc(x).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>') + '</li>'; }).join('') + '</ul></div>';
  }
  function mtgCol(F, k, M2){
    if (!M2) return '';
    var title = k === '全体' ? '全体' : (F.課[k] ? F.課[k].短い名前 : k);
    var tag = k === 'div1' ? '1課長＝社長' : (k === 'div2' ? 'ほめる' : '最初か最後に');
    var color = (k !== '全体' && F.課[k] && F.課[k].色) ? ' style="--dc:' + esc(F.課[k].色) + '"' : '';
    var h = '<div class="air-mc"' + color + '><h3>' + esc(title) + '<i>' + esc(tag) + '</i></h3>';
    if (M2.ひとこと) h += '<div class="air-mone">' + esc(M2.ひとこと) + '</div>';
    var nums = (Array.isArray(M2.数字) ? M2.数字 : []).filter(Boolean);
    if (nums.length) h += '<div class="air-mnums">' + nums.map(function (n) { return '<span>' + esc(n) + '</span>'; }).join('') + '</div>';
    h += mtgList(k === 'div2' ? 'ほめる' : '良かった', k === 'div2' ? M2.ほめる : M2.良かった, 'good');
    h += mtgList(k === 'div2' ? '次の一歩' : (k === '全体' ? 'これから' : '足りない'), k === 'div2' ? M2.次の一歩 : (k === '全体' ? M2.これから : M2.足りない), 'fix');
    h += mtgList(k === '全体' ? '伝えたいこと' : '来月やること', k === '全体' ? M2.伝えたいこと : M2.来月やること, 'do');
    var qa = (Array.isArray(M2.聞かれたら) ? M2.聞かれたら : []).filter(function (x) { return x && (x.問 || x.答); });
    if (qa.length) h += '<div class="air-mb qa"><div class="lab">聞かれたら</div><ul>' + qa.map(function (x) {
      return '<li>「' + esc(x.問 || '') + '」→ ' + esc(x.答 || '') + '</li>'; }).join('') + '</ul></div>';
    return h + '</div>';
  }
  function mtgHtml(R){
    if (!canSeeMtg() || !R || !R.数字) return '';
    var M2 = R.文 && R.文.MTG;
    var h = '<div class="air-ura"><div class="air-ura-h"><h2>MTGで話すこと</h2><span class="air-lock">🔒 社長・専務・チーフだけに見えています</span></div>';
    if (!M2) return h + '<div class="air-ura-none">このレポートは「MTGで話すこと」を作る前に書き出したものです。「書き出し直す」を押すと出ます。</div></div>';
    return h + '<div class="air-mcols">' + mtgCol(R.数字, 'div1', M2.div1) + mtgCol(R.数字, 'div2', M2.div2) + mtgCol(R.数字, '全体', M2.全体) + '</div></div>';
  }

  function closeHtml(U, mm, ym){
    var C = U.close, saved = !!(U.saved && U.saved.数字), past = isPast(ym);
    /* 📐 v2.135.2（ゆうた「書き出すが上に上がってるのが変」）＝ボタンは見出しの行ではなく **Q の箱と同じ行・同じ高さ**。
       上の行＝見出し（左）と書き出した日時（右）／下の行＝Q の箱4つ（左）とボタン（右・箱と同じ高さ） */
    var sub = saved ? esc(s(U.saved.書き出した日時).slice(0, 16).replace('T', ' ')) + ' に書き出し済み'
                    : (past ? '押すと締めを確かめてから書き出します' : '月が終わると押せます');
    var h = '<div class="air-close"><div class="air-chead"><h3>';
    if (saved && C && C.証) h += mm + '月は締め済み（' + esc(s(U.saved.書き出した日時).slice(5, 10).replace('-', '/')) + ' に書き出した時点で Q1〜Q4 すべて済み）';
    else if (!U.loaded) h += '読み込んでいます…';
    else if (!past) h += mm + '月はまだ途中です（月が終わって締めたあとに書き出せます）';
    else h += mm + '月のレポートはまだありません';
    h += '</h3>' + (isAdmin() ? '<span class="air-go-sub">' + sub + '</span>' : '') + '</div><div class="air-crow">';
    /* Q の箱は「締めた証」か「押して確かめた結果」があるときだけ（開いただけでは確かめない） */
    var Q = (saved && C && C.qs && C.qs.length) ? C : (U.check && U.check.qs && U.check.qs.length ? U.check : null);
    /* 📐 v2.135.1（ゆうた「書き出すとボタンの位置が上がってきもちわるい」）
       ＝ Q の箱が出たり消えたりして帯の高さが変わっていた。**箱はいつも4つ出す**（まだ確かめていない時は「未確認」）。
       区切りは pitQMonthPlan の1本（ここで日付を書かない）。 */
    if (!Q && w.pitQMonthPlan){
      h += '<div class="air-qs">' + w.pitQMonthPlan(ym, []).map(function (x) {
        return '<div class="air-q un"><b>Q' + x.no + ' ' + (+s(x.from).slice(8)) + '〜' + (+s(x.to).slice(8)) + '日</b><span class="st0">未確認</span></div>';
      }).join('') + '</div>';
    }
    if (Q){
      h += '<div class="air-qs">' + Q.qs.map(function (q) {
        var st = !q.読んだ ? 'PDF未' : (!q.全部 ? '一部だけ' : '残り' + q.残り + '・書き込み ' + q.書けた + '/' + q.対象 + (q.変わった ? '・変わった ' + q.変わった : ''));
        return '<div class="air-q' + (q.done ? '' : ' ng') + '"><b>' + q.label + ' ' + (+s(q.from).slice(8)) + '〜' + (+s(q.to).slice(8)) + '日</b><span class="' + (q.done ? 'ok' : 'st') + '">' + (q.done ? '済み' : 'まだ') + '</span>　' + esc(st) + '</div>';
      }).join('') + '</div>';
    }
    if (isAdmin()){
      var can = U.loaded && !U.busy && past;
      h += '<button class="air-go" ' + (can ? '' : 'disabled') + ' onclick="pitAiRepGo()">' + (saved ? '書き出し直す' : 'レポートを書き出す') + '</button>';
    }
    return h + '</div></div>';
  }

  /* 書き出した時の締めの記録＝締めた証。古い記録に qs が無くても「締め済み」として出す */
  function markClosed(c){
    var o = c && c.qs ? JSON.parse(JSON.stringify(c)) : { qs: [] };
    o.closed = true; o.証 = true;
    return o;
  }

  /* タブの中身（sales.js から）
     ⚡ v2.133.0 書き出し済みの月は、残したレポート1つを読むだけ（控えがあれば即表示・裏で本物を確かめる）
     ⏳ v2.134.0 **開いただけでは締め（Q1〜Q4）を確かめない。** 確かめるのは「書き出す」を押した時だけ
        （いまの月や未来の月はそもそも書き出せない＝読み込みを待たせて月を動かせなくしない） */
  w.pitAiRepMonth = function (wrap, head, y, m0){
    var ym = y + '-' + pad(m0 + 1), U = M(ym), mm = m0 + 1;
    if (!w.PIT_CLOUD){
      wrap.innerHTML = head + '<div class="sv-card"><div class="sv-empty">AIレポートは本番の PitFlow でだけ使えます（練習用サイトでは書き出せません）。</div></div>';
      return;
    }
    if (!U.loaded && !U.loading){
      if (!isPast(ym)){ U.saved = null; U.loaded = true; }      /* いまの月・未来の月＝レポートは無い。読みにも行かない */
      else {
        U.loading = true;
        var cached = cacheGet(ym);
        if (cached && cached.数字){ U.saved = cached; U.close = markClosed(cached.締め); U.loaded = true; }
        loadSaved(ym).catch(function () { return undefined; }).then(function (sv) {
          U.loading = false;
          if (sv === undefined && cached) return;                 /* 読めなかった＝控えのまま */
          if (sv && sv.数字){
            var changed = !cached || s(cached.書き出した日時) !== s(sv.書き出した日時);
            cachePut(ym, sv);
            U.saved = sv; U.close = markClosed(sv.締め); U.loaded = true;
            if (changed) rerender();
            return;
          }
          if (cached) cachePut(ym, null);                         /* 本物が無い（消された）＝控えも捨てる */
          U.saved = null; U.close = null; U.loaded = true; rerender();
        });
      }
    }
    var h = head + closeHtml(U, mm, ym) + runHtml(U);
    if (U.err && !U.run) h += '<div class="air-err">' + esc(U.err) + '</div>';
    if (U.saved && U.saved.数字) h += reportHtml(U.saved) + mtgHtml(U.saved);
    else if (U.loaded && !U.run) h += '<div class="sv-card"><div class="sv-empty">'
      + (!isPast(ym) ? mm + '月はまだ途中です。月が終わって Q1〜Q4 を締めたあとに書き出せます。'
                     : mm + '月のレポートはまだありません。' + (isAdmin() ? '上の「レポートを書き出す」で作れます（押すと締めを確かめます）。' : '管理者が書き出すと、ここに出ます。'))
      + '</div></div>';
    wrap.innerHTML = h;
    if (U.busy && U.run && U.run.t0 && !timer) timer = setInterval(tick, 1000);
  };

  w.pitAiRepOpen = function (id){ if (w.pitOpenCardDetail) w.pitOpenCardDetail(id); };
  w.pitAiRepJump = function (k){ var el = document.getElementById('air-' + k); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  /* 月を動かした・クォーターチェックで書き込んだ時に、締めを確かめ直す */
  /* ⚡ v2.133.1 書き出し済みの月は忘れない（変わらないので読み直す意味が無い）。忘れるのは まだの月だけ */
  w.pitAiRepForget = function (ym){
    Object.keys(MEM).forEach(function (k) { if ((!ym || k === ym) && !(MEM[k].saved && MEM[k].saved.数字) && !MEM[k].busy) delete MEM[k]; });
  };

  /* 🖨 PDF 出力の形（sales.js の svReportModel から）。紙には数字の表だけ出す（文は画面で読む） */
  w.pitAiRepModel = function (){
    var ym0 = w._svYM, ym = ym0.y + '-' + pad(ym0.m + 1), R = M(ym).saved;
    var period = ym0.y + '年' + (ym0.m + 1) + '月';
    if (!R || !R.数字) return { title: 'AIレポート', period: period, kpis: [{ label: 'レポート', value: 'まだ書き出していません' }], sections: [] };
    var F = R.数字, G = F.全体;
    return { title: 'AIレポート（月次）', period: period,
      kpis: [{ label: '実績', value: man(G.実績) + '・' + G.台数 + '台' }, { label: '目標（下限〜上限）', value: man(F.目標.下限) + '〜' + man(F.目標.上限) },
             { label: '前月', value: man(G.前月) }, { label: '大物なしの地力', value: man(G.地力) }],
      sections: [{ type: 'table', title: '課ごと', head: ['課', '実績', '目標下限', '台数', '台単価', '預かり中央値', '1日あたり'],
        rows: DIVS.map(function (D) { var x = F.課[D[0]]; return [x.短い名前 || D[1], man(x.実績), man(x.目標.min), x.台数 + '台', man(x.台単価), (x.預かり.中央値 == null ? '—' : x.預かり.中央値 + '日'), yen(x.預かり.一日あたり)]; }),
        align: ['l', 'r', 'r', 'r', 'r', 'r', 'r'] }],
      note: 'AI の文章は PitFlow の売上ビュー ▸ AIレポートで読めます（書き出し ' + s(R.書き出した日時).slice(0, 10) + '）' };
  };

  w.pitAiRepFacts = facts;
  w.pitAiRepHtml  = reportHtml;
  w.pitAiRepMtgHtml = mtgHtml;    /* 見張り用：MTGで話すこと（見える人だけ） */   /* 見張り用：残したレポート（数字＋文）から画面を作る */
  w.pitAiRepSystem = SYSTEM;      /* 見張り用：AI への決めごと */
  w.pitAiRepClose = closeState;
})(window);
