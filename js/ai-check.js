/* ================================================================================
   ai-check.js  -  🤖 クォーターチェック③ 伝票の中身を見る（内容と原価）  PitFlow v2.3.0
   ================================================================================
   ◎🔴🔴 v2.3.0 で**まるごと入れ替えた**（ゆうた 2026-08-24）
     🗣「既存の全体を見るのではなく、付け合わせようにアップロードしたPDFの中身の確認に全ぶりする」
     🗣「基本的には内容や原価に関してチェックしていくイメージ」
     ＝ 前は「日常チェックと突合の結果を全体で読ませて、工程のクセを出す」ものだった。
        v2.3.0 からは **入れたPDFの伝票そのもの**（作業・部品・原価）だけを見る。

   ◎なぜ機械の判定だけでは足りないのか
     🗣「原価率も純正部品なら95掛けとかはざらだがOEMなら50掛けとかも存在するし、
        産廃ショートパーツなどなら実質的な原価はないので1を入力してある」
     🗣「例えばラジエターでも純正しかない車種、社外がある車種、国産車、輸入車などのバリエーション」
     ＝ 過去5か月を数えたら、掛け率は本当に3つの山に分かれていた。しかも**同じ車種の中でも**
        純正と社外の両方を使っている（ギャランフォルティスのラジエターが64%〜90%）。
        ＝ 車種で割っても決まらない。**車種と作業内容から見当をつける所が、AI の仕事。**

   ◎🔴 決めごと
     🔴 **数字（うちの覚え）が先。AI はそのあと。**
        覚えと照らすところ（quarter-cost.js）は**お金がかからない**。
        AI を走らせなくても、気になる行は並ぶ。
     🔴 **AI は確度を付けるだけ。断定させない。**
        🗣「AIに確度を持たせて報告する感じかな　最終的にはさらに紙での付け合わせもある」
     🔴 **件数で切らない。** 外れの大きい順に並べて、上から見てもらう（ゆうた指定）。
     🔴 **鍵は画面に置かない。** 聞くのはサーバー（`functions/index.js` の `pfAsk`）を通す。
     🔴 **お金がかかるので「管理」だけ。** 画面で隠すだけにせず、サーバー側でも止めている。
     🔴 **送るのは伝票の中身だけ。** 電話番号・住所は送らない（そもそも伝票に無い）。
        お名前は、どの伝票かを言うために要るぶんだけ。

   ◎ここが返すもの
     pitAiHtml() … クォーターチェックの③の中身（画面）
     pitAiRun()  … AI に見立てを付けてもらう
   ================================================================================ */
(function (w) {
  'use strict';

  function esc(x){ return String(x==null?'':x).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }
  function s(v){ return String(v == null ? '' : v); }
  function t(v){ return s(v).trim(); }
  function num(v){ v = +v; return isFinite(v) ? v : 0; }
  function yen(n){ return (+n || 0).toLocaleString(); }

  var MODEL = 'claude-sonnet-5';
  var SEND  = 80;   /* 🔴 AI に渡す行の数（効きの大きい順に、ここまで）。多く送るほどお金がかかる */

  function A(){
    var U = w._insp = w._insp || {};
    U.ai = U.ai || { busy:'', err:'', 見立て:null, at:'', usage:null, tab:'掛け率' };
    return U.ai;
  }
  function Q(){ return (w._insp && w._insp.q) || {}; }
  function isAdmin(){ try { return !!(w.pitCanEditFinal && w.pitCanEditFinal()); } catch (e) { return false; } }
  function isCloud(){ return !!w.PIT_CLOUD; }

  /* ================================================================
     1. 材料＝いま入れているPDFの伝票
     🔴 いま開いているクォーターのぶんだけ。画面に出ていないものは見ない。
     ================================================================ */
  function slips(){
    var U = Q();
    var g = (U.groups || [])[U.gi];
    var a = (g && g.soft) || U.soft || [];
    return (a || []).filter(function (x) { return x && (x.明細 || []).length; });
  }
  function rows(){
    if (!w.pitCostLookAll) return [];
    return w.pitCostLookAll(slips());
  }
  /* 行に名前を付ける（AI の返事と結びつけるため） */
  function idOf(x){ return t(x.伝票) + '#' + (x.種 === '抜け' ? ('な:' + t(x.名)) : t(x.i)); }

  /* ================================================================
     2. 聞き方（🔴 言葉づかいはここ1本。画面で綴らない）
     ================================================================ */
  var SYSTEM = [
    'あなたは自動車整備工場のベテラン整備士です。相手は工場長（非エンジニア）です。',
    'その工場の**過去5か月の実績**から作った「うちのふつう」と、今回の伝票を見くらべた結果が渡されます。',
    '',
    '# あなたの仕事',
    'ひとつひとつの行について、**どのくらい怪しいか（確度）**と、**なぜそう見えるか**を書く。',
    '直せとは言わない。工場長がこのあと**紙の伝票と照らして自分で決める**ための材料を出す。',
    '',
    '# 守ること',
    '- **断定しない。**「〜のように見えます」「〜の可能性があります」と書く。',
    '- **理由のある外れを、外れと言わない。** 純正を社外（OEM）に替えれば掛け率は下がるし、',
    '  逆に社外が出回っていない車種で純正を使えば上がる。**車種と作業内容から、まずそこを考える。**',
    '- 部品が入っていない時は、**持ち込み・在庫品・その車では不要**の可能性を先に考える。',
    '- **専門用語・アプリの中の名前を書かない。** 現場の言葉だけ。',
    '- 分からないことは「分からない」と書く。**それらしい推測で埋めない。**',
    '- 1行あたり日本語で50字以内。長く書かない。',
    '',
    '# 確度の付けかた',
    '高 … 車種と内容を考えても説明がつかない。まず見たほうがよい。',
    '中 … 説明はつきそうだが、一応確かめたい。',
    '低 … ふつうに起こりうる。見なくてもよい。',
    '',
    '# 返す形（JSONだけ。前後に文章を書かない）',
    '{"見立て":[{"id":"（渡されたidをそのまま）","確度":"高|中|低","なぜ":"（50字以内）"}]}',
    '渡された行は**すべて**返す。順番は変えてよい。'
  ].join('\n');

  function material(){
    var all = rows();
    var send = all.slice(0, SEND);
    var pick = {};
    send.forEach(function (x) { pick[t(x.伝票)] = 1; });
    var ctx = slips().filter(function (sl) { return pick[t(sl.伝票)]; }).map(function (sl) {
      return {
        伝票: t(sl.伝票), 売上日: t(sl.売上日), 車種: t(sl.車種), お客様: t(sl.顧客名),
        中身: (sl.明細 || []).map(function (m, i) {
          var o = { 行: i, 種: t(m.種), 名: t(m.名), 数量: num(m.数量),
                    単価: num(m.単価), 金額: num(m.金額), 原価: num(m.原価) };
          if (t(m.ことわり)) o.ことわり = t(m.ことわり);   /* 持ち込み／部品サービス／工賃サービス */
          return o;
        })
      };
    });
    return {
      いつ: new Date().toISOString().slice(0, 10),
      うちの覚え: '過去の売上チェックリスト 2026-03〜2026-07（伝票864枚）から作ったもの',
      ことわりの意味: '持ち込み＝お客様が部品を持ってきた（売上は立たない）／'
                    + '部品サービス・工賃サービス＝こちらで無料にした',
      見てほしい行: send.map(function (x) {
        var o = { id: idOf(x), 伝票: t(x.伝票), 種: t(x.種), 品名: t(x.名), 車種: t(x.車) };
        if (x.種 === '掛け率' || x.種 === '両方'){
          o.いまの掛け率 = x.いま + '%'; o.うちのふつう = x.ふだん[0] + '〜' + x.ふだん[1] + '%';
          o.売価 = x.金額; o.原価 = x.原価; o.覚えの回数 = x.回;
          if (x.両) o.注 = 'ふだんから純正も社外も両方使っている品名';
        }
        if (x.種 === '売価'){
          o.いまの売価 = x.いま; o.うちのふつう = x.ふだん[0] + '〜' + x.ふだん[1] + '円';
          o.覚えの回数 = x.回; o.車種の覚えか = !!x.車の覚え;
        }
        if (x.種 === '抜け'){
          o.きっかけの作業 = t(x.きっかけ); o.ふつう入る割合 = x.割合 + '%'; o.覚えの回数 = x.回;
        }
        if (x.種 === '初めて'){ o.売価 = x.金額; o.原価 = x.原価; }
        return o;
      }),
      伝票の中身: ctx
    };
  }

  /* ================================================================
     3. 走らせる
     ================================================================ */
  w.pitAiRun = function (){
    var U = A();
    if (U.busy) return;
    if (!slips().length){
      U.err = '先に②で売上チェックリストPDFを入れてください。';
      if (w.renderInspect) renderInspect(); return;
    }
    if (!isCloud()){
      U.err = 'AIチェックは本番の PitFlow でだけ動きます（練習用サイトでは動きません）。';
      if (w.renderInspect) renderInspect(); return;
    }
    if (!isAdmin()){
      if (w.UI && UI.alert) UI.alert('AIチェックを走らせられるのは、設定権限（管理）のある人だけです。',
                                     { title:'走らせられません', code:'PF-0023' });
      return;
    }
    if (!w.firebase || !w.firebase.app || !w.firebase.app().functions){
      U.err = 'AIに聞く窓口が読み込めていません。画面を開き直してください。';
      if (w.renderInspect) renderInspect(); return;
    }
    var m;
    try { m = material(); }
    catch (e){ U.err = '材料を作る途中でつまずきました：' + s(e && e.message); if (w.renderInspect) renderInspect(); return; }

    U.busy = 'AIに聞いています…'; U.err = '';
    if (w.renderInspect) renderInspect();

    var fn = w.firebase.app().functions('asia-northeast1').httpsCallable('pfAsk');
    fn({ model: MODEL, system: SYSTEM,
         user: '次の資料を読んで、決められたJSONの形だけで答えてください。\n\n```json\n'
             + JSON.stringify(m, null, 1) + '\n```',
         max_tokens: 8000 })
      .then(function (r) {
        var d = (r && r.data) || {};
        U.busy = ''; U.at = new Date().toLocaleString('ja-JP'); U.usage = d.usage || null;
        var got = parse(s(d.text));
        if (!got){ U.err = 'AIの返事を読み取れませんでした。もう一度走らせてみてください。'; }
        else {
          U.見立て = {};
          got.forEach(function (x) { if (x && x.id) U.見立て[t(x.id)] = { 確度: t(x.確度), なぜ: t(x.なぜ) }; });
        }
        if (w.pitLog) pitLog('伝票の中身をAIに見てもらった', { kind:'inspect',
          label: '見てほしい行 ' + (m.見てほしい行 || []).length + '件' });
        if (w.renderInspect) renderInspect();
      })
      .catch(function (e) {
        U.busy = ''; U.err = s((e && e.message) || e);
        if (w.renderInspect) renderInspect();
      });
  };

  /* 🔴 返事は JSON のはず。前後に文章が付いていても拾う（黙って落とさない）。 */
  function parse(txt){
    var a = txt.indexOf('{'), b = txt.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try {
      var o = JSON.parse(txt.slice(a, b + 1));
      return (o && o.見立て && o.見立て.length) ? o.見立て : null;
    } catch (e) { return null; }
  }

  /* 送る材料をそのまま落とす（何を送っているか、いつでも自分で確かめられるように） */
  w.pitAiDownload = function (){
    try {
      var m = material();
      var name = 'PitFlow伝票チェック材料_' + m.いつ + '.json';
      var blob = new Blob([JSON.stringify(m, null, 1)], { type:'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      if (w.pitToast) pitToast(name + ' を書き出しました');
    } catch (e) { if (w.pitToast) pitToast('書き出せませんでした'); }
  };

  /* ================================================================
     4. 画面
     🔴 AI を走らせる前でも、**数字だけで並ぶ**（お金をかけずに使える）
     ================================================================ */
  var TABS = [
    { id:'掛け率', 名:'掛け率がちがう', 説:'原価 ÷ 売価が、うちのふだんの幅から外れている' },
    { id:'売価',   名:'売価がちがう',   説:'その品を、ふだんと違う値段で出している' },
    { id:'抜け',   名:'いつものが無い', 説:'この作業なら、ふつう一緒に出る部品が入っていない' },
    { id:'初めて', 名:'初めて見る品名', 説:'過去5か月の伝票に無い品名。数字では何も言えない' },
    /* 🔴 ゆうた指定＝ふだんから両方使う品名は**外れ扱いにしない**。ここに寄せて、見たい時だけ開ける。 */
    { id:'両方',   名:'両方使う品名',   説:'純正も社外もふだんから使っている品名。参考まで' }
  ];
  var ORD = { 高:0, 中:1, 低:2 };

  function mark(x, U){
    var v = U.見立て && U.見立て[idOf(x)];
    return { 確度: (v && v.確度 && ORD[v.確度] != null) ? v.確度 : x.確度,
             なぜ: (v && v.なぜ) || '', AI: !!v };
  }

  w.pitAiHtml = function (){
    var U = A(), sl = slips();
    var h = '<div class="ai-sub">入れた売上チェックリストPDFの<b>中身</b>（作業・部品・原価）を、'
          + '<b>うちの過去5か月</b>と照らします。<b>ふだんと違うところ</b>だけを、大きい順に並べます。</div>';

    if (!sl.length){
      return h + '<div class="ai-note">先に②で売上チェックリストPDFを入れてください。'
               + '<span>入れた伝票の中身を、そのまま見ます。</span></div>';
    }

    var all = rows();
    var byTab = {};
    all.forEach(function (x) { (byTab[x.種] = byTab[x.種] || []).push(x); });

    h += '<div class="ai-run">'
       +   '<button class="ai-b" ' + (U.busy ? 'disabled' : '') + ' onclick="pitAiRun()">'
       +     (U.busy ? esc(U.busy) : (U.見立て ? 'もう一度AIに見てもらう' : 'AIに見立てを付けてもらう')) + '</button>'
       +   '<span class="ai-cost">'
       +     (U.見立て ? ('AIの見立て入り　' + esc(U.at)) : '下の並びは、AIを使わなくても出ています')
       +     '　／　AIに渡すのは大きいほうから ' + Math.min(all.length, SEND) + '件'
       +   '</span>'
       +   '<button class="ai-b2" onclick="pitAiDownload()">送るものを書き出す</button>'
       + '</div>';

    /* 🖨 v2.4.0（ゆうた指定）**元のPDFに刷り込んで、同じ形のまま出し直す。**
       🗣「これって直にPDFに記載を入れて 元の形のまま再印刷するようにはできる？」
       🔴 紙に落とすのは **まず見たい（高・中）だけ**。低まで刷ると紙が真っ赤になって読めない。 */
    var pr = w.pitQPrintCan ? w.pitQPrintCan() : { ok:false, why:'' };
    var Uq = Q();
    h += '<div class="ai-pr">'
      +  '<button class="ai-b3" ' + ((pr.ok && !Uq.印刷中) ? '' : 'disabled') + ' onclick="pitQPrintGo()">'
      +    (Uq.印刷中 ? esc(Uq.印刷中) : '元のPDFに刷り込んで出す') + '</button>'
      +  '<span class="ai-pr-n">'
      +    (pr.ok
           ? ('元の紙はそのまま。<b>まず見たい ' + pr.n + '件</b>に色の帯と番号を刷って、最後に一覧のページを足します。')
           : esc(pr.why))
      +  '</span>'
      + '</div>';

    if (U.err) h += '<div class="ai-ng"><b>走らせられませんでした。</b><span>' + esc(U.err) + '</span></div>';

    /* 4つの入り口（②と同じ形にしてある＝覚えることを増やさない） */
    h += '<div class="ai-gr">';
    TABS.forEach(function (T) {
      var a = byTab[T.id] || [];
      var hi = a.filter(function (x) { return mark(x, U).確度 === '高'; }).length;
      h += '<button class="ai-grb' + (U.tab === T.id ? ' on' : '') + (hi ? ' hot' : '') + '"'
         + ' onclick="pitAiTab(\'' + T.id + '\')">'
         +   '<span class="ai-grb-t">' + esc(T.名) + '</span>'
         +   '<span class="ai-grb-n">' + a.length + '</span>'
         +   '<span class="ai-grb-s">' + (hi ? ('まず見たい ' + hi + '件') : esc(T.説)) + '</span>'
         + '</button>';
    });
    h += '</div>';

    var list = (byTab[U.tab] || []).slice();
    /* 🔴 並びは、AI の見立てを入れたあとの確度が先。同じ確度なら、お金で効く順。 */
    list.sort(function (a, b) {
      var ga = ORD[mark(a, U).確度], gb = ORD[mark(b, U).確度];
      if (ga == null) ga = 9;
      if (gb == null) gb = 9;
      if (ga !== gb) return ga - gb;
      return num(b.効き) - num(a.効き);
    });

    if (!list.length) return h + '<div class="ai-none">ここに出るものはありません。</div>';

    h += '<div class="ai-list">';
    list.forEach(function (x) { h += card(x, U); });
    h += '</div>';
    h += '<div class="ai-foot">⚠ ここに出ているのは<b>「うちのふだんと違う」という事実だけ</b>です。'
       + 'まちがいとは言っていません。<b>紙の伝票と照らして、決めるのは人です。</b></div>';
    return h;
  };

  function card(x, U){
    var v = mark(x, U);
    var cls = v.確度 === '高' ? 'hi' : (v.確度 === '中' ? 'md' : 'lo');
    var h = '<div class="ai-c ' + cls + '">'
          + '<div class="ai-c-h"><span class="ai-g">' + esc(v.確度) + '</span>'
          +   '<b>' + esc(x.名) + '</b>'
          +   '<span class="ai-c-car">' + esc(x.車 || '—') + '</span>'
          +   '<span class="ai-c-s">' + esc(x.売上日) + '　' + esc(x.客) + '　伝票 ' + esc(x.伝票) + '</span>'
          + '</div><div class="ai-c-b">';
    if (x.種 === '掛け率' || x.種 === '両方'){
      h += kv('いま', x.いま + '%') + kv('うちのふだん', x.ふだん[0] + '〜' + x.ふだん[1] + '%')
         + kv('売価', yen(x.金額) + '円') + kv('原価', yen(x.原価) + '円')
         + kv('覚えの回数', x.回 + '回');
    } else if (x.種 === '売価'){
      h += kv('いま', yen(x.いま) + '円')
         + kv(x.車の覚え ? 'この車種のふだん' : 'うちのふだん',
              yen(x.ふだん[0]) + '〜' + yen(x.ふだん[1]) + '円')
         + kv('覚えの回数', x.回 + '回');
    } else if (x.種 === '抜け'){
      h += kv('きっかけ', esc(x.きっかけ)) + kv('ふつう入る割合', x.割合 + '%')
         + kv('覚えの回数', x.回 + '回');
    } else {
      h += kv('売価', yen(x.金額) + '円') + kv('原価', yen(x.原価) + '円');
    }
    h += '</div>';
    if (x.両) h += '<div class="ai-c-n">ふだんから純正も社外も両方使っている品名です。</div>';
    if (v.なぜ) h += '<div class="ai-c-ai"><span>AIの見立て</span>' + esc(v.なぜ) + '</div>';
    else if (x.言い分) h += '<div class="ai-c-n">' + esc(x.言い分) + '</div>';
    return h + '</div>';
  }
  function kv(k, v){ return '<span class="ai-n"><i>' + esc(k) + '</i><b>' + v + '</b></span>'; }

  w.pitAiTab = function (id){ A().tab = s(id); if (w.renderInspect) renderInspect(); };
})(window);
