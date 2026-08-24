/* ================================================================================
   quarter-cost.js  -  🔎 入れたPDFの中身を、うちの覚えと照らす物差し  PitFlow v2.3.0
   ================================================================================
   ◎これは何 ＝ **伝票の中身（作業・部品・原価）を、うちの過去と照らして「気になる行」を出す。**
     画面を持たない。数を出すだけ。**良し悪しは言わない。**

   ◎🔴🔴 いちばん大事な決めごと（ゆうた 2026-08-24）
     🗣「このチェックの難しいところがルールによる判定というより、
        ナレッジ的な部分に依存した『気づき』的な部分が多いところ」
     🗣「AIに確度を持たせて報告する感じかな　最終的にはさらに紙での付け合わせもある」
     🔴 **断定しない。** ここが出すのは「うちのふだんと違う」という事実だけ。
        「まちがっている」とは言わない。**決めるのは人と、紙。**
     🔴 **確度を必ず付ける。** 高・中・低。低いものも捨てない（並べるだけ）。
     🔴 **件数で切らない。** ゆうた指定＝外れの大きい順に並べて、上から見てもらう。

   ◎見る目線は4つ（ゆうた 2026-08-24）
     ① 掛け率がふだんと違う …… 原価 ÷ 売価 が、うちの過去の幅から外れている
     ② 売価がふだんと違う …… 🗣「ミニのラジエターならこのぐらいのはずだけど、
                              こんなに高い（やすい）けど平気？みたいな目線もほしい」
     ③ いつも一緒に出るものが、今回だけ無い（オイル交換なのにドレーンワッシャーが無い等）
     ④ 初めて見る品名 …… 覚えに無い。ここは数字では何も言えない＝AIの出番

   ◎🔴 ふだんから純正も社外も両方使っている品名（`両`）は、外れ扱いにしない
     🗣「ふだんから両方使っているので、上げてもノイズになる」
     ＝ 印だけ付けて、確度をひとつ下げる。

   ◎ここが返すもの
     pitCostNorm(名)        … 品名を覚えの鍵に寄せる
     pitCostOf(名)          … その品の覚え（無ければ null）
     pitCostCarOf(車, 名)    … その車種での売価の覚え（無ければ null）
     pitCostSetOf(作業)      … その作業に、ふつう一緒に出る部品
     pitCostLook(伝票)       … 伝票1枚を見て、気になる行を返す
     pitCostLookAll(伝票[])  … まとめて見て、**外れの大きい順**に並べて返す
   ================================================================================ */
(function (w) {
  'use strict';

  function s(v){ return String(v == null ? '' : v); }
  function num(v){ v = +v; return isFinite(v) ? v : 0; }
  function B(){ return w.PIT_COST_BOOK || { 品:{}, 車:{}, 組:{} }; }

  /* 全角の英数字・記号は半角へ。空白は落とす。
     ⚠ これをしないと「Ｏリング」と「Oリング」が別ものになる（実際なっていた）。 */
  var Z2H = {};
  (function(){ for (var i = 0x21; i < 0x7f; i++) Z2H[String.fromCharCode(i + 0xfee0)] = String.fromCharCode(i); })();
  function han(x){
    var o = '';
    for (var i = 0; i < x.length; i++){ var c = x.charAt(i); o += (Z2H[c] != null ? Z2H[c] : c); }
    return o.replace(/　/g, '');
  }
  var _keys = null;
  function keys(){
    if (!_keys){
      _keys = Object.keys(B().品 || {});
      _keys.sort(function (a, b) { return b.length - a.length; });   /* 長いものから当てる */
    }
    return _keys;
  }
  /* 🔴 品名を覚えの鍵に寄せる。
     ⚠ PDFの列の幅で名前が切れていることがある（「産業廃棄物処理費用・ショートパー」）。
        だから **前方一致**で寄せる。6文字以上の鍵だけを使う（短い鍵は当たりすぎる）。 */
  function norm(name){
    var n = han(s(name)).replace(/\s+/g, '');
    if (!n) return '';
    var bk = B().品;
    if (bk[n]) return n;
    var K = keys();
    for (var i = 0; i < K.length; i++){
      if (K[i].length >= 6 && n.indexOf(K[i]) === 0) return K[i];
    }
    return n;
  }
  function of(name){ return B().品[norm(name)] || null; }
  function carOf(car, name){
    var c = (B().車 || {})[han(s(car)).replace(/\s+/g, '')];
    return (c && c[norm(name)]) || null;
  }
  function setOf(work){
    var k = han(s(work)).replace(/\s+/g, '').slice(0, 16);
    return (B().組 || {})[k] || null;
  }

  /* ================================================================
     ⚖ 確度（高・中・低）
     ----------------------------------------------------------------
     🔴 決め手は **お金でどれだけ効くか**（はみ出したぶん × その行の金額）。
        ＝ 掛け率が5%ずれた10万円の部品と、50%ずれた300円のワッシャーでは、
           前を先に見たい。率だけで並べると、後ろが上に来てしまう。
     ⚠ 弱める条件を先に見る（**弱いものを高と言わない**ほうが、逆より害が小さい）。
     ================================================================ */
  function grade(kiki, bk){
    var down = 0;
    if (bk){
      if (bk.両) down++;                 /* ふだんから両方使う品名 */
      if (num(bk.n) < 6) down++;         /* 覚えの回数が少ない＝目安として弱い */
    }
    var g = (kiki >= 8000) ? 3 : (kiki >= 2000) ? 2 : 1;
    g -= down;
    return g >= 3 ? '高' : (g === 2 ? '中' : '低');
  }

  /* ================================================================
     🔎 伝票1枚を見る
     ================================================================ */
  function look(slip){
    var out = [];
    var car = s(slip && (slip.車種 || slip.車));
    var items = (slip && slip.明細) || [];

    items.forEach(function (m, i) {
      if (!m || m.種 === '見出し') return;
      var name = s(m.名), g = num(m.金額);
      if (m.種 !== '部品' || g <= 0) return;
      var bk = of(name);

      /* ④ 初めて見る品名＝数字では何も言えない。**黙って捨てない。** */
      if (!bk){
        out.push({ i: i, 名: name, 種: '初めて', 確度: '低', 効き: Math.min(g, 3000),
                   金額: g, 原価: num(m.原価), 車: car,
                   言い分: 'この品名は、過去5か月の伝票に出ていません' });
        return;
      }

      /* ① 掛け率 */
      var rate = num(m.原価) / g;
      var lo = bk.率[0] - 0.02, hi = bk.率[2] + 0.02;   /* ゆとり±2ポイント */
      if (rate < lo || rate > hi){
        var over = (rate > hi) ? (rate - hi) : (lo - rate);
        var kiki = Math.round(over * g);
        /* 🔴🔴 ふだんから純正も社外も両方使っている品名は、**外れ扱いにしない**（ゆうた指定）。
           🗣「印をつけて、外れ扱いにはしない」
           ＝ 毎回ひっかかってノイズになる（ドレーンワッシャーだけで一覧が埋まっていた）。
              消しはしない。**別のところ**にまとめて、見たい時だけ開けるようにする。 */
        out.push({ i: i, 名: name, 種: (bk.両 ? '両方' : '掛け率'),
                   確度: grade(kiki, bk), 効き: kiki,
                   金額: g, 原価: num(m.原価), 車: car,
                   いま: Math.round(rate * 1000) / 10,
                   ふだん: [Math.round(bk.率[0] * 1000) / 10, Math.round(bk.率[2] * 1000) / 10],
                   回: bk.n, 両: !!bk.両, 言い分: '' });
      }

      /* ② 売価（🔴 車種の覚えがあればそちらが先。無ければ品名だけの覚え） */
      var u = num(m.単価) || g;
      var cb = carOf(car, name);
      var pl = cb ? cb[0] : bk.価[0], ph = cb ? cb[2] : bk.価[2], pn = cb ? cb[3] : bk.n;
      var PLO = pl * 0.8, PHI = ph * 1.25;              /* ゆとり ±2〜2.5割 */
      if (pl > 0 && (u < PLO || u > PHI)){
        var d = (u > PHI) ? (u - PHI) : (PLO - u);
        var kk = Math.round(d * Math.max(num(m.数量), 1));
        out.push({ i: i, 名: name, 種: '売価', 確度: grade(kk, { n: pn, 両: bk.両 }), 効き: kk,
                   金額: g, 原価: num(m.原価), 車: car,
                   いま: u, ふだん: [pl, ph], 回: pn, 車の覚え: !!cb, 両: !!bk.両,
                   言い分: cb ? ('この車種での過去 ' + pn + '回ぶん') : '車種を問わない過去 ' + pn + '回ぶん' });
      }
    });

    /* ③ いつも一緒に出るものが、今回だけ無い
       🔴 **同じ部品は、1枚の伝票につき1件にまとめる。**
          ⚠ まとめないと、車検の伝票で「ショートパーツが無い」が
             車検基本料金・測定一式・検査代行料 の3つから3回出る（実際に出ていた）。
             同じことを3回言われると、読む気が失せる。 */
    var have = {};
    items.forEach(function (m) { if (m && m.種 === '部品') have[norm(m.名)] = 1; });
    var miss = {};
    items.forEach(function (m) {
      if (!m || m.種 !== '作業') return;
      var st = setOf(m.名);
      if (!st) return;
      (st.連 || []).forEach(function (pair) {
        var p = pair[0], r = pair[1];
        if (have[p]) return;
        /* いちばん「ふつう入る」きっかけを、その部品の代表にする */
        if (miss[p] && miss[p].r >= r) return;
        miss[p] = { r: r, w: s(m.名), n: st.n };
      });
    });
    Object.keys(miss).forEach(function (p) {
      var x = miss[p];
      /* 効き＝入っていれば立っていたはずの売上（その品のふだんの値段）。
         ⚠ 値段の分からない品は0のまま＝**下に沈むが、消さない。** */
      var bk2 = B().品[p];
      var yen = bk2 ? num(bk2.価[1]) : 0;
      out.push({ i: -1, 名: p, 種: '抜け', 確度: (x.r >= 0.9 ? '高' : x.r >= 0.75 ? '中' : '低'),
                 効き: Math.round(yen * x.r), 金額: 0, 原価: 0, 車: car,
                 きっかけ: x.w, 割合: Math.round(x.r * 100), 回: x.n,
                 言い分: '「' + x.w + '」をした伝票の ' + Math.round(x.r * 100) + '% に入っています' });
    });
    return out;
  }

  /* 🔴 まとめて見て、**外れの大きい順**に並べる（件数では切らない・ゆうた指定） */
  function lookAll(slips){
    var all = [];
    (slips || []).forEach(function (sl) {
      look(sl).forEach(function (x) {
        x.伝票 = s(sl.伝票); x.売上日 = s(sl.売上日); x.客 = s(sl.顧客名 || sl.客);
        x.ナンバー = s(sl.ナンバー);
        all.push(x);
      });
    });
    var ord = { 高: 0, 中: 1, 低: 2 };
    all.sort(function (a, b) {
      if (ord[a.確度] !== ord[b.確度]) return ord[a.確度] - ord[b.確度];
      return num(b.効き) - num(a.効き);
    });
    return all;
  }

  w.pitCostNorm    = norm;
  w.pitCostOf      = of;
  w.pitCostCarOf   = carOf;
  w.pitCostSetOf   = setOf;
  w.pitCostLook    = look;
  w.pitCostLookAll = lookAll;
  w.pitCostGrade   = grade;
})(window);
