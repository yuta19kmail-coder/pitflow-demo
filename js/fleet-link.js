/* ================================================================================
   fleet-link.js  -  🔗 代車・自社車両 ⇄ お客様の車 の**紐づけの物差し1本**
                     PitFlow v2.62.0（ゆうた指定 2026-09-05）
   ================================================================================
   🗣「顧客（に乗っている自社車両）と代車管理の紐づけの強化」
   🗣「顧客ビュー側に これ代車としてつかってるよ アイコンかバッチがほしい」
   🗣（どう結ぶか）「代車の設定画面から紐づけ設定欄を作成する」
   🗣（今までの自動紐づけは）「やめる（手で設定したものだけ）」

   ◎ここが受け持つこと ＝ **結ばれているかを答えるだけ。** 画面は1文字も作らない。
     🔴 結ばれているかの判定を、画面（fleet.js / customers.js）や規則（inspect-rules.js）に
        書き写さないこと。写した瞬間、片方だけ直して食い違う日が来る。

   ◎どこに書いてあるか（記録の場所は前から在ったものを使う。増やしていない）
     代車・社用車の1台 … `custId`（お客様の控えのID）／`custVehId`（その人の何台目か）
     ⚠ **お客様の車の側には何も書かない。** 書く所を2つにすると、必ず食い違う。
        だから「この車は代車か？」は**代車の側から探して**答える。

   ◎🔴🔴 v2.62.0 で変えたこと ＝ **黙って結ばない。**
     前は「代車を整備で入庫させた瞬間、ナンバーが一致するお客様の車を探して黙って書く」だった。
     ・人が設定していないのに結び目ができるので、**間違っていても誰も気づけない**
     ・同じナンバーが2件に分かれている時（ダブり）に、**どちらに結ぶかは運**
     ＝ いまは **人が代車の設定画面で選んだものだけ**。結ばれていない台数は
        データチェックの日常チェック（L08）が「0にする対象」として数える。

   ◎🔴 「結ばれている」＝**相手が実在すること**まで見る。
     お客様や車が消された・まとめられた後の結び目は、**結ばれていない**として数える
     （そのままにすると、顧客ビューに印が出ないのに数だけ合っている状態になる）。

   ⚠ 読み込みは state.js より後ろ、使う側（customers / inspect-rules / maint-pit / fleet）より前。
   ================================================================================ */
(function (w) {
  'use strict';

  function arr(a){ return Array.isArray(a) ? a : []; }
  function t(v){ return String(v == null ? '' : v).trim(); }
  function st(){ return w.state || {}; }
  /* ナンバーのならし＝空白だけ落とす。⚠ ここを緩めると別の車を同じ車として結ぶ */
  function normPlate(v){ return t(v).replace(/[\s　]/g, ''); }

  /* ===== 代車・自社車両を、種別つきで1本の配列にする ===== */
  function all(){
    var out = [];
    arr(st().loaners).forEach(function(v){ if (v && v.id) out.push({ kind:'loaner',  v:v }); });
    arr(st().companyCars).forEach(function(v){ if (v && v.id) out.push({ kind:'company', v:v }); });
    return out;
  }
  function byId(id){
    id = t(id); if (!id) return null;
    return all().filter(function(x){ return x.v.id === id; })[0] || null;
  }

  /* 🔴 言葉はこの表1本（ゆうた指定 2026-09-05「代車・自社車両 で分ける」）。
     ⚠ 車両管理の種別の選択肢は「代車／社用車」だが、**印に出す言葉は「代車／自社車両」**。
        字を変えたくなったらここだけ直す。画面で綴らない。 */
  function kindLabel(kind){ return kind === 'company' ? '自社車両' : '代車'; }

  /* 🔴 v2.65.0（ゆうた 2026-09-05「リンクバッジがうるさい」「自社🔗済 ／ 🔗済 ぐらいの内容で」）
     **印は「済んでいるか」だけ。呼び名も相手の名前も出さない。**
     ◎前（v2.62.0〜v2.64.0）
       顧客ビュー＝「代車1」「自社車両（ハイエース）」／代車一覧＝「🔗 小林モータース 様」
       ＝ **どの画面にも、その画面がもう出している情報が二重に載っていた**（車の名前・お客様の名前）。
     🔴 いま＝**種別＋済**の2文字＋鎖（顧客ビュー）／**済**だけ（代車一覧＝どれも自社の車なので種別は要らない）。
     ⚠ 種別の言い分け（代車／自社）は残す（2026-09-05 ゆうた指定）。
     ⚠ 相手が誰かは**カーソルを乗せた時の説明（title）**に回す＝見た目は静かなまま、知りたい時は分かる。 */
  function badgeText(kind, v){ return kindLabel(kind) === '自社車両' ? '自社' : '代車'; }
  /* カーソルを乗せた時に出す説明（誰と結んであるか）。⚠ 画面には出さない。 */
  function badgeTitle(kind, v){
    var tg = targetOf(v);
    var who = tg ? (t(tg.cust.name) || t(tg.cust.kana) || '(無名)') : '';
    return kindLabel(kind) + 'として、お客様の車と紐づけ済み' + (who ? '（' + who + ' 様）' : '');
  }

  /* ===== ① お客様の車 → 代車（顧客ビューの印はこれ） ===== */
  function linkOfVeh(custId, vehId){
    custId = t(custId); vehId = t(vehId);
    if (!custId || !vehId) return null;
    var hit = null;
    all().forEach(function(x){
      if (hit) return;
      if (t(x.v.custId) === custId && t(x.v.custVehId) === vehId) hit = x;
    });
    return hit;
  }

  /* ===== ② 代車 → お客様の車（設定画面はこれ） ===== */
  function targetOf(fv){
    var cid = t(fv && fv.custId), vid = t(fv && fv.custVehId);
    if (!cid || !vid) return null;
    var cust = arr(st().customers).filter(function(c){ return c && c.id === cid; })[0];
    if (!cust) return null;
    var veh = arr(cust.vehicles).filter(function(x){ return x && x.id === vid; })[0];
    if (!veh) return null;
    return { cust:cust, veh:veh };
  }
  /* 🔴 相手が実在する時だけ「結ばれている」。上のコメントの決めごと。 */
  function isLinked(fv){ return !!targetOf(fv); }

  /* ===== ③ ナンバーの候補（設定画面が「これですか？」と出すため） =====
     🔴 **黙って結ばない。** ここは候補を並べるだけで、書くのは人が押した時だけ。
     ⚠ 同じナンバーが2件に分かれている（ダブり）と2件返る。**どちらかを勝手に選ばない。** */
  function plateCandidates(plate){
    var key = normPlate(plate), out = [];
    if (!key) return out;
    arr(st().customers).forEach(function(c){
      arr(c && c.vehicles).forEach(function(x){
        if (x && normPlate(x.plate) === key) out.push({ cust:c, veh:x });
      });
    });
    return out;
  }

  /* ===== ④ 名前・ナンバーで探す（候補が無い時の手さぐり用） ===== */
  function search(q, cap){
    var k = t(q).toLowerCase().replace(/[\s　]/g, '');
    var out = [];
    if (!k) return out;
    var lim = cap || 20;
    arr(st().customers).forEach(function(c){
      if (out.length >= lim) return;
      var nm = (t(c.name) + t(c.kana)).toLowerCase().replace(/[\s　]/g, '');
      arr(c.vehicles).forEach(function(x){
        if (out.length >= lim || !x) return;
        var vk = (normPlate(x.plate) + t(x.maker) + t(x.car) + t(x.karteNo)).toLowerCase();
        if (nm.indexOf(k) >= 0 || vk.indexOf(k) >= 0) out.push({ cust:c, veh:x });
      });
    });
    return out;
  }

  /* ===== ⑤ その車を、ほかの代車がもう掴んでいないか =====
     🔴 **お客様の車1台に、代車は1台まで。** 2台結べると顧客ビューの印がどちらか分からなくなる。 */
  function heldBy(custId, vehId, exceptFleetId){
    var hit = linkOfVeh(custId, vehId);
    if (!hit) return null;
    if (exceptFleetId && hit.v.id === t(exceptFleetId)) return null;
    return hit;
  }

  /* ===== ⑥ まだ結ばれていない代車・自社車両（0にする対象） =====
     ⚠ 引退した車は数えない（もう使っていないので、結んでも意味が無い）。 */
  function unlinked(){
    return all().filter(function(x){ return !x.v.retired && !isLinked(x.v); });
  }

  /* ===== ⑦ 🚙🔴 v2.79.0 **顧客控えの車種名に、代車の呼び名が入り込んでいないか**（ゆうた指定 2026-09-07）
     -----------------------------------------------------------------
     🗣「顧客ビューの車種名は車種名なんだから **アクア** とか **タント** が出なきゃいけない。
     　　だが顧客ビューの車種名に**代車名が挿入されちゃってる**（アクア1号・タント茶みたいな）」
     ◎いつ入り込んだか（v2.78.0 で塞いだ道）
       代車の整備カードは車名の欄に**代車の呼び名**を持っていて、
       カードを閉じる／保存すると、それが**お客様の車の「車種」に書き戻されていた。**
       ＝ 塞いだのはこれから先だけ。**すでに書き換わったぶんは、ここで数えて人が直す。**
     ◎見つけ方＝**紐づけた相手の車種名が、その代車の呼び名と同じなら怪しい。**
       ⚠ 上書きされる前の字はどこにも残っていないので、**機械には「直す」ことができない。**
       ⚠ もともと代車の呼び名が車種名そのまま（例＝呼び名も「タント」）のことはある。
          だから規則の側は**要判断**（見て「合っている」と言えば数から外れる）にしてある。
     🔴 ならしは normPlate と同じ考え方＝**空白だけ落として比べる。**ここを緩めると別物を同じと言う。
     ===================================================================== */
  function nameKey(v){ return t(v).replace(/[\s　]/g, ''); }
  function nameBled(){
    var out = [];
    all().forEach(function(x){
      if (x.v.retired) return;
      var tg = targetOf(x.v);
      if (!tg) return;                                   /* 結ばれていないものは L08 の担当 */
      var car = nameKey(tg.veh && tg.veh.car);
      if (!car) return;
      var model = nameKey(x.v.model), nm = nameKey(x.v.name);
      var hit = (model && car === model) ? t(x.v.model)
              : ((nm && car === nm) ? t(x.v.name) : '');
      if (!hit) return;
      out.push({ kind:x.kind, v:x.v, cust:tg.cust, veh:tg.veh, 呼び名:hit });
    });
    return out;
  }

  /* ===== ⑧ 🏢 v2.80.0 **整備カードの「お客様欄」に出す言葉**（ゆうた指定 2026-09-07）
     -----------------------------------------------------------------
     🗣「社用車の方、予約カードの顧客名が**自社車両になってない。本当の顧客名が出ちゃってる**」
     ◎前まで … 作る時は代車も社用車も「自社代車」。そして**入庫した瞬間に、
        紐づけたお客様の名前で上書き**していた（`_intakeGo`）。
        ＝ ボードに本物のお客様の名前が並び、**自社の車だと分からない。**
     🔴 いま＝**種別で分けて、入庫しても上書きしない。**（ゆうた確定）
        代車 →「自社代車」／社用車 →「自社車両」
     ⚠ 紐づけた相手（お客様）は**消していない**＝`c.customerId` はそのまま入るので、
        顧客ビューへも履歴へも今までどおり行ける。**名札に出すのをやめただけ。**
     ===================================================================== */
  function cardName(vehId){
    var x = byId(vehId);
    return (x && x.kind === 'company') ? '自社車両' : '自社代車';
  }

  /* ===== ⑨ 🏢 v2.80.0 **その車の整備カードは、どちらの課のタスクボードへ行くか**（ゆうた指定）
     -----------------------------------------------------------------
     🗣「紐づけしてるにも関わらず**輸入車のチェックが入らず、1課タスクボードに入っちゃった**」
     ◎前まで … 作業予定のカードは **`boardId:'default'`（国産・1課）で決め打ち**だった。
        紐づけも、車両管理の区分も、1つも見ていなかった。
     🔴 いまの決め方（ゆうた確定・**この順番**）
        ① **紐づけたお客様の車の設定**（国産／輸入）＝ここが正
        ② 紐づけていない時は **車両管理の区分「輸入車」**
        ＝ どちらかが入っていれば拾える＝**取りこぼしがない。**
     ⚠ ①と②が食い違う時は**①が勝つ**（顧客控えは車検証の写しで、課の割り振りもそちらが正のため）。
     ⚠ 区分は「軽／普通車／輸入車／商用車」の1つ。**輸入車だけが2課**で、あとは国産（1課）。
     ===================================================================== */
  /* ① 紐づけた相手の設定。**まだ結んでいない／相手に設定が無い時は空**を返す（既定に化けさせない）。
     ⚠ 空と 'default'（国産）は**別物**。ここを混ぜると「人が選んだ1課」と
        「まだ何も分かっていない」の区別がつかなくなる。 */
  function linkBoard(vehId){
    var x = byId(vehId); if (!x) return '';
    var tg = targetOf(x.v);
    var b = t(tg && tg.veh && tg.veh.boardId);
    return (b === 'import' || b === 'default') ? b : '';
  }
  function boardOf(vehId){
    var b = linkBoard(vehId);
    if (b) return b;                                                /* ① 紐づけた相手の設定 */
    var x = byId(vehId);
    return (x && t(x.v.category) === 'import') ? 'import' : 'default';   /* ② 車両管理の区分 */
  }

  w.pitFleetAll        = all;
  w.pitFleetById       = byId;
  w.pitFleetKindLabel  = kindLabel;
  w.pitFleetBadgeText  = badgeText;
  w.pitFleetBadgeTitle = badgeTitle;
  w.pitFleetLinkOfVeh  = linkOfVeh;
  w.pitFleetLinkTarget = targetOf;
  w.pitFleetLinked     = isLinked;
  w.pitFleetPlateCands = plateCandidates;
  w.pitFleetSearch     = search;
  w.pitFleetHeldBy     = heldBy;
  w.pitFleetUnlinked   = unlinked;
  w.pitFleetNameBled   = nameBled;   /* 🚙 v2.79.0 顧客控えの車種名に代車の呼び名が入り込んでいるもの */
  w.pitFleetCardName   = cardName;   /* 🏢 v2.80.0 整備カードのお客様欄に出す言葉（自社代車／自社車両） */
  w.pitFleetBoardOf    = boardOf;    /* 🏢 v2.80.0 その車の整備カードが行く課（紐づけ優先・無ければ区分） */
  w.pitFleetLinkBoard  = linkBoard;  /* 🏢 v2.80.0 紐づけた相手の設定だけ（無ければ空）＝入庫の時に使う */

  console.log('[fleet-link] ready（代車・自社車両とお客様の車の紐づけの物差し）');
})(window);
