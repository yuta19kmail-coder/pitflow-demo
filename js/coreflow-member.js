/* =========================================================
   coreflow-member.js ─ 👤 CFMember＝「使えるか・役・管理者・名前」の判定を1本に（棚卸し C-03）  v1.0.0  2026-10-16
   ---------------------------------------------------------
   🔴 全アプリ共通の本体はここ。アプリの js\coreflow-member.js・サーバーの cf-member.js は写し（sync-shared.ps1 が配る）。

   ゆうた決定（2026-10-16）：
     ・**CoreFlow のメンバー管理の画面に出ている通りに動く。**画面でアプリに印が付いていない人は、そのアプリを使えない
       （「CoreFlow でちゃんと俺が設定してある。してないやつはほんとにまだ使えなくていいやつ」）
     ・画面は、まだ一度も保存されていない人にも「初めの値」を出している＝その初めの値もここで決める（DEFAULTS）。
       メンバー管理の画面（ポータル index.html の loadMembers）もこの表を使う＝画面と判定が割れない
     ・各アプリの管理者は**そのアプリの役**で決める。メンバー管理ができるのはマスターだけ（2026-10-20）
     ・マスター（ゆうた）は全アプリを使える・各アプリで一番上の役
   なぜ：「使えるか」の判定が入口・サーバーの通知・FlowDesk・FlowGo・ダッシュボード・ルールで6通りあり、
         CoreTools・CoreBoard・CoreNote は「入れないのに通知は届く」、MHS・CoreTemplate は「入れるのに通知が届かない」があった（A-49）

   使い方（画面・サーバー共通）：
     CFMember.appOf(m, app)       → { on, role }（保存されていなければ画面と同じ初めの値）
     CFMember.canUse(m, app)      → そのアプリを使えるか（'coreflow'＝ダッシュボード・FlowDesk・FlowGo は在籍だけで可）
     CFMember.role(m, app)        → その人のそのアプリの役（使えなければ null・マスターは一番上）
     CFMember.isAppAdmin(m, app)  → そのアプリの管理者か（役で決める）
     CFMember.isActive(m) ／ isMaster(m) ／ canManageMembers(m)（メンバー管理ができる＝マスターだけ）
     CFMember.name(m, 'full'|'surname') ／ CFMember.photo(m)
   ========================================================= */
(function (root) {
  'use strict';
  var VERSION = '1.2.0';
  var APPS = ['carflow', 'stockflow', 'pitflow', 'mhs', 'coremembers', 'coretools', 'coretemplate', 'coreboard', 'corenote'];
  /* 画面（メンバー管理）がまだ保存されていない人に出している初めの値。🔴 画面と同じ（ポータル loadMembers がここを使う） */
  var DEFAULTS = {
    carflow: function () { return { on: false, role: 'スタッフ' }; },
    stockflow: function () { return { on: false, role: 'メンバー' }; },
    pitflow: function () { return { on: false, role: 'メンバー' }; },
    mhs: function () { return { on: true, role: '利用' }; },
    coremembers: function (m) { return { on: true, role: m.master ? 'オーナー' : '一般' }; },
    coretools: function (m) { return { on: !!m.master, role: '利用' }; },
    coretemplate: function (m) { return { on: true, role: m.master ? '管理者' : '利用者' }; },
    coreboard: function (m) { return { on: !!m.master, role: '利用' }; },
    corenote: function (m) { return { on: !!m.master, role: m.master ? 'AI利用' : '利用' }; }
  };
  /* マスターの役（各アプリで一番上） */
  var TOP = { carflow: '管理者', stockflow: '管理', pitflow: '管理', mhs: '管理', coremembers: 'オーナー', coretools: '利用', coretemplate: '管理者', coreboard: '利用', corenote: 'AI利用' };
  /* 管理者の役（そのアプリの役で決める） */
  var ADMIN = { carflow: ['管理者'], stockflow: ['管理', '管理者'], pitflow: ['管理'], mhs: ['管理'], coremembers: ['オーナー', '管理者'], coretemplate: ['管理者'], coretools: [], coreboard: [], corenote: [] };

  function isActive(m) { return !!m && m.active !== false && !m.removed; }
  function isMaster(m) { return !!m && m.master === true; }
  /* 🔐 v1.2.0（2026-10-20・ゆうた決定）**メンバー管理に入れる・権限を付けるのはマスターだけ。**各アプリの管理者はそのアプリの中だけ＝必ずマスターより下。
     名簿の「管理者」の印（admin）は、もう何の力も持たない（ルールも同じ線） */
  function canManageMembers(m) { return isActive(m) && isMaster(m); }
  function appOf(m, app) {
    if (!m || !app) return { on: false, role: '' };
    var v = m[app];
    if (v && typeof v === 'object') {
      var r = { on: v.on === true, role: v.role || '' };
      if (app === 'corenote' && isMaster(m)) r.role = 'AI利用';   /* 画面と同じ：マスターは常に AI あり */
      return r;
    }
    var d = DEFAULTS[app];
    return d ? d(m) : { on: false, role: '' };
  }
  function canUse(m, app) {
    if (!isActive(m)) return false;
    if (!app || app === 'coreflow' || app === 'flowdesk' || app === 'flowgo') return true;
    if (isMaster(m)) return true;
    return appOf(m, app).on === true;
  }
  function role(m, app) {
    if (!canUse(m, app)) return null;
    if (isMaster(m)) return TOP[app] || '';
    return appOf(m, app).role || (DEFAULTS[app] ? DEFAULTS[app](m).role : '');
  }
  function isAppAdmin(m, app) { var r = role(m, app); return !!r && (isMaster(m) || (ADMIN[app] || []).indexOf(r) >= 0); }
  /* 名前。kind＝'full'（名簿の名前）・'surname'（苗字）・'call'（呼び名＝CoreMembers の dispName）・'first'（下の名前）。
     core＝その人の CoreMembers の1件（あれば呼び名・下の名前に使う）。v1.1.0（C-03 第2段）
     ⚠ 34個ある各アプリの名前の関数は、そのファイルを触る時にここへ寄せる（一度に書き換えない＝見た目が変わる所があるため） */
  function name(m, kind, core) {
    var full = String((m && (m.name || m.gname)) || '').trim();
    var parts = full.split(/[\s　]+/).filter(Boolean);
    if (kind === 'surname') return (core && String(core.lastName || '').trim()) || parts[0] || full;
    if (kind === 'call') return (core && String(core.dispName || '').trim()) || parts[0] || full;
    if (kind === 'first') return (core && String(core.firstName || '').trim()) || parts[1] || full;
    return full;
  }
  /* 本人↔名簿の橋（userPrefs/{uid}.memberId）。ルール（_pmLinked）が「この人はこの名簿の人」と分かる元。
     入口で名簿の人が分かったら必ず書く（A-51）。書けなくても入室は止めない（今までの各アプリと同じ） */
  function bridge(db, cid, user, m) {
    try {
      if (!db || !cid || !user || !user.uid || !m || !m.id) return Promise.resolve(false);
      return db.collection('companies').doc(String(cid)).collection('userPrefs').doc(user.uid)
        .set({ memberId: String(m.id), memberEmail: String(m.email || user.email || '').toLowerCase() }, { merge: true })
        .then(function () { return true; }, function (e) { try { console.warn('[CFMember] 本人↔名簿の橋を書けませんでした', e && e.code); } catch (x) {} return false; });
    } catch (e) { return Promise.resolve(false); }
  }
  function photo(m) {
    var p = m && (m.photo || m.photoURL || m.customPhotoURL);
    return (typeof p === 'string' && /^(https:|data:image\/)/.test(p)) ? p : '';
  }

  var CFMember = { VERSION: VERSION, APPS: APPS, TOP: TOP, ADMIN: ADMIN,
    appOf: appOf, canUse: canUse, role: role, isAppAdmin: isAppAdmin, isActive: isActive, isMaster: isMaster, canManageMembers: canManageMembers, name: name, photo: photo, bridge: bridge };
  if (typeof module === 'object' && module.exports) module.exports = CFMember;
  if (root) root.CFMember = CFMember;
})(typeof window !== 'undefined' ? window : null);
