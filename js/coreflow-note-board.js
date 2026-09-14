/* ========================================
   coreflow-note-board.js  -  付箋ボード（全アプリ共通の本体）
   ----------------------------------------
   🔴 **本体はここ（_shared）だけ。** アプリ側の js\ にあるのは配られたコピー。
      直す時は必ずここを直して `sync-shared.ps1` を走らせること。

   ◎なにをするもの（ゆうた指定 2026-09-13）
     🗣「付箋に関しては見ためもだけど　なかみも共通にした方がいいのでは？？」
     🗣 決めたこと：**中身も見た目も一気に**／済は **3日後に隠す＋一覧から戻せる**／消去は **今のまま**
     ＝ CarFlow・PitFlow・MHS の付箋ボードを、**この1本で描いて、この1本の決まりで動かす。**
        アプリ側に残すのは「どこに保存するか・名簿は誰か」だけ（差し込み＝アダプター）。

   ◎なぜ（2026-09-13 の調べ）
     3アプリが同じ付箋を**別々の決まり**で扱っていて、それが事故の元になっていた。
       ・自分が誰か       … 名簿の番号／端末で選んだ人／ログインID（MHS は招待で入った5人がズレる）
       ・済の後           … 3日で削除（壊れていて動いていなかった）／残る／残る
       ・済にした時刻     … 保存の前の写しで壊れた値になる（CarFlow）／数字／サーバー時刻
     🔴 **ここで1本にした決まり**
       ① 自分 … アプリが渡す `me()`＝［名簿の番号, ログインID…］。**書く時は先頭（名簿の番号）**、
          見分ける時は**全部**と照らす（昔ログインIDで書かれた付箋も自分のものと分かる）
       ② 自分用（シークレット） … 作った時に `secret:true/false` を**必ず書く**。
          印の無い昔の付箋だけ、担当の形（1人＝作成者）から読む
       ③ 済 … `doneAt` は**ミリ秒の数字**で書く（サーバー時刻の印は写しで壊れるので使わない）。
          **済から3日たったら盤面から隠す。データは消さない。**「済んだ付箋」から見て・戻せる
          ⚠ 壊れた `doneAt`（{_methodName}）は更新日時で読み、次に保存する時に数字へ直す
       ④ 消す・直す人 … アプリが渡す `canEdit(n)`／`canDelete(n)`（今のまま）

   ◎使い方（アプリ側・1回だけ）
     CFNoteBoard.mount({
       app: 'pitflow',                            // このアプリの鍵（carflow / pitflow / mhs）
       me: function(){ return ['名簿の番号', 'ログインID'] },
       notes: function(){ return 画面に並べる付箋の配列（よそのアプリの付箋も含めてよい） },
       members: function(){ return [{id,name,photo}] 担当に選べる人 },
       member: function(id){ return {name,photo} 名前を出す（辞めた人も） },
       quickGroups: function(){ return [{label, ids}] 一括で選ぶボタン },
       labels: function(n){ return {red:'緊急',…} その付箋の出どころの色ラベル },
       save: function(note, info){ return Promise },  // info={isNew, app}
       remove: function(note){ return Promise },
       reorder: function(notesInOrder){ return Promise } ← 無ければ並び替えなし,
       attach: { accept:'image/*,application/pdf,.pdf', storage:{ folder:'pitBoardNotes' か function(app), company:function(){ return 会社id } } }
               ← 🔴 v2026-09-13b 画像・PDF は **ファイル置き場（Firebase Storage）** の companies/{会社}/{folder}/{付箋id}.jpg / .pdf に置く
                  （画像は長い辺1200pxに縮めて JPEG・PDF は原本・1ファイル10MBまで＝storage.rules と同じ上限）
                  ⚠ 置き場が使えない時（見本・デモ）は、画像だけ縮小して付箋に直接持つ。PDF は付けられない
               ← upload(note,file,kind) を渡せば、そちらを使う／attach 自体が無ければ添付欄を出さない
       canMutate, canEdit(n), canDelete(n), isForeign(n), badgeHtml(n), formatText(t),
       headerExtraHtml(), postTargets:[{app,label}], targets(), sort(list), avatarHtml(id,px),
       onAutoEdit(n), onLog(msg), ask(msg,opt)→Promise<bool>, toast(msg), rerender()
     });
     ・描く … `CFNoteBoard.render()`（targets() の全部へ）／ `CFNoteBoard.html({mode:'self', compact:true})`（文字で受け取る）
     ・開く … `CFNoteBoard.openEditor(null, {title, over})`
     ・決まりだけ使う … `CFNoteBoard.rules.*`（ブラウザ無しの見張りもこれを読む）

   ⚠ class 名は今までどおり `bn-*`（リキッドのテーマの CSS が `.bn-card` を見ているため。変えない）。
   ⚠ 入れ物の名前（boardNotes／pitBoardNotes／mhsNotes）はここでは持たない（アプリ側の保存が知っている）。
   ======================================== */
(function (w, d) {
  'use strict';

  var COLORS = ['red', 'orange', 'yellow', 'green', 'blue'];
  var COLOR_JP = { red: '赤', orange: '橙', yellow: '黄', green: '緑', blue: '青' };
  var HIDE_DAYS = 3;
  var DAY = 86400000;

  /* =====================================================
     ① 決まり（画面を持たない。見張りは node からここだけ読む）
     ===================================================== */
  function toMs(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (typeof v === 'string') { var t = Date.parse(v); return isNaN(t) ? 0 : t; }
    if (typeof v === 'object') {
      if (typeof v.toMillis === 'function') { try { return v.toMillis(); } catch (e) { return 0; } }
      if (typeof v.seconds === 'number') return v.seconds * 1000;
      if (typeof v._seconds === 'number') return v._seconds * 1000;
    }
    return 0;   /* {_methodName:'FieldValue.serverTimestamp'} ＝ 写しで壊れたサーバー時刻の印 */
  }
  function isBrokenStamp(v) { return !!(v && typeof v === 'object' && typeof v._methodName === 'string'); }
  function createdMs(n) {
    if (!n) return 0;
    var c = toMs(n.createdAt); if (c) return c;
    var m = /^bn_([0-9a-z]{8})/i.exec(n.id || '');                /* CarFlow・PitFlow の id は作った時刻の36進 */
    if (m) { var ms = parseInt(m[1], 36); if (ms > 1.4e12 && ms < 4e12) return ms; }
    var h = /^n(\d{13})/.exec(n.id || '');                         /* MHS の id は 'n'＋ミリ秒 */
    if (h) return +h[1];
    return 0;
  }
  function doneMs(n) {
    if (!n || n.status !== 'done') return 0;
    return toMs(n.doneAt) || toMs(n.updatedAt) || createdMs(n) || 0;
  }
  /* 🔴 済から3日たったら盤面から隠す（データは消さない）。時刻が1つも読めない済は隠さない＝見失わない */
  function isHidden(n, now) {
    var t = doneMs(n);
    return !!t && ((now || Date.now()) - t) >= HIDE_DAYS * DAY;
  }
  function assignees(n) {
    if (!n) return [];
    if (Array.isArray(n.memberUids) && n.memberUids.length) return n.memberUids;
    if (Array.isArray(n.assignees) && n.assignees.length) return n.assignees;
    if (Array.isArray(n.m) && n.m.length) return n.m;
    return Array.isArray(n.memberUids) ? n.memberUids : [];
  }
  function bodyOf(n) { return (n && n.body != null) ? String(n.body) : String((n && n.text) || ''); }
  function meList(me) { return (Array.isArray(me) ? me : [me]).filter(function (x) { return !!x; }); }
  function isMine(id, me) { return !!id && meList(me).indexOf(id) >= 0; }
  function isSecret(n) {
    if (!n) return false;
    if (typeof n.secret === 'boolean') return n.secret;          /* 🔴 印があれば印だけを見る */
    var a = Array.isArray(n.memberUids) ? n.memberUids : [];
    if (a.length === 1 && !!n.authorUid && a[0] === n.authorUid) return true;
    var m = Array.isArray(n.m) ? n.m : [];
    return m.length === 1 && !!n.authorUid && m[0] === n.authorUid;
  }
  /* 担当が1人だけで、それが作った人（自分の別名も含む）なら自分用 */
  function secretFor(members, authorIds) {
    members = members || [];
    return members.length === 1 && isMine(members[0], authorIds);
  }
  function canSee(n, me) { return !isSecret(n) || isMine(n.authorUid, me); }
  function isForMe(n, me) { return assignees(n).some(function (u) { return isMine(u, me); }); }
  function patchDone(n, me) { return { status: 'done', doneAt: Date.now(), doneByUid: meList(me)[0] || null }; }
  function patchUndone(n) {
    var p = { status: 'open', doneAt: null, doneByUid: null };
    if (n && n.noteType === 'circulate') p.doneByUids = [];
    return p;
  }
  /* 回覧の「自分が確認」。担当に入っている自分の番号（昔の番号でも）で記録する */
  function patchCirculate(n, me) {
    var asg = assignees(n);
    var key = asg.filter(function (u) { return isMine(u, me); })[0] || meList(me)[0];
    if (!key) return null;
    var done = (Array.isArray(n.doneByUids) ? n.doneByUids : []).slice();
    var i = done.indexOf(key);
    if (i >= 0) done.splice(i, 1); else done.push(key);
    var all = asg.length > 0 && asg.every(function (u) { return done.indexOf(u) >= 0; });
    var p = { doneByUids: done };
    if (all) { p.status = 'done'; p.doneAt = Date.now(); p.doneByUid = key; }
    else { p.status = 'open'; p.doneAt = null; }
    return p;
  }
  /* 保存する形。🔴 画面だけの印（_ で始まる・app）と undefined を落とし、壊れた時刻の印を数字に直す */
  function cleanForSave(n) {
    var out = {};
    Object.keys(n || {}).forEach(function (k) {
      if (k === 'app' || k.charAt(0) === '_') return;
      var v = n[k];
      if (v === undefined || typeof v === 'function') return;
      if (isBrokenStamp(v)) {
        if (k === 'doneAt') v = (n.status === 'done') ? (toMs(n.updatedAt) || Date.now()) : null;
        else if (k === 'createdAt') v = createdMs(n) || Date.now();
        else return;
      }
      out[k] = v;
    });
    return out;
  }
  function newId() { return 'bn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  var rules = {
    HIDE_DAYS: HIDE_DAYS, toMs: toMs, isBrokenStamp: isBrokenStamp, createdMs: createdMs, doneMs: doneMs,
    isHidden: isHidden, assignees: assignees, bodyOf: bodyOf, meList: meList, isMine: isMine,
    isSecret: isSecret, secretFor: secretFor, canSee: canSee, isForMe: isForMe,
    patchDone: patchDone, patchUndone: patchUndone, patchCirculate: patchCirculate,
    cleanForSave: cleanForSave, newId: newId
  };

  /* =====================================================
     ② 画面
     ===================================================== */
  var A = null;          /* アプリの差し込み */
  var ED = null;         /* 編集中の控え */
  var _menuId = null;
  var _dragId = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function jsq(s) { return esc(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }
  function icon(name, fb, px) {
    try { if (typeof w.ic === 'function') return w.ic(name, fb || '', px || 15); } catch (e) {}
    return fb || '';
  }
  function call(name) {
    var fn = A && A[name]; if (typeof fn !== 'function') return undefined;
    var args = Array.prototype.slice.call(arguments, 1);
    try { return fn.apply(A, args); } catch (e) { console.warn('[note-board] ' + name, e); return undefined; }
  }
  function me() { return meList(call('me')); }
  function myId() { return me()[0] || null; }
  function toast(m) { if (A && A.toast) call('toast', m); }
  function ask(msg, opt) {
    if (A && A.ask) { var r = call('ask', msg, opt || {}); if (r && r.then) return r; return Promise.resolve(!!r); }
    if (w.UI && UI.confirm) return UI.confirm(msg, opt || {}).then(function (y) { return !!y; });
    return Promise.resolve(w.confirm(msg));
  }
  function log(m) { if (A && A.onLog) call('onLog', m); }
  function notes() { return (call('notes') || []).filter(function (n) { return n && n.id; }); }
  function find(id) { return notes().filter(function (n) { return n.id === id; })[0] || null; }
  function foreign(n) { return !!(A && A.isForeign && call('isForeign', n)); }
  function canMutate() { return !(A && A.canMutate) || !!call('canMutate'); }
  function canEdit(n) { if (!canMutate() || foreign(n)) return false; return !(A && A.canEdit) || !!call('canEdit', n); }
  function canDelete(n) { if (!canMutate() || foreign(n)) return false; return !(A && A.canDelete) || !!call('canDelete', n); }
  function fmt(t) { return (A && A.formatText) ? (call('formatText', t || '') || '') : esc(t || ''); }
  function labelsOf(n) { return call('labels', n) || {}; }
  function isTouch() { return ('ontouchstart' in w) || (navigator.maxTouchPoints > 0); }
  function memberOf(id) {
    if (!id) return null;
    var m = (A && A.member) ? call('member', id) : null;
    if (m) return m;
    return (call('members') || []).filter(function (x) { return x && x.id === id; })[0] || null;
  }
  function nameOf(id) { var m = memberOf(id); return (m && m.name) || ''; }
  function avatar(id, px) {
    px = px || 22;
    if (A && A.avatarHtml) { var h = call('avatarHtml', id, px); if (h) return h; }
    var m = memberOf(id) || {};
    var nm = m.name || '?';
    var st = 'width:' + px + 'px;height:' + px + 'px;font-size:' + Math.round(px * 0.42) + 'px';
    var inner = m.photo ? '<img src="' + esc(m.photo) + '" alt="" loading="lazy">' : esc(String(nm).slice(0, 1));
    return '<span class="bn-av' + (m.photo ? ' has-photo' : '') + '" title="' + esc(nm) + '" style="' + st + '">' + inner + '</span>';
  }
  function orderIndex(ids) {
    var idx = {}; (call('members') || []).forEach(function (m, i) { if (m && m.id) idx[m.id] = i; });
    return ids.slice().sort(function (a, b) { return (idx[a] == null ? 1e9 : idx[a]) - (idx[b] == null ? 1e9 : idx[b]); });
  }
  function fmtMdHm(ms) {
    if (!ms) return '';
    var t = new Date(ms); if (isNaN(t)) return '';
    return (t.getMonth() + 1) + '/' + t.getDate() + ' ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
  }
  function deadlineText(dl) {
    if (!dl) return '';
    var t = new Date(dl + 'T00:00:00'); if (isNaN(t)) return dl;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var diff = Math.round((t - today) / DAY), md = (t.getMonth() + 1) + '/' + t.getDate();
    if (diff === 0) return md + '（本日）';
    if (diff === 1) return md + '（明日）';
    return diff > 0 ? md + '（あと' + diff + '日）' : md + '（' + (-diff) + '日経過）';
  }
  function overdue(dl) { if (!dl) return false; var t = new Date(dl + 'T00:00:00'); var td = new Date(); td.setHours(0, 0, 0, 0); return !isNaN(t) && t < td; }

  /* ---------- 付箋1枚 ---------- */
  function cardHtml(n, opt) {
    opt = opt || {};
    var color = COLORS.indexOf(n.color) >= 0 ? n.color : 'yellow';
    var done = n.status === 'done', od = !done && overdue(n.deadline), fg = foreign(n);
    var circ = n.noteType === 'circulate';
    var lbl = labelsOf(n)[color] || '';
    var isAuto = !!(n.autoSource && n.autoSource.type);
    var badges = (A && A.badgeHtml ? (call('badgeHtml', n) || '') : '') +
      (isSecret(n) ? '<span class="bn-secret-badge" title="あなただけに見える付箋です（他の人の画面には出ません）">' + icon('lock', '🔒', 13) + ' 自分用</span>' : '');
    var body = bodyOf(n);
    var title = n.title ? fmt(n.title) : (body ? '' : '<span class="bn-empty-title">(無題)</span>');
    var att = n.imageURL
      ? '<img class="bn-img" src="' + esc(n.imageURL) + '" alt="" onclick="event.stopPropagation();CFNoteBoard.preview(\'' + jsq(n.imageURL) + '\')">'
      : (n.pdfURL ? '<a class="bn-pdf" href="' + esc(n.pdfURL) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + icon('fileText', '📄', 15) + ' ' + esc(n.pdfName || 'PDF') + '</a>' : '');
    var dl = n.deadline ? '<div class="bn-deadline' + (od ? ' is-overdue' : '') + '">' + (od ? icon('siren', '🚨', 13) : icon('clock', '⏰', 13)) + ' ' + esc(deadlineText(n.deadline)) + '</div>' : '';
    var asg = orderIndex(assignees(n));
    var membersHtml, circRow = '';
    if (circ) {
      var doneSet = Array.isArray(n.doneByUids) ? n.doneByUids : [];
      var nd = asg.filter(function (u) { return doneSet.indexOf(u) < 0; }), dn = asg.filter(function (u) { return doneSet.indexOf(u) >= 0; });
      membersHtml = asg.length ? nd.concat(dn).map(function (u, i) {
        var isD = doneSet.indexOf(u) >= 0;
        return '<span class="bn-mav' + (isD ? ' is-checked' : '') + '" style="margin-left:' + (i ? -6 : 0) + 'px">' + avatar(u, 22) + (isD ? '<span class="bn-mav-chk">' + icon('check', '✓', 9) + '</span>' : '') + '</span>';
      }).join('') : '<span class="bn-no-member">担当なし</span>';
      var mine = asg.some(function (u) { return isMine(u, me()); });
      var iDid = asg.some(function (u) { return isMine(u, me()) && doneSet.indexOf(u) >= 0; });
      circRow = '<div class="bn-circ-row"><span class="bn-circ-chip">' + icon('refresh', '🔁', 12) + ' 回覧 ' + dn.length + '/' + asg.length + '</span>' +
        (mine && canMutate() ? '<button type="button" class="bn-circ-self' + (iDid ? ' is-done' : '') + '" onclick="event.stopPropagation();CFNoteBoard.circulate(\'' + jsq(n.id) + '\')">' + (iDid ? '確認済み（取消）' : icon('check', '✓', 13) + ' 自分が確認') + '</button>' : '') + '</div>';
    } else {
      membersHtml = asg.length ? asg.map(function (u) { return avatar(u, 22); }).join('') : '<span class="bn-no-member">担当なし</span>';
    }
    var created = fmtMdHm(createdMs(n));
    var drag = (!opt.noDrag && A && A.reorder && canMutate() && !isTouch() && !fg)
      ? ' draggable="true" ondragstart="CFNoteBoard._drag(event,\'' + jsq(n.id) + '\')" ondragover="CFNoteBoard._over(event)" ondrop="CFNoteBoard._drop(event,\'' + jsq(n.id) + '\')" ondragend="CFNoteBoard._end(event)"' : '';
    var replies = w.CFNoteReply ? CFNoteReply.html(n) : '';
    return '<div class="bn-card bn-color-' + color + (done ? ' is-done' : '') + (od ? ' is-overdue' : '') + (isAuto ? ' is-auto' : '') + (fg ? ' cfa-foreign' : '') + '" data-note-id="' + esc(n.id) + '"' +
      (done ? ' onclick="CFNoteBoard.peek(event)"' : '') + drag + '>' +
      (done ? '<div class="bn-done-stamp">済</div>' : '') +
      (lbl ? '<div class="bn-card-label">' + esc(lbl) + '</div>' : '') +
      (canMutate() && !opt.noMenu ? '<button type="button" class="bn-menu-btn" onclick="event.stopPropagation();CFNoteBoard.menu(\'' + jsq(n.id) + '\')" title="メニュー">⋮</button>' : '') +
      (badges ? '<div class="bn-badges">' + badges + '</div>' : '') +
      (title ? '<div class="bn-title">' + title + '</div>' : '') +
      att + (body ? '<div class="bn-body">' + fmt(body) + '</div>' : '') + dl + circRow + replies +
      '<div class="bn-footer"><div class="bn-members">' + membersHtml + '</div><div class="bn-foot-right">' +
        (created ? '<div class="bn-created">' + esc(created) + '</div>' : '') +
        '<div class="bn-author">' + (isAuto ? '<span class="bn-auto-badge">' + icon('robot', '🤖', 12) + ' 自動</span>' : '') +
          (n.authorUid ? avatar(n.authorUid, 18) : '') + '<span class="bn-author-name">' + esc(nameOf(n.authorUid)) + '</span></div>' +
      '</div></div></div>';
  }

  /* ---------- ボード ---------- */
  function sorted(list) {
    if (A && A.sort) { var s = call('sort', list.slice()); if (Array.isArray(s)) return s; }
    return list.slice().sort(function (a, b) {
      var fa = foreign(a) ? 1 : 0, fb = foreign(b) ? 1 : 0;
      if (fa !== fb) return fa - fb;
      return (a.order || 0) - (b.order || 0);
    });
  }
  function split(opt) {
    var now = Date.now(), mine = me();
    var all = notes().filter(function (n) { return canSee(n, mine); });
    if (opt && opt.mode === 'self') all = all.filter(function (n) { return isForMe(n, mine); });
    return {
      shown: sorted(all.filter(function (n) { return !isHidden(n, now); })),
      hidden: all.filter(function (n) { return isHidden(n, now); }).sort(function (a, b) { return doneMs(b) - doneMs(a); })
    };
  }
  function html(opt) {
    opt = opt || {};
    if (!A) return '';
    var S = split(opt);
    var legendSrc = labelsOf({ color: 'yellow', app: A.app }) || {};
    var legend = COLORS.filter(function (c) { return legendSrc[c]; }).map(function (c) { return '<span class="bn-label-chip bn-label-' + c + '">' + esc(legendSrc[c]) + '</span>'; }).join('');
    var doneBtn = S.hidden.length
      ? '<button type="button" class="bn-done-btn" onclick="CFNoteBoard.openDone(' + (opt.mode === 'self' ? "'self'" : '') + ')" title="済から' + HIDE_DAYS + '日たった付箋。消えてはいません">' + icon('archive', '🗂', 14) + ' 済んだ付箋 <b>' + S.hidden.length + '</b></button>' : '';
    var extra = (A.headerExtraHtml ? (call('headerExtraHtml') || '') : '');
    var add = canMutate() ? '<button type="button" class="bn-add-btn" onclick="CFNoteBoard.openEditor(null)">＋ 付箋を追加</button>' : '';
    var head = '<div class="bn-header' + (opt.compact ? ' is-compact' : '') + '"><div class="bn-header-left">' +
      (opt.compact ? '' : '<span class="bn-header-icon">' + icon('pin', '📌', 16) + '</span><span class="bn-header-title">' + esc(opt.title || '全体タスク') + '</span>') +
      '<div class="bn-label-chips">' + legend + '</div></div><div class="bn-header-right">' + doneBtn + extra + add + '</div></div>';
    var cards = S.shown.length ? S.shown.map(function (n) {
      try { return cardHtml(n); }
      catch (e) { console.error('[note-board] card', n && n.id, e); return '<div class="bn-card bn-color-yellow"><div class="bn-title">' + icon('warn', '⚠', 14) + ' 表示エラー（' + esc(n && n.id) + '）</div></div>'; }
    }).join('') : '<div class="bn-empty">' + esc(opt.empty || (S.hidden.length ? '出ている付箋はありません（済んだ付箋は上のボタンから見られます）' : '付箋はまだありません。「＋ 付箋を追加」から最初の1枚を作りましょう。')) + '</div>';
    return '<div class="cfnb">' + head + '<div class="bn-grid" ondragover="CFNoteBoard._over(event)">' + cards + '</div></div>';
  }
  function render() {
    if (!A) return;
    if (A.rerender && !render._inner) { render._inner = true; try { call('rerender'); } finally { render._inner = false; } return; }
    var ts = (call('targets') || []).filter(Boolean);
    if (!ts.length) return;
    var h = html(A.boardOptions || {});
    ts.forEach(function (t) { t.innerHTML = h; });
  }

  /* ---------- 画面の上に出す窓（アプリの窓の作りに頼らない） ---------- */
  function overlay(id, inner, cls) {
    var el = d.getElementById(id);
    if (!el) { el = d.createElement('div'); el.id = id; d.body.appendChild(el); }
    el.className = 'cfnb-ovl ' + (cls || '');
    el.innerHTML = inner;
    el.onclick = function (e) { if (e.target === el) closeOverlay(id); };
    el.classList.add('open');
    return el;
  }
  function closeOverlay(id) { var el = d.getElementById(id); if (el) el.classList.remove('open'); }

  /* ⋮ メニュー */
  function menu(id) {
    var n = find(id); if (!n) return;
    _menuId = id;
    var done = n.status === 'done', circ = n.noteType === 'circulate';
    var b = function (act, label, cls) { return '<button type="button" class="bn-actionsheet-btn ' + (cls || '') + '" data-act="' + act + '" onclick="CFNoteBoard._act(\'' + act + '\')">' + label + '</button>'; };
    overlay('cfnb-actions',
      '<div class="bn-actionsheet"><div class="bn-actionsheet-title">' + esc(n.title || bodyOf(n).slice(0, 30) || '付箋メニュー') + '</div>' +
      (canEdit(n) ? b('edit', icon('pencil', '✏️', 15) + ' 編集') : '') +
      (!done && !circ ? b('done', icon('check', '✅', 15) + ' 済にする') : '') +
      (done ? b('undone', icon('undo', '↩️', 15) + ' 未済に戻す') : '') +
      b('reply', icon('comment', '💬', 15) + ' 返信する') +
      (canDelete(n) ? b('delete', icon('trash', '🗑', 15) + ' 消去', 'bn-actionsheet-danger') : '') +
      b('cancel', 'キャンセル', 'bn-actionsheet-cancel') + '</div>', 'is-sheet');
  }
  function act(a) {
    var id = _menuId; closeOverlay('cfnb-actions'); _menuId = null;
    if (!id || a === 'cancel') return;
    if (a === 'edit') return openEditor(id);
    if (a === 'done') return markDone(id);
    if (a === 'undone') return markUndone(id);
    if (a === 'delete') return removeNote(id);
    if (a === 'reply') {
      /* 返信は付箋の中の欄（共通部品 coreflow-note-reply.js）で書く。⋮ からはその欄を開くだけ */
      var card = d.querySelector('.bn-card[data-note-id="' + String(id).replace(/"/g, '') + '"]');
      var btn = card && card.querySelector('.cfr-open');
      if (card && btn && w.CFNoteReply && CFNoteReply.open) {
        try { card.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
        CFNoteReply.open({ target: btn }, id);
      } else toast('付箋の下の「返信を書く…」から書けます');
    }
  }

  function saveNote(n, info) {
    var r = call('save', n, info || {});
    return (r && r.then) ? r : Promise.resolve(r);
  }
  function markDone(id) {
    var n = find(id); if (!n) return;
    Object.assign(n, patchDone(n, me()));
    return saveNote(n).then(function () { log('付箋「' + (n.title || '(無題)') + '」を済にしました'); render(); })
      .catch(function (e) { console.error(e); toast('保存できませんでした'); });
  }
  function markUndone(id) {
    var n = find(id); if (!n) return;
    Object.assign(n, patchUndone(n));
    return saveNote(n).then(function () { log('付箋「' + (n.title || '(無題)') + '」を未済に戻しました'); render(); })
      .catch(function (e) { console.error(e); toast('保存できませんでした'); });
  }
  function circulate(id) {
    var n = find(id); if (!n) return;
    if (!canMutate()) { toast('閲覧専用では操作できません'); return; }
    var p = patchCirculate(n, me());
    if (!p) { toast('自分が誰か分かりません（ログインし直してください）'); return; }
    Object.assign(n, p);
    return saveNote(n).then(function () {
      log(p.status === 'done' ? '回覧付箋「' + (n.title || '(無題)') + '」が全員確認済みになりました' : '回覧付箋「' + (n.title || '(無題)') + '」を確認しました');
      render();
    }).catch(function (e) { console.error(e); toast('保存できませんでした'); });
  }
  function removeNote(id) {
    var n = find(id); if (!n || !canDelete(n)) return;
    return ask('付箋「' + (n.title || bodyOf(n).slice(0, 20) || '(無題)') + '」を消去しますか？', { ok: '消去する', danger: true }).then(function (yes) {
      if (!yes) return;
      var r = call('remove', n);
      return Promise.resolve(r).then(function () { attachCleanup(n); log('付箋を消去しました'); render(); });
    }).catch(function (e) { console.error(e); toast('消去できませんでした'); });
  }

  /* 済んだ付箋（3日たって隠れた分） */
  function openDone(mode) {
    var S = split({ mode: mode });
    var rows = S.hidden.map(function (n) {
      var t = doneMs(n), by = nameOf(n.doneByUid);
      return '<div class="cfnb-done-row"><div class="cfnb-done-main"><b>' + esc(n.title || bodyOf(n).slice(0, 40) || '(無題)') + '</b>' +
        '<span>' + esc(fmtMdHm(t)) + ' 済' + (by ? '・' + esc(by) : '') + (foreign(n) && A.badgeHtml ? '' : '') + '</span></div>' +
        '<div class="cfnb-done-acts"><button type="button" class="cfnb-btn" onclick="CFNoteBoard._doneView(\'' + jsq(n.id) + '\')">見る</button>' +
        (canMutate() ? '<button type="button" class="cfnb-btn primary" onclick="CFNoteBoard._doneBack(\'' + jsq(n.id) + '\')">戻す</button>' : '') + '</div></div>';
    }).join('');
    overlay('cfnb-done', '<div class="cfnb-box"><div class="cfnb-head"><b>' + icon('archive', '🗂', 16) + ' 済んだ付箋（' + S.hidden.length + '）</b><button type="button" class="cfnb-x" onclick="CFNoteBoard._close(\'cfnb-done\')">' + icon('close', '✕', 15) + '</button></div>' +
      '<div class="cfnb-body"><div class="cfnb-note">済にしてから' + HIDE_DAYS + '日たった付箋です。<b>消えてはいません。</b>「戻す」で未済に戻ってボードに出ます。</div>' +
      (rows || '<div class="bn-empty">済んだ付箋はありません</div>') + '<div id="cfnb-done-view"></div></div></div>', '');
    openDone._mode = mode;
  }

  /* 画像を大きく */
  function preview(url) {
    if (!url) return;
    overlay('cfnb-image', '<button type="button" class="cfnb-img-x" onclick="CFNoteBoard._close(\'cfnb-image\')">' + icon('close', '✕', 18) + '</button><img src="' + esc(url) + '" alt="" onclick="CFNoteBoard._close(\'cfnb-image\')">', 'is-image');
  }
  function peek(e) {
    var t = e && e.target;
    if (t && t.closest && t.closest('a,button,textarea,input,.bn-img,.cfr')) return;
    var c = e && e.currentTarget; if (c) c.classList.toggle('bn-peek');
  }

  /* ---------- 編集の窓 ---------- */
  function openEditor(id, opt) {
    if (!A) return;
    opt = opt || {};
    if (!canMutate()) { toast('閲覧専用では作れません'); return; }
    var n = id ? find(id) : null;
    if (id && !n) { toast('付箋が見つかりません'); return; }
    if (n && !canEdit(n)) { toast(foreign(n) ? 'よそのアプリの付箋は、そのアプリで直してください' : 'この付箋は直せません'); return; }
    if (n && n.autoSource && A.onAutoEdit && call('onAutoEdit', n)) return;
    var targets = A.postTargets || null;
    ED = {
      id: n ? n.id : null, app: n ? (n.app || A.app) : ((targets && targets[0] && targets[0].app) || A.app),
      title: n ? (n.title || '') : (opt.title || ''), body: n ? bodyOf(n) : '',
      color: n && COLORS.indexOf(n.color) >= 0 ? n.color : 'yellow',
      type: n && n.noteType === 'circulate' ? 'circulate' : 'execute',
      deadline: n ? (n.deadline || '') : '', members: n ? assignees(n).slice() : [],
      author: n ? (n.authorUid || null) : myId(),
      att: { changed: false, file: null, kind: '', name: '', data: '', imageURL: n ? (n.imageURL || '') : '', pdfURL: n ? (n.pdfURL || '') : '', pdfName: n ? (n.pdfName || '') : '' }
    };
    var el = overlay('cfnb-editor', '<div class="cfnb-box cfnb-editor"><div class="cfnb-head"><b>' + (n ? '付箋を編集' : '付箋を追加') + '</b><button type="button" class="cfnb-x" onclick="CFNoteBoard._close(\'cfnb-editor\')">' + icon('close', '✕', 15) + '</button></div>' +
      '<div class="cfnb-body bn-modal-body" id="cfnb-ed-body"></div>' +
      '<div class="cfnb-foot"><button type="button" class="cfnb-btn" onclick="CFNoteBoard._close(\'cfnb-editor\')">キャンセル</button><button type="button" class="cfnb-btn primary" id="cfnb-ed-save" onclick="CFNoteBoard._saveEditor()">' + icon('save', '💾', 15) + ' 保存</button></div></div>', opt.over ? 'is-over' : '');
    edRender();
    setTimeout(function () { var t = d.getElementById('cfnb-ed-title'); if (t && !n) t.focus(); }, 60);
    return el;
  }
  function edPull() {
    if (!ED) return;
    var g = function (i) { var e = d.getElementById(i); return e ? e.value : null; };
    var v = g('cfnb-ed-title'); if (v != null) ED.title = v;
    v = g('cfnb-ed-body'); if (v != null) ED.body = v;
    v = g('cfnb-ed-deadline'); if (v != null) ED.deadline = v;
  }
  function edRender() {
    var box = d.getElementById('cfnb-ed-body'); if (!box || !ED) return;
    edPull();
    var targets = A.postTargets || null;
    var appSeg = (targets && !ED.id) ? '<div class="cfnb-fld"><label>投稿先</label><div class="bn-seg">' + targets.map(function (t) {
      return '<button type="button" class="' + (ED.app === t.app ? 'on' : '') + '" onclick="CFNoteBoard._ed(\'app\',\'' + jsq(t.app) + '\')">' + esc(t.label) + '</button>';
    }).join('') + '</div></div>' : '';
    var lbls = labelsOf({ color: ED.color, app: ED.app }) || {};
    var sw = COLORS.map(function (c) {
      return '<label class="bn-cp-lbl"><input type="radio" name="cfnb-color" ' + (ED.color === c ? 'checked' : '') + ' onclick="CFNoteBoard._ed(\'color\',\'' + c + '\')"><span class="bn-color-swatch bn-sw-' + c + '"></span><span class="bn-color-pick-label">' + esc(lbls[c] || COLOR_JP[c]) + '</span></label>';
    }).join('');
    var typeSeg = '<div class="bn-seg">' + [['execute', icon('check', '✓', 13) + ' 実行'], ['circulate', icon('refresh', '🔁', 13) + ' 回覧']].map(function (t) {
      return '<button type="button" class="' + (ED.type === t[0] ? 'on' : '') + '" onclick="CFNoteBoard._ed(\'type\',\'' + t[0] + '\')">' + t[1] + '</button>';
    }).join('') + '</div>';
    var groups = (call('quickGroups', ED.app) || []).filter(function (g) { return g && g.ids && g.ids.length; });
    var list = (call('members', ED.app) || []).filter(function (m) { return m && m.id; });
    var q = '<button type="button" class="cfnb-chip" onclick="CFNoteBoard._ed(\'all\')">全員</button><button type="button" class="cfnb-chip is-mute" onclick="CFNoteBoard._ed(\'clear\')">クリア</button>' +
      groups.map(function (g, i) {
        var on = g.ids.every(function (u) { return ED.members.indexOf(u) >= 0; });
        return '<button type="button" class="cfnb-chip' + (on ? ' on' : '') + '" onclick="CFNoteBoard._ed(\'group\',' + i + ')">' + icon('users', '👥', 12) + ' ' + esc(g.label) + '</button>';
      }).join('');
    var chips = list.map(function (m) {
      var on = ED.members.indexOf(m.id) >= 0;
      return '<label class="bn-member-pick' + (on ? ' is-checked' : '') + '" onclick="event.preventDefault();CFNoteBoard._ed(\'member\',\'' + jsq(m.id) + '\')">' + avatar(m.id, 22) + '<span>' + esc(m.name) + '</span></label>';
    }).join('') || '<span class="cfnb-muted">名簿を読み込み中…</span>';
    var authorIds = (ED.author && isMine(ED.author, me())) ? me() : [ED.author];
    var sec = secretFor(ED.members, authorIds);
    var attach = '';
    if (A.attach) {
      var a = ED.att, pv = '';
      if (a.kind === 'pdf' || (!a.changed && a.pdfURL)) pv = '<span class="bn-pdf">' + icon('fileText', '📄', 14) + ' ' + esc(a.name || a.pdfName || 'PDF') + '</span>';
      else if (a.data || (!a.changed && a.imageURL)) pv = '<img src="' + esc(a.data || a.imageURL) + '" alt="" class="cfnb-att-img">';
      var accept = A.attach.accept || 'image/*';
      attach = '<div class="cfnb-fld"><label>' + (/pdf/.test(accept) ? '画像・PDF' : '画像') + '（任意・1つの付箋に1つ・10MBまで）</label>' +
        '<label class="bn-file"><span class="ic">' + icon('image', '🖼', 15) + '</span><span>' + (/pdf/.test(accept) ? '画像・PDFを選ぶ' : '画像を選ぶ') + '</span><input type="file" accept="' + esc(accept) + '" onchange="CFNoteBoard._file(this)"></label>' +
        (pv ? '<div class="cfnb-att">' + pv + '<button type="button" class="cfnb-btn" onclick="CFNoteBoard._ed(\'noatt\')">外す</button></div>' : '') + '</div>';
    }
    box.innerHTML = appSeg +
      '<div class="cfnb-fld"><label>タイトル</label><input type="text" id="cfnb-ed-title" maxlength="60" value="' + esc(ED.title) + '" placeholder="例：急ぎ洗車"></div>' +
      '<div class="cfnb-fld"><label>本文</label><textarea id="cfnb-ed-body" rows="3" maxlength="600" placeholder="例：来店予定あり、本日午後までに洗ってほしいです">' + esc(ED.body) + '</textarea></div>' +
      '<div class="cfnb-fld"><label>色</label><div class="bn-color-picker">' + sw + '</div></div>' +
      '<div class="cfnb-fld"><label>種類</label>' + typeSeg + '<div class="cfnb-muted">実行＝誰かが「済」にしたら完了／回覧＝担当が各自「確認」して全員で完了</div></div>' +
      '<div class="cfnb-fld"><label>期限（任意）</label><input type="date" id="cfnb-ed-deadline" value="' + esc(ED.deadline) + '"></div>' +
      '<div class="cfnb-fld"><label>担当メンバー（任意・複数選択可）</label><div class="cfnb-quick">' + q + '</div><div class="bn-member-list">' + chips + '</div>' +
        (sec ? '<div class="cfnb-secret">' + icon('lock', '🔒', 13) + ' 自分ひとりだけを担当にしているので、<b>あなただけに見える自分用の付箋</b>になります。</div>' : '') + '</div>' +
      attach;
  }
  function edAction(kind, val) {
    if (!ED) return;
    edPull();
    if (kind === 'app') { ED.app = val; }
    else if (kind === 'color') { ED.color = val; return; }
    else if (kind === 'type') ED.type = val;
    else if (kind === 'all') ED.members = (call('members', ED.app) || []).map(function (m) { return m.id; });
    else if (kind === 'clear') ED.members = [];
    else if (kind === 'member') { var i = ED.members.indexOf(val); if (i >= 0) ED.members.splice(i, 1); else ED.members.push(val); }
    else if (kind === 'group') {
      var g = (call('quickGroups', ED.app) || []).filter(function (x) { return x && x.ids && x.ids.length; })[val];
      if (g) {
        var allIn = g.ids.every(function (u) { return ED.members.indexOf(u) >= 0; });
        if (allIn) ED.members = ED.members.filter(function (u) { return g.ids.indexOf(u) < 0; });
        else g.ids.forEach(function (u) { if (ED.members.indexOf(u) < 0) ED.members.push(u); });
      }
    }
    else if (kind === 'noatt') ED.att = { changed: true, file: null, kind: '', name: '', data: '', imageURL: '', pdfURL: '', pdfName: '' };
    edRender();
  }
  /* ---------- 添付（ファイル置き場） ---------- */
  var MAX_FILE = 10 * 1024 * 1024;   /* storage.rules の上限と同じ */
  function storageRoot(app) {
    var st = A && A.attach && A.attach.storage; if (!st) return null;
    var folder = typeof st.folder === 'function' ? st.folder(app || A.app) : st.folder;
    var cid = typeof st.company === 'function' ? st.company() : st.company;
    var S = null;
    try { S = (w.firebase && typeof firebase.storage === 'function') ? firebase.storage() : null; } catch (e) { S = null; }
    if (!S || !folder || !cid) return null;
    return S.ref('companies/' + cid + '/' + folder);
  }
  function resizeBlob(file, max, q) {
    return new Promise(function (res, rej) {
      var rd = new FileReader();
      rd.onerror = rej;
      rd.onload = function (e) {
        var img = new Image();
        img.onerror = rej;
        img.onload = function () {
          var iw = img.width, ih = img.height;
          if (iw > max || ih > max) { var r = Math.min(max / iw, max / ih); iw = Math.round(iw * r); ih = Math.round(ih * r); }
          var cv = d.createElement('canvas'); cv.width = iw; cv.height = ih;
          cv.getContext('2d').drawImage(img, 0, 0, iw, ih);
          cv.toBlob(function (b) { b ? res(b) : rej(new Error('画像を縮められませんでした')); }, 'image/jpeg', q);
        };
        img.src = e.target.result;
      };
      rd.readAsDataURL(file);
    });
  }
  /* 選んだ添付を付箋に反映する。🔴 1つの付箋に1点（画像を付けたら PDF は外す・逆も） */
  function attachApply(n, a) {
    if (A.attach.upload) {
      return Promise.resolve(a.file ? A.attach.upload(n, a.file, a.kind) : (A.attach.clear ? A.attach.clear(n) : { imageURL: '', pdfURL: '', pdfName: '' }))
        .then(function (p) { if (p) Object.assign(n, p); });
    }
    var root = storageRoot(n.app || A.app);
    if (!root) {
      if (a.kind === 'pdf') { var er = new Error('no storage'); er.userMsg = 'PDF はいまは付けられません（ファイル置き場につながっていません）'; return Promise.reject(er); }
      n.imageURL = a.data || ''; n.pdfURL = ''; n.pdfName = '';
      return Promise.resolve();
    }
    var img = root.child(n.id + '.jpg'), pdf = root.child(n.id + '.pdf');
    var del = function (ref) { return ref.delete().catch(function () {}); };
    if (!a.file) return Promise.all([del(img), del(pdf)]).then(function () { n.imageURL = ''; n.pdfURL = ''; n.pdfName = ''; });
    if (a.kind === 'pdf') {
      return pdf.put(a.file, { contentType: 'application/pdf' }).then(function () { return pdf.getDownloadURL(); }).then(function (url) {
        var had = n.imageURL; n.pdfURL = url; n.pdfName = a.name || 'PDF'; n.imageURL = '';
        return (had && /^https?:/.test(had)) ? del(img) : null;
      });
    }
    return resizeBlob(a.file, 1200, 0.85).then(function (b) { return img.put(b, { contentType: 'image/jpeg' }); })
      .then(function () { return img.getDownloadURL(); }).then(function (url) {
        var had = n.pdfURL; n.imageURL = url; n.pdfURL = ''; n.pdfName = '';
        return had ? del(pdf) : null;
      });
  }
  /* 付箋を消した時、置き場のファイルも消す（見つからなくても気にしない） */
  function attachCleanup(n) {
    if (!A.attach || A.attach.upload || !(n.imageURL || n.pdfURL)) return;
    var root = storageRoot(n.app || A.app); if (!root) return;
    if (n.imageURL && /^https?:/.test(n.imageURL)) root.child(n.id + '.jpg').delete().catch(function () {});
    if (n.pdfURL) root.child(n.id + '.pdf').delete().catch(function () {});
  }

  function onFile(input) {
    var f = input && input.files && input.files[0]; if (!f || !ED) return;
    var isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
    if (isPdf && !/pdf/.test((A.attach && A.attach.accept) || '')) { toast('画像ファイルを選んでください'); input.value = ''; return; }
    if (f.size > MAX_FILE) { toast('ファイルが大きすぎます（10MBまで）'); input.value = ''; return; }
    if (isPdf && !A.attach.upload && !storageRoot(ED.app)) { toast('PDF はいまは付けられません（ファイル置き場につながっていません）'); input.value = ''; return; }
    if (!isPdf && !/^image\//.test(f.type)) { toast('画像ファイルを選んでください'); input.value = ''; return; }
    ED.att = { changed: true, file: f, kind: isPdf ? 'pdf' : 'image', name: f.name || '', data: '', imageURL: '', pdfURL: '', pdfName: '' };
    if (isPdf) { edRender(); return; }
    var rd = new FileReader();
    rd.onload = function (e) {
      if (A.attach && (A.attach.upload || storageRoot(ED.app))) { ED.att.data = e.target.result; edRender(); return; }   /* 保存の時に置き場へ上げる */
      /* 保存先が無いアプリは、縮小して dataURL で持つ（長い辺 1000px・JPEG 0.82） */
      var img = new Image();
      img.onload = function () {
        var MAX = 1000, iw = img.width, ih = img.height;
        if (iw > MAX || ih > MAX) { var r = Math.min(MAX / iw, MAX / ih); iw = Math.round(iw * r); ih = Math.round(ih * r); }
        var cv = d.createElement('canvas'); cv.width = iw; cv.height = ih;
        cv.getContext('2d').drawImage(img, 0, 0, iw, ih);
        ED.att.data = cv.toDataURL('image/jpeg', 0.82);
        edRender();
      };
      img.src = e.target.result;
    };
    rd.readAsDataURL(f);
  }
  function saveEditor() {
    if (!ED) return;
    edPull();
    var title = String(ED.title || '').trim(), body = String(ED.body || '').trim();
    if (!title && !body) { toast('タイトルか本文のどちらかは入力してください'); return; }
    var btn = d.getElementById('cfnb-ed-save'); if (btn) btn.disabled = true;
    var isNew = !ED.id;
    var n = isNew ? null : find(ED.id);
    if (!isNew && !n) { toast('対象の付箋が見つかりません'); if (btn) btn.disabled = false; return; }
    if (isNew) {
      n = { id: (A.newId ? call('newId', ED.app) : null) || newId(), createdAt: Date.now(), authorUid: myId(), status: 'open',
            doneByUids: [], replies: [], imageURL: '', pdfURL: '', pdfName: '',
            order: (A.nextOrder ? call('nextOrder', ED.app) : null) };
      if (n.order == null) n.order = notes().filter(function (x) { return !foreign(x); }).reduce(function (m, x) { return typeof x.order === 'number' && x.order > m ? x.order : m; }, -1) + 1;
      if (ED.app && ED.app !== A.app) n.app = ED.app;
    }
    n.title = title; n.body = body; n.color = ED.color; n.noteType = ED.type;
    n.deadline = ED.deadline || null; n.memberUids = ED.members.slice();
    if (!Array.isArray(n.doneByUids)) n.doneByUids = [];
    var authorIds = (n.authorUid && isMine(n.authorUid, me())) ? me() : [n.authorUid];
    n.secret = secretFor(n.memberUids, authorIds);
    var a = ED.att, up = Promise.resolve();
    if (a.changed && A.attach) up = attachApply(n, a);
    return up.then(function () { return saveNote(n, { isNew: isNew, app: n.app || A.app }); }).then(function () {
      log((isNew ? '付箋を追加しました：' : '付箋を更新しました：') + (title || body.slice(0, 20)));
      closeOverlay('cfnb-editor'); ED = null; render();
    }).catch(function (e) {
      console.error('[note-board] save', e); toast((e && e.userMsg) || '保存できませんでした（添付を付けた時は、ファイルの大きさと通信を確かめてください）');
      if (btn) btn.disabled = false;
    });
  }

  /* ---------- 並び替え（自分のアプリの付箋だけ） ---------- */
  function dragStart(e, id) {
    if (!canMutate()) { e.preventDefault(); return; }
    _dragId = id;
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); } catch (x) {}
    if (e.currentTarget) e.currentTarget.classList.add('is-dragging');
  }
  function dragOver(e) { if (_dragId) { e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch (x) {} } }
  function dragDrop(e, targetId) {
    e.preventDefault(); e.stopPropagation();
    var src = _dragId; _dragId = null;
    if (!src || src === targetId || !A.reorder) return;
    var own = notes().filter(function (n) { return !foreign(n); }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var from = own.findIndex(function (n) { return n.id === src; }), to = own.findIndex(function (n) { return n.id === targetId; });
    if (from < 0 || to < 0) return;
    var mv = own.splice(from, 1)[0]; own.splice(to, 0, mv);
    own.forEach(function (n, i) { n.order = i; });
    Promise.resolve(call('reorder', own)).catch(function (x) { console.error(x); });
    render();
  }
  function dragEnd() { _dragId = null; d.querySelectorAll('.bn-card.is-dragging').forEach(function (c) { c.classList.remove('is-dragging'); }); }

  /* ---------- 差し込み ---------- */
  function mount(adapter) {
    A = adapter || null;
    if (!A) return;
    if (w.CFNoteReply) {
      CFNoteReply.setup({
        getNote: function (id) { return find(id); },
        getMe: function () { return myId(); },
        avatarHtml: function (uid, px) { return avatar(uid, px); },
        formatText: function (t) { return fmt(t); },
        canWrite: function () { return canMutate(); },
        canDelete: function (r) { return !!(r && (isMine(r.uid, me()) || (A.canDeleteReply && call('canDeleteReply', r)))); },
        save: function (n, done) { saveNote(n).then(function () { if (done) done(); }).catch(function (e) { console.error(e); toast('返信を保存できませんでした'); }); },
        rerender: function () { render(); },
        toast: function (m) { toast(m); },
        ask: function (msg, cb) { ask(msg, { ok: '消す', danger: true }).then(function (y) { cb(!!y); }); }
      });
    }
  }

  w.CFNoteBoard = {
    rules: rules,
    mount: mount,
    adapter: function () { return A; },
    html: html,
    render: render,
    cardHtml: cardHtml,
    openEditor: openEditor,
    editingId: function () { return ED ? ED.id : null; },
    menu: menu,
    markDone: markDone,
    markUndone: markUndone,
    circulate: circulate,
    remove: removeNote,
    openDone: openDone,
    preview: preview,
    peek: peek,
    hiddenCount: function (mode) { return A ? split({ mode: mode }).hidden.length : 0; },
    _act: act,
    _close: closeOverlay,
    _ed: edAction,
    _file: onFile,
    _saveEditor: saveEditor,
    _drag: dragStart, _over: dragOver, _drop: dragDrop, _end: dragEnd,
    _doneBack: function (id) { markUndone(id); setTimeout(function () { openDone(openDone._mode); }, 50); },
    _doneView: function (id) { var n = find(id), v = d.getElementById('cfnb-done-view'); if (n && v) v.innerHTML = '<div class="cfnb-done-card">' + cardHtml(n, { noDrag: true, noMenu: true }) + '</div>'; }
  };
})(window, document);
