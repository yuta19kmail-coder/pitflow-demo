/* ================================================================================
   ai-check.js  -  🤖 クォーターチェック③ AIチェック  PitFlow v1.181.0
   ================================================================================
   ◎これは何
     日常チェック（規則）と ②突合の結果を**まとめて AI に読ませて**、
     **規則では拾えない粗さ**を出してもらう。
       ・同じ人・同じ工程で**くり返し**起きている抜け
       ・入力が**後回しになっている**車
       ・前回から**良くなった／悪くなった**こと

   ◎🔴 2026-08-08 から「足りない」と言い続けていた3つを、ここで用意する
     ① **母数** …… 担当ごとの担当台数（何台のうち何件かが分からないと、人を比べられない）
     ② **車の中身** … フローとメモ（文章が無いと「なぜ止まったか」が読めない）
     ③ **前回の書き出し** … 1回きりの出来事と、くり返しているクセを見分けるため
     ⚠ この3つが無いと、AI は「一度きりの出来事」を「クセ」と読み違える。

   ◎🔴🔴 決めごと
     🔴 **鍵は画面に置かない。** 聞くのはサーバー（`functions/index.js` の `pfAsk`）を通す。
     🔴 **お金がかかるので「管理」だけ。** ボタンを消すだけにせず、**サーバー側でも止めている**。
     🔴 **送るのは「数字と短い言葉」だけ。** 電話番号・住所は送らない。
        お名前は**突き合わせに要る所だけ**（AI にどの車かを特定させるため）。
     🔴 **前回ぶんは「要約」だけ残す**（設定の中／`settings.aiLast`）。
        ＝ 新しい入れ物（コレクション）を作らない＝**Firestore のルールを1文字も触らない**。
        ⚠ 長い答えをそのまま貯めると、設定の書類が太る。**要旨は2,000字まで**に切る。

   ◎ここが返すもの
     pitAiHtml()   … クォーターチェックの③の中身（画面）
     pitAiRun()    … 走らせる
   ================================================================================ */
(function (w) {
  'use strict';

  function esc(x){ return String(x==null?'':x).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }
  function s(v){ return String(v == null ? '' : v); }
  function t(v){ return s(v).trim(); }
  function num(v){ v = +v; return isFinite(v) ? v : 0; }

  var MODEL = 'claude-sonnet-5';
  var CAP = { 所見: 300, 車: 60, メモ: 240, 要旨: 2000 };

  function A(){
    var U = w._insp = w._insp || {};
    U.ai = U.ai || { busy: '', err: '', out: '', at: '', usage: null };
    return U.ai;
  }
  function isAdmin(){ try { return !!(w.pitCanEditFinal && w.pitCanEditFinal()); } catch (e) { return false; } }
  function isCloud(){ return !!w.PIT_CLOUD; }

  /* ================================================================
     1. 材料を作る（🔴 ここが「足りない3つ」の本体）
     ================================================================ */

  /* ① 母数＝担当ごとの担当台数（その期間に数えた車） */
  function denominator(from, to){
    var countDate = w.pitSalesCountDate || function (c) { return s(c.completedAt || c.returnDateFinal || c.returnDate); };
    var by = {};
    ((w.state && w.state.cards) || []).forEach(function (c) {
      if (!c || c._draft) return;
      var d = s(countDate(c));
      if (!d || d < from || d > to) return;
      var who = t(c.frontStaff || c.staff) || '（担当なし）';
      by[who] = by[who] || { 担当台数: 0, 実績台数: 0, 金額: 0 };
      by[who].担当台数++;
      if (c.status === 'returned'){ by[who].実績台数++; by[who].金額 += num(c.amountFinal); }
    });
    return by;
  }

  /* ② 車の中身＝フローとメモ（所見に出ている車だけ・短く切る）
     ⚠ 全部の車を送らない。**指摘が出ている車**に絞る＝送る量と、読む意味の両方でこれが正しい。 */
  function bodies(findings){
    var ids = {}, out = [];
    findings.forEach(function (f) { if (f.kind === 'card' && f.refId) ids[f.refId] = 1; });
    var cards = (w.state && w.state.cards) || [];
    cards.forEach(function (c) {
      if (out.length >= CAP.車) return;
      if (!c || !ids[c.id]) return;
      /* フロー＝その車に何が起きたかの記録。**新しい方から少しだけ** */
      var flow = [];
      try {
        (c.log || []).slice(-6).forEach(function (e) {
          var word = t(e && (e.text || e.label || e.to));
          if (word) flow.push(word);
        });
      } catch (e) {}
      var memo = t(c.memo || c.note || '');
      out.push({
        id: s(c.id), 予約番号: s(c.resNo),
        お客様: s(w.pitCustName ? w.pitCustName(c) : c.customer),
        車: s(c.car), 状態: s(w.pitCardStatusText ? w.pitCardStatusText(c) : c.status),
        入庫日: s(c.reserveDate), 返車予定: s(c.returnDate),
        フロント: s(c.frontStaff || c.staff),
        フロー: flow,
        メモ: memo.slice(0, CAP.メモ)
      });
    });
    return out;
  }

  /* ③ 前回の書き出し（設定の中に残してある要約） */
  function last(){
    try { return (w.state && w.state.settings && w.state.settings.aiLast) || null; } catch (e) { return null; }
  }
  function saveLast(rec){
    if (!w.state) return;
    w.state.settings = w.state.settings || {};
    w.state.settings.aiLast = rec;
    if (w.PitDB && w.PitDB.save) w.PitDB.save();
  }

  /* 材料ぜんぶ。⚠ 画面にも「何を送るか」を出せるように、素直な形で返す */
  function material(){
    var U = (w._insp && w._insp.q) || {};
    var from = t(U.from), to = t(U.to);
    var res = (w._insp && w._insp.res) || (w.pitInspectRun ? w.pitInspectRun() : null);
    var ex = (res && w.pitInspectExport) ? w.pitInspectExport(res) : null;
    var find = (res && res.findings) ? res.findings : [];

    return {
      いつ: (new Date()).toISOString().slice(0, 10),
      期間: { from: from, to: to },
      日常チェック: ex ? {
        対象台数: ex.対象台数, 規則の数: ex.規則の数,
        直す件数: ex.直す件数, 確認した件数: ex.確認した件数,
        重さごと: ex.重さごと, 分類ごと: ex.分類ごと, 規則ごと: ex.規則ごと,
        所見: (ex.所見 || []).slice(0, CAP.所見)
      } : null,
      突合: quarterDigest(),
      母数: denominator(from, to),
      車の中身: bodies(find),
      前回: last()
    };
  }

  /* ②の結果は**要点だけ**渡す（表そのものは送らない＝量が増えるだけ） */
  function quarterDigest(){
    var R = (w._insp && w._insp.q && w._insp.q.res) || null;
    if (!R) return null;
    return {
      期間: R.期間, 整備ソフト: R.整備ソフト, PitFlow: R.PitFlow, 差: R.差,
      内訳: R.内訳, 検算: R.検算,
      まとめ返車: R.まとめ返車,
      金額ちがい: R.金額ちがい.map(function (p) {
        return { ナンバー: p.soft.ナンバー, お客様: p.soft.顧客名, 整備ソフト: p.soft.金額, PitFlow: p.pit.確定金額, 差: p.差 };
      }),
      Qまたぎ: R.Qまたぎ.map(function (p) {
        return { ナンバー: p.soft.ナンバー, お客様: p.soft.顧客名, 売上日: p.soft.売上日, 数える日: p.pit.数える日, 金額: p.soft.金額 };
      }),
      整備ソフトだけ: R.整備ソフトだけ.map(function (r) {
        return { 売上日: r.soft.売上日, ナンバー: r.soft.ナンバー, お客様: r.soft.顧客名, 金額: r.soft.金額,
                 カード: r.カード ? (r.カード.状態 || 'あり') : 'なし' };
      }),
      PitFlowだけ: R.PitFlowだけ.map(function (r) {
        return { 数える日: r.数える日, ナンバー: r.ナンバー, お客様: r.顧客名, 金額: r.確定金額 };
      })
    };
  }

  /* ================================================================
     2. 聞き方（🔴 言葉づかいはここ1本。画面で綴らない）
     ================================================================ */
  var SYSTEM = [
    'あなたは自動車整備工場の業務データを点検する担当です。相手は工場長（非エンジニア）です。',
    '',
    '# 守ること',
    '- **専門用語・コードの名前・フィールド名を書かない。** 現場の言葉だけで書く。',
    '- **数字は必ず根拠と一緒に。**「◯件中◯件」のように母数を添える。母数が分からないことは書かない。',
    '- **一度きりの出来事を「クセ」と言わない。** くり返しと言えるのは、前回のぶんにも同じ形がある時だけ。',
    '- 人を責めない。**仕組みの話**にする（誰がではなく、どの工程で落ちるか）。',
    '- 分からないことは「分からない」と書く。**それらしい推測で埋めない。**',
    '',
    '# 出す形（この4つの見出しだけ。マークダウンの見出し記号は使わない）',
    '【いちばん効くこと】1つだけ。今週これを直せば数が一番減る、というもの。',
    '【くり返し起きていること】最大3つ。前回のぶんと見くらべて、続いているものだけ。',
    '【今回だけの気になること】最大3つ。くり返しではないが、金額が大きい・止まっている、など。',
    '【前回からの変化】良くなった点と悪くなった点を1行ずつ。前回が無ければ「前回のぶんがありません」と書く。',
    '',
    '各項目は2〜3行。全体で800字以内。'
  ].join('\n');

  function userText(m){
    return [
      '次の資料を読んで、決められた4つの見出しで答えてください。',
      '',
      '# 資料の読み方',
      '- 「日常チェック」＝アプリの規則が見つけた、直すべき所の一覧です。',
      '- 「突合」＝整備ソフトの売上チェックリストと、アプリの実績を突き合わせた結果です。',
      '  「期間の外」＝同じ車だが、アプリ側の日付が期間の外に立っている（＝売上が別の週に落ちている）。',
      '- 「母数」＝担当ごとの担当台数。人を比べる時は必ずこれで割ってください。',
      '- 「車の中身」＝指摘が出ている車の、直近の動きとメモです。',
      '- 「前回」＝前回このチェックを走らせた時の要約です。無い場合もあります。',
      '',
      '# 資料',
      '```json',
      JSON.stringify(m, null, 1),
      '```'
    ].join('\n');
  }

  /* ================================================================
     3. 走らせる
     ================================================================ */
  w.pitAiRun = function (){
    var U = A();
    if (U.busy) return;
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

    U.busy = 'AIに聞いています…'; U.err = ''; U.out = '';
    if (w.renderInspect) renderInspect();

    var fn = w.firebase.app().functions('asia-northeast1').httpsCallable('pfAsk');
    fn({ model: MODEL, system: SYSTEM, user: userText(m), max_tokens: 2048 })
      .then(function (r) {
        var d = (r && r.data) || {};
        U.busy = ''; U.out = s(d.text); U.at = new Date().toLocaleString('ja-JP'); U.usage = d.usage || null;
        /* 🔴 次回の「前回」に使う要約だけ残す（長い答えは切る） */
        saveLast({
          いつ: m.いつ, 期間: m.期間,
          直す件数: m.日常チェック ? m.日常チェック.直す件数 : null,
          規則ごと: m.日常チェック ? m.日常チェック.規則ごと : null,
          突合の差: m.突合 ? m.突合.差 : null,
          要旨: U.out.slice(0, CAP.要旨)
        });
        if (w.pitLog) pitLog('AIチェックを走らせた', { kind:'inspect',
          label: (m.期間.from || '') + '〜' + (m.期間.to || '') + '　直す件数 ' + (m.日常チェック ? m.日常チェック.直す件数 : '—') });
        if (w.renderInspect) renderInspect();
      })
      .catch(function (e) {
        U.busy = '';
        U.err = s((e && e.message) || e);
        if (w.renderInspect) renderInspect();
      });
  };

  /* 送る材料をそのまま落とす（何を送っているか、いつでも自分で確かめられるように） */
  w.pitAiDownload = function (){
    try {
      var m = material();
      var name = 'PitFlowAIチェック材料_' + m.いつ + '.json';
      var blob = new Blob([JSON.stringify(m, null, 1)], { type:'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      if (w.pitToast) pitToast(name + ' を書き出しました');
    } catch (e) {
      if (w.pitToast) pitToast('書き出せませんでした');
    }
  };

  /* ================================================================
     4. 画面
     ================================================================ */
  w.pitAiHtml = function (){
    var U = A(), L = last();
    var m = null;
    try { m = material(); } catch (e) {}

    var h = '';
    h += '<div class="ai-sub">日常チェックと②の結果をまとめて AI に読ませ、'
       +   '<b>規則では拾えない粗さ</b>（同じ工程でくり返し起きている抜け、入力が後回しの車）を出します。</div>';

    /* 何を送るか＝毎回ここに出す（黙って送らない） */
    h += '<div class="ai-mat"><b>AI に渡すもの</b>'
       +   '<ul>'
       +     '<li>日常チェックの所見 <b>' + (m && m.日常チェック ? Math.min(m.日常チェック.所見.length, CAP.所見) : 0) + '</b>件</li>'
       +     '<li>②突合の結果 ' + (m && m.突合 ? '<b>あり</b>' : '<b>まだ</b>（先にPDFを読ませると精度が上がります）') + '</li>'
       +     '<li>母数＝担当ごとの担当台数 <b>' + (m ? Object.keys(m.母数 || {}).length : 0) + '</b>人ぶん</li>'
       +     '<li>指摘が出ている車の中身（動きとメモ） <b>' + (m ? (m.車の中身 || []).length : 0) + '</b>台</li>'
       +     '<li>前回のぶん ' + (L ? '<b>あり</b>（' + esc(L.いつ) + '）' : '<b>なし</b>') + '</li>'
       +   '</ul>'
       +   '<div class="ai-mat-n">⚠ 電話番号・住所は送りません。'
       +     '<button class="ai-b2" onclick="pitAiDownload()">送るものを書き出す</button></div>'
       + '</div>';

    if (!isCloud()){
      h += '<div class="ai-note">練習用サイトでは動きません（本番の PitFlow で使ってください）。</div>';
      return h;
    }
    if (!isAdmin()){
      h += '<div class="ai-note">AIチェックを走らせられるのは、設定権限（管理）のある人だけです。'
         +   '<span>（AI に聞くと、その都度お金がかかるためです）</span></div>';
      return h;
    }

    h += '<div class="ai-run">'
       +   '<button class="ai-b" ' + (U.busy ? 'disabled' : '') + ' onclick="pitAiRun()">'
       +     (U.busy ? esc(U.busy) : 'AIチェックを走らせる') + '</button>'
       +   '<span class="ai-cost">1回あたり数円〜数十円かかります。</span>'
       + '</div>';

    if (U.err) h += '<div class="ai-ng"><b>走らせられませんでした。</b><span>' + esc(U.err) + '</span></div>';

    if (U.out){
      h += '<div class="ai-out"><div class="ai-out-h">AI の見立て<span>' + esc(U.at)
         +   (U.usage ? '　／　送り ' + U.usage.in + '・返り ' + U.usage.out : '') + '</span></div>'
         +   '<div class="ai-out-b">' + esc(U.out).replace(/\n/g, '<br>') + '</div>'
         +   '<div class="ai-out-n">⚠ これは AI の見立てです。<b>直すかどうかは人が決めます。</b></div>'
         + '</div>';
    } else if (L && L.要旨){
      h += '<div class="ai-prev"><b>前回（' + esc(L.いつ) + '）の見立て</b>'
         +   '<div class="ai-out-b">' + esc(L.要旨).replace(/\n/g, '<br>') + '</div></div>';
    }
    return h;
  };
})(window);
