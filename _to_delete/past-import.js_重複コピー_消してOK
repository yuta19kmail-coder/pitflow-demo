/* ================================================================================
   past-import.js  -  🗃 PitFlow を始める前の伝票を取り込む  PitFlow v2.12.0
   ================================================================================
   ◎なにをするもの（ゆうた指定 2026-08-25）
     🗣「PitFlowの始動前のデータ、ここから、ちゃんとナンバーとかで整合性がとれるのだけ、
     　　チェックじゃなくて、あくまで**車体番号と履歴の挿入**をあなた出来たりする？」
     🗣「**ナンバーと顧客名で整合して、不安があるものは入れないか、後でリストにするか**して。
     　　あくまで**初動の弾みをつけるためだけ**だから、**間違いが一番ヤダ**な」

   ◎🔴🔴 いちばん大事な決めごと ── **迷ったら入れない。**
     入れるのは **ナンバーと顧客名の両方が合って、当たる車がちょうど1台** の時だけ。
     それ以外は**1件も書かず、理由つきで一覧に出す**。
     ＝ 入らなかったものは、あとから人が見て決められる。まちがって入るより良い。

   ◎入れるもの
     ① **車体番号**（車の情報へ）… 🔴 空の時だけ。すでに入っていたら書かない
     ② **伝票**（その車の来店履歴へ）… 明細・法定費用・原価つき

   ◎🔴 予約カードが無い伝票
     PitFlow を始める前なので、予約番号（カード）がありません。
     ・伝票の鍵は **`伝票番号｜売上日`**（同じPDFを2回入れても増えない）
     ・`予約番号` は空。作業履歴の画面が**カードの無い伝票の行**として出す（customers.js）

   ◎🔴 検算
     PDFの**枚数と総合計が合わないファイルは、1件も使いません**（そのファイルだけ外す）。
     読み取りの物差しは `quarter-pdf.js` の1本を借りる。ここで読み方を作らない。

   ◎戻せるように
     入れる前に **控えのJSON**を落とします（入れた車と、入れた中身）。

   ◎ここが返すもの
     pitPastImportOpen()   … 画面を開く
     pitPastImportFiles(el)… ファイルを受け取る
     pitPastImportGo()     … 取り込む
   ================================================================================ */
(function (w, d) {
  'use strict';

  function s(v){ return String(v == null ? '' : v); }
  function t(v){ return s(v).trim(); }
  function num(v){ v = +v; return isFinite(v) ? v : 0; }
  function yen(n){ return num(n).toLocaleString(); }
  function esc(x){ return s(x).replace(/[&<>"']/g, function (m) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]; }); }

  var U = { files: [], busy: '', err: '', 読んだ: null, 見立て: null, 入れた: null };

  /* 🔴 名寄せは quarter-match.js の1本を借りる（ここで書き写さない） */
  function nPlate(v){ return w.pitQNormPlate ? w.pitQNormPlate(v) : t(v); }
  function nName(v){ return w.pitQNormName ? w.pitQNormName(v) : t(v); }
  function realPlate(v){ return w.pitIsRealPlate ? w.pitIsRealPlate(v) : !!t(v); }

  /* ================================================================
     1. 突合＝**ナンバーと顧客名の両方**が合って、当たる車がちょうど1台
     ================================================================ */
  function match(den){
    if (!realPlate(den.ナンバー)) return { ok:false, なぜ:'ナンバーが無い（仮登録車両など）' };
    var np = nPlate(den.ナンバー), nn = nName(den.顧客名);
    if (!np) return { ok:false, なぜ:'ナンバーが読めない' };
    if (!nn) return { ok:false, なぜ:'お客様の名前が無い' };
    var 同じナンバー = [], 同じ両方 = [];
    ((w.state && w.state.customers) || []).forEach(function (cu) {
      ((cu && cu.vehicles) || []).forEach(function (v) {
        if (!v || !realPlate(v.plate) || nPlate(v.plate) !== np) return;
        同じナンバー.push({ cust: cu, veh: v });
        var cn = nName(w.pitCustDispName ? w.pitCustDispName(cu) : (cu.name || ''));
        if (cn && cn === nn) 同じ両方.push({ cust: cu, veh: v });
      });
    });
    if (!同じナンバー.length) return { ok:false, なぜ:'PitFlow にこのナンバーの車がありません' };
    if (!同じ両方.length)     return { ok:false, なぜ:'ナンバーは合うが、お客様の名前が合いません', 候補:同じナンバー.length };
    if (同じ両方.length > 1)  return { ok:false, なぜ:'同じナンバーとお名前の車が ' + 同じ両方.length + '台あります' };
    return { ok:true, cust: 同じ両方[0].cust, veh: 同じ両方[0].veh };
  }

  /* 伝票1枚ぶんの形。🔴 quarter-write.js が書く形と**そろえる**（見る側は1つの表なので） */
  function slip(den){
    return {
      予約番号: '',                                   /* 🔴 カードが無い＝空。鍵は下の2つ */
      伝票番号: t(den.伝票), 売上日: t(den.売上日),
      金額: num(den.比べる金額 != null ? den.比べる金額 : den.金額),
      原価: num(den.原価), 消費税: num(den.消費税), 伝票計: num(den.伝票計),
      法定: (den.法定 || []).map(function (x) { return { 名: t(x.名), 金額: num(x.金額) }; }),
      明細: (den.明細 || []).map(function (x) {
        return { 種: t(x.種), 名: t(x.名), 区分: t(x.区分),
                 数量: +x.数量 || 0, 単価: num(x.単価), 金額: num(x.金額), 原価: num(x.原価) };
      }),
      フロント: t(den.受付担当),
      PitFlow前: true,                                /* 画面が「始動前の記録」と分かるように */
      入れた日: (new Date()).toISOString().slice(0, 10)
    };
  }
  function denAmt(x){ return num(x.比べる金額 != null ? x.比べる金額 : x.金額); }
  /* 伝票1枚を見わける鍵。
     🔴 伝票番号＋売上日では足りない。元データの伝票番号 "00" は「番号が無い」の意味で、
        同じ売上日に何台ぶんも並ぶ（例：2026-04-19 に11枚）。
        どの車の話か（ナンバー）と金額まで入れて、はじめて1枚を指せる。 */
  function denKey(x, plate){
    return t(x.伝票番号 || x.伝票) + '|' + t(x.売上日) + '|' + nPlate(plate) + '|' + denAmt(x);
  }

  /* ================================================================
     2. 読む → 見立てを作る（まだ1件も書かない）
     ================================================================ */
  function look(){
    var 入れる = [], 入れない = [], 車体 = { 入る:0, 同じ:0, ちがう:0, 伝票に無い:0 };
    var already = {};
    (U.読んだ.伝票 || []).forEach(function (den) {
      var m = match(den);
      if (!m.ok){ 入れない.push({ den: den, なぜ: m.なぜ }); return; }
      var key = denKey(den, m.veh.plate || den.ナンバー);
      var mine = (Array.isArray(m.veh.伝票) ? m.veh.伝票 : []);
      var dup = mine.some(function (x) { return denKey(x, m.veh.plate || den.ナンバー) === key; });
      if (dup){ 入れない.push({ den: den, なぜ: 'もう入っています' }); return; }
      if (already[key]){ 入れない.push({ den: den, なぜ: 'このPDFの中で重なっています' }); return; }
      already[key] = 1;
      /* 車体番号がどうなるか（書くのは空の時だけ） */
      var vin = t(den.車台), now = t(m.veh.vin);
      var v結 = !vin ? '伝票に無い' : (!now ? '入る' : (now.toUpperCase() === vin.toUpperCase() ? '同じ' : 'ちがう'));
      車体[v結 === '入る' ? '入る' : v結 === '同じ' ? '同じ' : v結 === 'ちがう' ? 'ちがう' : '伝票に無い']++;
      入れる.push({ den: den, cust: m.cust, veh: m.veh, vin: vin, vin結: v結 });
    });
    /* 入れない理由ごとにまとめる */
    var 理由 = {};
    入れない.forEach(function (x) { 理由[x.なぜ] = (理由[x.なぜ] || 0) + 1; });
    U.見立て = { 入れる: 入れる, 入れない: 入れない, 理由: 理由, 車体: 車体 };
  }

  function readAll(files){
    U.files = files; U.err = ''; U.見立て = null; U.入れた = null;
    U.busy = 'PDFを読んでいます…'; paint();
    if (!w.pitQPdfRead){ U.busy = ''; U.err = 'PDFを読む道具が読み込めていません'; paint(); return; }
    var 伝票 = [], 使った = [], 外した = [];
    var i = 0;
    function next(){
      if (i >= files.length){
        U.busy = '';
        if (!伝票.length){ U.err = '読めたPDFがありませんでした'; paint(); return; }
        U.読んだ = { 伝票: 伝票, 使った: 使った, 外した: 外した };
        look(); paint(); return;
      }
      var f = files[i++];
      U.busy = 'PDFを読んでいます… ' + i + ' / ' + files.length + '（' + f.name + '）'; paint();
      w.pitQPdfRead(f, function (){}).then(function (r) {
        /* 🔴 検算が合わないファイルは**1件も使わない**（そのファイルだけ外す） */
        if (!r.ok || !r.検証.枚数が合う || !r.検証.総合計が合う){
          外した.push({ 名: f.name, なぜ: (r.検証.言い分 || []).join('／') || '枚数か総合計が合いません' });
        } else {
          使った.push({ 名: f.name, 期間: r.期間, 枚数: r.伝票.length, 合計: r.検証.総合計 });
          r.伝票.forEach(function (x) { 伝票.push(x); });
        }
        next();
      }).catch(function (e) {
        外した.push({ 名: f.name, なぜ: s(e && e.message ? e.message : e) });
        next();
      });
    }
    next();
  }

  /* ================================================================
     3. 取り込む（🔴 控えを落としてから書く）
     ================================================================ */
  function go(){
    var M = U.見立て;
    if (!M || !M.入れる.length) return;
    var det = ['・作業内容の履歴と車体番号を書き込みます',
               '・入れるのは ' + M.入れる.length + '件（ナンバーとお名前が両方合ったものだけ）',
               '・入れる前に、控えのファイルを1つ落とします'];
    var ask = w.pitAsk ? w.pitAsk('過去の伝票を取り込みますか？', { detail: det, ok: '取り込む' })
                       : Promise.resolve(true);
    ask.then(function (yes) {
      if (!yes) return;
      /* 控え＝入れる前のその車の中身 */
      var 控え = { _kind:'pitflow-past-import-backup', _at:(new Date()).toISOString(), 車: [] };
      var seen = {};
      M.入れる.forEach(function (x) {
        var k = s(x.cust.id) + '|' + s(x.veh.id);
        if (seen[k]) return; seen[k] = 1;
        控え.車.push({ custId:x.cust.id, vehId:x.veh.id, plate:x.veh.plate,
                       vin: s(x.veh.vin), 伝票: JSON.parse(JSON.stringify(x.veh.伝票 || [])) });
      });
      dl('PitFlow_過去伝票_取り込む前の控え_' + (new Date()).toISOString().slice(0,10) + '.json', 控え);

      var out = { 伝票:0, 車体番号:0, 車: 0 };
      var cars = {};
      M.入れる.forEach(function (x) {
        if (!Array.isArray(x.veh.伝票)) x.veh.伝票 = [];
        x.veh.伝票.unshift(slip(x.den));
        out.伝票++;
        if (x.vin結 === '入る' && w.pitVehSetVinOn){
          if (w.pitVehSetVinOn(x.cust, x.veh, x.vin) === '入れた') out.車体番号++;
        }
        x.veh.updatedAt = Date.now(); x.cust.updatedAt = Date.now();
        cars[s(x.cust.id) + '|' + s(x.veh.id)] = 1;
      });
      out.車 = Object.keys(cars).length;
      /* 売上日の新しい順にそろえる */
      Object.keys(cars).forEach(function (k) {
        var p = k.split('|');
        var cu = ((w.state && w.state.customers) || []).filter(function (c) { return s(c.id) === p[0]; })[0];
        var v = cu && (cu.vehicles || []).filter(function (x) { return s(x.id) === p[1]; })[0];
        if (v && Array.isArray(v.伝票)) v.伝票.sort(function (a, b) { return t(b.売上日).localeCompare(t(a.売上日)); });
      });
      if (w.PitDB && w.PitDB.save) { try { w.PitDB.save(); } catch (e) {} }
      if (w.pitLog) w.pitLog('過去の伝票を取り込んだ', { kind:'inspect',
        label: out.車 + '台／伝票 ' + out.伝票 + '件／車体番号 ' + out.車体番号 + '件' });
      U.入れた = out;
      U.見立て = null; U.読んだ = null;
      paint();
      if (w.pitToast) w.pitToast('取り込みました（' + out.伝票 + '件）');
    });
  }

  function dl(name, obj){
    try {
      var a = d.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type:'application/json' }));
      a.download = name; d.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    } catch (e) {}
  }

  /* 入らなかったものを表で落とす（あとで人が見る） */
  w.pitPastImportList = function (){
    var M = U.見立て; if (!M) return;
    var rows = [['売上日','伝票番号','ナンバー','お客様','車種','金額','入れなかった理由']];
    M.入れない.forEach(function (x) {
      rows.push([t(x.den.売上日), t(x.den.伝票), t(x.den.ナンバー), t(x.den.顧客名),
                 t(x.den.車種), num(x.den.比べる金額), t(x.なぜ)]);
    });
    var csv = '﻿' + rows.map(function (r) {
      return r.map(function (c) { return '"' + s(c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    try {
      var a = d.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' }));
      a.download = 'PitFlow_過去伝票_入れなかったもの_' + (new Date()).toISOString().slice(0,10) + '.csv';
      d.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    } catch (e) {}
  };

  /* ================================================================
     4. 画面
     ================================================================ */
  function paint(){
    var host = d.getElementById('pi-body');
    if (!host) return;
    host.innerHTML = bodyHtml();
    if (w.icoBoot) { try { w.icoBoot(host); } catch (e) {} }
  }

  function bodyHtml(){
    var h = '';
    if (U.入れた){
      return '<div class="pi-done"><b>取り込みました</b>'
        + '<div>' + U.入れた.車 + '台／伝票 ' + U.入れた.伝票 + '件／車体番号 ' + U.入れた.車体番号 + '件</div>'
        + '<div class="pi-note">お客様の「作業履歴」に入りました</div></div>';
    }
    h += '<div class="pi-pick"><label class="pi-file">'
       +   '<input type="file" accept="application/pdf,.pdf" multiple onchange="pitPastImportFiles(this)">'
       +   '<span><i data-ic=box data-ics=16></i> 売上チェックリストPDF を選ぶ（何枚でも）</span>'
       + '</label></div>';
    if (U.busy) return h + '<div class="pi-load"><span class="pi-sp"></span><b>' + esc(U.busy) + '</b></div>';
    if (U.err)  return h + '<div class="pi-ng">' + esc(U.err) + '</div>';
    var M = U.見立て; if (!M) return h;

    var R = U.読んだ;
    h += '<div class="pi-files">';
    R.使った.forEach(function (x) {
      h += '<div class="pi-f ok"><b>' + esc(x.名) + '</b><span>' + esc(x.期間.from) + '〜' + esc(x.期間.to)
         + '　' + x.枚数 + '枚　' + yen(x.合計) + '円</span></div>';
    });
    /* 🔴 外したファイルは黙らない */
    R.外した.forEach(function (x) {
      h += '<div class="pi-f ng"><b>' + esc(x.名) + '</b><span>使いません：' + esc(x.なぜ) + '</span></div>';
    });
    h += '</div>';

    h += '<div class="pi-sum">'
       +   '<div class="pi-c go"><span>入れる</span><b>' + M.入れる.length + '</b>件</div>'
       +   '<div class="pi-c no"><span>入れない</span><b>' + M.入れない.length + '</b>件</div>'
       +   '<div class="pi-c"><span>車体番号が入る</span><b>' + M.車体.入る + '</b>件</div>'
       + '</div>';

    if (M.入れない.length){
      h += '<div class="pi-why"><div class="pi-why-t">入れないもの</div>';
      Object.keys(M.理由).sort(function (a, b) { return M.理由[b] - M.理由[a]; }).forEach(function (k) {
        h += '<div class="pi-why-r"><span>' + esc(k) + '</span><b>' + M.理由[k] + '件</b></div>';
      });
      h += '<button class="vh-btn" onclick="pitPastImportList()">'
         +   '<i data-ic=download data-ics=15></i> 入れなかったものを一覧で落とす</button></div>';
    }
    if (M.車体.ちがう){
      h += '<div class="pi-warn">⚠ 車体番号が<b>すでに別の番号</b>で入っている車が ' + M.車体.ちがう
         + '件あります。<b>書き換えません</b>（伝票のほうは入ります）。</div>';
    }
    h += '<div class="pi-go">'
       +   (M.入れる.length
            ? '<button class="vh-btn primary" onclick="pitPastImportGo()">'
              + '<i data-ic=download data-ics=16></i> ' + M.入れる.length + '件を取り込む</button>'
            : '<span class="pi-n">入れられるものがありません</span>')
       + '</div>';
    return h;
  }

  w.pitPastImportOpen = function (){
    U = { files: [], busy: '', err: '', 読んだ: null, 見立て: null, 入れた: null };
    var h = '<div class="cm-head"><i data-ic=box data-ics=16></i> 過去の伝票を取り込む '
      + '<span class="cm-sub">PitFlow を始める前のぶん</span>'
      + '<button class="cm-x" onclick="custCloseModal()"><i data-ic=close data-ics=16></i></button></div>'
      + '<div class="cm-body" id="pi-body"></div>';
    if (w.custShowModal) w.custShowModal(h, 'pi-box');
    paint();
  };
  w.pitPastImportFiles = function (el){
    var fs = (el && el.files) ? [].slice.call(el.files) : [];
    if (fs.length) readAll(fs);
  };
  w.pitPastImportGo = go;
})(window, document);
