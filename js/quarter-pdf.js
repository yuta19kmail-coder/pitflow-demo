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
  /* 🔴🔴 2026-08-23 決めごと ── **道具はネットから取りに行かない。アプリと一緒に配る。**
     ◎なぜ
       最初は CDN から取りに行く作りにしていたが、**会社のネットが外を塞いでいると、
       その場で使えなくなる**。毎週回す業務のものなので、外に寄りかからない形にした。
       （実際、こちらの箱からも cdnjs は塞がれていて取りに行けなかった）
     ⚠ 合わせて 1.8MB ある。**PDFを選んだ時に初めて読み込む**ので、ふだんの画面は重くならない。
     ⚠ 置き場所＝`js\vendor\`（中身は書き換えない。直す用があれば新しい版にまるごと入れ替える）。 */
  var LIB_URL    = 'js/vendor/pdf.min.mjs';
  var WORKER_URL = 'js/vendor/pdf.worker.min.mjs';
  var _libP = null;
  function abs(u){
    try { return new URL(u, document.baseURI).href; } catch (e) { return u; }
  }
  function lib(){
    if (_libP) return _libP;
    _libP = Promise.resolve()
      .then(function () { return import(abs(LIB_URL)); })
      .then(function (m) {
        var lb = (m && m.getDocument) ? m : (m && m.default) ? m.default : null;
        if (!lb || !lb.getDocument) throw new Error('PDFを読む道具の形が違います（' + LIB_URL + '）');
        try { lb.GlobalWorkerOptions.workerSrc = abs(WORKER_URL); } catch (e) {}
        w.pdfjsLib = lb;          /* 見張りや調べもの用に、名前も出しておく */
        return lb;
      })
      .catch(function (e) {
        _libP = null;             /* 次にもう一度ためせるように */
        throw new Error('PDFを読む道具が読み込めませんでした（' + LIB_URL + '）。'
                      + '本番に配られていない可能性があります：' + s(e && e.message ? e.message : e));
      });
    return _libP;
  }

  /* ================================================================
     2. ページの文字を「行」に組み直す
     ----------------------------------------------------------------
     PDF の中身は「文字のかたまり＋置いてある座標」でしかない。
     🔴 **同じ高さに並んでいるものを1行**とみなし、左から並べ直す。

     🔴🔴 2026-08-23 実物で分かったこと ── **この帳票は横向き（90度回転）で刷ってある。**
        文字ひとつひとつが**寝かせて置いてある**ので、そのままの座標で高さを見ると
        **紙の「縦の列」が1行になってしまい、まるで読めない**（実際そうなっていた）。
        👉 **紙に見えているとおりの位置**（viewport を通した座標）で並べ直す。
        ＝ `Util.transform(viewport.transform, item.transform)`。
        ⚠ こうしておけば、**縦向きの帳票に変わっても同じコードで読める**。
     ⚠ 高さがぴったり同じとは限らないので、少し（2ポイント）の幅で丸める。
     ⚠ 横に離れている時は空白を入れる（`令和 8年` と `江東 300 せ 8134` がくっつかないように）。
     🔴 **1文字ずつの位置（cells）も一緒に返す。** 見出しの行から**列の位置**を測って、
        「どこからどこまでが顧客名か」を決めるのに使う（下の colsOf）。
     ================================================================ */
  function linesOf(items, vp, pdfjs){
    var rows = {};
    items.forEach(function (it) {
      var str = s(it.str);
      if (!str.replace(/\s/g, '')) return;
      var tr = it.transform || [1, 0, 0, 1, 0, 0];
      var m = tr;
      if (vp && pdfjs && pdfjs.Util && pdfjs.Util.transform){
        try { m = pdfjs.Util.transform(vp.transform, tr); } catch (e) { m = tr; }
      }
      var x = m[4], y = Math.round(m[5] / 2) * 2;
      (rows[y] = rows[y] || []).push({ x: x, w: it.width || 0, s: str });
    });
    return Object.keys(rows)
      .map(function (k) { return { y: +k, cells: rows[k].sort(function (a, b) { return a.x - b.x; }) }; })
      /* 🔴 viewport を通した座標は**下に行くほど大きい**（紙の読む順）。昇順で並べる */
      .sort(function (a, b) { return a.y - b.y; })
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
     2-2. 見出しの行から「列の位置」を測る
     ----------------------------------------------------------------
     🔴 **どこからどこまでが顧客名か**を、字面ではなく**位置**で決める。
        ＝ 見出しの行（`売上日 登録番号 個人・法人区分 顧客コード 顧客名 受付担当者`）が
          ページごとに必ず出てくるので、そこで**列の左端**を測っておく。
     ⚠ 字面で切ろうとすると「藤井 義博 椎名 祐太」を**どこで割るか決められない**
        （お名前も担当者も「姓 名」で、間はどちらも空白）。実際それで割れなかった。
     ================================================================ */
  var COL_KEYS = ['売上日', '登録番号', '個人・法人区分', '顧客コード', '顧客名', '受付担当者'];
  /* 🧾 v2.2.0 明細の列。**見出しの行から位置を測る**のは上と同じやり方。
     ⚠ 字面で切ろうとすると、部品名に空白が入っているもの（`エンジンオイル（WAKO'S EX-`）で割れない。 */
  var DET_KEYS = ['作業内容・使用部品名', '作業区分', '作業数量', '作業単価', '作業金額', '作業原価',
                  '部品区分', '部品数量', '部品単価', '部品金額', '部品原価', '担当者名称'];
  function rulerOf(line, keys, least){
    if (!line || !line.cells) return null;
    var got = {}, n = 0;
    line.cells.forEach(function (c) {
      var k = t(c.s);
      if (keys.indexOf(k) >= 0 && got[k] == null) { got[k] = { x: c.x, r: c.x + (c.w || 0) }; n++; }
    });
    if (n < least) return null;                /* 見出しの行ではない */
    return keys.filter(function (k) { return got[k] != null; })
      .map(function (k) { return { key: k, x: got[k].x, r: got[k].r }; })
      .sort(function (a, b) { return a.x - b.x; });
  }
  function colsOf(line){ return rulerOf(line, COL_KEYS, 4); }
  /* 🧾 v2.2.0 明細の物差し */
  function detOf(line){
    var r = rulerOf(line, DET_KEYS, 6);
    return r ? fillDet(r) : null;
  }
  /* 🧾 v2.2.0 見出しの字がくっついて**測れなかった列**を、前後から埋める。
     🔴 実物では「作業原価」と「部品区分」の2つが測れなかった（隣の字とくっついていた）。
        埋めないと、部品の区分が名前にくっつく（「ドレーンワッシャー部品」になっていた）。 */
  function fillDet(det){
    var have = {}, i;
    det.forEach(function (c) { have[c.key] = c; });
    var out = [], last = null;
    for (i = 0; i < DET_KEYS.length; i++){
      var k = DET_KEYS[i];
      if (have[k]) { out.push(have[k]); last = { i: i, c: have[k] }; continue; }
      /* 次に測れている列を探して、その間に等間隔で置く */
      var nx = null, j;
      for (j = i + 1; j < DET_KEYS.length; j++) if (have[DET_KEYS[j]]) { nx = { i: j, c: have[DET_KEYS[j]] }; break; }
      if (!last || !nx) continue;                 /* 端が測れていない時は、その列はあきらめる */
      var step = (nx.c.x - last.c.r) / (nx.i - last.i);
      var x = last.c.r + step * (i - last.i);
      out.push({ key: k, x: x, r: x + step * 0.8, 埋めた: true });
    }
    return out.sort(function (a, b) { return a.x - b.x; });
  }

  /* ================================================================
     🧾 v2.2.0 明細の1行を、列の位置でほどく
     ----------------------------------------------------------------
     🔴🔴 ここが今回いちばん詰まった所。**数字は右そろえ**なので、
        「字の左端がどの列に入っているか」で決めると、桁の多い数字が1つ左の列に落ちる。
        （実際、単価90と金額90がくっついて「9090」になっていた）
        👉 **数字は「右端がどの列の右端に近いか」で決める。**
     ⚠ 区分（交換・部品・オイル…）は左そろえなので、こちらは**左端**で見る。
     ⚠ 担当者名称の列（＊＊＊）は捨てる。
     ⚠ 名前の左に作業コード（330・7501…）が付くことがある。数字だけの塊は落とす。
     ================================================================ */
  var DET_NUM = ['作業数量', '作業単価', '作業金額', '作業原価',
                 '部品数量', '部品単価', '部品金額', '部品原価'];
  function detRow(line, det){
    if (!line || !line.cells || !det) return null;
    var map = {}, f = {}, name = [];
    det.forEach(function (c) { map[c.key] = c; });
    line.cells.forEach(function (c) {
      var txt = t(c.s);
      if (!txt) return;
      var R = c.x + (c.w || 0);
      if (/^[0-9,.\-]+$/.test(txt)){
        /* 🔴 数字は**右そろえ**。「右端がどの列の右端に近いか」だけで決める。
           ⚠ 範囲で決める逃げ道を作ると、単独の「0」が金額にくっつく（15000 になっていた）。 */
        var best = null, bd = 12;
        DET_NUM.forEach(function (k) {
          var col = map[k]; if (!col) return;
          var d = Math.abs(R - col.r);
          if (d < bd){ bd = d; best = k; }
        });
        if (best){ f[best] = (f[best] || '') + txt; return; }
      }
      /* 区分（交換・部品・オイル…）＝**数量の列より左にいる字**。
         🔴 見出しの「作業原価」「部品区分」は実物で測れないことがあるので、
            それに頼らず「作業数量より左＝作業区分／部品数量より左＝部品区分」で決める。 */
      var w1 = map['作業数量'], w2 = map['部品数量'], nmc = map['作業内容・使用部品名'];
      if (nmc && c.x > nmc.r + 4){
        if (w1 && c.x < w1.x - 8){ f['作業区分'] = (f['作業区分'] || '') + txt; return; }
        if (w2 && c.x < w2.x - 8){ f['部品区分'] = (f['部品区分'] || '') + txt; return; }
      }
      if (map['担当者名称'] && c.x >= map['担当者名称'].x - 6) return;   /* ＊＊＊ は捨てる */
      name.push(txt);
    });
    /* 名前の頭に付く作業コード（330・7501…）と、行末に落ちた数字を落とす */
    var nm = name.join('').replace(/\s+/g, ' ').trim()
                 .replace(/^[0-9]+\s*(?=[^0-9])/, '')
                 .replace(/[\s0-9.]+$/, '');
    return { 名: nm, f: f };
  }
  function dnum(f, k){
    var v = s(f[k]).replace(/[^0-9.\-]/g, '');
    if (!v || !/^-?\d+(\.\d+)?$/.test(v)) return null;
    return +v;
  }

  /* その行の、その列に入っている字を集める（列の左端 − 3 から、次の列の左端 − 3 まで） */
  function pick(line, cols, key){
    if (!line || !line.cells || !cols) return '';
    var i = -1;
    for (var k = 0; k < cols.length; k++) if (cols[k].key === key) i = k;
    if (i < 0) return '';
    var from = cols[i].x - 3;
    var to = (i + 1 < cols.length) ? (cols[i + 1].x - 3) : Infinity;
    var out = [];
    line.cells.forEach(function (c) { if (c.x >= from && c.x < to) out.push(t(c.s)); });
    return out.join('').replace(/\s+/g, ' ').trim();
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

  /* ページのくり返し（どの伝票にも属さない行）。⚠ ここを外さないと**毎ページ伝票が始まる**
     （`対象期間：令和 8年 8月 1日 ～ …` が「令和◯年◯月◯日」に当たってしまう） */
  var RE_SKIP = /対象期間|作成日付|日付区分|請求計上組織|ページ：|売上チェックリスト|\[伝票番号\]/;
  /* 締めの行＝`… 作業計/原価計 … 部品計/原価計 …`。
     ⚠ 実物では**2つの書き方**があった（label が一緒の行に来る時と、次の行にずれる時）。
        だから **`伝票計` という字ではなく、この並びで見分ける**。 */
  var RE_CLOSE = /作業計\s*\/\s*原価計/;
  var RE_GRAND = /合計枚数/;

  /* ================================================================
     🗓 v2.0.0（ゆうた指定 2026-08-23）**PDF が「自分は何の期間か」を言っている。**
     ----------------------------------------------------------------
     🗣「入れたPDFに対して日付で自動でQ割り振りできないかな？」
     ◎全ページの頭に、こう印刷されている（実物で確かめた）
        `対象期間：令和 8年 8月 1日 ～ 令和 8年 8月 7日`
        `日付区分：売上日`
     🔴 **伝票の日付から min〜max を推し量らない。** PDF が書いてあるほうが正しい
        （その期間に1枚も伝票が無い日があっても、期間は期間だから）。
     🔴🔴 **日付区分が「売上日」でなければ、数字を1つも出さない。**
        入金日などで出したPDFは、日付の列そのものが別物なので、
        突き合わせの答えが**全部まちがう**（しかも総合計の検算は通ってしまう＝いちばん危ない形）。
     ⚠ ページごとに同じ字が出るので、**最初に見つけたものだけ**を採る。
     ================================================================ */
  var RE_TERM = /対象期間\s*[:：]?\s*(令和|平成|昭和)\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*[～~〜]\s*(令和|平成|昭和)?\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/;
  var RE_KBN  = /日付区分\s*[:：]?\s*(\S+)/;

  function parse(lines){
    var slips = [], cur = null, warn = [], cols = null, det = null;
    var total = null, sheets = null;
    var pending = 0;      /* 頭のあと、伝票番号・車台番号・車種名を拾うために見る行数 */
    var term = null, kbn = '';

    function close(){
      if (!cur) return;
      /* 🔴 PitFlow と比べる額＝伝票計 − 消費税 − 非課税 */
      cur.比べる金額 = cur.伝票計 - cur.消費税 - cur.非課税;
      /* 🧾 v2.2.0 明細の自己検証。
         🔴 **足して伝票の額にならない明細は、持たせない。**
            出しても合わない表を見せるほうが、無いより悪い（数字を疑う理由になる）。 */
      var sum = 0;
      cur.明細.forEach(function (x) { if (x.種 !== '見出し') sum += (x.金額 || 0); });
      cur.明細が合う = (cur.明細.length > 0) && (sum === cur.比べる金額);
      cur.明細合計 = sum;   /* 🔴 合わない時に「いくらズレたか」を残す（黙って捨てない） */
      slips.push(cur); cur = null; pending = 0;
    }

    lines.forEach(function (ln) {
      var x = s(ln && ln.text);
      if (!x) return;

      /* 見出しの行が来たら、そこで**列の位置**を測り直す（ページごとに出てくる） */
      var c = colsOf(ln);
      if (c) { cols = c; return; }
      var dd = detOf(ln);
      if (dd) { det = dd; return; }            /* 🧾 v2.2.0 明細の物差しも測り直す */

      /* 🔴 いちばん最後＝組織計／総合計の行。**合計枚数が一緒に載っている** */
      if (RE_GRAND.test(x)){
        var gm = moneys(x);
        if (gm.length) total = gm[0];                    /* 行の先頭の数＝その計 */
        var sm = x.match(/合計枚数\D*(\d+)/);
        if (sm) sheets = +sm[1];
        close();
        return;
      }
      /* 🗓 v2.0.0 ページの頭の字から「対象期間」と「日付区分」を採る（最初の1回だけ）。
         ⚠ そのあと今までどおり読み飛ばす（伝票の頭と間違えないため）。 */
      if (RE_SKIP.test(x)){
        if (!term){
          var tm2 = x.match(RE_TERM);
          if (tm2){
            term = { from: wareki(tm2[1], tm2[2], tm2[3], tm2[4]),
                     to:   wareki(tm2[5] || tm2[1], tm2[6], tm2[7], tm2[8]) };
          }
        }
        if (!kbn){
          var km = x.match(RE_KBN);
          if (km) kbn = s(km[1]).replace(/[：:].*$/, '');
        }
        return;
      }

      var h = x.match(RE_HEAD);
      if (h){
        close();
        /* ナンバーは**日付を外してから**探す（「8年 8月 1日」を拾わないように） */
        var rest = x.slice(x.indexOf(h[0]) + h[0].length);
        var p = rest.match(RE_PLATE);
        cur = {
          売上日: wareki(h[1], h[2], h[3], h[4]),
          ナンバー: '', 顧客名: '', 受付担当: '', 伝票: '', 車種: '', 車台: '',
          伝票計: 0, 消費税: 0, 非課税: 0, 比べる金額: 0,
          /* 🧾 v2.2.0 伝票の中身 */
          明細: [], 法定: [], 原価: 0, 明細が合う: false,
          _頭: x
        };
        /* 🔴 まず**列の位置**で切る（これが本筋）。列が測れていない時だけ、字面で拾う。 */
        var byCol = cols ? {
          plate: pick(ln, cols, '登録番号'),
          name:  pick(ln, cols, '顧客名'),
          staff: pick(ln, cols, '受付担当者')
        } : null;
        cur.ナンバー = (byCol && byCol.plate) || (p ? (p[1] + ' ' + p[2] + ' ' + p[3] + ' ' + p[4]) : '');
        cur.顧客名   = (byCol && byCol.name) || '';
        cur.受付担当 = (byCol && byCol.staff) || '';
        if (!cur.顧客名 && !cur.受付担当){
          /* 逃げ道＝ナンバーの後ろを、数字と区分を落として拾う。
             ⚠ お名前と担当者を**割れない**ので、まとめて顧客名に入れる（誤って割るよりまし）。 */
          var tail = p ? rest.slice(rest.indexOf(p[0]) + p[0].length) : rest;
          cur.顧客名 = tail.replace(/[0-9,]+/g, ' ').replace(/個人|法人|事業所/g, ' ').replace(/\s+/g, '').trim();
        }
        pending = 3;
        return;
      }
      if (!cur) return;

      /* 頭のすぐ後ろ2行＝伝票番号（売上日の列）と、車台番号・車種名（登録番号の列） */
      if (pending > 0){
        pending--;
        if (!cur.伝票){
          var d = (cols ? pick(ln, cols, '売上日') : x).match(/^\s*([0-9]{2,6})\b/);
          if (d) cur.伝票 = d[1];
        }
        var car = cols ? pick(ln, cols, '登録番号') : '';
        if (car){
          /* 🚗 v2.2.0 車台番号＝英数字と「-」だけの並び。車種名はそうならない */
          if (/^[A-Z0-9][A-Z0-9\-]{4,}$/i.test(car)) { if (!cur.車台) cur.車台 = car; }
          else if (!cur.車種) cur.車種 = car;
        }
      }

      if (/非課税/.test(x)){
        var nm = moneys(x);
        if (nm.length){
          cur.非課税 += nm[nm.length - 1];
          /* 🧾 v2.2.0 何の費用かも残す（自賠責保険・重量税・印紙代） */
          var nn = t(x.replace(/非課税/, ' ').replace(/[0-9,]+/g, ' ').replace(/^\s*\d+\s*/, ''))
                   .replace(/\s+/g, '');
          cur.法定.push({ 名: nn || '法定費用', 金額: nm[nm.length - 1] });
        }
      }
      else if (/一般消費税/.test(x)){ var cm = moneys(x); if (cm.length) cur.消費税 += cm[cm.length - 1]; }
      /* 🔴 締め＝`作業計/原価計` の並び。行の**先頭の数**が伝票計
         （`伝票計 588,654 作業計/原価計 …` でも `957,022 作業計/原価計 …` でも同じ所） */
      else if (RE_CLOSE.test(x)){
        var tm = moneys(x);
        if (tm.length) cur.伝票計 = tm[0];
        /* 🧾 v2.2.0 原価＝`… 作業計/原価計 A B … 部品計/原価計 C D` の B と D */
        if (tm.length >= 5) cur.原価 = tm[2] + tm[4];
        close();
      }
      /* 🧾 v2.2.0 明細の1行。⚠ 見出し（【一般整備】など）も**そのまま残す**
         （ゆうた指定：作業のまとまりが分かるように） */
      else if (det){
        var hd = x.match(/【(.+?)】/);
        if (hd){
          var hr = detRow(ln, det);
          cur.明細.push({ 種: '見出し', 名: '【' + hd[1] + '】',
                          区分: t((hr && hr.f['作業区分']) || '') });
        } else {
          var rw = detRow(ln, det);
          if (rw){
            var pAmt = dnum(rw.f, '部品金額'), wAmt = dnum(rw.f, '作業金額');
            var isP = (pAmt != null);
            var amt = isP ? pAmt : wAmt;
            if (amt != null){
              cur.明細.push({
                種: isP ? '部品' : '作業',
                名: rw.名 || '（名称なし）',
                区分: t(rw.f[isP ? '部品区分' : '作業区分'] || ''),
                数量: dnum(rw.f, isP ? '部品数量' : '作業数量') || 0,
                単価: dnum(rw.f, isP ? '部品単価' : '作業単価') || 0,
                金額: amt,
                原価: dnum(rw.f, isP ? '部品原価' : '作業原価') || 0
              });
            }
          }
        }
      }
    });
    close();

    /* ================================================================
       4. 🔴 自己検証（ここが生命線）
       ================================================================ */
    var sumSlip = slips.reduce(function (a, r) { return a + r.伝票計; }, 0);
    var okTotal = (total != null) && (sumSlip === total);
    var okSheet = (sheets != null) && (slips.length === sheets);
    /* 🔴🔴 v2.0.0 日付区分が「売上日」でなければ通さない。
       ＝ 入金日などで出したPDFは、日付の列が別物なので突き合わせの答えが全部まちがう。
         しかも総合計の検算は通ってしまうので、**ここで止めないと嘘が出る**。 */
    var okKbn = (kbn === '' || kbn === '売上日');
    if (!okKbn){
      warn.push('このPDFは「日付区分：' + kbn + '」で出ています。'
              + '突き合わせに使えるのは「売上日」で出したものだけです。整備ソフトで出し直してください');
    }
    if (!term) warn.push('PDF の中に「対象期間」が見つかりませんでした（期間は手で入れてください）');
    if (total == null)  warn.push('PDF の中に「総合計」が見つかりませんでした');
    if (sheets == null) warn.push('PDF の中に「合計枚数」が見つかりませんでした');
    if (total != null && !okTotal)  warn.push('伝票を足した額（' + sumSlip.toLocaleString() + '）が、PDF の総合計（' + total.toLocaleString() + '）と合いません');
    if (sheets != null && !okSheet) warn.push('読み取れた枚数（' + slips.length + '）が、PDF の合計枚数（' + sheets + '）と合いません');

    return {
      ok: !!(okTotal && okSheet && okKbn),
      /* 🗓 v2.0.0 PDF 自身が言っている期間と日付区分（無ければ null／''） */
      期間: term,
      日付区分: kbn,
      伝票: slips,
      合計: {
        枚数: slips.length,
        伝票計: sumSlip,
        消費税: slips.reduce(function (a, r) { return a + r.消費税; }, 0),
        非課税: slips.reduce(function (a, r) { return a + r.非課税; }, 0),
        比べる金額: slips.reduce(function (a, r) { return a + r.比べる金額; }, 0)
      },
      検証: { 総合計: total, 合計枚数: sheets, 総合計が合う: okTotal, 枚数が合う: okSheet,
              日付区分が売上日: okKbn, 言い分: warn }
    };
  }

  /* ================================================================
     5. 入口
     ================================================================ */
  function read(file, onProgress){
    if (!file) return Promise.reject(new Error('PDF が選ばれていません'));
    var _lb = null;
    return lib().then(function (pdfjs) {
      _lb = pdfjs;
      return file.arrayBuffer().then(function (buf) {
        return pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
      });
    }).then(function (doc) {
      var lines = [], n = doc.numPages, chain = Promise.resolve();
      for (var i = 1; i <= n; i++){
        (function (pi) {
          chain = chain.then(function () {
            var _pg = null;
            return doc.getPage(pi)
              .then(function (pg) { _pg = pg; return pg.getTextContent(); })
              .then(function (tc) {
                /* 🔴 紙に見えているとおりの位置で並べ直す（この帳票は横向きに刷ってある） */
                var vp = null;
                try { vp = _pg.getViewport({ scale: 1 }); } catch (e) {}
                linesOf(tc.items || [], vp, _lb).forEach(function (r) { lines.push(r); });
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
