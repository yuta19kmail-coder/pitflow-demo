/* 🔴🔴 **本体はここ（CoreFlowアプリ\_shared\coreflow-pit-airep.js）だけ。** アプリの中にあるのは配られた写し。
   直す時は必ずここを直して `sync-shared.ps1` を走らせる（写しを直すと次の配布で消える）。
   🗣 ゆうた 2026-10-20「MHS の MH実績の PitFlow タブには、PitFlow の画面を**そのまま**出す」
   もとは PitFlow の js/sales-ai.js の「描く」側（通知表・本文・MTGで話すこと・スタッフ名簿）。中身は1文字も変えずにここへ移した（2026-10-20）。

   ■ 役目＝**書き出したレポート（pitSettings/aireport-YYYY-MM）を描くだけ**
     ・数字をまとめる・AI に書かせる・保存する＝ PitFlow の sales-ai.js（管理者だけ・ここには持たない）
     ・書き出したら固定＝描く材料はレポートの中身だけ（R.数字・R.文）。カードや目標を後で直しても変わらない
       ⚠ 例外：課の名前と色（state.divisions）・名簿の写真（state.staff・CFUser）だけは、いまの設定から引く（PitFlow の今までどおり）

   ■ 出す物（window.CFPitAiRep）
     html(R)          … レポート本文（PitFlow の売上ビュー ▸ AIレポートと同じ）
     mtgHtml(R)       … MTGで話すこと（チーフ・社長・専務だけ。ほかの人には空）
     grades(F)        … 通知表（◎○△×）の判定（sales-ai.js の書き出しも、これを借りる）
     month(wrap, head, y, m0, { company, rerender }) … 借りる側（MHS）の「その月のAIレポート」＝読んで描くだけ
     setup({ me })    … MTGで話すことを見せるかの名前（既定＝PitFlow の pitFlowMe()。MHS では「チーフ」「社長」「専務」などの呼び名を返す関数）

   ■ MHS で使う時
     売上ビューの部品（coreflow-pit-sales.js）の「AIレポート」タブがこれを呼ぶ＝ CFPitSales.setup({ company }) を渡せば出る。
     MTG の枠を見せる人を決める時だけ  CFPitAiRep.setup({ me: function(){ return 〈ログインの呼び名〉; } })
     車の1行を押すと PitFlow のそのカードを新しいタブで開く（PitFlow の中では今までどおりカードの詳細）。
     見た目＝ coreflow-pit-airep.css（同じく _shared）
*/
(function (w) {
  'use strict';

  var CFG = {};
  var PIT = 'https://pitflow.kobayashi-motors.com';
  function s(v){ return String(v == null ? '' : v); }
  function t(v){ return s(v).trim(); }
  function num(v){ v = +v; return isFinite(v) ? v : 0; }
  function esc(x){ return s(x).replace(/[&<>"']/g, function (m) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]; }); }
  /* 🛡 v2.200.0 SEC-07／SEC-08③（外部監査 2026-10-21）エスケープもれを直した。
     レポートは保存した書類（pitSettings）から読む＝数のはずの欄にも文字が入りうる。
     N＝数ならそのまま・それ以外は esc／jsq＝onclick の '…' 用／HEX＝色は #16進だけ／okSrc＝写真の src。
     ⚠ MHS など pit-share.js が無いアプリでも読まれるので、このファイルの中だけで完結させている */
  function N(v){ return typeof v === 'number' ? v : esc(v); }
  function jsq(x){ return esc(s(x).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }
  function HEX(c, d){ var x = t(c); return /^#[0-9a-fA-F]{3,8}$/.test(x) ? x : (d == null ? '' : d); }
  function okSrc(u){ u = t(u); return /^(https:|blob:|data:image\/)/i.test(u) ? u : ''; }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function man(n){ var m = num(n) / 10000; return (Math.abs(m) >= 100 ? Math.round(m) : Math.round(m * 10) / 10).toLocaleString() + '万'; }
  function yen(n){ return Math.round(num(n)).toLocaleString() + '円'; }
  function pct(a, b){ return b ? Math.round(a / b * 100) : 0; }
  function md(v){ var p = s(v).split('-'); return p.length === 3 ? (+p[1]) + '/' + (+p[2]) : ''; }
  /* データ＝売上ビューの部品と同じ所（PitFlow では window.state） */
  function S(){ return (w.CFPitSales && w.CFPitSales.data()) || w.state || {}; }
  /* 🔴 課の名前と色は設定の表（state.divisions）から引く。ここに直書きしない（test_pit_rules ③） */
  function divRow(k){ return (S().divisions || []).filter(function (x) { return x && x.id === k; })[0] || null; }
  function divName(k){ var r = divRow(k); return r ? s(r.label) : ''; }
  function divColor(k){ var r = divRow(k); return r ? s(r.color) : ''; }
  function phaseLabel(k){ try { return w.statusLabel ? (w.statusLabel(k) || k) : k; } catch (e) { return k; } }
  var DIVS = [['div1', '国産'], ['div2', '輸入']];

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
                     預かり: '日数の中央値が前月より10%以上短い◎・10%増まで○・30%増まで△', 返車: '作業完了→返車 1台あたり 1日以内◎・1.5日以内○・2.5日以内△',
                     粗利率: '前月比 +2ポイント以上◎・±2ポイント以内○・-5ポイントまで△' };
  function g4(v, a, b, c){ return v == null ? '—' : (v >= a ? '◎' : (v >= b ? '○' : (v >= c ? '△' : '×'))); }
  function gLow(v, a, b, c){ return v == null ? '—' : (v <= a ? '◎' : (v <= b ? '○' : (v <= c ? '△' : '×'))); }
  function gradeOne(sales, lo, hi, unit, unitP, med, medP, wdDays, wdN, gr, grP){
    var r = {};
    var gd = (gr != null && grP != null) ? Math.round((gr - grP) * 10) / 10 : null;
    r.粗利率 = { 評価: g4(gd, 2, -2, -5), 値: (gr == null ? '原価なし' : gr + '%' + (grP == null ? '（前月なし）' : '（前月 ' + grP + '%）')) };
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
                      G.作業完了から返車 ? G.作業完了から返車.のべ日数 : 0, G.作業完了から返車 ? G.作業完了から返車.台数 : 0,
                      G.粗利 ? G.粗利.粗利率 : null, G.粗利 ? G.粗利.前月の粗利率 : null);
    ['div1', 'div2'].forEach(function (k) {
      var D = F.課[k]; if (!D) return;
      o[k] = gradeOne(D.実績, D.目標 && D.目標.min, D.目標 && D.目標.max, D.台単価, D.前月の台単価, D.預かり && D.預かり.中央値, D.前月の預かり中央値,
                      D.作業完了から返車 ? D.作業完了から返車.のべ日数 : 0, D.作業完了から返車 ? D.作業完了から返車.台数 : 0,
                      D.粗利 ? D.粗利.粗利率 : null, D.粗利 ? D.粗利.前月の粗利率 : null);
    });
    return o;
  }
  function gradeHtml(r){
    if (!r) return '';
    return '<div class="air-card">' + ['売上', '単価', '粗利率', '預かり', '返車'].map(function (k) {
      var x = r[k] || { 評価: '—', 値: '' };
      var c = { '◎': 'g1', '○': 'g2', '△': 'g3', '×': 'g4' }[x.評価] || 'g0';
      return '<div class="air-g ' + c + '" title="' + esc(GRADE_RULE[k]) + '"><span>' + k + '</span><b>' + esc(x.評価) + '</b><i>' + esc(x.値) + '</i></div>';
    }).join('') + '</div>';
  }

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
    var dc = HEX(c.課の色);
    return '<span class="air-car" role="button" tabindex="0"' + (dc ? ' style="--dc:' + dc + '"' : '')
         + ' onclick="pitAiRepOpen(\'' + jsq(id) + '\')"><span class="nm">' + esc(c.苗字 + ' ' + c.車種) + '</span>'
         + '<span class="mt">' + esc([c.課, c.フロント].filter(Boolean).join('・')) + '</span></span>';
  }
  function dvChip(label, color){ color = HEX(color); return '<span class="air-dv"' + (color ? ' style="--dc:' + color + '"' : '') + '>' + esc(label) + '</span>'; }
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
    var dColor = HEX(D.色);
    var h = '<h2 class="air-part dv"' + (dColor ? ' style="--dc:' + dColor + '"' : '') + ' id="air-' + k + '">' + esc(D.名前) + '</h2>';
    var lo = D.目標 ? D.目標.min : 0;
    h += '<div class="air-kpis">'
       + kpi('実績（保険を除く）', man(D.実績), '下限 ' + man(lo) + ' に対して ' + pct(D.実績, lo) + '%／前月比 ' + diffTxt(D.実績, D.前月), D.実績 >= lo ? 'up' : 'dn')
       + kpi('台数・台単価', N(D.台数) + '台・' + man(D.台単価), D.大物.length ? '大物を除くと ' + man(D.大物を除く.実績) : '')
       + kpi('預かり日数', '中央値 ' + (D.預かり.中央値 == null ? '—' : N(D.預かり.中央値) + '日'), '平均 ' + (D.預かり.平均 == null ? '—' : N(D.預かり.平均) + '日') + '／のべ ' + N(D.預かり.のべ) + '日')
       + kpi('預かり1日あたりの稼ぎ', yen(D.預かり.一日あたり), D.大物.length ? '大物を除くと ' + yen(D.大物を除く.一日あたり) : '')
       + (D.粗利 ? kpi('粗利', man(D.粗利.粗利) + '・' + N(D.粗利.粗利率) + '%', '1台 ' + man(D.粗利.台あたり) + '／預かり1日 ' + yen(D.粗利.一日あたり)) : '')
       + '</div>' + gradeHtml((F.通知表 || grades(F))[k])
       + (D.粗利 && D.粗利.工賃 ? '<div class="air-mini">粗利の内わけ：工賃 ' + man(D.粗利.工賃.粗利) + '（工賃の ' + N(D.粗利.工賃.粗利率) + '%）／部品 ' + man(D.粗利.部品.粗利) + '（部品の ' + N(D.粗利.部品.粗利率) + '%）'
          + (D.粗利.原価の無い台数 ? '／原価の無い ' + N(D.粗利.原価の無い台数) + '台は外した' : '') + '</div>' : '');

    h += '<section><h3>預かり日数ごとの稼ぎ方' + (D.大物.length ? '<small>（大物は別の行）</small>' : '') + '</h3><table class="air-t"><tr><th>預かり</th><th class="n">台数</th><th class="n">金額</th><th class="n">のべ日数</th><th class="n">1日あたり</th><th class="n">台単価</th><th class="n">粗利率</th><th class="n">1日あたり粗利</th></tr>';
    var best = Math.max.apply(null, D.日数帯.map(function (b) { return b.台数 ? b.一日あたり : 0; }));
    var worst = Math.min.apply(null, D.日数帯.filter(function (b) { return b.台数; }).map(function (b) { return b.一日あたり; }).concat([Infinity]));
    D.日数帯.forEach(function (b) {
      if (!b.台数) return;
      var cls = b.一日あたり === best ? ' class="up"' : (b.一日あたり === worst ? ' class="dn"' : '');
      h += '<tr><td>' + esc(b.帯) + '</td><td class="n">' + N(b.台数) + '台</td><td class="n">' + man(b.金額) + '</td><td class="n">' + N(b.のべ日数) + '日</td><td class="n"><b' + cls + '>' + yen(b.一日あたり) + '</b></td><td class="n">' + man(b.台単価) + '</td><td class="n">' + (b.粗利率 == null ? '—' : N(b.粗利率) + '%') + '</td><td class="n">' + (b.一日あたり粗利 ? yen(b.一日あたり粗利) : '—') + '</td></tr>';
    });
    D.大物.forEach(function (b) {
      h += '<tr class="air-muted"><td>大物 ' + carChip(F, b.id) + '</td><td class="n">1台</td><td class="n">' + man(b.金額) + '</td><td class="n">' + N(b.預かり) + '日</td><td class="n">' + yen(b.一日あたり) + '</td><td class="n">' + man(b.金額) + '</td><td class="n"></td><td class="n"></td></tr>';
    });
    h += '</table>' + paras(F, T.日数帯) + '</section>';

    var phSum = D.工程.reduce(function (x, p) { return x + p.日数; }, 0);
    h += '<section><h3>どの工程で日数を使ったか<small>（PitFlow で状態を動かした記録がある分だけ）</small></h3>';
    if (phSum){
      h += '<div class="air-ph">' + D.工程.map(function (p) { return '<i class="air-pc-' + esc(p.key) + '" style="width:' + (p.日数 / phSum * 100) + '%" title="' + esc(p.工程) + '"></i>'; }).join('') + '</div>'
         + '<div class="air-legend">' + D.工程.map(function (p) { return '<span class="air-pc-' + esc(p.key) + '">' + esc(p.工程) + ' ' + N(p.日数) + '日（' + N(p.台数) + '台・' + N(p.一台あたり) + '日）</span>'; }).join('') + '</div>';
    }
    h += paras(F, T.工程) + '</section>';

    h += '<section><h3>引っぱった車</h3><table class="air-t"><tr><th>車</th><th>作業</th><th class="n">金額</th><th class="n">粗利</th><th class="n">預かり</th><th class="n">1日あたり</th></tr>';
    D.引っぱった車.forEach(function (r) {
      h += '<tr><td>' + carChip(F, r.id) + '</td><td>' + esc(r.作業) + '</td><td class="n">' + man(r.金額) + '</td><td class="n">' + (r.粗利 == null ? '—' : man(r.粗利) + '<i class="air-sub">' + N(r.粗利率) + '%</i>') + '</td><td class="n">' + (r.預かり == null ? '—' : N(r.預かり) + '日') + '</td><td class="n">' + (r.一日あたり == null ? '—' : yen(r.一日あたり)) + '</td></tr>';
    });
    h += '</table>';
    h += '<div class="air-mini">' + D.メーカー.slice(0, 6).map(function (x) { return esc(x.メーカー) + ' ' + N(x.台数) + '台・' + man(x.金額); }).join('　／　') + '</div>';
    h += '<div class="air-mini">' + D.作業.map(function (x) { return esc(x.作業) + ' ' + N(x.台数) + '台・' + man(x.金額) + (x.粗利率 != null ? '（粗利率 ' + N(x.粗利率) + '%）' : ''); }).join('　／　') + '</div>';
    h += paras(F, T.引っぱった車) + '</section>';

    h += '<section><h3>時間がかかった車</h3><table class="air-t"><tr><th>車</th><th class="n">預かり</th><th>どこで止まったか（記録）</th><th>引継ぎメモ</th><th class="n">金額</th><th class="n">1日あたり</th><th class="n">1日あたり粗利</th></tr>';
    D.時間がかかった車.forEach(function (r) {
      var ph = Object.keys(r.工程).sort(function (a, b) { return r.工程[b] - r.工程[a]; }).slice(0, 3)
                 .map(function (p) { return esc(phaseLabel(p)) + ' ' + N(r.工程[p]) + '日'; }).join('・') || '（記録なし）';
      var late = (r.返車予定 && r.完了 > r.返車予定) ? '<br><span class="air-tag r">返車予定 ' + md(r.返車予定) + ' → 完了 ' + md(r.完了) + '</span>' : '';
      h += '<tr><td>' + carChip(F, r.id) + '</td><td class="n"><span class="air-tag ' + (r.預かり >= 31 ? 'r' : 'o') + '">' + N(r.預かり) + '日</span></td><td>' + ph + late + '</td><td class="air-memo">' + esc(r.メモ.いま || '—') + '</td><td class="n">' + man(r.金額) + '</td><td class="n">' + yen(r.一日あたり) + '</td><td class="n">' + (r.一日あたり粗利 == null ? '—' : yen(r.一日あたり粗利)) + '</td></tr>';
    });
    h += '</table><div class="air-mini">返車予定より遅れて完了 ' + N(D.予定遅れ.台数) + '台／作業完了→返車 ' + N(D.作業完了から返車.台数) + '台・のべ ' + N(D.作業完了から返車.のべ日数) + '日（3日以上 ' + N(D.作業完了から返車.三日以上) + '台）</div>';
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
       + D.フロント.map(function (f) { return '<tr><td>' + esc(f.名前) + '</td><td class="n">' + N(f.台数) + '台</td><td class="n">' + man(f.売上) + '</td><td class="n">' + pct(f.売上, D.実績) + '%</td></tr>'; }).join('')
       + '</table><table class="air-t"><tr><th>メカ（複数担当は均等割り）</th><th class="n">台数</th><th class="n">生産</th><th class="n">比率</th></tr>'
       + D.メカ.map(function (f) { return '<tr><td>' + esc(f.名前) + '</td><td class="n">' + N(f.台数) + '台</td><td class="n">' + man(f.生産) + '</td><td class="n">' + pct(f.生産, D.実績) + '%</td></tr>'; }).join('')
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
    h += '<div class="air-toc"><a onclick="pitAiRepJump(\'all\')">全体</a>' + DIVS.map(function (D) { return '<a onclick="pitAiRepJump(\'' + D[0] + '\')">' + esc(F.課[D[0]].名前) + '</a>'; }).join('') + '<a onclick="pitAiRepJump(\'issues\')">全体の課題</a><a onclick="pitAiRepJump(\'future\')">改善した未来</a><a onclick="pitAiRepJump(\'roster\')">スタッフ名簿</a></div>';

    /* 全体 */
    h += '<h2 class="air-part all" id="air-all">全体の総評</h2><div class="air-kpis">'
       + kpi('実行金額（実績）', man(G.実績), N(G.台数) + '台／目標 ' + man(F.目標.下限) + '〜' + man(F.目標.上限))
       + kpi('下限に対して', pct(G.実績, F.目標.下限) + '%', G.実績 >= F.目標.上限 ? '上限も達成' : '上限まで あと' + man(F.目標.上限 - G.実績), G.実績 >= F.目標.下限 ? 'up' : 'dn')
       + kpi('前月', man(G.前月), diffTxt(G.実績, G.前月) + '（' + (G.前月 ? Math.round((G.実績 - G.前月) / G.前月 * 1000) / 10 : 0) + '%）', G.実績 >= G.前月 ? 'up' : 'dn')
       + (G.粗利 ? kpi('粗利（保険を除く）', man(G.粗利.粗利) + '・' + N(G.粗利.粗利率) + '%', '1台 ' + man(G.粗利.台あたり) + '／預かり1日 ' + yen(G.粗利.一日あたり)) : '')
       + kpi('営業日', (G.営業日 == null ? '—' : N(G.営業日) + '日'), '前月 ' + (G.前月営業日 == null ? '—' : N(G.前月営業日) + '日') + '／1日あたり ' + (G.一日あたり ? man(G.一日あたり) : '—') + '（前月 ' + (G.前月一日あたり ? man(G.前月一日あたり) : '—') + '）')
       + '</div>';
    var GR = F.通知表 || grades(F);
    h += gradeHtml(GR.全体);
    h += '<table class="air-t"><tr><th></th><th class="n">実績</th><th class="n">目標（下限〜上限）</th><th class="n">下限に対して</th><th class="n">前月</th><th class="n">台数</th><th class="n">台単価</th><th class="n">預かり（中央値）</th></tr>';
    DIVS.forEach(function (D) {
      var x = F.課[D[0]];
      h += '<tr><td>' + dvChip(x.短い名前, x.色) + ' ' + D[1] + '</td><td class="n">' + man(x.実績) + '</td><td class="n">' + man(x.目標.min) + '〜' + man(x.目標.max) + '</td><td class="n"><b class="' + (x.実績 >= x.目標.min ? 'up' : 'dn') + '">' + pct(x.実績, x.目標.min) + '%</b></td><td class="n">' + man(x.前月) + '</td><td class="n">' + N(x.台数) + '台</td><td class="n">' + man(x.台単価) + '</td><td class="n">' + (x.預かり.中央値 == null ? '—' : N(x.預かり.中央値) + '日') + '</td></tr>';
    });
    h += '</table>' + cumSvg(F);
    h += '<div class="air-sum">' + paras(F, A.総評) + '</div>';

    var I = F.保険;
    /* 🛡 v2.137.0 保険を除いた「自分たちで仕上げた数字」を先頭に */
    var own = DIVS.map(function (D) {
      var x = F.課[D[0]], ins = (I.課ごと && I.課ごと[D[0]]) || 0;
      return '<div class="air-own">' + dvChip(x.短い名前, x.色) + ' <b>' + man(x.実績) + '</b><span>目標の下限の ' + pct(x.実績, x.目標.min) + '%'
           + (ins ? '・保険 ' + man(ins) + ' は別' : '') + '</span></div>';
    }).join('');
    h += '<div class="air-bonus"><h3>保険（ボーナス枠）</h3><div class="air-own-h">保険を除いた、自分たちで仕上げた数字</div><div class="air-owns">' + own + '</div><table class="air-t">'
       + '<tr><th>この月の実績に入った保険</th><td>' + (I.実績に入った.length ? I.実績に入った.map(function (x) { return carChip(F, x.id) + ' ' + man(x.金額); }).join('　')
           + (G.粗利 && G.粗利.保険の粗利率 != null ? '<div class="air-mini">粗利 ' + man(G.粗利.保険の粗利) + '（粗利率 ' + N(G.粗利.保険の粗利率) + '%）</div>' : '') : '0台') + '</td></tr>'
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
         + '<div>空く預かり日数<b>約' + N(u.空く日数) + '日</b>のべ ' + N(F.課[D[0]].預かり.のべ) + '日の ' + pct(u.空く日数, F.課[D[0]].預かり.のべ) + '%</div>'
         + '<div>いつも空いている置き場<b>約' + N(u.空く置き場) + '台分</b></div>'
         + '<div>大物なしの実績の見込み<b>約' + man(u.見込み) + '</b>いまは ' + man(F.課[D[0]].大物を除く.実績) + (u.伸ばせる粗利 ? '／粗利では +約' + man(u.伸ばせる粗利) : '') + '</div></div>'
         + paras(F, Fu[D[0]])
         + '<div class="how">計算：作業完了→返車を1日まで（' + N(u.内訳.作業完了から返車) + '日）＋8〜14日の仕事を7日に（' + N(u.内訳.中くらいの仕事) + '日）＋31日以上（大物を除く）を30日で区切る（' + N(u.内訳.長期預かり) + '日）。空いた日数 × この課の1日あたり（大物を除く）' + yen(F.課[D[0]].大物を除く.一日あたり) + '。</div></div>';
    });
    var Fa = F.未来;
    h += '<div class="air-fut all"><h3>全体の改善した未来</h3><div class="big">'
       + '<div>空く預かり日数<b>約' + N(Fa.空く日数) + '日</b></div>'
       + '<div>いつも空いている置き場<b>約' + N(Fa.空く置き場) + '台分</b></div>'
       + '<div>大物なしの地力<b>' + man(G.地力) + ' → 約' + man(Fa.見込み) + '</b>下限 ' + man(F.目標.下限) + (Fa.伸ばせる粗利 ? '／粗利では +約' + man(Fa.伸ばせる粗利) : '') + '</div></div>'
       + paras(F, Fu.全体)
       + '<div class="how">⚠ 伸ばせる売上は、予約は基本いっぱい＝空いた枠はそのまま次の車に回せる、という前提で数えています。月をまたいだ車の分は月の入れ替わりで相殺されるので足していません。</div></div></div>';

    h += rosterHtml(F);
    h += '<div class="air-foot"><b>このレポートが使ったもの</b>（書き出した時点の PitFlow のデータ）<ul>'
       + '<li>実績＝売上ビューと同じ数え方。課＝カードの課。メーカーは BMW の MINI と MINI をまとめて「MINI」</li>'
       + '<li>目標＝書き出した時点の月目標（下限 ' + man(F.目標.下限) + '・上限 ' + man(F.目標.上限) + '・国産 ' + N(F.目標.国産の割合) + '%）</li>'
       + '<li>板金（作業タイプ B.P）の車は、預かり日数を使う数字（1日あたり・日数帯・時間がかかった車・作業完了→返車・空く日数）から外した（売上・粗利の合計には入れている）</li>'
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
    /* 🧩 名前は借りる側が渡せる（CFPitAiRep.setup({ me })）。無ければ PitFlow のログインの名前 */
    try { var me = t(CFG.me ? CFG.me() : (w.pitFlowMe ? w.pitFlowMe() : '')); return MTG_VIEWERS.indexOf(me) >= 0; } catch (e) { return false; }
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
    var mc = (k !== '全体' && F.課[k]) ? HEX(F.課[k].色) : '';
    var color = mc ? ' style="--dc:' + mc + '"' : '';
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

  /* 👥 スタッフ名簿（この月の結果）。数字は PitFlow が数えたまま（AI は書かない）
     👥 v2.138.0 共通のアバター（CFUser：写真が無ければ頭文字）・部署と入社は出さない・組ごとに見出し・列のいちばんに★ */
  function avatarOf(o){
    var m = null;
    if (o.id){
      m = (S().staff || []).filter(function (p) { return p && (t(p.cmId) === o.id || t(p.id) === o.id); })[0] || null;
      if (!m) Object.keys(w.PIT_FORMER || {}).forEach(function (k) { var f = w.PIT_FORMER[k]; if (!m && f && (t(f.cmId) === o.id || t(f.id) === o.id)) m = f; });
    }
    var U2 = w.CFUser, ph = (U2 && m) ? okSrc(U2.photo(m)) : '', ini = U2 ? U2.initials(o.本名 || o.名前, m) : t(o.名前).slice(0, 2);
    return '<span class="air-av">' + (ph ? '<img src="' + esc(ph) + '" alt="" onerror="this.remove()">' : '') + '<b>' + esc(ini) + '</b></span>';
  }
  function rosterHtml(F){
    var L = (F.人 && F.人.名簿) || [];
    if (!L.length) return '';
    var GNAME = { div1: divName('div1'), div2: divName('div2'), recept: '受付', other: '車販・回送', self: 'そのほか' };
    var GCOL = { div1: HEX(divColor('div1')), div2: HEX(divColor('div2')) };
    var top = {}; ['予約件数', '車検ライン', 'フロント台数', 'メカ台数'].forEach(function (k) {
      top[k] = Math.max.apply(null, L.filter(function (o) { return !o.会社; }).map(function (o) { return o[k] || 0; }).concat([0])); });
    function c(o, k, sub){
      var v = o[k] || 0;
      if (!v) return '<td class="n"><span class="air-muted">—</span></td>';
      return '<td class="n"><span' + (v === top[k] ? ' class="air-top"' : '') + '>' + N(v) + (sub ? '台' : '') + '</span>' + (sub ? '<i>' + man(o[sub]) + '</i>' : '') + '</td>';
    }
    var ppl = L.filter(function (o) { return !o.会社 && !o.名簿にない; });
    var sum = function (k) { return L.reduce(function (x, o) { return x + (o[k] || 0); }, 0); };
    var h = '<h2 class="air-part all" id="air-roster">スタッフ名簿（この月の結果）</h2>'
          + '<div class="air-rsum"><span><b>' + ppl.length + '人</b>在籍' + (ppl.filter(function (o) { return o.退職; }).length ? '（うち退職 ' + ppl.filter(function (o) { return o.退職; }).length + '人）' : '') + '</span>'
          + '<span><b>' + N(sum('予約件数')) + '件</b>予約を受けた</span><span><b>' + N(sum('車検ライン')) + '回</b>車検ライン</span><span><b>' + N(F.全体 ? F.全体.台数 : sum('フロント台数')) + '台</b>実績</span></div>'
          + '<table class="air-t air-roster"><tr><th>名前</th><th>役割</th><th class="n">予約件数<small>受付</small></th><th class="n">車検ライン<small>回送</small></th>'
          + '<th class="n">フロント<small>売上台数</small></th><th class="n">メカ<small>売上台数</small></th></tr>';
    var cur = '';
    L.forEach(function (o) {
      if (o.組 !== cur){
        cur = o.組;
        h += '<tr class="air-rg"><td colspan="6">' + (GCOL[cur] ? '<span class="dot" style="background:' + esc(GCOL[cur]) + '"></span>' : '') + esc(GNAME[cur] || '') + '</td></tr>';
      }
      var sub = o.会社 ? '担当を人にしなかった分' : (o.本名 && o.本名 !== o.名前 ? o.本名 : '');
      h += '<tr' + (o.退職 ? ' class="air-former"' : '') + '><td><div class="air-who">' + (o.会社 ? '<span class="air-av co"><b>会社</b></span>' : avatarOf(o))
         + '<div><b>' + esc(o.名前) + '</b>' + (o.退職 ? '<span class="air-tag r">' + esc(md(o.退職)) + ' 退職</span>' : '') + (o.名簿にない ? '<span class="air-tag">名簿にない</span>' : '')
         + (sub ? '<span class="sub">' + esc(sub) + '</span>' : '') + '</div></div></td>'
         + '<td><div class="air-roles">' + (o.役割 || []).map(function (r) { return '<i>' + esc(r) + '</i>'; }).join('') + '</div></td>'
         + c(o, '予約件数') + c(o, '車検ライン') + c(o, 'フロント台数', 'フロント売上') + c(o, 'メカ台数', 'メカ生産') + '</tr>';
    });
    return h + '</table><div class="air-mini">予約件数＝この月に予約を受けた件数（受付の担当）／車検ライン＝陸運局へ行った回数（1人目）／フロント・メカ＝この月の実績の台数と金額（メカの金額は複数担当なら均等割り）／★＝その列でいちばん多い人</div>';
  }

  /* ================================================================
     🧩 2026-10-20 借りる側（MHS）の「その月のAIレポート」＝読んで描くだけ
     ・書き出す・書き出し直す・締めを確かめるは PitFlow だけ（ここにボタンは無い）
     ・読み方は PitFlow と同じ＝このパソコンの控えがあれば即表示 → 裏で本物（pitSettings/aireport-YYYY-MM）を読み直す
     ================================================================ */
  var MEM = {};
  function nowYm(){ var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function ckey(co, ym){ return 'pitAiRep:' + ((co && co.id) || '') + ':' + ym; }
  function cacheGet(k){ try { var v = w.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function cachePut(k, body){ try { if (body) w.localStorage.setItem(k, JSON.stringify(body)); else w.localStorage.removeItem(k); } catch (e) {} }
  function month(wrap, head, y, m0, opt){
    opt = opt || {};
    var ym = y + '-' + pad(m0 + 1), mm = m0 + 1, U = MEM[ym] || (MEM[ym] = {});
    var co = null; try { co = opt.company ? opt.company() : null; } catch (e) { co = null; }
    if (!U.loaded && !U.loading){
      if (!(ym < nowYm()) || !co){ U.saved = null; U.loaded = true; }     /* いまの月・先の月＝レポートは無い */
      else {
        U.loading = true;
        var k = ckey(co, ym), cached = cacheGet(k);
        if (cached && cached.数字){ U.saved = cached; U.loaded = true; }
        co.collection('pitSettings').doc('aireport-' + ym).get().then(function (sn) {
          var sv = sn.exists ? sn.data() : null;
          U.loading = false; U.err = '';
          var changed = !U.loaded || s(U.saved && U.saved.書き出した日時) !== s(sv && sv.書き出した日時);
          cachePut(k, sv && sv.数字 ? sv : null);
          U.saved = (sv && sv.数字) ? sv : null; U.loaded = true;
          if (changed && opt.rerender) opt.rerender();
        }).catch(function (e) {
          U.loading = false;
          if (!U.loaded){ U.loaded = true; U.saved = null; U.err = s(e && e.message); if (opt.rerender) opt.rerender(); }
        });
      }
    }
    var h = head;
    if (!U.loaded) h += '<div class="sv-card"><div class="sv-empty">読み込んでいます…</div></div>';
    else if (U.saved && U.saved.数字) h += html(U.saved) + mtgHtml(U.saved);
    else {
      if (U.err) h += '<div class="air-err">' + esc(U.err) + '</div>';
      h += '<div class="sv-card"><div class="sv-empty">'
         + (!(ym < nowYm()) ? mm + '月はまだ途中です。月が終わって Q1〜Q4 を締めたあとに書き出せます。'
                            : mm + '月のレポートはまだありません。管理者が書き出すと、ここに出ます。')
         + '</div></div>';
    }
    wrap.innerHTML = h;
  }

  /* 目次の飛び先・車の1行（PitFlow の中では sales-ai.js がカードの詳細を開く物で上書きする） */
  w.pitAiRepJump = function (k){ var el = document.getElementById('air-' + k); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  if (!w.pitAiRepOpen) w.pitAiRepOpen = function (id){ w.open(PIT + '/?card=' + encodeURIComponent(id), '_blank', 'noopener'); };

  function html(R){ return reportHtml(R); }
  w.CFPitAiRep = {
    setup: function (opt){ opt = opt || {}; Object.keys(opt).forEach(function (k) { CFG[k] = opt[k]; }); return w.CFPitAiRep; },
    html: html,
    mtgHtml: mtgHtml,
    grades: grades,
    gradeHtml: gradeHtml,
    month: month,
    forget: function (ym){ Object.keys(MEM).forEach(function (k) { if (!ym || k === ym) delete MEM[k]; }); }
  };
})(window);
