/* ================================================================================
   quarter-print.js  -  🖨 元の売上チェックリストPDFに、気になる所を刷り込む  PitFlow v2.4.0
   ================================================================================
   ◎これは何（ゆうた 2026-08-24）
     🗣「これって直にPDFに記載を入れて 元の形のまま再印刷するようにはできる？」
     ＝ **元のPDFはそのまま**。その上に
        ① 気になる行に **色の帯**
        ② その右の余白に **番号**（1・2・3…）
        ③ 最後に **一覧のページ**（番号が何なのか）
        を足して、**同じ紙の形のまま**出し直す。

   ◎🔴🔴 いちばん大事な決めごと
     🔴 **元のPDFの中身は1文字も書き換えない。** 上に重ねるだけ。
        ＝ 消したり動かしたりすると、紙が別物になる。
     🔴 **紙のどこにあるか**は、読んだ時に pdf.js が測ったものをそのまま使う
        （`quarter-pdf.js` の `枠`）。ここで回転の計算を書き直さない。
     🔴 **日本語は絵にして貼る。**
        ＝ pdf-lib で日本語を字として書くには、字の形（フォント）を数MB積む必要がある。
           ブラウザの画面に描いて、そのまま画像として貼れば**1バイトも積まずに済む**。
        ⚠ 数字と記号だけは、PDFがもともと持っている字（Helvetica）で書く。
     🔴 **PDFは外に出ない。** 読むのも書くのも、このパソコンの中だけ。

   ◎ここが返すもの
     pitQPrintCan()  … いま刷れるか（元のPDFと、気になる行がそろっているか）
     pitQPrintGo()   … 刷り込んだPDFを作って、そのまま落とす
   ================================================================================ */
(function (w) {
  'use strict';

  function s(v){ return String(v == null ? '' : v); }
  function t(v){ return s(v).trim(); }
  function num(v){ v = +v; return isFinite(v) ? v : 0; }
  function yen(n){ return (+n || 0).toLocaleString(); }

  var LIB_URL = 'js/vendor/pdf-lib.esm.min.js';
  var _libP = null;
  function abs(u){ try { return new URL(u, document.baseURI).href; } catch (e) { return u; } }
  /* ⚠ 押した時に初めて読み込む（ふだんの画面を重くしない）。pdf.js と同じやり方。 */
  function lib(){
    if (_libP) return _libP;
    _libP = Promise.resolve()
      .then(function () { return import(abs(LIB_URL)); })
      .then(function (m) {
        var lb = (m && m.PDFDocument) ? m : (m && m.default && m.default.PDFDocument) ? m.default : null;
        if (!lb || !lb.PDFDocument) throw new Error('PDFに書き込む道具の形が違います（' + LIB_URL + '）');
        return lb;
      })
      .catch(function (e) {
        _libP = null;
        throw new Error('PDFに書き込む道具が読み込めませんでした（' + LIB_URL + '）。'
                      + '本番に配られていない可能性があります：' + s(e && e.message ? e.message : e));
      });
    return _libP;
  }

  function Q(){ return (w._insp && w._insp.q) || {}; }
  function A(){ return (w._insp && w._insp.ai) || {}; }

  /* いま開いているクォーターの伝票 */
  function slips(){
    var U = Q();
    var g = (U.groups || [])[U.gi];
    var a = (g && g.soft) || U.soft || [];
    return (a || []).filter(function (x) { return x && (x.明細 || []).length; });
  }

  /* ================================================================
     🖨 刷るものを決める
     ----------------------------------------------------------------
     🔴 **紙のどこにあるかが分かっている行だけ**刷る。
        ＝ 「いつものが無い」は、そもそも紙に行が無いので帯を引けない。
           **消さずに、一覧のページの下に「入っていないもの」としてまとめる。**
     ================================================================ */
  function plan(){
    var U = Q(), Ai = A();
    var all = (w.pitCostLookAll ? w.pitCostLookAll(slips()) : []);
    var ord = { 高:0, 中:1, 低:2 };
    function grade(x){
      var v = Ai.見立て && Ai.見立て[t(x.伝票) + '#' + (x.種 === '抜け' ? ('な:' + t(x.名)) : t(x.i))];
      return (v && ord[v.確度] != null) ? v.確度 : x.確度;
    }
    function why(x){
      var v = Ai.見立て && Ai.見立て[t(x.伝票) + '#' + (x.種 === '抜け' ? ('な:' + t(x.名)) : t(x.i))];
      return (v && t(v.なぜ)) || '';
    }
    /* 伝票の明細から、その行の紙の場所を引く */
    var byNo = {};
    slips().forEach(function (sl) { byNo[t(sl.伝票)] = sl; });
    function onPaper(x){
      if (x.i == null || x.i < 0) return false;             /* 「いつものが無い」は紙に行が無い */
      var sl = byNo[t(x.伝票)];
      var m = sl ? (sl.明細 || [])[x.i] : null;
      return !!(m && m.枠 && m.頁);
    }
    /* 🔴 紙の上に来る順＝ ①確度 ②目線の重さ ③お金で効く順。
       ⚠ 「初めて見る品名」は**数字では何も言えない**もの。
          効きだけで並べると、紙のいちばん上をこれが独占する（実際そうなった）。
          お金の話（掛け率・売価）を先に、初めて見る品名を最後に置く。 */
    var kOrd = { '掛け率':0, '売価':0, '抜け':1, '両方':2, '初めて':3 };
    function sortIt(a, b){
      var ga = ord[grade(a)], gb = ord[grade(b)];
      if (ga !== gb) return ga - gb;
      var ka = kOrd[t(a.種)], kb = kOrd[t(b.種)];
      if (ka == null) ka = 9;
      if (kb == null) kb = 9;
      if (ka !== kb) return ka - kb;
      return num(b.効き) - num(a.効き);
    }
    /* 🔴 紙に落とす数は絞る（低まで全部刷ると、紙が真っ赤になって**かえって読めない**）。
       ⚠ ただし「高・中が全部『紙に行が無いもの』で、帯が1本も引かれない」ことが起きる
          （実際に7月Q1でそうなった）。だから **紙に行があるものを足して** MAX まで埋める。
       ⚠ はみ出したぶんは黙って捨てず、一覧の頭に「全◯件のうち」と出す。 */
    var MAX = 30;
    var hiMid = all.filter(function (x) { return grade(x) !== '低'; }).sort(sortIt);
    var rest  = all.filter(function (x) { return grade(x) === '低' && onPaper(x); }).sort(sortIt)
                   .slice(0, Math.max(0, MAX - hiMid.length));
    /* 🔴 並びは **紙に印があるもの → 紙に行が無いもの（入っていないもの）** の順。
       ＝ 番号1が紙の最初の帯になる。紙を持って回る時に、頭から突き合わせられる。
       ⚠ 前は確度順に混ぜていたので、1ページ目が「この行は紙にありません」だらけになった。 */
    var pick2 = hiMid.concat(rest);
    var use = pick2.filter(onPaper).sort(sortIt)
          .concat(pick2.filter(function (x) { return !onPaper(x); }).sort(sortIt));
    var marks = [], list = [];
    use.forEach(function (x, i) {
      var n = i + 1;
      var sl = byNo[t(x.伝票)];
      var m = (sl && x.i >= 0) ? (sl.明細 || [])[x.i] : null;
      var box = (m && m.枠) ? m.枠 : null;
      if (box && m.頁) marks.push({ n: n, 頁: m.頁, 枠: box, 確度: grade(x) });
      list.push({ n: n, 紙あり: !!(box && m.頁), 確度: grade(x), 種: t(x.種),
                  伝票: t(x.伝票), 売上日: t(x.売上日), 客: t(x.客), 車: t(x.車), 名: t(x.名),
                  一言: line1(x), なぜ: why(x) });
    });
    return { marks: marks, list: list, 全体: all.length };
  }

  /* 一覧に書く「ひとこと」（🔴 言い方はここ1本。画面で綴り直さない） */
  function line1(x){
    if (x.種 === '掛け率' || x.種 === '両方')
      return '掛け率 ' + x.いま + '%（うちのふだんは ' + x.ふだん[0] + '〜' + x.ふだん[1] + '%）';
    if (x.種 === '売価')
      return '売価 ' + yen(x.いま) + '円（うちのふだんは ' + yen(x.ふだん[0]) + '〜' + yen(x.ふだん[1]) + '円）';
    if (x.種 === '抜け')
      return '「' + t(x.きっかけ) + '」なら ' + x.割合 + '% に入っているものが、この伝票に無い';
    return '過去5か月の伝票に無い品名（売価 ' + yen(x.金額) + '円・原価 ' + yen(x.原価) + '円）';
  }

  function can(){
    var U = Q();
    if (!U.元のPDF || !U.元のPDF.length) return { ok:false, why:'PDFを入れ直してください（元のPDFが手元にありません）' };
    var p = plan();
    if (!p.list.length) return { ok:false, why:'紙に刷るものがありません（まず見たい行が0件です）' };
    return { ok:true, n: p.list.length, 帯: p.marks.length };
  }

  /* ================================================================
     🎨 一覧のページを「絵」にする
     🔴 日本語のフォントを積まないための工夫。ブラウザに描かせて、そのまま貼る。
     ⚠ 紙に耐えるよう、実寸の3倍で描いてから縮める。
     ================================================================ */
  function sheetPng(list, head, W, H){
    var K = 3;                                   /* 実寸の3倍 */
    var cv = document.createElement('canvas');
    cv.width = Math.round(W * K); cv.height = Math.round(H * K);
    var g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height);
    g.textBaseline = 'top';
    var F = '"Yu Gothic","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif';
    var x0 = 28 * K, y = 26 * K;

    g.fillStyle = '#000'; g.font = '700 ' + (13 * K) + 'px ' + F;
    g.fillText(head, x0, y); y += 20 * K;
    g.fillStyle = '#555'; g.font = (7.6 * K) + 'px ' + F;
    g.fillText('※ ここに出ているのは「うちのふだんと違う」という事実だけです。まちがいとは言っていません。'
             + '紙の伝票と照らして、決めるのは人です。', x0, y);
    y += 16 * K;

    list.forEach(function (r) {
      if (y > cv.height - 40 * K) return;         /* はみ出すものは次のページへ（呼ぶ側が分ける） */
      var col = r.確度 === '高' ? '#d92d20' : '#b54708';
      /* 番号 */
      g.fillStyle = col;
      g.beginPath();
      g.arc(x0 + 7 * K, y + 7 * K, 7 * K, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = '700 ' + (7.5 * K) + 'px ' + F;
      g.textAlign = 'center';
      g.fillText(s(r.n), x0 + 7 * K, y + 3.4 * K);
      g.textAlign = 'left';
      /* 1行目＝どの伝票か */
      g.fillStyle = '#000'; g.font = '700 ' + (8.6 * K) + 'px ' + F;
      g.fillText(r.名 + '　' + (r.車 || ''), x0 + 20 * K, y);
      g.fillStyle = '#666'; g.font = (7.2 * K) + 'px ' + F;
      g.fillText(r.売上日 + '　' + r.客 + '　伝票 ' + r.伝票
               + (r.紙あり ? '' : '　（この行は紙にありません）'), x0 + 20 * K, y + 11.5 * K);
      /* 2行目＝ひとこと */
      g.fillStyle = '#222'; g.font = (8 * K) + 'px ' + F;
      g.fillText(r.一言, x0 + 20 * K, y + 22 * K);
      if (r.なぜ){
        g.fillStyle = '#1f7a4d'; g.font = (7.4 * K) + 'px ' + F;
        g.fillText('AIの見立て：' + r.なぜ, x0 + 20 * K, y + 32.5 * K);
        y += 45 * K;
      } else {
        y += 35 * K;
      }
      g.strokeStyle = '#e3e3e3'; g.lineWidth = 1 * K;
      g.beginPath(); g.moveTo(x0, y - 5 * K); g.lineTo(cv.width - 28 * K, y - 5 * K); g.stroke();
    });
    return cv.toDataURL('image/png');
  }

  /* 一覧を、1ページに入るぶんずつ切る（⚠ はみ出したぶんを黙って捨てない） */
  function chunk(list, per){
    var out = [], i = 0;
    while (i < list.length){ out.push(list.slice(i, i + per)); i += per; }
    return out.length ? out : [[]];
  }

  /* ================================================================
     🖨 刷る
     ================================================================ */
  function go(){
    var U = Q();
    var c = can();
    if (!c.ok){ if (w.pitToast) pitToast(c.why); return Promise.resolve(false); }
    U.印刷中 = '刷り込んでいます…';
    if (w.renderInspect) renderInspect();

    var P = plan();
    return lib().then(function (L) {
      return L.PDFDocument.load(U.元のPDF).then(function (doc) {
        return doc.embedFont(L.StandardFonts.HelveticaBold).then(function (font) {
          var pages = doc.getPages();
          /* ① 帯と番号 */
          P.marks.forEach(function (m) {
            var pg = pages[m.頁 - 1];
            if (!pg) return;
            var b = m.枠;
            var hi = (m.確度 === '高');
            var rgb = hi ? L.rgb(0.85, 0.18, 0.13) : L.rgb(0.71, 0.31, 0.03);
            /* 🔴 元の字を消さないよう、**薄く**敷く（下に回す指定は無いので、薄さで見せる）。
               ⚠ 濃い線を1本足していたが、回っている紙では**行の真ん中を横切って**
                  金額の字に重なった（実物で確認）。帯だけにする。 */
            pg.drawRectangle({
              x: b.x1, y: b.y1, width: (b.x2 - b.x1), height: (b.y2 - b.y1),
              color: rgb, opacity: hi ? 0.20 : 0.15
            });
            /* ② 番号（🔴 数字だけ＝PDFがもともと持っている字で書ける）
               🔴 場所は**読んだ時に測っておいた「紙の右の余白」**（quarter-pdf.js の `右x/右y`）。
                  ⚠ 回っている紙で自分で座標を作ると、紙の外に出る（実際そうなった）。
               🔴 向きも紙に合わせる。ページが回って表示されるぶん、字は逆に回して置く。 */
            var rot = 0;
            try { rot = (pg.getRotation && pg.getRotation().angle) || 0; } catch (e) {}
            if (b.右x != null){
              pg.drawText(s(m.n), {
                x: b.右x, y: b.右y, size: 7.2, font: font, color: rgb,
                rotate: L.degrees(rot || 0)
              });
            }
          });

          /* ③ 一覧のページ（日本語は絵） */
          var first = pages[0];
          var sz0 = first ? first.getSize() : { width: 595, height: 842 };
          var rot0 = 0;
          try { rot0 = (first.getRotation && first.getRotation().angle) || 0; } catch (e) {}
          /* 紙の見た目の向き（回転を入れたあとの幅と高さ） */
          var vW = (rot0 % 180 === 90) ? sz0.height : sz0.width;
          var vH = (rot0 % 180 === 90) ? sz0.width  : sz0.height;

          var head = 'PitFlow　伝票の中身チェック　' + t(U.from) + ' 〜 ' + t(U.to)
                   + '　（まず見たい ' + P.list.length + '件／全 ' + P.全体 + '件）';
          var pagesOf = chunk(P.list, 16);
          var chain = Promise.resolve();
          pagesOf.forEach(function (part, pi) {
            chain = chain.then(function () {
              var url = sheetPng(part, head + (pagesOf.length > 1 ? '　' + (pi + 1) + '/' + pagesOf.length : ''), vW, vH);
              return doc.embedPng(url).then(function (img) {
                /* 🔴 絵は「紙の見た目」の向きで描いてある。
                   元の紙は横向きに刷ってある（回転90）ので、
                   **同じ見た目になるページ**を作って、そのまま貼る。
                   ⚠ ここで「回転90のページ」を作って貼ると、絵が横倒しになる（実際そうなった）。
                      ページのほうを最初から横長にすれば、回転をいじらずに済む。 */
                var np = doc.addPage([vW, vH]);
                np.drawImage(img, { x: 0, y: 0, width: vW, height: vH });
              });
            });
          });

          return chain.then(function () {
            return doc.save().then(function (bytes) {
              var name = '売上チェックリスト_チェック済み_' + t(U.from) + '_' + t(U.to) + '.pdf';
              var blob = new Blob([bytes], { type: 'application/pdf' });
              var a = document.createElement('a');
              a.href = URL.createObjectURL(blob); a.download = name;
              document.body.appendChild(a); a.click();
              setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
              U.印刷中 = '';
              if (w.pitToast) pitToast(name + ' を作りました');
              if (w.pitLog) pitLog('伝票チェックを刷り込んだPDFを作った',
                                   { kind:'inspect', label: P.list.length + '件' });
              if (w.renderInspect) renderInspect();
              return true;
            });
          });
        });
      });
    }).catch(function (e) {
      U.印刷中 = '';
      if (w.pitAlert) pitAlert(s(e && e.message ? e.message : e), { title:'刷り込めませんでした' });
      else if (w.pitToast) pitToast(s(e && e.message ? e.message : e));
      if (w.renderInspect) renderInspect();
      return false;
    });
  }

  w.pitQPrintCan  = can;
  w.pitQPrintGo   = go;
  w.pitQPrintPlan = plan;      /* 🔴 見張り用＝刷らずに「何をどこに刷るか」だけ取り出せる */
})(window);
