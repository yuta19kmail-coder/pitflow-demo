/* ========================================
   inspect-rules.js  -  🩺 データチェックの**規則表**  PitFlow v1.170.0
   🔴 v1.170.0 ゆうた指定で「点検」→「データチェック」に改名（車の12ヶ月点検と紛れるため）。
      ⚠ 規則ID（M01…）は**変えない**。札の貼り先そのもの。
   ================================================================================
   ◎なぜ作ったか（2026-08-21・ゆうた発案）
     🗣「PitFlowの全データを読み込んで、**金額がへんな車、動いてない車、
        変なタスク移動でおかしなことになってる車、データが入ってない車**、
        金額面、予約面、代車の整合性などなど、多方面に全部のデータチェックを任せる仕組み」
     🗣（折衷案）「売上チェックリストPDFの突合と統合して、**クォーターごと（およそ週1）**に、
        エラー箇所をデータとして持ちつつ、さらに突合、その上で **AI判断で一斉摘発**」

   ◎三段ロケットの ①
       ① 日常チェック … ここ。**PitFlow の中だけで分かる矛盾を、規則で拾う**（お金はかからない）
       ② 突合 ……… 売上チェックリストPDF と付き合わせる（整備ソフト側との食い違い）＝クォーターチェック
       ③ AIチェック … ①②の結果をまとめて AI に判断させる（クォーター＝およそ週1）＝クォーターチェック
     🔴 ①が②③の**土台**。ここで出た所見（finding）を、そのまま②③へ渡せる形にしてある
        （`pitInspectExport()` が書き出す JSON がその受け渡しの形）。

   ◎いちばん大事な決めごと
     🔴🔴 **ここで新しい判定を発明しない。**
        「返車済みか」「売上のどの区分か」「代車がぶつかっているか」「車検に行けない日か」は
        **すでに物差しが1本ずつある**。この表は**それを呼んで、答えを並べるだけ**。
        ＝ 売上の区分が変わったら、データチェックの言うことも**勝手に**それに揃う。
        ⚠ ここに `status === 'workDone'` のような条件を書き写しはじめたら、それは事故のはじまり。
     🔴 **重さは3段**（`red` 要対応 / `amber` 確認 / `gray` 気づき）。
        全部を赤にすると**誰も見なくなる**ので、お金と信用が減るものだけ赤。
     🔴 **数のしきい値は下の `LIM` 1か所**。規則の中に数字を直接書かない
        （＝あとで「7日は短い」と言われた時に、1か所だけ直せば全部そろう）。

   ◎ここが返すもの
     pitInspectRun(opt)   … チェックして所見の一覧を返す
       → { at, cards, findings:[…], byLevel, byCat, byRule, muted, marked }
     所見（finding）1件 ＝
       { key, no, ruleId, cat, level, title, why, fix, kind:'card'|'veh', refId, name, text, mark }
       ⚠ `key` は **規則ID + 対象ID**。これが「見た／直した」の札を貼る先。
       🔢 `no` は **人に見せる番号**（`F05-483102`）。key から作るので**いつ誰が見ても同じ**。
          物差しは `pitInspectNo()` 1本（下の「所見1件ごとの番号」を読むこと）。
     pitInspectNo(key)      … その所見の番号を作る（🔴 写しを作らない・ここ1本）
     pitInspectMark(key, v) … 札を貼る（'seen' 見た / 'fixed' 直した / '' はがす）
       🔴 v1.172.0 **札を貼っても一覧からは消えない**（数をごまかさないため）
     pitInspectExport()   … ②③へ渡す JSON

   ⚠ 読み込みは pit-share.js / sales-count.js / return-slot.js / loaner-free.js / card-miss.js より後ろ。
   ================================================================================ */
(function (w) {
  'use strict';

  /* ================================================================
     0. 道具（ここでは日付の計算しかしない）
     ================================================================ */
  function s(v){ return String(v == null ? '' : v); }
  function t(v){ return s(v).trim(); }
  function num(v){ v = +v; return isFinite(v) ? v : 0; }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function ymd(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today(){ var d = new Date(); d.setHours(0,0,0,0); return ymd(d); }
  function toD(v){
    var p = s(v).split('-');
    if (p.length !== 3) return null;
    var d = new Date(+p[0], (+p[1]) - 1, +p[2]);
    return isNaN(d.getTime()) ? null : d;
  }
  /* a から b まで何日（b が後なら＋）。読めない日付は null */
  function days(a, b){
    var da = toD(a), db = toD(b);
    if (!da || !db) return null;
    return Math.round((db - da) / 86400000);
  }
  function shift(v, n){ var d = toD(v); if (!d) return ''; d.setDate(d.getDate() + n); return ymd(d); }
  function yen(n){ return num(n).toLocaleString() + '円'; }
  function man(n){ var m = num(n) / 10000; return (Math.abs(m) >= 100 ? Math.round(m) : Math.round(m * 10) / 10).toLocaleString() + '万'; }

  /* ================================================================
     🔢 所見1件ごとの番号（v1.178.0・ゆうた指定 2026-08-23）
     ----------------------------------------------------------------
     🗣「**データチェックの不良箇所に個別に番号を搭載したい**」
        ＝ 現場で「◯◯番、直しといて」と**番号ひとつで指せる**ようにする。
          いまは「誰々さんの車の、返車予定のやつ」としか言えず、
          同じ規則で何十件も出ている時は、どれの話か分からない。

     ◎形　`F05-483102` ＝ **規則の記号（F05）＋ 6桁**

     🔴🔴 いちばん大事な決めごと ── **いつ・誰が見ても同じ番号。**
        走らせ直しても、絞り込んでも、並べ替えても、別の端末で見ても**変わらない**。
        ＝ 画面の並び順の通し番号（1・2・3…）には**絶対にしないこと**。
          走らせるたびに中身が入れ替わるので、電話で「12番」と言っても
          相手の画面では**別の車**を指してしまう。
     🔴 番号の元は **所見の `key`（規則ID ＋ 対象ID）だけ**。
        日付・件数・並び順・ログインしている人など、**変わるものを1つも混ぜない**。
        （混ぜた瞬間に「毎回おなじ」が壊れる。ここを触ると番号が全部変わる）
     🔴 直って消えた所見が、あとで**また出た時も同じ番号に戻る**（key が同じだから）。
        ＝ 過去のやり取り・メモがそのまま読める。

     ⚠ **エラー番号（`PF-0412`）とは別物。** 頭がアプリ2文字ではないので混ざらない。
        ＝ `errcode-pit.js` の台帳には**足さない**（あちらは「通らなかった時」の番号）。
     ⚠ ばらけ具合＝6桁（90万通り）。1つの規則に数百件出ても、
        同じ番号が2つ並ぶことはまず起きない（見張りが数えている）。
     ================================================================ */
  function inspectNo(key){
    var str = s(key);
    /* FNV-1a（32bit）＝短い文字列でもよく散る。⚠ ここを変えると番号が全部変わる */
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++){
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    var rid = str.split(':')[0] || '?';
    return rid + '-' + (100000 + (h % 900000));   /* 先頭が0にならないよう10万を足す */
  }

  /* ================================================================
     1. しきい値（🔴 数字はここだけ。規則の中に書かない）
     ----------------------------------------------------------------
     ⚠ 「7日は短い／長い」と言われたら **ここを1行直す**。画面も見張りも一緒に動く。
     ================================================================ */
  var LIM = {
    /* エリアごとの「これ以上止まっていたらおかしい」日数（タスクボードの列＝状態） */
    stay: { check:7, estim:5, contact:7, parts:21, work:7, workDone:5, outsource:30 },
    bigEst:      500000,    /* 概算しか無いのに大きい＝見積を出したほうがいい額 */
    huge:       3000000,    /* 1台でこれ以上＝桁を打ち間違えた疑い */
    tiny:          1000,    /* 0円でないのにこれ未満＝桁を打ち間違えた疑い */
    gapRate:          2,    /* 見積と確定が何倍ずれたら見る（2倍 or 半分） */
    farReturn:      120,    /* 返車予定が今日からこれ以上先＝年を打ち間違えた疑い */
    soon:             3,    /* 「もうすぐ」＝何日以内 */
    noShowLeft:       5,    /* 未入庫の自動アーカイブ（30日）まであと何日で知らせるか */
    noShowAuto:      30,    /* 未入庫が自動でアーカイブされるまでの日数（undetermined.js と同じ） */
    vehShaken:       30     /* 代車・社用車の車検満了まであと何日で知らせるか */
  };

  /* ================================================================
     2. 分類と重さ（画面の見出し・色はここから引く。画面で綴らない）
     ================================================================ */
  var CATS = [
    { id:'money',  label:'お金',         note:'金額の抜け・けた違い・売上に乗る形になっていない' },
    { id:'flow',   label:'日付・進行',   note:'止まったままの車・日付の前後が逆' },
    { id:'resv',   label:'予約',         note:'二重・休みの日・置き場所' },
    { id:'loaner', label:'代車',         note:'ダブり・戻っていない・カードとカレンダーの食い違い' },
    { id:'shaken', label:'車検',         note:'行く日・担当・陸運局・満了' },
    { id:'data',   label:'データの抜け', note:'お客様・車の情報' },
    { id:'state',  label:'状態の矛盾',   note:'タスクの移動と中身が食い違っている' }
  ];
  var LEVELS = [
    { id:'red',   label:'要対応', color:'#ef4444', note:'放っておくとお金か信用が減ります' },
    { id:'amber', label:'確認',   color:'#f59e0b', note:'たぶん入れ忘れ。見て決めてください' },
    { id:'gray',  label:'気づき', color:'#94a3b8', note:'急ぎではありませんが、ここも 0 にします' }
  ];
  /* 🔴🔴 v1.172.0（ゆうた指定 2026-08-22）**「やらなくていい」道を全部なくした。**
     🗣「今、非表示におれがクリックでしたものはチェックのルールから外す／
     　　この規則を出さないボタンを無くす／
     　　基本は0をキープし続ける感じで運用するし、売上データを確定させたり、
     　　会社全体の履歴として基本的には100％のつもりで運用するから、
     　　**やらなくていいよ みたいなニュアンス感をなくしてほしい。基本は全て修正する**」
     ◎消したもの
       ・**「これでOK」の札（'spec'）** … 1件だけ次から出さない＝**見なかったことにする道**
       ・**「この規則は出さない」（inspectMutes）** … 規則ごと黙らせる＝**もっと太い抜け道**
       ・すでに付いていた 'spec' の札と、黙らせていた規則は **`sweepEscapes()` で外す**
         （残したままボタンだけ消すと、**戻す手立てが無いまま永久に隠れる**）
     🔴 **逃げ道は「規則そのものを直す」1本だけ。**
        「この車では言わなくていい」なら、理由を持って**規則の側**に書く（v1.169.2 の決めごとと同じ）。
     🔴 **残した札は数をごまかさない。** 貼っても**一覧から消えない**（画面の側で見る）。
        ＝ 出ている数が「これから直す数」。**0 になったら本当に 0。** */
  /* 🔴🔴 v1.169.0（ゆうた指摘 2026-08-21）**「終わった記録」と「いま動いている車」を分ける。**
     ◎なぜ（本番データで分かったこと）
       本番 377台で所見が **260件**出たが、そのうち **129件が返車の済んだ車の記録**だった。
       ・整備担当が空 64件 → 63件が返車完了
       ・返車予定日が入庫日より前 25件 → 全部返車完了（8月頭の一斉入力の跡）
       ＝ **もう直しても現場は動かない**ものが、**今すぐ動かせる車を埋めていた。**
     🔴 これは**規則の問題ではなく、車の問題**（同じ規則でも、車によって急ぎかどうかが変わる）。
        だから規則を2つに割るのではなく、**所見に「どちらの車か」の印を付けて、画面で分ける。**
     ⚠ 「終わった記録」を捨てるのではない。**既定で出さないだけ**（切り替えれば見える）。
        整備ソフトとの突合や、次に来た時の検索ではこちらも効いてくる。 */
  var SCOPES = [
    { id:'live', label:'いま動いている車', note:'これから直せる。今週の段取りに効く' },
    { id:'past', label:'終わった記録',     note:'返車が済んだ車・アーカイブ。直しても現場は動かない' }
  ];

  /* 🔴🔴 v1.173.0（ゆうた指定 2026-08-22）**規則は2種類ある。札もそれに合わせた。**
     🗣「見積もりと確定が大きく違うも、間違えの可能性もあるけど 普通にOKなのもある。
     　　この辺りはどう決着するつもり？」

     | 種類 | 中身 | 終わり方 |
     |---|---|---|
     | **抜け・矛盾**（41本） | 金額が空・日付が空・状態が食い違う | **直すしかない。閉じる道は無い** |
     | 🆕 **要判断**（`judge:true`・7本） | 見積と確定が違う／けたが小さい／ずっと先 など | **見て「合っている」と確認したら閉じる** |

     🔴 **「確認した」は要判断の規則にしか出さない。** 抜け・矛盾の側には**絶対に出さない**。
        ＝「やらなくていい」ではなく「**見て決めるのが仕事**」の所にだけ、決める手段を置く。
     🔴 押した**人と日付**が残る（誰が「合っている」と言ったか分からないと、あとで揉める）。
     ⚠ id は変えないこと（変えると今までに貼った札が全部はがれる）。 */
  var MARKS = [
    { id:'fixed', label:'直した',   note:'直したつもり。次のチェックで消えれば、本当に直っています' },
    { id:'ok',    label:'確認した', note:'見て、これで合っていると決めた（数から外れます）', judge:true }
  ];
  /* もう使わない札。**見つけたら外す**ためだけに残してある。
     'spec'＝これでOK（v1.172.0 で廃止）／'seen'＝見た（v1.173.0 で廃止＝押しても 0 に近づかないため） */
  var DEAD_MARKS = { spec: 1, seen: 1 };

  /* ================================================================
     3. すでにある物差しを呼ぶだけの薄い口
        🔴 **ここに条件を書かない。** 部品が無い時だけ、いちばん安全な答えを返す。
     ================================================================ */
  function tierOf(c){ return w.pitSalesTier ? w.pitSalesTier(c) : null; }
  function countDate(c){ return w.pitSalesCountDate ? w.pitSalesCountDate(c) : ''; }
  function noSale(c){ return !!(w.pitCardNoSale && w.pitCardNoSale(c)); }
  function amountOf(c){ return w.pitFinalAmountOf ? num(w.pitFinalAmountOf(c)) : 0; }
  function isShaken(c){ return !!(w.pitIsShaken && w.pitIsShaken(c)); }
  /* ⚠ 空欄の言い方（（未入力））も、名前を出す1本と**同じ行**に置く＝画面ごとに言葉が散らない */
  function nameOf(c){ return (w.pitCustName ? w.pitCustName(c) : t(c.customer)) || '（未入力）'; }
  function carOf(c){ return w.pitCarLabel ? w.pitCarLabel(c) : t(c.car); }
  function statusText(c){ return w.pitCardStatusText ? w.pitCardStatusText(c) : s(c.status); }
  function divLabel(c){ return w.pitDivisionLabel ? w.pitDivisionLabel(c) : ''; }
  function misses(c){ return w.pitCardMisses ? w.pitCardMisses(c) : { red:[], yellow:[] }; }
  function shakenOff(iso){ return w.pitShakenDayOff ? w.pitShakenDayOff(iso) : { off:false }; }
  function shakenStaff(c){ return w.pitShakenStaff ? w.pitShakenStaff(c) : ''; }
  function shakenOffice(c){ return w.pitShakenOffice ? w.pitShakenOffice(c) : ''; }
  function loanerBack(c){ return w.pitLoanerBackOf ? w.pitLoanerBackOf(c) : { back:false, at:'' }; }
  /* 代車の呼び名。⚠ 消された代車は名前が引けないので、その時だけ id を出す（人が追える形にする） */
  function loName(id){ return (w.pitLoanerModel ? (w.pitLoanerModel(id) || '') : '') || s(id); }
  /* 🔴 v1.168.0（ゆうた指定）**所見にはかならず「誰の車か」を出す。**
     🗣「担当者をそれぞれ記載してほしい」
     ◎誰を出すか
       ・ふだんの担当 …… **フロント担当**（無ければ受付した人）＝この車の面倒を見ている人
       ・車検の所見だけ … **回送の担当**も一緒に（陸運局へ持って行く人。フロントとは別物）
     🔴 名前の出し方は pit-share.js の1本（`pitStaffCall`＝通称＆苗字）。ここで綴らない。
     ⚠ 自社（小林モータース）を選んでいる時は「コバモ」に化ける＝それも1本が決めている。 */
  function staffOf(c){
    var n = t(c && (c.frontStaff || c.staff));
    return n ? (w.pitStaffCall ? w.pitStaffCall(n) : n) : '';
  }
  /* 担当バッジの色＝課の色（課が空ならグレー）。🔴 画面で色を綴らないための1本 */
  function staffColorOf(c){ return w.pitDivisionColorOr ? w.pitDivisionColorOr(c) : ''; }
  function shopClosed(iso){ try { return !!(w.PitCal && w.PitCal.isClosed && w.PitCal.isClosed(iso)); } catch(e){ return false; } }

  /* 「いま盤面にいる車」＝廃車・キャンセル・売上なし・アーカイブ・返車済みを除いたもの。
     ⚠ 生き死には pit-share.js の `pitCardActive` に聞く（ここで status を並べない）。 */
  function isLive(c){
    if (!c || c._draft || c.archived) return false;
    if (!(w.pitCardActive ? w.pitCardActive(c) : true)) return false;
    return c.status !== 'returned';
  }
  /* 実績になった車（売上なしは別扱い） */
  function isDone(c){ return !!c && c.status === 'returned' && !noSale(c); }

  /* 🤝 いま「外注」エリアに居る車か（タスクボードの外注の欄）。
     ----------------------------------------------------------------
     🔴 v1.179.0（ゆうた指定 2026-08-23）
       🗣「**板金のばあい、外注だから、正確な見積もり金額が出ないことが多い。
       　　だから外注欄にある場合はこのルールの適応外にしてほしい。つうじょうの場合は注意の対象にして**」
     ＝ よそに出している間は、こちらの手元に**入れるべき正しい金額がまだ無い**。
       入れろと言い続けても直せないので、**その規則の側で対象から外す**のが筋
       （画面から黙らせる道は作らない＝v1.172.0 の決めごとのとおり）。
     ⚠ 見るのは「**いま外注に居るか**」だけ。外注から出た（作業待ち・作業完了・返車）時点で
        ふつうの車に戻る＝**永久に黙るわけではない**。返車まで行けば M02 が確定金額を見る。
     ⚠ 外注先（outsourceTo）が入っているかは見ない。**居場所（エリア）で決める。** */
  function isOutsource(c){ return !!c && s(c.status) === 'outsource'; }

  /* 💴 v1.185.0 売上日（伝票が立った日）。🔴 物差しは sales-date.js の1本。
     ⚠ ここで `c.salesDate || c.completeCallAt` と書き写さないこと（借り方の決まりが2つに割れる）。 */
  function salesDate(c){ return w.pitSalesDate ? s(w.pitSalesDate(c)) : ''; }
  function salesCrossMonth(c){ return !!(w.pitSalesDateCrossMonth && w.pitSalesDateCrossMonth(c)); }
  /* 「2026-08-03」→「8月」（所見の文だけに使う表示用） */
  function monthOf(v){ var p = s(v).split('-'); return (p.length === 3) ? (+p[1]) + '月' : ''; }

  /* ☎ 完TELは済んでいるか。
     ----------------------------------------------------------------
     🔴🔴 v1.180.0（ゆうた報告 2026-08-23・番号 T02-673394 / T02-559296）
       🗣「**完TELを編集で入れたんだけど、リストから外れないんだよね**」
     ◎正体＝**完TELの印が2つあった。**
       ① `returnStage` …… 盤面の完TELを通った時に付く（返車の流れの、いまの位置）
       ② `coverCall.done` … 表紙チェックの「完TEL 済／未」
       ふつうに盤面を通れば **両方そろって付く**（`return-popup.js` が同時に書いている）。
       ところが **完了アーカイブ（v1.171.0）から直せるのは ② だけ**。
       T02 は ① しか見ていなかったので、**②を「済」にしても永久に消えなかった**
       ＝ 直す道が画面にあるのに、直しても数が減らない状態だった。
     🔴 これから＝**どちらか付いていれば「完TELは済んだ」とみなす。**
     ⚠ 緩めても**お金と担当が黙って抜ける道は開かない**。
        確定金額は M02、整備・点検担当は T03、フロント担当は T04 が**別に見ている**。
     ⚠ T01（返車の列にいるのに作業前）は **① だけ**を見る。あちらは「いま返車の流れに居るか」
        という**居場所**の話なので、ここを混ぜないこと。 */
  function callDone(c){
    if (!c) return false;
    if (t(c.returnStage)) return true;
    return !!(c.coverCall && c.coverCall.done);
  }

  /* 🔴🔴 v1.173.0（ゆうた指定 2026-08-22）**起点日＝「この日より前に入庫した車は、日付の前後を言わない」**
     🗣「8月は中旬に頭からのを入れてスタート切ったからその影響。それはOKにしたいけど、今後は見てほしい」
     ◎なにが困っていたか
       本番を始めた時、**8月頭からのぶんを中旬にまとめて入れた**。
       そのぶんは「返車予定日が入庫日より前」に必ずなるが、**打ち間違いではない＝直しようがない**。
       1件ずつ札を押しても終わらないし、押した記録も残したくない（そもそも指摘が要らない）。
     🔴 **1件ずつではなく「いつから入れたデータか」で決める。** これが正しい決着のさせ方。
     ⚠ 効かせるのは **F05 / F06（日付の前後がおかしい）だけ**。
        金額の抜けなどは**起点日より前でも直す**（会社の履歴として残すため）。
     ⚠ 日付は設定 1か所（`state.settings.inspectFrom`）。データチェックの画面から管理者が変えられる。 */
  function startFrom(){
    var v = t(((w.state || {}).settings || {}).inspectFrom);
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
  }
  /* その車は「起点日より前に入れたぶん」か（＝日付の前後を言わない） */
  function beforeStart(c){
    var f = startFrom();
    if (!f) return false;
    var d = t(c && c.reserveDate);
    return !!d && s(d) < s(f);
  }

  /* ⚠ v1.172.2（ゆうた指定）**S01/S08（車検の行く日が未定）と F02（同じエリアに長く止まっている）を
     規則表から消した**ので、その2つだけが使っていた `_shakenUndecided()` と `stayDays()` も一緒に消した。
     🔴 **規則を消したら、その規則だけが使っていた道具も消す**（残すと次の人が「まだ使っている」と誤解する）。 */

  /* ================================================================
     4. 規則表
     ----------------------------------------------------------------
     1件＝{ id, cat, level, title, why, fix, each?(c,ctx), all?(ctx) }
       each … カード1枚ずつ見る。**文字を返したら所見**（空なら異常なし）
       all  … 束で見る（二重予約・代車のダブりなど）。[{refId, text, kind?, name?}] を返す
     🔴 id は**変えない**（札〈これでOK〉の貼り先だから。変えると札がはがれる）
     🔴 v1.170.0 **規則を足したら `js/inspect-fix.js` の `RULE_FIX` にも1行足す**
        ＝「この規則は、どの欄を直せば消えるか」。足さなければ「ここを直す」が出ないだけで、
          黙って壊れることはない。⚠ 欄が1つに決まらない規則（タスクの列を動かす・代車カレンダー・
          PIT配置図など）は**わざと足さない**（小窓で直せるふりをしない）。
     ================================================================ */
  var RULES = [

    /* ── お金 ───────────────────────────────────────────────── */
    { id:'M01', cat:'money', level:'red',
      title:'受注まで済んでいるのに、受注金額が空',
      why:'売上の「確定」に乗っているのに金額が概算のまま。着地見込みが実際とずれます。',
      fix:'カードの金額欄に受注金額を入れてください。'
        + '⚠ 外注（板金など）に出している間は対象外です。戻ってきたら、また見ます。',
      each: function(c){
        if (tierOf(c) !== 'confirmed') return '';
        /* 🤝 v1.179.0（ゆうた指定）**外注に出している車は言わない。**
           板金はよそに出しているので、受注の時点では正しい金額が出ないことが多い。
           ⚠ 外注から出たら、また見る（上の isOutsource のコメントを読むこと）。 */
        if (isOutsource(c)) return '';
        if (t(c.amountOrder) || t(c.amountFinal)) return '';
        return '確定（受注済）ですが受注金額が空です。いまは概算 ' + man(amountOf(c)) + ' で数えています';
      } },

    { id:'M02', cat:'money', level:'red',
      title:'返車済みなのに、確定金額が空',
      why:'実績の金額が概算や見積のまま固まっています。締めた月の数字が実際と違ってしまいます。',
      fix:'カードの確定金額を入れてください（伝票の金額）。',
      each: function(c){
        if (!isDone(c)) return '';
        if (t(c.amountFinal)) return '';
        return '確定金額が空です。いまは ' + man(amountOf(c)) + ' で実績に数えています';
      } },

    { id:'M03', cat:'money', level:'amber',
      title:'実績待ちなのに、受注金額も見積金額も空',
      why:'作業は終わっているのに、いくらの車なのかが概算しかありません。',
      fix:'受注金額（または確定金額）を入れてください。',
      each: function(c){
        if (tierOf(c) !== 'actualWait') return '';
        if (t(c.amountFinal) || t(c.amountOrder) || t(c.amountQuote)) return '';
        return '概算 ' + man(amountOf(c)) + ' しか入っていません';
      } },

    { id:'M04', cat:'money', level:'amber', judge:true,
      title:'概算だけの大口',
      why:'金額が大きいのに概算しかありません。着地見込みがこの1台で大きく動きます。',
      fix:'見積を出したら見積金額を、受注したら受注金額を入れてください。',
      each: function(c){
        if (!tierOf(c)) return '';
        if (t(c.amountFinal) || t(c.amountOrder) || t(c.amountQuote)) return '';
        var a = amountOf(c);
        if (a < LIM.bigEst) return '';
        return '概算 ' + man(a) + '（' + yen(a) + '）だけで数えています';
      } },


    { id:'M06', cat:'money', level:'amber', judge:true,
      title:'金額のけたが小さすぎる',
      why:'0円ではないのに ' + yen(LIM.tiny) + ' 未満です。0を1つ少なく打った可能性があります。',
      fix:'金額を見直してください。',
      each: function(c){
        if (!isDone(c)) return '';
        var a = num(c.amountFinal);
        if (a <= 0 || a >= LIM.tiny) return '';
        return '確定金額が ' + yen(a) + ' です';
      } },

    { id:'M07', cat:'money', level:'amber', judge:true,
      title:'見積と確定が大きく違う',
      why:'見積の ' + LIM.gapRate + '倍以上、または半分以下で固まっています。打ち間違いか、追加作業の入れ忘れかもしれません。',
      fix:'伝票と見比べてください。追加作業なら作業内容も足しておくと、あとで理由が分かります。',
      each: function(c){
        if (!isDone(c)) return '';
        var q = num(c.amountQuote), f = num(c.amountFinal);
        if (q <= 0 || f <= 0) return '';
        if (f >= q * LIM.gapRate) return '見積 ' + man(q) + ' → 確定 ' + man(f) + '（' + (Math.round(f / q * 10) / 10) + '倍）';
        if (f * LIM.gapRate <= q) return '見積 ' + man(q) + ' → 確定 ' + man(f) + '（半分以下）';
        return '';
      } },

    { id:'M08', cat:'money', level:'amber',
      title:'「売上なし」なのに金額が入っている',
      why:'売上なしで片づけた車は、どの集計にも乗りません。金額が入っていると、あとで見た人が混乱します。',
      fix:'本当に売上があるなら「売上なし」を外してください。無いなら金額を空にしてください。',
      each: function(c){
        if (!noSale(c)) return '';
        var a = num(c.amountFinal) || num(c.amountOrder) || num(c.amountQuote);
        return a > 0 ? ('売上なしの印が付いていますが ' + yen(a) + ' が入っています') : '';
      } },

    { id:'M09', cat:'money', level:'gray',
      title:'「売上なし」にした理由が残っていない',
      why:'誰が・いつ・なぜ売上なしにしたかが分からないと、あとから追えません。',
      fix:'カードのフローに一言残してください。',
      each: function(c){
        if (!noSale(c)) return '';
        return (t(c.noSaleBy) && t(c.noSaleAt)) ? '' : '売上なしにした人か日付が残っていません';
      } },

    /* 💴💴 v1.185.0（ゆうた指定 2026-08-23）**売上日と実績日の「月」がちがう車。**
       -------------------------------------------------------------------------
       🗣「実績日＝売上日があってなければならない（同月内）は月末エリアだけで、
       　　それ以外はQ跨ぎになるだけだから、別に参考的に表示でOKになるかなと」
       ◎なにを見ているか
         ・**売上日** … 整備ソフトの伝票が立った日（＝あちらの月次に乗る日）
         ・**実績日** … PitFlow が売上に数えている日（＝返車日。こちらの月次に乗る日）
         この2つの**月**がちがう＝ **同じ1台が、両方の月次で別の月に乗っている。**
       🔴 **言うのは「月がちがう」時だけ。** クォーターがちがうだけなら**言わない**（ゆうた指定）。
          ＝ 週をまたいで返すのは実務でふつうに起きる。言うと毎週何台も出て、本当の1台が埋もれる。
          ⚠ Qまたぎは「クォーターチェック」の画面が期間ごとにまとめて出す。あちらの仕事。
       🔴 **実績になった車だけ**見る。返車前の車は相手が「返車“予定”日」なので、ちがって当たり前。
       ⚠ 売上日が空の車は言わない。この仕組みより前に返した車が何百件も出て、直しようがない。
          （＝「無いものを、それらしく言わない」2026-08-13 の決めごと）
       ⚠ 実データ（8/1〜8/7・55台）で数えたところ、この所見は**月に3〜8台**の見込み。
       -------------------------------------------------------------------------
       🔴 直す時に**どちらを動かすか**は人が決める（だから judge を付けず、両方の欄を出す）。
          ・整備ソフトの伝票が正しい → PitFlow の実績カウント日を動かす（管理者だけ・締めた月が動く）
          ・PitFlow の返車日が正しい → 売上日を直す（誰でも・数字は動かない） */
    { id:'M11', cat:'money', level:'amber',
      title:'売上日と実績日で、月がちがう',
      why:'伝票が立った月と、PitFlow が売上に数えている月がちがいます。'
        + 'そのままだと、整備ソフトの月次と PitFlow の月次が、この1台ぶんズレます。',
      fix:'伝票を見て、どちらが正しいか決めてください。'
        + '伝票の日付が正しければ「売上日」を直します（誰でも直せます・売上の数字は動きません）。'
        + '返車した日が正しければ「実績カウント日」を直します（管理者だけ・締めた月の数字が動きます）。',
      each: function(c){
        if (!isDone(c)) return '';
        if (!salesCrossMonth(c)) return '';
        var sd = salesDate(c), cd = countDate(c);
        return '売上日 ' + sd + '（' + monthOf(sd) + '）／実績日 ' + cd + '（' + monthOf(cd) + '）'
             + ' ＝ ' + man(amountOf(c)) + ' が別々の月に乗っています';
      } },


    /* ── 日付・進行 ─────────────────────────────────────────── */
    /* 🔴 v1.168.1（ゆうた指摘）**「今月に寄せています」は内輪の言葉だった。**
       🗣「41.5万 を今月に寄せています って書き方が恐らくみんなわからないと思う」
       ＝ 「寄せる」は売上の数え方（sales-count.js）の言い方であって、現場の言葉ではない。
          言いたいのは「**この車の金額が、今月の見込みに入ったままになっている**」。 */


    { id:'F03', cat:'flow', level:'red',
      title:'完TELを通ったのに、返車予定日が空',
      why:'返車カレンダーのどこにも出ません。お客様を待たせたまま忘れられます。',
      fix:'完TELの画面で、返す日と時間を決めてください。',
      each: function(c){
        if (c.status === 'returned' || !c.returnStage) return '';
        if (!(w.pitCardActive ? w.pitCardActive(c) : true)) return '';
        return t(c.returnDate) ? '' : '完TELを通っていますが返車予定日が空です';
      } },

    { id:'F04', cat:'flow', level:'red',
      title:'返車済みなのに、実績の日が空',
      why:'実績カレンダーにも、どの月の売上にも数えられていません。どの画面にも出てこないまま消えます。',
      fix:'カードを開いて返車日を入れ直してください。',
      each: function(c){
        if (!isDone(c)) return '';
        return t(c.completedAt) ? '' : '実績の日（完了日）が空です。どの月にも数えられていません';
      } },

    { id:'F05', cat:'flow', level:'red',
      title:'返車予定日が、入庫日より前',
      why:'返す日のほうが預かる日より前になっています。日付の打ち間違いです。',
      fix:'どちらかの日付を直してください。',
      each: function(c){
        if (beforeStart(c)) return '';        /* 🔴 v1.173.0 起点日より前に入れたぶんは言わない */
        if (!t(c.reserveDate) || !t(c.returnDate)) return '';
        return (s(c.returnDate) < s(c.reserveDate))
          ? ('入庫 ' + c.reserveDate + ' → 返車予定 ' + c.returnDate) : '';
      } },

    { id:'F06', cat:'flow', level:'amber',
      title:'実績の日が、入庫日より前',
      why:'預かる前に返したことになっています。',
      fix:'日付を直してください。',
      each: function(c){
        if (beforeStart(c)) return '';        /* 🔴 v1.173.0 起点日より前に入れたぶんは言わない */
        if (!isDone(c) || !t(c.completedAt) || !t(c.reserveDate)) return '';
        return (s(c.completedAt) < s(c.reserveDate))
          ? ('入庫 ' + c.reserveDate + ' → 実績 ' + c.completedAt) : '';
      } },

    { id:'F07', cat:'flow', level:'amber', judge:true,
      title:'返車予定日が、ずっと先',
      why:'今日から ' + LIM.farReturn + '日より先です。年や月を打ち間違えた可能性があります。',
      fix:'日付を見直してください。本当にこの日でよければ、そのまま置いておけば次も出ます（消す道はありません）。',
      each: function(c, ctx){
        if (!isLive(c) || !t(c.returnDate)) return '';
        var n = days(ctx.today, c.returnDate);
        return (n != null && n > LIM.farReturn) ? ('返車予定 ' + c.returnDate + '（' + n + '日先）') : '';
      } },

    { id:'F08', cat:'flow', level:'red',
      title:'承認待ちのまま、入庫日が過ぎている',
      why:'承認待ちの車は、日付が過ぎてもわざと自動で未入庫へ移していません'
         + '（自動で移すと、承認され忘れたことに誰も気づけなくなるため）。'
         + 'つまり、誰かが見ないかぎり永久にここに残ります。',
      fix:'承認するか、キャンセルにするか決めてください。',
      each: function(c, ctx){
        if (!c.approvalPending || c.archived || c._draft) return '';
        if (c.status !== 'reserved' || c.intakeTbd) return '';
        if (!t(c.reserveDate) || s(c.reserveDate) >= ctx.today) return '';
        return '入庫予定 ' + c.reserveDate + '（' + days(c.reserveDate, ctx.today) + '日前）から承認待ちのままです';
      } },

    { id:'F09', cat:'flow', level:'amber',
      title:'仮予約のまま、入庫日が近い（または過ぎている）',
      why:'仮予約もわざと自動で動かしていません。本予約に変わっていないと、枠も代車も押さえられません。',
      fix:'本予約にするか、外すか決めてください。',
      each: function(c, ctx){
        if (!c.tentative || c.archived || c._draft) return '';
        if (c.status !== 'reserved' || c.intakeTbd || !t(c.reserveDate)) return '';
        var n = days(ctx.today, c.reserveDate);
        if (n == null || n > LIM.soon) return '';
        return '入庫予定 ' + c.reserveDate + (n < 0 ? '（' + (-n) + '日前）' : '（あと' + n + '日）') + ' で仮予約のままです';
      } },

    { id:'F10', cat:'flow', level:'amber',
      title:'外注の戻り予定日を過ぎている',
      why:'外注先から戻る予定の日を過ぎています。催促が要るかもしれません。',
      fix:'外注先に確認して、戻り予定日を直してください。',
      each: function(c, ctx){
        if (!isLive(c) || !t(c.outsourceDue)) return '';
        return (s(c.outsourceDue) < ctx.today)
          ? ('戻り予定 ' + c.outsourceDue + '（' + days(c.outsourceDue, ctx.today) + '日前）'
             + (t(c.outsourceTo) ? '／' + t(c.outsourceTo) : '')) : '';
      } },


    /* ── 予約 ───────────────────────────────────────────────── */
    { id:'R01', cat:'resv', level:'red',
      title:'同じ車が、同じ日に2枚',
      why:'二重予約です。枠も代車も2台ぶん取られ、売上も2台ぶん数えます。',
      fix:'どちらかを消すか、日付を分けてください。',
      all: function(ctx){
        var g = {}, out = [];
        ctx.cards.forEach(function(c){
          if (!isLive(c) || !t(c.reserveDate)) return;
          var k = (t(c.plate) || (t(c.kana) + '/' + t(c.car))) + '@' + c.reserveDate;
          if (!t(c.plate) && !t(c.kana)) return;
          (g[k] = g[k] || []).push(c);
        });
        Object.keys(g).forEach(function(k){
          if (g[k].length < 2) return;
          g[k].forEach(function(c){
            out.push({ refId:c.id, text:'同じ車・同じ入庫日のカードが ' + g[k].length + '枚あります（' + c.reserveDate + '）' });
          });
        });
        return out;
      } },

    { id:'R02', cat:'resv', level:'amber',
      title:'同じ車の預かり期間が重なっている',
      why:'前の作業が終わる前に次の入庫が入っています。どちらかの日付が違うかもしれません。',
      fix:'入庫日か返車予定日を直してください。',
      all: function(ctx){
        var g = {}, out = [], seen = {};
        ctx.cards.forEach(function(c){
          if (!isLive(c) || !t(c.plate) || !t(c.reserveDate)) return;
          (g[t(c.plate)] = g[t(c.plate)] || []).push(c);
        });
        Object.keys(g).forEach(function(p){
          var list = g[p];
          for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++){
            var a = list[i], b = list[j];
            if (a.reserveDate === b.reserveDate) continue;   /* R01 が拾う */
            var aE = t(a.returnDate) || a.reserveDate, bE = t(b.returnDate) || b.reserveDate;
            if (s(a.reserveDate) > bE || s(b.reserveDate) > aE) continue;
            [a, b].forEach(function(c){
              if (seen[c.id]) return; seen[c.id] = 1;
              out.push({ refId:c.id, text:'ナンバー ' + p + ' の預かり期間が別のカードと重なっています' });
            });
          }
        });
        return out;
      } },

    { id:'R03', cat:'resv', level:'amber',
      title:'予約番号が重複している',
      why:'同じ番号の車が2台あると、整備ソフトや伝票と付き合わせた時にどちらか分からなくなります。',
      fix:'どちらかの番号を直してください。',
      all: function(ctx){
        var g = {}, out = [];
        ctx.cards.forEach(function(c){
          if (c.archived || c._draft || !t(c.resNo)) return;
          (g[t(c.resNo)] = g[t(c.resNo)] || []).push(c);
        });
        Object.keys(g).forEach(function(k){
          if (g[k].length < 2) return;
          g[k].forEach(function(c){ out.push({ refId:c.id, text:'予約番号 ' + k + ' が ' + g[k].length + '台にあります' }); });
        });
        return out;
      } },

    { id:'R04', cat:'resv', level:'amber', judge:true,
      title:'お休みの日に、入庫や返車の予定が入っている',
      why:'その日は会社が休みです（定休日カレンダー）。お客様が来ても誰もいません。',
      fix:'日付をずらすか、その日だけ開けるなら定休日カレンダーを直してください。',
      each: function(c, ctx){
        if (!isLive(c)) return '';
        var out = [];
        if (t(c.reserveDate) && s(c.reserveDate) >= ctx.today && shopClosed(c.reserveDate)) out.push('入庫 ' + c.reserveDate);
        if (t(c.returnDate)  && s(c.returnDate)  >= ctx.today && shopClosed(c.returnDate))  out.push('返車 ' + c.returnDate);
        return out.length ? (out.join('／') + ' が定休日です') : '';
      } },


    { id:'R06', cat:'resv', level:'gray',
      title:'無くなった置き場所を指している',
      why:'配置図から消された枠に置かれたままです。PIT配置図のどこにも出てきません。',
      fix:'配置図で置き直すか、置き場所を空にしてください。',
      each: function(c){
        if (!isLive(c) || !c.bayId) return '';
        var bays = (w.state && state.bays) || [];
        return bays.some(function(b){ return b.id === c.bayId; }) ? '' : '置き場所（' + c.bayId + '）が配置図にありません';
      } },


    /* ── 代車 ───────────────────────────────────────────────── */
    { id:'L01', cat:'loaner', level:'red',
      title:'代車が必要なのに、代車カレンダーに予定が無い',
      why:'カードでは代車ありになっているのに、代車カレンダーが押さえられていません。'
         + '当日「代車がない」になります。',
      fix:'代車カレンダーで押さえ直してください。',
      each: function(c, ctx){
        if (!isLive(c) || !c.needLoaner) return '';
        if (!c.loanerId) return '';                       /* 代車そのものが未選択＝D01（必須の抜け）が拾う */
        var has = ctx.assigns.some(function(a){ return a.cardId === c.id; });
        return has ? '' : '代車 ' + (loName(c.loanerId)) + ' がカレンダーに入っていません';
      } },

    { id:'L02', cat:'loaner', level:'red',
      title:'同じ代車が、同じ日に2人へ貸し出されている',
      why:'代車のダブりです。当日どちらかのお客様に車がありません。',
      fix:'代車カレンダーでどちらかを別の車に替えてください。',
      all: function(ctx){
        if (!w.pitLoanerConflicts) return [];
        var out = [], seen = {};
        ctx.assigns.forEach(function(a){
          if (!a || !a.loanerId || !a.fromDate || !a.toDate) return;
          var hit = w.pitLoanerConflicts(a.loanerId, a.fromDate, a.toDate,
                        { ignoreAssignId:a.id, ignoreCardId:a.cardId });
          if (!hit.length) return;
          var k = a.cardId || a.id;
          if (seen[k]) return; seen[k] = 1;
          var lo = loName(a.loanerId);
          out.push({ refId: a.cardId || null, kind: a.cardId ? 'card' : 'veh',
                     name: a.cardId ? '' : (t(a.customer) || '（手で入れた貸出）'),
                     vehId: a.loanerId,
                     text:'代車 ' + lo + '（' + a.fromDate + '〜' + a.toDate + '）が ほか ' + hit.length + '件と重なっています' });
        });
        return out;
      } },

    { id:'L03', cat:'loaner', level:'amber', judge:true,
      title:'代車の返す日が、車の返車予定日より前',
      why:'返車の前に代車を引き上げる形になっています。お客様の足が無くなります。',
      fix:'代車カレンダーで期間を延ばしてください。',
      each: function(c, ctx){
        if (!isLive(c) || !c.needLoaner || !t(c.returnDate)) return '';
        var a = ctx.assigns.find(function(x){ return x.cardId === c.id; });
        if (!a || !t(a.toDate)) return '';
        return (s(a.toDate) < s(c.returnDate))
          ? ('代車は ' + a.toDate + 'まで／車の返車予定は ' + c.returnDate) : '';
      } },

    { id:'L04', cat:'loaner', level:'red',
      title:'車は返したのに、代車が戻っていない',
      why:'お客様の車は返っているのに、代車の返却が記録されていません。'
         + '代車カレンダーがふさがったままで、次の人に貸せません。',
      fix:'代車カレンダーで返却を記録してください。',
      each: function(c, ctx){
        if (c.status !== 'returned' || !c.needLoaner) return '';
        var a = ctx.assigns.find(function(x){ return x.cardId === c.id; });
        if (!a) return '';
        if (loanerBack(c).back) return '';
        var lo = loName(a.loanerId);
        var d = t(c.completedAt) ? days(c.completedAt, ctx.today) : null;
        return '代車 ' + lo + ' が戻っていません' + (d != null ? '（返車から ' + d + '日）' : '');
      } },

    { id:'L05', cat:'loaner', level:'amber',
      title:'代車の予定が、その代車自身の車検・点検と重なっている',
      why:'その期間、代車は入庫している予定です。貸せません。',
      fix:'別の代車に替えるか、代車自身の予定をずらしてください。',
      each: function(c, ctx){
        if (!isLive(c) || !c.needLoaner || !w.pitLoanerEventsIn) return '';
        var a = ctx.assigns.find(function(x){ return x.cardId === c.id; });
        if (!a || !a.fromDate || !a.toDate) return '';
        var ev = w.pitLoanerEventsIn(a.loanerId, a.fromDate, a.toDate);
        if (!ev.length) return '';
        var lo = loName(a.loanerId);
        return '代車 ' + lo + ' に ' + (t(ev[0].label) || '車両の予定') + '（' + ev[0].fromDate + '〜' + ev[0].toDate + '）があります';
      } },

    { id:'L06', cat:'loaner', level:'amber',
      title:'いまは無い代車を指している',
      why:'消された（または名前が変わった）代車を指しています。代車カレンダーに出てきません。',
      fix:'いまある代車に選び直してください。',
      each: function(c, ctx){
        if (!isLive(c) || !c.loanerId) return '';
        return ctx.vehIds[c.loanerId] ? '' : '代車 ' + c.loanerId + ' が車両一覧にありません';
      } },

    { id:'L07', cat:'loaner', level:'gray',
      title:'代車は要らないのに、貸出が入っている',
      why:'カードは代車不要なのに、代車カレンダーが押さえられています。空き台数が減ります。',
      fix:'いらないなら代車カレンダーから外してください。',
      each: function(c, ctx){
        if (!isLive(c) || c.needLoaner) return '';
        var a = ctx.assigns.find(function(x){ return x.cardId === c.id; });
        if (!a) return '';
        var lo = loName(a.loanerId);
        return '代車不要ですが ' + lo + '（' + a.fromDate + '〜' + a.toDate + '）が押さえられています';
      } },

    /* ── 車検 ───────────────────────────────────────────────── */
    /* 🔴 v1.169.0（本番データで分かったこと）**S01 を2つに割った。**
       本番では21台出たが、中身は「**もう車を預かっている 10台**（最長25日前）」と
       「**これから来る 11台**」がまざっていた。**急ぎ方がまるで違う**のに横一列だったので分けた。
       ⚠ 中の条件は同じ。違うのは「入庫日を過ぎたか」だけ。 */


    { id:'S02', cat:'shaken', level:'red',
      title:'陸運局が休みの日に、車検の予定が入っている',
      why:'その日は行けません（土日祝＝陸運局が休み／自社の定休日）。',
      fix:'車検予定の画面で別の日にしてください。',
      each: function(c, ctx){
        if (!isLive(c) || !isShaken(c)) return '';
        var sc = c.inspSchedule || {};
        if (!t(sc.decided) || sc.result === 'done') return '';
        if (s(sc.decided) < ctx.today) return '';
        var off = shakenOff(sc.decided);
        return off.off ? ('車検予定 ' + sc.decided + ' は「' + off.label + '」です') : '';
      } },



    { id:'S05', cat:'shaken', level:'amber',
      title:'車検の予定日が、入庫より前か返車より後',
      why:'車が手元に無い日に陸運局へ行く予定になっています。',
      fix:'どれかの日付を直してください。',
      each: function(c){
        if (!isShaken(c)) return '';
        var sc = c.inspSchedule || {}, d = t(sc.decided);
        if (!d || sc.result === 'done') return '';
        if (t(c.reserveDate) && d < s(c.reserveDate)) return '車検 ' + d + ' が入庫 ' + c.reserveDate + ' より前です';
        if (t(c.returnDate)  && d > s(c.returnDate))  return '車検 ' + d + ' が返車予定 ' + c.returnDate + ' より後です';
        return '';
      } },


    { id:'S07', cat:'shaken', level:'red',
      title:'代車・社用車の車検が切れそう（切れている）',
      why:'車検が切れた車は貸せません。気づかずに貸すと、そのまま公道に出てしまいます。',
      fix:'車両管理で車検を取るか、代車カレンダーで入庫の予定を入れてください。',
      all: function(ctx){
        var out = [];
        ctx.vehs.forEach(function(v){
          if (!t(v.shakenDate)) return;
          var n = days(ctx.today, v.shakenDate);
          if (n == null || n > LIM.vehShaken) return;
          out.push({ kind:'veh', refId:v.id, name:(t(v.name) || v.id) + '（' + t(v.model) + '）',
                     text:'車検満了 ' + v.shakenDate + (n < 0 ? '（' + (-n) + '日前に切れています）' : '（あと' + n + '日）') });
        });
        return out;
      } },

    /* ── データの抜け ───────────────────────────────────────── */
    /* 🔴 D01 と D09 は**同じ表**（card-miss.js）を見ている。分けているのは**急ぐかどうか**だけ。
       ◎なぜ分けたか
         いっしょにすると、**終わった車の抜け**が数百件出て、**これから来る車の抜け**が埋もれる。
         直せる（＝お客様に聞ける）のはこれから来る車のほうなので、そちらだけ赤にする。 */
    { id:'D01', cat:'data', level:'red',
      title:'これから作業する車で、必須の項目が空',
      why:'いまは、この項目が空だとカードを保存できない決まりです。'
         + '決まりができる前に作られたカードなので、空のまま残っています。'
         + 'このままだと、当日になってから慌ててお客様に聞くことになります。',
      fix:'カードを開いて、赤い枠のところを入れてください。',
      each: function(c){
        if (!isLive(c)) return '';
        var r = misses(c).red;
        return r.length ? ('空：' + r.map(function(x){ return x.label; }).join('・')) : '';
      } },

    { id:'D09', cat:'data', level:'gray',
      title:'終わった車で、必須の項目が空',
      why:'返車が済んだ車です。いま直しても現場は動きませんが、'
         + '整備ソフトとの突合や、次に来た時の検索でつまずきます。',
      fix:'「ここを直す」で1件ずつ埋めてください。数が多くても、ここも 0 にします（会社の履歴として残るデータです）。',
      each: function(c){
        if (isLive(c) || c._draft) return '';
        if (!isDone(c) && !c.archived) return '';
        var r = misses(c).red;
        return r.length ? ('空：' + r.map(function(x){ return x.label; }).join('・')) : '';
      } },

    { id:'D02', cat:'data', level:'gray',
      title:'入れたほうがいい項目が、空のまま',
      why:'無くても動きますが、あとで探す時・整備ソフトと突き合わせる時に困ります。',
      fix:'分かるところから埋めてください。',
      each: function(c){
        /* ⚠ これから来る車だけ。終わった車の「入れたほうがいい」は、もう入れようがない */
        if (!isLive(c)) return '';
        var y = misses(c).yellow;
        /* 🔴 v1.169.0（本番データで分かったこと）**まだ来ていない車の「漢字の名前」は言わない。**
           ◎なぜ
             新しいお客様は**電話だけで漢字が分からない**ので、受付の時点ではカナだけが正しい形。
             それを毎回言うと、本番では 71件のうち **36件が「漢字の名前が空」**で埋まり、
             ほかの抜け（入庫時刻など）が見えなくなっていた。
           🔴 **車が来れば車検証で分かる。**だから入庫した後（と返車済み）だけ言う。
              返車済みで空のままは D03 が別に言う。 */
        if (c.status === 'reserved') y = y.filter(function(x){ return x.key !== 'customer'; });
        return y.length ? ('空：' + y.map(function(x){ return x.label; }).join('・')) : '';
      } },

    { id:'D03', cat:'data', level:'amber',
      title:'返車済みなのに、漢字のお名前が空',
      why:'カナだけで実績になっています。整備ソフトの伝票と突き合わせる時に名前で照合できません。',
      fix:'漢字のお名前を入れてください。',
      each: function(c){ return (isDone(c) && !t(c.customer)) ? ('カナ「' + t(c.kana) + '」だけです') : ''; } },

    { id:'D04', cat:'data', level:'amber',
      title:'返車済みなのに、電話番号が空',
      why:'次に来た時にお客様を探せません。',
      fix:'電話番号を入れてください。',
      each: function(c){ return (isDone(c) && !t(c.tel)) ? '電話番号が空のまま実績になっています' : ''; } },

    { id:'D05', cat:'data', level:'amber',
      title:'電話番号の形がおかしい',
      why:'数字が足りない・記号が混ざっています。かけられません。',
      fix:'番号を直してください。',
      each: function(c){
        var v = t(c.tel);
        if (!v) return '';
        var d = v.replace(/[^0-9]/g, '');
        if (/[^0-9\-＋+() 　]/.test(v)) return '「' + v + '」に番号以外の文字が入っています';
        if (d.length && (d.length < 9 || d.length > 11)) return '「' + v + '」は ' + d.length + 'けたです';
        return '';
      } },


    { id:'D07', cat:'data', level:'amber',
      title:'顧客控えに同じ人がいるのに、つながっていない',
      why:'顧客ページから来店履歴が引けません（1台ずつ手で探すことになります）。'
         + 'この車は顧客控えに同じ電話番号（または同じお名前）の人がいるので、つなげられます。',
      fix:'カードのお客様欄から、その人を選び直してください。',
      each: function(c, ctx){
        /* ⚠ **つなげられる時だけ**言う。顧客控えにそもそも居ない車まで並べると、
              直しようのないものが何百件も出て、直せるものが埋もれる。 */
        if (t(c.customerId)) return '';
        if (!isLive(c) && !isDone(c)) return '';
        var tel = t(c.tel).replace(/[^0-9]/g, '');
        var hit = (tel.length >= 9 && ctx.custByTel[tel]) || ctx.custByKana[t(c.kana)] || null;
        return hit ? ('顧客控えの「' + t(hit.name || hit.kana) + '」とつながっていません') : '';
      } },

    { id:'D08', cat:'data', level:'amber', judge:true,
      title:'同じ電話番号なのに、お名前の書き方が違う',
      why:'同じお客様が別々の人として数えられています（来店回数・売上が分かれます）。',
      fix:'どちらかの書き方に揃えてください。',
      all: function(ctx){
        var g = {}, out = [];
        ctx.cards.forEach(function(c){
          if (c.archived || c._draft) return;
          var tel = t(c.tel).replace(/[^0-9]/g, '');
          if (tel.length < 9) return;
          (g[tel] = g[tel] || []).push(c);
        });
        Object.keys(g).forEach(function(tel){
          var names = {};
          g[tel].forEach(function(c){ var n = t(c.kana) || t(c.customer); if (n) names[n] = 1; });
          var list = Object.keys(names);
          if (list.length < 2) return;
          g[tel].forEach(function(c){
            out.push({ refId:c.id, text:'同じ番号（' + t(c.tel) + '）に ' + list.join('／') + ' があります' });
          });
        });
        return out;
      } },

    /* ── 状態の矛盾 ─────────────────────────────────────────── */
    { id:'T01', cat:'state', level:'red',
      title:'返車の列にいるのに、まだ作業前の状態',
      why:'完TELを通った印が付いているのに、タスクは点検待ち・見積り中・連絡中のままです。'
         + '売上のほうは「作業は終わって返すだけ（実績待）」として数えているので、'
         + '実際より確かな売上に見えています。',
      fix:'タスクボードで正しい列（パーツ待ち・作業待ちなど）へ動かしてください。',
      each: function(c){
        if (!c.returnStage || c.status === 'returned') return '';
        if (['check','estim','contact'].indexOf(s(c.status)) < 0) return '';
        return '完TELの印があるのに「' + statusText(c) + '」です';
      } },

    { id:'T02', cat:'state', level:'red',
      title:'返車済みなのに、完TELを通っていない',
      why:'完TELを通さずに実績になっています。確定売上も担当者も入らないまま固まっている可能性があります。',
      fix:'カードを開いて確定金額と担当を入れてください。'
        + '完TELそのものが済んでいるなら、完了アーカイブの「完TEL」を済にすれば消えます。',
      /* 🔴 v1.180.0 印は2つある（returnStage と 表紙チェックの完TEL）。**どちらでも済とみなす。**
         ＝ 完了アーカイブから直せるのは後者だけなので、前者しか見ないと**直しても消えなかった**。 */
      each: function(c){ return (isDone(c) && !callDone(c)) ? '完TELの印が無いまま実績になっています' : ''; } },

    /* 🔴🔴 v1.174.0（ゆうた指定 2026-08-22）**「なし」ができたので、空っぽ＝100%忘れ。**
       🗣「リアルに該当者がいない場合に、忘れなのか リアルなのかをこれで判断するように」
       🗣「**閾値としても入ってないのは100％忘れになるから、そこも加味して作って**」
       ◎前まで＝**どちらも空の時だけ**「確認」で言っていた。
         ＝「整備だけ入れて点検は忘れた」が素通りし、しかも**居ないのか忘れたのか読めなかった**。
       🔴 いま＝**片方でも決まっていなければ「要対応」**。居ないなら「なし」を押せば済むので、
          空のまま残る理由が1つも無い＝**空＝忘れ**と言い切れる。
       🔴 決まっているかの物差しは **mech-pick.js の `pitMechUnsettled` 1本**。ここで条件を書き写さない。 */
    { id:'T03', cat:'state', level:'red',
      title:'作業が終わっているのに、担当が入っていない',
      why:'メカニックの実績（作業サマリー）に数えられません。誰がやったか残りません。'
         + '居ないなら「なし」を選べるので、空のままは入れ忘れです。',
      fix:'カードの整備タブで担当を入れてください。居ないなら、いちばん左の「なし」を押してください。',
      each: function(c){
        if (c.status !== 'workDone' && !isDone(c)) return '';
        if (noSale(c)) return '';
        var un = w.pitMechUnsettled ? w.pitMechUnsettled(c) : [];
        return un.length ? (un.join('・') + 'が入っていません（居ないなら「なし」）') : '';
      } },

    { id:'T04', cat:'state', level:'amber',
      title:'返車済みなのに、フロント担当が空',
      why:'フロント別の売上に数えられません（「担当なし」に落ちます）。',
      fix:'カードでフロント担当を選んでください。',
      each: function(c){ return (isDone(c) && !t(c.frontStaff) && !t(c.staff)) ? 'フロント担当が空です' : ''; } },

    { id:'T05', cat:'state', level:'red',
      title:'キャンセルだが、「予約キャンセル」か「未入庫」か分からない',
      why:'この2つは意味が違います（人がやめたのか、来なかっただけか）。'
         + '印が無いと来店履歴の残り方も代車の扱いも決まりません。',
      fix:'カードを開いてどちらか決めてください。',
      each: function(c){
        if (c.status !== 'cancelled') return '';
        return (c.cancelled === true || c.noShow === true) ? '' : 'どちらの印も付いていません';
      } },

    { id:'T06', cat:'state', level:'amber',
      title:'アーカイブ済みなのに、作業中の状態のまま',
      why:'片づいたはずなのに、状態はタスクボードの作業中のままです。あとで戻した時に行き先が分かりません。',
      fix:'カードを開いて、いまの状態に合うところへ直してください（戻す時に行き先が分からなくなります）。',
      each: function(c){
        if (!c.archived) return '';
        return (['check','estim','contact','parts','work','workDone'].indexOf(s(c.status)) >= 0)
          ? ('アーカイブ済みですが「' + statusText(c) + '」のままです') : '';
      } },

    { id:'T07', cat:'state', level:'gray',
      title:'廃車・乗替なのに、金額が入っている',
      why:'廃車・乗替はどの売上にも数えません。金額が入っていると、あとで見た人が混乱します。',
      fix:'売上があるなら別のカードに分けてください。',
      each: function(c){
        if (c.status !== 'scrap') return '';
        var a = num(c.amountFinal) || num(c.amountOrder);
        return a > 0 ? ('廃車・乗替に ' + yen(a) + ' が入っています') : '';
      } },

    { id:'T08', cat:'state', level:'gray', judge:true,
      title:'課と、フロント担当の課が食い違う',
      why:'課ごとの売上と、人ごとの売上が合わなくなります。',
      fix:'どちらかを直してください。応援で入ったのなら、そう分かるように課か担当を直してください。',
      each: function(c){
        if (!isLive(c) && !isDone(c)) return '';
        var who = t(c.frontStaff) || t(c.staff);
        if (!who) return '';
        var st = ((w.state && state.staff) || []).find(function(x){ return x.name === who; });
        if (!st || !st.division) return '';
        var mine = (w.pitDivisionId ? w.pitDivisionId(c) : '');
        if (!mine || mine === st.division) return '';
        var ds = (st.divisions || [st.division]);
        if (ds.indexOf(mine) >= 0) return '';
        /* 🔴 課の名前は id から引く（pit-share.js の1本）。ここで「1課」と字を書かない。
           ⚠ 受付など課の表に無い所属は名前が空になる＝そこは食い違いとして出さない。 */
        var his = w.pitDivisionLabelById ? w.pitDivisionLabelById(st.division) : '';
        if (!his) return '';
        return divLabel(c) + ' の車ですが、担当は ' + who + '（' + his + '）です';
      } },

    { id:'T09', cat:'state', level:'amber',
      title:'設定に無い状態・ボードのカード',
      why:'どの列にも出ません（画面から消えます）。外から入ったデータか、消された設定を指しています。',
      fix:'カードを開いて状態とボードを選び直してください。',
      each: function(c){
        if (c._draft) return '';
        var out = [];
        /* 🔴 状態の言葉は **カードごと** `pitCardStatusText` に聞く（v1.164.0 の決めごと）。
           ＝ 言葉が返らず英語のまま返ってきた＝**表に無い状態**、という見分け方。
           ⚠ ここで statusLabel に状態の文字だけ渡さないこと（キャンセルの言い分けが消える）。 */
        if (statusText(c) === s(c.status)) out.push('状態「' + s(c.status) + '」');
        var bs = (w.state && state.boards) || [];
        if (t(c.boardId) && !bs.some(function(b){ return b.id === c.boardId; })) out.push('ボード「' + c.boardId + '」');
        return out.length ? (out.join('／') + ' が設定にありません') : '';
      } }
  ];

  /* ================================================================
     5. 走らせる
     ================================================================ */
  function marks(){ if (w.state && !state.inspectMarks) state.inspectMarks = {}; return (w.state && state.inspectMarks) || {}; }
  function mutes(){ if (w.state && !state.inspectMutes) state.inspectMutes = {}; return (w.state && state.inspectMutes) || {}; }

  /* 🔴🔴 v1.172.0（ゆうた指定）**前に「これでOK」を押した札を外す。**
     ◎なぜ
       「これでOK」は廃止した。ボタンだけ消して印を残すと、
       **戻す手立てが無いまま永久に隠れる**＝画面には出ないのに直っていない、という状態になる。
     ⚠ 1回外せば済むので、外した時だけ保存する（毎回書きに行かない）。

     🔴🔴 v1.172.1（ゆうた訂正 2026-08-22）**黙らせている規則（inspectMutes）は捨てない。**
       🗣「**出さないを選択してたやつはルールからはずしていい**」
       ＝ 出し直すのではなく、**その規則そのものを規則表から消す**、という意味だった。
       だからこの印は「**消す予定の規則の控え**」＝ゆうたが選んだ結果そのもの。**勝手に捨てない。**
       ⚠ 規則を消したら、その時に一緒に片づける。 */
  function sweepEscapes(){
    var mk = marks(), n = 0;
    /* 🔴 v1.173.0 **「確認した」は要判断の規則にしか付かない。**
       ほかの規則に付いていたら外す（表を変えた時に、古い札が抜け道になるのを防ぐ）。 */
    var judgeOf = {};
    RULES.forEach(function(r){ judgeOf[r.id] = !!r.judge; });
    Object.keys(mk).forEach(function(k){ if (mk[k] && DEAD_MARKS[mk[k].v]) { delete mk[k]; n++; } });
    Object.keys(mk).forEach(function(k){
      if (mk[k] && mk[k].v === 'ok' && !judgeOf[String(k).split(':')[0]]) { delete mk[k]; n++; }
    });
    /* 🔴 v1.172.2 **消した規則に付いていた「出さない」の印は片づける。**
       指す先の規則がもう無いので、残しても誰も読めない（生きている規則の印には触らない）。 */
    var mu = mutes(), have = {}, dead = 0;
    RULES.forEach(function(r){ have[r.id] = 1; });
    Object.keys(mu).forEach(function(k){ if (!have[k]) { delete mu[k]; dead++; } });
    n += dead;
    if (n && w.PitDB && w.PitDB.save) { try { PitDB.save(); } catch(e){} }
    if (n) console.log('[inspect] 片づけました（これでOKの札／消した規則の印 あわせて ' + n + '件）');
    return n;
  }

  function pitInspectRun(opt){
    opt = opt || {};
    var td    = opt.today || today();
    var all   = (opt.cards || (w.state && state.cards) || []).filter(Boolean);
    var asg   = (opt.assigns || (w.state && state.loanerAssigns) || []).filter(Boolean);
    var lo    = (w.state && state.loaners) || [];
    var cc    = (w.state && state.companyCars) || [];
    var vehs  = lo.concat(cc);
    var vehIds = {}; vehs.forEach(function(v){ if (v && v.id) vehIds[v.id] = v; });

    /* 顧客控えの引き当て表（電話番号・カナ）。⚠ ここは**探すためだけ**。正式な台帳は整備ソフト */
    var custByTel = {}, custByKana = {};
    ((w.state && state.customers) || []).forEach(function (cu) {
      if (!cu) return;
      (cu.contacts || []).forEach(function (ct) {
        var n = t(ct && ct.tel).replace(/[^0-9]/g, '');
        if (n.length >= 9 && !custByTel[n]) custByTel[n] = cu;
      });
      var k = t(cu.kana);
      if (k && !custByKana[k]) custByKana[k] = cu;
    });

    var ctx = { today: td, cards: all, assigns: asg, vehs: vehs, vehIds: vehIds,
                custByTel: custByTel, custByKana: custByKana };
    sweepEscapes();                       /* 🔴 v1.172.0 「これでOK」で隠していたものを出し直す */
    var mk = marks(), mu = mutes();
    var byId = {}; all.forEach(function(c){ if (c && c.id) byId[c.id] = c; });

    var findings = [], mutedN = 0;

    function push(rule, ref, text, kind, name){
      var key = rule.id + ':' + (ref == null ? '-' : ref);
      var m = mk[key];
      findings.push({
        key: key, no: inspectNo(key),            /* 🔢 v1.178.0 1件ごとの番号（毎回おなじ） */
        ruleId: rule.id, cat: rule.cat, level: rule.level,
        judge: !!rule.judge,                    /* 🔴 v1.173.0 見て決める規則か */
        title: rule.title, why: rule.why, fix: rule.fix,
        kind: kind || 'card', refId: ref, name: name || '', text: text,
        mark: (m && m.v) || '', markAt: (m && m.at) || '', markBy: (m && m.by) || ''
      });
    }

    var mutedIds = [];
    RULES.forEach(function(rule){
      /* 🔴🔴 v1.172.1（ゆうた訂正）**「出さない」を選んでいた規則は、これから規則表から消す。**
         消すまでの間は、選んだとおり出さない（黙って戻すと、また同じ判断をさせることになる）。
         🔴 ただし**黙って隠さない**＝画面の上に「消す予定の規則 ◯本」と名前まで出す。
         ⚠ 新しく黙らせる道はもう無い（ボタンは撤去済み）。ここは**残っている印を読むだけ**。 */
      if (mu[rule.id]) { mutedN++; mutedIds.push({ id: rule.id, title: rule.title }); return; }
      try {
        if (rule.each){
          all.forEach(function(c){
            if (!c || !c.id) return;
            var r = '';
            try { r = rule.each(c, ctx) || ''; } catch(e){ r = ''; }
            if (r) push(rule, c.id, r, 'card', '');
          });
        }
        if (rule.all){
          (rule.all(ctx) || []).forEach(function(h){
            if (!h) return;
            push(rule, (h.kind === 'veh' ? (h.vehId || h.refId) : h.refId), h.text, h.kind || 'card', h.name || '');
          });
        }
      } catch(e){
        console.warn('[inspect] 規則 ' + rule.id + ' でつまずきました', e);
      }
    });

    /* 相手（カード・車両）の見出しを付ける。⚠ お名前は必ず1本（pitCustName）を通す */
    findings.forEach(function(f){
      if (f.kind === 'card'){
        var c = byId[f.refId];
        if (c){
          f.name  = nameOf(c);
          f.car   = carOf(c);
          f.plate = t(c.plate);
          f.state = statusText(c);
          f.div   = divLabel(c);
          f.amount = amountOf(c);
          f.resNo = t(c.resNo);
          /* 🔴 v1.168.0 担当（フロント）。空なら「担当なし」と言い切る
             ＝ 空欄で黙るより「決まっていない」と分かるほうが動ける。 */
          f.staff      = staffOf(c);
          f.staffColor = staffColorOf(c);
          /* 🔴 v1.169.0 どちらの車か。返車が済んだ／片づけた車＝「終わった記録」 */
          f.scope = (c.archived || c.status === 'returned') ? 'past' : 'live';
          /* 車検の所見だけ、回送の担当も一緒に出す（フロントとは別の人） */
          if (f.cat === 'shaken' && isShaken(c)){
            f.staff2 = w.pitShakenStaffCall ? w.pitShakenStaffCall(c) : shakenStaff(c);
          }
        } else if (!f.name) { f.name = '（カードなし）'; }
      } else {
        var v = vehIds[f.refId];
        if (v && !f.name) f.name = (t(v.name) || v.id) + '（' + t(v.model) + '）';
        f.scope = 'live';   /* 代車・社用車はいつでも「いま」の話 */
      }
    });

    /* 並び＝重い順 → 分類の並び順 → 規則の順 → 金額の大きい順 */
    var lvOrder = {}; LEVELS.forEach(function(l, i){ lvOrder[l.id] = i; });
    var ctOrder = {}; CATS.forEach(function(c, i){ ctOrder[c.id] = i; });
    var rlOrder = {}; RULES.forEach(function(r, i){ rlOrder[r.id] = i; });
    findings.sort(function(a, b){
      return (lvOrder[a.level] - lvOrder[b.level])
          || (ctOrder[a.cat] - ctOrder[b.cat])
          || (rlOrder[a.ruleId] - rlOrder[b.ruleId])
          || (num(b.amount) - num(a.amount));
    });

    var byLevel = {}, byCat = {}, byRule = {}, byScope = {}, markedN = 0;
    LEVELS.forEach(function(l){ byLevel[l.id] = { n:0, open:0 }; });
    CATS.forEach(function(c){ byCat[c.id] = { n:0, open:0 }; });
    SCOPES.forEach(function(x){ byScope[x.id] = { n:0, open:0 }; });
    /* 🔴🔴 v1.173.0 **数から外れるのは「確認した」だけ。**
       「直した」は目印なので数からは外れない（直っていれば次のチェックで規則の側から消える）。
       ＝ ここに出ている数が「これから直す数」。**0 になったら本当に 0。** */
    findings.forEach(function(f){
      var open = (f.mark !== 'ok');
      if (!open) markedN++;
      if (byLevel[f.level]) { byLevel[f.level].n++; if (open) byLevel[f.level].open++; }
      if (byCat[f.cat])     { byCat[f.cat].n++;     if (open) byCat[f.cat].open++; }
      if (byScope[f.scope]) { byScope[f.scope].n++; if (open) byScope[f.scope].open++; }
      byRule[f.ruleId] = byRule[f.ruleId] || { n:0, open:0 };
      byRule[f.ruleId].n++; if (open) byRule[f.ruleId].open++;
    });

    /* もう出なくなった所見の札は捨てる（札がたまり続けないように） */
    var live = {}; findings.forEach(function(f){ live[f.key] = 1; });
    var dropped = 0;
    Object.keys(mk).forEach(function(k){ if (!live[k]) { delete mk[k]; dropped++; } });

    return {
      at: new Date().toISOString(), today: td,
      cards: all.length, rules: RULES.length, muted: mutedN, mutedIds: mutedIds, marked: markedN, dropped: dropped,
      from: startFrom(), okN: markedN, openN: findings.length - markedN,
      findings: findings, byLevel: byLevel, byCat: byCat, byRule: byRule, byScope: byScope
    };
  }

  /* 札を貼る／はがす。v は 'seen' | 'spec' | 'fixed' | ''（はがす） */
  function pitInspectMark(key, v){
    if (!key) return;
    /* 🔴🔴 v1.173.0 **「確認した」は要判断の規則だけ。** 画面から消すだけにしない（ここでも止める）。 */
    if (v === 'ok'){
      var rid = String(key).split(':')[0];
      var r = RULES.filter(function(x){ return x.id === rid; })[0];
      if (!r || !r.judge){
        console.warn('[inspect] この規則に「確認した」は付けられません（見て決める規則ではありません）：' + rid);
        return;
      }
    }
    var mk = marks();
    if (!v) delete mk[key];
    /* 誰が付けたか＝フローの記録と同じ1本（pitFlowMe）。ここで自分で名乗り方を決めない */
    else mk[key] = { v: v, at: today(), by: (function(){ try { return (w.pitFlowMe && w.pitFlowMe()) || ''; } catch(e){ return ''; } })() };
    if (w.PitDB && w.PitDB.save) PitDB.save();
  }

  /* 🔴🔴 v1.172.0（ゆうた指定）**規則ごと黙らせる道は無くした。**
     ◎残してある理由＝古い画面や書き置きから呼ばれても落ちないように。**何もしない。**
     ⚠ 新しく呼ばないこと。減らしたい時は**規則そのものを直す**。 */
  function pitInspectMute(){
    console.warn('[inspect] 「この規則は出さない」は v1.172.0 で廃止しました（規則の側で直してください）');
  }

  /* ②突合・③AI判断へ渡す形。🔴 ここが三段ロケットの受け渡し口 */
  function pitInspectExport(res){
    res = res || pitInspectRun();
    return {
      app: 'PitFlow',
      version: (document.querySelector('meta[name="app-version"]') || {}).content || '',
      書き出し: res.at, 今日: res.today,
      対象台数: res.cards, 規則の数: res.rules,
      日付の前後を見る起点日: res.from || '（決めていない）',
      直す件数: res.openN, 確認した件数: res.okN,
      重さごと: res.byLevel, 分類ごと: res.byCat, 規則ごと: res.byRule, 車のいまごと: res.byScope,
      所見: res.findings.map(function(f){
        return {
          /* 🔢 v1.178.0 いちばん頭に番号。②突合・③AIチェックも**この番号で話せる**
             （毎回おなじ番号なので、前回の書き出しと突き合わせられる） */
          番号: f.no || '',
          規則: f.ruleId, 重さ: f.level, 分類: f.cat, 見出し: f.title,
          種類: (f.judge ? '要判断（見て決める）' : '抜け・矛盾（直す）'),
          車のいま: (f.scope === 'past' ? '終わった記録' : 'いま動いている車'),
          対象: f.kind, id: f.refId, お客様: f.name, 車: f.car || '', ナンバー: f.plate || '',
          予約番号: f.resNo || '', 状態: f.state || '', 課: f.div || '',
          担当: f.staff || '', 車検担当: f.staff2 || '', 金額: f.amount || 0,
          中身: f.text,
          /* 🔴 v1.168.1 札は**人が読む言葉**で出す（'spec' のままだと②③で意味が伝わらない）。
             ⚠ 言葉の元は上の MARKS 表1本。ここで綴らない。 */
          札: (function(){ var m = MARKS.filter(function(x){ return x.id === f.mark; })[0]; return m ? m.label : ''; })(),
          札の印: f.mark || '', 札をつけた日: f.markAt || '', 札をつけた人: f.markBy || ''
        };
      })
    };
  }

  w.PIT_INSPECT_SCOPES = SCOPES;
  w.PIT_INSPECT_CATS   = CATS;
  w.PIT_INSPECT_LEVELS = LEVELS;
  w.PIT_INSPECT_MARKS  = MARKS;
  w.PIT_INSPECT_LIMITS = LIM;
  w.PIT_INSPECT_RULES  = RULES;
  w.pitInspectRun      = pitInspectRun;
  /* 🔢 v1.178.0 番号の物差しは**この1本**。画面・書き出し・見張りはここを呼ぶ（写しを作らない） */
  w.pitInspectNo       = inspectNo;
  w.pitInspectMark     = pitInspectMark;
  w.pitInspectMute     = pitInspectMute;
  w.pitInspectExport   = pitInspectExport;
  console.log('[inspect-rules] ready（データチェックの規則 ' + RULES.length + '本）');
})(window);
