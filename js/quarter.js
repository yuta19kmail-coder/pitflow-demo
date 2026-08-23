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
    U.q = U.q || { from:'', to:'', res:null, pdf:null, tab:'lump', busy:'', err:'',
                   /* 🗄 v1.184.0 残した結果まわり（画面の覚え。データではないので保存しない） */
                   list:null, listBusy:false, saved:null, savedId:'', savedTab:'期間の外',
                   ym:'', savedAt:'',
                   /* 🛠 v2.0.0 その場で直すため。
                      soft ＝ 読み終わった伝票（**PDFを読み直さずに数え直す**ために抱えておく）
                      marks ＝「伝票側を直した」の印（読み込みは1回だけ） */
                   soft:null, marks:null, marksBusy:false, saveTimer:0 };
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

    ensureMarks();      /* 🛠 v2.0.0 「伝票を直した」の印（読むのは1回だけ） */

    /* ---- 🗄 v1.184.0 その月の Q1〜Q4（ルーティンの形） ---- */
    h += planRow(U);

    /* ---- PDF を選ぶ／放り込む ----
       🔴 v1.184.0（ゆうた指定）**ドラッグで入れられるようにする。**
       ⚠ 押して選ぶ道は残す（ドラッグが苦手な人・スマホのため）。 */
    h += '<div class="q-pick" id="q-drop"'
       +   ' ondragover="pitQDrag(event,1)" ondragenter="pitQDrag(event,1)"'
       +   ' ondragleave="pitQDrag(event,0)" ondrop="pitQDrop(event)">'
       +   '<label class="q-file">'
       +     '<input type="file" accept="application/pdf,.pdf" onchange="pitQPickFile(this)">'
       +     '<span><i data-ic=box data-ics=16></i> 売上チェックリストPDF を選ぶ'
       +       '<small>（ここに<b>ドラッグ</b>しても入ります）</small></span>'
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
    /* 🗄 v1.184.0 残してあった結果を開いている時（PDFを読まずに見返している） */
    if (!U.res && U.saved) return h + savedHtml(U);

    if (!U.res) {
      h += '<div class="q-empty">PDF を選ぶ（またはドラッグで放り込む）と、ここに突き合わせの結果が出ます。<br>'
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

    /* ---- 🗄 v1.184.0 残したかどうかを、黙らずに言う ---- */
    if (w.PIT_CLOUD){
      h += '<div class="q-saved">'
         +   (U.savedAt
              ? '<b>この結果を残しました</b>（' + esc(U.savedAt) + '）。上の Q' + 'の印からいつでも見返せます。'
                + '<span>同じ期間をもう一度やると、新しい方に置きかわります。</span>'
              : '<span>結果を残しています…</span>')
         + '</div>';
    }

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
    /* 🛠 v2.0.0 タブの数字＝**まだ片づいていない行**。
       ・「直す」を押した行 … カードが変わるので、数え直した時点でズレ自体が消える
       ・「伝票を直した」の印が付いた行 … カードは変えていないのでズレは残るが、**片づいたもの**として数えない
       🔴 **印では合計・差・内訳・検算を動かさない。** PDF が言っている数字は「事実」であって、
          印は「人がもう手を打った」という別の話。ここを混ぜると検算が意味を失う。 */
    var left = function (rows) {
      if (!w.pitQRowLeft) return (rows || []).length;
      return (rows || []).filter(function (p) { return w.pitQRowLeft(p) > 0; }).length;
    };
    var TABS = [
      { id:'lump',   label:'期間の外',        n: left(R.結びついた.filter(function (p) { return p.期間の外; })) },
      { id:'amt',    label:'金額ちがい',      n: left(R.金額ちがい) },
      { id:'month',  label:'月またぎ',        n: left(R.月またぎ) },
      { id:'qq',     label:'Qまたぎ',         n: left(R.Qまたぎ) },
      /* 💴 v1.185.0 カードの売上日が伝票の日とちがう。**お金は動かない**（直すのは日付だけ）ので、
         金額ちがいとは別の欄にする。⚠ 売上日を持っていないカードはここに出ない。 */
      { id:'sdate',  label:'売上日ちがい',    n: left(R.売上日ちがい || []) },
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

  /* ================================================================
     🗄 その月の Q1〜Q4（ルーティンの形・v1.184.0）
     ----------------------------------------------------------------
     🗣「落ち着いてきたら 月始まり → Q1〜4 でそれぞれ付け合わせ、みたいなルーティン化する予定」
     🔴 **どれが済んでいて、どれがまだか**を、いちばん上で見えるようにする。
     🔴 区切りは `pitQuarterOf` 1本（quarter-store.js の `pitQMonthPlan` が借りている）。
     ⚠ 済んだものは押すと**残してある結果**が開く（PDFは要らない）。
     ================================================================ */
  function planRow(U){
    if (!w.pitQMonthPlan) return '';
    if (!w.PIT_CLOUD){
      return '<div class="q-plan-off">練習用サイトでは、結果も「伝票を直した」の印も残りません（本番の PitFlow では残ります）。</div>';
    }
    if (U.list == null){
      if (!U.listBusy){ U.listBusy = true; ensureList(); }
      return '<div class="q-plan-off">これまでの突き合わせを読んでいます…</div>';
    }
    var ym = t(U.ym) || (t(U.from).slice(0, 7));
    var plan = w.pitQMonthPlan(ym, U.list);
    var head = ym ? (ym.split('-')[0] + '年 ' + (+ym.split('-')[1]) + '月') : '今月';
    var h = '<div class="q-plan">'
          + '<div class="q-plan-h">'
          +   '<button class="q-mv" onclick="pitQMonth(-1)">‹</button>'
          +   '<b>' + esc(head) + ' の突き合わせ</b>'
          +   '<button class="q-mv" onclick="pitQMonth(1)">›</button>'
          + '</div><div class="q-plan-b">';
    plan.forEach(function (x) {
      var r = x.run;
      var cls = r ? (r.検算 ? ' done' : ' ng') : '';
      h += '<button class="q-pq' + cls + '" onclick="pitQOpenPlan(\'' + x.from + '\',\'' + x.to + '\')">'
         +   '<span class="q-pq-t">Q' + x.no + '</span>'
         +   '<span class="q-pq-d">' + esc(x.from.slice(5)) + '〜' + esc(x.to.slice(5)) + '</span>'
         +   (r
              ? '<span class="q-pq-v">' + (r.差金額 > 0 ? '+' : '') + yen(r.差金額) + '円</span>'
                + '<span class="q-pq-s">直す ' + r.直す件数 + '件</span>'
              : '<span class="q-pq-n">まだ</span>')
         + '</button>';
    });
    return h + '</div></div>';
  }

  function ensureList(){
    if (!w.pitQLoadList) { Q().list = []; return; }
    w.pitQLoadList().then(function (list) {
      var U = Q(); U.list = list || []; U.listBusy = false;
      if (w.renderInspect) renderInspect();
    }).catch(function () {
      var U = Q(); U.list = []; U.listBusy = false;
      if (w.renderInspect) renderInspect();
    });
  }

  /* ================================================================
     🗄 残してある結果を見る（PDFを読み直さない）
     ⚠ 残してあるのは**これから直すものの行だけ**（OKだった行は残していない）。
        そのことを画面にも書く＝「全部あると思って見る」のを防ぐ。
     ================================================================ */
  function savedHtml(U){
    var R = U.saved;
    var ok = !!(R.検算 && R.検算.合う);
    var h = '<div class="q-savedbar">'
          +   '<b>残してある結果</b>'
          +   '<span>' + esc(s(R.走らせた日時).slice(0, 16).replace('T', ' '))
          +     (R.走らせた人 ? '・' + esc(R.走らせた人) : '')
          +     (R.PDF ? '・' + esc(R.PDF) : '') + '</span>'
          +   '<button class="q-open" onclick="pitQCloseSaved()">閉じる</button>'
          + '</div>';
    h += '<div class="q-sum">'
       +   '<div class="q-card"><span class="q-k">整備ソフト</span><b>' + (R.整備ソフト ? R.整備ソフト.枚数 : 0)
       +     '</b>台<span class="q-y">' + yen(R.整備ソフト ? R.整備ソフト.金額 : 0) + '円</span></div>'
       +   '<div class="q-card"><span class="q-k">PitFlow</span><b>' + (R.PitFlow ? R.PitFlow.台数 : 0)
       +     '</b>台<span class="q-y">' + yen(R.PitFlow ? R.PitFlow.金額 : 0) + '円</span></div>'
       +   '<div class="q-card q-diff"><span class="q-k">差</span><b>' + ((R.差 && R.差.台数 > 0) ? '+' : '')
       +     (R.差 ? R.差.台数 : 0) + '</b>台<span class="q-y">' + ((R.差 && R.差.金額 > 0) ? '+' : '')
       +     yen(R.差 ? R.差.金額 : 0) + '円</span></div>'
       + '</div>';
    h += '<div class="q-audit' + (ok ? ' ok' : ' ng') + '">'
       +   (ok ? '<b>差額の内訳が、実際の差とぴったり合っていました。</b>'
             : '<b>この結果は検算が合っていません。</b>')
       +   '<div class="q-parts">'
       +     part('整備ソフトだけにある', R.内訳.整備ソフトだけ)
       +     part('PitFlow だけにある',   R.内訳.PitFlowだけ)
       +     part('期間の外に立っている', R.内訳.期間の外)
       +     part('金額そのもののちがい', R.内訳.金額ちがい)
       +   '</div>'
       + '</div>';
    if (R.まとめ返車 && R.まとめ返車.length){
      h += '<div class="q-lump"><b><i data-ic=warn data-ics=16></i> まとめて返車済みにした日</b>';
      R.まとめ返車.forEach(function (x) {
        h += '<div class="q-lump-r">' + esc(x.日) + ' に <b>' + x.台数 + '台</b>（' + yen(x.金額) + '円）</div>';
      });
      h += '</div>';
    }
    /* ⚠ v1.185.0 『売上日ちがい』を足した。**この並びは残してある中身の名前と1文字も同じにすること**
       （quarter-store.js の `直すもの` の見出しをそのまま開く作りなので、綴りが違うと空になる）。 */
    var keys = ['期間の外', '金額ちがい', '月またぎ', 'Qまたぎ', '売上日ちがい', '整備ソフトだけ', 'PitFlowだけ'];
    h += '<div class="q-tabs">';
    keys.forEach(function (k) {
      var n = ((R.直すもの || {})[k] || []).length;
      h += '<button class="q-tab' + (U.savedTab === k ? ' on' : '') + '"'
         + ' onclick="pitQSavedTab(\'' + k + '\')">' + esc(k) + '<span>' + n + '</span></button>';
    });
    h += '<button class="q-print" onclick="window.print()">印刷</button></div>';
    h += '<div class="q-note">残してあるのは<b>これから直すものだけ</b>です'
       +   '（合っていた行は残していません）。' + (R.行を切った ? '⚠ 多すぎたので途中で切っています。' : '') + '</div>';
    h += '<div class="q-body">' + savedTable(((R.直すもの || {})[U.savedTab]) || []) + '</div>';
    return h;
  }

  /* 残してある行は「そのまま並べる」（中の作りに寄りかからない＝あとで読めなくならない） */
  function savedTable(rows){
    if (!rows.length) return '<div class="q-none">0件です。</div>';
    var cols = Object.keys(rows[0]).filter(function (k) { return k !== 'カードid'; });
    var h = '<table class="q-t"><thead><tr>';
    cols.forEach(function (k) { h += '<th' + (/金額|差|整備ソフト$|PitFlow$/.test(k) ? ' class="n"' : '') + '>' + esc(k) + '</th>'; });
    h += '<th></th></tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr>';
      cols.forEach(function (k) {
        var v = r[k];
        var num = (typeof v === 'number');
        h += '<td' + (num ? ' class="n"' : '') + '>' + esc(num ? yen(v) : s(v)) + '</td>';
      });
      h += '<td>' + (r.カードid ? '<button class="q-open" onclick="pitInspectGo(\'' + esc(r.カードid) + '\')">開く</button>' : '') + '</td>';
      h += '</tr>';
    });
    return h + '</tbody></table>';
  }

  function part(label, v){
    v = v || { 台数:0, 金額:0 };
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
             : tab === 'sdate' ? (R.売上日ちがい || [])
             : tab === 'lump'  ? R.結びついた.filter(function (p) { return p.期間の外; })
             : R.結びついた;
    if (!rows.length) return '<div class="q-none">0件です。</div>';
    var h = (tab === 'sdate'
          ? '<div class="q-note">カードに入っている<b>売上日</b>が、伝票の日付とちがうものです。'
            + '🔴 <b>売上の金額は1円も動きません。</b>直すのは日付だけです。</div>'
          : '')
          /* 🛠 v2.0.0 ゆうた指定「**修正 or 伝票側を直したからそのまま** の2択がほしい」。
             ⚠ 説明は**表の上に1回だけ**（行ごとに書くと表が読めなくなる）。 */
          + '<div class="q-2way">右端で<b>1行ずつ片づけます。答えは2つだけです。</b><br>'
          +   '・<b>直す</b>＝PitFlow を伝票に合わせます。押すとカードが書き換わり、'
          +     '<b>上の差もその場で縮みます</b>（PDF は入れ直さなくて大丈夫です）<br>'
          +   '・<b>伝票を直した</b>＝整備ソフト側を直したので、PitFlow はこのまま。<b>済</b>が付きます。'
          +     'PitFlow は変えていないので<b>上の数字は動きません</b>。'
          +     'あの数字は<b>いま手元の PDF が言っていること</b>なので、'
          +     '直したぶんは<b>次に PDF を出し直した時</b>に合います<br>'
          +   '🔴 <span style="color:#ef4444">赤いボタン</span>は<b>売上の数字が動きます</b>（実績日・金額）。'
          +     '押す前に、何がいくら動くかを出して確かめます。</div>'
          + '<table class="q-t"><thead><tr>'
          + '<th>ナンバー／お客様</th><th>整備ソフト<br>売上日</th><th>PitFlow<br>数える日</th>'
          + '<th>日付</th><th class="n">整備ソフト</th><th class="n">PitFlow</th><th class="n">差</th>'
          + '<th>受付担当<br>フロント</th><th>結び方</th><th>直す／済</th></tr></thead><tbody>';
    /* 🛠 v2.0.0 **まだ片づいていない行を先に**。押した行は下へ落ちていく＝進んだのが見える。
       ⚠ 並べ替えるだけで、行を消さない（消すと「押しまちがえた」を戻せない）。 */
    rows = rows.slice().sort(function (a, b) {
      var la = w.pitQRowLeft ? (w.pitQRowLeft(a) > 0 ? 0 : 1) : 0;
      var lb = w.pitQRowLeft ? (w.pitQRowLeft(b) > 0 ? 0 : 1) : 0;
      return la - lb;
    });
    rows.forEach(function (p) {
      var cls = p.日付.kind === 'crossMonth' ? 'bad' : (p.日付.kind === 'crossQ' ? 'warn' : (p.日付.kind === 'sameQ' ? 'ok' : ''));
      h += '<tr>'
         + '<td>' + esc(p.soft.ナンバー) + '<span class="q-s">' + esc(p.soft.顧客名) + '</span></td>'
         + '<td>' + esc(p.soft.売上日) + '<span class="q-s">伝票 ' + esc(p.soft.伝票) + '</span></td>'
         /* 💴 v1.185.0 カードが売上日を持っていたら、数える日の下に添える（2軸をその場で見くらべる）。
            ⚠ `q-s` は `<span>` の中でだけ使う（v1.184.0 の決めごと）。 */
         + '<td>' + esc(p.pit.数える日) + '<span class="q-s">' + esc(p.pit.予約番号) + '</span>'
         +   (p.pit.売上日
                ? '<span class="q-s' + (p.売上日ちがい ? ' bad' : '') + '">売上 ' + esc(p.pit.売上日) + '</span>'
                : '')
         + '</td>'
         + '<td class="' + cls + '">' + esc(p.日付.label) + '</td>'
         + '<td class="n">' + yen(p.soft.金額) + '</td>'
         + '<td class="n">' + yen(p.pit.確定金額) + '</td>'
         + '<td class="n ' + (p.金額一致 ? 'ok' : 'bad') + '">' + (p.差 > 0 ? '+' : '') + yen(p.差) + '</td>'
         + '<td>' + esc(p.soft.受付担当) + '<span class="q-s">' + esc(p.pit.フロント担当) + '</span></td>'
         /* 🔴 v1.184.0（ゆうた報告「一番右の部分の描写が半行ぐらいズレてる」）
            ここは `q-s` を**マスに直接**付けていた。`q-s` は「下に小さく添える行」用で
            `display:block` なので、**マスが表の行から外れて半行ズレて**いた。
            ＝ 添え字の見た目だけが欲しいので、**マス用のクラスを別に立てる**。
            ⚠ `q-s` は今までどおり `<span>` の中でだけ使うこと。 */
         + '<td class="q-how">' + esc(p.結び方) + '</td>'
         + fixCell(p)
         + '</tr>';
    });
    return h + '</tbody></table>';
  }

  /* ================================================================
     🛠 v2.0.0 1行ぶんの「直す／済」（ゆうた指定＝**答えは2つだけ**）
     ----------------------------------------------------------------
     ① **直す** …… PitFlow を伝票に合わせる（押すとカードが書き換わる）
     ② **伝票を直した** … 整備ソフト側を直したので、PitFlow はこのままでよい＝印を付ける
     🔴 「ズレがあるか」「誰が押せるか」の判断は **quarter-fix.js の1本**。ここで綴らない。
     ⚠ 出す順番も向こうが決めている（**安いもの＝動く数字が小さいものから**）。
        ここで並べ替えないこと（勢いで重いほうを押させないための順番）。
     ================================================================ */
  function fixCell(p){
    if (!w.pitQFixKinds) return '<td class="q-act"></td>';
    var kinds = w.pitQFixKinds(p);
    if (!kinds.length) return '<td class="q-act"><span class="q-act-ok">—</span></td>';
    var id = s(p.pit && p.pit.生 && p.pit.生.id);
    var i = p.soft.i;
    var h = '<td class="q-act">';
    kinds.forEach(function (k) {
      var mk = w.pitQMarkOf ? w.pitQMarkOf(k.kind, p.soft, id) : null;
      h += '<div class="q-fx' + (mk ? ' is-done' : '') + '">';
      h += '<b class="q-fx-k">' + esc(k.kind) + '</b>';
      if (mk){
        /* 🔴 押しても**消さない**。誰がいつ決めたかを残す（データチェックの「確認した」と同じ作法）。 */
        h += '<span class="q-fx-done">伝票を直した'
           + (mk.by ? '<i>' + esc(mk.by) + '</i>' : '')
           + (mk.at ? '<i>' + esc(s(mk.at).slice(5, 10).replace('-', '/')) + '</i>' : '')
           + '</span>'
           + '<button class="q-fx-un" onclick="pitQMk(\'' + esc(k.kind) + '\',' + i + ',0)">戻す</button>';
      } else if (!k.can){
        h += '<span class="q-fx-lock" title="' + esc(k.why) + '"><i data-ic=lock data-ics=14></i> 管理のみ</span>'
           + '<button class="q-fx-mk" onclick="pitQMk(\'' + esc(k.kind) + '\',' + i + ',1)">伝票を直した</button>';
      } else {
        h += '<button class="q-fx-go' + (k.重い ? ' is-heavy' : '') + '" title="' + esc(k.why) + '"'
           + ' onclick="pitQDo(\'' + esc(k.kind) + '\',' + i + ')">' + esc(k.label) + '</button>'
           + '<button class="q-fx-mk" onclick="pitQMk(\'' + esc(k.kind) + '\',' + i + ',1)">伝票を直した</button>';
      }
      h += '</div>';
    });
    return h + '</td>';
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
    U.res = null; U.saved = null; U.savedId = ''; U.savedAt = '';   /* 期間が変わったら結果は捨てる（古い数字を残さない） */
    if (w.renderInspect) renderInspect();
  };
  w.pitQTab = function (id){ Q().tab = id; if (w.renderInspect) renderInspect(); };
  w.pitQSavedTab = function (id){ Q().savedTab = id; if (w.renderInspect) renderInspect(); };
  w.pitQCloseSaved = function (){ var U = Q(); U.saved = null; U.savedId = ''; if (w.renderInspect) renderInspect(); };

  /* 🗄 月を送る（ルーティンの一覧） */
  w.pitQMonth = function (n){
    var U = Q();
    var ym = t(U.ym) || t(U.from).slice(0, 7);
    var p = ym.split('-');
    var d = new Date((+p[0]) || 2026, ((+p[1]) || 1) - 1 + (+n || 0), 1);
    U.ym = d.getFullYear() + '-' + pad(d.getMonth() + 1);
    if (w.renderInspect) renderInspect();
  };

  /* 🗄 Q1〜Q4 のどれかを押した＝その期間に合わせる。残してあれば、それを開く */
  w.pitQOpenPlan = function (from, to){
    var U = Q();
    U.from = from; U.to = to; U.res = null; U.saved = null; U.savedId = '';
    var id = w.pitQRunId ? w.pitQRunId(from, to) : '';
    var has = (U.list || []).some(function (x) { return x && x.id === id; });
    if (!has || !w.pitQLoadRun){ if (w.renderInspect) renderInspect(); return; }
    U.busy = '残してある結果を読んでいます…';
    if (w.renderInspect) renderInspect();
    w.pitQLoadRun(id).then(function (r) {
      U.busy = ''; U.saved = r || null; U.savedId = id; U.savedTab = '期間の外';
      if (w.renderInspect) renderInspect();
    }).catch(function () {
      U.busy = ''; if (w.renderInspect) renderInspect();
    });
  };

  /* ================================================================
     📥 ドラッグで放り込む（v1.184.0・ゆうた指定）
     ⚠ 受け取るのは **PDF 1つだけ**。ほかのものを落とされたら、黙らずにそう言う。
     ⚠ 画面のどこに落としても開いてしまわないよう、**この枠の上でだけ**受け取る。
     ================================================================ */
  w.pitQDrag = function (ev, on){
    if (ev && ev.preventDefault) ev.preventDefault();
    var el = document.getElementById('q-drop');
    if (el) el.classList[on ? 'add' : 'remove']('over');
  };
  w.pitQDrop = function (ev){
    if (ev && ev.preventDefault) ev.preventDefault();
    var el = document.getElementById('q-drop');
    if (el) el.classList.remove('over');
    var dt = ev && ev.dataTransfer;
    var f = (dt && dt.files && dt.files[0]) || null;
    if (!f){ if (w.pitToast) pitToast('ファイルが受け取れませんでした'); return; }
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf'){
      var U0 = Q();
      U0.err = '「' + f.name + '」は PDF ではありません。整備ソフトから出した売上チェックリストPDFを入れてください。';
      U0.res = null; U0.saved = null;
      if (w.renderInspect) renderInspect();
      return;
    }
    readFile(f);
  };

  w.pitQPickFile = function (el){
    var f = el && el.files && el.files[0];
    if (f) readFile(f);
  };

  /* 押して選んでも、ドラッグで落としても**同じ道**を通る（写しを作らない） */
  function readFile(f){
    var U = Q();
    U.pdf = f.name; U.err = ''; U.res = null; U.saved = null; U.savedId = ''; U.savedAt = '';
    U.busy = '読んでいます…';
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
      /* 🛠 v2.0.0 伝票を抱えておく＝直したあと**PDFを読み直さずに数え直せる**。
         ⚠ ここを消すと、1件直すたびにPDFを入れ直すことになる（＝誰も使わなくなる）。 */
      U.soft = soft;
      U.res = w.pitQMatch(soft, pit, { from: U.from, to: U.to });
      U.tab = 'lump';
      if (w.renderInspect) renderInspect();
      if (w.pitToast) pitToast(r.伝票.length + '枚を読みました（総合計・枚数とも一致）');
      /* 🗄 v1.184.0（ゆうた指定）**結果を残す。**
         🔴 同じ期間をもう一度走らせたら**上書き**＝練習でくり返してもゴミが積み上がらない。
         🔴 検算が合っていない結果は残さない（合わない数字を、あとで本当の数字だと思わせないため）。
         ⚠ 残せなかった時も黙らない（練習用サイト・通信できない時など）。 */
      saveRun(U);
    }).catch(function (e) {
      U.busy = '';
      U.err = s(e && e.message ? e.message : e);
      if (w.renderInspect) renderInspect();
    });
  }

  /* ================================================================
     🛠 v2.0.0 その場で直す（ゆうた指定 2026-08-23）
     ----------------------------------------------------------------
     🗣「付け合わせしてズレているものはそのままそこで修正できなきゃ意味ないもんね」
     🗣「基本的には **修正 or 伝票側を直したからそのまま** の2択がほしい」
     🔴 判定も書き込みも **quarter-fix.js**。ここは**押した先を呼ぶだけ**。
     ================================================================ */
  function ensureMarks(){
    var U = Q();
    if (U.marks != null || U.marksBusy || !w.pitQLoadMarks) return;
    U.marksBusy = true;
    w.pitQLoadMarks().then(function (list) {
      U.marks = list || []; U.marksBusy = false;
      if (w.renderInspect) renderInspect();
    }).catch(function () { U.marks = []; U.marksBusy = false; });
  }

  /* 直したあとに数え直す。
     🔴 **PDFは読み直さない**（抱えてある伝票をそのまま使う）＝1件直すごとに数字が動くのが見える。
     ⚠ 残す（保存）は**まとめて1回**にする。1クリック1回だと書き込みが増えすぎる。 */
  function reMatch(){
    var U = Q();
    if (!U.soft || !w.pitQMatch || !w.pitQCollect) return;
    var pit = w.pitQCollect({ from: U.from, to: U.to }).明細;
    U.res = w.pitQMatch(U.soft, pit, { from: U.from, to: U.to });
    if (U.saveTimer) clearTimeout(U.saveTimer);
    U.saveTimer = setTimeout(function () { U.saveTimer = 0; saveRun(Q()); }, 2500);
    if (w.renderInspect) renderInspect();
  }

  /* いま画面に出ている結果から、その1行を探す。
     ⚠ 目印は**伝票の並び順（soft.i）**。伝票番号は月がかわると同じ番号が出るので使わない。 */
  function pairOf(i){
    var R = Q().res; if (!R) return null;
    return (R.結びついた || []).filter(function (p) { return p.soft.i === +i; })[0] || null;
  }

  w.pitQDo = function (kind, i){
    var p = pairOf(i); if (!p || !w.pitQFixApply) return;
    w.pitQFixApply(kind, p).then(function (done) { if (done) reMatch(); });
  };
  w.pitQMk = function (kind, i, on){
    var p = pairOf(i); if (!p || !w.pitQMark) return;
    w.pitQMark(kind, p.soft, p.pit, on !== 0 && on !== '0').then(function () {
      Q().marks = w._pitQMarks || [];
      if (w.renderInspect) renderInspect();
    }).catch(function (e) {
      if (w.pitToast) pitToast(s(e && e.message ? e.message : e));
    });
  };

  function saveRun(U){
    if (!w.pitQSaveRun || !U.res) return;
    if (!w.PIT_CLOUD) return;                     /* 練習用サイトでは残さない（画面にもそう書いてある） */
    w.pitQSaveRun(U.res, { pdf: U.pdf }).then(function (d) {
      U.savedAt = s(d && d.at).slice(11, 16);
      /* 一覧も足しておく（読み直さずに Q1〜4 の印がすぐ変わる） */
      U.list = (U.list || []).filter(function (x) { return x && x.id !== d.id; });
      U.list.unshift(d);
      if (w.pitLog) pitLog('売上チェックリストと突き合わせた', { kind:'inspect',
        label: d.from + '〜' + d.to + '　差 ' + (d.差金額 > 0 ? '+' : '') + yen(d.差金額) + '円／直す ' + d.直す件数 + '件' });
      if (w.renderInspect) renderInspect();
    }).catch(function (e) {
      U.savedAt = '';
      if (w.pitToast) pitToast('結果は残せませんでした：' + s(e && e.message ? e.message : e));
    });
  }
})(window);
