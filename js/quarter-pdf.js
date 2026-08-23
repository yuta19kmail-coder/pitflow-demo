/* ================================================================================
   quarter-pdf.js  -  🧾 売上チェックリストPDF の読み取り  PitFlow v1.181.0
   ================================================================================
   ◎ここが受け持つこと ＝ **PDF を「伝票の一覧」に変えるだけ。** 突き合わせは quarter-match.js。

   ◎🔴 いちばん大事な決めごと（2026-08-08 の仕様たたき台より）
     🔴 **総合計と合計枚数が合わなければ「読み取りに失敗した」と正直に出す。**
        黙って部分的な数字を出すのがいちばん危ない。
        ＝ この部品は「読めたつもり」を返さない。**必ず自己検証の結果を一緒に返す。**
     🔴 読み取りは**紙の見た目**に頼っている。**整備ソフトの帳票レイアウトが変わったら壊れる。**
        壊れた時に**黙らない**のが、この作りの生命線。

   ◎PDF は外に出ない
     読むのは**ブラウザの中だけ**。どこにも送らない。
     ⚠ 読み取りの道具（pdf.js）だけは、初めて使う時にネットから取りに行く。
        取りに行けなかった時も**黙らずに**その旨を返す。

   ◎伝票1枚ぶんの形（整備ソフトの出力・実物で確認済み）
     ```
     売上日        登録番号        個人・法人区分  顧客コード 顧客名     受付担当者
     伝票番号      車台番号        顧客サブコード                        メカ担当者
                   車種名                        請求先コード 請求先名
     システム（＝整備）
        ─── 明細（… 作業区分 … 金額 …）───
        1 自賠責保険      非課税        17,650
        2 重量税          非課税        34,200
          一般消費税                    48,564
        伝票計  588,654   …
     ```
     最後のページに **組織計／総合計** と **合計枚数（＝台数）**。

   ◎🔴 金額の対応（ここが最大の詰まりどころ・67枚すべてで成立を確認）
     ```
     PitFlow の確定金額  ＝  伝票計 − 一般消費税 − 非課税行（自賠責保険・重量税・印紙代）
     ```
     ⚠ **「消費税×10」で戻すのはダメ**（15枚で2〜5円ずれた。消費税は明細ごとに丸めている）。

   ◎ここが返すもの
     pitQPdfRead(file) → Promise<{ ok, 伝票:[…], 合計:{…}, 検証:{…}, 生の行:[…] }>
   ================================================================================ */
(function (w) {
  'use strict';

  function s(v){ return String(v == null ? '' : v); }
  function t(v){ return s(v).trim(); }
  function num(v){ v = +s(v).replace(/[^0-9\-]/g, ''); return isFinite(v) ? v : 0; }
  function pad(n){ return (n < 10 ? '0' : '') + n; }

  /* 令和 → 西暦。⚠ 令和1年＝2019年 */
  function wareki(era, y, m, d){
    var base = { '令和': 2018, '平成': 1988, '昭和': 1925 }[era];
    if (!base) return '';
    return (base + (+y)) + '-' + pad(+m) + '-' + pad(+d);
  }

  /* ================================================================
     1. pdf.js を、初めて使う時だけ取りに行く
     ----------------------------------------------------------------
     ⚠ ふだんの画面を1バイトも重くしないため、**押した時に**読み込む。
     ⚠ 取りに行けなかったら、黙らずに理由を返す（社内のネットが塞いでいることがある）。
     ================================================================ */
  var PDFJS_URL  = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var _libP = null;
  function lib(){
    if (w.pdfjsLib) { try { w.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL; } catch (e) {} return Promise.resolve(w.pdfjsLib); }
    if (_libP) return _libP;
    _libP = new Promise(function (ok, ng) {
      var el = document.createElement('script');
      el.src = PDFJS_URL;
      el.onload = function () {
        if (!w.pdfjsLib) { ng(new Error('PDFを読む道具が入りませんでした')); return; }
        try { w.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL; } catch (e) {}
        ok(w.pdfjsLib);
      };
      el.onerror = function () { ng(new Error('PDFを読む道具を取りに行けませんでした（ネットにつながっていないか、社内で塞がれています）')); };
      (document.head || document.documentElement).appendChild(el);
    });
    return _libP;
  }

  /* ================================================================
     2. ページの文字を「行」に組み直す
     ----------------------------------------------------------------
     PDF の中身は「文字のかたまり＋置いてある座標」でしかない。
     🔴 **同じ高さに並んでいるものを1行**とみなし、左から並べ直す。
     ⚠ 高さがぴったり同じとは限らないので、少し（2ポイント）の幅で丸める。
     ⚠ 横に離れている時は空白を入れる＝`令和 8年` と `江東 300 せ 8134` が
        くっついて読めなくなるのを防ぐ。
     ================================================================ */
  function linesOf(items){
    var rows = {};
    items.forEach(function (it) {
      var str = s(it.str);
      if (!str.replace(/\s/g, '')) return;
      var tr = it.transform || [1, 0, 0, 1, 0, 0];
      var x = tr[4], y = Math.round(tr[5] / 2) * 2;
      (rows[y] = rows[y] || []).push({ x: x, w: it.width || 0, s: str });
    });
    return Object.keys(rows)
      .map(function (k) { return { y: +k, cells: rows[k].sort(function (a, b) { return a.x - b.x; }) }; })
      .sort(function (a, b) { return b.y - a.y; })      /* PDF の y は下が0＝上から読むには降順 */
      .map(function (r) {
        var out = '', prevEnd = null;
        r.cells.forEach(function (c) {
          if (prevEnd != null && (c.x - prevEnd) > 1.5) out += ' ';
          out += c.s;
          prevEnd = c.x + (c.w || 0);
        });
        return { y: r.y, text: out.replace(/\s+/g, ' ').trim(), cells: r.cells };
      })
      .filter(function (r) { return r.text; });
  }

  /* ================================================================
     3. 行から伝票を組み立てる
     ----------------------------------------------------------------
     🔴 目印は4つだけ。**ここを増やさない**（増やすほど帳票の変化に弱くなる）。
       ① 伝票の頭 …… `令和◯年◯月◯日` で始まる行
       ② 非課税 …… 作業区分が「非課税」の明細行（自賠責・重量税・印紙代）
       ③ 消費税 …… 「一般消費税」の行
       ④ 締め …… 「伝票計」の行
     ⚠ 金額は行の中の**数字のかたまり**から拾う。カンマは落とす。
     ================================================================ */
  var RE_HEAD  = /(令和|平成|昭和)\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/;
  /* ナンバー（登録番号）。分類番号は英字を含むことがある（例 千葉 31Y み 1000） */
  var RE_PLATE = /([一-龥ぁ-んァ-ヶー]{2,6})\s*([0-9]{1,3}[A-Za-z0-9]{0,2})\s*([ぁ-んァ-ンA-Za-z])\s*([0-9]{1,4})/;
  var RE_MONEY = /(-?[0-9][0-9,]*)/g;

  function moneys(line){
    var out = [], m;
    RE_MONEY.lastIndex = 0;
    while ((m = RE_MONEY.exec(line))) out.push(num(m[1]));
    return out;
  }

  function parse(lines){
    var slips = [], cur = null, warn = [];
    var total = null, sheets = null;

    function close(){
      if (!cur) return;
      /* 🔴 PitFlow と比べる額＝伝票計 − 消費税 − 非課税 */
      cur.比べる金額 = cur.伝票計 - cur.消費税 - cur.非課税;
      slips.push(cur); cur = null;
    }

    lines.forEach(function (ln, idx) {
      var x = ln.text;

      /* 最後のページ＝総合計と合計枚数 */
      if (/総合計/.test(x)){ var mm = moneys(x); if (mm.length) total = mm[mm.length - 1]; }
      if (/合計枚数/.test(x)){ var sm = x.match(/合計枚数\D*(\d+)/); if (sm) sheets = +sm[1]; }

      var h = x.match(RE_HEAD);
      if (h){
        close();
        var p = x.match(RE_PLATE);
        cur = {
          売上日: wareki(h[1], h[2], h[3], h[4]),
          ナンバー: p ? (p[1] + ' ' + p[2] + ' ' + p[3] + ' ' + p[4]) : '',
          顧客名: '', 受付担当: '', 伝票: '', 車種: '',
          伝票計: 0, 消費税: 0, 非課税: 0, 比べる金額: 0,
          _頭: x, _行: [x]
        };
        /* 顧客名と受付担当者は、頭の行の**ナンバーより後ろ**にある。
           ⚠ 顧客コード（数字）を挟むので、数字を落としてから前後に分ける。 */
        var tail = p ? x.slice(x.indexOf(p[0]) + p[0].length) : x.replace(RE_HEAD, '');
        var parts = tail.replace(/[0-9,]+/g, ' ').split(/\s+/).filter(function (v) {
          return v && !/^(個人|法人|事業所)$/.test(v);
        });
        if (parts.length >= 2){ cur.受付担当 = parts[parts.length - 1]; cur.顧客名 = parts.slice(0, -1).join(''); }
        else if (parts.length === 1){ cur.顧客名 = parts[0]; }
        return;
      }
      if (!cur) return;
      cur._行.push(x);

      /* 2行目＝伝票番号（頭の次の行の、いちばん左の数字） */
      if (!cur.伝票){
        var d = x.match(/^\s*([0-9]{2,6})\b/);
        if (d) cur.伝票 = d[1];
      }
      /* 3行目あたり＝車種名（「システム」より前で、数字だけではない行） */
      if (!cur.車種 && !/システム|整備|部品|車販/.test(x)){
        var only = x.replace(/[0-9,\s\-]/g, '');
        if (only.length >= 2 && !/^[A-Z]+$/.test(only) && cur._行.length <= 4) cur.車種 = only;
      }

      if (/非課税/.test(x)){ var nm = moneys(x); if (nm.length) cur.非課税 += nm[nm.length - 1]; }
      if (/一般消費税/.test(x)){ var cm = moneys(x); if (cm.length) cur.消費税 += cm[cm.length - 1]; }
      if (/伝票計/.test(x)){
        var tm = moneys(x);
        if (tm.length) cur.伝票計 = tm[0];
        close();
      }
    });
    close();

    /* ================================================================
       4. 🔴 自己検証（ここが生命線）
       ================================================================ */
    var sumSlip = slips.reduce(function (a, r) { return a + r.伝票計; }, 0);
    var okTotal = (total != null) && (sumSlip === total);
    var okSheet = (sheets != null) && (slips.length === sheets);
    if (total == null)  warn.push('PDF の中に「総合計」が見つかりませんでした');
    if (sheets == null) warn.push('PDF の中に「合計枚数」が見つかりませんでした');
    if (total != null && !okTotal)  warn.push('伝票を足した額（' + sumSlip.toLocaleString() + '）が、PDF の総合計（' + total.toLocaleString() + '）と合いません');
    if (sheets != null && !okSheet) warn.push('読み取れた枚数（' + slips.length + '）が、PDF の合計枚数（' + sheets + '）と合いません');

    return {
      ok: !!(okTotal && okSheet),
      伝票: slips,
      合計: {
        枚数: slips.length,
        伝票計: sumSlip,
        消費税: slips.reduce(function (a, r) { return a + r.消費税; }, 0),
        非課税: slips.reduce(function (a, r) { return a + r.非課税; }, 0),
        比べる金額: slips.reduce(function (a, r) { return a + r.比べる金額; }, 0)
      },
      検証: { 総合計: total, 合計枚数: sheets, 総合計が合う: okTotal, 枚数が合う: okSheet, 言い分: warn }
    };
  }

  /* ================================================================
     5. 入口
     ================================================================ */
  function read(file, onProgress){
    if (!file) return Promise.reject(new Error('PDF が選ばれていません'));
    return lib().then(function (pdfjs) {
      return file.arrayBuffer().then(function (buf) {
        return pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
      });
    }).then(function (doc) {
      var lines = [], n = doc.numPages, chain = Promise.resolve();
      for (var i = 1; i <= n; i++){
        (function (pi) {
          chain = chain.then(function () {
            return doc.getPage(pi).then(function (pg) { return pg.getTextContent(); })
              .then(function (tc) {
                linesOf(tc.items || []).forEach(function (r) { lines.push(r); });
                if (onProgress) { try { onProgress(pi, n); } catch (e) {} }
              });
          });
        })(i);
      }
      return chain.then(function () {
        var r = parse(lines);
        r.ページ数 = n;
        r.生の行 = lines.map(function (x) { return x.text; });
        return r;
      });
    });
  }

  w.pitQPdfRead  = read;
  w.pitQPdfParse = parse;      /* 🔴 見張り用＝行の配列から組み立てる所だけを、道具なしで試せる */
  w.pitQPdfLines = linesOf;
})(window);
