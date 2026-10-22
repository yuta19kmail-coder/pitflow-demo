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

  var MODEL = 'claude-opus-5-5';   /* 書き出した記録に残す名前の予備（本当に使ったモデルはサーバーの答えの d.model） */
  /* 🔴 v2.194.0 量（40000）と考える深さ（medium）はサーバー（functions/report-prompt.js）へ移した。
     ⚠ Opus 5.5 は「考える」ぶんも出力に数える。16000 では考えるだけで使い切り、文が途中で切れた（2026-10-02）。 */

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
  /* ⑧ BMW の MINI と MINI は「MINI」。
     📊 v2.143.0 物差しは analytics-pit.js の `pitCardMaker` 1本に移した（分析用の書き出しと同じ数え方にするため） */
  function makerOf(c){ return w.pitCardMaker(c); }
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
  /* ================================================================
     💰 v2.139.0（ゆうた 2026-10-03「原価が PDF から入力されてるんだから、原価・粗利もガンガン触れていい。
        この資料を見るメンバーには開示してる」「粗利ベースの話は OK。最終的な着地は売上を目指す感じで（社員の理解がそっちの方がいい）」）
     ◎原価の出どころ＝クォーターチェックで車に書き込んだ伝票（予約番号でカードと結ぶ）。月締め＝全部書き込み済み、なので締めた月はそろう
     ⚠ 工賃（作業）の原価は伝票上ほぼ0＝粗利は「部品の利益＋工賃」。人件費は入っていない
     ⚠ 伝票が無い車（業販など）は粗利の計算から外す（売上の数字はそのまま）
     ================================================================ */
  /* 📊 v2.143.0 物差しは analytics-pit.js の `pitCardCost` 1本に移した（分析用の書き出しと同じ引き方にするため） */
  function costOf(c){ return w.pitCardCost(c); }
  /* ================================================================
     🔧 v2.140.0（ゆうた 2026-10-03「板金系は自社に数日置いて、板金屋さんが取りに来てあと放置、戻ってきたら返車。
        丸ごと抜いていい。車検＋コーティングなどで全体で1週間なら入れていい」）
     ＝ 作業タイプに B.P（板金）がある車は、**預かり日数を使う数字（中央値・1日あたり・日数帯・工程・時間がかかった車・
        作業完了→返車・改善した未来）から丸ごと外す**。売上・粗利・台数の合計には入れたまま。
     🔴 板金かどうかは pit-share.js の作業タイプの1本（pitCardWorkIds）に 'bp' があるか。
     ================================================================ */
  function isBodyShop(c){ try { return (w.pitCardWorkIds ? w.pitCardWorkIds(c) : []).indexOf('bp') >= 0; } catch (e) { return false; } }
  function r1(a, b){ return b ? Math.round(a / b * 1000) / 10 : null; }   /* 率（小数1桁・%） */

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
      var st = a.filter(function (r) { return !isBodyShop(r.c); }).map(function (r) { return days(r.c.actualInAt, r.c.completedAt); }).filter(function (v) { return v != null; }).sort(function (p, q) { return p - q; });
      var gu = 0, ga = 0;
      a.forEach(function (r) { var co = costOf(r.c); if (co){ gu += r.amt; ga += r.amt - co.原価; } });
      return { 台単価: a.length ? Math.round(sum / a.length) : null, 預かり中央値: st.length ? st[Math.floor(st.length / 2)] : null, 粗利率: r1(ga, gu) };
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
      var co = costOf(c);
      reg(c);
      return { id: c.id, 課: r.course, 保険: insOf(c), 大物: r.amt >= bigLine, 金額: r.amt,
               原価: co ? co.原価 : null, 粗利: co ? r.amt - co.原価 : null, 内訳: co, 板金: isBodyShop(c),
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
      var st = a.filter(function (r) { return r.預かり != null && !r.板金; });   /* 🔧 v2.140.0 板金は預かりの数字から外す */
      var stays = st.map(function (r) { return r.預かり; }).sort(function (p, q) { return p - q; });
      var dsum = st.reduce(function (x, r) { return x + Math.max(1, r.預かり); }, 0);
      var nb = st.filter(function (r) { return !r.大物; });
      var nbSum = nb.reduce(function (x, r) { return x + r.金額; }, 0), nbDays = nb.reduce(function (x, r) { return x + Math.max(1, r.預かり); }, 0);
      /* 💰 粗利（原価のある車だけで数える） */
      function araOf(list){
        var x = list.filter(function (r) { return r.粗利 != null; });
        var u = x.reduce(function (q, r) { return q + r.金額; }, 0), g = x.reduce(function (q, r) { return q + r.粗利; }, 0);
        var xs = x.filter(function (r) { return r.預かり != null && !r.板金; });
        var dd = xs.reduce(function (q, r) { return q + Math.max(1, r.預かり); }, 0), gs = xs.reduce(function (q, r) { return q + r.粗利; }, 0);
        return { 粗利: g, 粗利率: r1(g, u), 台あたり: x.length ? Math.round(g / x.length) : 0, 一日あたり: dd ? Math.round(gs / dd) : 0, 台数: x.length };
      }
      var bk = [['〜3日', 0, 3], ['4〜7日', 4, 7], ['8〜14日', 8, 14], ['15〜30日', 15, 30], ['31日〜', 31, 99999]].map(function (b) {
        var x = st.filter(function (r) { return r.預かり >= b[1] && r.預かり <= b[2] && !r.大物; });
        var sm = x.reduce(function (q, r) { return q + r.金額; }, 0), dd = x.reduce(function (q, r) { return q + Math.max(1, r.預かり); }, 0);
        var ag = araOf(x);
        return { 帯: b[0], 台数: x.length, 金額: sm, のべ日数: dd, 一日あたり: dd ? Math.round(sm / dd) : 0, 台単価: x.length ? Math.round(sm / x.length) : 0,
                 粗利: ag.粗利, 粗利率: ag.粗利率, 一日あたり粗利: ag.一日あたり };
      });
      var AG = araOf(a);
      var wU = 0, wA = 0, pU = 0, pA = 0;
      a.forEach(function (r) { if (!r.内訳) return; wU += r.内訳.工賃; wA += r.内訳.工賃 - r.内訳.工賃原価; pU += r.内訳.部品; pA += r.内訳.部品 - r.内訳.部品原価; });
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
      var wt = {}; a.forEach(function (r) { var q = r.作業; wt[q] = wt[q] || { 作業: q, 台数: 0, 金額: 0, _l: [] }; wt[q].台数++; wt[q].金額 += r.金額; wt[q]._l.push(r); });
      Object.keys(wt).forEach(function (q) { var g = araOf(wt[q]._l); wt[q].粗利 = g.粗利; wt[q].粗利率 = g.粗利率; wt[q].一日あたり粗利 = g.一日あたり; delete wt[q]._l; });
      var late = a.filter(function (r) { return r.返車予定 && r.完了 && r.完了 > r.返車予定; })
                  .map(function (r) { return { id: r.id, 返車予定: r.返車予定, 完了: r.完了, 遅れ: days(r.返車予定, r.完了), 金額: r.金額 }; })
                  .sort(function (p, q) { return q.遅れ - p.遅れ; });
      var top = a.slice().sort(function (p, q) { return q.金額 - p.金額; }).slice(0, 6).map(function (r) {
        return { id: r.id, 作業: r.作業, 金額: r.金額, 預かり: r.預かり, 一日あたり: r.預かり != null ? Math.round(r.金額 / Math.max(1, r.預かり)) : null, 症状: r.メモ.症状,
                 粗利: r.粗利, 粗利率: r.粗利 != null ? r1(r.粗利, r.金額) : null };
      });
      var slow = st.slice().sort(function (p, q) { return q.預かり - p.預かり; }).slice(0, 6).map(function (r) {
        return { id: r.id, 預かり: r.預かり, 工程: r.工程, 金額: r.金額, 一日あたり: Math.round(r.金額 / Math.max(1, r.預かり)),
                 粗利: r.粗利, 一日あたり粗利: r.粗利 != null ? Math.round(r.粗利 / Math.max(1, r.預かり)) : null,
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
                 のべ: dsum, 一日あたり: dsum ? Math.round(st.reduce(function (x, r) { return x + r.金額; }, 0) / dsum) : 0, 平均在庫台数: Math.round(dsum / 30 * 10) / 10,
                 板金で外した台数: a.filter(function (r) { return r.板金; }).length },
        日数帯: bk, 工程: phases,
        粗利: { 粗利: AG.粗利, 粗利率: AG.粗利率, 台あたり: AG.台あたり, 一日あたり: AG.一日あたり, 原価のある台数: AG.台数, 原価の無い台数: a.length - AG.台数,
                工賃: { 売上: Math.round(wU), 粗利: Math.round(wA), 粗利率: r1(wA, wU) }, 部品: { 売上: Math.round(pU), 粗利: Math.round(pA), 粗利率: r1(pA, pU) },
                前月の粗利率: prevStats[k].粗利率 },
        作業完了から返車: { 台数: wd.length, のべ日数: Math.round(wd.reduce(function (x, r) { return x + r.工程.workDone; }, 0)),
                         三日以上: wd.filter(function (r) { return r.工程.workDone >= 3; }).length },
        フロント: Object.keys(fr).map(function (q) { return fr[q]; }).sort(function (p, q) { return q.売上 - p.売上; }),
        メカ: Object.keys(me).map(function (q) { me[q].生産 = Math.round(me[q].生産); return me[q]; }).sort(function (p, q) { return q.生産 - p.生産; }),
        メーカー: Object.keys(mk).map(function (q) { return mk[q]; }).sort(function (p, q) { return q.金額 - p.金額; }),
        作業: Object.keys(wt).map(function (q) { return wt[q]; }).sort(function (p, q) { return q.金額 - p.金額; }),
        予定遅れ: { 台数: late.length, 上位: late.slice(0, 5) },
        引っぱった車: top, 時間がかかった車: slow,
        未来: { 空く日数: freed, 内訳: { 作業完了から返車: Math.round(fWd), 中くらいの仕事: Math.round(fMid), 長期預かり: Math.round(fLong) },
                伸ばせる売上: Math.round(freed * perDayNB), 伸ばせる粗利: Math.round(freed * AG.一日あたり), 空く置き場: Math.round(freed / 30 * 10) / 10,
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
    var insAct = rows.filter(function (r) { return r.保険; }).map(function (r) { return { id: r.id, 金額: r.金額, 課: r.課 }; });

    /* ---- 人（⑪） ---- */
    var staff = (S().staff || []).filter(function (p) { return p && !p.isSelf && (p.front || p.mech); }).map(function (p) {
      return { 名前: t(p.name || p.realName), 課: divName(p.division) || '', フロント: !!p.front, メカ: !!p.mech, 入社: s(p.joinedAt) };
    });
    var joined = (S().staff || []).filter(function (p) { return p && s(p.joinedAt).slice(0, 7) === ym; })
                   .map(function (p) { return { 名前: t(p.name || p.realName), フロント: !!p.front, メカ: !!p.mech, 入社: p.joinedAt }; });
    var left = Object.keys(w.PIT_FORMER || {}).map(function (k) { return w.PIT_FORMER[k]; })
                 .filter(function (f) { return f && s(f.leftAt).slice(0, 7) === ym; }).map(function (f) { return { 名前: t(f.name), 退職: f.leftAt }; });

    /* ---- 👥 名簿（v2.137.0 ゆうた「数年たつと退職者も出て誰が誰だか分からなくなる。メンバー一覧（回送スタッフも）と、それぞれの結果」）
       受付＝予約件数（予約を受けた日がこの月・受付担当）／回送＝車検ライン（陸運局へ行った回数・1人目）／
       フロント＝売上台数（実績・フロント担当）／メカ＝売上台数（実績・整備担当に名前がある）
       👥 v2.138.0（ゆうた「コバモは外して OK。並びはいい。入社期間とかは要らない。共通のアバター。人ごとの部署表示もいらない」）
         ・**その月に在籍していた人だけ**（入社日がその月の末日まで・辞めた人は退職日がその月の1日以降）
         ・部署の無い共用アカウント（コバモ）は出さない
         ・並び＝1課／2課／受付／車販・回送 の中で入社の古い順（入社日は並べるのに使うだけ・出さない）
         ・アバターは共通部品（CFUser）で描く＝書類には写真を入れず、人の id だけ残す
       ⚠ 名前は名簿の別名（本名・フルネーム・空白なし）でも当てる。名簿に居ない名前は「名簿にない」として残す */
    function nkey(v){ return t(v).replace(/[\s　]/g, ''); }
    function grpOf(p){
      var d = t(p.division) || t(Array.isArray(p.divisions) ? p.divisions[0] : '');
      return d === 'div1' ? 'div1' : (d === 'div2' ? 'div2' : (d === 'recept' ? 'recept' : 'other'));
    }
    var people = [], byKey = {};
    function addPerson(p, former){
      var o = { id: t(p.cmId || p.id), 名前: t(p.name || p.realName), 本名: t(p.realName), 組: grpOf(p), 入社: s(p.joinedAt),
                退職: former ? s(p.leftAt) : '', 役割: [p.reception ? '受付' : '', p.front ? 'フロント' : '', p.mech ? 'メカ' : ''].filter(Boolean),
                予約件数: 0, 車検ライン: 0, フロント台数: 0, フロント売上: 0, メカ台数: 0, メカ生産: 0 };
      people.push(o);
      [p.name, p.realName, p.dispName, p.lastName].concat(Array.isArray(p.aliases) ? p.aliases : []).forEach(function (n) { var k = nkey(n); if (k && !byKey[k]) byKey[k] = o; });
    }
    (S().staff || []).forEach(function (p) {
      if (!p) return;
      /* 会社そのもの（「小林モータース」＝担当を人にしなかった分）は人と分ける */
      if (p.isSelf){
        var so = { id: '', 名前: t(p.name || p.dispName), 本名: '', 組: 'self', 会社: true, 役割: [],
                   予約件数: 0, 車検ライン: 0, フロント台数: 0, フロント売上: 0, メカ台数: 0, メカ生産: 0 };
        people.push(so);
        [p.name, p.dispName].concat(Array.isArray(p.aliases) ? p.aliases : []).forEach(function (n) { var k = nkey(n); if (k && !byKey[k]) byKey[k] = so; });
        return;
      }
      if (s(p.joinedAt) && s(p.joinedAt) > moE) return;                                   /* この月にはまだ居ない */
      var hasDept = t(p.division) || (Array.isArray(p.deptNames) ? p.deptNames.length : t(p.deptNames));
      if (!hasDept) return;                                                                 /* 共用アカウント（コバモ） */
      addPerson(p, false);
    });
    Object.keys(w.PIT_FORMER || {}).forEach(function (k) {
      var f = w.PIT_FORMER[k];
      if (!f || !s(f.leftAt) || s(f.leftAt) < moS) return;                                  /* この月より前に辞めた人は出さない */
      if (s(f.joinedAt) && s(f.joinedAt) > moE) return;
      addPerson(f, true);
    });
    function who(n){
      var k = nkey(n); if (!k) return null;
      if (byKey[k]) return byKey[k];
      var o = { id: '', 名前: t(n), 本名: '', 組: 'other', 名簿にない: true, 役割: [], 予約件数: 0, 車検ライン: 0, フロント台数: 0, フロント売上: 0, メカ台数: 0, メカ生産: 0 };
      people.push(o); byKey[k] = o; return o;
    }
    (S().cards || []).forEach(function (c) {
      if (!c || !c.bookedAt || s(c.bookedAt).slice(0, 7) !== ym) return;
      var o = who(c.reserveStaff); if (o) o.予約件数++;
    });
    try { (w.pitShakenLineTrips ? w.pitShakenLineTrips(moS, moE) : []).forEach(function (tr) { var o = who(tr.staff); if (o) o.車検ライン++; }); } catch (e) {}
    acts.forEach(function (r) {
      var f = who(r.c.frontStaff || r.c.staff); if (f){ f.フロント台数++; f.フロント売上 += r.amt; }
      var ms = mechsOf(r.c);
      ms.forEach(function (n) { var o = who(n); if (o){ o.メカ台数++; o.メカ生産 += r.amt / ms.length; } });
    });
    people.forEach(function (o) { o.フロント売上 = Math.round(o.フロント売上); o.メカ生産 = Math.round(o.メカ生産); });
    var GORD = { div1: 1, div2: 2, recept: 3, other: 4, self: 9 };
    var roster = people.filter(function (o) { return (!o.名簿にない && !o.会社) || o.予約件数 || o.車検ライン || o.フロント台数 || o.メカ台数; })
      .sort(function (p, q) { return (GORD[p.組] || 5) - (GORD[q.組] || 5) || (s(p.入社 || '9999') < s(q.入社 || '9999') ? -1 : (s(p.入社 || '9999') > s(q.入社 || '9999') ? 1 : 0)); });

    /* ---- 休み ---- */
    var closed = [], openHol = [];
    for (var d = 1; d <= C.lastDay; d++){
      var ds = ym + '-' + pad(d);
      var isC = !!(w.PitCal && w.PitCal.isClosed && w.PitCal.isClosed(ds));
      var lb = (w.PitCal && w.PitCal.label) ? s(w.PitCal.label(ds)) : '';
      var hol = (w.Holidays && w.Holidays.name) ? s(w.Holidays.name(ds)) : '';
      var dow = '日月火水木金土'.charAt(new Date(y, m0, d).getDay());
      if (isC) closed.push({ 日: ds, 曜日: dow, 理由: lb || hol || '休み' });
      /* 🗓 v2.137.2（ゆうた「祝日営業も普通。MHS で休日に決めた日以外は特にない」）＝営業した日は何も載せない。休んだ日だけ */
    }

    /* ---- 全体 ---- */
    var bigAll = rows.filter(function (r) { return r.大物; });
    var allSt = rows.filter(function (r) { return !r.保険 && !r.板金 && r.預かり != null; }).map(function (r) { return r.預かり; }).sort(function (p, q) { return p - q; });
    var allNi = rows.filter(function (r) { return !r.保険; });
    var allWd = rows.filter(function (r) { return !r.保険 && !r.板金 && r.工程.workDone != null; });
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
        粗利: (function () {
          var x = allNi.filter(function (r) { return r.粗利 != null; }), u = x.reduce(function (q, r) { return q + r.金額; }, 0), g = x.reduce(function (q, r) { return q + r.粗利; }, 0);
          var xs = x.filter(function (r) { return r.預かり != null && !r.板金; }), dd = xs.reduce(function (q, r) { return q + Math.max(1, r.預かり); }, 0), gs = xs.reduce(function (q, r) { return q + r.粗利; }, 0);
          var ins = rows.filter(function (r) { return r.保険 && r.粗利 != null; }), iu = ins.reduce(function (q, r) { return q + r.金額; }, 0), ig = ins.reduce(function (q, r) { return q + r.粗利; }, 0);
          return { 粗利: g, 粗利率: r1(g, u), 台あたり: x.length ? Math.round(g / x.length) : 0, 一日あたり: dd ? Math.round(gs / dd) : 0,
                   原価のある台数: x.length, 前月の粗利率: prevStats.全体.粗利率, 保険の粗利: ig, 保険の粗利率: r1(ig, iu) };
        })(),
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
      保険: { 実績に入った: insAct, 入金待ち: insWait, 作業完了のまま: insWd,
              /* 🛡 v2.137.0（ゆうた「保険の枠が浅い。保険を抜いた各課の数字＝本当の意味で自分たちで仕上げた数字に着目」） */
              課ごと: { div1: rows.filter(function (r) { return r.保険 && r.課 === 'div1'; }).reduce(function (x, r) { return x + r.金額; }, 0),
                        div2: rows.filter(function (r) { return r.保険 && r.課 === 'div2'; }).reduce(function (x, r) { return x + r.金額; }, 0) } },
      人: { フロントとメカ: staff, 入った人: joined, 辞めた人: left, 名簿: roster },
      休み: { 定休曜日: (w.PitCal && w.PitCal.closedDow ? w.PitCal.closedDow() : []).map(function (n) { return '日月火水木金土'.charAt(n) + '曜'; }),
              休んだ日: closed },
      未来: { 空く日数: div.div1.未来.空く日数 + div.div2.未来.空く日数,
              伸ばせる売上: div.div1.未来.伸ばせる売上 + div.div2.未来.伸ばせる売上,
              伸ばせる粗利: div.div1.未来.伸ばせる粗利 + div.div2.未来.伸ばせる粗利,
              空く置き場: Math.round((div.div1.未来.空く日数 + div.div2.未来.空く日数) / 30 * 10) / 10,
              見込み: total - bigSum - insSum + div.div1.未来.伸ばせる売上 + div.div2.未来.伸ばせる売上 },
      車: cars
    };
    OUT.通知表 = grades(OUT);
    return OUT;
  }

  /* 📋 通知表（◎○△×）の物差しと描き方は共通部品へ移した（2026-10-20）＝ _shared\coreflow-pit-airep.js（CFPitAiRep.grades）。
     🔴 判定はコードが決める（AI に決めさせない）。物差しは向こうの1本。ここに書き戻さない */
  function grades(F){ return w.CFPitAiRep.grades(F); }

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
  /* 🔴 v2.194.0（2026-10-18・棚卸し C-09 第2段）AI への決めごと（SYSTEM）はサーバー（functions/report-prompt.js）へ移した。1文字も変えていない（控え＝functions/_old_report_system_v2.193.7.js） */

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
    if (!isAdmin()){ if (w.UI && w.UI.alert) w.UI.alert('レポートを書き出せるのは、設定権限（管理）のある人だけです。', { title: '書き出せません', code: 'PF-0072' }); return; }
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
        /* 🔴 v2.194.0（棚卸し C-09 第2段・ゆうた決定）送るのは用途の名前・その月・数字だけ。
           頼み方（SYSTEM）・頼む文の形・モデル・量・考える深さはサーバー（functions/report-prompt.js）が持つ */
        return fn({ purpose: 'AIレポート', ym: { y: ym0.y, m: ym0.m }, facts: slimForAi(F) });
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

  /* 🖼 レポートの描き方（本文・MTGで話すこと・スタッフ名簿）は共通部品へ移した（2026-10-20）＝ _shared\coreflow-pit-airep.js。
     🗣 ゆうた「MHS の MH実績にも PitFlow と同じ物をそのまま出す」＝ PitFlow と MHS が同じ1本で描く。ここに書き戻さない */
  function reportHtml(R){ return w.CFPitAiRep.html(R); }
  function mtgHtml(R){ return w.CFPitAiRep.mtgHtml(R); }

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
  /* pitAiRepJump（目次の飛び先）は共通部品（coreflow-pit-airep.js）が持つ */
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
  w.pitAiRepClose = closeState;
})(window);
