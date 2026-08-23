/* ================================================================================
   quarter.js  -  🧾 クォーターチェックの**画面**  PitFlow v1.181.0
   ================================================================================
   ◎ここが受け持つこと ＝ **並べて見せるだけ。**
     🔴 読み取りは `quarter-pdf.js`／突き合わせは `quarter-match.js`。
        **ここに判定を1行も書かないこと**（画面と物差しが食い違ったら直しようがなくなる）。

   ◎使い方（ゆうた）
     ① データチェック →「クォーターチェック」
     ② 期間を決める（既定＝いまのクォーター。先週・先々週もボタン1つ）
     ③ 整備ソフトから出した**売上チェックリストPDF**を選ぶ
     ④ 合計が合っているかを見る → 合っていなければ、下の一覧を1件ずつ片づける

   ◎🔴🔴 いちばん大事な決めごと
     🔴 **合計が合うまで数字を出さない。**
        PDF の読み取りが自己検証（総合計・合計枚数）に落ちたら、
        **数字を1つも出さずに「読み取りに失敗した」と言う。**
        黙って部分的な数字を出すのが、いちばん危ない。
     🔴 **PDF は外に出ない。** 読むのはブラウザの中だけ。

   ◎出す順番（2026-08-08 の実データで決めた「効く順」）
     ① まとめて返車済みにした日（＝先週の売上が今週に落ちている本命）
     ② 金額ちがい ③ 月またぎ ④ Qまたぎ ⑤ 整備ソフトだけ ⑥ PitFlowだけ
   ================================================================================ */
(function (w) {
  'use strict';

  function esc(x){ return String(x==null?'':x).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }
  function s(v){ return String(v == null ? '' : v); }
  function t(v){ return s(v).trim(); }
  function yen(n){ return (+n || 0).toLocaleString(); }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function ymd(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function shift(v, n){ var p = s(v).split('-'); if (p.length !== 3) return ''; var d = new Date(+p[0], +p[1]-1, +p[2]); d.setDate(d.getDate()+n); return ymd(d); }

  /* 画面の覚え（データではないので保存しない） */
  function Q(){
    var U = w._insp = w._insp || {};
    U.q = U.q || { from:'', to:'', res:null, pdf:null, tab:'lump', busy:'', err:'' };
    if (!U.q.from){
      /* 既定＝いまのクォーター。⚠ 区切りは sales.js の1本から借りる */
      var q = w.pitQuarterOf ? w.pitQuarterOf() : null;
      if (q){ U.q.from = q.s; U.q.to = q.e; }
    }
    return U.q;
  }

  /* ================================================================
     期間のボタン（いま／1つ前／2つ前）
     ⚠ 区切りの計算は pitQuarterOf に任せる。ここで 1-7／8-15 と書かない。
     ================================================================ */
  function qBack(n){
    var q = w.pitQuarterOf ? w.pitQuarterOf() : null;
    if (!q) return null;
    var cur = q;
    for (var i = 0; i < n; i++){
      var prev = shift(cur.s, -1);            /* 1つ前のQの最終日 */
      cur = w.pitQuarterOf(prev);
    }
    return cur;
  }

  /* ================================================================
     画面
     ================================================================ */
  w.pitQuarterHtml = function (){
    var U = Q();
    var h = '';

    /* ⚠ 見出し（「② 売上チェックリストPDFとの突合」）は器（inspect.js）が出している。
       ここで**もう一度出さない**（同じ字が2つ並ぶ）。 */
    h += '<div class="q-head">'
       +   '<div class="q-sub">整備ソフトから出した <b>売上チェックリストPDF</b> と、PitFlow の実績を1台ずつ突き合わせます。'
       +     '<b>PDF はこのパソコンの中だけで読みます</b>（どこにも送りません）。</div>'
       + '</div>';

    /* ---- 期間 ---- */
    h += '<div class="q-range">'
       +   '<span class="q-l">期間</span>'
       +   '<input class="q-in" type="date" id="q-from" value="' + esc(U.from) + '" onchange="pitQSetRange(this.value, null)">'
       +   '<span class="q-tilde">〜</span>'
       +   '<input class="q-in" type="date" id="q-to" value="' + esc(U.to) + '" onchange="pitQSetRange(null, this.value)">'
       +   '<span class="q-quick">';
    [0,1,2].forEach(function (n) {
      var q = qBack(n); if (!q) return;
      var on = (U.from === q.s && U.to === q.e);
      h += '<button class="q-qb' + (on ? ' on' : '') + '" onclick="pitQSetRange(\'' + q.s + '\',\'' + q.e + '\')">'
         + esc(n === 0 ? 'いまのQ' : (n === 1 ? '1つ前' : '2つ前')) + '<span>' + esc(q.label) + '</span></button>';
    });
    h += '</span></div>';

    /* ---- PDF を選ぶ ---- */
    h += '<div class="q-pick">'
       +   '<label class="q-file">'
       +     '<input type="file" accept="application/pdf,.pdf" onchange="pitQPickFile(this)">'
       +     '<span><i data-ic=box data-ics=16></i> 売上チェックリストPDF を選ぶ</span>'
       +   '</label>'
       +   (U.pdf ? '<span class="q-fname">' + esc(U.pdf) + '</span>' : '')
       +   (U.busy ? '<span class="q-busy">' + esc(U.busy) + '</span>' : '')
       + '</div>';

    if (U.err){
      h += '<div class="q-ng"><b>読み取りに失敗しました。</b>'
         +   '<div class="q-ng-why">' + esc(U.err) + '</div>'
         +   '<div class="q-ng-note">🔴 <b>数字は出しません。</b>合計が合わないまま出すと、'
         +     '「合っている」と嘘をつくことになります。'
         +     '整備ソフトの帳票の形が変わった時も、ここで止まります。この文をそのまま伝えてください。</div>'
         + '</div>';
      return h;
    }
    if (!U.res) {
      h += '<div class="q-empty">PDF を選ぶと、ここに突き合わせの結果が出ます。<br>'
         +   '<span>読み取れた枚数と総合計が PDF と合っているかを、まず自分で確かめます。'
         +   '合わなければ数字は出しません。</span></div>';
      return h;
    }

    var R = U.res;
    /* ---- 合計 ---- */
    var ok = R.検算.合う;
    h += '<div class="q-sum' + (ok ? '' : ' bad') + '">'
       +   '<div class="q-card"><span class="q-k">整備ソフト</span>'
       +     '<b>' + R.整備ソフト.枚数 + '</b>台<span class="q-y">' + yen(R.整備ソフト.金額) + '円</span></div>'
       +   '<div class="q-card"><span class="q-k">PitFlow</span>'
       +     '<b>' + R.PitFlow.台数 + '</b>台<span class="q-y">' + yen(R.PitFlow.金額) + '円</span></div>'
       +   '<div class="q-card q-diff"><span class="q-k">差</span>'
       +     '<b>' + (R.差.台数 > 0 ? '+' : '') + R.差.台数 + '</b>台'
       +     '<span class="q-y">' + (R.差.金額 > 0 ? '+' : '') + yen(R.差.金額) + '円</span></div>'
       + '</div>';

    /* ---- 検算（🔴 合わなければ、そう言う） ---- */
    h += '<div class="q-audit' + (ok ? ' ok' : ' ng') + '">'
       +   (ok
            ? '<b>差額の内訳が、実際の差とぴったり合いました。</b><span>取りこぼしはありません。</span>'
            : '<b>差額の内訳が、実際の差と合いません（' + yen(R.検算.ずれ) + '円ぶん）。</b>'
              + '<span>どこかを取りこぼしています。この画面の数字は当てにしないでください。</span>')
       +   '<div class="q-parts">'
       +     part('整備ソフトだけにある', R.内訳.整備ソフトだけ)
       +     part('PitFlow だけにある',   R.内訳.PitFlowだけ)
       +     part('期間の外に立っている', R.内訳.期間の外)
       +     part('金額そのもののちがい', R.内訳.金額ちがい)
       +   '</div>'
       + '</div>';

    /* ---- 🔴 まとめて返車済みにした日（本命） ---- */
    if (R.まとめ返車 && R.まとめ返車.length){
      h += '<div class="q-lump"><b><i data-ic=warn data-ics=16></i> まとめて返車済みにした日があります</b>';
      R.まとめ返車.forEach(function (x) {
        h += '<div class="q-lump-r">' + esc(x.日) + ' に <b>' + x.台数 + '台</b>（' + yen(x.金額) + '円）が固まっています</div>';
      });
      h += '<div class="q-lump-n">週明けにまとめて返車済みにすると、<b>先週の売上が今週に落ちます</b>。'
         + 'この日の車は、実際に返した日に直すか、そのままでよいかを1件ずつ決めてください。</div></div>';
    }

    /* ---- タブ ---- */
    var TABS = [
      { id:'lump',   label:'期間の外',        n: R.内訳.期間の外.台数 },
      { id:'amt',    label:'金額ちがい',      n: R.金額ちがい.length },
      { id:'month',  label:'月またぎ',        n: R.月またぎ.length },
      { id:'qq',     label:'Qまたぎ',         n: R.Qまたぎ.length },
      { id:'soft',   label:'整備ソフトだけ',  n: R.整備ソフトだけ.length },
      { id:'pit',    label:'PitFlowだけ',     n: R.PitFlowだけ.length },
      { id:'all',    label:'結びついた全件',  n: R.結びついた.length }
    ];
    h += '<div class="q-tabs">';
    TABS.forEach(function (x) {
      h += '<button class="q-tab' + (U.tab === x.id ? ' on' : '') + '" onclick="pitQTab(\'' + x.id + '\')">'
         + esc(x.label) + '<span>' + x.n + '</span></button>';
    });
    h += '<button class="q-print" onclick="window.print()">印刷</button>';
    h += '</div>';

    h += '<div class="q-body">' + table(R, U.tab) + '</div>';
    return h;
  };

  function part(label, v){
    return '<div class="q-part"><span>' + esc(label) + '</span><b>' + (v.金額 > 0 ? '+' : '') + yen(v.金額) + '</b>'
         + '<i>' + v.台数 + '台</i></div>';
  }

  /* ================================================================
     一覧
     ⚠ 中身の言葉（同じQ内／Qまたぎ／月またぎ）は **物差しが返したもの**をそのまま出す。
        ここで綴り直さない。
     ================================================================ */
  function table(R, tab){
    if (tab === 'soft')  return softTable(R.整備ソフトだけ);
    if (tab === 'pit')   return pitTable(R.PitFlowだけ);
    var rows = tab === 'amt'   ? R.金額ちがい
             : tab === 'month' ? R.月またぎ
             : tab === 'qq'    ? R.Qまたぎ
             : tab === 'lump'  ? R.結びついた.filter(function (p) { return p.期間の外; })
             : R.結びついた;
    if (!rows.length) return '<div class="q-none">0件です。</div>';
    var h = '<table class="q-t"><thead><tr>'
          + '<th>ナンバー／お客様</th><th>整備ソフト<br>売上日</th><th>PitFlow<br>数える日</th>'
          + '<th>日付</th><th class="n">整備ソフト</th><th class="n">PitFlow</th><th class="n">差</th>'
          + '<th>受付担当<br>フロント</th><th>結び方</th></tr></thead><tbody>';
    rows.forEach(function (p) {
      var cls = p.日付.kind === 'crossMonth' ? 'bad' : (p.日付.kind === 'crossQ' ? 'warn' : (p.日付.kind === 'sameQ' ? 'ok' : ''));
      h += '<tr>'
         + '<td>' + esc(p.soft.ナンバー) + '<span class="q-s">' + esc(p.soft.顧客名) + '</span></td>'
         + '<td>' + esc(p.soft.売上日) + '<span class="q-s">伝票 ' + esc(p.soft.伝票) + '</span></td>'
         + '<td>' + esc(p.pit.数える日) + '<span class="q-s">' + esc(p.pit.予約番号) + '</span></td>'
         + '<td class="' + cls + '">' + esc(p.日付.label) + '</td>'
         + '<td class="n">' + yen(p.soft.金額) + '</td>'
         + '<td class="n">' + yen(p.pit.確定金額) + '</td>'
         + '<td class="n ' + (p.金額一致 ? 'ok' : 'bad') + '">' + (p.差 > 0 ? '+' : '') + yen(p.差) + '</td>'
         + '<td>' + esc(p.soft.受付担当) + '<span class="q-s">' + esc(p.pit.フロント担当) + '</span></td>'
         + '<td class="q-s">' + esc(p.結び方) + '</td>'
         + '</tr>';
    });
    return h + '</tbody></table>';
  }

  function softTable(list){
    if (!list.length) return '<div class="q-none">0件です。</div>';
    var h = '<div class="q-note">整備ソフトで売上が立っているのに、PitFlow の実績に無いものです。'
          + '<b>カードは有る</b>＝まだ返車済みにしていないだけ。</div>'
          + '<table class="q-t"><thead><tr><th>売上日</th><th>伝票</th><th>ナンバー</th><th>お客様</th>'
          + '<th class="n">金額</th><th>受付担当</th><th>PitFlow 側</th></tr></thead><tbody>';
    list.forEach(function (r) {
      var c = r.カード;
      h += '<tr>'
         + '<td>' + esc(r.soft.売上日) + '</td><td>' + esc(r.soft.伝票) + '</td>'
         + '<td>' + esc(r.soft.ナンバー) + '</td><td>' + esc(r.soft.顧客名) + '</td>'
         + '<td class="n">' + yen(r.soft.金額) + '</td><td>' + esc(r.soft.受付担当) + '</td>'
         + '<td>' + (c
              ? '<b>カードは有る</b><span class="q-s">' + esc(c.予約番号) + '／' + esc(c.状態) + '／返車 ' + esc(c.返車日 || '—') + '</span>'
                + (c.生 && c.生.id ? ' <button class="q-open" onclick="pitInspectGo(\'' + esc(c.生.id) + '\')">開く</button>' : '')
              : 'PitFlow に見当たりません')
         + '</td></tr>';
    });
    return h + '</tbody></table>';
  }

  function pitTable(list){
    if (!list.length) return '<div class="q-none">0件です。</div>';
    var h = '<div class="q-note">PitFlow に実績があるのに、PDF に載っていないものです。'
          + '🔴 <b>整備ソフトは PitFlow から直せません。</b>印刷して、整備ソフト側で直してください。</div>'
          + '<table class="q-t"><thead><tr><th>数える日</th><th>予約番号</th><th>ナンバー</th><th>お客様</th>'
          + '<th class="n">確定金額</th><th>フロント</th><th></th></tr></thead><tbody>';
    list.forEach(function (r) {
      h += '<tr><td>' + esc(r.数える日) + '</td><td>' + esc(r.予約番号) + '</td>'
         + '<td>' + esc(r.ナンバー) + '</td><td>' + esc(r.顧客名) + '</td>'
         + '<td class="n">' + yen(r.確定金額) + '</td><td>' + esc(r.フロント担当) + '</td>'
         + '<td>' + (r.生 && r.生.id ? '<button class="q-open" onclick="pitInspectGo(\'' + esc(r.生.id) + '\')">開く</button>' : '') + '</td></tr>';
    });
    return h + '</tbody></table>';
  }

  /* ================================================================
     ボタンの受け口
     ================================================================ */
  w.pitQSetRange = function (from, to){
    var U = Q();
    if (from) U.from = from;
    if (to) U.to = to;
    U.res = null;                       /* 期間が変わったら結果は捨てる（古い数字を残さない） */
    if (w.renderInspect) renderInspect();
  };
  w.pitQTab = function (id){ Q().tab = id; if (w.renderInspect) renderInspect(); };

  w.pitQPickFile = function (el){
    var U = Q();
    var f = el && el.files && el.files[0];
    if (!f) return;
    U.pdf = f.name; U.err = ''; U.res = null; U.busy = '読んでいます…';
    if (w.renderInspect) renderInspect();

    w.pitQPdfRead(f, function (i, n) {
      U.busy = '読んでいます… ' + i + ' / ' + n + ' ページ';
      var b = document.querySelector('.q-busy'); if (b) b.textContent = U.busy;
    }).then(function (r) {
      U.busy = '';
      /* 🔴 自己検証に落ちたら、数字を1つも出さない */
      if (!r.ok){
        U.err = (r.検証.言い分 || []).join('／') || '読み取れませんでした';
        if (w.renderInspect) renderInspect();
        return;
      }
      var soft = r.伝票.map(function (x) {
        return { 売上日:x.売上日, 伝票:x.伝票, ナンバー:x.ナンバー, 顧客名:x.顧客名,
                 車種:x.車種, 金額:x.比べる金額, 受付担当:x.受付担当 };
      });
      var pit = w.pitQCollect({ from: U.from, to: U.to }).明細;
      U.res = w.pitQMatch(soft, pit, { from: U.from, to: U.to });
      U.tab = 'lump';
      if (w.renderInspect) renderInspect();
      if (w.pitToast) pitToast(r.伝票.length + '枚を読みました（総合計・枚数とも一致）');
    }).catch(function (e) {
      U.busy = '';
      U.err = s(e && e.message ? e.message : e);
      if (w.renderInspect) renderInspect();
    });
  };
})(window);
