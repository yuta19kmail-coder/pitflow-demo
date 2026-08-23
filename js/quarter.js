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
                   soft:null, marks:null, marksBusy:false, saveTimer:0,
                   /* 🗓 v2.0.0 PDF の期間をクォーターごとに割ったもの。gi＝いま見ている組 */
                   groups:null, gi:0, term:null, termSrc:'' };
    if (!U.q.from){
      /* 既定＝いまのクォーター。⚠ 区切りは sales.js の1本から借りる */
      var q = w.pitQuarterOf ? w.pitQuarterOf() : null;
      if (q){ U.q.from = q.s; U.q.to = q.e; }
    }
    return U.q;
  }



  /* ================================================================
     画面
     ================================================================ */
  w.pitQuarterHtml = function (){
    var U = Q();
    var h = '';

    /* ================================================================
       🧹 v2.1.0（ゆうた指定 2026-08-23）**箱を減らして、すっきりさせた。**
       🗣「いまUIがかなりごちゃごちゃしてる」
       🗣「PDF自動になったわけだから、そのあたりの選択部分はぜんぶ取っ払って」
       🗣「PDFのクォーター、とか台数とか同じようなBOXが並んでるから、まとめられそうならまとめて」

       ◎撤去したもの
         ・**期間の入力欄と「いまのQ／1つ前／2つ前」** … PDFが自分で期間を言うので要らない（v2.0.0）
         ・**月送りボタン** … いちばん上の月バー（inspect.js）に移した
         ・見出しの長い説明 … 1行にした
       ◎まとめたもの
         ・**PDF ＋ 読んだ期間 ＋ Q1〜Q4の印** ＝ 上の1箱（`q-top`）
         ・**合計 ＋ 差 ＋ 検算 ＋ 内訳**       ＝ 下の1箱（`q-nums`）
       ＝ 箱が 5つ → **2つ**。
       ================================================================ */
    ensureMarks();      /* 🛠 v2.0.0 「伝票を直した」の印（読むのは1回だけ） */

    h += '<div class="q-top">';

    /* ---- PDF を選ぶ／放り込む ----
       🔴 v1.184.0（ゆうた指定）**ドラッグで入れられるようにする。**
       ⚠ 押して選ぶ道は残す（ドラッグが苦手な人・スマホのため）。
       ⚠ v2.1.0 読み終わったあとは**小さい1行**にする（大きな箱を出しっぱなしにしない）。 */
    var _loaded = !!(U.pdf || U.res || U.err);
    h += '<div class="q-pick' + (_loaded ? ' done' : '') + '" id="q-drop"'
       +   ' ondragover="pitQDrag(event,1)" ondragenter="pitQDrag(event,1)"'
       +   ' ondragleave="pitQDrag(event,0)" ondrop="pitQDrop(event)">'
       +   '<label class="q-file">'
       +     '<input type="file" accept="application/pdf,.pdf" onchange="pitQPickFile(this)">'
       +     '<span><i data-ic=box data-ics=16></i> 売上チェックリストPDF'
       +       (_loaded ? '' : ' を選ぶ<small>（ここに<b>ドラッグ</b>しても入ります）</small>')
       +     '</span>'
       +   '</label>'
       +   (_loaded ? '' : '<span class="q-pick-n">期間は選ばなくて大丈夫です。'
                        + 'PDFに書いてある期間を読んで、<b>クォーターに自動で振り分けます</b>。'
                        + '<b>PDFはこのパソコンの中だけで読みます</b>（どこにも送りません）。</span>')
       +   (U.pdf ? '<span class="q-fname">' + esc(U.pdf) + '</span>' : '')
       +   (U.busy ? '<span class="q-busy">' + esc(U.busy) + '</span>' : '')
       /* 🧹 v2.0.0（ゆうた指定）**入れたPDFを片づける。** 残してある結果には触らない。 */
       +   (_loaded ? '<button class="q-clear" onclick="pitQClearScreen()">別のPDFを入れ直す</button>' : '')
       + '</div>';

    /* 🗓 v2.0.0 PDF が言っている期間と、クォーターの割り振り */
    h += termRow(U);
    /* ---- 🗄 v1.184.0 その月の Q1〜Q4（ルーティンの形） ---- */
    h += planRow(U);
    h += '</div>';

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
    /* ================================================================
       🧹 v2.1.0 **合計・差・検算・内訳を1つの箱にまとめた**（前は3つに分かれていた）。
       ⚠ 数字の意味は1つも変えていない。並べ方だけ。
       ================================================================ */
    var ok = R.検算.合う;
    h += '<div class="q-nums' + (ok ? '' : ' bad') + '">';
    h +=   '<div class="q-sum' + (ok ? '' : ' bad') + '">'
       +     '<div class="q-card"><span class="q-k">整備ソフト</span>'
       +       '<b>' + R.整備ソフト.枚数 + '</b>台<span class="q-y">' + yen(R.整備ソフト.金額) + '円</span></div>'
       +     '<div class="q-card"><span class="q-k">PitFlow</span>'
       +       '<b>' + R.PitFlow.台数 + '</b>台<span class="q-y">' + yen(R.PitFlow.金額) + '円</span></div>'
       +     '<div class="q-card q-diff"><span class="q-k">差</span>'
       +       '<b>' + (R.差.台数 > 0 ? '+' : '') + R.差.台数 + '</b>台'
       +       '<span class="q-y">' + (R.差.金額 > 0 ? '+' : '') + yen(R.差.金額) + '円</span></div>'
       +   '</div>';
    /* ---- 検算（🔴 合わなければ、そう言う） ---- */
    h +=   '<div class="q-audit' + (ok ? ' ok' : ' ng') + '">'
       +     (ok
              ? '<b>差額の内訳が、実際の差とぴったり合いました。</b><span>取りこぼしはありません。</span>'
              : '<b>差額の内訳が、実際の差と合いません（' + yen(R.検算.ずれ) + '円ぶん）。</b>'
                + '<span>どこかを取りこぼしています。この画面の数字は当てにしないでください。</span>')
       +     '<div class="q-parts">'
       +       part('整備ソフトだけにある', R.内訳.整備ソフトだけ)
       +       part('PitFlow だけにある',   R.内訳.PitFlowだけ)
       +       part('期間の外に立っている', R.内訳.期間の外)
       +       part('金額そのもののちがい', R.内訳.金額ちがい)
       +     '</div>'
       +   '</div>';
    h += '</div>';

    /* ---- 🗄 v1.184.0 残したかどうかを、黙らずに言う ---- */
    if (w.PIT_CLOUD){
      h += '<div class="q-saved">'
         +   (U.savedAt
              ? '<b>この結果を残しました</b>（' + esc(U.savedAt) + '）／同じ期間をもう一度やると置きかわります'
              : '結果を残しています…')
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
      /* 👤 v2.1.0（ゆうた指定）「PDFと担当者のズレは別途追加チェックして」
         ⚠ 売上の**合計は動かない**（動くのはフロント別の内訳だけ）ので、金額とは別の欄にする。 */
      { id:'staff',  label:'担当ちがい',      n: left(R.担当ちがい || []) },
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
  /* ================================================================
     🗓 v2.0.0 PDF が言っている期間と、クォーターの割り振り（ゆうた指定）
     ----------------------------------------------------------------
     🗣「入れたPDFに対して日付で自動でQ割り振りできないかな？」
     🗣「多少日付がズレても、その分も別Qとしてチェックを一部入れる みたいな感じであれば楽」
     🔴 割り方は quarter-match.js の1本（`pitQSplit`）。ここで 1-7／8-15 と書かない。
     ⚠ 「一部」の組は **そのQを見終わっていない**ので、はっきりそう書く＆済にしない。
     ================================================================ */
  function termRow(U){
    if (!U.groups || !U.groups.length) return '';
    var h = '<div class="q-term">'
          + '<span class="q-term-h">このPDFは <b>' + esc(U.term ? (U.term.from + ' 〜 ' + U.term.to) : '?') + '</b> ぶん'
          + (U.termSrc === 'PDF' ? '（PDFの「対象期間」から）' : '（伝票の日付から。PDFに対象期間が見つかりませんでした）')
          + '</span>';
    if (U.groups.length === 1){
      var g0 = U.groups[0];
      h += '<span class="q-term-1">' + esc(g0.label) + (g0.全部 ? '' : ' <b class="q-part">の一部</b>')
         + '（' + g0.soft.length + '枚）</span>';
      if (!g0.全部){
        h += '<div class="q-term-n">⚠ このクォーターの日が<b>ぜんぶは入っていません</b>'
           + '（' + esc(g0.from) + '〜' + esc(g0.to) + ' だけ）。'
           + '<b>「済」にはしません。</b>そのQをまるごと見るときは、Qの日ぜんぶで出し直してください。</div>';
      }
      return h + '</div>';
    }
    h += '<div class="q-gs">';
    U.groups.forEach(function (g, i) {
      var d = g.res ? g.res.差.金額 : 0;
      h += '<button class="q-g' + (U.gi === i ? ' on' : '') + (g.全部 ? '' : ' part') + '"'
         + ' onclick="pitQPickGroup(' + i + ')">'
         +   '<span class="q-g-t">' + esc(g.label) + (g.全部 ? '' : '<i>の一部</i>') + '</span>'
         +   '<span class="q-g-d">' + esc(g.from.slice(5)) + '〜' + esc(g.to.slice(5)) + '・' + g.soft.length + '枚</span>'
         +   '<span class="q-g-v">' + (d > 0 ? '+' : '') + yen(d) + '円</span>'
         + '</button>';
    });
    h += '</div>';
    var part = U.groups.filter(function (g) { return !g.全部; });
    h += '<div class="q-term-n">クォーターごとに分けました。押すと切り替わります。'
       + '<b>「まるごと」入っているQだけ結果を残しました</b>'
       + (part.length ? '（<b class="q-part">の一部</b>と書いてあるQは、日がぜんぶ入っていないので残していません）' : '')
       + '。</div>';
    return h + '</div>';
  }

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
    /* ⚠ v2.1.0 月送りのボタンは**撤去した**（いちばん上の月バーが送る＝送る所を2つ持たない）。 */
    var h = '<div class="q-plan">'
          + '<div class="q-plan-h"><b>' + esc(head) + ' の突き合わせ</b>'
          +   '<span>済んだQは押すと開けます。× で「まだ」に戻せます</span>'
          + '</div><div class="q-plan-b">';
    plan.forEach(function (x) {
      var r = x.run;
      var cls = r ? (r.検算 ? ' done' : ' ng') : '';
      h += '<div class="q-pqwrap">'
         +   '<button class="q-pq' + cls + '" onclick="pitQOpenPlan(\'' + x.from + '\',\'' + x.to + '\')">'
         +     '<span class="q-pq-t">Q' + x.no + '</span>'
         +     '<span class="q-pq-d">' + esc(x.from.slice(5)) + '〜' + esc(x.to.slice(5)) + '</span>'
         +     (r
                ? '<span class="q-pq-v">' + (r.差金額 > 0 ? '+' : '') + yen(r.差金額) + '円</span>'
                  + '<span class="q-pq-s">直す ' + r.直す件数 + '件</span>'
                : '<span class="q-pq-n">まだ</span>')
         +   '</button>'
         /* 🧹 v2.0.0（ゆうた指定）済んだQを「まだ」に戻す。練習のぶんを片づけるため。 */
         +   (r ? '<button class="q-pq-x" title="この結果を消して「まだ」に戻す"'
                  + ' onclick="pitQDropRun(\'' + x.from + '\',\'' + x.to + '\')">×</button>' : '')
         + '</div>';
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
    var keys = ['期間の外', '金額ちがい', '月またぎ', 'Qまたぎ', '売上日ちがい', '担当ちがい', '整備ソフトだけ', 'PitFlowだけ'];
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
             : tab === 'staff' ? (R.担当ちがい || [])
             : tab === 'lump'  ? R.結びついた.filter(function (p) { return p.期間の外; })
             : R.結びついた;
    if (!rows.length) return '<div class="q-none">0件です。</div>';
    /* ================================================================
       🃏 v2.1.0（ゆうた指定 2026-08-23）**表をやめて、カードにした。**
       🗣「個別のデータの字がかなり小さい」
       🗣「ワイドはスクロールになると確認しずらくなると思うから、ハイト方向にひろげるなら広げて、
       　　もう少し大きなテキストで客名とかもはっきりさせたい」
       🗣「またPitと整備ソフトの差とかは同一列を見るとか見やすくしたい」

       ◎やめたこと … **9列の表**（横スクロールが出る／字が10〜11px になる）
       ◎これから  … **1件＝1枚のカード**
         ・お客様の名前を**いちばん大きく**（15px）。ナンバーもすぐ下に大きめで
         ・整備ソフトと PitFlow を**上下2行に並べて、日付も金額も同じ位置**で見くらべる
         ・差は**その真下**にまとめる（左右に目を振らない）
         ・番号は右上。直すボタンは下
       🔴 横スクロールは**1つも出ない**（幅の狭い端末でも縦に積むだけ）。
       ================================================================ */
    var h = (tab === 'sdate'
          ? '<div class="q-note">カードに入っている<b>売上日</b>が、伝票の日付とちがうものです。'
            + '🔴 <b>売上の金額は1円も動きません。</b>直すのは日付だけです。</div>'
          : '')
          + (tab === 'staff'
          ? '<div class="q-note">伝票の<b>受付担当</b>と、PitFlow の<b>フロント担当</b>がちがうものです。'
            + '🔴 <b>売上の合計は動きません。</b>動くのは<b>フロント別の内訳</b>だけです。</div>'
          : '')
          /* 🛠 v2.0.0 ゆうた指定「**修正 or 伝票側を直したからそのまま** の2択がほしい」。 */
          + '<div class="q-2way">右端で<b>1行ずつ片づけます。答えは2つだけです。</b><br>'
          +   '・<b>直す</b>＝PitFlow を伝票に合わせます。押すとカードが書き換わり、'
          +     '<b>上の差もその場で縮みます</b>（PDF は入れ直さなくて大丈夫です）<br>'
          +   '・<b>伝票を直した</b>＝整備ソフト側を直したので、PitFlow はこのまま。<b>済</b>が付きます。'
          +     'PitFlow は変えていないので<b>上の数字は動きません</b>。'
          +     '直したぶんは<b>次に PDF を出し直した時</b>に合います<br>'
          +   '🔴 <span style="color:#ef4444">赤いボタン</span>は<b>売上の数字が動きます</b>（実績日・金額）。'
          +     '押す前に、何がいくら動くかを出して確かめます。</div>';
    /* 🛠 v2.0.0 **まだ片づいていない行を先に**。押した行は下へ落ちていく＝進んだのが見える。
       ⚠ 並べ替えるだけで、行を消さない（消すと「押しまちがえた」を戻せない）。 */
    rows = rows.slice().sort(function (a, b) {
      var la = w.pitQRowLeft ? (w.pitQRowLeft(a) > 0 ? 0 : 1) : 0;
      var lb = w.pitQRowLeft ? (w.pitQRowLeft(b) > 0 ? 0 : 1) : 0;
      return la - lb;
    });
    h += '<div class="q-cards">';
    rows.forEach(function (p) {
      var left = w.pitQRowLeft ? w.pitQRowLeft(p) : 1;
      var dk = p.日付.kind;
      var dcls = dk === 'crossMonth' ? 'bad' : (dk === 'crossQ' ? 'warn' : (dk === 'sameQ' ? 'ok' : ''));
      var amtOk = p.金額一致;
      h += '<div class="q-c' + (left ? '' : ' is-done') + (p.期間の外 ? ' out' : '') + '">'
        /* 頭＝番号・結び方・期間の外の印 */
        + '<div class="q-c-h">'
        +   noBtn(w.pitQRowNo ? w.pitQRowNo(p) : '')
        +   '<span class="q-c-how">' + esc(p.結び方) + '</span>'
        +   (p.期間の外 ? '<span class="q-c-out">この期間の外</span>' : '')
        + '</div>'
        /* お客様＝いちばん大きく */
        + '<div class="q-c-who">' + esc(p.soft.顧客名 || '（名前なし）')
        +   '<span class="q-c-plate">' + esc(p.soft.ナンバー || 'ナンバーなし') + '</span></div>'
        /* 🔴 整備ソフトと PitFlow を上下に並べる＝日付も金額も**同じ位置**で見くらべる */
        + '<div class="q-c-cmp">'
        +   '<div class="q-c-r"><span class="q-c-src">整備ソフト</span>'
        +     '<span class="q-c-d">' + esc(p.soft.売上日) + '<i>売上日</i></span>'
        +     '<span class="q-c-a">' + yen(p.soft.金額) + '<i>円</i></span>'
        +     '<span class="q-c-p">伝票 ' + esc(p.soft.伝票) + '</span></div>'
        +   '<div class="q-c-r"><span class="q-c-src">PitFlow</span>'
        +     '<span class="q-c-d">' + esc(p.pit.数える日) + '<i>実績日</i></span>'
        +     '<span class="q-c-a">' + yen(p.pit.確定金額) + '<i>円</i></span>'
        +     '<span class="q-c-p">' + esc(p.pit.予約番号)
        +       (p.pit.売上日 ? '<em' + (p.売上日ちがい ? ' class="bad"' : '') + '>売上日 ' + esc(p.pit.売上日) + '</em>' : '')
        +     '</span></div>'
        /* 差＝そのすぐ下（左右に目を振らない） */
        +   '<div class="q-c-gap">'
        +     '<span class="q-c-g ' + dcls + '">' + esc(p.日付.label || '—') + '</span>'
        +     '<span class="q-c-g ' + (amtOk ? 'ok' : 'bad') + '">'
        +       (p.差 === 0 ? '金額はぴったり' : ('金額 ' + (p.差 > 0 ? '+' : '') + yen(p.差) + '円')) + '</span>'
        +   '</div>'
        + '</div>'
        /* 担当 */
        + '<div class="q-c-st' + (p.担当一致 ? '' : ' bad') + '">受付 <b>' + esc(p.soft.受付担当 || '—') + '</b>'
        +   '<span>／</span>フロント <b>' + esc(p.pit.フロント担当 || '—') + '</b>'
        +   (p.担当一致 ? '' : '<em>ちがいます</em>') + '</div>'
        /* 直す／済 */
        + fixBox(p)
        + '</div>';
    });
    return h + '</div>';
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
  /* 🔢 v2.0.0 番号のマス。
     🔴 押すとコピー＝**部品はデータチェックと同じ 1本**（`pitInspectCopyNo` → `CFErr.copy`）。
     ⚠ `q-s` の失敗をくり返さない＝**マスに display を直に付けない**。中の <button> だけ飾る。 */
  function noCell(no){
    if (!no) return '<td class="q-no"></td>';
    return '<td class="q-no">' + noBtn(no) + '</td>';
  }
  /* 🃏 v2.1.0 カードの中でも同じ番号のボタンを使う（見た目を2つ持たない） */
  function noBtn(no){
    if (!no) return '';
    return '<button class="ins-no" title="押すと番号をコピーします"'
         + ' onclick="pitInspectCopyNo(\'' + esc(no) + '\')">' + esc(no) + '</button>';
  }

  function fixCell(p){ return '<td class="q-act">' + fixInner(p) + '</td>'; }
  /* 🃏 v2.1.0 カードの下に出す「直す／済」 */
  function fixBox(p){ return '<div class="q-act q-c-act">' + fixInner(p) + '</div>'; }
  function fixInner(p){
    if (!w.pitQFixKinds) return '';
    var kinds = w.pitQFixKinds(p);
    if (!kinds.length) return '<span class="q-act-ok">✓ 直すところはありません</span>';
    var id = s(p.pit && p.pit.生 && p.pit.生.id);
    var i = p.soft.i;
    var h = '';
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
    return h;
  }

  function softTable(list){
    if (!list.length) return '<div class="q-none">0件です。</div>';
    var h = '<div class="q-note">整備ソフトで売上が立っているのに、PitFlow の実績に無いものです。'
          + '<b>カードは有る</b>＝まだ返車済みにしていないだけ。</div>'
          + '<table class="q-t"><thead><tr><th>番号</th><th>売上日</th><th>伝票</th><th>ナンバー</th><th>お客様</th>'
          + '<th class="n">金額</th><th>受付担当</th><th>PitFlow 側</th></tr></thead><tbody>';
    list.forEach(function (r) {
      var c = r.カード;
      h += '<tr>'
         + noCell(w.pitQSoftNo ? w.pitQSoftNo(r) : '')
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
          + '<table class="q-t"><thead><tr><th>番号</th><th>数える日</th><th>予約番号</th><th>ナンバー</th><th>お客様</th>'
          + '<th class="n">確定金額</th><th>フロント</th><th></th></tr></thead><tbody>';
    list.forEach(function (r) {
      h += '<tr>' + noCell(w.pitQPitNo ? w.pitQPitNo(r) : '')
         + '<td>' + esc(r.数える日) + '</td><td>' + esc(r.予約番号) + '</td>'
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
      /* 🗓 v2.0.0（ゆうた指定）**PDF が言っている期間から、クォーターを自動で割り振る。**
         🔴 割り方は quarter-match.js の1本。ここで 1-7／8-15 と書かない。 */
      var sp = w.pitQSplit ? w.pitQSplit(r.期間, soft) : { 組: [], 期間: r.期間, 期間の出どころ: 'PDF' };
      U.term = sp.期間; U.termSrc = sp.期間の出どころ;
      U.groups = (sp.組 || []).map(function (g) {
        return { no:g.no, label:g.label, from:g.from, to:g.to, 全部:g.全部,
                 soft: g.伝票, res: null };
      });
      /* 全部の組を先に数えておく（PDFはもう読み終わっているので安い）。
         ＝ どのQに何件あるかが**押す前に**見える。 */
      U.groups.forEach(function (g) {
        var pit = w.pitQCollect({ from: g.from, to: g.to }).明細;
        g.res = w.pitQMatch(g.soft, pit, { from: g.from, to: g.to });
      });
      /* 🔴 はじめに選ぶのは「**まるごとで、いちばん枚数が多い**」組。
         ＝ ふだんは1つしか無いので今までどおり。ズレて出た端っこの数枚を先に見せない。 */
      U.gi = 0;
      var best = -1;
      U.groups.forEach(function (g, i) {
        var sc = g.soft.length + (g.全部 ? 10000 : 0);
        if (sc > best){ best = sc; U.gi = i; }
      });
      applyGroup(U);
      U.tab = 'lump';
      if (w.renderInspect) renderInspect();
      if (w.pitToast){
        var g0 = U.groups[U.gi];
        pitToast(r.伝票.length + '枚を読みました'
               + (g0 ? '／' + g0.label + (g0.全部 ? '' : ' の一部') : '')
               + (U.groups.length > 1 ? '（' + U.groups.length + 'クォーターに分かれています）' : ''));
      }
      /* 🗄 v1.184.0（ゆうた指定）**結果を残す。**
         🔴 同じ期間をもう一度走らせたら**上書き**＝練習でくり返してもゴミが積み上がらない。
         🔴 検算が合っていない結果は残さない（合わない数字を、あとで本当の数字だと思わせないため）。
         ⚠ 残せなかった時も黙らない（練習用サイト・通信できない時など）。 */
      saveAllGroups(U);
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
    /* 🗓 v2.0.0 いま見ている組にも書き戻す（別のQに切り替えて戻ってきた時に、直したぶんが消えないように） */
    if (U.groups && U.groups[U.gi]) U.groups[U.gi].res = U.res;
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

  /* 🗓 v2.0.0 いま選んでいる組を、画面の期間と結果に反映する（写しを1か所に集める） */
  function applyGroup(U){
    var g = (U.groups || [])[U.gi];
    if (!g) return;
    U.from = g.from; U.to = g.to;
    U.soft = g.soft;
    U.res  = g.res;
    U.saved = null; U.savedId = '';
  }
  w.pitQPickGroup = function (i){
    var U = Q();
    if (!U.groups || !U.groups[+i]) return;
    U.gi = +i; applyGroup(U); U.tab = 'lump';
    if (w.renderInspect) renderInspect();
  };

  /* 🔴 残すのは「**まるごと**」の組だけ。
     一部の組（端っこの数日）を残すと、Q1〜Q4 の印が「済」になってしまう。
     ＝ そのQをまだ見終わっていないのに済になるのが、いちばん困る。 */
  function saveAllGroups(U){
    (U.groups || []).forEach(function (g) {
      if (!g.全部 || !g.res) return;
      saveRun({ res: g.res, pdf: U.pdf, list: U.list,
                _apply: function (d) {
                  U.savedAt = s(d && d.at).slice(11, 16);
                  U.list = (U.list || []).filter(function (x) { return x && x.id !== d.id; });
                  U.list.unshift(d);
                } });
    });
  }

  /* 🧹 v2.0.0（ゆうた指定）**入れたPDFを片づける／残した結果を消す。**
     🗣「あと一回入れたQのデータをクリアするボタンもほしい」
     ⚠ 2つは別物。取り違えると事故になるので、言い方も分ける。 */
  w.pitQClearScreen = function (){
    var U = Q();
    U.pdf = null; U.err = ''; U.busy = '';
    U.res = null; U.soft = null; U.groups = null; U.gi = 0; U.term = null; U.termSrc = '';
    U.saved = null; U.savedId = ''; U.savedAt = '';
    if (w.renderInspect) renderInspect();
    if (w.pitToast) pitToast('画面を空にしました（残してある結果はそのままです）');
  };
  w.pitQDropRun = function (from, to){
    var U = Q();
    if (!w.pitQDeleteRun) return;
    var id = w.pitQRunId ? w.pitQRunId(from, to) : '';
    var d = (U.list || []).filter(function (x) { return x && x.id === id; })[0] || null;
    var det = ['・' + from + ' 〜 ' + to + ' の残してある結果を消します',
               (d ? '・いま残っているのは ' + s(d.at).slice(0, 16).replace('T', ' ')
                    + (d.by ? '・' + d.by : '') + ' に走らせたぶんです' : ''),
               '・Q1〜Q4 の印が「まだ」に戻ります',
               '🟢 「伝票を直した」の印は消しません（整備ソフト側を直したという別の記録なので）',
               '⚠ 消したら戻せません。もう一度PDFを入れれば作り直せます。'].filter(Boolean).join('\n');
    pitAsk(from + '〜' + to + ' の結果を消しますか？', { detail: det, danger: true, ok: '消して「まだ」に戻す' })
      .then(function (yes) {
        if (!yes) return;
        w.pitQDeleteRun(from, to).then(function () {
          U.list = (U.list || []).filter(function (x) { return x && x.id !== id; });
          if (U.savedId === id){ U.saved = null; U.savedId = ''; }
          if (w.pitLog) pitLog('突き合わせの結果を消した', { kind:'inspect', label: from + '〜' + to });
          if (w.renderInspect) renderInspect();
          if (w.pitToast) pitToast(from + '〜' + to + ' の結果を消しました');
        }).catch(function (e) {
          if (w.pitToast) pitToast('消せませんでした：' + s(e && e.message ? e.message : e));
        });
      });
  };

  function saveRun(U){
    if (!w.pitQSaveRun || !U.res) return;
    if (!w.PIT_CLOUD) return;                     /* 練習用サイトでは残さない（画面にもそう書いてある） */
    w.pitQSaveRun(U.res, { pdf: U.pdf }).then(function (d) {
      /* ⚠ 組ごとに呼ばれる時は、画面の覚えを触るのは呼んだ側（_apply）に任せる */
      if (U._apply){ U._apply(d); }
      else {
        U.savedAt = s(d && d.at).slice(11, 16);
        /* 一覧も足しておく（読み直さずに Q1〜4 の印がすぐ変わる） */
        U.list = (U.list || []).filter(function (x) { return x && x.id !== d.id; });
        U.list.unshift(d);
      }
      if (w.pitLog) pitLog('売上チェックリストと突き合わせた', { kind:'inspect',
        label: d.from + '〜' + d.to + '　差 ' + (d.差金額 > 0 ? '+' : '') + yen(d.差金額) + '円／直す ' + d.直す件数 + '件' });
      if (w.renderInspect) renderInspect();
    }).catch(function (e) {
      U.savedAt = '';
      if (w.pitToast) pitToast('結果は残せませんでした：' + s(e && e.message ? e.message : e));
    });
  }
})(window);
