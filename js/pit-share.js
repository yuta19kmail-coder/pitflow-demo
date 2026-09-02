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
/* 🔴 v1.163.0 **自社の正式な書き方は1つだけ。**
   ⚠ 整備ソフト由来のデータには「小林モータース株式会社」「(株)小林モータース」など
      **同じ会社の書き方ちがい**が混ざる。そのまま出すと、紙の担当欄が
      「小林モータース」と「小林モータース㈱」で**行ごとに食い違う**。
   🔴 自社と分かったら、書き方は**必ずこの1つ**に寄せる（広い枠＝紙・予約詳細）。
      狭い枠は今までどおり `PIT_SELF_SHORT`（コバモ）。 */
var PIT_SELF_NAME = '小林モータース';
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
w.PIT_SELF_NAME  = PIT_SELF_NAME;
w.pitIsSelfName  = pitIsSelfName;
w.pitStaffShort  = pitStaffShort;

/* 🔴🔴 v1.127.0（ゆうた指定 2026-08-18）**担当者の名前の出し方は2つだけ。**
   🗣「車検の担当者は**カード詳細はフルネーム**で、**それ以外は通称＆苗字**にして」

   ・`pitStaffFull(name)` … **フルネーム**（CoreMembers の本名）。広い画面＝カード詳細で使う
   ・`pitStaffCall(name)` … **通称＆苗字**＝ ① 呼び名（CoreMembers の dispName。例「チーフ」「山田（太）」）
                              → ② 姓（lastName） → ③ どちらも無ければ名前の先頭のかたまり（＝苗字）
     ＝ 呼び名があればそれ、無ければ苗字。**狭い枠はぜんぶこっち。**

   ⚠ **これは 2026-08-16 の「表紙印刷の担当名」（`pitStaffPrintName`）とまったく同じ考え方。**
      別々に書くとズレるので、あちらは**この1本を呼ぶだけ**にしてある。ここを直せば紙も揃う。
   ⚠ 名簿に居ない人（退職者・整備ソフト由来）でも**必ず何か出す**＝空欄にしない。
   ⚠ 自社「小林モータース」は姓を持たないので、狭い枠では今までどおり「コバモ」。
   ⚠ MHS は名簿（CoreMembers）を持たないので、**苗字まで**しか出せない。それでよい（狭い枠だから）。 */
function _pitStaffRec(name){
  var n = String(name == null ? '' : name).trim();
  if (!n) return null;
  try { return (w.pitStaffAny ? pitStaffAny(n) : null); } catch (e) { return null; }
}
function pitStaffFull(name){
  var n = String(name == null ? '' : name).trim();
  if (!n) return '';
  var m = _pitStaffRec(n);
  if (!m) return n;
  return String(m.realName || m.name || n).trim() || n;
}
function pitStaffCall(name){
  var n = String(name == null ? '' : name).trim();
  if (!n) return '';
  if (pitIsSelfName(n)) return PIT_SELF_SHORT;         /* 自社はコバモ（人ではない） */
  var m = _pitStaffRec(n);
  if (m){
    var dn = String(m.dispName || '').trim();  if (dn) return dn;      /* ① 呼び名 */
    var ln = String(m.lastName || '').trim();  if (ln) return ln;      /* ② 姓 */
    return pitSurname(m.name || n);                                    /* ③ 苗字 */
  }
  return pitSurname(n);
}
w.pitStaffFull = pitStaffFull;
w.pitStaffCall = pitStaffCall;


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
  /* 🔴 v1.166.0（ゆうた報告「当日ビューの『決まり次第』が見切れる（MHSも）」）
     `lines` ＝ **狭い枠（当日ビューの時間の列＝62px）で2段に折るときの切り方**。
     ⚠ 5文字（決まり次第・勝手に取る）は 15px だと **76px** 必要で、**14px はみ出して隠れていた**。
     🔴 **切る場所は人がここに書く。機械に切らせない。**
        `lines` を書いていない言葉（レッカー・鍵ポスト・朝一…）は**今までどおり切らない**。
     ⚠ ここに書けば PitFlow と MHS の両方が同じ切り方になる（MHS はこの表を借りている）。 */
  { label: '決まり次第', unknown: true, lines: ['決まり', '次第'] },
  { label: 'レッカー',   unknown: true },
  { label: '鍵ポスト',   unknown: true, intakeOnly: true },
  { label: '勝手に取る', unknown: true, returnOnly: true, lines: ['勝手に', '取る'] },
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
function pitTimeParts(v){
  var s = String(v == null ? '' : v).trim();
  if (!s) return { kind: 'one', lines: [] };
  var m = s.match(/^(\d{1,2}:\d{2})\s*[-–—~〜～ー]\s*(\d{1,2}:\d{2})$/);
  if (m) return { kind: 'range', lines: [m[1], '〜', m[2]] };
  /* 🔴 v1.166.0 表に「2段の切り方」が書いてある言葉だけ折る。書いていなければ切らない。 */
  var q = pitTimeQuick(s);
  if (q && Array.isArray(q.lines) && q.lines.length > 1) return { kind: 'word2', lines: q.lines.slice() };
  return { kind: 'one', lines: [s] };
}
w.pitTimeParts = pitTimeParts;
/* 前からある呼び方（配列だけ返す）。中身は上と同じ1本。 */
function pitTimeLines(v){ return pitTimeParts(v).lines; }
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
/* 🔴 v1.168.0 **課の id から名前**（カードではなく、メンバーの所属など「カードが手元に無い所」用）。
   ⚠ これが無いと、呼ぶ側が `id === 'div1' ? '1課' : '2課'` と**字を直に書く**しかなくなる
      （＝設定で課の名前を変えた時、そこだけ古いまま。v1.92.0 で潰した形がそのまま戻る）。 */
function pitDivisionLabelById(id){
  if (!id) return '';
  const d = _divisions().find(x => x && x.id === String(id));
  return d ? String(d.label || '') : '';
}
function pitDivisionLabel(c){
  return pitDivisionLabelById(pitDivisionId(c));   /* ボタンが押されていない＝空。車から作らない */
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
/* 🔴 v1.160.0 CSS からも**同じ1本**を見られるようにする（`var(--pit-div-none)`）。
   ⚠ CSS に色を書き写すと、ここを直しても片方だけ古くなる。
      実際 v1.150.0 の「未完のグレー」で写してしまい、MHS の見張り
      （test_pit_sync「CSSに写していない」）に捕まった。**写さない・変数を使う。** */
try {
  if (typeof document !== 'undefined' && document.documentElement)
    document.documentElement.style.setProperty('--pit-div-none', PIT_DIV_NONE_COLOR);
} catch (e) {}
w.pitDivisionColorOr = pitDivisionColorOr;
w.pitDivisionId = pitDivisionId;
w.pitDivisionLabel = pitDivisionLabel;
w.pitDivisionLabelById = pitDivisionLabelById;
w.pitDivisionColor = pitDivisionColor;


  /* ===================================================================
     💤 売上なしでアーカイブした車か（v1.99.0）
     🔴 **判定はここ1か所。** 画面ごとに `c.noSale` を直に見ないこと。
     ⚠ この印が付いた車は、実績・売上・台数・メカの配分のどこにも数えない。
        期間で絞る計算をふさいでいるのは `sales-count.js`（そちらがここを呼ぶ）。
     =================================================================== */
  /* 🔴🔴 v2.6.0 **社内車両（中古・代車・内部）もここに合流させた。**
     ＝この1行で、売上ビュー・作業サマリー・整備ダッシュ・マイダッシュ・クォーター突合
       （フロントマンPDF）・データチェック・期限の見張り・アーカイブ・来店履歴 の
       **約20か所が、1行も触らずに**社内車両を外す。
     ⚠ 実績カレンダーだけは「乗せたい」ので、`result.js` を **2段（数える／数えない）** にした。
        ここに例外を書かないこと（同じ物差しなのに画面ごとに意味が違う、が一番あとで壊れる）。
     ⚠ 手で付けた `c.noSale` と、区分による社内車両は別物。区別が要る所は `pitCardIntern` を見る。 */
  function pitCardNoSale(c){
    if (!c) return false;
    if (c.noSale) return true;
    return !!(w.pitCardIntern && w.pitCardIntern(c));
  }
  w.pitCardNoSale = pitCardNoSale;

  /* 🔴🔴 v2.47.0（ゆうた報告 2026-08-31「代車から起こしたカードがアーカイブになっちゃう」）
     **「数えない」と「片付いた」は別物。**
     `pitCardNoSale` は *売上に数えるか* の物差しで、v2.6.0 から社内車両（中古・代車・内部）も
     ここに合流している。合流させたのは**集計を外すため**であって、
     「もう終わった車」という意味は**1ミリも入っていない**。
     ところが `archive-pit.js` がこれを **アーカイブ済みかの判定にそのまま使っていた**ので、
     代車から起こしたカードが**点検待ちの時点でアーカイブ済み**になっていた
     （📦の帯が出る／⋮ が「アーカイブから戻す」になる／入庫を取り消せるのが管理者だけになる）。
     🔴 **アーカイブかどうかを見たい所は、こちら（人が手で付けた印だけ）を見ること。**
     ⚠ 「集計から外すか」を見たい所は今までどおり `pitCardNoSale`。使い分けを間違えないこと。 */
  function pitCardNoSaleMarked(c){ return !!(c && c.noSale); }
  w.pitCardNoSaleMarked = pitCardNoSaleMarked;

  /* ===================================================================
     🔧 v2.49.0 **代車・自社車両の整備の予定＝ふつうの予約カード**（ゆうた確定 2026-08-31）
     -------------------------------------------------------------------
     🗣「というか表示しているのは代車作業予定ボード。という扱いにはできない？」
     🗣「候補日範囲指定と繰り返しの飛び地候補にはどう対応できる？」

     ◎形（v2.48.0 までは state.fleetEvents の別レコードだった。**カードに引っ越した。**）
       カード1枚 ＝ 作業1本（例：ハイゼットの車検）
         internKind : 'loanercar'（社内区分「代車」・v2.6.0 のまま）
         maintVehId : どの代車・社用車か
         maintYm    : どの月の目標に対するものか
         maintSpans : [{ sid, from, to }, …]  ← **飛び地の候補ぜんぶ。1枚に何本でも**
         maintFixSid: 確定した候補の sid（確定＝reserveDate が入って intakeTbd:false）
         maintSkipped: ['2026-08-31', …]      ← 「今日はやらない」を押した日
       ⚠ **カードは増やさない。**候補を3本置いてもカードは1枚＝予約カレンダーが代車で埋まらない。

     🔴 **「その日に出すか」の物差しはここ1本。** PitFlow の当日ビューも MHS の Today ボードも
        これを借りる（MHS は pit-share.js をそのまま読み込んでいる＝写しを作らない）。
     =================================================================== */
  function pitCardMaint(c){ return !!(c && c.internKind === 'loanercar' && Array.isArray(c.maintSpans)); }
  w.pitCardMaint = pitCardMaint;

  /* この整備カードは、その日に「まだ入っていないもの」として出すか。
     ◎出す条件
       ・整備カードである
       ・入庫していない（actualInAt が無い＝ふつうの予約と同じ見方）
       ・その日が候補（または確定）の期間に入っている
       ・その日を「今日はやらない」で見送っていない
     ⚠ 確定していても**期間で見る**（確定＝reserveDate はその期間の初日でしかない）。 */
  function pitMaintSpanOn(c, ds){
    if (!pitCardMaint(c)) return null;
    if (c.status !== 'reserved') return null;      /* 入庫済み以降はここには出ない */
    if (c.actualInAt) return null;                 /* 🔴 入庫した実績があるものは動かさない（v2.22.0 の決めごと） */
    if ((c.maintSkipped || []).indexOf(ds) >= 0) return null;
    var sp = null;
    (c.maintSpans || []).forEach(function(x){
      if (!x || !x.from || !x.to) return;
      if (x.from <= ds && ds <= x.to && !sp) sp = x;
    });
    if (!sp) return null;
    return { span: sp, fixed: !!(c.maintFixSid && c.maintFixSid === sp.sid) };
  }
  w.pitMaintSpanOn = pitMaintSpanOn;

  /* その日に出す整備カードを全部（PitFlow の当日ビューと MHS が同じ並びで使う）。
     ⚠ 並び＝確定が先・急ぎが先（見る人がまず知りたい順）。 */
  function pitMaintCardsOn(cards, ds){
    var out = [];
    (cards || []).forEach(function(c){
      var hit = pitMaintSpanOn(c, ds);
      if (hit) out.push({ card: c, span: hit.span, fixed: hit.fixed, urgent: !!c.urgent });
    });
    out.sort(function(a, b){ return (b.fixed - a.fixed) || (b.urgent - a.urgent); });
    return out;
  }
  w.pitMaintCardsOn = pitMaintCardsOn;

  /* ===================================================================
     🗑 v2.13.2 **もう無い機能の記録は、画面に出さない**（ゆうた 2026-08-25）
     -------------------------------------------------------------------
     🗣「支払方法に関してはアーカイブも含めて既存の表示も消したいんだけど」
     　→（聞いた）→「**画面で隠す**」
     ◎機能を切っても、**過去に人が実際にやった記録は残っている。**
       例：「完了アーカイブを直した：支払い 現金 → カード」
       消す所（＝選ぶ画面）は無くしたのに、記録だけがフローと操作ログに出続ける。
     🔴 **記録そのものは消さない。出さないだけ。**（消すのは戻せない／出さないのは戻せる）
     🔴 **見分けはここ1本。** フロー（2か所）と操作ログが同じものに聞く。
        画面ごとに「支払い」を弾く条件を書くと、次に何かを切った日に片方だけ残る。
     ⚠ 足すときは**その機能を切った版**も一緒に書くこと（あとで「なぜ隠したか」が要る）。
     =================================================================== */
  var GONE = [
    { 版: '2.13.1', 何: '支払い（現金・カード…）',
      /* 記録の形は2通りある。**どちらも「完了アーカイブを直した」＋「支払い ◯◯ → ◯◯」。**
         ・フロー   … `完了アーカイブを直した：支払い 現金 → カード`
         ・操作ログ … action=`完了アーカイブを直した` / label=`高橋 様 / ゴルフ　支払い 現金 → カード`
         ⚠ 「支払い」の3文字だけで弾かない。**入金**の記録まで巻き添えにする（保険の要）。
            「直した記録で、かつ 支払い ◯◯ → ◯◯ の形」の両方がそろった時だけ隠す。 */
      み: function (t) { return /完了アーカイブを直した/.test(t) && /支払い[^→]*→/.test(t); } }
  ];
  function pitLogGone(text){
    var t = String(text == null ? '' : text);
    if (!t) return false;
    for (var i = 0; i < GONE.length; i++){
      try { if (GONE[i].み(t)) return true; } catch (e) {}
    }
    return false;
  }
  w.pitLogGone = pitLogGone;

  /* ===================================================================
     💬 v2.13.3 **お礼LINEは、LINEが繋がっているお客様にだけ聞く**（ゆうた 2026-08-25）
     -------------------------------------------------------------------
     🗣「お礼ラインの表示とチェックを促すポップアップで、そもそも**Lステップリンクが
     　　顧客情報にあるものに限って**ほしい。無いやつは**LINEが未接続です みたいな
     　　グレーアウト**にしてほしい」
     🗣（「登録済だけど番号なし」は？と聞いた）→「**押せる**」
     ◎押しても意味の無いチェックが毎回並ぶと、**本当に要るときも素通り**するようになる。
     🔴 見るのは**顧客情報**（`cust.lineStatus`）。カードが持っているのは**引き継いだ写し**なので、
        あとからお客様がLINE登録しても写しは古いまま。**お客様が引けた時はお客様を正とする。**
     ⚠ 引けない時（仮登録・ナンバー無し）だけ、カード側の写しで見る＝行き止まりを作らない。
     🔴🔴 **灰色の理由を1つの文でごまかさない。**
        「登録済（番号なし）」の人に「LINEが未接続です」と出すのは**嘘**。
        だから状態ごとに言葉を変える（未案内／お断り）。
     ⚠ `lstepId`（Lステップ番号）は**リンクを開くための番号**であって、
        LINEが繋がっているかではない。押せる／押せないの判定に使わない。
     =================================================================== */
  function lineStatusOf(c){
    if (!c) return '';
    /* ① お客様が引けるならお客様を正とする（写しより新しい） */
    try {
      if (w.pitVehByPlate){
        var h = w.pitVehByPlate(c.plate);
        if (h && h.cust && h.cust.lineStatus != null) return String(h.cust.lineStatus || '');
      }
    } catch (e) {}
    /* ② 引けない時はカードの写し */
    return String(c.lineStatus || '');
  }
  function pitThanksLineOK(c){ return lineStatusOf(c) === 'ok'; }
  /* 押せない時に出す言葉。**押せる時は空**（言うことが無いから何も出さない） */
  function pitThanksLineWhy(c){
    var st = lineStatusOf(c);
    if (st === 'ok') return '';
    if (st === 'ng') return 'LINEお断りのお客様です';
    return 'LINEが未接続です';
  }
  w.pitThanksLineOK  = pitThanksLineOK;
  w.pitThanksLineWhy = pitThanksLineWhy;

  /* ===================================================================
     💬💬 v2.18.0 **お礼LINEを送ったか**（ゆうた 2026-08-28・ダッシュボードの送信リスト）
     -------------------------------------------------------------------
     🗣「完TEL関門時にLINEありになっている人で、今日返車した人の一覧。
     　　特に難しいカウント式みたいのは要らなくて、**チェックボックスで送ったか
     　　送ってないか確認できるぐらい**でOK」
     ◎今まで持っていたのは **要／不要（`noThanksLine`）だけ**。
       「送ったかどうか」はどこにも残っていなかった＝人の記憶頼み。
     🔴 だから印を1つだけ増やした＝**`thanksLineSent`（送った日時・押した人）**。
        要／不要とは**別物**。混ぜないこと（不要にして片づけると「送った」と読めてしまう）。
     🔴 **送る相手かどうかの物差しはここ1本**（`pitThanksNeeded`）。画面で条件を書き写さない。
        ・社内車両・売上なし … 対象外（お礼LINE そのものが無い）
        ・「不要」を選んだ人 … 対象外
        ・LINEが繋がっていない人（未案内・お断り）… 対象外
          ⚠ 完TELの窓は**初めは必ず「要」**なので、`noThanksLine` だけで拾うと
             LINEを持っていない人まで全員並ぶ（＝毎日素通りするリストになる）。
     ⚠ 書き込みは `pitThanksSetSent` 1本。押した記録はフローに残す（あとで誰がいつ、が要る）。
        MHS からは呼ばれない（`PitDB` が無ければ何もしない）。
     =================================================================== */
  /* ===================================================================
     🎨 v2.21.1 **左ラインの色＝国産グリーン／輸入ピンク。物差しはここ1本。**
     -------------------------------------------------------------------
     🗣 ゆうた 2026-08-28「左側のグリーン、ピンク線とか、バッチとか
     　　マウスオーバー車両情報とかは**これまで培ってきたもの**を載せて」
     ＝ 画面ごとに色を決め直さない。**同じ車はどこでも同じ色**。
     ⚠ カードでも 'import'/'default' の文字でも受ける（呼び方が画面ごとに違うため）。
     📌 **宿題**：この色は 2026-08-28 時点で **19か所に書き写されている**
     　 （avail / card-detail / card-view / loaner / pit-floor / reserve / result /
     　　 return / search / today / undetermined）。新しく増やさない。触った時にここへ寄せる。
     =================================================================== */
  function pitTeamColor(c){
    var t = (c && typeof c === 'object') ? (c.boardId || '') : String(c == null ? '' : c);
    return (t === 'import') ? '#ec4899' : '#1db97a';
  }
  w.pitTeamColor = pitTeamColor;

  /* ===================================================================
     🗓 v2.21.2 **予約・返車の「月ビューの1行」＝ここ1本。**
     -------------------------------------------------------------------
     🗣 ゆうた 2026-08-28「**カードの表示は予約の月ビューと同じものを使って**ほしい。
     　　長い場合は…の省略ありでOK」
     ＝ 一覧に車を並べる所は**全部この形**。画面ごとに組み立て直さない。

       ┌ 左ライン＝国産グリーン／輸入ピンク（pitTeamColor）
       │ <b>09:30</b> 池田 様 スイフト   [代][車検]
       └ 押すとカード詳細／ホバーで車両情報カード（card-hover.js の .rml-ev）

     opt … { cls:追加のclass, time:先頭の太字（false で出さない）, drag:false で掴めない,
             sideBefore:札の前に足すHTML, tail:右端に足すHTML, onclick:差し替え }
     ⚠ 中の言葉（「様」「代」）と並び（代→作業種別）は**ここでしか決めない**。
     =================================================================== */
  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (m) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m];
    });
  }
  /* ===================================================================
     🏷 v2.22.0（2026-08-28・ゆうた指定）**記録に「どの車か」を書く時の1行＝ここ1本。**
     -------------------------------------------------------------------
     🗣「予約 C63175 がタスクボードに入れて置いたのになくなる」
     ＝ 人は**予約番号で車を呼ぶ**。記録に番号が入っていないと、
        操作ログを番号で検索しても**その車の行が1つも出てこない**。
     　 かたち： [C63175] 山田 様 / タント
     ⚠ 記録（pitLog / logFlow）に車を書く時は、画面ごとに組み立てず必ずここを通すこと。
     =================================================================== */
  function pitCardTag(c){
    if (!c) return '';
    var who = (w.pitCustName ? w.pitCustName(c) : (c.customer || '')) || '';
    return (c.resNo ? '[' + c.resNo + '] ' : '')
         + (who ? who + ' 様' : '')
         + (c.car ? ' / ' + c.car : '');
  }
  w.pitCardTag = pitCardTag;

  /* ===================================================================
     📝📝 v2.22.0（2026-08-28・ゆうた指定）**予約カードの中身を直したら、記録に残す。**
     -------------------------------------------------------------------
     🗣「予約カード内部の操作も履歴に残る？」→ **残っていなかった。**
        客名・車種・TEL・受注金額・入庫日・フロント担当を全部書き換えて保存しても、
        **フロー0行・操作ログ0件**。＝ 誰がいつ何を何に変えたのか、まったく追えなかった。
        （記録が残るのは「状態が変わる操作」＝入庫・完TEL・返車・キャンセル…の20種類だけだった）
     🗣「結局こういう時に追えないのがやだなと思う」

     ◎やり方＝**開いた時の姿と、保存する時の姿を見くらべるだけ。** 新しく持つデータは無い。
        （控えは card-view.js の `editBegin` が前から取っている＝キャンセルで戻すため）

     🔴 **見くらべる欄は「人が入力する欄」だけ**（`PIT_FIX_FIELDS` の31個＋下の EXTRA）。
        ⚠ `status` / `returnStage` / `bayId` などは**入れない**。
           あれはフェーズ移動・ドラッグ側が**すでに記録している**ので、入れると同じことが2回残る。
     🔴 **欄の名前は `PIT_FIX_FIELDS`（inspect-fix.js）の1本から借りる。** ここで訳語を書き写さない。
     ⚠ 金額は「12万」ではなく**そのままの数字**で残す（あとで検算できるように）。
        長い文章（作業内容・メモ）は **30文字で切る**（記録が読めなくなるため。中身はカードにある）。
     =================================================================== */
  /* 🔴🔴 v2.22.0（ゆうた「**詳細はかなり細かいところまで拾ってくれるとうれしい**」）
     カードが持つ欄を**ぜんぶ**人の言葉にする表。`PIT_FIX_FIELDS`（31個）に無いものはここ。
     ⚠ ここに無い欄も**記録は出る**（生の名前のまま）＝ **黙って落とさない**。
     　 見かけたらこの表に足すこと。 */
  var _DIFF_EXTRA = {
    /* お客様・車 */
    sei:'姓', mei:'名', seiKana:'姓（カナ）', meiKana:'名（カナ）',
    contacts:'連絡先', customerId:'顧客控えの紐づけ', vehId:'車両の紐づけ',
    karteNo:'カルテ番号', lineStatus:'LINEの状態', lstepId:'Lステップ',
    perVisit:'来店ごとのメモ', drive:'車両の注意（左ハンドル・M/T など）',
    /* 受付・段取り */
    dropType2:'受付タイプ2', workTypes:'作業タイプ（複数）',
    workAddons:'追加の作業', workSpecials:'特別な作業', chipGroups:'作業内容の組',
    division:'課', taskStaff:'作業担当', callStaff:'完TEL担当', resvStaff:'予約担当',
    pic:'担当', picId:'担当ID', staff:'担当（旧）', mechanics:'メカニック',
    inspectors:'検査員', consult:'相談', memo:'メモ', todayNote:'当日メモ',
    tentative:'仮予約', urgent:'急ぎ', codeRed:'クレーム', intakeTbd:'入庫日 未定',
    approvalPending:'承認待ち', internKind:'社内車両の区分',
    /* 作業・整備 */
    maint:'整備チェック', parts:'部品', office:'バックオフィス後処理',
    coverCall:'完TELの印', inspSchedule:'車検の日取り', rules:'規則',
    coatingOK:'コーティング', headlight:'ヘッドライト', testDrive:'試乗',
    needWash:'洗車', washNote:'洗車の備考', handoffMemo:'引継ぎメモ', handover:'引き渡し',
    /* 代車 */
    needLoaner:'代車', loanerId:'使用代車', loanerFixed:'代車 確定',
    loanerOther:'代車（その他）', loanerReturned:'代車 返却済み',
    /* 返車・実績 */
    returnDatePlan:'返車予定日（暫定）', returnTbd:'返車日 未定',
    completeCallAt:'完TELの日', orderedAt:'受注日',
    noThanksLine:'お礼LINE 不要', thanksLineSent:'お礼LINE 送った',
    thanksLineSentAt:'お礼LINE 送った日時', thanksLineSentBy:'お礼LINE 送った人',
    /* お金 */
    estHoldDays:'概算 預かり日数', paymentSeparate:'支払い分割',
    earlyDiscount:'早期割', amountInsurance:'保険', insurancePaidAt:'保険の入金日',
    noSale:'売上なし', noSaleAt:'売上なしにした日', noSaleBy:'売上なしにした人',
    salesReq:'車販依頼', salesReqMemo:'車販依頼メモ', salesReqTouched:'車販依頼を決めた', shakenExpired:'車検切れ',
    /* 外注 */
    outsourceNote:'外注メモ'
  };
  /* 🔴 記録に出さない欄＝**人が触らないもの／画面の都合のもの**。
     ⚠ ここを増やす時は「本当に人が触らないか」を確かめること。**迷ったら出す。** */
  var _DIFF_HIDE = {
    id:1, log:1, phaseAt:1, updatedAt:1, savedAt:1, checked:1,
    innerHTML:1, scrollTop:1, ruleDict:1,
    /* 状態・置き場所＝フェーズ移動やドラッグが**すでに記録している** */
    status:1, returnStage:1, bayId:1, baySlot:1,
    archived:1, cancelled:1, cancelledAt:1, cancelledBy:1, cancelReason:1,
    noShow:1, noShowAt:1, actualInAt:1
  };
  /* 入れ子の中の項目名（整備チェックの7項目・バックオフィスの締め・完TELの印 …）。
     ⚠ 名前が引けないものは**生の名前のまま出す**（黙って落とさない）。 */
  var _DIFF_SUB = {
    maint:   { oil:'オイル入れ', rotate:'タイヤローテーション', air:'エア調整', llc:'LLC補充',
               torque:'増締め', light:'ライト', slip:'サイドスリップ', checks:'チェック' },
    office:  { invoice:'請求発行', paid:'入金確認', cost:'原価チェック', checks:'チェック' },
    coverCall:{ done:'完TEL 済', at:'完TELの日時', staff:'完TELの担当' },
    inspSchedule:{ decided:'行く日', decidedSlot:'午前／午後', cands:'候補' }
  };
  function _diffLabel(k, parent){
    if (parent && _DIFF_SUB[parent] && _DIFF_SUB[parent][k]) return _DIFF_SUB[parent][k];
    var t = (w.PIT_FIX_FIELDS || []).filter(function (f) { return f && f.id === k; })[0];
    return (t && t.label) || _DIFF_EXTRA[k] || k;
  }
  /* 🔴 **ここに入れない欄**＝すでに自分の記録を持っているもの。
     　 入れると同じことが2行になって、フローが読めなくなる。
     　 ・実績カウント日・確定返車日・売上日 … 直した時に専用の記録が出る（card-view.js / sales-date.js）
     　 ・返車予定日・返車時間 … 返車の予定を動かすと return-slot.js が記録する */
  var _DIFF_SKIP = {
    /* 直した時に専用の記録が出るもの */
    completedAt:1, returnDateFinal:1, salesDate:1, returnDate:1, returnTime:1, amountFinal:1,
    /* 🔴 **操作ボタンが書き込む「印」**。人が欄に打ち込むものではない。
       　 ＝ その操作自身が「売上なしでアーカイブした」「承認予約にした」と**もう記録している**。
       ⚠ ここを入れると、押した操作の記録のすぐ下に
       　 「編集：売上なしにした日 （空）→ 2026-08-28」のような**言い直しの行**が並ぶ（実際に並んだ）。 */
    noSale:1, noSaleAt:1, noSaleBy:1,
    thanksLineSent:1, thanksLineSentAt:1, thanksLineSentBy:1,
    approvalPending:1, tentative:1, coverCall:1,
    completeCallAt:1, orderedAt:1, loanerReturned:1
  };
  /* 🔴 v2.22.0 **決め打ちの一覧ではなく、そのカードが実際に持っている欄を全部見る。**
     　 （表に足し忘れた欄が黙って追えなくなるのを防ぐ＝いちばんやりたくないこと） */
  function _diffKeys(before, after){
    var out = {};
    [before, after].forEach(function (o) {
      Object.keys(o || {}).forEach(function (k) {
        if (k.charAt(0) === '_') return;          /* 画面の都合（_draft / _sample …） */
        if (_DIFF_HIDE[k]) return;
        if (_DIFF_SKIP[k]) return;
        out[k] = 1;
      });
    });
    return Object.keys(out);
  }
  /* 🔴 「空っぽ」の書き方は3通りある（`undefined` / `''` / `false`）。
     　 カードを開くと既定値が入るので、**書き方が変わっただけ**で「変更」に見えてしまう
     　 （実際に「お礼LINE不要 （空）→ なし」のような無意味な行が7本出た）。
     　 ＝ **どれも「空っぽ」として同じに扱う。** */
  function _emptyish(v){ return v == null || v === '' || v === false; }
  /* 相手が○×の欄なら、空っぽも「なし」と書く（（空）→ あり は読みにくい） */
  function _diffVal(v, other){
    if (typeof v === 'boolean' || typeof other === 'boolean') return v === true ? 'あり' : 'なし';
    if (v == null || v === '') return '（空）';
    if (v === true)  return 'あり';
    if (v === false) return 'なし';
    if (Array.isArray(v)) {
      if (!v.length) return '（空）';
      /* 中身がオブジェクトの並び（連絡先・部品・候補）は、字にすると読めない＝**件数**で出す */
      if (v.some(function (x) { return x && typeof x === 'object'; })) return v.length + '件';
      var t2 = v.join('・');
      return t2.length > 30 ? t2.slice(0, 30) + '…' : t2;
    }
    if (typeof v === 'object') { try { return JSON.stringify(v).slice(0, 30); } catch (e) { return '（中身）'; } }
    var t = String(v);
    return t.length > 30 ? t.slice(0, 30) + '…' : t;
  }
  function _same(a, b){
    if (_emptyish(a) && _emptyish(b)) return true;   /* 🔴 空っぽどうしは「変わっていない」 */
    if (Array.isArray(a) || Array.isArray(b)) {
      var x = a || [], y = b || [];
      if (x.length !== y.length) return false;
      /* 並びが違うだけ＝**変わっていない**（作業タイプの順番を入れ替えただけで記録が出ない） */
      var prim = function (arr) { return arr.every(function (v) { return !v || typeof v !== 'object'; }); };
      if (prim(x) && prim(y)) {
        try {
          return JSON.stringify(x.slice().map(String).sort()) === JSON.stringify(y.slice().map(String).sort());
        } catch (e) { return false; }
      }
      try { return JSON.stringify(x) === JSON.stringify(y); } catch (e) { return false; }
    }
    if (a == null && b === '') return true;
    if (b == null && a === '') return true;
    if (typeof a === 'object' || typeof b === 'object') {
      try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
    }
    return String(a == null ? '' : a) === String(b == null ? '' : b);
  }
  /* 開いた時の姿(before) と いまの姿(after) を見くらべて、変わった欄だけ返す。
     🔴 v2.22.0 **入れ子も1段おりる**（ゆうた「かなり細かいところまで拾ってくれるとうれしい」）
     　 整備チェック・バックオフィス・完TELの印・車検の日取り・連絡先は
     　 中身がオブジェクトなので、そのままだと「整備チェック {…} → {…}」としか出せない。
     　 ＝ **中の項目ごとに1行**にする： `整備チェック・オイル入れ なし → あり`
     ⚠ 配列（作業タイプ・部品など）は**入っているものを並べて**見くらべる（順番だけの入れ替えは無視）。 */
  function _isPlainObj(v){ return !!v && typeof v === 'object' && !Array.isArray(v); }
  function pitCardDiff(before, after){
    if (!before || !after) return [];
    var out = [];
    _diffKeys(before, after).forEach(function (k) {
      var a = before[k], b = after[k];
      if (_same(a, b)) return;
      if (_isPlainObj(a) || _isPlainObj(b)) {
        var sub = {};
        Object.keys(a || {}).forEach(function (kk) { sub[kk] = 1; });
        Object.keys(b || {}).forEach(function (kk) { sub[kk] = 1; });
        var kids = Object.keys(sub).filter(function (kk) {
          return kk.charAt(0) !== '_' && !_same((a || {})[kk], (b || {})[kk]);
        });
        if (kids.length) {
          kids.forEach(function (kk) {
            out.push({ key: k + '.' + kk, label: _diffLabel(k) + '・' + _diffLabel(kk, k),
                       from: _diffVal((a || {})[kk], (b || {})[kk]),
                       to:   _diffVal((b || {})[kk], (a || {})[kk]) });
          });
          return;
        }
      }
      out.push({ key: k, label: _diffLabel(k),
                 from: _diffVal(a, b), to: _diffVal(b, a) });
    });
    return out;
  }
  /* 記録に書く1行： 受注金額 120000 → 150000 */
  function pitCardDiffText(d){ return d.label + ' ' + d.from + ' → ' + d.to; }
  w.pitCardDiff     = pitCardDiff;
  w.pitCardDiffText = pitCardDiffText;

  /* 見くらべて、記録まで書く（呼ぶ側はこれ1本でよい）。戻り値＝変わった欄の数 */
  function pitLogCardEdit(card, before, opt){
    if (!card || !before) return 0;
    var ds = pitCardDiff(before, card);
    if (!ds.length) return 0;
    var auto = !!(opt && opt.auto);
    ds.forEach(function (d) {
      var txt = '編集：' + pitCardDiffText(d);
      if (auto && w.logFlowAuto) w.logFlowAuto(card, txt);
      else if (w.logFlow) w.logFlow(card, txt);
    });
    try {
      if (w.pitLog) {
        w.pitLog('予約を編集（' + ds.length + 'か所）', {
          auto: auto, cardId: card.id, kind: 'edit',
          label: pitCardTag(card) + ' / ' + ds.map(pitCardDiffText).join('、')
        });
      }
    } catch (e) {}
    return ds.length;
  }
  w.pitLogCardEdit = pitLogCardEdit;

  function pitMonthRowWt(c){
    var id = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes[0] : c.workType;
    return ((w.state && w.state.workTypes) || []).find(function (x) { return x.id === id; });
  }
  function pitMonthRow(c, opt){
    if (!c) return '';
    opt = opt || {};
    var wt = pitMonthRowWt(c);
    var side = (opt.sideBefore || '')
             + (c.needLoaner ? '<span class="rme-loaner">代</span>' : '')
             + (wt ? '<span class="rme-wt" style="color:' + wt.color + '">' + esc(wt.label) + '</span>' : '');
    var nm = (w.pitCustSurname ? w.pitCustSurname(c) : (c.customer || '')) || '（未入力）';
    return '<div class="rml-ev' + (opt.cls ? ' ' + opt.cls : '') + (c.urgent ? ' urgent' : '') + '"'
         + ' draggable="' + (opt.drag === false ? 'false' : 'true') + '"'
         + ' data-card-id="' + esc(c.id) + '"'
         + ' style="border-left-color:' + pitTeamColor(c) + '"'
         + ' onclick="' + (opt.onclick || ('openDetail(\'' + esc(c.id) + '\')')) + '">'
         + (opt.time === false ? '' : '<b>' + esc(opt.time || '--:--') + '</b> ')
         + esc(nm) + ' 様' + (c.car ? ' ' + esc(c.car) : '')
         + (side ? '<span class="rml-side">' + side + '</span>' : '')
         + (opt.tail || '')
         + '</div>';
  }
  w.pitMonthRow = pitMonthRow;

  function pitThanksNeeded(c){
    if (!c) return false;
    if (w.pitCardNoSale && w.pitCardNoSale(c)) return false;
    if (c.noThanksLine) return false;
    return pitThanksLineOK(c);
  }
  function pitThanksSent(c){ return !!(c && c.thanksLineSent); }
  function pitThanksSetSent(c, on){
    if (!c) return false;
    if (on && !pitThanksNeeded(c)) return false;      /* 画面で消すだけにしない＝書く所でも止める */
    if (on){
      var d = new Date();
      c.thanksLineSent   = true;
      c.thanksLineSentAt = (d.getMonth()+1) + '/' + d.getDate() + ' '
                         + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
      c.thanksLineSentBy = (w.pitFlowMe ? w.pitFlowMe() : '');
    } else {
      c.thanksLineSent = false;
      c.thanksLineSentAt = ''; c.thanksLineSentBy = '';
    }
    try { if (w.logFlow) w.logFlow(c, on ? 'お礼LINEを送った' : 'お礼LINEの「送った」を外した'); } catch(e){}
    try { if (w.PitDB && w.PitDB.save) w.PitDB.save(); } catch(e){}
    return true;
  }
  w.pitThanksNeeded  = pitThanksNeeded;
  w.pitThanksSent    = pitThanksSent;
  w.pitThanksSetSent = pitThanksSetSent;

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
     🔧🔧 この車に付いている作業タイプは何か（v2.9.7・ゆうた報告
          「BPを選択した時に予約詳細カードの表示が　作業　になる」）
     🔴 **ここが本家。** これから書く所は必ずこの1本を通す。

     ◎ 作業タイプの持ち方は2枠ある（card-detail.js が入れ分けている）
        c.workType    … **基本**（車検 / 12点 / 一般 / オイル）＝1つだけ
        c.workAddons  … **併用可**（B.P / 1Y / 3M / 車販依頼）＝いくつでも
        c.workTypes   … 上の2つを「基本→併用」の順に並べた**表示用の写し**
                        （card-detail.js の `_syncWorkTypes` が作る）

     ⚠ なぜ事故ったか＝**c.workType だけを見ていた**から。
        B.P・1Y・3M・車販依頼は combinable:true なので c.workAddons 側に入る。
        だから「B.Pだけ」の車は c.workType が null → 「作業」という**言い訳の文字**が出て、
        色まで一般（緑）になっていた。「車検＋B.P」でも B.P が消えていた。
     ⚠ 写し（c.workTypes）が無い古いカードもいるので、その時は2枠から自分で組み立てる。
        ここで「拾いこぼさない」ことだけを守る。見た目は呼ぶ側の仕事。
     ⚠ この関数は**並びを変えない**（基本が先・併用があと）。色は先頭のものを使う約束。
     見張り＝`test_worktype_label.mjs`
     =================================================================== */
  function pitCardWorkIds(c){
    if (!c) return [];
    if (Array.isArray(c.workTypes) && c.workTypes.length) return c.workTypes.slice();
    var out = [];
    if (c.workType) out.push(c.workType);
    (Array.isArray(c.workAddons) ? c.workAddons : []).forEach(function (a) {
      if (a && out.indexOf(a) < 0) out.push(a);
    });
    return out;
  }
  w.pitCardWorkIds = pitCardWorkIds;

  /* 名前と色まで付けて返す。マスターに無い id（消した型で入っている昔のカード）は
     id をそのまま名前にして**落とさない**（バッジが消えると「無い」と誤解されるため）。 */
  function pitCardWorkTypes(c){
    var master = (w.state && w.state.workTypes) || [];
    return pitCardWorkIds(c).map(function (id) {
      for (var i = 0; i < master.length; i++) if (master[i].id === id) return master[i];
      return { id: id, label: String(id), color: '#84cc16' };
    });
  }
  w.pitCardWorkTypes = pitCardWorkTypes;

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

  /* 🔴🔴 v1.121.0 **車両注意（左・M/T・車高・土禁）の言い方はここが本家**（2026-08-18・ゆうた指定
       「MT等の車両注意は他のカードと同じ黄色ベースの物で出してほしい」）。
     ・**左とM/Tが両方なら「左M/T」に合体**（2つ並べない）／多くても**3つまで**
     ・色は**塗りアンバー `#f59e0b`＋濃い字 `#1c1300`**。CSS 側でこの色に揃える
     ⚠ 予約カードの耳の注意タブ（`.pcm-caut`）が元の形。**ここに合わせる。**
     ⚠ ホバー詳細（card-hover.js）だけは**わざと長い言い方**（左ハンドル／M/T）なので別物。混ぜない。 */
  function pitCarCautions(c){
    var dr = (c && Array.isArray(c.drive)) ? c.drive : [], out = [];
    if (dr.indexOf('leftHand') >= 0 && dr.indexOf('mt') >= 0) out.push('左M/T');
    else { if (dr.indexOf('leftHand') >= 0) out.push('左'); if (dr.indexOf('mt') >= 0) out.push('M/T'); }
    if (dr.indexOf('lowCar')  >= 0) out.push('車高');
    if (dr.indexOf('noShoes') >= 0) out.push('土禁');
    return out.slice(0, 3);
  }
  w.pitCarCautions = pitCarCautions;
  w.PIT_CAUTION_BG = '#f59e0b';   /* 注意の塗り（耳のタブと同じ）。CSS に写す時はこの色 */
  w.PIT_CAUTION_FG = '#1c1300';

  /* ===================================================================
     🔴 v2.51.0（H・ゆうた 2026-09-01）**検切＝車検が切れている**
     -------------------------------------------------------------------
     🗣「車両注意と違うのは**車に保存しない**。この予約にだけ有効。
     　　あくまで車検切れなので、**返車するときにはそうじゃなくなっている**から」
     ＝ 左ハンドル・M/T・車高・土禁は **車ごと**の性質。検切は **この入庫ごと**。
     🔴🔴 見た目が同じタブなので、**車両属性（c.drive）の側に足さないこと。**
     　 足すと、一度車検切れで入庫した車が、次に来た時も車検切れのまま出る。
     ⚠ 入口は予約詳細の「表紙チェック」のトグル1つ。**予約の段階では行そのものを出さない**
        （入庫してから。まだ入庫していない車の車検が切れているかは、その時にならないと分からない）。
     =================================================================== */
  function pitCardExpired(c){ return !!(c && c.shakenExpired); }
  w.pitCardExpired = pitCardExpired;
  w.PIT_EXPIRED_BG = '#ef4444';   /* 検切の塗り（赤）。CSS に写す時はこの色 */
  w.PIT_EXPIRED_FG = '#ffffff';

  /* 短い言い方（狭い所で4つ以上並ぶ時だけ使う） */
  var PIT_TAB_SHORT = { '検切':'切', '車高':'高', '土禁':'土', '左M/T':'左MT' };
  w.PIT_TAB_SHORT = PIT_TAB_SHORT;

  /* 🔴 耳のタブ・車検予定・ホバー・予約詳細が**全部ここを見る**。
     返すのは [{ label, exp }]。exp:true が検切（赤）、false が車両注意（黄）。
     opt.narrow … 狭い所（耳のタブ・車検予定の1行）で true。
        **4つ以上になったら1文字ずつに縮める。押し出して消さない**（ゆうた 2026-09-01）。
     ⚠ ホバーと予約詳細では narrow を渡さない＝「検切」のまま出す。 */
  function pitCardTabs(c, opt){
    opt = opt || {};
    var out = [];
    if (pitCardExpired(c)) out.push({ label:'検切', exp:true });
    pitCarCautions(c).forEach(function(x){ out.push({ label:x, exp:false }); });
    if (opt.narrow && out.length >= 4){
      out = out.map(function(o){ return { label: PIT_TAB_SHORT[o.label] || o.label, exp:o.exp }; });
    }
    return out;
  }
  w.pitCardTabs = pitCardTabs;

  /* ===================================================================
     🏷 v2.51.0（A-5・ゆうた 2026-09-01）**作業タイプ＋付加の言い換え**
     -------------------------------------------------------------------
     🗣「Bp+保険が選ばれたとき、コンパクトビューは 保険板金 に名前が変わる」
     🗣「その要領で 一般+保証 → 保証修理」
     ◎なぜ要るか＝**コンパクトなカードには付加（保証・保険・社員）の札がそもそも出ない**
       （出るのはホバーと予約詳細だけ）。だから作業タイプの名前に混ぜて伝える。
     🔴🔴 **名前を変える所と、付加のバッジを消す所が、この表1つを見ること。**
     　 片方だけ直すと「保証修理なのに保証バッジも出る」が起きる。
     ⚠ 表に無い組み合わせは何も起きない（一般＋保険は「一般」＋「保険」のまま）。
     ⚠ ホバーは**言い換えない**（ゆうた「ホバーだけ俯瞰して全データを見るイメージ」）。
     =================================================================== */
  var PIT_WT_PAIRS = [
    { work:'bp',      special:'insurance', label:'保険板金' },
    { work:'general', special:'warranty',  label:'保証修理' }
  ];
  w.PIT_WT_PAIRS = PIT_WT_PAIRS;

  /* 当てはまる組み合わせを返す（無ければ null）。カード1枚に1つだけ当たる想定 */
  function pitWtPair(c){
    if (!c) return null;
    var ids = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes
            : (c.workType ? [c.workType] : []);
    var sp  = Array.isArray(c.workSpecials) ? c.workSpecials : [];
    var hit = null;
    PIT_WT_PAIRS.forEach(function(x){
      if (!hit && ids.indexOf(x.work) >= 0 && sp.indexOf(x.special) >= 0) hit = x;
    });
    return hit;
  }
  w.pitWtPair = pitWtPair;

  /* 作業タイプ1つぶんの、その場で出す名前。組み合わせに当たっていれば言い換える */
  function pitWtLabel(c, id, master){
    var pair = pitWtPair(c);
    if (pair && pair.work === id) return pair.label;
    var m = (master || []).find(function(x){ return x.id === id; });
    return m ? m.label : id;
  }
  w.pitWtLabel = pitWtLabel;

  /* 言い換えに使われた付加は、その画面ではバッジを出さない（二重に言わない） */
  function pitSpecialHidden(c, id){
    var pair = pitWtPair(c);
    return !!(pair && pair.special === id);
  }
  w.pitSpecialHidden = pitSpecialHidden;

  /* ===================================================================
     💰 v2.51.0（D-1・ゆうた 2026-09-01）**車販部署が動けるか＝受注が取れたか**
     -------------------------------------------------------------------
     🗣「バッジにしろ工程にしろ**受注後に発生**でしょ？受注前には結局は手はかけられない
     　　んだから、まだ直近1か月にいていい。**受注が取れた段階で車販部署としても実際に
     　　動ける**わけだから、コーティング・その他依頼に入れば成立しない？」
     🔴 **バッジと工程の印は重複ではなく、同じ1つのことの前半と後半だった。**
     　 ・作業タイプの「車販依頼」バッジ … 予定側（拾い上げて予定を組む）
     　 ・工程の窓の「その他 車販依頼」   … 受注側（受注が取れた＝動ける）
     ＝ 段を分ける軸は**受注が取れたか**の1本。入庫したかどうかでは分けない。
     =================================================================== */
  function pitCarSalesOrdered(c){ return !!(c && (c.coatingOK || c.salesReq)); }
  w.pitCarSalesOrdered = pitCarSalesOrdered;

  /* ===================================================================
     📦 v2.51.0（G・ゆうた 2026-09-01）**物販＝物だけを売った時**
     -------------------------------------------------------------------
     🔴🔴 **中古（社内区分）と混ぜないこと。**
     　 「常に単独で立つ」という見た目は中古そっくりだが、**物販は売上が立ち、実績にも入る**。
     　 `pitCardNoSale`（売上に数えない側）へ合流させると、**物販まで売上から静かに消える**。
     　 画面では何も起きないので気づけない。ここは必ず別の物差しにしておくこと。
     ⚠ 物販のときに出さないもの … 作業者（点検/整備担当）・洗車・車販部門への依頼
     ⚠ データチェックから外すもの … メーカー・車種。**課（国産/輸入）は外さない**
        （🗣「課は売上の計でずれるからどちらかに振るようにしよう」）
     =================================================================== */
  function pitCardGoods(c){
    if (!c) return false;
    var ids = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes
            : (c.workType ? [c.workType] : []);
    return ids.indexOf('goods') >= 0;
  }
  w.pitCardGoods = pitCardGoods;

  /* 🔴 車検の担当＝**陸運局へ車を持って行く（行った）人＝回送の担当**
     （ゆうた確定 2026-08-16／2026-08-18「担当者というのは実際に車検に行く、回送の担当者ね」）。
     受付したフロント担当は**別物なので混ぜない**。決まっていなければ空欄。
     ⚠ v1.119.0 から**決めた時点でも入れられる**（前は「済」を記録する時だけだった）。
        入れ物は同じ `resultStaff` 1つ＝MHS の当日ビューと前日LINEの画像に、**前もって名前が出る**。 */
  function pitShakenStaff(c){ var s = c && c.inspSchedule; return (s && s.resultStaff) || ''; }
  w.pitShakenStaff = pitShakenStaff;
  /* 🔴 v1.127.0（ゆうた指定）**カード詳細はフルネーム／それ以外は通称＆苗字。**
     ⚠ 入っている中身（`resultStaff`）は今までどおり触らない。**出す時だけ**変える。 */
  function pitShakenStaffFull(c){ return w.pitStaffFull ? pitStaffFull(pitShakenStaff(c)) : pitShakenStaff(c); }
  function pitShakenStaffCall(c){ return w.pitStaffCall ? pitStaffCall(pitShakenStaff(c)) : pitShakenStaff(c); }
  w.pitShakenStaffFull = pitShakenStaffFull;
  w.pitShakenStaffCall = pitShakenStaffCall;

  /* 🔴 v1.119.0 どこの陸運局へ行くか／何ラウンドか（2026-08-18・ゆうた指定）
     ・`inspSchedule.office`     … CoreMembers の場所マスターの id（**陸運支局のバッジが付いた場所**）
     ・`inspSchedule.officeName` … その名前の**写し**。⚠ 出す時は本家（CoreMembers）が優先。
        写しは「場所が消された・名前が変わった」時に過去の記録が空欄にならないための後ろ盾だけ。
     ・`inspSchedule.round`      … ラウンド 1〜4（陸運局の受付の回）。数字で持つ。空・0＝未定
     ⚠ 決まっていなくても決定できる（ゆうた確定）。空の時は画面に「未定」の印を出す。 */
  function pitShakenOffice(c){
    var s = c && c.inspSchedule; if (!s || !s.office) return '';
    var live = w.pitLocName ? pitLocName(s.office) : '';
    return live || String(s.officeName || '');
  }
  /* 🔴🔴 v1.129.0（ゆうた指定 2026-08-18）**陸運局も担当者と同じ2つの出し方。**
     🗣「さっきのフルネームと同じで、省略表示は **野田** とか **習志野** とか**地名だけ**でいいよ」

     ・広い画面（カード詳細・ホバー情報カード）… **正式名のまま**（`pitShakenOffice`）
     ・狭い枠（車検予定のチップ・MHS・前日LINE）… **地名だけ**（`pitLocShort`）
       例）野田自動車検査登録事務所 → **野田** ／ 習志野自動車検査登録事務所 → **習志野**
           千葉運輸支局 → **千葉**

     ⚠ やり方は「**後ろのお決まりの言葉を落とすだけ**」。CoreMembers の名前を書き換えたりはしない。
     ⚠ 落とすものが1つも無ければ**そのまま**出す（知らない書き方でも空にしない）。
     ⚠ うしろの（かっこ書き）も落とす。例）野田自動車検査登録事務所（千葉）→ 野田 */
  var _PIT_LOC_TAIL = /(自動車検査登録事務所|自動車検査場|検査登録事務所|自動車検査協会|運輸監理部|運輸支局|陸運支局|陸運局|運輸局|支局|事務所|検査場)$/;
  function pitLocShort(name){
    var n = String(name == null ? '' : name).trim();
    if (!n) return '';
    var t = n.replace(/[（(][^）)]*[）)]\s*$/, '').trim();
    var s2 = t.replace(_PIT_LOC_TAIL, '').trim();
    return s2 || t || n;
  }
  function pitShakenOfficeShort(c){ return pitLocShort(pitShakenOffice(c)); }
  w.pitLocShort           = pitLocShort;
  w.pitShakenOfficeShort  = pitShakenOfficeShort;

  /* 🔴🔴 v1.130.0（ゆうた指定 2026-08-18）**当日ビュー／MHS の当日に出す車検の1行。**
     🗣「車検予定の **車検・客名・車種・ナンバーの下4桁・車検担当者・陸運局・R** の情報を
        当日ビューや MHS の当日に表示できるように。
        現状車検枠で『車検』だけだが、**ゆくゆくは名変とかも入るようにしたい**ため頭に車検を付けてほしい」

     🔴 **頭の「車検」は“種類”**。名変・抹消などが増えたら、ここに種類を足していく。
        ⚠ 枠の名前（車検枠）ではなく**1行ごとの種類**として出すこと。混ぜると増やせなくなる。
     🔴 **並びと中身はこの1本。** PitFlow の当日ビューと MHS の当日で**同じ順・同じ中身**にする。
        片方に書き足さない。 */
  w.PIT_SHAKEN_KIND = '車検';
  /* ナンバーの下4桁。⚠「野田 500 あ 12-34」「…1234」どちらでも数字だけ拾って後ろ4つ。 */
  function pitPlate4(c){
    var p = String((c && c.plate) || '').trim();
    if (!p) return '';
    var d = p.replace(/[０-９]/g, function (x) { return String.fromCharCode(x.charCodeAt(0) - 0xFEE0); })
             .replace(/[^0-9]/g, '');
    return d ? d.slice(-4) : '';
  }
  w.pitPlate4 = pitPlate4;
  function pitShakenRound(c){
    var s = c && c.inspSchedule, n = s ? Number(s.round) : 0;
    return (n >= 1 && n <= 4) ? n : 0;
  }
  w.pitShakenOffice   = pitShakenOffice;
  w.pitShakenRound    = pitShakenRound;
  w.PIT_SHAKEN_ROUNDS = [1, 2, 3, 4];

  /* 午前／午後 */
  function pitShakenSlot(v){ return (v === 'pm') ? 'pm' : 'am'; }
  w.pitShakenSlot = pitShakenSlot;

  /* ===================================================================
     🚫 v1.165.0 **車検の日として「行けない日」の物差し。**（2026-08-21）
     -------------------------------------------------------------------
     ◎車検の日には**2種類の休み**があって、意味がまるで違う。
       ・**陸運局が休み**（土・日・祝）… 会社が開いていても**持って行けない**
       ・**自社が定休**（MHS の定休日カレンダー）… 陸運局は開いているが**うちが動けない**
     🔴 **この見分けはここ1本。** 画面ごとに曜日を数えたり `PitCal` を呼び直したりしない。
     ⚠ 直す前は **card-view.js（車検の日を選ぶカレンダー）と shaken.js（車検予定）に
        同じ判定が2つ**あり、言葉も `'陸運局休'` と `'休'` で食い違っていた。

     戻り値
       { off:真偽, kind:'holiday'|'sun'|'sat'|'shop'|'', label:長い言い方, short:狭い枠用, holiName:祝日の名前 }
       ・順番＝**祝日 → 日 → 土 → 自社定休**（重なった時にどちらを言うかを固定する）
       ・`kind==='shop'` の時だけ **MHS に入っている理由**（お盆休み・臨時休業…）が label に出る
     ⚠ 過去の日付は MHS のカレンダーの範囲外になることがあり、その時は
        **定休曜日だけの予備判断**になる（PitCal がそう決めている）。ここでは足さない。 */
  function pitShakenDayOff(iso){
    var out = { off:false, kind:'', label:'', short:'', holiName:null };
    var s = String(iso == null ? '' : iso);
    if (!s) return out;
    var d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return out;
    var H = w.Holidays;
    if (H && H.is && H.is(s)){
      out.off = true; out.kind = 'holiday'; out.label = '祝・休'; out.short = '休';
      out.holiName = (H.name ? H.name(s) : null);
      return out;
    }
    var dow = d.getDay();
    if (dow === 0 || dow === 6){
      out.off = true; out.kind = (dow === 0 ? 'sun' : 'sat');
      out.label = '陸運局休'; out.short = '休';
      return out;
    }
    if (w.PitCal && w.PitCal.isClosed && w.PitCal.isClosed(s)){
      var note = (w.PitCal.label ? w.PitCal.label(s) : '') || '';
      out.off = true; out.kind = 'shop';
      out.label = note || '自社定休';
      out.short = note || '定休';
      return out;
    }
    return out;
  }
  w.pitShakenDayOff = pitShakenDayOff;

  /* ===================================================================
     🏷 v1.164.0（ゆうた指摘 2026-08-21）**「予約キャンセル」と「未入庫」は別物。**
     -------------------------------------------------------------------
     🗣「予約キャンセルと未入庫は素直に行動が、というか意味合いが違くない？ たしか決めたよ」

     決まっているとおり（v1.101.0 ゆうた指定）──
       ・**予約キャンセル**（`c.cancelled === true`）… **人が「やめます」と決めた。**
         来店履歴に残す／代車の予定も一緒に外す
       ・**未入庫**（それ以外＝`noShow`）……………… **来なかっただけ。**
         来店履歴には出さない／代車の予定は残す（勘違いで来ることがあるため）

     ◎ここに置いた理由（実際に起きていたこと）
       入れ物（`status`）は**どちらも `'cancelled'` の1つ**で、見分けは `c.cancelled` の印。
       ところが状態の言葉を出す `statusLabel(s)` は**状態の文字しか受け取らない**ので
       見分けようがなく、**画面の札に英語で「cancelled」と出ていた**（2026-08-21 確認）。
     🔴 **カードの状態を画面に出す時は、状態の文字ではなく「カードごと」この1本に渡すこと。**
     ⚠ 言葉をここ以外に書かない（アーカイブの帯・検索・カード詳細で食い違わせない）。 */
  var PIT_CANCEL_TEXT = { user: '予約キャンセル', noShow: '未入庫' };
  function pitCancelKind(c){ return (c && c.cancelled) ? 'user' : 'noShow'; }
  function pitCancelText(c){ return PIT_CANCEL_TEXT[pitCancelKind(c)]; }
  function pitCardStatusText(c){
    if (!c) return '';
    if (c.status === 'cancelled') return pitCancelText(c);
    return w.statusLabel ? w.statusLabel(c.status) : String(c.status == null ? '' : c.status);
  }
  w.PIT_CANCEL_TEXT    = PIT_CANCEL_TEXT;
  w.pitCancelKind      = pitCancelKind;
  w.pitCancelText      = pitCancelText;
  w.pitCardStatusText  = pitCardStatusText;

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
                kind:'車検', name, car, plate4, staff, office（地名だけ）, round, div, divColor, done, card }]
       ⚠ v1.119.0 で `office`（どこの陸運局）と `round`（何R・0＝未定）を**足した**。
          いま使っているのは PitFlow の車検予定だけ。MHS・LINEの画像は使っていないが、
          使いたくなった時に**条件をあちらに書き写さないで済む**ように、ここから配る。
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
        /* 🔴 v1.130.0 当日ビュー／MHS の当日で出すもの（種類・ナンバー下4桁）も一緒に配る */
        kind: w.PIT_SHAKEN_KIND, plate4: pitPlate4(c),
        /* 🔴 v1.127.0 ここに乗るのは**通称＆苗字**（狭い枠に出るものだから）。
           ⚠ MHS・前日LINEの画像もこれを使う。フルネームが要るのはカード詳細だけ。 */
        staff: pitShakenStaffCall(c),
        /* 🔴 v1.129.0 陸運局も**地名だけ**（狭い枠に出るものだから）。正式名はカード詳細・ホバーで出す。 */
        office: pitShakenOfficeShort(c), round: pitShakenRound(c),
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
     🔧 車検の予定を「動かす」ときの物差し（v1.160.0・2026-08-20 ゆうた指定）
     --------------------------------------------------------------------------
     🗣 ゆうた「**MHSに出てる当日の車検車両、入庫返車と同じように、
     　　PitFlow上でクリックしたときに出る、担当から陸運局から午後に変更、
     　　車検をキャンセルまでをクリックできるように**」

     🔴🔴 **PitFlow の車検予定ボードと MHS の当日ボードで、同じ答えになること。**
        画面が2つに増えた瞬間、片方だけ直して食い違うのが今までのやられ方
        （2026-08-15 の「時間の表・お名前・課・売上なし」がまさにそれ）。
        ＝ **どう変わるかは、この関数1本**。shaken.js も MHS もここを呼ぶだけにする。

     ◎渡すもの
       insp … いまの `card.inspSchedule`（無ければ null でよい）
       act  … 'done'（✓完了）／'recheck'（↺再検）／'flip'（午前⇄午後）
               ／'cancel'（予定を取り消す）／'reopen'（済 → 予定に戻す）
       opt  … { staff, office, officeName, round, today, note }
               🔴 at / patch / restore ＝ **再検の記録1本を指す・直す**（v2.55.0・'reedit' と 'redrop' だけ）。
                  at      … { i:何番目, date:'YYYY-MM-DD', slot:'am'|'pm' }
                            🔴 **番号だけで指さない。** 開いた時の日と時間帯も一緒に渡して、
                               合わなければ**何もしないで null を返す**。
                               ＝ 別の端末が先に直していた時に、違う行を消さないための関門
                               （v2.24.0「古い画面が他人の作業をまるごと消す」と同じ筋）。
                  patch   … 直す中身 { date, slot, staff, office, officeName, round, note }（'reedit'）
                  restore … true ＝ 取り消した記録の日を「決定」に戻す（'redrop'）。
                            ⚠ **すでに別の日で決め直していたら戻さない**（今の予定を上書きしない）。
               🔴 note ＝ **再検の理由（1行）**。v2.54.0 で追加（ゆうた指定
                  「再検のチェック時→1行でいいからその内容をかけるようにする」）。
                  ⚠ 使うのは 'recheck' の時だけ。ほかの指示では見ない。
               ⚠ 窓に出ている担当・陸運局・R も**一緒に確定する**（別々に保存させない）。
     ◎返すもの
       { insp: 新しい inspSchedule, log: フローに残す1行, act: 受け取った act }
       ⚠ **渡した insp は書き換えない**（写しを作って返す）。呼ぶ側が入れ替える。

     ⚠ 'tocand'（候補＝行ける日に戻す）は**ここには無い**。
        あれは PitFlow のガント（行ける日の枠）を触る操作で、
        🔴 ゆうた「**候補に戻すは MHS 上だと分からないので要らない**」＝MHSには出さない。
        PitFlow 側は今までどおり shaken.js の `unassign` が受け持つ。
     ══════════════════════════════════════════════════════════════════════════ */
  /* 🔴 v2.55.0（ゆうた指定 2026-09-02）**再検の記録そのものを、あとから直す・取り消す。**
     'reedit' … 再検の記録1本の中身（日・時間帯・担当・陸運局・R・理由）を直す
     'redrop' … 再検の記録1本を取り消す（opt.restore で、その日を「決定」に戻せる） */
  var PIT_SHAKEN_ACTS = ['done', 'recheck', 'flip', 'cancel', 'reopen', 'reedit', 'redrop'];
  w.PIT_SHAKEN_ACTS = PIT_SHAKEN_ACTS;

  function _shkSlotT(sl){ return sl === 'pm' ? '午後' : '午前'; }
  function _shkMD(iso){
    if (!iso) return '';
    var d = new Date(String(iso) + 'T00:00:00');
    return isNaN(d.getTime()) ? '' : ((d.getMonth() + 1) + '/' + d.getDate());
  }
  function _shkToday(){
    var t = new Date(); t.setHours(0, 0, 0, 0);
    var q = function(n){ return (n < 10 ? '0' : '') + n; };
    return t.getFullYear() + '-' + q(t.getMonth() + 1) + '-' + q(t.getDate());
  }

  function pitShakenApply(insp, act, opt){
    opt = opt || {};
    if (PIT_SHAKEN_ACTS.indexOf(act) < 0) return null;   /* 知らない指示では何もしない */
    /* 写しを作る（渡されたものは触らない）。history は中身も配列ごと作り直す。 */
    var s = {};
    for (var k in (insp || {})) if (Object.prototype.hasOwnProperty.call(insp, k)) s[k] = insp[k];
    if (!s.slots || typeof s.slots !== 'object') s.slots = {};
    s.history = Array.isArray(s.history) ? s.history.slice() : [];
    if (!s.mode) s.mode = 'manual';
    if (s.cutBefore == null) s.cutBefore = '';

    /* ══ 🔴 v2.55.0 再検の記録1本を直す／取り消す ══
       ⚠ この2つは**下の「窓に出ている担当・陸運局・R を一緒に確定する」に乗せない。**
          直すのは**その記録の中身**であって、車のいまの陸運局やRではない（混ぜると別物が書き換わる）。 */
    if (act === 'reedit' || act === 'redrop'){
      var at = opt.at || {};
      var ix = Number(at.i);
      var row = s.history[ix];
      if (!row || row.result !== 'recheck') return null;                       /* もう無い */
      if (at.date && row.date !== at.date) return null;                        /* 先に誰かが直した */
      if (at.slot && (row.slot === 'pm' ? 'pm' : 'am') !== (at.slot === 'pm' ? 'pm' : 'am')) return null;
      if (act === 'reedit'){
        var q = opt.patch || {}, r2 = {};
        for (var k2 in row) if (Object.prototype.hasOwnProperty.call(row, k2)) r2[k2] = row[k2];
        if (q.date != null && /^\d{4}-\d{2}-\d{2}$/.test(String(q.date))) r2.date = String(q.date);
        if (q.slot != null) r2.slot = (q.slot === 'pm') ? 'pm' : 'am';
        if (q.staff != null) r2.staff = String(q.staff);
        if (q.office != null){
          r2.office = String(q.office || '');
          r2.officeName = r2.office ? String(q.officeName || r2.officeName || '') : '';
        }
        if (q.round != null){ var rn = Number(q.round || 0); r2.round = (rn >= 1 && rn <= 4) ? rn : 0; }
        if (q.note != null) r2.note = String(q.note).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 120);
        s.history[ix] = r2;
        return { insp: s, act: act,
                 log: '車検 再検の記録を直した ' + _shkMD(r2.date) + ' ' + _shkSlotT(r2.slot)
                      + '（回送:' + (r2.staff || '—') + '／' + (r2.officeName || '陸運局未定')
                      + '／' + (r2.round ? r2.round + 'R' : 'R未定') + '）' + (r2.note ? '／' + r2.note : '') };
      }
      s.history.splice(ix, 1);
      /* 🔴 押し間違いを「押す前の姿」に戻す（ゆうた確定 2026-09-02）。
         ⚠ ただし**もう別の日で決め直している／済んでいる時は戻さない**。今の予定を上書きしない。 */
      var back = false;
      if (opt.restore && !s.decided && s.result !== 'done'){
        s.decided = row.date; s.decidedSlot = (row.slot === 'pm') ? 'pm' : 'am';
        if (row.staff) s.resultStaff = row.staff;
        back = true;
      }
      return { insp: s, act: act,
               log: '車検 再検の記録を取り消した（' + _shkMD(row.date) + ' ' + _shkSlotT(row.slot) + '）'
                    + (back ? '／予定に戻した' : '') };
    }

    var today = opt.today || _shkToday();
    /* 🔴 窓に出ている3つは、どの指示でも一緒に確定する（v1.119.0 の決めごとをそのまま） */
    var staff = (opt.staff != null) ? String(opt.staff) : (s.resultStaff || '');
    if (opt.office != null){
      s.office = String(opt.office || '');
      s.officeName = s.office ? String(opt.officeName || s.officeName || '') : '';
    }
    if (opt.round != null){
      var r = Number(opt.round || 0);
      s.round = (r >= 1 && r <= 4) ? r : 0;
    }
    var wh = '（回送:' + (staff || '—') + '／' + (s.officeName || '陸運局未定')
           + '／' + (s.round ? s.round + 'R' : 'R未定') + '）';
    var log = '';

    if (act === 'done'){
      var d = s.decided || today, sl = s.decidedSlot || 'am';
      s.result = 'done'; s.resultDate = d; s.resultSlot = sl; s.resultStaff = staff;
      log = '車検 済 ' + _shkMD(d) + ' ' + _shkSlotT(sl) + wh;
    } else if (act === 'recheck'){
      var d2 = s.decided || today, sl2 = s.decidedSlot || 'am';
      /* ⚠ その時どこへ誰が行って何Rだったかを残す（あとから振り返れるように） */
      /* 🔴 v2.54.0 **落ちた理由を1行だけ**（ゆうた指定）。改行は潰して1行にする。
         ⚠ 長さは120字で切る＝履歴は狭い所に何行も並ぶので、書ける量そのもので抑える。 */
      var note2 = (opt.note != null) ? String(opt.note).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 120) : '';
      s.history.push({ date: d2, slot: sl2, result: 'recheck', staff: staff,
                       office: s.office || '', officeName: s.officeName || '', round: s.round || 0,
                       note: note2 });
      s.decided = ''; s.decidedSlot = ''; s.result = ''; s.resultDate = ''; s.resultSlot = ''; s.resultStaff = '';
      /* ⚠ 陸運局とRは**残す**＝次に決め直す時、たいてい同じ所へ行くので入れ直させない */
      log = '車検 再検 ' + _shkMD(d2) + ' ' + _shkSlotT(sl2) + wh + (note2 ? '／' + note2 : '');
    } else if (act === 'cancel'){
      var d3 = s.decided || '', sl3 = s.decidedSlot || '';
      s.decided = ''; s.decidedSlot = ''; s.result = ''; s.resultDate = ''; s.resultSlot = '';
      log = '車検の予定を取り消し' + (d3 ? '（' + _shkMD(d3) + ' ' + _shkSlotT(sl3) + '）' : '');
    } else if (act === 'reopen'){
      s.result = ''; s.resultDate = ''; s.resultSlot = ''; s.resultStaff = '';
      log = '車検を予定に戻した';
    } else if (act === 'flip'){
      s.decidedSlot = (s.decidedSlot === 'pm') ? 'am' : 'pm';
      log = '車検の予定を' + _shkSlotT(s.decidedSlot) + 'に変更' + (s.decided ? '（' + _shkMD(s.decided) + '）' : '');
    }
    /* 🔴 v1.160.0 窓に出ている**担当も、陸運局・Rと同じように一緒に確定する**。
       ⚠ v1.119.0 の決めごと（3つを別々に保存させない）に担当だけ抜けていて、
          「担当を選んでから “午後に変更” を押すと担当が消える」状態だった。
       ⚠ 再検・予定に戻す は**わざと担当を空にする**指示なので、ここでは戻さない。 */
    if (opt.staff != null && act !== 'recheck' && act !== 'reopen') s.resultStaff = staff;
    /* 🔴 v2.54.0 **暫定予定（仮押さえ）は、決まった・終わった・取り消した で必ず落とす。**
       ⚠ 残すと「決定と暫定が両方ある」状態ができて、どちらが本当か読めなくなる。 */
    if (act === 'done' || act === 'recheck' || act === 'cancel'){ s.tent = ''; s.tentSlot = ''; }
    return { insp: s, log: log, act: act };
  }
  w.pitShakenApply = pitShakenApply;

  /* ══════════════════════════════════════════════════════════════════════════
     🅿 v2.54.0（ゆうた指定 2026-09-02）**暫定予定＝仮押さえ止まり。**
     -------------------------------------------------------------------------
     🗣「車種×日の１セルに対してクリックする事で暫定予定として
     　　上の決定カードのような形のものを下にも設置できるようにする」
     🗣（どこまでのものか）「**仮押さえ止まり**」＝上の「決定」へ運んで初めて本決まり。

     ◎決めごと（ゆうた確定）
       🔴 **1台につき1つだけ。** 別のマスを押したら、そこへ**移る**（増えない）
       🔴 **同じマスをもう一度押したら外れる**
       🔴 **まだ決まっていない車だけ。** 決定ずみ・済の車には置けない
          （置けると「決定と暫定のどちらが本当か」が読めなくなる）
       🔴🔴 **ここから先へは出さない。** MHS・当日ビュー・前日LINE・予約カレンダーは
          `decided` と `result` しか見ていないので、暫定を足しても**何も出ないのが正しい**。
          ＝ 暫定を「その日に行く」と読ませたくなったら、それは**決定へ上げる時**。
          ⚠ ここを他の画面に出したくなったら、必ず先に相談すること。仮押さえの意味が消える。

     ◎渡すもの  insp（いまの inspSchedule）／iso（YYYY-MM-DD）／slot（'am'|'pm'）
     ◎返すもの  { insp, log, on }  on=true ＝置いた／false ＝外した。置けない時は null
     ⚠ 渡した insp は書き換えない（写しを返す）。呼ぶ側が入れ替える。
     ══════════════════════════════════════════════════════════════════════════ */
  function pitShakenTent(insp, iso, slot){
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return null;
    var s = {};
    for (var k in (insp || {})) if (Object.prototype.hasOwnProperty.call(insp, k)) s[k] = insp[k];
    if (!s.slots || typeof s.slots !== 'object') s.slots = {};
    s.history = Array.isArray(s.history) ? s.history.slice() : [];
    if (s.decided || s.result === 'done') return null;   /* 決まっている車には置かない */
    var sl = (slot === 'pm') ? 'pm' : 'am';
    if (s.tent === iso && (s.tentSlot === 'pm' ? 'pm' : 'am') === sl){
      s.tent = ''; s.tentSlot = '';
      return { insp: s, log: '車検の暫定予定を外した（' + _shkMD(iso) + ' ' + _shkSlotT(sl) + '）', on: false };
    }
    var moved = !!s.tent;
    s.tent = iso; s.tentSlot = sl;
    return { insp: s, on: true,
             log: '車検の暫定予定' + (moved ? 'を動かした' : '') + '（' + _shkMD(iso) + ' ' + _shkSlotT(sl) + '）' };
  }
  w.pitShakenTent = pitShakenTent;

  /* 暫定予定の読み出し（無ければ null）。画面はこの1本で読む。
     ⚠ 決定ずみ・済の車は null を返す＝古い暫定が残っていても画面には出さない（保険）。 */
  function pitShakenTentOf(insp){
    var s = insp || {};
    if (!s.tent || s.decided || s.result === 'done') return null;
    return { date: s.tent, slot: (s.tentSlot === 'pm') ? 'pm' : 'am' };
  }
  w.pitShakenTentOf = pitShakenTentOf;

  /* 🔎 v2.55.0 「その日・その時間帯の再検の記録」が何番目かを探す。
     ◎返すもの  { i:番号 } ／ 見つからない＝null ／ 同じものが2本以上＝{ amb:true }
     🔴 **2本以上ある時は番号を返さない。** どちらを消していいか決められないので、
        呼ぶ側（MHS）は「PitFlow の予約詳細で選んでください」と言って引き下がること。
     ⚠ PitFlow の予約詳細は**1行ずつ押す**ので、これを使わない（番号がそのまま分かる）。 */
  function pitShakenReFind(insp, iso, slot){
    var hist = (insp && Array.isArray(insp.history)) ? insp.history : [];
    var sl = (slot === 'pm') ? 'pm' : 'am', hit = [];
    for (var i = 0; i < hist.length; i++){
      var h = hist[i];
      if (h && h.result === 'recheck' && h.date === iso && ((h.slot === 'pm') ? 'pm' : 'am') === sl) hit.push(i);
    }
    if (!hit.length) return null;
    if (hit.length > 1) return { amb: true };
    return { i: hit[0] };
  }
  w.pitShakenReFind = pitShakenReFind;

  /* 📍 陸運局の一覧・名前＝**場所の表を渡せば、どのアプリでも同じ答え**（v1.160.0）
     🔴 「陸運支局のバッジが付いている・有効なもの」＋並び（よく使う→並び順→名前）はここ1本。
        PitFlow（members-pit.js）も MHS も、自分が持っている `coreLocations` の中身を渡すだけ。
     ⚠ カテゴリの名札は CoreMembers で作り直せるので、**鍵が rikuun か、名札に「陸運」**で拾う。 */
  function pitRikuunFrom(locs, catLabel){
    var lab = (typeof catLabel === 'function') ? catLabel : function(k){ return k === 'rikuun' ? '陸運局' : ''; };
    return (Array.isArray(locs) ? locs : []).filter(function(l){
      if (!l || l.active === false) return false;
      if (l.category === 'rikuun') return true;
      return /陸運/.test(lab(l.category) || '');
    }).sort(function(a, b){
      return (b.frequent ? 1 : 0) - (a.frequent ? 1 : 0)
          || (a.order || 0) - (b.order || 0)
          || String(a.name || '').localeCompare(String(b.name || ''), 'ja');
    }).map(function(l){
      return { id: l.id, name: String(l.name || ''), aliases: l.aliases || [],
               frequent: !!l.frequent, address: l.address || '' };
    });
  }
  function pitLocNameFrom(locs, id){
    if (!id) return '';
    var h = (Array.isArray(locs) ? locs : []).find(function(l){ return l && l.id === id; });
    return h ? String(h.name || '') : '';
  }
  w.pitRikuunFrom  = pitRikuunFrom;
  w.pitLocNameFrom = pitLocNameFrom;

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
