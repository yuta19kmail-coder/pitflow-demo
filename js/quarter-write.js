/* ================================================================================
   quarter-write.js  -  ✍ 突き合わせが終わったら、車体番号と伝票を書き込む  PitFlow v2.2.0
   ================================================================================
   ◎ここが受け持つこと ＝ **残りが0になったQの結果を、お客様の車に書き足す。**
     ① 車の情報に **車体番号**（伝票が持っている唯一無二の番号）
     ② 来店履歴に **その時の伝票**（見出し・作業・部品・法定費用・原価）

   ◎🔴🔴 いちばん大事な決めごと（ゆうた 2026-08-24）
     🔴 **残りが0になるまで書けない。** ズレたまま書くと、まちがった車に
        まちがった履歴がぶら下がる。ボタンそのものを出さない。
     🔴 **1つの予約に、1つの伝票。訂正されたら古いほうは消して置きかえる。**
        🗣「訂正した場合は古いのは消して、あくまで1予約番号と1伝票番号がくっつくイメージで」
     🔴 **車体番号は上書きしない。** すでに別の番号が入っていたら書かずに知らせる
        （ナンバーの付け替えも、結びつけのまちがいも、どちらもありうる）。
     🔴 **明細が伝票の額とぴったり合ったものだけ**持たせる（`明細が合う`）。
        足して合わない表を見せるのは、無いより悪い。
     🔴 **法定費用（自賠責・重量税・印紙代）は非課税で売上ではない。**
        売上とも粗利とも混ぜない。伝票の中に別で持つ。
     ⚠ 原価もそのまま入る＝**全員に見える**。小林モータースは原価をオープンにしている会社なので、
        隠す仕組みは作らない（2026-08-24 ゆうた）。

   ◎書き込む先
     ・車体番号 …… `customers.js` の `pitVehSetVin`（出し入れの入口はあそこ1本）
     ・伝票 …… その車（vehicles[]）の `伝票[]`。予約番号で1件だけ持つ。

   ◎ここが返すもの
     pitQWritePanel(R, U) … 帯のHTML（残り0の時だけ中身が出る）
     pitQWriteView(R, U)  … 書き込んだ内容の見え方
     pitQWriteGo()        … 実際に書き込む
   ================================================================================ */
(function (w) {
  'use strict';

  function s(v){ return String(v == null ? '' : v); }
  function t(v){ return s(v).trim(); }
  function num(v){ v = +s(v).replace(/[^0-9\-]/g, ''); return isFinite(v) ? v : 0; }
  function yen(n){ return (+n || 0).toLocaleString(); }
  function esc(x){ return s(x).replace(/[&<>"']/g, function (m) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]; }); }
  function Q(){ return (w._insp && w._insp.q) || {}; }

  /* ================================================================
     🗂🗂 v2.10.1 **書き込みは「いま見ているQ」ごと**（ゆうた 2026-08-25）
     ----------------------------------------------------------------
     🗣「また書き込みがPDF全体でQごとに書き込めない。
        **書き込みはPDFが範囲が広くてもQごと**」
     ◎何が起きていたか＝**書き込んだ印を、画面（U）に1つしか持っていなかった。**
       1枚のPDFが Q1〜Q3 に分かれている時、Q1 で書き込むと
       `U.書き込んだ` が立つので、**Q2 と Q3 でも「書き込みました」**になり、
       ボタンが出てこなかった。＝ Q2・Q3 は永久に書き込めない。
     🔴 書き込むもの（`R`）は前から**その組だけ**なので、**書く中身は正しかった**。
        まちがっていたのは「済んだ印の置き場所」だけ。
     🔴 だから印は**組（`U.groups[U.gi]`）に持たせる**。組が無い時だけ U に置く
        （＝古い保存を写しで開いた画面。あそこには組が無い）。
     ================================================================ */
  function G(){
    var U = Q();
    var g = (U.groups || [])[U.gi];
    return g || U;          /* 組が無い画面では、今までどおり U に置く */
  }

  /* 書ける行＝結びついていて、伝票の中身が合っているもの */
  function rows(R){
    return (R && R.結びついた ? R.結びついた : []).filter(function (p) {
      return p && p.soft && p.pit;
    });
  }
  function canVin(p){ return !!(t(p.soft.車体番号) && !t(p.pit.車体番号)); }
  function canDen(p){ return !!(p.soft.明細が合う && (p.soft.明細 || []).length); }

  function count(R){
    var a = rows(R);
    return { vin: a.filter(canVin).length, den: a.filter(canDen).length };
  }

  /* ================================================================
     ✍ 帯（残りが0の時だけ）
     ================================================================ */
  function panel(R, U){
    if (!R || !R.検算 || !R.検算.合う) return '';
    if (!w.pitQNokori || w.pitQNokori(R) > 0) return '';
    var c = count(R);
    /* 🔴 v2.10.1 済んだ印は**その組のもの**を見る（Qごとに書き込めるようにするため） */
    var g = G();
    if (g && g.書き込んだ){
      return '<div class="q-wr done">'
        + '<div class="q-wr-l"><b>書き込みました</b><span>' + esc(g.書き込んだ) + '</span></div>'
        + '<button class="q-wr-b" onclick="pitQWriteSee(1)">書き込んだ内容を見る</button>'
        + '</div>';
    }
    /* 🧾 v2.9.8 残してある伝票で組み直した画面では、**伝票の中身（明細）は手元に無い**。
       ＝ 車体番号は書けるが、来店履歴にぶら下げる伝票は書けない。
       🔴 黙って「0件」と出すと「もう入っている」と読めてしまうので、理由を必ず書く。 */
    var 再生 = !!(U && U.再生);
    var 断り = 再生 ? '<span class="q-wr-n">⚠ 伝票の中身は残していないので、'
                    + '来店履歴にぶら下げるぶんは書けません（PDFを入れ直すと書けます）。</span>' : '';
    if (!c.vin && !c.den){
      return '<div class="q-wr done"><div class="q-wr-l"><b>書き込むものはありません</b>'
        + '<span>' + (再生 ? '車体番号はもう入っています' : '車体番号も伝票も、もう入っています') + '</span>'
        + 断り + '</div></div>';
    }
    return '<div class="q-wr">'
      + '<div class="q-wr-l"><b>この結果を書き込めます</b>'
      + '<span>車体番号 ' + c.vin + '件／伝票 ' + c.den + '件</span>'
      + 断り + '</div>'
      + '<button class="q-wr-b go" onclick="pitQWriteGo()">書き込む</button>'
      + '</div>';
  }

  /* ================================================================
     ✍ 書き込む
     ================================================================ */
  function go(){
    var U = Q(), R = U.res;
    if (!R) return;
    if (!w.pitQNokori || w.pitQNokori(R) > 0){
      if (w.pitAlert) pitAlert('まだ片づいていないものがあります。0にしてから書き込んでください。', { title:'まだ書けません' });
      return;
    }
    var c = count(R);
    /* 🔴 v2.10.1（ゆうた）**余計な文言は要らない。**
       🗣「原価が見えます とか余計な文言は要らない。
          **作業内容の履歴と車体番号を書き込みます** だけでOK」
       ⚠ 決めごと（1予約1伝票・上書きしない・読むだけ）は**コードとメモに残す**。
          押す前の確認は、やることを1行で言うだけにする。 */
    var det = ['・作業内容の履歴と車体番号を書き込みます'];
    var ask = w.pitAsk ? pitAsk('この結果を書き込みますか？', { detail: det, ok: '書き込む' })
                       : Promise.resolve(true);
    ask.then(function (yes) {
      if (!yes) return;
      var out = write(R);
      /* 🔴 v2.10.1 済んだ印は**この組に**置く（ほかのQは書き込めるまま） */
      var g = G();
      g.書き込んだ = (new Date()).toISOString().slice(0, 16).replace('T', ' ')
                   + '　車体番号 ' + out.vin + '件／伝票 ' + out.den + '件'
                   + (out.ちがう.length ? '　⚠ 別の番号が入っていた車が ' + out.ちがう.length + '件' : '');
      g.書き込み結果 = out;
      if (w.PitDB && w.PitDB.saveCustomers) { try { w.PitDB.saveCustomers(); } catch (e) {} }
      else if (w.PitDB && w.PitDB.save) { try { w.PitDB.save(); } catch (e) {} }
      if (w.pitToast) pitToast('書き込みました');
      if (out.ちがう.length && w.pitAlert){
        pitAlert('つぎの車は、すでに別の車体番号が入っていたので**書いていません**。\n'
               + out.ちがう.map(function (x) { return '・' + x.客 + '（' + x.plate + '）'; }).join('\n'),
                 { title: '書かなかった車があります' });
      }
      if (w.renderInspect) renderInspect();
    });
  }

  function write(R){
    var out = { vin: 0, den: 0, ちがう: [], 車なし: [] };
    rows(R).forEach(function (p) {
      var plate = t(p.pit.ナンバー) || t(p.soft.ナンバー);
      /* ① 車体番号（🔴 上書きしない。入口は customers.js の1本） */
      if (canVin(p) && w.pitVehSetVin){
        var r = w.pitVehSetVin(plate, p.soft.車体番号);
        if (r === '入れた') out.vin++;
        else if (r === 'ちがう') out.ちがう.push({ 客: t(p.soft.顧客名), plate: plate });
        else if (r === '車がない') out.車なし.push({ 客: t(p.soft.顧客名), plate: plate });
      }
      /* ② 伝票（🔴 1予約に1伝票。訂正されたら置きかえる） */
      if (canDen(p) && w.pitVehByPlate){
        var h = w.pitVehByPlate(plate);
        if (h && h.veh){
          if (!Array.isArray(h.veh.伝票)) h.veh.伝票 = [];
          var res = t(p.pit.予約番号);
          /* 🔴 同じ予約番号のものは**消して**から入れる＝1予約に1伝票 */
          h.veh.伝票 = h.veh.伝票.filter(function (x) { return x && t(x.予約番号) !== res; });
          h.veh.伝票.unshift(slip(p));
          h.veh.updatedAt = Date.now();
          if (h.cust) h.cust.updatedAt = Date.now();
          out.den++;
        }
      }
    });
    return out;
  }

  /* 伝票1枚ぶんの形（🔴 読むだけ。PitFlow からは直さない） */
  function slip(p){
    var S = p.soft;
    return {
      予約番号: t(p.pit.予約番号),
      伝票番号: t(S.伝票),
      売上日: t(S.売上日),
      金額: num(S.金額),                      /* 税抜・法定費用を除いた売上 */
      原価: num(S.原価),
      消費税: num(S.消費税),
      伝票計: num(S.伝票計),                  /* お客様に請求した額（税・法定費用こみ） */
      法定: (S.法定 || []).map(function (x) { return { 名: t(x.名), 金額: num(x.金額) }; }),
      明細: (S.明細 || []).map(function (x) {
        return { 種: t(x.種), 名: t(x.名), 区分: t(x.区分),
                 数量: +x.数量 || 0, 単価: num(x.単価), 金額: num(x.金額), 原価: num(x.原価) };
      }),
      フロント: t(S.受付担当),
      入れた日: (new Date()).toISOString().slice(0, 10)
    };
  }

  /* ================================================================
     📒 書き込んだ内容の見え方
     ================================================================ */
  function view(R, U){
    var a = rows(R).filter(canDen);
    if (!a.length) return '<div class="q-none">見るものがありません。</div>';
    var cur = t(G().見る) || t(a[0].soft.伝票);
    var p = a.filter(function (x) { return t(x.soft.伝票) === cur; })[0] || a[0];
    var m = p.soft;
    var ara = num(m.金額) - num(m.原価);
    var pct = num(m.金額) ? Math.round(ara / num(m.金額) * 1000) / 10 : 0;
    var hou = (m.法定 || []).reduce(function (x, y) { return x + num(y.金額); }, 0);
    var h = '<div class="vw"><div class="vw-h"><b>書き込んだ内容</b>'
          + '<button class="vw-x" onclick="pitQWriteSee(0)">閉じる</button></div>';
    h += '<div class="vw-pick">';
    a.slice(0, 10).forEach(function (x) {
      h += '<button class="vw-p' + (t(x.soft.伝票) === t(p.soft.伝票) ? ' on' : '') + '"'
         + ' onclick="pitQWritePick(\'' + esc(t(x.soft.伝票)) + '\')">' + esc(x.soft.顧客名)
         + ((x.soft.法定 || []).length ? '<i>車検</i>' : '') + '</button>';
    });
    h += '</div>';
    h += '<div class="vw-sec"><div class="vw-t">車の情報に入ったもの</div>'
      + '<div class="vw-car"><div class="vw-cn">' + esc(p.soft.顧客名) + '</div>'
      + '<table class="vw-t2"><tbody>'
      +   '<tr><th>ナンバー</th><td>' + esc(p.soft.ナンバー) + '</td></tr>'
      +   '<tr><th>車種</th><td>' + esc(p.pit.車種 || p.soft.車種) + '</td></tr>'
      +   '<tr class="vw-new"><th>車体番号</th><td>' + esc(p.soft.車体番号 || '—')
      +     '<span class="vw-badge">いま入りました</span></td></tr>'
      + '</tbody></table></div></div>';
    h += '<div class="vw-sec"><div class="vw-t">来店履歴にぶら下がったもの</div>'
      + '<div class="vw-hr on"><div class="vw-hd">' + esc(m.売上日) + '　伝票 ' + esc(m.伝票)
      +   '　予約 ' + esc(p.pit.予約番号) + '</div>'
      + '<div class="vw-hm"><b>' + yen(m.金額) + '円</b><span>原価 ' + yen(m.原価) + '円</span>'
      +   '<em>粗利 ' + yen(ara) + '円（' + pct + '%）</em>'
      +   (hou ? '<span class="vw-hou-c">＋法定費用 ' + yen(hou) + '円</span>' : '') + '</div></div></div>';
    h += '<div class="vw-sec"><div class="vw-t">この時の伝票</div>' + denTable(m) + '</div>';
    h += '<div class="vw-go"><span>ふだんはお客様の画面から見ます。'
       + '検索でナンバーかお名前を引く → お客様 → 車 → 来店履歴</span></div>';
    return h + '</div>';
  }

  /* ================================================================
     🧾 伝票の中身（見出し・作業・部品・法定費用）
     🔴 法定費用は**売上でも粗利でもない**ので、表と混ぜず下に別で出す。
     ⚠ 顧客詳細（customers.js）からも同じものを呼ぶ＝**見た目を2つ持たない**。
     ================================================================ */
  function denTable(m){
    var ara = num(m.金額) - num(m.原価);
    var hou = (m.法定 || []).reduce(function (x, y) { return x + num(y.金額); }, 0);
    var h = '<div class="vw-tw"><table class="vw-t3"><thead><tr>'
      + '<th>作業・部品</th><th>区分</th><th class="n">数量</th><th class="n">単価</th>'
      + '<th class="n">金額</th><th class="n">原価</th><th class="n">粗利</th></tr></thead><tbody>';
    (m.明細 || []).forEach(function (x) {
      if (t(x.種) === '見出し'){
        h += '<tr class="hd"><td colspan="7"><b>' + esc(x.名) + '</b>'
           + (t(x.区分) ? '<span>' + esc(x.区分) + '</span>' : '') + '</td></tr>';
        return;
      }
      var a = num(x.金額) - num(x.原価);
      h += '<tr' + (num(x.金額) < 0 ? ' class="mi"' : '') + '><td>' + esc(x.名) + '</td>'
         + '<td class="k">' + esc(x.区分) + '</td>'
         + '<td class="n">' + (+x.数量 || 0) + '</td><td class="n">' + yen(x.単価) + '</td>'
         + '<td class="n">' + yen(x.金額) + '</td><td class="n c">' + yen(x.原価) + '</td>'
         + '<td class="n g">' + yen(a) + '</td></tr>';
    });
    h += '</tbody><tfoot><tr><th colspan="4">売上（税抜）</th>'
      + '<th class="n">' + yen(m.金額) + '</th><th class="n c">' + yen(m.原価) + '</th>'
      + '<th class="n g">' + yen(ara) + '</th></tr></tfoot></table></div>';
    if (hou){
      h += '<div class="vw-hou"><div class="vw-hou-t">法定費用（非課税）'
         + '<span>お客様から預かって、そのまま納めるお金です。<b>売上にも粗利にも入りません</b></span></div>'
         + '<div class="vw-hou-b">';
      (m.法定 || []).forEach(function (x) {
        h += '<div class="vw-hou-r"><span>' + esc(x.名) + '</span><b>' + yen(x.金額) + '円</b></div>';
      });
      h += '<div class="vw-hou-r sum"><span>合計</span><b>' + yen(hou) + '円</b></div></div>'
         + '<div class="vw-hou-n">お客様の請求書は ' + yen(m.金額) + '円 ＋ 消費税 ' + yen(m.消費税)
         + '円 ＋ 法定費用 ' + yen(hou) + '円 ＝ <b>' + yen(m.伝票計) + '円</b>。'
         + 'PitFlow が売上として数えるのは <b>' + yen(m.金額) + '円</b> だけです。</div>';
    }
    return h;
  }

  w.pitQWritePanel = panel;
  w.pitQWriteView  = view;
  w.pitQWriteGo    = go;
  w.pitQDenTable   = denTable;      /* 🧾 顧客詳細からも同じものを呼ぶ */
  w.pitQWriteSee   = function (v){ Q().viewer = !!+v; if (w.renderInspect) renderInspect(); };
  w.pitQWritePick  = function (d){ G().見る = d; if (w.renderInspect) renderInspect(); };
})(window);
