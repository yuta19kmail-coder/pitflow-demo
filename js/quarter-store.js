/* ================================================================================
   quarter-store.js  -  🗄 クォーターチェック②の**突き合わせた結果を残す**  PitFlow v1.184.0
   ================================================================================
   ◎なぜ要るか（ゆうた指定 2026-08-23）
     🗣「**まずPDFの付け合わせ結果は残るように保存して。今はテストとか練習とかで繰り返しやるけど、
     　　落ち着いてきたら 月始まり → Q1〜4 でそれぞれ付け合わせ、みたいなルーティン化する予定**」
     ＝ 走らせて終わりではなく、**その期間の結果が残っていて、あとから見返せる**こと。
       そして**どのクォーターが済んでいて、どれがまだか**が一目で分かること。

   ◎🔴 いちばん大事な決めごと ── **1つの期間＝1件。同じ期間をもう一度走らせたら上書き。**
     ＝ 練習でくり返しても**ゴミが積み上がらない**。
       残るのは「その期間の**いちばん新しい結果**」だけ。
       ⚠ だから「いつ・誰が走らせたか」を必ず一緒に残す（古い結果を見て判断しないため）。

   ◎置き場所（🔴 Firestore のルールを1文字も触っていない）
     `companies/{cid}/pitSettings/` の中に置く。
       ・`qruns`                    … 一覧（軽い要約だけ。ここを読めばQ1〜4の済み／未が分かる）
       ・`qrun-{from}_{to}`         … その期間の中身（直すものの行まで）
     🔴 `pitSettings/{id}` は**どの名前でも読み書きできる**ルールが既にある＝**新しい入れ物を作っていない**。
     ⚠ `db-pit.js` が触るのは `pitSettings/main` だけ。ここが増えても、ふだんの保存には1ミリも影響しない。

   ◎残すもの／残さないもの
     🔴 残す … 合計・差・内訳・検算・まとめ返車・**これから直すものの行**
     🚫 残さない … **結びついた全件**（55件などのOKだった行）。
        ＝ あとで見るのは「直すもの」だけ。全部残すと1件が太る（書類は1MBまで）。
     ⚠ 行は 400件で切る（切った時は正直に `切った:true` を残す）。

   ◎ここが返すもの
     pitQRunId(from,to)      … その期間の書類の名前
     pitQSaveRun(res, opt)   … 結果を残す（Promise）
     pitQLoadList()          … 一覧を読む（Promise<[…]>）
     pitQLoadRun(id)         … 1件の中身を読む（Promise）
     pitQMonthPlan(ym)       … その月の Q1〜Q4 と、済んでいるかを並べて返す
   ================================================================================ */
(function (w) {
  'use strict';

  function s(v){ return String(v == null ? '' : v); }
  function t(v){ return s(v).trim(); }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  var CAP_ROWS = 400;
  var CAP_LIST = 200;

  function co(){
    try { return (w.fb && w.fb.company) ? w.fb.company() : null; } catch (e) { return null; }
  }
  function cloud(){ return !!(w.PIT_CLOUD && co()); }
  function me(){
    try { return (w.pitFlowMe && w.pitFlowMe()) || ''; } catch (e) { return ''; }
  }

  function runId(from, to){ return 'qrun-' + t(from) + '_' + t(to); }

  /* 行を軽くする（画面に出している字だけ。中の作りをそのまま残さない＝あとで読めなくなるため） */
  function slimPair(p){
    return {
      ナンバー: s(p.soft && p.soft.ナンバー), お客様: s(p.soft && p.soft.顧客名),
      伝票: s(p.soft && p.soft.伝票), 売上日: s(p.soft && p.soft.売上日),
      数える日: s(p.pit && p.pit.数える日), 予約番号: s(p.pit && p.pit.予約番号),
      カード売上日: s(p.pit && p.pit.売上日), 売上日ちがい: !!p.売上日ちがい,   /* 💴 v1.185.0 */
      カードid: s(p.pit && p.pit.生 && p.pit.生.id),
      日付: s(p.日付 && p.日付.label), 日付の種類: s(p.日付 && p.日付.kind),
      整備ソフト: (p.soft && p.soft.金額) || 0, PitFlow: (p.pit && p.pit.確定金額) || 0,
      差: p.差 || 0, 結び方: s(p.結び方)
    };
  }
  function slimSoftOnly(r){
    return {
      売上日: s(r.soft && r.soft.売上日), 伝票: s(r.soft && r.soft.伝票),
      ナンバー: s(r.soft && r.soft.ナンバー), お客様: s(r.soft && r.soft.顧客名),
      金額: (r.soft && r.soft.金額) || 0, 受付担当: s(r.soft && r.soft.受付担当),
      カード: r.カード ? (s(r.カード.状態) || 'あり') : 'なし',
      カードid: s(r.カード && r.カード.生 && r.カード.生.id)
    };
  }
  function slimPitOnly(r){
    return {
      数える日: s(r.数える日), 予約番号: s(r.予約番号), ナンバー: s(r.ナンバー),
      お客様: s(r.顧客名), 金額: r.確定金額 || 0, フロント: s(r.フロント担当),
      カードid: s(r.生 && r.生.id)
    };
  }
  function cut(arr, fn){
    var a = (arr || []).slice(0, CAP_ROWS).map(fn);
    a._cut = (arr || []).length > CAP_ROWS;
    return a;
  }

  /* 一覧に載せる要約（🔴 ここは軽くする。Q1〜4 の済み／未を出すだけの情報） */
  function digest(res, opt){
    opt = opt || {};
    return {
      id: runId(res.期間.from, res.期間.to),
      from: s(res.期間.from), to: s(res.期間.to),
      at: (new Date()).toISOString(), by: me(),
      pdf: s(opt.pdf),
      枚数: res.整備ソフト.枚数, 台数: res.PitFlow.台数,
      整備ソフト金額: res.整備ソフト.金額, PitFlow金額: res.PitFlow.金額,
      差台数: res.差.台数, 差金額: res.差.金額,
      検算: !!(res.検算 && res.検算.合う),
      /* ⚠ v1.185.0 「売上日ちがい」は**ここに足さない**。
         直す件数＝**お金がズレている件数**という意味なので、日付だけの直しを混ぜると
         Q1〜4 の一覧で「まだ◯件ズレている」の読み方が変わってしまう。 */
      直す件数: (res.整備ソフトだけ.length + res.PitFlowだけ.length
               + res.金額ちがい.length + res.内訳.期間の外.台数),
      売上日ちがい件数: (res.売上日ちがい || []).length
    };
  }

  function saveRun(res, opt){
    opt = opt || {};
    if (!res || !res.期間 || !res.期間.from) return Promise.reject(new Error('期間がありません'));
    /* 🔴 検算が合っていない結果は残さない。
       ＝ 合わない数字を保存すると、あとで見た人が**それを本当の数字だと思う**。 */
    if (!(res.検算 && res.検算.合う)) return Promise.reject(new Error('検算が合っていないので残しません'));
    var c = co();
    if (!cloud() || !c) return Promise.reject(new Error('練習用サイトでは残せません（本番の PitFlow で使ってください）'));

    var d = digest(res, opt);
    var body = {
      期間: { from: d.from, to: d.to },
      走らせた日時: d.at, 走らせた人: d.by, PDF: d.pdf,
      整備ソフト: res.整備ソフト, PitFlow: res.PitFlow, 差: res.差,
      内訳: res.内訳, 検算: res.検算, まとめ返車: res.まとめ返車 || [],
      /* 🔴 残すのは「これから直すもの」だけ（OKだった行は残さない） */
      直すもの: {
        期間の外:     cut(res.結びついた.filter(function (p) { return p.期間の外; }), slimPair),
        金額ちがい:   cut(res.金額ちがい, slimPair),
        月またぎ:     cut(res.月またぎ, slimPair),
        Qまたぎ:      cut(res.Qまたぎ, slimPair),
        売上日ちがい:  cut(res.売上日ちがい || [], slimPair),   /* 💴 v1.185.0 日付だけの直し（金額は動かない） */
        整備ソフトだけ: cut(res.整備ソフトだけ, slimSoftOnly),
        PitFlowだけ:   cut(res.PitFlowだけ, slimPitOnly)
      }
    };
    /* 切った時は正直に言う（黙って部分的に残さない） */
    var cutAny = Object.keys(body.直すもの).some(function (k) { return body.直すもの[k]._cut; });
    body.行を切った = !!cutAny;
    Object.keys(body.直すもの).forEach(function (k) { delete body.直すもの[k]._cut; });

    return c.collection('pitSettings').doc(d.id).set(body)
      .then(function () { return pushList(d); })
      .then(function () { return d; });
  }

  /* 一覧に足す（同じ期間があれば差し替え・新しい順・上限200件） */
  function pushList(d){
    var c = co(); if (!c) return Promise.resolve();
    var ref = c.collection('pitSettings').doc('qruns');
    return ref.get().then(function (snap) {
      var list = (snap.exists && snap.data() && snap.data().一覧) || [];
      list = list.filter(function (x) { return x && x.id !== d.id; });
      list.unshift(d);
      list.sort(function (a, b) { return (a.from < b.from) ? 1 : (a.from > b.from ? -1 : 0); });
      if (list.length > CAP_LIST) list = list.slice(0, CAP_LIST);
      return ref.set({ 一覧: list });
    });
  }

  function loadList(){
    var c = co();
    if (!cloud() || !c) return Promise.resolve([]);
    return c.collection('pitSettings').doc('qruns').get().then(function (snap) {
      return (snap.exists && snap.data() && snap.data().一覧) || [];
    }).catch(function () { return []; });
  }

  function loadRun(id){
    var c = co();
    if (!cloud() || !c) return Promise.resolve(null);
    return c.collection('pitSettings').doc(t(id)).get().then(function (snap) {
      return snap.exists ? snap.data() : null;
    }).catch(function () { return null; });
  }

  /* ================================================================
     その月の Q1〜Q4（ルーティンの形）
     ----------------------------------------------------------------
     🔴 区切りは **sales.js の `pitQuarterOf` 1本**を借りる。ここで 1-7／8-15 と書かない。
     ⚠ 引数は 'YYYY-MM'。省いたら今月。
     ================================================================ */
  function monthPlan(ym, list){
    var now = new Date();
    var y = now.getFullYear(), m1 = now.getMonth() + 1;
    var p = t(ym).split('-');
    if (p.length === 2 && +p[0] > 2000){ y = +p[0]; m1 = +p[1]; }
    var last = new Date(y, m1, 0).getDate();
    var days = [1, 8, 16, 24];
    var byId = {};
    (list || []).forEach(function (x) { if (x && x.id) byId[x.id] = x; });
    return days.map(function (d, i) {
      var q = (w.pitQuarterOf ? w.pitQuarterOf(y + '-' + pad(m1) + '-' + pad(d)) : null);
      var from = q ? q.s : (y + '-' + pad(m1) + '-' + pad(d));
      var to   = q ? q.e : (y + '-' + pad(m1) + '-' + pad(i === 3 ? last : days[i + 1] - 1));
      return { no: i + 1, label: (q ? q.label : (m1 + '月 第' + (i + 1) + 'クォーター')),
               from: from, to: to, run: byId[runId(from, to)] || null };
    });
  }

  w.pitQRunId     = runId;
  w.pitQSaveRun   = saveRun;
  w.pitQLoadList  = loadList;
  w.pitQLoadRun   = loadRun;
  w.pitQMonthPlan = monthPlan;
})(window);
