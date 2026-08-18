/* ========================================
   archive-pit.js  -  顧客・車両の「アーカイブ」  PitFlow v1.49.0
   ----------------------------------------
   ◎なにをするもの（ゆうた指定）
     🔴 **「消す」という考え方をやめて「アーカイブ（片付ける）」にする。**
     ・顧客をアーカイブすると、**ダッシュボードの検索・顧客呼び出しから出なくなる**。
       その顧客の**入庫カードも検索から隠れる**。
       ⚠ ただし **実績・売上などの集計はそのまま**（数字が変わると経理が狂うため）。
     ・顧客画面には「**アーカイブ済みを見る**」の切替。そこから詳細を開いて**戻せる**。
     ・**車両にも同じ仕組み**。乗換で降りた車を片付けられる。履歴は残る。
     ・🔴 **戻す（復元）は管理者だけ。アーカイブするのは誰でもできる。**

   ◎大事な決めごと
     🔴 **データは消さない。** 立てるのは印（`archived` / `archivedAt` / `archivedBy` / `archiveReason`）だけ。
     🔴 **顧客をアーカイブしたら、その車も全部アーカイブ扱い**になる。
        ⚠ ただし**車のデータは書き換えない**＝「顧客が片付いているか」を**見る時に一緒に見る**だけ。
           こうしておくと、顧客を戻した時に**車が元どおりに戻る**
           （個別に片付けた車は片付いたまま）。書き換えていたら、この区別ができない。
     ⚠ 入庫カードと車両は **ナンバー**で結び付ける（カードは車両IDを持っていない）。
        ナンバーが無いカードは、顧客だけで判断する。
     ⚠ ここ以外で `archived` を読み書きしないこと。**判定の物差しはこの1か所。**
   ======================================== */
(function (w, d) {
  'use strict';

  function cards()  { return (w.state && state.cards) || []; }
  function custs()  { return (w.state && state.customers) || []; }
  function norm(s)  { return String(s == null ? '' : s).replace(/\s+/g, '').replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(ch){ return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); }).toLowerCase(); }
  /* 🔴 v1.53.0 「0」「なし」「未定」「新規車両」などは**車を見分ける鍵にしない**（customers.js の物差しを借りる）。
     ⚠ これを見ないと、ナンバーが「0」の車を1台アーカイブしただけで、
        同じ「0」を持つ他のお客様のカードまで検索から消える。 */
  function realPlate(p){ return w.pitIsRealPlate ? pitIsRealPlate(p) : !!String(p == null ? '' : p).trim(); }

  /* ---------- 権限 ----------
     ⚠ サンプルモード（クラウド未接続）では今までどおり全部さわれる。 */
  function isAdmin(){
    if (!w.PIT_CLOUD) return true;
    return !!(w.pitIsAdmin && w.pitIsAdmin());
  }
  /* 片付けるのは誰でも／戻すのは管理者だけ（ゆうた指定） */
  function canArchive(){ return true; }
  function canRestore(){ return isAdmin(); }
  function meName(){
    try { if (w.pitCurrentStaffName) return pitCurrentStaffName() || ''; } catch(e){}
    return '';
  }

  /* ---------- 予約カードのアーカイブ（v1.136.0・ゆうた確定 2026-08-18）----------
     🗣「アーカイブまで行った車は基本マスターとか管理者以外は触れない。
        ＝詳細を見たりは出来るが、金額をいじったり、消去したり、入庫中に戻したり などは出来ない」
     🗣「アーカイブに統一しよう」

     🔴 **顧客・車両とまったく同じ形にそろえる。**
        ・アーカイブする … 誰でもできる
        ・**アーカイブから戻す … 管理者だけ**（`canRestore()` を共用）
        ・言葉も「アーカイブ／アーカイブから戻す」で統一（「片付ける」は使わない）
     🔴 **「この車はアーカイブ済みか」の物差しはここ1本。** 画面側に条件を書き写さない。

     ⚠ 予約キャンセル・未入庫・廃車は、**それぞれのステージを決めた時にここへ足す**。
        足す場所を増やさないこと＝1行足せば ⋮ も帯も権限も全部そろって効く。 */
  function cardArchived(c){
    if (!c) return false;
    if (w.pitCardNoSale && w.pitCardNoSale(c)) return true;   /* 売上なしアーカイブ（v1.136.0） */
    if (c.status === 'returned') return true;                 /* 返車済み＝実績（v1.138.0） */
    /* 🔴 v1.139.0 未入庫・予約キャンセルで**アーカイブまで行ったもの**（v1.139.0）
       ⚠ 未入庫は30日たつまで `archived` が立たない＝その間は今までどおり
          予約▸未定の「未入庫」BOXから**誰でも**戻せる。ここでは拾わない。 */
    if (c.status === 'cancelled' && c.archived) return true;
    /* ⚠ 廃車・乗替（scrap）は**入れない。** タスクボードの側列にいる＝まだ手元にある車。 */
    return false;
  }
  /* アーカイブ済みか（返車済み＝実績のほう）。売上なしと戻し先が違うので見分ける。 */
  function cardIsResult(c){
    return !!(c && c.status === 'returned' && !(w.pitCardNoSale && w.pitCardNoSale(c)));
  }
  /* 帯に出す文字（画面ごとに書き分けない） */
  function cardArchiveNote(c){
    if (!cardArchived(c)) return '';
    if (w.pitCardNoSale && w.pitCardNoSale(c)){
      var s = 'アーカイブ済み（売上なし）';
      if (c.noSaleAt) s += '　' + c.noSaleAt + (c.noSaleBy ? ' ' + c.noSaleBy : '');
      return s;
    }
    if (c.status === 'cancelled'){
      /* 🔴 v1.139.0 同じ `cancelled` でも中身が違うので、帯で言い分ける。
         ・`cancelled === true` … 人が「やめます」と決めた＝予約キャンセル
         ・それ以外（`noShow`）  … 来なかった＝未入庫（自動でも当日ビューからでも） */
      var k = c.cancelled ? 'アーカイブ済み（予約キャンセル）' : 'アーカイブ済み（未入庫）';
      if (c.cancelledAt) k += '　' + c.cancelledAt;
      return k;
    }
    var t = 'アーカイブ済み（実績）';
    if (c.completedAt) t += '　' + c.completedAt;
    return t;
  }
  /* 戻せない人が押した時の断り方。**顧客・車両と同じ文言**（customers.js の _deny と一字一句そろえる） */
  function denyRestore(){
    if (w.UI && w.UI.alert){
      w.UI.alert('戻せるのは管理者だけです', { detail: 'アーカイブから戻す操作は、PitFlow の役割が「管理」の人だけができます。' });
    } else if (w.pitAlert){
      w.pitAlert('戻せるのは管理者だけです。', { code: 'PF-0020' });
    }
  }

  /* ---------- 判定 ---------- */
  function custArchived(cust){ return !!(cust && cust.archived); }
  /* 🔴 車は「自分が片付いている」か「持ち主が片付いている」かのどちらかでアーカイブ扱い。 */
  function vehArchived(cust, v){ return !!(v && v.archived) || custArchived(cust); }
  /* 車が自分の意思で片付いているか（顧客のとばっちりではない）＝戻すボタンの出し分けに使う */
  function vehSelfArchived(v){ return !!(v && v.archived); }

  /* 顧客を引く。カードは customerId を持っていることが多いが、無い時はナンバー→名前で探す。 */
  function custOf(card){
    if (!card) return null;
    var list = custs();
    if (card.customerId){
      var byId = list.find(function(x){ return x && x.id === card.customerId; });
      if (byId) return byId;
    }
    if (realPlate(card.plate)){
      var pl = norm(card.plate);
      var byPlate = list.find(function(x){ return (x.vehicles || []).some(function(v){ return realPlate(v.plate) && norm(v.plate) === pl; }); });
      if (byPlate) return byPlate;
    }
    var nm = norm(card.customer);
    if (nm) return list.find(function(x){ return norm(x.name) === nm; }) || null;
    return null;
  }
  /* カードの車両を引く（ナンバーで突き合わせ） */
  function vehOf(cust, card){
    if (!cust || !card) return null;
    if (!realPlate(card.plate)) return null;
    var pl = norm(card.plate);
    return (cust.vehicles || []).find(function(v){ return realPlate(v.plate) && norm(v.plate) === pl; }) || null;
  }

  /* 🔴 このカードを検索などに出してよいか。
     ⚠ **出すか出さないかだけ**の話。カードのデータには一切さわらない。
     ⚠ 実績・売上はここを通さない（ゆうた指定＝集計は変えない）。 */
  function cardVisible(card){
    var cust = custOf(card);
    if (!cust) return true;                 /* 顧客の控えが無いカードは今までどおり出す */
    if (custArchived(cust)) return false;
    var v = vehOf(cust, card);
    if (v && v.archived) return false;      /* その車だけ片付けてある */
    return true;
  }
  function custVisible(cust){ return !custArchived(cust); }

  /* ---------- する／戻す ---------- */
  function save(){ try { if (w.PitDB) PitDB.save(); } catch(e){} }
  function stamp(o, on, reason){
    if (on){
      o.archived = true;
      o.archivedAt = Date.now();
      o.archivedBy = meName();
      if (reason) o.archiveReason = reason;
    } else {
      delete o.archived; delete o.archivedAt; delete o.archivedBy; delete o.archiveReason;
    }
    o.updatedAt = Date.now();
  }
  function findCust(id){ return custs().find(function(x){ return x && x.id === id; }) || null; }
  function findVeh(cust, vehId){ return ((cust && cust.vehicles) || []).find(function(v){ return v && v.id === vehId; }) || null; }

  function archiveCust(custId, reason){
    if (!canArchive()) return false;
    var c = findCust(custId); if (!c) return false;
    stamp(c, true, reason || '');
    save();
    return true;
  }
  function restoreCust(custId){
    if (!canRestore()) return false;          /* 🔴 戻すのは管理者だけ */
    var c = findCust(custId); if (!c) return false;
    stamp(c, false);
    save();
    return true;
  }
  function archiveVeh(custId, vehId, reason){
    if (!canArchive()) return false;
    var c = findCust(custId); if (!c) return false;
    var v = findVeh(c, vehId); if (!v) return false;
    stamp(v, true, reason || '');
    save();
    return true;
  }
  function restoreVeh(custId, vehId){
    if (!canRestore()) return false;          /* 🔴 戻すのは管理者だけ */
    var c = findCust(custId); if (!c) return false;
    var v = findVeh(c, vehId); if (!v) return false;
    stamp(v, false);
    save();
    return true;
  }
  /* ナンバーで車を片付ける（新規予約の「乗換」から呼ぶ）。理由＝乗換 */
  function archiveVehByPlate(custId, plate, reason){
    var c = findCust(custId); if (!c) return false;
    if (!realPlate(plate)) return false;
    var pl = norm(plate);
    var v = (c.vehicles || []).find(function(x){ return realPlate(x.plate) && norm(x.plate) === pl; });
    if (!v) return false;
    return archiveVeh(custId, v.id, reason || '乗換');
  }

  /* ---------- 見た目のことば ---------- */
  function whenText(ms){
    if (!ms) return '';
    var t = new Date(ms), p = function(n){ return (n < 10 ? '0' : '') + n; };
    return t.getFullYear() + '/' + (t.getMonth() + 1) + '/' + t.getDate() + ' ' + p(t.getHours()) + ':' + p(t.getMinutes());
  }
  function noteOf(o){
    if (!o || !o.archived) return '';
    var s = 'アーカイブ済み';
    if (o.archiveReason) s += '（' + o.archiveReason + '）';
    if (o.archivedAt) s += '　' + whenText(o.archivedAt);
    if (o.archivedBy) s += '　' + o.archivedBy;
    return s;
  }

  w.PitArchive = {
    canArchive: canArchive, canRestore: canRestore,
    custArchived: custArchived, vehArchived: vehArchived, vehSelfArchived: vehSelfArchived,
    custOf: custOf, vehOf: vehOf,
    cardVisible: cardVisible, custVisible: custVisible,
    archiveCust: archiveCust, restoreCust: restoreCust,
    archiveVeh: archiveVeh, restoreVeh: restoreVeh, archiveVehByPlate: archiveVehByPlate,
    noteOf: noteOf, whenText: whenText,
    /* 予約カードのアーカイブ（v1.136.0）＝顧客・車両と同じ物差し・同じ断り方 */
    cardArchived: cardArchived, cardIsResult: cardIsResult,
    cardArchiveNote: cardArchiveNote, denyRestore: denyRestore
  };
  console.log('[archive-pit] ready（顧客・車両・予約カードのアーカイブ）');
})(window, document);
