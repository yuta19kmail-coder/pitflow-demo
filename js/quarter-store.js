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
     pitQRunId(from,to)          … その期間の書類の名前
     pitQSaveRun(res, opt)       … 結果を1つ残す（Promise）※ opt.soft で伝票の行も残る
     pitQSaveRuns([{res,opt}])   … 🧾 v2.9.8 **1枚のPDFぶんをまとめて残す**（一覧に触るのは最後の1回）
     pitQRepairList(plans, list) … 🩹 v2.9.8 一覧の取りこぼしを、書類から作り直して足す
     pitQLoadList()              … 一覧を読む（Promise<[…]>）
     pitQLoadRun(id)             … 1件の中身を読む（Promise）
     pitQMonthPlan(ym)           … その月の Q1〜Q4 と、済んでいるかを並べて返す

   ◎🧾 v2.9.8（ゆうた 2026-08-25）**読んだ伝票の行を、そのまま残すようにした。**
     ＝ 開き直したら「写しを描き直す」のではなく「**もう一度突き合わせる**」。
       走らせた直後と、残した結果の**顔が1つ**になる（詳しくは下の slimSoft のところ）。
   ================================================================================ */
(function (w) {
  'use strict';

  function s(v){ return String(v == null ? '' : v); }
  function t(v){ return s(v).trim(); }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  var CAP_ROWS = 400;
  var CAP_LIST = 200;
  /* 🧾 v2.9.8 伝票の行の上限。1行 **296バイト**（本番実測 2026-08-25）なので
     1500枚 ≒ 444KB。Firestore の1書類 1MB に対して余裕を残した数。
     ⚠ 1クォーターは8日ぶん＝ふだん100枚前後。ここに当たることはまず無い。 */
  var CAP_SOFT = 1500;

  function co(){
    try { return (w.fb && w.fb.company) ? w.fb.company() : null; } catch (e) { return null; }
  }
  function cloud(){ return !!(w.PIT_CLOUD && co()); }
  function me(){
    try { return (w.pitFlowMe && w.pitFlowMe()) || ''; } catch (e) { return ''; }
  }

  function runId(from, to){ return 'qrun-' + t(from) + '_' + t(to); }

  /* 🃏🃏 v2.7.0（ゆうた報告「一回閉じると前の表示スタイルにもどっちゃう」）
     -----------------------------------------------------------------
     残した結果も**走らせた直後と同じカード**で出すために、
     カードが読む項目（車種・車体番号・同一性・売上日差・一致の印）をここに足した。
     🔴 足りない項目があるとカードが描けないので、**card() が読むものと必ず揃えておくこと。**
        （足す時は quarter.js の `card()` と、下の `savedPair()` の対応も一緒に直す）
     ⚠ v2.7.0 より前に残した結果にはこれらが入っていない。
        その時は今までどおり**表**で出す（黙って空にしない）＝`_v` の印で見分ける。
     ⚠ 軽くする方針は変えない＝中の作り（生データ）はそのまま残さない。 */
  function slimPair(p){
    var sg = p.売上日差 || {};
    return {
      ナンバー: s(p.soft && p.soft.ナンバー), お客様: s(p.soft && p.soft.顧客名),
      伝票: s(p.soft && p.soft.伝票), 売上日: s(p.soft && p.soft.売上日),
      数える日: s(p.pit && p.pit.数える日), 予約番号: s(p.pit && p.pit.予約番号),
      カード売上日: s(p.pit && p.pit.売上日), 売上日ちがい: !!p.売上日ちがい,   /* 💴 v1.185.0 */
      カードid: s(p.pit && p.pit.生 && p.pit.生.id),
      日付: s(p.日付 && p.日付.label), 日付の種類: s(p.日付 && p.日付.kind),
      整備ソフト: (p.soft && p.soft.金額) || 0, PitFlow: (p.pit && p.pit.確定金額) || 0,
      差: p.差 || 0, 結び方: s(p.結び方),
      受付担当: s(p.soft && p.soft.受付担当), フロント: s(p.pit && p.pit.フロント担当),  /* 👤 v2.1.0 */
      /* 🃏 v2.7.0 カードで出すために足したぶん */
      車種: s(p.soft && p.soft.車種), カード車種: s(p.pit && p.pit.車種),
      車体番号: s(p.soft && p.soft.車体番号), カード車体番号: s(p.pit && p.pit.車体番号),
      同一性: s(p.同一性), 同じ車: !!p.同じ車, 期間の外: !!p.期間の外,
      売上日差kind: s(sg.kind), 売上日差label: s(sg.label),
      金額一致: !!p.金額一致, 担当一致: !!p.担当一致,
      /* 🔔 v2.8.4 直す先が無いQまたぎ。ふつうはここに落ちた行は残さないが、
         残した行を戻した時にカードが青く（お知らせで）出せるように、印だけは持たせる。 */
      正常なQまたぎ: !!p.正常なQまたぎ
    };
  }
  function slimSoftOnly(r){
    return {
      売上日: s(r.soft && r.soft.売上日), 伝票: s(r.soft && r.soft.伝票),
      ナンバー: s(r.soft && r.soft.ナンバー), お客様: s(r.soft && r.soft.顧客名),
      金額: (r.soft && r.soft.金額) || 0, 受付担当: s(r.soft && r.soft.受付担当),
      カード: r.カード ? (s(r.カード.状態) || 'あり') : 'なし',
      カードid: s(r.カード && r.カード.生 && r.カード.生.id),
      /* 🃏 v2.7.0 カードで出すために足したぶん */
      車種: s(r.soft && r.soft.車種), 車体番号: s(r.soft && r.soft.車体番号),
      カード状態: s(r.カード && r.カード.状態), カード返車日: s(r.カード && r.カード.返車日),
      カード予約番号: s(r.カード && r.カード.予約番号),
      /* 🔗 v2.8.0 Qの境目の車。**ここを足したら quarter.js の savedSoftOnly でも読むこと**
         （試験 test_quarter_saved.mjs が「残す側⊇戻す側」を機械で見ている） */
      カード別Q: s(r.カード別Q)
    };
  }
  function slimPitOnly(r){
    return {
      数える日: s(r.数える日), 予約番号: s(r.予約番号), ナンバー: s(r.ナンバー),
      お客様: s(r.顧客名), 金額: r.確定金額 || 0, フロント: s(r.フロント担当),
      カードid: s(r.生 && r.生.id),
      /* 🃏 v2.7.0 カードで出すために足したぶん */
      車種: s(r.車種), 車体番号: s(r.車体番号),
      /* 🔗 v2.8.0 「伝票は別のQにあります」。**残さないと、開き直したとき赤に戻る** */
      別のQ: s(r.別のQ),
      別のQ確定: !!r.別のQ確定   /* 🧾 v2.9.1 実際に別のQで結ばれた＝OK（お知らせ）側に置く */
    };
  }
  /* ================================================================
     🧾🧾 v2.9.8（ゆうた 2026-08-25）**読んだ伝票の行そのものを残す。**
     ----------------------------------------------------------------
     🗣「素直に直近のPDF自体を保持する形だとデータ的に大変かな？」
     🗣「PDFを保持するならチェック済みと未チェックまで一覧で保持しておいて。
        上書きor消去が掛かったタイミングでチェック内容ごと消えるような挙動でどうだろう？」

     ◎これで何が良くなるか＝**顔が1つになる。**
       いままでは「走らせた直後」と「残した結果」で**別の道**を通っていた。
         走らせた直後 … 伝票とカードを突き合わせた**生の結果**（`pitQMatch` が作る）
         残した結果   … 直す行だけを削って残した**写し**（`slimPair` → `savedPair`）
       写しには判定の材料が全部は入らないので、
         ・押せるボタンが出ない（あけぼのさんの「グレーで残ったまま」がこれ）
         ・OK の行が消えている
         ・分け方を変えるたびに**両側を直さないと顔が割れる**（v2.8.4 で踏んだ）
       伝票の行さえ残っていれば、**開き直した時にもう一度突き合わせるだけ**でいい。
       ＝ 物差しも描き手も1本。写しを直す必要がそもそも無くなる。

     ◎大きさ（🔴 出す前に実測した・2026-08-25 本番データ）
       1行 **296バイト**（明細を持たない形）。
         109枚 → 約 32KB ／ 400枚 → 約 116KB
       Firestore の1書類 **1MB** に対して十分な余裕。
     ◎🚫 **明細は持たない。**（1枚に20〜40行あり、ここだけで桁が変わる）
       明細を使うのは「原価の気になる行（quarter-cost.js）」と
       「元のPDFに刷り込む（quarter-print.js）」の2つだけで、
       どちらも**元のPDFそのもの**が要る＝どのみちPDFを入れ直してもらう道になる。
       ⚠ だから明細が要る仕事は、開き直しただけでは出来ない。そこは今までどおり。
     ================================================================ */
  function slimSoft(r){
    return {
      売上日: s(r.売上日), 伝票: s(r.伝票), ナンバー: s(r.ナンバー), 顧客名: s(r.顧客名),
      車種: s(r.車種), 金額: (r.金額 || 0), 受付担当: s(r.受付担当),
      車台: s(r.車台 || r.車体番号),
      /* 金額の内わけ（画面が「伝票計 − 消費税 − 非課税」と説明するために使う） */
      法定計: (Array.isArray(r.法定) ? r.法定.reduce(function (a, x) { return a + ((x && x.金額) || 0); }, 0) : 0),
      原価: (r.原価 || 0), 消費税: (r.消費税 || 0), 伝票計: (r.伝票計 || 0),
      明細が合う: !!r.明細が合う, 明細合計: (r.明細合計 || 0),
      /* 🚫 明細・法定の中身・枠（紙の場所）は持たない＝上のコメントの理由 */
      明細: []
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
      /* 🔴🔴 v2.10.0（ゆうた 2026-08-25「上のBOXの残数がクリックしたら⓪になったり」）
         ----------------------------------------------------------------
         ◎**残り件数の物差しが2本あった。**
           画面（Qの箱を押したあと） … `pitQNokori(res)`
           一覧の要約（押す前）       … ここで**別の式**を書いていた
           ＝ 同じQなのに、押す前と押したあとで数字が変わる。
         🔴 **`pitQNokori` 1本にする。** ここで足し算を書かない。
         ⚠ `pitQNokori` は quarter.js にある（読み込みはこちらが先だが、
            呼ばれるのは保存の時なので、その頃には居る）。念のため無い時は0にせず、
            **昔の式に落ちる**（黙って0にすると「済・OK」と嘘をつくため）。 */
      直す件数: (w.pitQNokori ? w.pitQNokori(res)
                             : (res.整備ソフトだけ.length + res.PitFlowだけ.length
                                + res.金額ちがい.length + res.内訳.期間の外.台数)),
      売上日ちがい件数: (res.売上日ちがい || []).length
    };
  }

  /* 🔴 v2.9.8 **伝票が0枚の期間は残さない。**
     PDFの期間が1か月ぶんだと、まだ来ていない Q4 が「0枚・0台・検算OK」で作られる。
     残すと Q4 の印が**走らせてもいないのに「済・OK」**になり、
     「どれが済んでいて、どれがまだか」というこの機能の目的そのものが壊れる。
     🔴 判定はここ1本。画面（quarter.js）でも `pitQCanSave` を借りて、条件を書き写さない。 */
  function canSave(res){
    return !!(res && res.整備ソフト && (res.整備ソフト.枚数 || 0) > 0);
  }

  function saveRun(res, opt){
    opt = opt || {};
    if (!res || !res.期間 || !res.期間.from) return Promise.reject(new Error('期間がありません'));
    /* 🔴 検算が合っていない結果は残さない。
       ＝ 合わない数字を保存すると、あとで見た人が**それを本当の数字だと思う**。 */
    if (!(res.検算 && res.検算.合う)) return Promise.reject(new Error('検算が合っていないので残しません'));
    if (!canSave(res)) return Promise.reject(new Error('伝票が1枚も無い期間なので残しません'));
    var c = co();
    if (!cloud() || !c) return Promise.reject(new Error('練習用サイトでは残せません（本番の PitFlow で使ってください）'));

    var d = digest(res, opt);

    /* 🧾 v2.9.8 伝票の行。
       🔴 **切ったら持たない。** 半分だけ残すと、開き直した時に
          「PitFlow にしか無い」が**嘘で量産される**（伝票が足りないだけなのに）。
          ＝「無いと言う前に窓を広げて探す」の逆をやることになる。
          だから多すぎる時は**持たないと決めて、そう書く**（古い写しの道に落ちる）。 */
    var softRows = (opt.soft || []).map(slimSoft);
    var 伝票OK = softRows.length > 0 && softRows.length <= CAP_SOFT;

    var body = {
      期間: { from: d.from, to: d.to },
      走らせた日時: d.at, 走らせた人: d.by, PDF: d.pdf,
      /* 🃏 v2.7.0 残した行の作り。2 以上＝カードで出せる（quarter.js の savedHtml が見る）。
         🧾 v2.9.8 **3 ＝ 伝票の行を持っている**＝開き直したら**もう一度突き合わせる**（写しを見ない）。
         ⚠ 上の slim* に項目を足したら、この数も上げること。 */
      _v: (伝票OK ? 3 : 2),
      /* 🧾 v2.9.8 読んだ伝票の行そのもの。**これがあれば残りは飾り**（もう一度突き合わせれば出る）。
         ⚠ 下の `直すもの` は**古い版のために残している**。伝票があるなら誰も読まない。
            消さない理由＝v2.9.8 より前の端末が開いた時に、空の画面を出さないため。 */
      伝票: (伝票OK ? softRows : []),
      伝票を残せなかった: (伝票OK ? '' : (softRows.length
        ? (softRows.length + '枚は多すぎるので、伝票の行は残していません（' + CAP_SOFT + '枚まで）')
        : '伝票の行が手元にありませんでした')),
      整備ソフト: res.整備ソフト, PitFlow: res.PitFlow, 差: res.差,
      内訳: res.内訳, 検算: res.検算, まとめ返車: res.まとめ返車 || [],
      /* 🔔 v2.8.4 「直す先が無いQまたぎ」の台数と金額。**行は残さない**（直すものではないので）。
         ⚠ でも黙って消すと、あとで見た人が「16件どこ行った？」になる。数だけ残して1行で言う。 */
      /* 🗂 v2.8.6 OK だった行は残さない（軽くするため）。**数だけ残す。**
         ＝ 残した結果でも「OK 65件」と出せる＝走らせた直後と同じ顔になる。 */
      OK台数: ((res.グループ && res.グループ.OK) || []).length,
      お知らせ: (function () {
        var a = res.結びついた.filter(function (p) { return p.正常なQまたぎ; });
        return { 台数: a.length, 金額: a.reduce(function (x, p) { return x + (p.効き || 0); }, 0) };
      })(),
      /* 🔴 残すのは「これから直すもの」だけ（OKだった行は残さない）
         🔔🔔 v2.8.4（ゆうた 2026-08-25「1回目のときと変わる症状」）
         　 v2.8.3 で「返車日だけQをまたいだ＝直す先が無い」を OK 扱いにしたのに、
         　 **残す側がそれを知らず、16件を「直すもの」として残していた。**
         　 ＝ 走らせた直後は OK なのに、閉じて開くと「期間の外 16件」に戻る。
         　 v2.7.0 で直した「同じ画面が2つの顔を持つ」を、**分け方の側でまたやっていた。**
         🔴 **判定を書き写さない。`pitQMatch` が貼った `正常なQまたぎ` を見るだけ。** */
      直すもの: {
        期間の外:     cut(res.結びついた.filter(function (p) { return p.期間の外 && !p.正常なQまたぎ; }), slimPair),
        金額ちがい:   cut(res.金額ちがい, slimPair),
        月またぎ:     cut(res.月またぎ, slimPair),
        Qまたぎ:      cut((res.Qまたぎ || []).filter(function (p) { return !p.正常なQまたぎ; }), slimPair),
        売上日ちがい:  cut(res.売上日ちがい || [], slimPair),   /* 💴 v1.185.0 日付だけの直し（金額は動かない） */
        担当ちがい:    cut(res.担当ちがい || [], slimPair),     /* 👤 v2.1.0 合計は動かない（内訳だけ動く） */
        整備ソフトだけ: cut(res.整備ソフトだけ, slimSoftOnly),
        PitFlowだけ:   cut(res.PitFlowだけ, slimPitOnly)
      }
    };
    /* 切った時は正直に言う（黙って部分的に残さない） */
    var cutAny = Object.keys(body.直すもの).some(function (k) { return body.直すもの[k]._cut; });
    body.行を切った = !!cutAny;
    Object.keys(body.直すもの).forEach(function (k) { delete body.直すもの[k]._cut; });

    return c.collection('pitSettings').doc(d.id).set(body)
      /* 🔴 v2.9.8 まとめて残す時（saveRuns）は、一覧に触るのは**最後の1回だけ**。
         ここで各自が書くと上書き合戦になって、Q1 が一覧から消える。 */
      .then(function () { return opt._listOff ? null : pushList([d]); })
      .then(function () { return d; });
  }

  /* ================================================================
     🧾🧾 v2.9.8 **1枚のPDFぶんを、まとめて残す**（ゆうた 2026-08-25「Q1が抜けたりする」）
     ----------------------------------------------------------------
     ◎何が起きていたか（本番で現物を見て確かめた）
       1枚のPDFが Q1・Q2・Q3 に分かれると、`saveRun` が**3本同時に**走っていた。
       書類（`qrun-*`）は別々なので3つとも無事。
       ところが**一覧（`qruns`）は1つ**で、3本がそれぞれ
         読む → 自分のぶんを足す → 書く
       をやるので、**最後に書いた人が勝つ**＝先の2つが消える。
       実際 2026-08-25 の本番では、3つとも書類はあるのに一覧には2つしか無かった。
       ＝ データは無事。**壊れていたのは一覧だけ。**
     🔴 直し方＝**書類は並列でよい。一覧に触るのは最後に1回だけ。**
        （順番に保存するのでは遅いだけで、根っこは「一覧を何度も書く」こと）
     ================================================================ */
  function saveRuns(items){
    var c = co();
    if (!cloud() || !c) return Promise.reject(new Error('練習用サイトでは残せません（本番の PitFlow で使ってください）'));
    var jobs = (items || []).map(function (it) {
      return saveOne(it.res, it.opt || {}).catch(function (e) { return { エラー: s(e && e.message ? e.message : e) }; });
    });
    return Promise.all(jobs).then(function (ds) {
      var okd = ds.filter(function (x) { return x && x.id; });
      if (!okd.length) return ds;
      return pushList(okd).then(function () { return ds; });
    });
  }
  /* 書類だけ書く（一覧には触らない）＝ 上の saveRuns から呼ぶ用 */
  function saveOne(res, opt){
    var o = {}; Object.keys(opt || {}).forEach(function (k) { o[k] = opt[k]; });
    o._listOff = true;
    return saveRun(res, o);
  }

  /* 一覧に足す（同じ期間があれば差し替え・新しい順・上限200件）
     🔴 v2.9.8 **配列で受ける。** 1回の読み書きで全部入れる＝上書き合戦にならない。 */
  function pushList(ds){
    var c = co(); if (!c) return Promise.resolve();
    var arr = Array.isArray(ds) ? ds : [ds];
    if (!arr.length) return Promise.resolve();
    var ref = c.collection('pitSettings').doc('qruns');
    return ref.get().then(function (snap) {
      var list = (snap.exists && snap.data() && snap.data().一覧) || [];
      var ids = {}; arr.forEach(function (d) { if (d && d.id) ids[d.id] = 1; });
      list = list.filter(function (x) { return x && !ids[x.id]; });
      list = arr.concat(list);
      list.sort(function (a, b) { return (a.from < b.from) ? 1 : (a.from > b.from ? -1 : 0); });
      if (list.length > CAP_LIST) list = list.slice(0, CAP_LIST);
      return ref.set({ 一覧: list });
    });
  }

  /* ================================================================
     🩹 v2.9.8 **一覧の取りこぼしを、その場で直す。**
     ----------------------------------------------------------------
     ◎一覧はあくまで**索引**で、本当のことは書類（`qrun-*`）に書いてある。
       上の競合で既に落ちてしまったぶん（本番の Q1）は、直しただけでは戻らない。
       だから「その月の Q1〜Q4 を開く時に、一覧に無いものは**書類を直接見に行く**」。
       あれば索引を作り直して足す。＝ 人が何もしなくても、開いた時に揃う。
     ⚠ 読むのは **一覧に無いものだけ**（ふつうは0件＝ただ働きしない）。
     ⚠ `直す件数` は書類の中の行から数え直す。行が400で切られていたら
        その数までしか数えられないので、`行を切った` の時は正直に `+` を付ける。
     ================================================================ */
  function digestOfDoc(id, doc){
    if (!doc) return null;
    var d = doc.直すもの || {};
    var n = (d.整備ソフトだけ || []).length + (d.PitFlowだけ || []).length
          + (d.金額ちがい || []).length + (((doc.内訳 || {}).期間の外 || {}).台数 || 0);
    return {
      id: id, from: s((doc.期間 || {}).from), to: s((doc.期間 || {}).to),
      at: s(doc.走らせた日時), by: s(doc.走らせた人), pdf: s(doc.PDF),
      枚数: (doc.整備ソフト || {}).枚数 || 0, 台数: (doc.PitFlow || {}).台数 || 0,
      整備ソフト金額: (doc.整備ソフト || {}).金額 || 0, PitFlow金額: (doc.PitFlow || {}).金額 || 0,
      差台数: (doc.差 || {}).台数 || 0, 差金額: (doc.差 || {}).金額 || 0,
      検算: !!((doc.検算 || {}).合う),
      直す件数: n,
      売上日ちがい件数: (d.売上日ちがい || []).length,
      /* 🩹 索引を作り直したものだと分かるようにしておく（あとで追いかけられるように） */
      索引を作り直した: true
    };
  }
  function repairList(plans, list){
    var c = co();
    if (!cloud() || !c) return Promise.resolve(list || []);
    var have = {}; (list || []).forEach(function (x) { if (x && x.id) have[x.id] = 1; });
    var miss = (plans || []).map(function (p) { return runId(p.from, p.to); })
                            .filter(function (id) { return id && !have[id]; });
    if (!miss.length) return Promise.resolve(list || []);
    return Promise.all(miss.map(function (id) {
      return c.collection('pitSettings').doc(id).get()
        .then(function (sn) { return sn.exists ? digestOfDoc(id, sn.data()) : null; })
        .catch(function () { return null; });
    })).then(function (found) {
      var add = found.filter(Boolean);
      if (!add.length) return list || [];
      return pushList(add).then(function () {
        var out = (list || []).slice().concat(add);
        out.sort(function (a, b) { return (a.from < b.from) ? 1 : (a.from > b.from ? -1 : 0); });
        return out;
      }).catch(function () {
        /* 書き戻せなくても、画面には出す（黙って「まだ」と嘘をつかない） */
        return (list || []).concat(add);
      });
    });
  }

  function loadList(){
    var c = co();
    if (!cloud() || !c) return Promise.resolve([]);
    return c.collection('pitSettings').doc('qruns').get().then(function (snap) {
      return (snap.exists && snap.data() && snap.data().一覧) || [];
    }).catch(function () { return []; });
  }

  /* 🧹 v2.0.0（ゆうた指定 2026-08-23）**残してある結果を消す。**
     🗣「あと一回入れたQのデータをクリアするボタンもほしい」
     ＝ 練習でくり返し走らせたぶんを、本番の前にきれいにできるように。
     🔴 消すのは **その期間の書類と、一覧のその行だけ**。
        ⚠ 「伝票を直した」の印（`qmarks`）は**消さない**。あれは
           「整備ソフト側を直した」という**人が決めた事実**で、走らせた回数とは別の記録。
     ⚠ 戻せないので、聞くのは呼ぶ側（画面）の仕事。ここは言われたとおり消すだけ。 */
  function deleteRun(from, to){
    var c = co();
    if (!cloud() || !c) return Promise.reject(new Error('練習用サイトでは消せません（本番の PitFlow で使ってください）'));
    var id = runId(from, to);
    return c.collection('pitSettings').doc(id).delete().then(function () {
      var ref = c.collection('pitSettings').doc('qruns');
      return ref.get().then(function (snap) {
        var list = (snap.exists && snap.data() && snap.data().一覧) || [];
        list = list.filter(function (x) { return x && x.id !== id; });
        return ref.set({ 一覧: list });
      });
    });
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
  w.pitQSaveRuns  = saveRuns;    /* 🧾 v2.9.8 1枚のPDFぶんをまとめて残す（一覧は最後に1回） */
  w.pitQCanSave   = canSave;     /* 🔴 v2.9.8 残してよい期間か（伝票が0枚なら残さない） */
  w.pitQRepairList = repairList; /* 🩹 v2.9.8 一覧の取りこぼしを書類から作り直す */
  w.pitQLoadList  = loadList;
  w.pitQLoadRun   = loadRun;
  w.pitQDeleteRun = deleteRun;   /* 🧹 v2.0.0 その期間の結果を消す（印は消さない） */
  w.pitQMonthPlan = monthPlan;
})(window);
