/* ========================================
   oplog-pit.js  -  操作ログ（PitFlow）
   ----------------------------------------
   ◎なにをするもの
     「誰が・いつ・何をしたか」を1行ずつ残す。CarFlow / StockFlow と同じ考え方。
     あとから書き換えられない（作るだけ・消せるのはマスターのみ）。

   ◎どこに残るか
     本番：companies/kobayashi_motors/pitAuditLogs（全員で共有・直近1000件を表示）
     サンプル：この端末の中だけ（localStorage・直近500件）

   ◎使い方（他のファイルから）
     pitLog('予約を作成', { cardId:c.id, label:'山田 様 / タント' })
     ・ログを残すこと自体で操作を止めない。失敗しても黙って捨てる（画面の邪魔をしない）。
   ======================================== */
(function () {
  'use strict';

  var LS_KEY = 'pitflow_oplog_v1';
  var LIMIT = 1000;
  var _cache = null;      // 画面表示用（直近ぶん）
  var _q = '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nowStr(d) {
    d = d || new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function meName() {
    if (window.pitCurrentStaffName) {
      var n = pitCurrentStaffName();
      if (n) return n;
    }
    var me = null;
    try { me = localStorage.getItem('pitflow_bn_me'); } catch (e) {}
    var list = (window.state && state.staff) || [];
    var s = list.find(function (x) { return x.id === me; })
         || list.find(function (x) { return x.front; }) || list[0];
    return (s && s.name) || '—';
  }

  /* ---- 1件残す ---- */
  window.pitLog = function (action, opt) {
    if (!action) return;
    opt = opt || {};
    var entry = {
      at: Date.now(),
      timeStr: nowStr(),
      userName: opt.user || meName(),
      action: String(action),
      label: opt.label || '',
      cardId: opt.cardId || '',
      kind: opt.kind || ''
    };

    if (window.PIT_CLOUD && window.fb && window.fb.ready && window.fb.currentUser) {
      var doc = {
        time: window.fb.serverTimestamp(),
        timeStr: entry.timeStr,
        uid: window.fb.currentUser.uid,
        userName: entry.userName,
        action: entry.action,
        label: entry.label,
        cardId: entry.cardId,
        kind: entry.kind
      };
      window.fb.company().collection('pitAuditLogs').add(doc)
        .catch(function (e) { console.warn('[oplog] 記録に失敗（操作は続きます）', e); });
      if (_cache) { _cache.unshift(entry); if (state.currentView === 'oplog') renderOplog(); }
      return;
    }

    /* サンプルモード：この端末の中だけ */
    try {
      var arr = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      arr.unshift(entry);
      if (arr.length > 500) arr.length = 500;
      localStorage.setItem(LS_KEY, JSON.stringify(arr));
      _cache = arr;
    } catch (e) {}
    if (window.state && state.currentView === 'oplog') renderOplog();
  };

  /* ---- 読み込み ---- */
  function load() {
    if (window.PIT_CLOUD && window.fb && window.fb.ready && window.fb.currentUser) {
      return window.fb.company().collection('pitAuditLogs')
        .orderBy('time', 'desc').limit(LIMIT).get()
        .then(function (snap) {
          var out = [];
          snap.forEach(function (d) {
            var o = d.data() || {};
            out.push({
              at: (o.time && o.time.toMillis) ? o.time.toMillis() : 0,
              timeStr: o.timeStr || '', userName: o.userName || '—',
              action: o.action || '', label: o.label || '', cardId: o.cardId || '', kind: o.kind || ''
            });
          });
          _cache = out;
          return out;
        })
        .catch(function (e) {
          console.error('[oplog] 読み込みに失敗', e);
          _cache = [];
          return [];
        });
    }
    try { _cache = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { _cache = []; }
    return Promise.resolve(_cache);
  }

  /* ---- 画面 ---- */
  function renderOplog() {
    var box = document.getElementById('oplog-body');
    if (!box) return;

    if (_cache === null) {
      box.innerHTML = '<div class="op-loading">読み込んでいます…</div>';
      load().then(function () { renderOplog(); });
      return;
    }

    var q = _q.trim().toLowerCase();
    var list = _cache.filter(function (e) {
      if (!q) return true;
      return (e.userName + ' ' + e.action + ' ' + e.label).toLowerCase().indexOf(q) >= 0;
    });

    var h = '';
    h += '<div class="op-bar">'
       + '<span class="op-search"><i data-ic=search data-ics=15></i>'
       + '<input id="op-q" type="search" autocomplete="off" placeholder="名前・操作・車で絞り込み" value="' + esc(_q) + '" oninput="pitOplogSearch(this.value)"></span>'
       + '<span class="op-count">' + list.length + ' 件' + (q ? '（全' + _cache.length + '件中）' : '') + '</span>'
       + '<button class="op-reload" onclick="pitOplogReload()"><i data-ic=refresh data-ics=15></i> 最新に更新</button>'
       + '</div>';

    if (!window.PIT_CLOUD) {
      h += '<div class="op-note"><i data-ic=info data-ics=15></i> いまはこの端末の中だけの記録です（直近500件）。本番では全員ぶんが共有されます。</div>';
    }

    if (!list.length) {
      h += '<div class="op-empty">まだ記録がありません。</div>';
    } else {
      h += '<div class="op-list">';
      list.forEach(function (e) {
        h += '<div class="op-row">'
          + '<span class="op-time">' + esc(e.timeStr) + '</span>'
          + '<span class="op-user">' + esc(e.userName) + '</span>'
          + '<span class="op-act">' + esc(e.action) + '</span>'
          + '<span class="op-label">' + (e.cardId
              ? '<a href="javascript:void(0)" onclick="pitOpenCardDetail(\'' + esc(e.cardId) + '\')">' + esc(e.label) + '</a>'
              : esc(e.label)) + '</span>'
          + '</div>';
      });
      h += '</div>';
    }

    box.innerHTML = h;
    if (window.icoBoot) icoBoot(box);
  }
  window.renderOplog = renderOplog;

  window.pitOplogSearch = function (v) {
    _q = v || '';
    renderOplog();
    var i = document.getElementById('op-q');
    if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  };
  window.pitOplogReload = function () {
    _cache = null;
    renderOplog();
  };
})();
