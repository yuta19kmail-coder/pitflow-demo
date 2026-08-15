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

   ◎🔴 v1.84.0 「選んでまとめて消す」（マスター限定・ゆうた依頼 2026-08-12）
     各行の**右はしにチェックBOX**。選んでから［選んだ ◯件 を消す］で**まとめて**消える。
     ⚠ 全消し（ぜんぶ消すボタン）は作っていない。**必ず自分で選んでから消す。**

     ・出る人＝`pitIsMaster()`（auth-pit.js）が true の人だけ。本番はマスター（ゆうた）1人。
       練習用サイト（サンプル／デモ版）は**この端末の中だけの記録**なので全員に出る。
     ・Firestore のルールも `pitAuditLogs` の delete＝`_isMaster()` で締めてある
       （`CarFlow\carflow\firestore.rules`）。**画面側だけ広げてもサーバーが拒否する**＝
       「押せるのに消えないボタン」になるので、権限を変えたい時は必ず両方直すこと。
     ・🔴 **消したことは記録に残さない**（ゆうた指示 2026-08-12）。
       消せるのはマスター（ゆうた本人）だけ＝**誰がやったかを追う相手がいない**ので、
       「操作ログを◯件消去」の行が増えるだけ邪魔になる。
       ⚠ もし将来ほかの人にも消させるなら、**その時は必ず記録を残すこと**。
          「誰でも消せる＋誰が消したか分からない」はログとして意味がなくなる。
     ・🔴 **絞り込みを変えたら、選んでいたものは解除する。**
       見えていない行が選ばれたまま消えるのが、この画面でいちばん怖い事故なので。
   ======================================== */
(function () {
  'use strict';

  var LS_KEY = 'pitflow_oplog_v1';
  var LIMIT = 1000;
  var CHUNK = 400;        // まとめて消す時の1回ぶん（Firestore のバッチ上限500より少なめ）
  var _cache = null;      // 画面表示用（直近ぶん）
  var _q = '';
  var _seq = 0;           // 行を見分ける番号（画面の中だけ。保存データには入れない）
  var _sel = {};          // 選ばれている行（_k → true）
  var _busy = false;      // 消している最中（二度押しよけ）

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
  function isCloudLive() {
    return !!(window.PIT_CLOUD && window.fb && window.fb.ready && window.fb.currentUser);
  }

  /* 🔴 v1.84.0 消せる人か。**判定はここ1か所**（画面のあちこちで書き直さない）。 */
  function canDelete() {
    return !!(window.pitIsMaster && window.pitIsMaster());
  }
  /* 行に画面用の番号を振る（保存データには入れない） */
  function stamp(arr) {
    (arr || []).forEach(function (e) { if (!e._k) e._k = 'k' + (++_seq); });
    return arr;
  }
  function indexOfKey(k) {
    if (!_cache) return -1;
    for (var i = 0; i < _cache.length; i++) if (_cache[i]._k === k) return i;
    return -1;
  }
  /* 画面から消えた行の選択を捨てる（読み直したあとなど） */
  function pruneSel() {
    Object.keys(_sel).forEach(function (k) { if (indexOfKey(k) < 0) delete _sel[k]; });
  }
  function selKeys() { return Object.keys(_sel).filter(function (k) { return indexOfKey(k) >= 0; }); }

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

    if (isCloudLive()) {
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
        /* 🔴 v1.84.0 いま作った行が「どのドキュメントか」を控える。
           これが無いと、**書いた直後の行だけ選んでも消せない**（消し先が分からない）。 */
        .then(function (ref) { if (ref && ref.id) entry._id = ref.id; })
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
    if (isCloudLive()) {
      return window.fb.company().collection('pitAuditLogs')
        .orderBy('time', 'desc').limit(LIMIT).get()
        .then(function (snap) {
          var out = [];
          snap.forEach(function (d) {
            var o = d.data() || {};
            out.push({
              _id: d.id,                    /* v1.84.0 消し先（まとめて消す時に使う） */
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

  /* ---- サンプル／デモ版：画面の並びをそのまま端末へ書き戻す ---- */
  function saveLocal() {
    try {
      var arr = (_cache || []).map(function (e) {
        var o = {};
        for (var k in e) {
          if (Object.prototype.hasOwnProperty.call(e, k) && k !== '_k' && k !== '_id') o[k] = e[k];
        }
        return o;
      });
      if (arr.length > 500) arr.length = 500;
      localStorage.setItem(LS_KEY, JSON.stringify(arr));
    } catch (e) {}
  }

  /* ---- 画面 ---- */
  function visibleList() {
    var q = _q.trim().toLowerCase();
    return (_cache || []).filter(function (e) {
      if (!q) return true;
      return (e.userName + ' ' + e.action + ' ' + e.label).toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderOplog() {
    var box = document.getElementById('oplog-body');
    if (!box) return;

    if (_cache === null) {
      box.innerHTML = '<div class="op-loading">読み込んでいます…</div>';
      load().then(function () { renderOplog(); });
      return;
    }
    stamp(_cache);
    pruneSel();

    var del = canDelete();
    var q = _q.trim().toLowerCase();
    var list = visibleList();

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
    /* ⚠ ここに「チェックBOXはあなただけに出ています」という説明は**出さない**（ゆうた指示）。
       出るのは本人だけなので、見れば分かる。文字が増えるほうが邪魔。
       ⚠ もし説明を足したくなったら：.op-note は横並び（flex）なので、
          <b> を裸で置くと1文字ずつ縦に折れる。文章は <span> ひとつにまとめること。 */

    if (del && list.length) {
      h += '<div class="op-selbar">'
         + '<label class="op-all"><input type="checkbox" id="op-ckall" onchange="pitOplogPickAll(this.checked)">'
         + '<span>表示中のぜんぶを選ぶ</span></label>'
         + '<span class="op-seln" id="op-seln">選択なし</span>'
         + '<button class="op-delsel" id="op-delsel" type="button" disabled onclick="pitOplogDeleteSelected()">'
         + '<i data-ic=trash data-ics=15></i><span class="op-delsel-lb">選んだ行を消す</span></button>'
         + '</div>';
    }

    if (!list.length) {
      h += '<div class="op-empty">まだ記録がありません。</div>';
    } else {
      h += '<div class="op-list">';
      list.forEach(function (e) {
        h += '<div class="op-row' + (del ? ' op-can-del' : '') + (_sel[e._k] ? ' op-picked' : '') + '" data-k="' + esc(e._k) + '">'
          + '<span class="op-time">' + esc(e.timeStr) + '</span>'
          + '<span class="op-user">' + esc(e.userName) + '</span>'
          + '<span class="op-act">' + esc(e.action) + '</span>'
          + '<span class="op-label">' + (e.cardId
              ? '<a href="javascript:void(0)" onclick="pitOpenCardDetail(\'' + esc(e.cardId) + '\')">' + esc(e.label) + '</a>'
              : esc(e.label)) + '</span>'
          + (del
              ? '<label class="op-ck" title="この行を選ぶ"><input type="checkbox" data-k="' + esc(e._k) + '"'
                + (_sel[e._k] ? ' checked' : '') + ' aria-label="この行を選ぶ"'
                + ' onchange="pitOplogPick(\'' + esc(e._k) + '\', this.checked)"></label>'
              : '')
          + '</div>';
      });
      h += '</div>';
    }

    box.innerHTML = h;
    if (window.icoBoot) icoBoot(box);
    if (del) refreshSelBar();
  }
  window.renderOplog = renderOplog;

  window.pitOplogSearch = function (v) {
    /* 🔴 絞り込みを変えたら選択は解除する。
       ⚠ 見えていない行が選ばれたまま［選んだ行を消す］を押される事故を防ぐため。 */
    if ((v || '') !== _q) _sel = {};
    _q = v || '';
    renderOplog();
    var i = document.getElementById('op-q');
    if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  };
  window.pitOplogReload = function () {
    _cache = null;
    _sel = {};
    renderOplog();
  };

  /* ========================================
     🔴 v1.84.0 選んで、まとめて消す（マスター限定）
     ======================================== */

  /* 選んだ数だけを塗り替える。**一覧は描き直さない**
     （チェックのたびに描き直すと、スクロール位置と絞り込みの入力が飛ぶ） */
  function refreshSelBar() {
    var n = selKeys().length;
    var lb = document.getElementById('op-seln');
    var bt = document.getElementById('op-delsel');
    var all = document.getElementById('op-ckall');
    if (lb) lb.textContent = n ? ('選択中 ' + n + ' 件') : '選択なし';
    if (bt) {
      bt.disabled = (n === 0) || _busy;
      /* ⚠ ボタンに textContent で書くとゴミ箱アイコンの<svg>ごと消える。
         文字は中の .op-delsel-lb だけ差し替える（ログイン画面で同じ罠を踏んでいる＝v1.18.1）。 */
      var sp = bt.querySelector('.op-delsel-lb');
      if (sp) sp.textContent = _busy ? '消しています…' : (n ? ('選んだ ' + n + ' 件を消す') : '選んだ行を消す');
    }
    if (all) {
      var vis = visibleList();
      var picked = vis.filter(function (e) { return _sel[e._k]; }).length;
      all.checked = (picked > 0 && picked === vis.length);
      all.indeterminate = (picked > 0 && picked < vis.length);
    }
  }

  window.pitOplogPick = function (k, on) {
    if (!canDelete()) return;
    if (on) _sel[k] = true; else delete _sel[k];
    var row = document.querySelector('.op-row[data-k="' + k + '"]');
    if (row) row.classList.toggle('op-picked', !!on);
    refreshSelBar();
  };

  window.pitOplogPickAll = function (on) {
    if (!canDelete()) return;
    /* 見えている行だけが対象（絞り込み中なら、絞り込んだぶんだけ） */
    visibleList().forEach(function (e) { if (on) _sel[e._k] = true; else delete _sel[e._k]; });
    [].forEach.call(document.querySelectorAll('.op-ck input'), function (c) {
      c.checked = !!on;
      var row = c.closest ? c.closest('.op-row') : null;
      if (row) row.classList.toggle('op-picked', !!on);
    });
    refreshSelBar();
  };

  function toast(msg) {
    if (window.pitToast) { try { pitToast(msg); return; } catch (e) {} }
    if (window.showToast) { try { showToast(msg); } catch (e) {} }
  }

  window.pitOplogDeleteSelected = function () {
    if (!canDelete() || _busy) return;
    var keys = selKeys();
    if (!keys.length) return;

    var items = keys.map(function (k) { return _cache[indexOfKey(k)]; });
    var head = items.slice(0, 3).map(function (e) {
      return '・' + [e.timeStr, e.userName, e.action].filter(Boolean).join(' ');
    }).join('\n');
    var more = items.length > 3 ? ('\nほか ' + (items.length - 3) + ' 件') : '';

    var ask = window.pitAsk
      ? pitAsk('選んだ ' + items.length + ' 件を消しますか？', {
          detail: head + more + '\n\n消した記録は戻せません。' +
                  (window.PIT_CLOUD ? '全員の画面からも消えます。' : 'この端末の中だけの記録です。'),
          danger: true, ok: '消す', cancel: 'やめる'
        })
      : Promise.resolve(true);

    ask.then(function (ok) {
      if (!ok) return;
      /* 聞いている間に行が動いている（新しいログが増えた／読み直した）かもしれないので取り直す */
      var live = selKeys();
      if (!live.length) { toast('選んだ行はもうありません'); return; }

      if (isCloudLive()) {
        var withId = [], noId = 0;
        live.forEach(function (k) {
          var t = _cache[indexOfKey(k)];
          if (t && t._id) withId.push({ k: k, id: t._id }); else noId++;
        });
        if (!withId.length) {
          toast('いま書いたばかりの行です。［最新に更新］を押してからお試しください');
          return;
        }
        _busy = true;
        refreshSelBar();
        deleteChunks(withId).then(function () {
          _busy = false;
          finish(withId.map(function (x) { return x.k; }),
                 noId ? ('／' + noId + '件は［最新に更新］のあとで消せます') : '');
        }).catch(function (err) {
          _busy = false;
          refreshSelBar();
          console.error('[oplog] まとめて消去に失敗', err);
          toast('消せませんでした（権限か通信の問題です）');
        });
        return;
      }

      /* サンプル／デモ版：この端末の中だけ */
      finish(live, '');
    });
  };

  /* クラウドは 400件ずつ束ねて消す（Firestore のバッチ上限は500） */
  function deleteChunks(rows) {
    var col = window.fb.company().collection('pitAuditLogs');
    var groups = [];
    for (var i = 0; i < rows.length; i += CHUNK) groups.push(rows.slice(i, i + CHUNK));
    return groups.reduce(function (p, g) {
      return p.then(function () {
        var batch = window.fb.db.batch();
        g.forEach(function (x) { batch.delete(col.doc(x.id)); });
        return batch.commit();
      });
    }, Promise.resolve());
  }

  /* 消えたあとの後始末（画面から抜く → 端末に書き戻す）
     🔴 **消したことは記録しない**（ゆうた指示）。ここで `pitLog` を呼ばないこと。
        呼ぶと消すたびに「操作ログを◯件消去」が増えて、消した意味が薄れる。
        ⚠ 足し直すなら、サンプルは**先に saveLocal() してから**。
           `pitLog` は localStorage を読み直して書き戻すので、
           順番を逆にすると**消したはずの行が生き返る**。 */
  function finish(keys, extra) {
    var n = 0;
    keys.forEach(function (k) {
      var j = indexOfKey(k);
      if (j >= 0) { _cache.splice(j, 1); n++; }
      delete _sel[k];
    });
    if (!isCloudLive()) saveLocal();
    renderOplog();
    toast(n + '件消しました' + (extra || ''));
  }
})();
