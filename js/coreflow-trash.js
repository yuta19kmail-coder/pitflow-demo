/* =========================================================
   coreflow-trash.js ─ 🗑 CFTrash＝全アプリ共通のゴミ箱（棚卸し C-05）  v1.0.0  2026-10-16
   ---------------------------------------------------------
   🔴 全アプリ共通の本体はここ。アプリの js\coreflow-trash.js は写し（sync-shared.ps1 が配る）。

   ゆうた決定（2026-10-16）：
     ・「消去」「削除」を押した物は、本当に消さずにゴミ箱へ（パソコンのゴミ箱と同じ）
     ・ゴミ箱は CoreFlow（ダッシュボード）の中に1つ。**見る・戻すはマスター（ゆうた）だけ**
     ・ゴミ箱に入って **90日** たった物は、サーバーが本当に消す（trashPurgeDaily。中身は消し「誰が・いつ・何を」の行は残す）
     ・実績になったカード・済の付箋・売約後の車などは「消した物」ではない（ゴミ箱に入らない）
   決めごと：
     ・入れ物＝companies/{cid}/trash（ルール：入れるのは社員〈自分の名前・state:'trash'〉／見る・直すはマスター／消すのはサーバー）
     ・元の書類を消すのと、ゴミ箱に中身の写しを入れるのと、操作ログ（CFLog）を、**同じ1回**で書く
       ＝「消えたのに写しが無い」「写しだけある」を作らない。元の書類が消えるので、各アプリ・FlowDesk・サーバーの読み手は今のままで壊れない
     ・写しは書類の中身まるごと（1MB を超えそうなら大きい欄から外し、外した欄の名前を dropped に）
   形（trash の1件）：
     { v:1, state:'trash'|'restored'|'purged', app, col, docId, path（companies/{cid}/ の下）, name（人が読む名前）, data（中身）, dropped,
       deletedAt（ms）, deletedAtTs（サーバーの時刻）, deletedBy（uid）, deletedByMember, deletedByName, deletedFrom（どこから）, reason,
       wApp, ver, purgeAfter（ms＝deletedAt＋90日）, restoredAt/By/ByName, purgedAt }
   使い方：
     CFTrash.remove({ db, co, ref, data, app, col, name, from, reason, log:{ act, kind, label, legacy } }) → Promise<ゴミ箱の id>
     CFTrash.put(tx か batch, co, 同じ形) → ゴミ箱の ref（自前の batch に入れる時）
     CFTrash.restore({ db, co, id, data }) → マスターがダッシュボードから戻す（元の場所に同じ書類があれば戻さない＝'exists'）
   ========================================================= */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var KEEP_DAYS = 90, DAY = 86400000, MAX_BYTES = 900000;
  var G = root || (typeof globalThis !== 'undefined' ? globalThis : {});

  function meta(n) { try { var m = document.querySelector('meta[name="' + n + '"]'); return m ? String(m.getAttribute('content') || '') : ''; } catch (e) { return ''; } }
  function wApp() { var k = meta('app-key'); if (k) return k; if (meta('desk-version')) return 'flowdesk'; if (meta('m-version')) return 'flowgo'; try { return String(location.hostname || '').split('.')[0] || ''; } catch (e) { return ''; } }
  function FV() { try { return G.firebase.firestore.FieldValue; } catch (e) { return null; } }
  function userOf(o) {
    var u = o.user || {}, f = G.fb || {};
    var cu = (f.auth && f.auth.currentUser) || f.currentUser || null, cm = f.currentMember || {};
    return { uid: u.uid || (cu && cu.uid) || '', memberId: u.memberId || cm.id || null, name: u.name || cm.name || (cu && cu.displayName) || '—' };
  }
  function size(v) { try { return JSON.stringify(v).length; } catch (e) { return 0; } }
  /* 1MB を超えそうなら、大きい欄から外す（何を外したかは残す） */
  function slim(data) {
    var d = Object.assign({}, data || {}), dropped = [];
    delete d.id;
    while (size(d) > MAX_BYTES) {
      var big = null, bs = 0;
      Object.keys(d).forEach(function (k) { var s = size(d[k]); if (s > bs) { bs = s; big = k; } });
      if (!big) break;
      dropped.push(big); delete d[big];
    }
    return { data: d, dropped: dropped };
  }
  function relPath(ref) {
    var p = String((ref && ref.path) || '');
    var m = /^companies\/[^/]+\/(.+)$/.exec(p);
    return m ? m[1] : p;
  }
  function doc(o) {
    var at = o.at || Date.now(), u = userOf(o), s = slim(o.data), F = FV();
    return {
      v: 1, state: 'trash', app: String(o.app || ''), col: String(o.col || (o.ref && o.ref.parent && o.ref.parent.id) || ''),
      docId: String(o.docId || (o.ref && o.ref.id) || ''), path: relPath(o.ref), name: String(o.name || ''),
      data: s.data, dropped: s.dropped,
      deletedAt: at, deletedAtTs: F ? F.serverTimestamp() : at, deletedBy: u.uid, deletedByMember: u.memberId, deletedByName: u.name,
      deletedFrom: String(o.from || ''), reason: String(o.reason || ''), wApp: wApp(), ver: meta('app-version') || meta('desk-version') || meta('m-version') || '',
      purgeAfter: at + KEEP_DAYS * DAY
    };
  }
  function idOf(o) { return (String(o.col || (o.ref && o.ref.parent && o.ref.parent.id) || 'x') + '__' + String(o.docId || (o.ref && o.ref.id) || 'x') + '__' + (o.at || Date.now())).replace(/\//g, '_'); }
  function put(tb, co, o) {
    if (!o.at) o.at = Date.now();
    var ref = co.collection('trash').doc(idOf(o));
    tb.set(ref, doc(o));
    return ref;
  }
  /* 消す（＝ゴミ箱へ）。元の書類の削除・ゴミ箱の写し・操作ログを1回で */
  function remove(p) {
    var b = p.db.batch(), CFL = G.CFLog || null;
    p.at = p.at || Date.now();
    var tref = put(b, p.co, p);
    b.delete(p.ref);
    if (CFL && p.log !== false && CFL.COL[p.app]) {
      var L = p.log || {};
      CFL.put(b, p.co, { app: p.app, col: p.col || (p.ref.parent && p.ref.parent.id) || '', docId: p.docId || p.ref.id, docName: p.name || '', act: L.act || 'ゴミ箱へ入れた',
        action: L.action, from: p.from || '', kind: L.kind, label: L.label != null ? L.label : (p.name || ''), legacy: L.legacy,
        changes: [{ f: '（書類）', label: 'ゴミ箱へ（' + KEEP_DAYS + '日で消える）', b: p.name || '（あり）', a: null }], user: p.user });
    }
    return b.commit().then(function () { return tref.id; });
  }
  /* 戻す（マスターがダッシュボードから）。元の場所に同じ書類がもうあれば戻さない */
  function restore(p) {
    var tref = p.co.collection('trash').doc(p.id);
    return tref.get({ source: 'server' }).then(function (s) {   /* 手元の写しでなくサーバーに聞く（古い手元だと上書きしてしまう） */
      if (!s.exists) { var e0 = new Error('ゴミ箱に見つかりません'); e0.code = 'not-found'; throw e0; }
      var t = s.data() || {};
      if (t.state !== 'trash') { var e1 = new Error(t.state === 'purged' ? 'もう消えています（90日を過ぎました）' : 'もう戻してあります'); e1.code = t.state; throw e1; }
      var oref = p.co.collection(t.col).doc(t.docId);
      return oref.get({ source: 'server' }).then(function (o) {
        if (o.exists) { var e2 = new Error('元の場所に同じ書類があります（戻すと上書きになるので止めました）'); e2.code = 'exists'; throw e2; }
        var b = p.db.batch(), F = FV(), u = userOf(p), CFL = G.CFLog || null;
        b.set(oref, t.data || {});
        b.update(tref, { state: 'restored', restoredAt: Date.now(), restoredAtTs: F ? F.serverTimestamp() : Date.now(), restoredBy: u.uid, restoredByName: u.name });
        if (CFL && CFL.COL[t.app]) CFL.put(b, p.co, { app: t.app, col: t.col, docId: t.docId, docName: t.name || '', act: 'ゴミ箱から戻した', from: 'CoreFlow ゴミ箱',
          label: t.name || '', kind: 'restore', changes: [{ f: '（書類）', label: 'ゴミ箱から戻した', b: null, a: t.name || '（あり）' }], legacy: t.app === 'pitflow' ? { cardId: t.col === 'pitCards' ? t.docId : '' } : (t.app === 'mhs' ? { evId: t.col === 'scheduleEvents' ? t.docId : '' } : {}), user: p.user });
        return b.commit().then(function () { return t; });
      });
    });
  }

  var CFTrash = { VERSION: VERSION, KEEP_DAYS: KEEP_DAYS, doc: doc, put: put, remove: remove, restore: restore, _slim: slim };
  if (typeof module === 'object' && module.exports) module.exports = CFTrash;
  if (root) root.CFTrash = CFTrash;
})(typeof window !== 'undefined' ? window : null);
