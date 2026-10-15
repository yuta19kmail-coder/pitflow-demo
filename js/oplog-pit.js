/* ========================================
   oplog-pit.js  -  操作ログ（PitFlow）
   ----------------------------------------
   ◎なにをするもの
     「誰が・いつ・何をしたか」を1行ずつ残す。CarFlow / StockFlow と同じ考え方。
     あとから書き換えられない・消せない（作るだけ）。

   ◎どこに残るか
     本番：companies/kobayashi_motors/pitAuditLogs（全員で共有・直近1000件を表示）
     サンプル：この端末の中だけ（localStorage・直近500件）

   ◎使い方（他のファイルから）
     pitLog('予約を作成', { cardId:c.id, label:'山田 様 / タント' })
     ・ログを残すこと自体で操作を止めない。失敗しても黙って捨てる（画面の邪魔をしない）。

   ◎🔴🔴 v2.186.0（決まり⑧・2026-10-15）**操作ログは誰も消せない。マスターも。**
     v1.84.0 からあった「選んでまとめて消す」（マスター限定のチェックBOXと［選んだ行を消す］）は外した。
     ゆうた「何があってもどうだったか？を確認できれば人力で戻せる」＝消せる記録は記録にならない。
     ルール（`_ルール\firestore.rules` の pitAuditLogs の delete）も「誰も消せない」に揃える（ルール担当）。
     ⚠ 消す道を作り直さないこと。古い機能の行を画面に出さないのは `pitLogGone`（描く時だけ・記録は消さない）
   ======================================== */
(function () {
  'use strict';

  var LS_KEY = 'pitflow_oplog_v1';
  var LIMIT = 1000;
  var _cache = null;      // 画面表示用（直近ぶん）
  var _q = '';
  var _seq = 0;           // 行を見分ける番号（画面の中だけ。保存データには入れない）

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

  /* 行に画面用の番号を振る（保存データには入れない） */
  function stamp(arr) {
    (arr || []).forEach(function (e) { if (!e._k) e._k = 'k' + (++_seq); });
    return arr;
  }

  /* ---- 1件残す ---- */
  window.pitLog = function (action, opt) {
    if (!action) return;
    opt = opt || {};
    /* 🔴🔴 v2.22.0（2026-08-28・事故を受けて）**アプリが勝手にやったことに人の名前を押さない。**
       自動処理は「画面を開いた端末」で走るので、たまたまログインしていた人の名前が残る＝濡れ衣。
       ⚠ どの端末が走らせたかは `dev` に残す（追える）。**`userName` には入れない。** */
    var _auto = !!opt.auto;
    var entry = {
      at: Date.now(),
      timeStr: nowStr(),
      userName: _auto ? '自動' : (opt.user || meName()),
      auto: _auto || undefined,
      dev: _auto ? meName() : undefined,
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
        auto: !!entry.auto,
        dev: entry.dev || '',
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

  /* 🔴🔴 v2.185.0（棚卸し S-26）**顧客まわりの記録の入口。**
     customers.js・cust-reg.js・cust-merge.js・veh-merge.js・dup-find.js は `pitOpLog(何をした, 中身の文字)` を呼んでいたのに、
     **この関数がどこにも無かった**＝顧客の登録・車両の追加・名前やナンバーの変更・顧客と車両の統合と取り消し・
     ダブりの「これでOK」が、操作ログに**ずっと1件も入っていなかった**（呼ぶ側が `if (window.pitOpLog)` で黙って飛ばしていた）。
     ＝ pitLog へつなぐ。名前違いの記録関数を新しく作らないこと（見張り＝test_oplog_exists.mjs） */
  window.pitOpLog = function (action, label, opt) {
    return window.pitLog(action, Object.assign({ kind: 'customer', label: String(label == null ? '' : label) }, opt || {}));
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

  /* ---- 画面 ---- */
  /* 📝 v2.184.0 古い記録の読めない字（{…}）は描く時だけ言葉にする（記録は書き換えない）。物差しは pit-share.js の pitLogReword 1本 */
  function _rw(t) { return window.pitLogReword ? pitLogReword(t) : t; }
  function visibleList() {
    var q = _q.trim().toLowerCase();
    return (_cache || []).filter(function (e) {
      /* 🗑 v2.13.2 もう無い機能の記録は出さない（記録は消さない）。物差しは `pitLogGone` 1本。 */
      if (window.pitLogGone && pitLogGone((e.action || '') + '：' + (e.label || ''))) return false;
      if (!q) return true;
      /* 🔴 v2.22.0 **予約番号でも探せるように**（人は番号で車を呼ぶ）。
         ⚠ 番号は label の中に `[C63175]` の形で入る（物差し＝pit-share.js の `pitCardTag`）。
            それでも古い記録には入っていないので、カードIDも干し草に混ぜておく。 */
      return (e.userName + ' ' + e.action + ' ' + e.label + ' ' + (e.cardId || ''))
             .toLowerCase().indexOf(q) >= 0;
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
    /* ⚠ .op-note は横並び（flex）なので、<b> を裸で置くと1文字ずつ縦に折れる。文章は <span> ひとつにまとめること。 */

    if (!list.length) {
      h += '<div class="op-empty">まだ記録がありません。</div>';
    } else {
      h += '<div class="op-list">';
      list.forEach(function (e) {
        h += '<div class="op-row" data-k="' + esc(e._k) + '">'
          + '<span class="op-time">' + esc(e.timeStr) + '</span>'
          + '<span class="op-user">' + esc(e.userName) + '</span>'
          + '<span class="op-act">' + esc(e.action) + '</span>'
          + '<span class="op-label">' + (e.cardId
              ? '<a href="javascript:void(0)" onclick="pitOpenCardDetail(\'' + esc(e.cardId) + '\')">' + esc(_rw(e.label)) + '</a>'
              : esc(_rw(e.label))) + '</span>'
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

  /* 🔴 v2.186.0 ここにあった「選んで、まとめて消す」（pitOplogPick／pitOplogPickAll／pitOplogDeleteSelected）は外した（決まり⑧）。 */
})();
