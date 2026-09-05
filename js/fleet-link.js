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

  /* 印に出す字（顧客ビューの車カード）。
     代車＝「代車3」のように呼び名がそのまま通じるので呼び名だけ。
     自社車両＝呼び名が車種名なので、何なのかが分かるように種別を頭に付ける。 */
  function badgeText(kind, v){
    var nm = t(v && (v.name || v.model));
    if (kind === 'loaner') return nm || '代車';
    return nm ? ('自社車両（' + nm + '）') : '自社車両';
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

  w.pitFleetAll        = all;
  w.pitFleetById       = byId;
  w.pitFleetKindLabel  = kindLabel;
  w.pitFleetBadgeText  = badgeText;
  w.pitFleetLinkOfVeh  = linkOfVeh;
  w.pitFleetLinkTarget = targetOf;
  w.pitFleetLinked     = isLinked;
  w.pitFleetPlateCands = plateCandidates;
  w.pitFleetSearch     = search;
  w.pitFleetHeldBy     = heldBy;
  w.pitFleetUnlinked   = unlinked;

  console.log('[fleet-link] ready（代車・自社車両とお客様の車の紐づけの物差し）');
})(window);
