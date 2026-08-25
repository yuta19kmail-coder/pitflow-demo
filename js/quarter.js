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
    U.q = U.q || { from:'', to:'', res:null, pdf:null, tab:'data', busy:'', err:'',
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
       🧹 v2.2.0 数字の箱は**数字だけ**（ゆうた 2026-08-24「余計なテキストはなしですっきり」）
       ⚠ 検算の1行だけは残す。ここを黙らせると「合っている」と嘘をつくことになる。
       ================================================================ */
    var ok = R.検算.合う;
    var G = R.グループ, nokori = nokoriOf(R);
    h += '<div class="q-nums' + (ok ? '' : ' bad') + '">';
    h +=   '<div class="q-sum">'
       +     '<div class="q-card"><span class="q-k">フロントマン</span>'
       +       '<b>' + R.整備ソフト.枚数 + '</b>枚<span class="q-y">' + yen(R.整備ソフト.金額) + '円</span></div>'
       +     '<div class="q-card"><span class="q-k">PitFlow</span>'
       +       '<b>' + R.PitFlow.台数 + '</b>台<span class="q-y">' + yen(R.PitFlow.金額) + '円</span></div>'
       +     '<div class="q-card q-diff"><span class="q-k">まだ合っていない</span>'
       +       '<b>' + nokori + '</b>件'
       +       '<span class="q-y">' + (R.差.金額 > 0 ? '+' : '') + yen(R.差.金額) + '円</span></div>'
       +   '</div>';
    h +=   '<div class="q-chk ' + (ok ? 'ok' : 'ng') + '">'
       +     (ok ? '✓ 下の3つを足すと、この差とぴったり同じです'
                 : '⚠ 内訳を足しても実際の差に届きません（' + yen(R.検算.ずれ) + '円ぶん）。'
                   + 'この画面の数字は当てにしないでください')
       +     '<button class="q-print" onclick="window.print()">印刷</button>'
       +   '</div>';
    h += '</div>';

    /* ---- 🗄 v1.184.0 残したかどうかを、黙らずに言う ---- */
    if (w.PIT_CLOUD){
      h += '<div class="q-saved">'
         +   (U.savedAt
              ? 'この結果を残しました（' + esc(U.savedAt) + '）／同じ期間をもう一度やると置きかわります'
              : '結果を残しています…')
         + '</div>';
    }

    /* ---- ✍ v2.2.0 残りが0になったら書き込める ---- */
    if (w.pitQWritePanel) h += w.pitQWritePanel(R, U);

    /* ---- 🗂 v2.2.0 入り口は4つだけ ---- */
    h += groupBar(R);
    h += '<div class="q-body">' + (U.viewer ? (w.pitQWriteView ? w.pitQWriteView(R, U) : '') : list(R, U.tab)) + '</div>';
    return h;
  };

  /* ================================================================
     🗂 v2.2.0 入り口は4つだけ（ゆうた 2026-08-24）
     ----------------------------------------------------------------
     🔴 どれに入るかは **quarter-match.js の `pitQGroupOf` 1本**。ここで綴り直さない。
     🔴 **1件は1か所にしか出ない**ので、4つを足すと全部になる。
        お金の内訳もこの4つでそのまま差に戻る（検算がこの並びのまま生きる）。
     ⚠ 「片方にしか無い」はデータがちがうの中。**赤いカード**で先頭に出す（一覧にしない）。
     ================================================================ */
  function eff(a){ return (a || []).reduce(function (x, p) { return x + (p.効き || 0); }, 0); }
  /* まだ片づいていない件数（印が付いたもの・直したものは数えない） */
  function nokoriOf(R){
    var n = 0;
    (R.結びついた || []).forEach(function (p) {
      if (p.組 !== 'ok' && (!w.pitQRowLeft || w.pitQRowLeft(p) > 0)) n++;
    });
    /* 🔴 片方にしか無い行は、**本当に直すまで残り続ける**（印では消さない）。
       ＝ 伝票が無いまま済ませると、このあとの伝票の履歴も車体番号も残せない。
       ⚠ 「まだ実績になっていない（カードは有る）」だけは、印で置いておける。 */
    (R.整備ソフトだけ || []).forEach(function (x) {
      if (!x.カード || !(w.pitQOneMarkOf && w.pitQOneMarkOf(x))) n++;
    });
    /* 🔗 v2.8.0 **伝票が別のQに在ることが分かっているものは、残りに数えない。**
       ＝ Qの境目の車は、伝票が在るほうのQで1回見れば済む（二度追いかけない）。 */
    n += (R.PitFlowだけ || []).filter(function (x) { return !x.別のQ; }).length;
    return n;
  }
  w.pitQNokori = nokoriOf;

  function groupBar(R){
    var G = R.グループ, S = R.整備ソフトだけ || [], P = R.PitFlowだけ || [];
    var softAmt = S.reduce(function (a, x) { return a + x.soft.金額; }, 0);
    var pitAmt  = P.reduce(function (a, x) { return a + x.確定金額; }, 0);
    var GS = [
      { id:'data',  l:'データがちがう', n:G.データ.length + S.length + P.length,
        v:eff(G.データ) + softAmt - pitAmt, note:'片方にしか無い／別の車かも／担当がちがう' },
      { id:'money', l:'金額がちがう',   n:G.金額.length, v:eff(G.金額), note:'伝票と確定金額がちがう' },
      { id:'date',  l:'日付がちがう',   n:G.日付.length, v:eff(G.日付), note:'売上日のズレ／返車日が期間の外' },
      /* 🔔 v2.8.3 OK にも「返車日だけQをまたいだ（正常）」が入るようになった。
         🔴 だから **0円と決め打ちしない**。決め打ちのままだと「4つを足すと差になる」が崩れる。
         ⚠ v2.8.3 より前は OK の効きは必ず0だったので、`eff(G.OK)` は昔の結果でも同じ0になる。 */
      /* 🔴 v2.8.6 残した結果は OK の行を持っていないので、残してある数を使う
         （お知らせの金額＝OK の効きの全部。ほかの OK は定義上0円） */
      { id:'ok',    l:'OK',
        n: (R.OK台数 == null ? G.OK.length : +R.OK台数),
        v: (R.OK台数 == null ? eff(G.OK) : ((R.お知らせ && R.お知らせ.金額) || 0)),
        note: (function () {
          var k = (R.お知らせ && R.お知らせ.台数 != null)
                ? +R.お知らせ.台数
                : G.OK.filter(function (p) { return p.正常なQまたぎ; }).length;
          return k ? '直すところがありません（うち' + k + '件は返車日が期間の外・お知らせ）'
                   : '直すところがありません';
        })() }
    ];
    var h = '<div class="q-gr">';
    GS.forEach(function (x) {
      h += '<button class="q-grb' + (Q().tab === x.id ? ' on' : '') + ' is-' + x.id + '"'
         +   ' onclick="pitQTab(\'' + x.id + '\')">'
         +   '<span class="q-grb-l">' + esc(x.l) + '</span>'
         +   '<span class="q-grb-n">' + x.n + '</span>'
         +   '<span class="q-grb-v">' + (x.id === 'ok' ? '' : (x.v > 0 ? '+' : '') + yen(x.v) + '円') + '</span>'
         +   '<span class="q-grb-t">' + esc(x.note) + '</span>'
         + '</button>';
    });
    return h + '</div>';
  }

  /* ================================================================
     🗄 その月の Q1〜Q4（ルーティンの形・v1.184.0）
     ----------------------------------------------------------------
     🗣「落ち着いてきたら 月始まり → Q1〜4 でそれぞれ付け合わせ、みたいなルーティン化する予定」
     🔴 **どれが済んでいて、どれがまだか**を、いちばん上で見えるようにする。
     🔴 区切りは `pitQuarterOf` 1本（quarter-store.js の `pitQMonthPlan` が借りている）。
     ⚠ 済んだものは押すと**残してある結果**が開く（PDFは要らない）。
     ================================================================ */
  /* ================================================================
     🗓 v2.2.0 PDF が言っている期間 ＝ **小さい1行だけ**（ゆうた 2026-08-24）
     ----------------------------------------------------------------
     🗣「入れたPDFに対して上記の表示は要らなくない？ その下にQごとがあるから、
        Qごとの BOX に結び付く感じじゃダメかな？」
     🔴🔴 **クォーターの切り替え口は、下の Q の BOX 1本。** ここに2つ目のボタンを作らない。
        ＝ 前は同じQが上下2か所に出ていて、どっちを押すのか毎回迷った。
     ⚠ 期間の1行だけは残す（読み取りがズレていた時に、ここで気づけるから）。
     🔴 割り方は quarter-match.js の1本（`pitQSplit`）。ここで 1-7／8-15 と書かない。
     ================================================================ */
  function termRow(U){
    if (!U.groups || !U.groups.length || !U.term) return '';
    return '<div class="q-term"><span class="q-term-h">このPDFは <b>'
         + esc(U.term.from + ' 〜 ' + U.term.to) + '</b> ぶん'
         + (U.termSrc === 'PDF' ? '' : '（PDFに対象期間が無かったので、伝票の日付から）')
         + '</span></div>';
  }

  /* 🗓 v2.2.0 いま入れているPDFの中で、このQに当たる組（無ければ -1）。
     ⚠ 「一部」の組も当てる（そのQの端っこの数日だけ入っている時）。
        まるごとの組が有ればそちらを優先する。 */
  function groupIdx(U, from, to){
    var a = (U && U.groups) || [], hit = -1;
    for (var i = 0; i < a.length; i++){
      if (a[i].from <= to && a[i].to >= from){ if (hit < 0 || a[i].全部) hit = i; }
    }
    return hit;
  }
  function dd(ymd){ return s(ymd).slice(8).replace(/^0/, ''); }

  /* 🗄 Qの BOX 1つぶん。
     ① いま入れたPDFに入っているQ …… 押すとその結果に切り替わる（数字はその場の生）
     ② PDFに入っていないQ ………… 残してある結果 or「まだ」（今までどおり）
     🔴 右は必ず **残○件 or OK**。左は 期間・実施日（or 枚数）・金額だけ。 */
  function qBox(U, x){
    var gi = groupIdx(U, x.from, x.to);
    var g  = gi >= 0 ? U.groups[gi] : null;
    var hd = 'Q' + x.no + '<i>' + esc(dd(x.from)) + '〜' + esc(dd(x.to)) + '日</i>';
    if (g){
      var nok = w.pitQNokori ? w.pitQNokori(g.res) : 0;
      var d   = g.res ? g.res.差.金額 : 0;
      var okQ = !!g.res && !nok;
      return '<div class="q-pqwrap">'
        + '<button class="q-pq now' + (U.gi === gi ? ' on' : '') + (okQ ? ' ok' : ' done')
        +   (g.全部 ? '' : ' part') + '" onclick="pitQPickGroup(' + gi + ')">'
        +   '<span class="q-pq-l">'
        +     '<span class="q-pq-t">' + hd
        +       (g.全部 ? '' : '<em class="q-pq-part">' + esc(dd(g.from)) + '〜' + esc(dd(g.to)) + '日だけ</em>')
        +     '</span>'
        +     '<span class="q-pq-d">このPDF ' + g.soft.length + '枚</span>'
        +     '<span class="q-pq-v">' + (d > 0 ? '+' : '') + yen(d) + '円</span>'
        +   '</span>'
        +   '<span class="q-pq-r">' + (okQ ? 'OK' : '残 <b>' + nok + '</b>件') + '</span>'
        + '</button></div>';
    }
    var r = x.run;
    var nok2 = r ? (r.直す件数 || 0) : 0;
    var ok2  = r && !nok2;
    return '<div class="q-pqwrap">'
      + '<button class="q-pq' + (r ? (ok2 ? ' ok' : ' done') : '') + '"'
      +   ' onclick="pitQOpenPlan(\'' + x.from + '\',\'' + x.to + '\')">'
      +   '<span class="q-pq-l"><span class="q-pq-t">' + hd + '</span>'
      +     (r
             ? '<span class="q-pq-d">' + esc(s(r.走らせた日時).slice(0, 10)) + ' に実施</span>'
               + '<span class="q-pq-v">' + ((r.差金額 > 0) ? '+' : '') + yen(r.差金額) + '円</span>'
             : '<span class="q-pq-d">まだ実施していません</span>')
      +   '</span>'
      +   '<span class="q-pq-r">' + (r ? (ok2 ? 'OK' : '残 <b>' + nok2 + '</b>件') : '<em>まだ</em>') + '</span>'
      + '</button>'
      /* 🧹 v2.0.0（ゆうた指定）済んだQを「まだ」に戻す。練習のぶんを片づけるため。 */
      + (r ? '<button class="q-pq-x" title="この結果を消して「まだ」に戻す"'
             + ' onclick="pitQDropRun(\'' + x.from + '\',\'' + x.to + '\')">×</button>' : '')
      + '</div>';
  }

  function planRow(U){
    if (!w.pitQMonthPlan) return '';
    /* 🔴 v2.2.0 練習用サイトでも、読み込み中でも、**BOX は出す**。
       ＝ v2.2.0 で切り替え口をここ1本にしたので、ここを消すと
          PDF を入れてもクォーターを選べなくなる（前は上に切り替えボタンが有った）。 */
    var off = '';
    if (!w.PIT_CLOUD){
      off = '練習用サイトでは、結果も「伝票を直した」の印も残りません（本番の PitFlow では残ります）。';
    } else if (U.list == null){
      if (!U.listBusy){ U.listBusy = true; ensureList(); }
      off = 'これまでの突き合わせを読んでいます…';
    }
    var ym = t(U.ym) || (t(U.from).slice(0, 7));
    var plan = w.pitQMonthPlan(ym, U.list || []);
    /* ⚠ v2.1.0 月送りのボタンは**撤去した**（いちばん上の月バーが送る＝送る所を2つ持たない）。 */
    /* 🗓 v2.2.0 左＝期間・実施日（or 枚数）・金額／右＝残り件数 or OK（ゆうた 2026-08-24） */
    var h = '<div class="q-plan"><div class="q-plan-b">';
    plan.forEach(function (x) { h += qBox(U, x); });
    h += '</div>';
    /* ⚠ PDF が**別の月にもまたがっていた**時。月バーは今の月のままなので、
       ここに出さないと、その組が画面のどこからも押せなくなる。**隠さない。** */
    var extra = '';
    (U.groups || []).forEach(function (g, i) {
      var inPlan = plan.some(function (x) { return g.from <= x.to && g.to >= x.from; });
      if (inPlan) return;
      var nok = w.pitQNokori ? w.pitQNokori(g.res) : 0;
      var d = g.res ? g.res.差.金額 : 0;
      var okQ = !!g.res && !nok;
      extra += '<div class="q-pqwrap"><button class="q-pq now'
        + (U.gi === i ? ' on' : '') + (okQ ? ' ok' : ' done') + (g.全部 ? '' : ' part')
        + '" onclick="pitQPickGroup(' + i + ')">'
        + '<span class="q-pq-l"><span class="q-pq-t">' + esc(g.label)
        +   (g.全部 ? '' : '<em class="q-pq-part">' + esc(dd(g.from)) + '〜' + esc(dd(g.to)) + '日だけ</em>')
        + '</span>'
        + '<span class="q-pq-d">このPDF ' + g.soft.length + '枚</span>'
        + '<span class="q-pq-v">' + (d > 0 ? '+' : '') + yen(d) + '円</span></span>'
        + '<span class="q-pq-r">' + (okQ ? 'OK' : '残 <b>' + nok + '</b>件') + '</span>'
        + '</button></div>';
    });
    if (extra) h += '<div class="q-plan-b q-plan-x">' + extra + '</div>';
    if (off) h += '<div class="q-plan-off">' + esc(off) + '</div>';
    return h + '</div>';
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
       +   '<div class="q-card"><span class="q-k">フロントマン</span><b>' + (R.整備ソフト ? R.整備ソフト.枚数 : 0)
       +     '</b>枚<span class="q-y">' + yen(R.整備ソフト ? R.整備ソフト.金額 : 0) + '円</span></div>'
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
       +     part('PitFlow に実績が無い',    R.内訳.整備ソフトだけ)
       +     part('フロントマンに伝票が無い', R.内訳.PitFlowだけ)
       +     part('返車日が期間の外',        R.内訳.期間の外)
       +     part('金額がちがう',            R.内訳.金額ちがい)
       +   '</div>'
       /* 🔔 v2.8.4 「直す先が無いQまたぎ」を残す側で外したので、**どこへ行ったかを1行で言う。**
          ⚠ 黙って消すと「16件どこ行った？」になる（内訳の金額には今までどおり入っている）。
          ⚠ v2.8.4 より前に残した結果には `お知らせ` が無い＝この行は出ない（それで正しい）。 */
       + ((R.お知らせ && R.お知らせ.台数)
          ? '<div class="q-audit-note">🔔 このうち <b>' + R.お知らせ.台数 + '台</b>（'
            + yen(R.お知らせ.金額) + '円）は、<b>伝票を切った日と車を返した日でQがまたがっただけ</b>です。'
            + '金額・車・売上日は合っているので、<b>直すところはありません</b>（下の一覧には出ません）。</div>'
          : '')
       + '</div>';
    if (R.まとめ返車 && R.まとめ返車.length){
      h += '<div class="q-lump"><b><i data-ic=warn data-ics=16></i> まとめて返車済みにした日</b>';
      R.まとめ返車.forEach(function (x) {
        h += '<div class="q-lump-r">' + esc(x.日) + ' に <b>' + x.台数 + '台</b>（' + yen(x.金額) + '円）</div>';
      });
      h += '</div>';
    }
    /* ================================================================
       🗂🗂 v2.8.6（ゆうた 2026-08-25「またPDFなしのリロードでこの表示に戻るよ」）
       ----------------------------------------------------------------
       ◎ここが**顔がちがう**最後の場所だった。
         走らせた直後 … **4つの箱**（データ／金額／日付／OK）＋残り件数
         残した結果   … **8つのタブ**（期間の外・金額ちがい・月またぎ・Qまたぎ…）
         v2.7.0 で直したのは**カードの描き方**だけで、**分け方は昔の8つのまま**だった。
       🔴 直し方＝**新しい判定を1つも作らない。**
          残した行を `savedPair` で戻して、いまある `pitQGroupOf`（4つのどれに入るか）に通す。
          ＝ v2.8.6 より前に残した結果も、そのまま4つの箱で出る
            （必要な項目は v2.7.0 で既に残してある）。
       🔴 描き手も増やさない。`groupBar()` と `list()` を**走らせた直後とそのまま共用**する。
       ⚠ 同じ1件が複数の入れ物（期間の外／Qまたぎ…）に入っているので、**必ず重複を落とす**。
         落とさないと「1件は1か所にしか出ない」が崩れて、数が二重になる。
       ⚠ OK の行は残していない（軽くするため）＝件数だけ `OK台数` から出す。
       ================================================================ */
    var R4 = savedGroups(R);
    if (R4) {
      h += groupBar(R4);
      h += '<div class="q-tabs"><span class="q-note" style="margin:0">残してあるのは'
         + '<b>これから直すものだけ</b>です（合っていた行は残していません）。'
         + (R.行を切った ? '⚠ 多すぎたので途中で切っています。' : '') + '</span>'
         + '<button class="q-print" onclick="window.print()">印刷</button></div>';
      h += '<div class="q-body">' + list(R4, U.tab, true) + '</div>';
      return h;
    }
    /* 🔴 ここから下は **`_v` が無い＝v2.7.0 より前に残した結果**だけの道。
       カードに要る項目が入っていないので、今までの表のまま出す（黙って空にしない）。 */
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
    h += '<div class="q-body">' + savedBody(R, U.savedTab) + '</div>';
    return h;
  }

  /* 残した結果 → 走らせた直後と同じ形（4つの箱）に組み直す。
     🔴 判定は `pitQGroupOf` 1本。ここで「これは日付」「これは金額」と書き分けない。
     戻り＝null なら古い形（表で出す）。 */
  function savedGroups(R){
    if (!(+R._v >= 2)) return null;
    var src = R.直すもの || {};
    var seen = {}, pairs = [];
    ['期間の外', '金額ちがい', '月またぎ', 'Qまたぎ', '売上日ちがい', '担当ちがい'].forEach(function (k) {
      (src[k] || []).forEach(function (r) {
        /* ⚠ 重複落とし。伝票と予約番号だけだと、どちらも空の行がぶつかるので日付まで見る */
        var key = s(r.伝票) + '|' + s(r.予約番号) + '|' + s(r.売上日) + '|' + s(r.数える日);
        if (seen[key]) return;
        seen[key] = 1;
        pairs.push(savedPair(r));
      });
    });
    var G = { データ: [], 金額: [], 日付: [], OK: [] };
    pairs.forEach(function (p) {
      var g = w.pitQGroupOf ? w.pitQGroupOf(p) : 'date';
      p.組 = g;
      p.効き = w.pitQEffect ? w.pitQEffect(p) : 0;
      (G[g === 'data' ? 'データ' : g === 'money' ? '金額' : g === 'ok' ? 'OK' : '日付']).push(p);
    });
    return {
      グループ: G,
      整備ソフトだけ: (src.整備ソフトだけ || []).map(savedSoftOnly),
      PitFlowだけ:   (src.PitFlowだけ   || []).map(savedPitOnly),
      内訳: R.内訳, お知らせ: R.お知らせ, OK台数: R.OK台数
    };
  }

  /* ================================================================
     🃏🃏 v2.7.0 残した結果も**走らせた直後と同じカード**で出す
     ----------------------------------------------------------------
     🗣 ゆうた「一回閉じると 前の表示スタイルにもどっちゃう」
     ◎なにが起きていたか
       走らせた直後は `card()`（v2.1.0 のカード）、閉じて開き直すと
       残した結果は `savedTable()`（昔の素の表）で出ていた。
       ＝**同じ画面が2つの顔を持っていた。**
     ◎直し方
       描き手は増やさない。残した行を `card()` が読める形に**戻して**渡す。
     🔴 v2.7.0 より前に残した結果には、カードに要る項目（車種・車体番号・
        同一性・売上日差…）が入っていない。**その時は今までの表で出す。**
        黙って空のカードを並べない＝古い結果も読めるままにしておく。
     ================================================================ */
  function savedBody(R, key){
    var rows = ((R.直すもの || {})[key]) || [];
    if (!rows.length) return '<div class="q-none">0件です。</div>';
    if (!(+R._v >= 2)) {
      return '<div class="q-note">これは古い形で残した結果なので、表で出しています'
           + '（もう一度PDFを読ませて残すと、いまの見た目になります）。</div>'
           + savedTable(rows);
    }
    if (key === '整備ソフトだけ'){
      return '<div class="q-cards">' + rows.map(function (r) { return oneCard(savedSoftOnly(r), 'soft', true); }).join('') + '</div>';
    }
    if (key === 'PitFlowだけ'){
      return '<div class="q-cards">' + rows.map(function (r) { return oneCard(savedPitOnly(r), 'pit', true); }).join('') + '</div>';
    }
    return '<div class="q-cards">' + rows.map(function (r) { return card(savedPair(r), true); }).join('') + '</div>';
  }

  /* 残した行 → card() が読む形に戻す。
     ⚠ 対応は quarter-store.js の `slimPair` と**1対1**。片方だけ直さないこと。 */
  function savedPair(r){
    return {
      soft: { 顧客名: r.お客様, ナンバー: r.ナンバー, 車種: r.車種, 売上日: r.売上日,
              金額: r.整備ソフト, 伝票: r.伝票, 車体番号: r.車体番号, 受付担当: r.受付担当 },
      pit:  { 車種: r.カード車種, 売上日: r.カード売上日, 数える日: r.数える日,
              確定金額: r.PitFlow, 予約番号: r.予約番号, 車体番号: r.カード車体番号,
              フロント担当: r.フロント, 生: { id: r.カードid } },
      結び方: r.結び方, 期間の外: !!r.期間の外, 同じ車: !!r.同じ車, 同一性: r.同一性,
      売上日差: { kind: r.売上日差kind, label: r.売上日差label },
      金額一致: !!r.金額一致, 担当一致: !!r.担当一致,
      正常なQまたぎ: !!r.正常なQまたぎ,                /* 🔔 v2.8.4 */
      差: r.差 || 0
    };
  }
  /* ⚠ 対応は `slimSoftOnly` と1対1 */
  function savedSoftOnly(r){
    return {
      soft: { 顧客名: r.お客様, ナンバー: r.ナンバー, 車種: r.車種, 売上日: r.売上日,
              金額: r.金額, 伝票: r.伝票, 車体番号: r.車体番号, 受付担当: r.受付担当 },
      カード: r.カードid ? { 状態: r.カード状態, 返車日: r.カード返車日,
                            予約番号: r.カード予約番号, 生: { id: r.カードid } } : null,
      カード別Q: r.カード別Q                       /* 🔗 v2.8.0 */
    };
  }
  /* ⚠ 対応は `slimPitOnly` と1対1 */
  function savedPitOnly(r){
    return {
      顧客名: r.お客様, ナンバー: r.ナンバー, 車種: r.車種, 数える日: r.数える日,
      確定金額: r.金額, 予約番号: r.予約番号, 車体番号: r.車体番号,
      フロント担当: r.フロント, 生: { id: r.カードid },
      別のQ: r.別のQ                                /* 🔗 v2.8.0 */
    };
  }

  /* 残してある結果の内訳（⚠ 残してある中身の名前は変えていないので、見出しだけ言い換える） */
  function part(label, v){
    v = v || { 台数:0, 金額:0 };
    return '<div class="q-part"><span>' + esc(label) + '</span><b>' + (v.金額 > 0 ? '+' : '') + yen(v.金額) + '</b>'
         + '<i>' + v.台数 + '件</i></div>';
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

  /* ================================================================
     🗂 v2.2.0 一覧＝選んだグループの中身
     ⚠ 言葉（同じQ内／Qまたぎ／月またぎ／売上日が…）は**物差しが返したもの**をそのまま出す。
        ここで綴り直さない。
     ⚠ 説明の文は置かない（ゆうた 2026-08-24「フォロー文は全部要らない」）。
        重さはカードの色で見せる。
     ================================================================ */
  function list(R, tab, saved){
    var G = R.グループ || { データ:[], 金額:[], 日付:[], OK:[] };
    /* ⚠ `.map(one)` の `one` は**引数1つ**の包み（v2.8.5 の事故を二度と起こさないため）。
       残した結果かどうかは、ここで包み直して渡す。 */
    var one1 = saved ? function (p) { return card(p, true); } : one;
    if (tab === 'ok'){
      /* 🔴 v2.8.6 残した結果には**OKだった行を残していない**（軽くするため）。
         数だけ言って、黙って「0件です」と嘘をつかない。 */
      if (saved) {
        var n = (R.OK台数 == null) ? null : +R.OK台数;
        return '<div class="q-none">直すところはありません。'
             + (n == null ? '合っていた行は残していません（軽くするため）。'
                          : '合っていた <b>' + n + '件</b> は残していません（軽くするため）。')
             + '</div>';
      }
      return G.OK.length ? '<div class="q-cards">' + G.OK.map(one).join('') + '</div>'
                         : '<div class="q-none">0件です。</div>';
    }
    if (tab === 'data'){
      /* 🔴🔴 片方にしか無い車＝**赤いカード**。中身がちがう車より先に出す。
         ⚠ 「まだ実績になっていない（カードは有る）」は黄色に格下げ（ゆうた 2026-08-24）。 */
      var ones = (R.整備ソフトだけ || []).map(function (x) { return { x:x, k:'soft' }; })
        .concat((R.PitFlowだけ || []).map(function (x) { return { x:x, k:'pit' }; }));
      ones.sort(function (a, b) { return (oneLevel(a) === 'red' ? 0 : 1) - (oneLevel(b) === 'red' ? 0 : 1); });
      var mid = G.データ;
      if (!ones.length && !mid.length) return '<div class="q-none">0件です。</div>';
      return '<div class="q-cards">'
        + ones.map(function (o) { return oneCard(o.x, o.k, saved); }).join('')
        + mid.map(one1).join('')
        + '</div>';
    }
    var rows = (tab === 'money') ? G.金額 : G.日付;
    if (!rows.length) return '<div class="q-none">0件です。</div>';
    /* まだ片づいていない行を先に。⚠ 並べ替えるだけで、行を消さない */
    rows = rows.slice().sort(function (a, b) {
      var la = w.pitQRowLeft ? (w.pitQRowLeft(a) > 0 ? 0 : 1) : 0;
      var lb = w.pitQRowLeft ? (w.pitQRowLeft(b) > 0 ? 0 : 1) : 0;
      return la - lb;
    });
    return '<div class="q-cards">' + rows.map(one1).join('') + '</div>';
  }

  /* 🔴 赤＝本当にどちらか片方にしか無い（カードすら無い／伝票が無い）
     🟡 黄＝カードは有る。まだ返車済みにしていないだけ＝作業を進めれば消える */
  function oneLevel(o){
    /* 🔗 v2.8.0 **伝票が別のQに在ることが分かっているものは、赤にしない。**
       ＝ Qの境目の車が「伝票が無い車」として毎回赤で出るのを止める（ゆうた 2026-08-25）。
       ⚠ 判定は書き写さない。`pitQMatch` / `pitQCrossLink` が貼った名札を読むだけ。 */
    if (o.k === 'pit') return (o.x && o.x.別のQ) ? 'yellow' : 'red';
    return (o.x && o.x.カード) ? 'yellow' : 'red';
  }

  /* ================================================================
     🃏 v2.1.0/v2.2.0 1件ぶんのカード
     ・お客様の名前がいちばん大きい／車種はその隣
     ・フロントマンと PitFlow を**上下に並べる**＝売上日どうし・金額が同じ位置
     ・管理番号の右に**車体番号**
     ・左が見くらべ、右が片づけ（横スクロールは1つも出さない）
     ================================================================ */
  /* 🔴🔴 v2.8.5（ゆうた報告 2026-08-25）**`.map(card)` と裸で書かないこと。**
     `Array.map` は2つ目に**添え字**を渡すので、`card(p, saved)` の `saved` に 0,1,2… が入る。
     ＝ 1枚目（添え字0＝偽）だけ直すボタンが出て、**2枚目以降は「残した結果」として描かれ、
        ボタンが丸ごと消える**。押すと並び替えで次が1枚目に来るので「1つずつしか押せない」に見えた。
     🗣「売上日を変えるボタンとかが一番上にしか出ないで、クリックすると次のが上がって押せるようになる」
     ⚠ v2.7.0 で `card(p, saved)` に2つ目の引数を足した時に生まれた。**引数を増やしたら map を疑う。**
     ⚠ だから包む関数を1つ置いて、**map から card を直接呼ばせない。** */
  function one(p){ return card(p); }

  function card(p, saved){
    /* 🃏 v2.7.0 saved=true ＝ 残した結果として描く。
       ⚠ 「直す」ボタンは出さない。直す処理（pitQDo / pitQMk）は
          **読み込んだPDFの行番号（p.soft.i）に効く**もので、残した結果には行番号が無い。
          出すと押せるのに効かないボタンになるので、代わりに「カードを開く」を出す。 */
    var left = saved ? 1 : (w.pitQRowLeft ? w.pitQRowLeft(p) : 1);
    var sg = p.売上日差 || { kind:'', label:'' };
    var sdCls = sg.kind === 'none' ? 'miss' : (sg.kind === 'same' ? '' : 'bad');
    var idNg = !p.同じ車;
    /* 🔔 v2.8.3 直す先が無いものは、左の帯も黄ではなく青（見るだけ、と分かるように） */
    return '<div class="q-c' + (left ? '' : ' is-done')
         + (p.期間の外 ? (p.正常なQまたぎ ? ' note' : ' out') : '') + (idNg ? ' mism' : '') + '">'
      + '<div class="q-c-h">' + noBtn(w.pitQRowNo ? w.pitQRowNo(p) : '')
      +   '<span class="q-c-how">' + esc(p.結び方) + '</span>'
      +   (p.期間の外 ? '<span class="q-c-' + (p.正常なQまたぎ ? 'note' : 'out') + '">'
                      + (p.正常なQまたぎ ? '🔔 お知らせ' : 'この期間の外') + '</span>' : '')
      +   (idNg ? '<span class="q-c-warn">⚠ 別の車かも</span>' : '')
      + '</div>'
      + '<div class="q-c-body"><div class="q-c-main">'
      + '<div class="q-c-who">' + esc(p.soft.顧客名 || '（名前なし）')
      +   '<span class="q-c-plate">' + esc(p.soft.ナンバー || 'ナンバーなし')
      +     (idNg
             ? '<em class="bad">フロントマン ' + esc(p.soft.車種 || '—') + ' ／ PitFlow ' + esc(p.pit.車種 || '—') + '</em>'
             : ((p.soft.車種 || p.pit.車種) ? '<em>' + esc(p.soft.車種 || p.pit.車種) + '</em>' : ''))
      +   '</span></div>'
      + '<div class="q-c-cmp">'
      +   '<div class="q-c-r q-c-hd"><span></span><span>売上日</span><span>実績日</span><span>金額</span>'
      +     '<span>管理番号</span><span>車体番号</span></div>'
      +   '<div class="q-c-r"><span class="q-c-src">フロントマン</span>'
      +     '<span class="q-c-d"><i>売上日</i>' + esc(p.soft.売上日) + '</span>'
      +     '<span class="q-c-d none"><i>実績日</i>—</span>'
      +     '<span class="q-c-a"><i>金額</i>' + yen(p.soft.金額) + '</span>'
      +     '<span class="q-c-p"><i>管理番号</i>' + esc(p.soft.伝票) + '</span>'
      +     '<span class="q-c-v"><i>車体番号</i>' + esc(p.soft.車体番号 || '—') + '</span></div>'
      +   '<div class="q-c-r"><span class="q-c-src">PitFlow</span>'
      +     '<span class="q-c-d ' + sdCls + '"><i>売上日</i>' + (p.pit.売上日 ? esc(p.pit.売上日) : '未入力') + '</span>'
      +     '<span class="q-c-d flat"><i>実績日</i>' + esc(p.pit.数える日) + '</span>'
      +     '<span class="q-c-a' + (p.金額一致 ? '' : ' bad') + '"><i>金額</i>' + yen(p.pit.確定金額) + '</span>'
      +     '<span class="q-c-p"><i>管理番号</i>' + esc(p.pit.予約番号) + '</span>'
      +     '<span class="q-c-v' + (p.同一性 === 'vinNG' ? ' bad' : (p.同一性 === 'vinOK' ? ' ok' : ' none')) + '">'
      +       '<i>車体番号</i>' + (p.pit.車体番号 ? esc(p.pit.車体番号) : '未登録') + '</span></div>'
      + '</div>'
      + '<div class="q-c-gap">'
      +   idChip(p) + sdChip(p)
      +   '<span class="q-c-g">実績日 ' + esc(p.pit.数える日) + (p.期間の外 ? '・この期間の外' : '') + '</span>'
      +   '<span class="q-c-g ' + (p.金額一致 ? 'ok' : 'bad') + '">'
      +     (p.差 === 0 ? '金額はぴったり' : ('金額 ' + (p.差 > 0 ? '+' : '') + yen(p.差) + '円')) + '</span>'
      /* 🔔 v2.8.3 直す先が無いことを、はっきり書く（ゆうた「あくまでお知らせで、扱いはOK」）。
         ⚠ 判定は書き写さない。`pitQMatch` が貼った `正常なQまたぎ` を読むだけ。 */
      +   (p.正常なQまたぎ
          ? '<span class="q-c-g cross">🔔 伝票を切った日と車を返した日でQがまたがっただけです。'
            + '金額・車・売上日は合っています＝<b>直すところはありません</b></span>'
          : '')
      + '</div>'
      + '<div class="q-c-st' + (p.担当一致 ? '' : ' bad') + '">フロントマン <b>' + esc(p.soft.受付担当 || '—') + '</b>'
      +   '<span>／</span>PitFlow <b>' + esc(p.pit.フロント担当 || '—') + '</b>'
      +   (p.担当一致 ? '' : '<em>ちがいます</em>') + '</div>'
      + '</div>'
      + '<div class="q-act q-c-act">' + (saved ? savedAct(p) : fixInner(p)) + '</div>'
      + '</div></div>';
  }
  function idChip(p){
    if (p.同一性 === 'vinNG') return '<span class="q-c-g bad">車体番号がちがう＝別の車かも</span>';
    if (p.同一性 === 'carNG') return '<span class="q-c-g bad">車種がちがう＝結びつけを疑う</span>';
    if (p.同一性 === 'vinOK') return '<span class="q-c-g ok">車体番号が一致＝同じ車</span>';
    return '';
  }
  function sdChip(p){
    var g = p.売上日差 || { kind:'', label:'' };
    var cls = g.kind === 'same' ? 'ok' : (g.kind === 'none' ? 'warn' : 'bad');
    return '<span class="q-c-g ' + cls + '">' + esc(g.label) + '</span>';
  }

  /* ================================================================
     🔴🔴 片方にしか無い1件＝**赤いカード**（ゆうた 2026-08-24）
     ----------------------------------------------------------------
     ⚠ 形は結びついたカードと同じ。**無い側は「—」で空けて出す**
        ＝「無い」ことが目で見て分かる（表の1行だと軽く見える）。
     🔴 答えは逃げ道なし。
        ・PitFlow にカードが無い → **新規予約として作る**（確認しただけでは消さない）
        ・フロントマンに伝票が無い → **伝票を立てて出し直す**か、**実績を取り消す**
        ・カードは有る（黄） → 返車済みにする。翌週返車にずれた時だけ「確認した」で置ける
     ================================================================ */
  var STATE_JA = { workDone:'作業は終わっている', check:'確認の段階', contact:'連絡待ち',
                   reserve:'予約の段階', inShop:'入庫中', returned:'返車済み', scrap:'取りやめ' };
  function oneCard(x, kind, saved){
    var soft = (kind === 'soft');
    var c = soft ? x.カード : null;
    var lv = oneLevel({ x:x, k:kind });
    /* 🔗 v2.8.0 Qの境目の車＝「無い」ではなく「**別のQに在る**」 */
    var 別Q = soft ? s(x.カード別Q) : s(x.別のQ);
    var head = soft ? (c ? (別Q ? 'このQでは実績になっていない' : 'まだ実績になっていない') : 'PitFlow にカードが無い')
                    : (別Q ? '伝票は別のQにあります' : 'フロントマンに伝票が無い');
    var no = soft ? (w.pitQSoftNo ? w.pitQSoftNo(x) : '') : (w.pitQPitNo ? w.pitQPitNo(x) : '');
    var mk = w.pitQOneMarkOf ? w.pitQOneMarkOf(x) : null;
    var S = soft ? x.soft : x;
    var cid = soft ? (c && c.生 && c.生.id) : (x.生 && x.生.id);
    return '<div class="q-c ' + (lv === 'red' ? 'gone' : 'gone-y') + (mk ? ' is-done' : '') + '">'
      + '<div class="q-c-h">' + noBtn(no)
      +   '<span class="' + (lv === 'red' ? 'q-c-gone' : 'q-c-gone-y') + '">'
      +     (lv === 'red' ? '⚠ ' : '') + esc(head) + '</span></div>'
      + '<div class="q-c-body"><div class="q-c-main">'
      + '<div class="q-c-who">' + esc((soft ? S.顧客名 : S.顧客名) || '（名前なし）')
      +   '<span class="q-c-plate">' + esc(S.ナンバー || 'ナンバーなし')
      +     (S.車種 ? '<em>' + esc(S.車種) + '</em>' : '') + '</span></div>'
      + '<div class="q-c-cmp">'
      +   '<div class="q-c-r q-c-hd"><span></span><span>売上日</span><span>実績日</span><span>金額</span>'
      +     '<span>管理番号</span><span>車体番号</span></div>'
      +   '<div class="q-c-r"><span class="q-c-src">フロントマン</span>'
      +     '<span class="q-c-d' + (soft ? '' : ' none') + '"><i>売上日</i>' + (soft ? esc(S.売上日) : '—') + '</span>'
      +     '<span class="q-c-d none"><i>実績日</i>—</span>'
      +     '<span class="q-c-a' + (soft ? '' : ' none') + '"><i>金額</i>' + (soft ? yen(S.金額) : '—') + '</span>'
      +     '<span class="q-c-p"><i>管理番号</i>' + (soft ? esc(S.伝票) : '—') + '</span>'
      +     '<span class="q-c-v"><i>車体番号</i>' + (soft ? esc(S.車体番号 || '—') : '—') + '</span></div>'
      +   '<div class="q-c-r"><span class="q-c-src">PitFlow</span>'
      +     '<span class="q-c-d none"><i>売上日</i>—</span>'
      +     '<span class="q-c-d' + (soft ? ' none' : ' flat') + '"><i>実績日</i>' + (soft ? '—' : esc(S.数える日)) + '</span>'
      +     '<span class="q-c-a' + (soft ? ' none' : '') + '"><i>金額</i>' + (soft ? '—' : yen(S.確定金額)) + '</span>'
      +     '<span class="q-c-p"><i>管理番号</i>' + (soft ? (c ? esc(c.予約番号) : '—') : esc(S.予約番号)) + '</span>'
      +     '<span class="q-c-v none"><i>車体番号</i>—</span></div>'
      + '</div>'
      + '<div class="q-c-gap"><span class="q-c-g ' + (lv === 'red' ? 'bad' : 'warn') + '">' + esc(head) + '</span>'
      +   (soft
          ? (c ? '<span class="q-c-g">カードは有る（' + esc(STATE_JA[c.状態] || c.状態) + '）'
                 + (c.返車日 ? '・返車 ' + esc(c.返車日) : '・まだ返車済みにしていない') + '</span>'
               : '<span class="q-c-g bad">PitFlow にカードそのものがありません</span>')
          : (別Q ? '' : '<span class="q-c-g">PDF に伝票が載っていません</span>'))
      /* 🔗 v2.8.0 別のQに在るなら、**どこに在るか**をそのまま出す（物差しの言葉のまま） */
      + (別Q ? '<span class="q-c-g cross">' + esc(別Q) + '</span>' : '')
      + '</div>'
      + '<div class="q-c-st">' + (soft ? 'フロントマン <b>' + esc(S.受付担当 || '—') + '</b>'
                                       : 'PitFlow <b>' + esc(S.フロント担当 || '—') + '</b>') + '</div>'
      + '</div>'
      + '<div class="q-act q-c-act">' + (saved ? savedAct({ pit:{ 生:{ id:cid } } }) : oneFix(x, kind, lv, c, cid, mk)) + '</div>'
      + '</div></div>';
  }
  function oneFix(x, kind, lv, c, cid, mk){
    var open = cid ? '<button class="q-fx-go" onclick="pitInspectGo(\'' + esc(cid) + '\')">' : '';
    if (kind === 'pit'){
      /* 🔴🔴 伝票が無いままだと、このあとの伝票の履歴も車体番号も残せない。
         だから**確認しただけの道は作らない**（ゆうた 2026-08-24）。 */
      return '<div class="q-fx"><b class="q-fx-k">①</b>'
        + '<span class="q-act-ok">フロントマンで<b>伝票を立てて</b>、PDFを出し直す<br>'
        + '<em>（次に出したPDFで消えます）</em></span></div>'
        + '<div class="q-fx"><b class="q-fx-k">②</b>'
        + (cid ? '<button class="q-fx-go is-heavy" onclick="pitInspectGo(\'' + esc(cid) + '\')">カードを開いて実績を取り消す</button>'
               : '<span class="q-act-ok">カードを開いて実績を取り消す</span>') + '</div>'
        + '<div class="q-fx"><span class="q-fx-note">この2つしかありません。'
        + '<b>確認しただけでは消しません</b></span></div>';
    }
    if (!c){
      /* 🔴🔴 伝票があるのに PitFlow を通っていない。**必ず作る。** */
      return '<div class="q-fx"><b class="q-fx-k">やること</b>'
        + '<span class="q-act-ok">この車を<b>新規予約として作ってください</b></span></div>'
        + '<div class="q-fx"><span class="q-fx-note">伝票があるなら<b>必ず作ってください</b>。'
        + '確認しただけでは消しません</span></div>';
    }
    /* 🟡 カードは有る＝返車済みにすれば消える。翌週返車にずれた時は印で置いておける */
    var no = w.pitQSoftNo ? w.pitQSoftNo(x) : '';
    return '<div class="q-fx"><b class="q-fx-k">やること</b>'
      + (cid ? open + 'カードを開いて返車済みにする</button>'
             : '<span class="q-act-ok">カードを開いて返車済みにする</span>') + '</div>'
      + '<div class="q-fx">'
      + (mk
        ? '<span class="q-fx-done">確認した' + (mk.by ? '<i>' + esc(mk.by) + '</i>' : '')
          + (mk.at ? '<i>' + esc(s(mk.at).slice(5, 10).replace('-', '/')) + '</i>' : '') + '</span>'
          + '<button class="q-fx-un" onclick="pitQOneMk(\'' + esc(no) + '\',0)">戻す</button>'
        : '<b class="q-fx-k">答え</b><button class="q-fx-mk" onclick="pitQOneMk(\'' + esc(no) + '\',1)">確認した</button>')
      + '</div>';
  }

  /* 🃏 v2.7.0 残した結果のカードの右側。
     直すのは**PDFを読ませた時だけ**（行番号が要るため）。ここは開く道だけ出す。 */
  function savedAct(p){
    var id = s(p && p.pit && p.pit.生 && p.pit.生.id);
    return '<div class="q-fx">'
      + (id ? '<button class="q-fx-go" onclick="pitInspectGo(\'' + esc(id) + '\')">カードを開く</button>'
            : '<span class="q-act-ok">カードがありません</span>')
      + '</div>'
      + '<div class="q-fx"><span class="q-fx-note">直すときは、'
      + '<b>もう一度PDFを読ませて</b>ください（残した結果からは直せません）</span></div>';
  }

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
    var kinds = w.pitQFixKinds(p).concat(w.pitQKeepKinds ? w.pitQKeepKinds(p) : []);
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
        h += '<span class="q-fx-done">' + (k.保つ ? 'このままでよい' : '伝票を直した')
           + (mk.by ? '<i>' + esc(mk.by) + '</i>' : '')
           + (mk.at ? '<i>' + esc(s(mk.at).slice(5, 10).replace('-', '/')) + '</i>' : '')
           + '</span>'
           + '<button class="q-fx-un" onclick="pitQMk(\'' + esc(k.kind) + '\',' + i + ',0)">戻す</button>';
      } else if (k.保つ){
        /* 🗓 v2.2.0 実績日＝返車日。ふだんの答えは**これ1つだけ**（直すボタンは出さない） */
        h += '<button class="q-fx-mk q-fx-keep"'
           + ' title="返車日は当日に付けているので、伝票と日がちがっても直す必要はありません"'
           + ' onclick="pitQMk(\'' + esc(k.kind) + '\',' + i + ',1)">このままでよい</button>';
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
  w.pitQTab = function (id){ Q().tab = id; Q().viewer = false; if (w.renderInspect) renderInspect(); };
  /* 🔴 v2.2.0 片方にしか無い行の「確認した」（カードが有る行だけ置ける） */
  w.pitQOneMk = function (no, on){
    if (!w.pitQOneMark) return;
    var U = Q();
    U.busy = '印を付けています…'; if (w.renderInspect) renderInspect();
    w.pitQOneMark(no, +on).then(function (saved) {
      U.busy = '';
      if (w.pitToast) pitToast(saved === false
        ? '練習用サイトなので、この印はこの端末の中だけです'
        : (+on ? '確認した（済）。上の数字は動きません' : '済を戻しました'));
      if (w.renderInspect) renderInspect();
    });
  };
  w.pitQSavedTab = function (id){ Q().savedTab = id; if (w.renderInspect) renderInspect(); };
  w.pitQCloseSaved = function (){ var U = Q(); U.saved = null; U.savedId = ''; if (w.renderInspect) renderInspect(); };



  /* 🗄 Q1〜Q4 のどれかを押した＝その期間に合わせる。残してあれば、それを開く */
  w.pitQOpenPlan = function (from, to){
    var U = Q();
    U.from = from; U.to = to; U.res = null; U.saved = null; U.savedId = '';
    /* 🗓 v2.2.0 いま入れているPDFに入っていないQを開いた＝**どのBOXも「開いている」印にしない**。
       ＝ 印だけ残ると、出ている中身と光っている箱がズレる。 */
    U.gi = -1;
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
                 車種:x.車種, 金額:x.比べる金額, 受付担当:x.受付担当,
                 /* 🚗🧾 v2.2.0 書き込みに使う（車体番号と伝票の中身） */
                 車台:x.車台, 明細:x.明細, 明細が合う:x.明細が合う,
                 法定:x.法定, 原価:x.原価, 消費税:x.消費税, 伝票計:x.伝票計 };
      });
      /* 🗓 v2.0.0（ゆうた指定）**PDF が言っている期間から、クォーターを自動で割り振る。**
         🔴 割り方は quarter-match.js の1本。ここで 1-7／8-15 と書かない。 */
      /* 🖨 v2.4.0 **元のPDFそのもの**を持っておく（気になる所を刷り込んで出し直すため）。 */
      U.元のPDF = r.元のPDF || null;
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
      /* 🔗 v2.8.0（ゆうた報告 2026-08-25）**組をまたいで見る。**
         🔴 **全部の組を数え終わったあと**でないと意味がない（隣の組の結果を読むため）。
         ＝ Q1で「PitFlowだけ」に落ちた車が、Q2で伝票と結ばれていたら、そう言い直す。
         ⚠ 数字は1つも動かない。名札を貼るだけ。 */
      if (w.pitQCrossLink) w.pitQCrossLink(U.groups);
      /* 🔴 はじめに選ぶのは「**まるごとで、いちばん枚数が多い**」組。
         ＝ ふだんは1つしか無いので今までどおり。ズレて出た端っこの数枚を先に見せない。 */
      U.gi = 0;
      var best = -1;
      U.groups.forEach(function (g, i) {
        var sc = g.soft.length + (g.全部 ? 10000 : 0);
        if (sc > best){ best = sc; U.gi = i; }
      });
      /* 🗓 v2.3.0 月バーを**このPDFの月**へ動かす（入口は inspect.js の1本）。
         ⚠ これが無いと、7月のPDFを入れても箱は8月のままで、7月ぶんが下に別に並ぶ。 */
      if (w.pitInspectGoYm && U.groups[U.gi]) w.pitInspectGoYm(U.groups[U.gi].from);
      applyGroup(U);
      U.tab = 'data';
      /* 🔴 新しいPDFを入れたら、③の AI の見立ては**捨てる**。
         ＝ 前のPDFの見立てが残っていると、別の伝票に別の伝票の話が付く。 */
      if (w._insp && w._insp.ai){ w._insp.ai.見立て = null; w._insp.ai.err = ''; w._insp.ai.at = ''; }
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
    /* 🔗 v2.8.0 直したら組をまたぐ名札も貼り直す（何度呼んでも同じ結果になる作り） */
    if (w.pitQCrossLink && U.groups && U.groups.length > 1) w.pitQCrossLink(U.groups);
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
    U.gi = +i; applyGroup(U); U.tab = 'data';
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
    U.元のPDF = null; U.印刷中 = '';
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
