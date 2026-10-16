/* =========================================================
   coreflow-log.js ─ 📝 CFLog＝操作ログの共通の形（棚卸し C-04）  v1.0.0  2026-10-16
   ---------------------------------------------------------
   🔴 全アプリ共通の本体はここ。アプリの js\coreflow-log.js は写し（sync-shared.ps1 が配る）。

   なぜ：操作ログの書き手が約15通りで、形がばらばらだった。
         ・どこから触ったか（FlowDesk・FlowGo・MHS…）が文の末尾の「（FlowDesk）」だけ
         ・前 → 後が文の中にしか無い・端末も版も残らない
         ・よそのアプリのログを手で写した形で書く所が7か所（ずれやすい）
   決めごと：
     ・入れ物は今の各アプリの物のまま（持ち主のアプリの入れ物に書く）。ルールは「足すだけ・消せない」のまま
     ・今までの欄（time・timeStr・uid・userName・action・label・kind・cardId など）も必ず書く
       ＝今の操作ログの画面・分析の表は壊れない。action の末尾の「（どこから）」も今までどおり付ける
     ・共通の欄（v:1 が付いた行だけにある）：
         v       … 形の版（1）
         app     … 持ち主のアプリ（pitflow／carflow／mhs／stockflow）＝どの入れ物か
         col     … 触った書類の入れ物（pitCards・scheduleEvents…）
         docId   … 触った書類の id
         docName … 人が読む名前（「山田 様 / プリウス」など）
         act     … 何をした（短い言葉。from の飾りは付けない）
         changes … 前 → 後 [{ f:欄, label:人が読む名前, b:前, a:後 }]（無ければ []）
         from    … どこから押したか（FlowDesk／FlowGo／CoreFlow ダッシュボード／MHS Todayボード／CarFlow…）
         wApp    … 書いた画面のアプリ（flowdesk・flowgo・coreflow・mhs・carflow…）
         devId   … 端末の番号（cf_dev。無ければ空）※今までの dev（自動の時の「その端末の人」）とは別の欄
         ver     … 書いた画面の版
         at      … 端末の時刻（ms）。time（サーバーの時刻）と両方
         auto    … アプリが勝手にやった（人が押していない）
     ・データの保存と同じ1回で書ける時は CFLog.put(tx か batch, …) を使う（「保存できたのに記録が無い」を作らない）

   使い方：
     CFLog.put(txOrBatch, 会社の書類（companies/{cid} の ref）, { app:'pitflow', col:'pitCards', docId, docName, act:'入庫した',
              changes:[{ f:'status', label:'状態', b:'reserved', a:'check' }], from:'FlowDesk', kind:'today',
              legacy:{ cardId: id } , user:{ uid, name } })
     CFLog.add(会社の書類, 同じ形) → Promise（保存の後に別に書く時。失敗しても投げない）
     CFLog.doc(同じ形) → 書く中身だけ（見張り・自前の batch 用）
   ========================================================= */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var COL = { pitflow: 'pitAuditLogs', carflow: 'auditLogs', mhs: 'mhsAuditLogs', stockflow: 'stockAuditLogs' };
  var MAX_CHANGES = 30, MAX_VAL = 300;
  var G = root || (typeof globalThis !== 'undefined' ? globalThis : {});   /* 画面＝window・Node（見張り）＝globalThis */

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function meta(n) { try { var m = document.querySelector('meta[name="' + n + '"]'); return m ? String(m.getAttribute('content') || '') : ''; } catch (e) { return ''; } }
  function wApp() {
    var k = meta('app-key'); if (k) return k;
    if (meta('desk-version')) return 'flowdesk';
    if (meta('m-version')) return 'flowgo';
    try { return String(location.hostname || '').split('.')[0] || ''; } catch (e) { return ''; }
  }
  function ver() { return meta('app-version') || meta('desk-version') || meta('m-version') || ''; }
  function devId() {
    var v = '';
    try { var m = document.cookie.match(/(?:^|;\s*)cf_dev=([^;]+)/); v = m ? decodeURIComponent(m[1]) : ''; } catch (e) {}
    if (!/^d[\w-]+$/.test(v)) { try { v = localStorage.getItem('cf_dev') || ''; } catch (e) { v = ''; } }
    return /^d[\w-]+$/.test(v) ? v.slice(0, 60) : '';
  }
  function FV() { try { return G.firebase.firestore.FieldValue; } catch (e) { return null; } }
  function serverTime() { var F = FV(); try { return F ? F.serverTimestamp() : Date.now(); } catch (e) { return Date.now(); } }
  /* 前・後の値は短い文字か数・真偽・null に（大きな物を記録に積まない） */
  function small(v) {
    if (v === undefined) return null;
    if (v === null || typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.length > MAX_VAL ? v.slice(0, MAX_VAL) + '…' : v;
    if (typeof v.toMillis === 'function') { try { return v.toMillis(); } catch (e) { return null; } }
    if (typeof v.isEqual === 'function' && !Array.isArray(v)) return '（サーバーで決まる値）';   /* FieldValue（increment・arrayUnion・delete など） */
    var s; try { s = JSON.stringify(v); } catch (e) { s = String(v); }
    if (s === undefined) return null;
    return s.length > MAX_VAL ? s.slice(0, MAX_VAL) + '…' : s;
  }
  function userOf(o) {
    var u = o.user || {}, f = G.fb || {};
    var cu = (f.auth && f.auth.currentUser) || f.currentUser || null;
    var cm = f.currentMember || {};
    return { uid: u.uid || (cu && cu.uid) || '', name: u.name || cm.name || (cu && cu.displayName) || '—', memberId: u.memberId || cm.id || null };
  }

  function doc(o) {
    o = o || {};
    var d = new Date(o.at || Date.now()), u = userOf(o);
    var act = String(o.act || '');
    var changes = (Array.isArray(o.changes) ? o.changes : []).slice(0, MAX_CHANGES).map(function (c) {
      var x = { f: String(c.f || ''), b: small(c.b), a: small(c.a) };
      if (c.label) x.label = String(c.label);
      return x;
    });
    var out = {
      /* 今までの欄（画面・分析が読む） */
      time: serverTime(),
      timeStr: (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()),
      uid: u.uid, userName: u.name,
      action: o.action != null ? String(o.action) : act + (o.from ? '（' + o.from + '）' : ''),
      /* 共通の欄 */
      v: 1, app: String(o.app || ''), col: String(o.col || ''), docId: o.docId != null ? String(o.docId) : '', docName: String(o.docName || ''),
      act: act, changes: changes, from: String(o.from || ''), wApp: wApp(), devId: devId(), ver: ver(), at: d.getTime(), auto: !!o.auto
    };
    if (o.kind != null) out.kind = String(o.kind);
    if (o.label != null) out.label = String(o.label);
    if (u.memberId) out.memberId = u.memberId;
    if (o.dev != null) out.dev = String(o.dev);                    /* 今までの dev（自動の時の「その端末の人」） */
    var L = o.legacy || {};
    Object.keys(L).forEach(function (k) { if (!(k in out) || k === 'label' || k === 'kind') out[k] = L[k]; });
    return out;
  }
  function colRef(co, app) {
    var name = COL[app]; if (!name) throw new Error('[CFLog] 知らないアプリ：' + app);
    return co.collection(name);
  }
  /* データの保存と同じ1回に入れる（tx＝transaction・batch のどちらでも set を持っていればよい） */
  function put(tb, co, o) {
    var ref = colRef(co, o.app).doc();
    tb.set(ref, doc(o));
    return ref;
  }
  /* 保存の後に別に書く（失敗しても操作は止めない＝今までの各アプリの記録と同じ） */
  function add(co, o) {
    try {
      return colRef(co, o.app).add(doc(o)).catch(function (e) { try { console.warn('[CFLog] 操作ログに書けませんでした（操作は続きます）', o.app, e && e.code); } catch (x) {} return null; });
    } catch (e) { try { console.warn('[CFLog]', e); } catch (x) {} return Promise.resolve(null); }
  }
  /* 前と後の物から、変わった欄だけ changes にする（labels＝{欄:人が読む名前}） */
  function diff(before, after, labels) {
    var out = [], b = before || {}, a = after || {};
    Object.keys(a).forEach(function (k) {
      var x = small(b[k]), y = small(a[k]);
      if (JSON.stringify(x) === JSON.stringify(y)) return;
      var c = { f: k, b: b[k], a: a[k] }; if (labels && labels[k]) c.label = labels[k];
      out.push(c);
    });
    return out;
  }

  var CFLog = { VERSION: VERSION, COL: COL, doc: doc, put: put, add: add, diff: diff, colRef: colRef, _small: small };
  if (typeof module === 'object' && module.exports) module.exports = CFLog;
  if (root) root.CFLog = CFLog;
})(typeof window !== 'undefined' ? window : null);
