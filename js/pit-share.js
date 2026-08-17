/* ========================================
   pit-share.js  -  PitFlow と MHS が **一緒に使う物差し**  PitFlow v1.103.0
   ----------------------------------------
   ◎なぜ作ったか（2026-08-16・ゆうた指示）
     🗣「MHSのTodayボードが、PitFlowの当日と完全に連動してるか見てほしい」
     → 調べたら **8か所ズレていた**。原因はほぼ全部
       **「PitFlow の物差しを MHS が写していた」**こと。
       写した側は、PitFlow を直しても勝手には直らない。

   ◎これから
     🔴 **写さない。借りる。**
        MHS は返車の行き先（`return-slot.js`）を**本番から直接読み込む**やり方をすでに持っている。
        表示の物差しも同じやり方にするため、**両方が使うものだけ**をこのファイルに集めた。
        ＝ここを直せば、PitFlow も MHS も同時に直る。

   ◎入っているもの
     ・お客様名の出し方 … `pitSurname` / `pitCustName`（漢字が無ければカナ）/ `pitCustSurname`
     ・時間の表と並び   … `PIT_TIME_ALL` ほか / `pitTimeMin`（いちばん遅くなり得る時刻で並べる）
     ・課（1課／2課）   … `pitDivisionId` / `pitDivisionLabel` / `pitDivisionColor`
     ・売上なしの印     … `pitCardNoSale`
     ・返車の関門       … `pitReturnCanDone`（完TELを通ったか）
     ・実績の金額       … `pitFinalAmountOf`（確定→受注→見積→概算）
     ・🔧 車検予定       … `pitShakenOnDate`（その日の車検＝絞り込み・並び・中身まで1本）ほか

   ◎借りる側（MHS）へ
     このファイルは **`state` が無くても動く**。ただし「課の表」と「概算金額」だけは
     アプリごとに持ち場所が違うので、**差し込み口**から渡すこと。
       PitShare.use({ divisions: function(){ return 表; },
                      estAmount:  function(workType, team){ return 円; } });
     何も渡さなければ PitFlow の `state.divisions` / `pitEstAmount` を見る（＝PitFlow は今までどおり）。

   ⚠ 読み込みは **state.js より前**（state.js の中から呼んでいるものがある）。
   ⚠ ここに「その画面だけの都合」を入れないこと。**両方で同じ意味になるものだけ。**
   ======================================== */
(function (w) {
  'use strict';

  /* ---- 差し込み口（借りる側が自分の持ち物を渡す） ---- */
  var HOOK = {
    divisions: function () { return (w.state && Array.isArray(w.state.divisions)) ? w.state.divisions : []; },
    estAmount: function (workType, team) { return w.pitEstAmount ? w.pitEstAmount(workType, team) : 0; },
    teamKey:   function (c) { return w.pitTeamKey ? w.pitTeamKey(c) : ((c && c.boardId === 'import') ? 'import' : 'default'); },
    /* 🚗 代車マスタ（v1.111.0）。PitFlow は state.loaners、MHS は借りた写しを渡す */
    loaners:   function () { return (w.state && Array.isArray(w.state.loaners)) ? w.state.loaners : []; }
  };
  function _divisions(){ try { return HOOK.divisions() || []; } catch (e) { return []; } }
  w.PitShare = {
    use: function (o) {
      if (!o) return;
      if (typeof o.divisions === 'function') HOOK.divisions = o.divisions;
      if (typeof o.estAmount === 'function') HOOK.estAmount = o.estAmount;
      if (typeof o.teamKey   === 'function') HOOK.teamKey   = o.teamKey;
      if (typeof o.loaners   === 'function') HOOK.loaners   = o.loaners;
    }
  };


/* カード用の短い表示名（省スペース用）。
   ・個人 … フルネーム「姓 名」の先頭トークン＝姓だけ。
   ・法人 … 苗字分割せず会社名をそのまま。ただし長い会社表記をカード用に略記
            （株式会社→㈱／有限会社→㈲／合同会社→(同)。各表記ゆれも寄せる）。例：小林モータース株式会社→小林モータース㈱
   ※略記は「表示の時だけ」＝保存・検索は正式名(c.customer)のまま。予約詳細・ホバー情報はフル表示。 */
function pitSurname(name){
  var s = String(name == null ? '' : name).trim();
  if (!s) return '';
  var t = s
    .replace(/株式会社|（株）|\(株\)/g, '㈱')
    .replace(/有限会社|（有）|\(有\)/g, '㈲')
    .replace(/合同会社|（同）|\(同\)/g, '(同)');
  // 法人マーカー（略記後の㈱/㈲/(同) や 会社/組合/法人）があれば、会社名フル（略記済み）を返す
  if (/[㈱㈲]|\(同\)|会社|組合|法人/.test(t)) return t.replace(/\s+/g, ' ').trim();
  // 個人＝苗字だけ
  return t.split(/\s+/)[0] || t;
}
w.pitSurname = pitSurname;
w.pitCardName = pitSurname;   // 別名（カード表示名の意味で使う用）

/* 🔴 v1.25.0 カードの「お客様名（表示用）」＝画面に出す名前はここを通す。
   ・新規のお客様は**電話だけで漢字が分からない**ことがあるので、その時はカナだけ入れる運用。
   ・漢字（c.customer）が空なら、**カナ（c.kana）をそのままお客様名として表示する**。
   ・保存しているデータは触らない＝あとで漢字が分かったら普通に入れれば、そちらが出るようになる。
   ⚠ 検索・突き合わせ・保存は今までどおり c.customer / c.kana をそのまま見ること（ここは表示専用）。 */
function pitCustName(c){
  if (!c) return '';
  var k = String(c.customer == null ? '' : c.customer).trim();
  if (k) return k;
  return String(c.kana == null ? '' : c.kana).trim();
}
w.pitCustName = pitCustName;

/* 上の「表示用の名前」を、カード用の短い表示（姓だけ／法人は略記）にしたもの。
   これまで各画面が書いていた pitSurname(c.customer) の置き換え。 */
function pitCustSurname(c){ return pitSurname(pitCustName(c)); }
w.pitCustSurname = pitCustSurname;

/* 🔴 v1.104.0（ゆうた指定 2026-08-16）**狭い枠に出す「担当者」の名前。**
   🗣「フロントや受付担当を小林モータースで選んだ時に、枠として十分幅がある予約詳細とかの画面以外では
      **コバモ** 表示にしてほしい。各カードや当日ボードの縦書き部分を含む」

   ◎なぜ要るか
     自社（小林モータース）は**人ではなく受け皿**（整備ソフト側で担当が「小林モータース」になっている分）。
     法人なので `pitSurname` は苗字に切らず**フルで返す**＝カードの担当欄や当日ボードの
     縦書きバッジ（幅 22px）だと、はみ出す・つぶれる。**社内の通称「コバモ」**なら収まる。

   🔴 **使い分けはこの1つ**
     ・狭い枠（カード・当日ボード・PIT配置図・週カード・日別リスト）… `pitStaffShort(name)`
     ・幅のある画面（予約詳細・ホバー情報カード）……………………… 今までどおりフルのまま
     ・表紙印刷 ………………………………………………………………… `pitStaffPrintName`（state.js・自社はフル）
   ⚠ **お客様名には使わない。** お客様としての「小林モータース」は今までどおりフル（略記のみ）。
   ⚠ 表記ゆれ（株式会社つき・(株)・全角カッコ）も同じ1つとして扱う。 */
var PIT_SELF_SHORT = 'コバモ';
var _PIT_CORP = '(?:株式会社|有限会社|合同会社|[（(]株[）)]|[（(]有[）)]|[（(]同[）)]|㈱|㈲)';
var _PIT_SELF_RE = new RegExp('^' + _PIT_CORP + '?小林モータース' + _PIT_CORP + '?$');
function pitIsSelfName(name){
  var s = String(name == null ? '' : name).replace(/[\s　]/g, '');
  if (!s) return false;
  if (s === PIT_SELF_SHORT) return true;
  return _PIT_SELF_RE.test(s);
}
function pitStaffShort(name){
  var n = String(name == null ? '' : name).trim();
  if (!n) return '';
  if (pitIsSelfName(n)) return PIT_SELF_SHORT;
  return pitSurname(n);
}
w.PIT_SELF_SHORT = PIT_SELF_SHORT;
w.pitIsSelfName  = pitIsSelfName;
w.pitStaffShort  = pitStaffShort;


/* ===== 🕐 v1.33.0（ゆうた指定）入庫時間のショートカット =====
   🔴 **並び順はこの配列のとおり**（画面のボタンの並び）。
   🔴 **（）内の時間は画面に出さない。並び順の計算にだけ使う。**
      予約・当日・返車などの「時間順」は、その**いちばん若い時刻（from）**で決める。
   🔴 **決まり次第・レッカー・鍵ポスト・未定は「時刻が本当に分からない」**扱い＝**その日の最後尾**に付く。
      その中の並びもこの配列の順。
   ⚠ 保存の形は今までどおり **文字列ひとつ**（c.reserveTime にラベルがそのまま入る）。
      だから表紙印刷やカードの表示は、何もしなくても「朝一」「決まり次第」と**文字がそのまま出る**。
   ⚠ 時刻を直接打つ（9:00 / 900 / 9時半）のも今までどおり。ここは“よく使うもの”の近道。 */
/* 🔴 v1.60.0 **時間の言葉の表は、この1本（PIT_TIME_ALL）だけ。**
     入庫（予約）用と返車用で「画面に出すボタンの並び」は違うが、
     **中身（何時ぶんか・時刻不明か・並び順）は同じ表を見る**。表を2つ作ると必ずズレる。
     ・intakeOnly … 入庫のときだけ出す（鍵ポスト）
     ・returnOnly … 返車のときだけ出す（勝手に取る）
     ・tbd        … 「未定」だけ。**返車では、これが入っているうちは「返車時間未定」に残る**。
       （決まり次第・レッカー・勝手に取る は、時刻不明のまま**返車カレンダーの「時刻未定」に置く**＝ゆうた指定） */
/* 🔴 v1.70.0（ゆうた確定）**並びは「いちばん遅くなり得る時刻」＝ to で決める。** */
/* 🔴 v1.105.0（ゆうた変更 2026-08-16）**AM の終わりは 11:59。12時台に食い込ませない。**
     🗣「12:59 ではなく 11:59 にしよう。で 12:00台に被らないように AM が」
     ◎これまで（v1.70.0）… AM の to は **12:59**。「午前＝12時台まで」という現場の感覚に寄せていたので、
        **AM の車が 12:30 の車より後ろ**に並んでいた。
     ◎これから ………… AM の to は **11:59**。12時台にはいっさい重ならないので、
        **AM の車は 12:00 台のどの車よりも前**に並ぶ（12:00・12:30・お昼 より先）。
     ⚠ 変わるのは**並ぶ場所だけ**。画面に出る言葉は今までどおり「AM」のまま（時刻は出さない）。 */
var PIT_TIME_ALL = [
  { label: 'AM',         from: '09:00', to: '11:59' },
  { label: 'PM',         from: '13:00', to: '19:00' },
  { label: '朝一',       from: '09:00', to: '09:30' },
  { label: 'お昼',       from: '12:00', to: '13:00' },
  { label: '夕方',       from: '16:30', to: '19:00' },
  { label: '決まり次第', unknown: true },
  { label: 'レッカー',   unknown: true },
  { label: '鍵ポスト',   unknown: true, intakeOnly: true },
  { label: '勝手に取る', unknown: true, returnOnly: true },
  { label: '未定',       unknown: true, tbd: true }
];
w.PIT_TIME_ALL = PIT_TIME_ALL;

var _pitTimeByLabel = {};
PIT_TIME_ALL.forEach(function (t, i) { t.ord = i; _pitTimeByLabel[t.label] = t; });

/* 入庫（予約）のボタンの並び＝今までどおり。返車だけの言葉は出さない。 */
var PIT_TIME_QUICK = PIT_TIME_ALL.filter(function (t){ return !t.returnOnly; });
w.PIT_TIME_QUICK = PIT_TIME_QUICK;

/* 🕐 v1.60.0（ゆうた指定）返車時間のショートカットの並び。
   AM／PM／朝一／お昼／夕方／決まり次第／レッカー／勝手に取る／未定。
   時間の割りふりは予約とまったく同じ（夕方＝16:30〜19:00 がいちばん後ろの時間帯）。 */
var PIT_RETURN_TIME_QUICK = PIT_TIME_ALL.filter(function (t){ return !t.intakeOnly; });
w.PIT_RETURN_TIME_QUICK = PIT_RETURN_TIME_QUICK;

/* ラベル（朝一 など）ならその定義を返す。時刻や空なら null。 */
function pitTimeQuick(v){
  return _pitTimeByLabel[String(v == null ? '' : v).trim()] || null;
}
w.pitTimeQuick = pitTimeQuick;

/* 時刻が本当に分からないもの（決まり次第・レッカー・鍵ポスト・勝手に取る・未定）か */
function pitTimeUnknown(v){
  var q = pitTimeQuick(v);
  return !!(q && q.unknown);
}
w.pitTimeUnknown = pitTimeUnknown;

/* 🔴 v1.60.0 「まだ**時間そのものを決めていない**」＝空 か 「未定」だけ。
   決まり次第・レッカー・勝手に取る は“決めた上での時刻不明”なので**ここには入らない**。 */
function pitTimeTbd(v){
  var s = String(v == null ? '' : v).trim();
  if (!s) return true;
  var q = pitTimeQuick(s);
  return !!(q && q.tbd);
}
w.pitTimeTbd = pitTimeTbd;

/* 🔴 v1.70.0（ゆうた確定）**並び順の物差しは、この1本だけ。**
     考え方はひとつ＝ **「いちばん遅くなり得る時刻」で並べる。**

     | 入っているもの | 並ぶ場所 |
     |---|---|
     | `09:30`（ふつうの時刻） | そのまま 09:30 |
     | `09:00-10:00`（範囲） | **後ろの 10:00**（同じ 10:00 の車より後ろ） |
     | 朝一（09:00〜09:30） | **09:30** |
     | AM（09:00〜**11:59**） | **11時台のいちばん最後**（12:00 台のどの車よりも前・v1.105.0 で変更） |
     | お昼（12:00〜13:00） | **13:00** |
     | 夕方（16:30〜19:00） | **19:00** |
     | PM（13:00〜19:00） | **19:00**（夕方と同じ終わり → **幅が広い方が後ろ**なので PM が後） |
     | 終日（待ち・当日返しで時間なし） | 80000＝**時間の枠の後ろ／時刻未定より前** |
     | 決まり次第・レッカー・鍵ポスト・勝手に取る・未定 | 90000 台＝**その日の後ろ**（中はボタン順） |
     | 空・読めない文字（「9時以降」「全角の９時」） | 99999＝**いちばん最後** |

   ⚠ 返す値は「分」。休憩バーの区切り（12:00＝720）などと直接くらべられるようにしてある。
   ⚠ 端数（幅×0.001）は「同じ終わりなら幅の広い方を後ろに」するためだけのもの。
      幅は最大でも 360分＝0.36 なので、**次の1分をまたぐことはない**。
   🔴 これを変えると **MHS の index.html にある写しと食い違う**（MHS のテストが現物と突き合わせて落ちる）。
      直すときは必ず MHS も一緒に直すこと。 */
var PIT_TIME_ALLDAY = 80000;   /* 終日（待ち・当日返し）の並びの値 */
w.PIT_TIME_ALLDAY = PIT_TIME_ALLDAY;

/* ⚠ 中で使う小さな関数は**この中に閉じてある**。
   MHS のテストは state.js から `PIT_TIME_ALL` / `_pitTimeByLabel` / `pitTimeQuick` / `pitTimeMin` の
   4つだけを切り出して動かすので、**外に助っ人を置くと MHS 側で動かなくなる**。 */
function pitTimeMin(v){
  var hm = function (x){
    var m = String(x == null ? '' : x).match(/^(\d{1,2}):(\d{2})$/);
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  };
  /* 終わりの時刻 ＋ 幅ぶんの端数（同じ終わりなら**幅の広い方が後ろ**） */
  var span = function (from, to){
    var b = hm(to); if (b == null) return null;
    var a = hm(from); if (a == null || a > b) a = b;
    return b + (b - a) * 0.001;
  };
  var s = String(v == null ? '' : v).trim();
  if (!s) return 99999;
  var q = pitTimeQuick(s);
  if (q) {
    if (q.unknown) return 90000 + q.ord;
    var sp = span(q.from, q.to);
    if (sp != null) return sp;
  }
  /* 打ち込んだ時刻。範囲（09:00-10:00）なら**後ろの時刻**で並べる。 */
  var all = s.match(/\d{1,2}:\d{2}/g);
  if (!all || !all.length) return 99999;
  var r = span(all[0], all[all.length - 1]);
  return (r == null) ? 99999 : r;
}
w.pitTimeMin = pitTimeMin;

/* 🔴 v1.104.0（ゆうた指定 2026-08-16）**時間帯は3段に折る。**
   🗣「〇時〜〇時 の表示の時に当日ボードは 10:00 / 〜 / 11:00 みたいに改行の3段にできないかな？
      いまだと右側が結構かくれちゃってる」
   ◎当日ボードの時間の列は **62px 固定**。「09:00-10:00」は1行に収まらず右がはみ出していた。
   🔴 **折る／折らないの判断はここ1本。** 画面ごとに「-」を探して切らないこと。
     ・範囲（09:00-10:00 / 9:00〜10:00 …）… `['09:00','〜','10:00']` の3つ
     ・それ以外（09:00・AM・レッカー・空）… そのまま1つ（言葉は切らない）
   ⚠ 返り値は**必ず配列**。呼ぶ側は length>1 のときだけ小さく組む。 */
function pitTimeLines(v){
  var s = String(v == null ? '' : v).trim();
  if (!s) return [];
  var m = s.match(/^(\d{1,2}:\d{2})\s*[-–—~〜～ー]\s*(\d{1,2}:\d{2})$/);
  if (m) return [m[1], '〜', m[2]];
  return [s];
}
w.pitTimeLines = pitTimeLines;

/* ===================================================================
   🏷 課（1課／2課）＝ v1.92.0（ゆうた指摘 2026-08-13）
   -------------------------------------------------------------------
   🗣「表紙印刷の部分で、恐らく 1課・2課 が車か何かに引っ張られてる。
      **実際の予約画面のボタンに沿ってデータが入るようにしてほしい**」

   🔴 **課は「予約画面で押したボタン（c.division）」だけを見る。**
   ⚠ 直す前は、表紙もホバー情報カードも
        `c.division==='div2' || c.boardId==='import' ? '2課' : '1課'`
      と書いてあり、**課のボタンを外していると、国産／輸入（＝車）から 1課／2課 を作っていた**。
      ＝画面のボタンは何も選ばれていないのに、紙には「1課」と刷られる。これが報告の正体。
   ⚠ 表示名も `'1課'` と**直に書いてあった**。課の名前は `state.divisions` で決まるので、
      名前を変えたり3つ目を足したりすると紙だけ食い違う。**必ずこの表から引く。**
   🔴 **国産／輸入を押した時に課も自動で入る**のは今までどおり（card-detail.js）。
      それは「ボタンに値が入る」＝ここで見ている c.division が埋まる、ということ。
      **逆算（車→課）をやめただけで、自動入力はやめていない。**
   =================================================================== */
function pitDivisionId(c){ return (c && c.division) ? String(c.division) : ''; }
function pitDivisionLabel(c){
  const id = pitDivisionId(c);
  if (!id) return '';                       /* ボタンが押されていない＝空。車から作らない */
  const list = _divisions();
  const d = list.find(x => x && x.id === id);
  return d ? String(d.label || '') : '';    /* 表にない課＝出さない（勝手に1課にしない） */
}
/* 🔴 v1.98.0 課の**色**も同じ表から引く（既定は 1課＝緑・2課＝ピンク）。
   ⚠ 色を画面に直に書かないこと。設定で色を変えたら、出ている所がそろって変わるように。
   ⚠ 表に無い課・ボタンが空のときは空文字（＝呼んだ側で出さない判断ができる）。 */
function pitDivisionColor(c){
  const id = pitDivisionId(c);
  if (!id) return '';
  const list = _divisions();
  const d = list.find(x => x && x.id === id);
  return (d && d.color) ? String(d.color) : '';
}
/* 🔴 v1.104.0（ゆうた指定 2026-08-16）**課が選ばれていない時の色＝グレー。**
   🗣「1課2課の選択がされていない場合には当日ボードの担当者の背景帯をグレーにしてほしい」
   ◎なぜ
     直す前の担当者バッジは **車（国産／輸入）から色を作っていた**ので、
     課のボタンを何も押していなくても**必ず緑かピンクが付き、「入っている」ように見えていた**。
     ＝ v1.92.0 で表紙・ホバーから追い出した「車からの逆算」が、ここにだけ残っていた。
   🔴 **担当者バッジの色は課から引く。無ければグレー。** 車から作らない。 */
var PIT_DIV_NONE_COLOR = '#8390a6';
function pitDivisionColorOr(c){ return pitDivisionColor(c) || PIT_DIV_NONE_COLOR; }
w.PIT_DIV_NONE_COLOR = PIT_DIV_NONE_COLOR;
w.pitDivisionColorOr = pitDivisionColorOr;
w.pitDivisionId = pitDivisionId;
w.pitDivisionLabel = pitDivisionLabel;
w.pitDivisionColor = pitDivisionColor;


  /* ===================================================================
     💤 売上なしでアーカイブした車か（v1.99.0）
     🔴 **判定はここ1か所。** 画面ごとに `c.noSale` を直に見ないこと。
     ⚠ この印が付いた車は、実績・売上・台数・メカの配分のどこにも数えない。
        期間で絞る計算をふさいでいるのは `sales-count.js`（そちらがここを呼ぶ）。
     =================================================================== */
  function pitCardNoSale(c){ return !!(c && c.noSale); }
  w.pitCardNoSale = pitCardNoSale;

  /* ===================================================================
     🚪 返車済みにしてよいか（v1.97.0 の関門）
     🗣 ゆうた「当日返車の場合…クリックして返車済みの表示をグレーアウトしてほしい」
     🔴 **押せる条件はたった1つ＝完TELを通ったか（`returnStage` が付いているか）。**
        通っていない車を固めると、**確定売上も担当者も入らないまま実績になる**。
     ⚠ 預かりの車はもともと完TELを通ってしか返車の一覧に出ないので、今までどおり押せる。
     ⚠ ボタンを消すだけにしないこと。**実際に固める所でも同じ条件で止める。**
        （MHS の Todayボードも同じ関門を通る＝v1.103.0）
     =================================================================== */
  function pitReturnCanDone(c){ return !!(c && c.returnStage); }
  w.pitReturnCanDone = pitReturnCanDone;
  w.PIT_RETURN_WHY = 'まだ完TELを通っていません。タスクボードで完TEL済／完TEL依頼へ入れてください';

  /* ===================================================================
     💴 実績にする時の金額（v1.64.0）
     🔴 **拾う順番は 確定 → 受注 → 見積 → 概算。** ここ1本。
     ⚠ 昔は当日ビューが概算しか見ておらず、**クイック受注で人が打った受注金額が捨てられていた**。
        「いくらの車か」を2か所が別々に決めないこと。
     ⚠ 概算のもとの表はアプリごとに持ち場所が違うので、差し込み口から取る。
     =================================================================== */
  function pitFinalAmountOf(c){
    if (!c) return 0;
    if (c.amountFinal != null && c.amountFinal !== '') return Number(c.amountFinal);
    var v = [c.amountOrder, c.amountQuote, c.estAmount].find(function (x) { return x != null && x !== ''; });
    if (v == null) {
      var wt = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes[0] : c.workType;
      try { v = HOOK.estAmount(wt, HOOK.teamKey(c)); } catch (e) { v = null; }
    }
    return (v != null && v !== '') ? Number(v) : 0;
  }
  w.pitFinalAmountOf = pitFinalAmountOf;

  /* ===================================================================
     🔧 車検予定（v1.108.0・ゆうた指示「MHSのTODAYビューの車検予定をPitFlowから引く部分をちゃんと構築して」）
     🔴 **ここが車検予定の本家。** PitFlow の車検予定ボード／MHS の当日ビュー／前日LINEの画像が
        ぜんぶこの1本を通る。直すのはここだけ。

     ⚠ なぜ作ったか＝**本家が無いまま写しだけが動いていた**。
        「その日の車検予定はこれ」と答える関数が PitFlow に1つも無く（車検ボードの中に閉じていた）、
        サーバー（前日LINEの画像）だけが独自に書いていた。結果 7か所ズレていた：
          済んだ車が予定と同じ見た目で出る／再検が消える／担当がフロント担当／
          カナだけの客が「（未入力）」／車種が空だとメーカーも消える／売上なしの扱いが逆／
          キャンセルした予約が残る。

     ◎ 用語（似た日付が多いので必ずここを読む）
        inspSchedule.decided     … 🔴 **陸運局へ行くと決めた日**（＝車検予定日）。入庫日でも返車日でもない
        inspSchedule.slots       … まだ決めていない「行ける枠」の候補
        inspSchedule.resultDate  … 実際に行った日（済）。手で変えられるので decided と違うことがある
        inspSchedule.history[]   … 再検（落ちてもう一度行く）の記録。再検にすると decided は空に戻る
        vehicles[].shakenDate    … ⚠ **車検満了日**。代車・社用車のもので、これとは別物
     =================================================================== */

  /* 車検の車か。⚠ 昔は「配列だけ見る」実装と「workType も見る」実装が混ざっていて答えが割れていた。
     ここは **拾いこぼさない側**（どちらかに入っていれば車検）に揃える。 */
  function pitIsShaken(c){
    if (!c) return false;
    var ids = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes : [];
    if (ids.indexOf('shaken') >= 0) return true;
    return c.workType === 'shaken';
  }
  w.pitIsShaken = pitIsShaken;

  /* 車名の出し方。車種が空でもメーカーやナンバーがあれば出す（画像だけ空欄になっていた） */
  function pitCarLabel(c){ return String((c && (c.car || c.maker || c.plate)) || ''); }
  w.pitCarLabel = pitCarLabel;

  /* 🔴 車検の担当＝**陸運局へ行く（行った）人**（ゆうた確定 2026-08-16）。
     受付したフロント担当は**別物なので混ぜない**。決まっていなければ空欄。 */
  function pitShakenStaff(c){ var s = c && c.inspSchedule; return (s && s.resultStaff) || ''; }
  w.pitShakenStaff = pitShakenStaff;

  /* 午前／午後 */
  function pitShakenSlot(v){ return (v === 'pm') ? 'pm' : 'am'; }
  w.pitShakenSlot = pitShakenSlot;

  /* 🔴 まだ生きているカードか＝盤面に残るもの。**廃車・予約キャンセル・売上なしは出さない。**
     ⚠ 車検予定だけキャンセルを素通りさせていた（ほかの一覧は前から除外していた）。 */
  function pitCardActive(c){
    if (!c) return false;
    if (c.status === 'scrap') return false;
    if (c.status === 'cancelled' || c.cancelled === true) return false;
    if (pitCardNoSale(c)) return false;
    return true;
  }
  w.pitCardActive = pitCardActive;

  /* 画面に出す印。'' ＝これから行く／'済' ＝終わった／'再検' ＝落ちてもう一度 */
  w.PIT_SHAKEN_MARK = { decided: '', done: '済', recheck: '再検' };

  /* 🔴🔴 その日の車検予定を返す。**絞り込み・並び・中身までここで決める。**
       戻り＝[{ id, state:'decided'|'done'|'recheck', mark, slot:'am'|'pm',
                name, car, staff, div, divColor, done, card }]
     ・並び＝午前→午後 → まだ行っていないものが先 → お客様名。**どこで見ても同じ順。**
     ・cards は PitFlow なら state.cards、MHS/サーバーなら読んだカードの配列。 */
  function pitShakenOnDate(cards, iso){
    if (!iso) return [];
    var out = [];
    function row(c, state, slotRaw){
      return {
        id: c.id, card: c, state: state, mark: w.PIT_SHAKEN_MARK[state] || '',
        done: (state === 'done'), slot: pitShakenSlot(slotRaw),
        name: pitCustSurname(c), car: pitCarLabel(c),
        staff: pitShakenStaff(c),
        div: pitDivisionLabel(c), divColor: pitDivisionColor(c)
      };
    }
    (cards || []).forEach(function (c) {
      if (!c || !pitIsShaken(c) || !pitCardActive(c)) return;
      var s = c.inspSchedule;
      if (!s || typeof s !== 'object') return;
      /* ① 再検で行く／行った日（decided は空に戻っているので、ここでしか拾えない） */
      var hist = Array.isArray(s.history) ? s.history : [];
      hist.forEach(function (h) {
        if (h && h.result === 'recheck' && h.date === iso) out.push(row(c, 'recheck', h.slot));
      });
      /* ② 済んだ日。⚠ 「済を記録」で行った日を手で変えられるので resultDate が正。無ければ decided */
      if (s.result === 'done') {
        var dd = s.resultDate || s.decided;
        if (dd === iso) out.push(row(c, 'done', s.resultSlot || s.decidedSlot));
        return;
      }
      /* ③ これから行くと決めた日 */
      if (s.decided === iso) out.push(row(c, 'decided', s.decidedSlot));
    });
    out.sort(function (a, b) {
      if (a.slot !== b.slot) return a.slot === 'am' ? -1 : 1;      /* 午前が先 */
      if (a.done !== b.done) return a.done ? 1 : -1;               /* これから行くものが先 */
      return String(a.name).localeCompare(String(b.name), 'ja');   /* あとは名前順＝どこでも同じ */
    });
    return out;
  }
  w.pitShakenOnDate = pitShakenOnDate;

  /* ══════════════════════════════════════════════════════════════════════════
     🚗 代車の呼び名と、当日メモに出す1行（PitFlow v1.111.0 / MHS v1.21.0・2026-08-17）
     --------------------------------------------------------------------------
     🗣 ゆうた「当日ビューの代車バッジに代車名（ハスラー等）を欲しい」
        → モックで詰めた結果 **バッジではなく1行メモに出す**ことにした（ゆうた確定）。
           右のバッジ枠は 64px しかなく、相談・洗車と同居しているため。

     🔴🔴 きまり（とてもかんたん。ここを複雑にしないこと）
        ・当日メモが **空っぽ** → `代車：ハスラー` を出す
        ・**何か書いてある** → それをそのまま出す
        ・**全部消した**     → また空っぽなので **代車名に戻る**
        ＝ 誤って消しても、いったん全部消せば必ず元に戻る。
        ＝ だから「人が一度さわったか」を覚える必要が無い。**覚えないのが正しい。**

     🔴 見た目は **打ち込んだメモとまったく同じ**（薄くしない・点線も付けない）＝ゆうた指定。
     ⚠ 代車が付いている車は、メモを空っぽのままには**できない**（必ず代車名が出る）。
        これは「誤って消しても戻る」と表裏。ゆうた納得ずみ。
     ⚠ 番号は付けない（「ハスラー」であって「ハスラー（5）」ではない）＝ゆうた確定。
        番号付きの呼び名が要る所（代車カレンダー）は loaner.js の `_loName` のまま。**混ぜないこと。**
     ══════════════════════════════════════════════════════════════════════════ */
  /* 代車マスタ。PitFlow は state.loaners、MHS は借りた写しを差し込み口から渡す */
  function _loaners(){ try { return HOOK.loaners() || []; } catch (e) { return []; } }
  /* 🔴 代車の呼び名（車種名だけ）。**ここが本家。** loaner.js からは移設した。
     車種が未登録の代車だけ、今までどおり元の名前（「代車5」）で埋める＝空にしない。 */
  function pitLoanerModel(id){
    if (!id) return '';
    var l = _loaners().filter(function (x) { return x && x.id === id; })[0];
    if (!l) return '';
    return String(l.model || '').trim() || String(l.name || '').trim() || '';
  }
  /* 🔴🔴 v1.112.1（2026-08-17 ゆうた報告「**代車だしてない人に代車のメモが入ってる**」）
     ── **代車を出しているかどうかは `needLoaner` で決まる。`loanerId` だけを見てはいけない。**
     ⚠ 「代車：必要 → 不要」に戻しても **`loanerId` は消えない**（貸出そのものは代車カレンダーで別に取り消す作り）。
        だから `loanerId` だけを見ると、**代車を出していない車にも代車名が出る**。実際に出た。
     🔴 アプリ全体が `needLoaner` で判断している（予約詳細・ホバー・表紙の印刷ぜんぶ）。**ここも合わせる。**
     🔴 「この車に出している代車の呼び名」を聞くのは**この関数1本**。各画面で組み立てないこと。 */
  function pitLoanerOf(c){
    if (!c || !c.needLoaner) return '';      /* ← 代車を出していない車は、ここで終わり */
    return pitLoanerModel(c.loanerId);       /* まだ決まっていなければ空（＝何も出さない） */
  }
  /* 当日メモに出す既定の1行。代車を出していない／まだ決まっていなければ空。
     ⚠ 車種が未登録の代車は呼び名が「代車9」なので、そのまま頭に付けると
        **「代車：代車9」**になる。すでに「代車」で始まっていたら付けない。 */
  function pitLoanerNote(c){
    var m = pitLoanerOf(c);
    if (!m) return '';
    return (m.indexOf('代車') === 0) ? m : ('代車：' + m);
  }
  /* ══════════════════════════════════════════════════════════════════════════
     🔴🔴 v1.112.2（2026-08-17 ゆうた「まだ治ってないな」／具体例 X76098）
     ── **自動で出していた文字が、カードに本当に書き込まれてしまっていた。**
        当日メモは「押す→入力欄→どこかをクリック（＝確定）」で保存される作り。
        入力欄の初期値は**画面に出ている文字**なので、
        **押して、何も打たずに閉じただけで「代車：ハスラー」が本物の文字として保存される。**
        こうなると **表示の直し（v1.112.1）では消えない。** 実際これが残っていた。
     🔴 直しかた（2本立て）
        ① **保存しない**＝確定した文字が「自動で出していたぶんそのまま」なら、空として保存する。
           　（下の pitTodayNoteAutoLike。呼ぶ側＝当日ビューと MHS が確定の直前に通す）
        ② **すでに書き込まれてしまったものは、自動ぶんとして読み替える**＝
           　保存されている文字が自動ぶんと**1文字も違わない**なら、いまの代車で作り直す。
           　代車が無ければ**何も出さない**＝ゆうたの見ている X76098 はこれで消える。
           　さらに次に誰かがそのメモを触れば、①で**空に片付く**（掃除の道具は要らない）。
     ⚠ ②は **完全一致だけ**。「代車：ハスラー・遅れるかも」は人が書いた文字なので**触らない。**
     ══════════════════════════════════════════════════════════════════════════ */
  /* その文字は「自動で出していたぶん」そのものか（＝人が書いた文字ではないか） */
  function pitTodayNoteAutoLike(v){
    v = String(v == null ? '' : v).trim();
    if (!v) return false;
    var ls = _loaners();
    for (var i = 0; i < ls.length; i++){
      var l = ls[i]; if (!l) continue;
      var m = String(l.model || '').trim() || String(l.name || '').trim();
      if (!m) continue;
      var s = (m.indexOf('代車') === 0) ? m : ('代車：' + m);
      if (v === s) return true;          /* 🔴 完全一致だけ。後ろに何か足してあれば人の文字 */
    }
    return false;
  }
  /* 🔴 当日ビュー・MHS Todayボードが画面に出す当日メモの文字。**両方ここを通す。**
     ⚠ 返す文字が空でないからといって、保存されているとは限らない（保存は c.todayNote だけ）。
        入力欄を開く時も**この文字を初期値にする**＝一部だけ消して直せる。 */
  function pitTodayNoteText(c){
    if (!c) return '';
    var v = String(c.todayNote || '').trim();
    if (!v || pitTodayNoteAutoLike(v)) return pitLoanerNote(c);   /* ← ②の読み替え */
    return v;
  }
  /* その文字が「自動で出しているぶん」か（人が書いた文字ではないか） */
  function pitTodayNoteIsAuto(c){
    if (!c) return false;
    var v = String(c.todayNote || '').trim();
    if (v && !pitTodayNoteAutoLike(v)) return false;
    return !!pitLoanerNote(c);
  }
  /* 🔴 保存する直前に必ず通す。自動ぶんそのままなら**空**にして、カードに書き込まない。
     ＝ 押して閉じただけで文字が焼き付くのを止める／すでに焼き付いたものも触れば片付く。 */
  function pitTodayNoteToSave(v){
    return pitTodayNoteAutoLike(v) ? '' : String(v == null ? '' : v).trim();
  }
  w.pitLoanerModel     = pitLoanerModel;
  w.pitLoanerOf        = pitLoanerOf;
  w.pitLoanerNote      = pitLoanerNote;
  /* ══════════════════════════════════════════════════════════════════════════
     🏷 ナンバーの場所に出すもの（PitFlow v1.113.0 / MHS v1.22.0・2026-08-17 ゆうた指定）
     --------------------------------------------------------------------------
     🗣 ゆうた「**初回は必ずナンバーが入ってない。**だから当日ボードの
        　　　　 **初回にチェックが入っている場合は、通常ナンバーが出るところに『初回顧客』**と出したい。
        　　　　 **客自体はリピーターだが車が初めての場合は『初回車両』**
        　　　　 （＝リピーターでナンバーが入っていない場合が該当する）」

     | 予約編集の「初回／リピーター」 | ナンバー | 出すもの |
     |---|---|---|
     | **初回**       | （たいてい空） | **初回顧客** |
     | **リピーター** | 空             | **初回車両** |
     | リピーター     | 入っている     | ナンバーをそのまま |
     | **まだ選んでいない** | 空       | **何も出さない** |

     🔴 **「まだ選んでいない」を初回だと決めつけない。**
        まだ分かっていないものを代わりのもので埋めない（v1.88.0 の決めごと）。
        予約詳細の印も「選んでいなければ何も出さない」で揃っている（card-view.js の repeatBadge）。
     ⚠ 初回でナンバーが入っている珍しい時も「初回顧客」を優先する（ゆうた指定のとおり）。
     🔴 判断はここ1本。PitFlow の当日ビューも MHS の Todayボードもこれを通す。各画面で書かない。
     ══════════════════════════════════════════════════════════════════════════ */
  function pitTodayPlate(c){
    if (!c) return { text: '', kind: '' };
    var rep   = String(c.repeat || '').trim();
    var plate = String(c.plate  || '').trim();
    if (rep === 'first')                 return { text: '初回顧客', kind: 'first' };
    if (rep === 'repeater' && !plate)    return { text: '初回車両', kind: 'firstcar' };
    return { text: plate, kind: plate ? 'plate' : '' };
  }
  w.pitTodayPlate = pitTodayPlate;

  w.pitTodayNoteText     = pitTodayNoteText;
  w.pitTodayNoteIsAuto   = pitTodayNoteIsAuto;
  w.pitTodayNoteAutoLike = pitTodayNoteAutoLike;
  w.pitTodayNoteToSave   = pitTodayNoteToSave;

  console.log('[pit-share] ready（PitFlow と MHS が一緒に使う物差し）');
})(window);
