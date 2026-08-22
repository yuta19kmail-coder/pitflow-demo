/* ========================================
   inspect.js  -  🩺 データチェックの**画面**  PitFlow v1.170.0
   ----------------------------------------
   ◎ここが受け持つこと＝**並べて見せるだけ。**
     🔴 何が「おかしい」かの判定は **js/inspect-rules.js の規則表1本**。
        ここに条件を1行も書かないこと（画面と規則が食い違ったら、直しようがなくなる）。
     ・重さ（要対応／確認／気づき）と分類の**名前も色もあちらの表から引く**。ここで綴らない。
     🔴 直せる欄（「ここを直す」）の中身は **js/inspect-fix.js の表1本**。ここで欄を組み立てない。

   ◎名前（v1.170.0・ゆうた指定 2026-08-22）
     🔴 **「点検」→「データチェック」に言い換えた。**
        ＝ PitFlow の中で「点検」は**車の12ヶ月点検・タスクボードの点検待ち**を指す言葉。
          同じ字でデータの見直しも呼ぶと、現場で必ず取り違える。
        ⚠ 車のほうの「点検」は**そのまま**（言い換えない）。

   ◎中の2つ（v1.170.0・ゆうた指定）
     🗣「ビューの中に **日常チェック** と **クォーターチェック** に一番上部で切り替えられるように」
       ・日常チェック …… いまの規則表（PitFlow の中だけで分かる矛盾）。お金はかからない
       ・クォーターチェック … ②売上チェックリストPDFの突合 ＋ ③AIチェック（およそ週1）

   ◎🔴🔴 v1.172.0（ゆうた指定 2026-08-22）**「やらなくていい」道は無い。全部直す。**
     🗣「今、非表示におれがクリックでしたものはチェックのルールから外す／
     　　この規則を出さないボタンを無くす／
     　　基本は0をキープし続ける感じで運用するし、売上データを確定させたり、
     　　会社全体の履歴として基本的には100％のつもりで運用するから、
     　　**やらなくていいよ みたいなニュアンス感をなくしてほしい。基本は全て修正する**」
     ・**「これでOK」** … 廃止。前に押したものも `sweepEscapes()` で**出し直す**
     ・**「この規則は出さない」** … 廃止。黙らせていた規則も**全部出す**
     ・**札を貼っても一覧から消えない** … 隠す道が1つも無い＝**出ている数がそのまま「直す数」**
     🔴 **ここに出ている数を 0 にするのが運用。0 になったら本当に 0。**
     🔴 逃げ道は**規則そのものを直す**1本だけ（この車では言わない、と理由を持って書く）。

   ◎使い方（ゆうた）
     ① 左のメニュー「データチェック」を開く → その場で全カードを見て、気になる所を並べます
     ② **ここを直す** … 🔴 v1.170.0 **指摘された欄だけ**を小窓で直す
          ＝ **アーカイブ済みの車でも誰でも直せる**（ゆうた指定）。ほかの欄は開きません。
          ⚠ **確定金額と確定日だけは、これまで通り管理者だけ**（見えるが直せない）。
     ③ 札は2つだけ。**どちらも行を消しません**（作業中の目印）
          見た … 目は通した。まだ直っていないので、直るまで出ます
          直した … 直したつもり。次のチェックで消えれば、本当に直っています
     ④ 「書き出し」＝②の突合・③のAI判断へ渡す JSON を落とします

   ⚠ 規則そのものは**1文字も書き換えません**（読んで、数えて、並べるだけ）。
      書き換えが起きるのは、人が「ここを直す」を押して保存した時だけ。
   ======================================== */
(function () {
  'use strict';

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }
  function man(n){ var m = (+n||0)/10000; return (Math.abs(m)>=100 ? Math.round(m) : Math.round(m*10)/10).toLocaleString() + '万'; }
  /* 走った時刻（時:分:秒）。⚠ 秒まで出す＝1分の間に2回押しても、変わったと分かる */
  function hhmm(iso){
    var d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    var p = function(n){ return (n < 10 ? '0' : '') + n; };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  /* 🔴 v1.170.0 いちばん上の切り替え（ゆうた指定）。**言葉はこの表1本**。画面で綴らない。 */
  var MODES = [
    { id:'daily',   label:'日常チェック',      note:'PitFlow の中だけで分かる食い違いを、毎日ここで拾います' },
    { id:'quarter', label:'クォーターチェック', note:'売上チェックリストPDFとの突合と、AIチェック（およそ週1）' }
  ];

  /* 画面の覚え（絞り込みと、開いている規則）。⚠ データではないので保存しない */
  /* ⚠ v1.172.0 `done`（片づけたものも見る）は使わなくなった。古い覚えが残っていても害は無い。 */
  var UI = window._insp = window._insp || { mode:'daily', level:'', cat:'', open:{}, all:{}, res:null };
  if (!UI.all) UI.all = {};
  if (!UI.mode) UI.mode = 'daily';
  var ROWS_CAP = 20;   /* 1つの規則で最初に出す件数（超えたぶんは「ほか◯件」で開く） */

  function cats(){ return window.PIT_INSPECT_CATS || []; }
  function levels(){ return window.PIT_INSPECT_LEVELS || []; }
  function markDefs(){ return window.PIT_INSPECT_MARKS || []; }
  function rules(){ return window.PIT_INSPECT_RULES || []; }
  function ruleById(id){ return rules().filter(function(r){ return r.id === id; })[0] || {}; }
  function levelOf(id){ return levels().filter(function(l){ return l.id === id; })[0] || {}; }
  function catOf(id){ return cats().filter(function(c){ return c.id === id; })[0] || {}; }

  /* ===== チェックする（規則は data を触らない） ===== */
  function run(){
    UI.res = window.pitInspectRun ? window.pitInspectRun() : null;
    return UI.res;
  }

  /* 🔴 v1.169.1（ゆうた報告「またチェックが動かない」）**画面ごと落とさない。**
     ◎なぜ要るか
       データチェックは**全カードを読む**画面なので、1台でも思わぬ形のデータがあると、
       そこで止まって**画面がまるごと真っ白**になる。しかも何も出ないので原因が分からない。
     🔴 つまずいたら、**つまずいたと言う**。黙って白くしない。
     ⚠ 規則1本ずつのつまずきは pitInspectRun 側で受け止めている。ここは**描く側**の保険。 */
  window.renderInspect = function () {
    var body = document.getElementById('inspect-body');
    if (!body) return;
    try { _renderInspect(body); }
    catch (e) {
      console.error('[inspect] 画面を描く途中でつまずきました', e);
      body.innerHTML = '<div class="ins-empty">'
        + '<b>データチェックの画面を出す途中でつまずきました。</b><br>'
        + 'いちど画面を開き直してみてください。それでも出ない時は、この文をそのまま伝えてください：<br>'
        + '<code>' + esc(String(e && e.message ? e.message : e)) + '</code>'
        + '</div>';
    }
  };

  /* いちばん上の切り替え（日常／クォーター） */
  function modeBar(){
    var h = '<div class="ins-mode">';
    MODES.forEach(function (m) {
      h += '<button class="ins-mode-b' + (UI.mode === m.id ? ' on' : '') + '"'
         +   ' onclick="pitInspectMode(\'' + m.id + '\')">'
         +   '<span class="ins-mode-l">' + esc(m.label) + '</span>'
         +   '<span class="ins-mode-n">' + esc(m.note) + '</span>'
         + '</button>';
    });
    return h + '</div>';
  }

  function _renderInspect(body) {
    if (!window.pitInspectRun){
      body.innerHTML = '<div class="ins-empty">データチェックの規則が読み込めていません。画面を開き直してください。</div>';
      return;
    }
    if (UI.mode === 'quarter'){ body.innerHTML = modeBar() + quarterHtml(); if (window.pitIcons) try { pitIcons(body); } catch(e){} return; }

    var res = run();

    /* ---- 絞り込みを通したあとの所見 ----
       🔴🔴 v1.169.2（ゆうた指定 2026-08-22）**「確実に全て出して」**
          ＝ v1.169.0 で入れた「いま動いている車／終わった記録」の**出し分けは全部やめた**。
            ボタン2つ → チェック1つ → **そもそも分けない**、の順で戻している。
          ⚠ データチェックが**黙って何かを隠す**と、出ていないものが有るのか無いのか分からなくなる。
             減らすなら**規則の側**でやる（この車では言わない、と理由を持って決める）。
             画面の側で隠すのはやらない。 */
    var lvN = res.byLevel, ctN = res.byCat;

    /* 🔴🔴 v1.172.0（ゆうた指定）**札で隠さない。**
       ◎前まで＝「見た／これでOK／直した」を押すと、その行は一覧から消えていた。
         ＝ **直っていないのに 0 件に見える**道が3つ空いていた。
       🔴 いま出ているものは**全部これから直すもの**。押しても消えない。
          本当に直れば、次のチェックで**規則の側から**消える。それが答え。
       ⚠ 絞り込み（重さ・分類）は今までどおり＝**人が見る順番を変えるだけ**で、数は隠さない。 */
    var pass = function (f) {
      if (UI.level && f.level !== UI.level) return false;
      if (UI.cat && f.cat !== UI.cat) return false;
      return true;
    };
    /* 🔴🔴 v1.173.0（ゆうた指定）**「確認した（合っている）」は下の別枠へ落とす。**
       ＝ 数からは外れるが、**消えはしない**（誰がいつ決めたかを含めて、いつでも見える）。 */
    var list = res.findings.filter(function (f) { return pass(f) && f.mark !== 'ok'; });
    var okList = res.findings.filter(function (f) { return pass(f) && f.mark === 'ok'; });

    var h = modeBar();

    /* ===== 上の帯（いつ・何台・いくつ） ===== */
    h += '<div class="ins-head">'
       /* 🔴 v1.169.2（ゆうた報告）「もう一度押しても動いてる感じがしない」
          ＝ 出していたのが**日付だけ**だったので、押しても字が1つも変わらなかった。
            中身が同じなら画面も同じ＝**本当に走ったのかどうかが分からない。**
          🔴 **走った時刻を出す。** 押すたびにここが変わる＝走った証拠になる。 */
       +   '<div class="ins-when">' + esc(res.today) + ' <b>' + esc(hhmm(res.at)) + '</b> にチェック'
       +     ' ／ 対象 <b>' + res.cards + '</b>台 ／ 規則 <b>' + res.rules + '</b>本'
       /* 🔴 v1.172.0 隠しているものは1件も無い＝そう言い切る */
       +     ' ／ これから直す <b>' + res.openN + '</b>件'
       +     (res.okN ? ' ／ 確認ずみ ' + res.okN + '件' : '')
       +   '</div>'
       /* 🔴 v1.173.0 起点日＝「この日より前に入れたぶんは、日付の前後を言わない」。
          🔴 **黙って効かせない。** いつからかを画面に出す（管理なら押して変えられる）。 */
       +   fromLine(res)
       /* 🔴🔴 v1.172.1（ゆうた訂正）**「出さない」を選んでいた規則が残っていたら、黙って隠さない。**
          ＝ これは「規則ごと消す予定」の控え。**名前を出して、消し忘れないようにする。** */
       +   ((res.mutedIds && res.mutedIds.length)
            ? '<div class="ins-tobe">⚠ <b>消す予定の規則 ' + res.mutedIds.length + '本</b>'
              + '（前に「出さない」を選んだもの。いまは出していません）：'
              + res.mutedIds.map(function(x){ return esc(x.title); }).join('／')
              + '</div>'
            : '')
       +   '<div class="ins-actions">'
       +     '<button class="ins-btn" id="ins-rerun" onclick="pitInspectRerun()">もう一度チェック</button>'
       +     '<button class="ins-btn" onclick="pitInspectDownload()">書き出し</button>'
       +   '</div>'
       + '</div>';

    /* ===== 重さのタイル（押すと絞り込み） ===== */
    h += '<div class="ins-tiles">';
    levels().forEach(function (l) {
      var v = lvN[l.id] || { n:0, open:0 };
      /* 🔴 v1.173.0 出す数は **open（これから直す数）**。
         ⚠ open から外れるのは「確認した」だけ（＝見て決める規則で、合っていると決めたもの）。
            「直した」の札では減らない＝**直っていないのに減る**を作らない。 */
      h += '<button class="ins-tile' + (UI.level === l.id ? ' on' : '') + '"'
         +   ' style="--ins-c:' + l.color + '" onclick="pitInspectFilter(\'level\',\'' + l.id + '\')">'
         +   '<span class="ins-tile-n">' + v.open + '</span>'
         +   '<span class="ins-tile-l">' + esc(l.label) + '</span>'
         +   '<span class="ins-tile-note">' + esc(l.note) + '</span>'
         + '</button>';
    });
    /* 🔴🔴 v1.172.0（ゆうた指定）**「片づけた◯件」はやめた。**
       ＝ 札を貼った数を誇らしく出すと「札を貼れば片づく」に見える。片づくのは**直した時だけ**。
       　 代わりに**この画面の運用そのもの**を1行で言う。 */
    h += '<div class="ins-goal">'
       +   (res.openN
             ? '<b>' + res.openN + '件</b>を直すと 0 になります。'
             : '<b>0件</b>です。この状態を保ちます。')
       +   '<span>売上を確定させ、会社の履歴として残すデータです。<b>基本は全部直します。</b></span>'
       + '</div>';
    h += '</div>';

    /* ===== 分類のタブ ===== */
    h += '<div class="ins-bar">'
       +   '<button class="ins-tab' + (UI.cat === '' ? ' on' : '') + '" onclick="pitInspectFilter(\'cat\',\'\')">すべて</button>';
    cats().forEach(function (c) {
      var v = ctN[c.id] || { n:0, open:0 };
      h += '<button class="ins-tab' + (UI.cat === c.id ? ' on' : '') + '" title="' + esc(c.note) + '"'
         +   ' onclick="pitInspectFilter(\'cat\',\'' + c.id + '\')">' + esc(c.label)
         +   '<span class="ins-tab-n">' + v.open + '</span></button>';
    });
    /* 🔴 v1.172.0 「片づけたものも見る」は**要らなくなった**（隠しているものが1件も無い） */
    h += '</div>';

    /* ===== 中身（規則ごとにまとめる） ===== */
    if (!list.length){
      /* 🔴 v1.172.0 0件は**保つもの**。「気にしなくていい」ではなく「この状態を保つ」と言う。 */
      h += '<div class="ins-ok">'
         +   '<b>0件です。</b>'
         +   '<span>' + (UI.level || UI.cat
                 ? 'いまの絞り込みでは 0件です。ほかの絞り込みも見てください。'
                 : res.cards + '台ぜんぶ、規則にひっかかる所はありません。この状態を保ちます。') + '</span>'
         + '</div>';
    } else {
      var groups = [], byRule = {};
      list.forEach(function (f) {
        if (!byRule[f.ruleId]) { byRule[f.ruleId] = []; groups.push(f.ruleId); }
        byRule[f.ruleId].push(f);
      });
      groups.forEach(function (rid) {
        var fs = byRule[rid], r0 = fs[0], lv = levelOf(r0.level), ct = catOf(r0.cat);
        var open = (UI.open[rid] !== false);       /* 既定は開いておく（見落とさないように） */
        h += '<section class="ins-g' + (open ? '' : ' shut') + '" style="--ins-c:' + lv.color + '">'
           +   '<div class="ins-g-h" onclick="pitInspectOpen(\'' + rid + '\')">'
           +     '<span class="ins-g-lv">' + esc(lv.label) + '</span>'
           +     '<span class="ins-g-t">' + esc(r0.title) + '</span>'
           +     '<span class="ins-g-cat">' + esc(ct.label) + '</span>'
           +     '<span class="ins-g-n">' + fs.length + '件</span>'
           +     '<span class="ins-g-x">' + (open ? '▾' : '▸') + '</span>'
           +   '</div>';
        if (open){
          /* 🔴🔴 v1.172.0（ゆうた指定）**「この規則は出さない」ボタンは撤去した。**
             ＝ 規則まるごと黙らせる＝**いちばん太い「やらなくていい」道**だった。
             　 うちのやり方に合っていないなら、**規則そのものを直す**（そのほうが全員に効く）。 */
          h += '<div class="ins-g-why">'
             +   '<div><b>なぜ出したか</b>' + esc(r0.why) + '</div>'
             +   '<div><b>どうする</b>' + esc(r0.fix) + '</div>'
             + '</div>';
          /* 🔴 1つの規則で何百件も出ることがある（古いデータの抜けなど）。
             全部そのまま並べると**画面が使えなくなり、ほかの規則が見えなくなる**ので、
             最初は上から少しだけ出して、押した時だけ全部出す。
             ⚠ 隠した件数は必ず言う（黙って切り捨てない）。 */
          var cap = (UI.all[rid] ? fs.length : ROWS_CAP);
          h += '<div class="ins-rows">';
          fs.slice(0, cap).forEach(function (f) { h += row(f); });
          h += '</div>';
          if (fs.length > cap){
            h += '<button class="ins-more" onclick="pitInspectAll(\'' + rid + '\')">'
               +   'ほか ' + (fs.length - cap) + '件を出す</button>';
          } else if (UI.all[rid] && fs.length > ROWS_CAP){
            h += '<button class="ins-more" onclick="pitInspectAll(\'' + rid + '\')">上の ' + ROWS_CAP + '件だけにする</button>';
          }
        }
        h += '</section>';
      });
    }
    h += okSection(okList);      /* 🔴 v1.173.0 確認したものは消さずに下へ */

    body.innerHTML = h;
    if (window.pitIcons) try { pitIcons(body); } catch(e){}
  }

  /* ================================================================
     クォーターチェック（②売上チェックリストPDFの突合 ＋ ③AIチェック）
     ----------------------------------------------------------------
     🔴 v1.170.0 いまは**器だけ**。器のうちに「何が要るか」を画面に出しておく
        ＝ 空の画面を出して「まだです」と黙るより、**次に何をすれば動くか**が分かる。
     🔴 クォーターの区切り（月4分割）は **売上の物差し（pitQuarterOf）を借りる**。
        ここで `1〜7日` と書き写さない（区切りを変えた日に片方だけ古くなる）。
     ================================================================ */
  function quarterHtml(){
    var q = window.pitQuarterOf ? window.pitQuarterOf() : null;
    var res = UI.res || run();
    var openN = res ? res.findings.filter(function(f){ return !f.mark; }).length : 0;

    var h = '';
    h += '<div class="ins-q-head">'
       +   '<div class="ins-q-now">' + (q ? esc(q.label) : 'クォーター')
       +     (q ? ' <span>' + esc(q.s) + ' 〜 ' + esc(q.e) + '</span>' : '')
       +   '</div>'
       +   '<div class="ins-q-sub">クォーター＝1か月を4つに分けた区切り（1〜7日／8〜15日／16〜23日／24日〜末日）。'
       +     'およそ週に1度、まとめて見直すための単位です。</div>'
       + '</div>';

    h += '<div class="ins-q-steps">';

    h += '<section class="ins-q-step">'
       +   '<div class="ins-q-st"><span class="ins-q-no">②</span>売上チェックリストPDFとの突合</div>'
       +   '<div class="ins-q-sd">整備ソフトから出した売上チェックリストPDFと、PitFlow の実績を1台ずつ突き合わせます。'
       +     '<b>PitFlow にしか無い車・整備ソフトにしか無い車・金額の違う車</b>を出します。</div>'
       +   '<div class="ins-q-todo"><b>動かすのに要るもの</b>'
       +     '<ul><li>その期間の売上チェックリストPDF（整備ソフトから）</li>'
       +     '<li>下の「書き出し」で落とした、PitFlow 側のデータ</li></ul></div>'
       +   '<div class="ins-q-soon">いまは手作業でお預かりして突き合わせています。画面の中で回せるようになったら、ここに出ます。</div>'
       + '</section>';

    h += '<section class="ins-q-step">'
       +   '<div class="ins-q-st"><span class="ins-q-no">③</span>AIチェック</div>'
       +   '<div class="ins-q-sd">日常チェックと②の結果をまとめてAIに読ませ、'
       +     '<b>規則では拾えない粗さ</b>（同じ人・同じ工程でくり返し起きている抜け、'
       +     '入力が後回しになっている車）を出します。</div>'
       +   '<div class="ins-q-todo"><b>いまはまだ足りないもの</b>'
       +     '<ul><li><b>母数</b>＝担当ごとの担当台数（何台のうち何件かが分からないと、人を比べられません）</li>'
       +     '<li><b>車の中身</b>＝フローとメモ（文章が無いと「なぜ止まったか」が読めません）</li>'
       +     '<li><b>前回の書き出し</b>（1回だけの出来事と、くり返しているクセを見分けるため）</li></ul></div>'
       +   '<div class="ins-q-soon">⚠ 3つがそろうまでは、AIは「一度きりの出来事」を「クセ」と読み違えます。'
       +     'そろえてから動かします。</div>'
       + '</section>';

    h += '</div>';

    h += '<div class="ins-q-foot">'
       +   '<div class="ins-q-fn">いまの日常チェックは <b>' + openN + '</b>件（片づけていないもの）。'
       +     'この中身がそのまま②③へ渡ります。</div>'
       +   '<div class="ins-actions">'
       +     '<button class="ins-btn" onclick="pitInspectMode(\'daily\')">日常チェックを見る</button>'
       +     '<button class="ins-btn" onclick="pitInspectDownload()">書き出し</button>'
       +   '</div>'
       + '</div>';
    return h;
  }

  /* 🔴🔴 v1.173.0 起点日の1行（＝日付の前後を見る範囲）。**黙って効かせない。**
     管理なら押して変えられる。物差しは card-view.js の `pitCanEditFinal`（管理かどうか）を借りる。 */
  function fromLine(res){
    var can = !window.pitCanEditFinal || !!pitCanEditFinal();
    var v = res.from || '';
    return '<div class="ins-from">'
      + '<span>日付の前後（返車予定・実績が入庫より前）を見るのは、'
      + (v ? '<b>' + esc(v) + '</b> 以降に入庫した車から' : '<b>ぜんぶの車</b>')
      + 'です。'
      + (v ? '<small>それより前は、本番を始めた時にまとめて入れたぶんなので言いません。</small>' : '')
      + '</span>'
      + (can
          ? '<input class="ins-fromin" type="date" value="' + esc(v) + '" onchange="pitInspectSetFrom(this.value)">'
            + (v ? '<button class="ins-fromclr" onclick="pitInspectSetFrom(\'\')">ぜんぶ見る</button>' : '')
          : '<span class="ins-fromlock">変えられるのは管理だけです</span>')
      + '</div>';
  }

  /* 🔴 v1.173.0 「確認した（合っている）」の別枠。**消さずに、数から外す。** */
  function okSection(list){
    if (!list.length) return '';
    var open = UI.okOpen === true;
    var h = '<section class="ins-okbox' + (open ? '' : ' shut') + '">'
          + '<div class="ins-okh" onclick="pitInspectOkOpen()">'
          +   '<b>確認した（合っている）</b><span>' + list.length + '件</span>'
          +   '<i>' + (open ? '▾' : '▸') + '</i>'
          + '</div>';
    if (open){
      h += '<div class="ins-rows">';
      list.forEach(function (f) { h += row(f); });
      h += '</div>';
    }
    return h + '</section>';
  }

  /* 1件ぶんの行 */
  function row(f){
    var mk = markDefs().filter(function(m){ return m.id === f.mark; })[0];
    var who = esc(f.name || '');
    var sub = [];
    if (f.car)   sub.push(esc(f.car));
    if (f.plate) sub.push(esc(f.plate));
    if (f.state) sub.push(esc(f.state));
    if (f.div)   sub.push(esc(f.div));
    if (f.amount) sub.push(man(f.amount));
    if (f.resNo) sub.push('No.' + esc(f.resNo));

    /* 🔴 v1.168.0（ゆうた指定）**担当をお客様名のとなりに出す。**
       ・色は課の色（規則表が渡してくる `staffColor`）。⚠ ここで色を綴らない
       ・決まっていなければ「担当なし」＝黙らずに、決まっていないことを言う
       ・車検の所見は**回送の担当**も足す（フロントとは別の人） */
    var badge = '';
    if (f.kind === 'card'){
      badge = f.staff
        ? '<span class="ins-who-st" style="--ins-s:' + (f.staffColor || 'var(--text3)') + '">' + esc(f.staff) + '</span>'
        : '<span class="ins-who-st none">担当なし</span>';
      if (f.staff2) badge += '<span class="ins-who-st2">車検 ' + esc(f.staff2) + '</span>';
      else if (f.cat === 'shaken') badge += '<span class="ins-who-st2 none">車検担当なし</span>';
    }

    /* 🔴 v1.173.0 見て決める規則は、その場で分かるように印を出す（直せる所と混ぜない） */
    var jb = f.judge ? '<span class="ins-judge">見て決める</span>' : '';
    var okby = (f.mark === 'ok' && (f.markAt || f.markBy))
      ? '<span class="ins-okby">' + esc([f.markBy, f.markAt].filter(Boolean).join('・')) + '</span>' : '';
    var h = '<div class="ins-row' + (f.mark ? ' done' : '') + '">'
          +   '<div class="ins-row-m">'
          +     '<div class="ins-row-who">' + who + badge + jb
          +       (mk ? '<span class="ins-badge">' + esc(mk.label) + '</span>' : '') + okby + '</div>'
          +     (sub.length ? '<div class="ins-row-sub">' + sub.join('　/　') + '</div>' : '')
          +     '<div class="ins-row-txt">' + esc(f.text) + '</div>'
          +   '</div>'
          +   '<div class="ins-row-b">';
    /* 🔴🔴 v1.170.0（ゆうた指定）**「ここを直す」＝指摘された欄だけの小窓。**
       ・**アーカイブ済みの車でも誰でも押せる**（そこが今回の大きな変化）
       ・出す／出さないは inspect-fix.js の表が決める（欄が1つに決まらない規則には出ない）
       ⚠ 確定金額・確定日は小窓の中で「🔒 管理のみ」になる（表が持っている） */
    var canFix = window.pitFixFieldsFor ? (window.pitFixFieldsFor(f) || []).length : 0;
    if (canFix) h += '<button class="ins-fixb" onclick="pitFixOpen(\'' + esc(f.key) + '\')">ここを直す</button>';
    if (f.kind === 'card' && f.refId) h += '<button class="ins-open" onclick="pitInspectGo(\'' + esc(f.refId) + '\')">開く</button>';
    if (f.kind === 'veh')             h += '<button class="ins-open" onclick="showView(\'fleet\')">車両管理</button>';
    /* 🔴🔴 v1.173.0（ゆうた指定）**「確認した（合っている）」は要判断の規則にだけ出す。**
       ＝ 抜け・矛盾（金額が空・日付が空・状態が食い違う）には**絶対に出さない**＝直すしかない。
       ⚠ 出す／出さないは**規則の表が持っている**（画面で規則IDを並べない）。 */
    markDefs().forEach(function (m) {
      if (m.judge && !f.judge) return;
      h += '<button class="ins-mk' + (f.mark === m.id ? ' on' : '') + (m.judge ? ' judge' : '') + '"'
         +   ' title="' + esc(m.note) + '"'
         +   ' onclick="pitInspectMarkUI(\'' + esc(f.key) + '\',\'' + m.id + '\')">' + esc(m.label) + '</button>';
    });
    h += '</div></div>';
    return h;
  }

  /* ===== ボタンの受け口 ===== */
  window.pitInspectMode = function (m) { UI.mode = m; renderInspect(); };
  window.pitInspectFilter = function (kind, v) {
    if (kind === 'level') UI.level = (UI.level === v ? '' : v);
    else UI.cat = v;
    renderInspect();
  };
  /* 🔴 v1.172.0 「片づけたものも見る」は廃止（隠しているものが1件も無い）。
     ⚠ 古い呼び出しから来ても落ちないように、口だけ残して**何もしない**。 */
  window.pitInspectToggleDone = function () { renderInspect(); };
  window.pitInspectOpen = function (rid) { UI.open[rid] = (UI.open[rid] === false); renderInspect(); };
  window.pitInspectAll = function (rid) { UI.all[rid] = !UI.all[rid]; renderInspect(); };
  window.pitInspectOkOpen = function () { UI.okOpen = !UI.okOpen; renderInspect(); };
  /* 🔴🔴 v1.173.0 起点日を決める（管理だけ）。⚠ 会社ぜんぶの数字が動くので、画面から消すだけにしない。 */
  window.pitInspectSetFrom = function (v) {
    if (window.pitCanEditFinal && !pitCanEditFinal()){
      if (window.UI && UI.alert) UI.alert('日付の前後を見る起点日を変えられるのは、設定権限（管理）のある人だけです。',
                                          { title:'変更できません', code:'PF-0022' });
      return;
    }
    v = String(v || '').trim();
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    if (!window.state) return;
    state.settings = state.settings || {};
    var before = state.settings.inspectFrom || '（決めていない）';
    state.settings.inspectFrom = v;
    if (window.PitDB && PitDB.save) PitDB.save();
    if (window.pitLog) pitLog('データチェックの起点日を変更', { kind:'inspect',
      label: before + ' → ' + (v || '（決めていない＝ぜんぶ見る）') });
    if (window.pitToast) pitToast(v ? (v + ' 以降に入庫した車から見ます') : 'ぜんぶの車を見ます');
    renderInspect();
  };

  window.pitInspectMarkUI = function (key, v) {
    var cur = (window.state && state.inspectMarks && state.inspectMarks[key] && state.inspectMarks[key].v) || '';
    window.pitInspectMark(key, cur === v ? '' : v);   /* もう一度押したらはがす */
    renderInspect();
  };

  /* 🔴🔴 v1.172.0（ゆうた指定）**「この規則は出さない」は廃止。**
     ボタンも窓も消した。口だけ残してあるのは、古い画面から呼ばれても落ちないため。 */
  window.pitInspectMuteUI = function () {
    if (window.pitToast) pitToast('「この規則は出さない」はやめました。直すか、規則そのものを見直してください');
  };

  /* 🔴 v1.169.2 「もう一度チェック」＝押したことが分かるようにする。
     ・上の時刻が変わる（走った証拠）
     ・ボタンが一瞬「チェック中…」になる
     ・件数が変わっていなくても「変わっていない」と言い切る（黙らない）
     ⚠ 変わっていない時にこそ、押した人は不安になる。**必ず何か言う。** */
  window.pitInspectRerun = function () {
    var btn = document.getElementById('ins-rerun');
    /* 🔴 v1.172.0 数えるのは**全部**（札で減らさない） */
    var before = UI.res ? UI.res.findings.length : null;
    if (btn) { btn.textContent = 'チェック中…'; btn.disabled = true; }
    setTimeout(function () {
      renderInspect();
      var after = UI.res ? UI.res.findings.length : 0;
      if (window.pitToast) {
        pitToast(before == null || before === after
          ? 'チェックしました。変わりはありません（' + after + '件）'
          : 'チェックしました。' + before + '件 → ' + after + '件');
      }
    }, 60);   /* 「チェック中…」が一瞬でも見えるように、描き直しを次の順番へ回す */
  };

  /* カードを開く。⚠ 開き方は card-detail.js の1本（ここで窓を作らない） */
  window.pitInspectGo = function (id) { if (window.openDetail) openDetail(id); };

  /* ②突合・③AI判断へ渡す JSON を落とす */
  window.pitInspectDownload = function () {
    var out = window.pitInspectExport(UI.res || run());
    var name = 'PitFlowデータチェック_' + out.今日 + '.json';
    var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    if (window.pitToast) pitToast(name + ' を書き出しました');
  };

  window.PIT_INSPECT_MODES = MODES;
})();
