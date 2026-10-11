/* ============================================================
   perf-pit.js ── ⏱ 測定モード（v2.171.0）
   ------------------------------------------------------------
   🗣 ゆうた 2026-10-11「（v2.170.0 で）全然変わってない。多分そんなレベルじゃない。
      測定モードを搭載したバージョンをリリースして、俺のとスタッフのPCで比べればどう？
      あからさまに違い過ぎるし、さすがに業務にならないレベル」

   ◎使い方
     ・アドレスの最後に **?perf=1** を付けて開く → その端末だけ測り始める（切るまで続く＝この端末に覚える）
     ・やめる時は ?perf=0 で開く、または計測窓の［終わる］
     ・右下の計測窓の［結果をコピー］→ チャットに貼る（［保存］で .json にもできる）

   ◎測るもの（どれも見るだけ。データには触らない・どこにも送らない）
     ① 押した・打った時に「押してから画面が変わるまで」何ミリ秒か（ブラウザの Event Timing）
        ＝ 押す前に待たされた分（入力の待ち）／処理／描くまで に分けて
     ② 画面を 0.15 秒以上止めた仕事と、その中身（どのファイルのどの関数か）
        ＝ ブラウザの Long Animation Frames（無いブラウザは Long Tasks）
     ③ PitFlow の重い所（保存の見比べ _cloudFlush・他の人の保存を受けた描き直し _afterApply・画面の描き直し）の回数と時間
     ④ 通信の量（クラウドとのやりとりを含む・行き先ごと）
     ⑤ メモリの使い方（10秒ごと）・PCの性能（CPUの数・メモリ量）・見やすさの設定・開いている画面
     ⑥ 画面が丸ごと止まった時間（描画の間隔が 1 秒以上あいた所）

   ⚠ 普段（?perf=1 を付けていない端末）は**何もしない**。最初の1行で帰る。
   ⚠ このファイルは index.html の **JS の一番最初**に読む（起動中の重さも拾うため）
   ============================================================ */
(function (w, d) {
  'use strict';
  var KEY = 'pit_perf_on';
  try {
    var q = new URLSearchParams(location.search).get('perf');
    if (q === '1') localStorage.setItem(KEY, '1');
    if (q === '0') localStorage.removeItem(KEY);
    if (localStorage.getItem(KEY) !== '1') return;
  } catch (e) { return; }

  var T0 = Date.now();
  var P = w.PitPerf = {
    startedAt: new Date().toISOString(),
    events: [],      /* ① 押した・打った */
    frames: [],      /* ② 止めた仕事 */
    stalls: [],      /* ⑥ 丸ごと止まった */
    mem: [],         /* ⑤ メモリ */
    pit: {},         /* ③ PitFlow の重い所 */
    pitSlow: [],     /* ③ そのうち 0.1 秒以上かかった1回ずつ */
    link: [],        /* 🆕 v2.172.0 つながりの切れ・張り直し・全件の読み直し */
    labels: {}       /* 押した物の名前（時刻 → 名前） */
  };
  function now() { return Math.round(performance.now()); }
  function short(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }
  function fileOf(u) { u = String(u || ''); var m = u.match(/\/([^\/?#]+)(?:\?[^#]*)?(?:#.*)?$/); return m ? m[1] : (u ? short(u, 40) : ''); }
  function view() { try { return (w.state && w.state.currentView) || ''; } catch (e) { return ''; } }

  /* ---- 押した物の名前を控える（Event Timing の target は消えていることがあるため） ---- */
  function labelOf(el) {
    if (!el || el.nodeType !== 1) return '';
    var b = el.closest ? (el.closest('button, a, .cf-chip, .cf-tg, [onclick], input, select, textarea, label') || el) : el;
    var t = b.getAttribute && (b.getAttribute('aria-label') || b.getAttribute('title')) || '';
    var tx = short(b.innerText || b.value || t || b.tagName, 24);
    var key = b.dataset && (b.dataset.key || b.dataset.val) ? ('[' + (b.dataset.key || '') + (b.dataset.val ? '=' + b.dataset.val : '') + ']') : '';
    var grp = b.closest && b.closest('[data-key]');
    var gk = grp && grp !== b && grp.dataset.key ? ('{' + grp.dataset.key + '}') : '';
    return (b.tagName || '').toLowerCase() + gk + key + ' ' + tx;
  }
  ['pointerdown', 'click', 'keydown', 'input'].forEach(function (t) {
    d.addEventListener(t, function (e) {
      P.labels[Math.round(e.timeStamp)] = (t === 'keydown' ? ('key ' + (e.key && e.key.length === 1 ? '文字' : e.key) + ' @ ') : '') + labelOf(e.target);
      var ks = Object.keys(P.labels); if (ks.length > 400) delete P.labels[ks[0]];
    }, true);
  });
  function labelAt(ts) {
    var r = Math.round(ts), best = '', bd = 99;
    for (var k in P.labels) { var dd = Math.abs(+k - r); if (dd < bd) { bd = dd; best = P.labels[k]; } }
    return bd <= 2 ? best : '';
  }

  /* ---- ① 押してから画面が変わるまで ---- */
  try {
    new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (e) {
        if (!/^(click|pointerdown|pointerup|keydown|keyup|input|change|mousedown|mouseup)$/.test(e.name)) return;
        if (e.duration < 100) return;
        P.events.push({
          at: Math.round(e.startTime), type: e.name, view: view(),
          what: labelAt(e.startTime) || (e.target ? labelOf(e.target) : ''),
          total: Math.round(e.duration),                                   /* 押してから描くまで */
          wait: Math.round(e.processingStart - e.startTime),               /* 押す前から止まっていた＝待たされた */
          work: Math.round(e.processingEnd - e.processingStart),           /* 押した処理そのもの */
          paint: Math.round(e.startTime + e.duration - e.processingEnd)    /* 描くまで */
        });
        if (P.events.length > 300) P.events.shift();
      });
      paint();
    }).observe({ type: 'event', buffered: true, durationThreshold: 104 });
  } catch (e) { P.noEvent = String(e); }

  /* ---- ② 止めた仕事と、その中身 ---- */
  var hasLoaf = false;
  try {
    new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (f) {
        if (f.duration < 150) return;
        var sc = (f.scripts || []).slice().sort(function (a, b) { return b.duration - a.duration; }).slice(0, 6).map(function (s) {
          return {
            ms: Math.round(s.duration),
            fn: s.sourceFunctionName || '', file: fileOf(s.sourceURL), from: short(s.invoker || '', 60), kind: s.invokerType || '',
            layout: Math.round(s.forcedStyleAndLayoutDuration || 0)
          };
        });
        P.frames.push({
          at: Math.round(f.startTime), view: view(), ms: Math.round(f.duration), block: Math.round(f.blockingDuration || 0),
          style: Math.round(f.styleAndLayoutStart ? (f.startTime + f.duration - f.styleAndLayoutStart) : 0),
          scripts: sc
        });
        if (P.frames.length > 300) P.frames.shift();
      });
      paint();
    }).observe({ type: 'long-animation-frame', buffered: true });
    hasLoaf = true;
  } catch (e) { P.noLoaf = String(e); }
  if (!hasLoaf) {
    try {
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (t) {
          if (t.duration < 150) return;
          P.frames.push({ at: Math.round(t.startTime), view: view(), ms: Math.round(t.duration), scripts: [] });
          if (P.frames.length > 300) P.frames.shift();
        });
        paint();
      }).observe({ type: 'longtask', buffered: true });
    } catch (e) {}
  }

  /* ---- ⑥ 画面が丸ごと止まった（描画の間隔が1秒以上） ---- */
  var lastRaf = 0;
  function raf(t) {
    if (lastRaf && t - lastRaf > 1000 && !d.hidden) {
      P.stalls.push({ at: Math.round(lastRaf), ms: Math.round(t - lastRaf), view: view() });
      if (P.stalls.length > 200) P.stalls.shift();
    }
    lastRaf = d.hidden ? 0 : t;
    w.requestAnimationFrame(raf);
  }
  w.requestAnimationFrame(raf);
  d.addEventListener('visibilitychange', function () { lastRaf = 0; });

  /* ---- ⑤ メモリ（10秒ごと） ---- */
  setInterval(function () {
    var m = performance.memory;
    P.mem.push({ at: now(), mb: m ? Math.round(m.usedJSHeapSize / 1048576) : null, limit: m ? Math.round(m.jsHeapSizeLimit / 1048576) : null });
    if (P.mem.length > 360) P.mem.shift();
  }, 10000);

  /* ---- ③ PitFlow の重い所（読み込みが終わってから巻く） ---- */
  function count(name, ms) {
    var o = P.pit[name] || (P.pit[name] = { n: 0, ms: 0, max: 0 });
    o.n++; o.ms += ms; if (ms > o.max) o.max = Math.round(ms);
    if (ms >= 100) { P.pitSlow.push({ at: now(), what: name, ms: Math.round(ms), view: view() }); if (P.pitSlow.length > 300) P.pitSlow.shift(); }
  }
  function wrap(obj, name, label) {
    var f = obj && obj[name];
    if (typeof f !== 'function' || f.__perf) return;
    var g = function () {
      var t = performance.now();
      try { return f.apply(this, arguments); } finally { count(label || name, performance.now() - t); }
    };
    g.__perf = 1;
    obj[name] = g;
  }
  var wrapped = false;
  function wrapAll() {
    if (wrapped) return;
    if (!w.PitDB) return;
    wrapped = true;
    wrap(w.PitDB, '_cloudFlush', '保存の見比べ(_cloudFlush)');
    wrap(w.PitDB, '_afterApply', '他の人の保存を受けて描き直し(_afterApply)');
    /* ⚠ PitDB.save は包まない（blank-cards.js が同じ所を包んで書きかけの控えを取っている＝二重にしない） */
    /* 🆕 v2.172.0 つながりの見張りと、全件の読み直し（_resync＝全データをサーバーから取り直す）。
       ⚠ _resync は通信を待つので、ここで測れるのは「呼ばれた回数と時刻」。重さは②（db-pit.js の then）に出る */
    ['_resync', '_watch', '_scheduleRelink'].forEach(function (n) {
      var f = w.PitDB[n]; if (typeof f !== 'function' || f.__perf) return;
      var g = function () {
        P.link.push({ at: now(), what: n, view: view() }); if (P.link.length > 200) P.link.shift();
        return f.apply(this, arguments);
      };
      g.__perf = 1; w.PitDB[n] = g;
    });
    var sl = w.PitDB._setLink;
    if (typeof sl === 'function' && !sl.__perf) {
      w.PitDB._setLink = function (on, why) {
        if (this._link !== on) { P.link.push({ at: now(), what: on ? 'つながった' : ('切れた：' + (why || '')), view: view() }); if (P.link.length > 200) P.link.shift(); }
        return sl.apply(this, arguments);
      };
      w.PitDB._setLink.__perf = 1;
    }
    ['showView', 'renderCardForm', 'cfSideHtml', 'renderToday', 'renderDashboard', 'renderFleet', 'renderLoaner',
     'pitInspectRun', 'upsertCustomerFromCard', 'pitSyncLoanerAssigns', 'renderCustomers', 'renderBoard', 'renderKanban']
      .forEach(function (n) { wrap(w, n); });
  }
  w.addEventListener('load', function () { setTimeout(wrapAll, 0); });
  var wt = setInterval(function () { wrapAll(); if (wrapped) clearInterval(wt); }, 1000);

  /* ---- ④ 通信の量 ---- */
  function net() {
    var by = {};
    (performance.getEntriesByType('resource') || []).forEach(function (r) {
      var h = ''; try { h = new URL(r.name).host; } catch (e) { h = '?'; }
      if (/firestore\.googleapis\.com/.test(h)) h = 'クラウド(firestore)';
      var o = by[h] || (by[h] = { n: 0, kb: 0, slowest: 0 });
      o.n++; o.kb += (r.transferSize || 0) / 1024; if (r.duration > o.slowest) o.slowest = Math.round(r.duration);
    });
    Object.keys(by).forEach(function (k) { by[k].kb = Math.round(by[k].kb); });
    return by;
  }
  try { performance.setResourceTimingBufferSize(3000); } catch (e) {}

  /* ---- まとめ ---- */
  function counts() {
    var s = {};
    try {
      var st = w.state || {};
      ['cards', 'customers', 'loanerAssigns', 'loaners', 'boardNotes', 'companyCars'].forEach(function (k) { s[k] = (st[k] || []).length; });
      s.shadow = w.PitDB && w.PitDB._shadow ? Object.keys(w.PitDB._shadow.docs || {}).length : null;
      s.mode = w.PitDB ? w.PitDB.mode : '';
    } catch (e) {}
    return s;
  }
  function report() {
    var top = function (arr, k, n) { return arr.slice().sort(function (a, b) { return b[k] - a[k]; }).slice(0, n); };
    var pit = {}; Object.keys(P.pit).forEach(function (k) { var o = P.pit[k]; pit[k] = { 回数: o.n, 合計ms: Math.round(o.ms), 最大ms: o.max }; });
    var m = null; try { m = w.fb && w.fb.currentMember; } catch (e) {}
    var a11y = null; try { a11y = w.CFA11y && w.CFA11y.state(); } catch (e) {}
    return {
      測定モード: 'PitFlow perf v1',
      版: (d.querySelector('meta[name="app-version"]') || {}).content || '',
      誰: m ? (m.name || m.displayName || m.email || '') : '',
      いつから: P.startedAt, 何分: Math.round((Date.now() - T0) / 60000),
      端末: {
        ua: navigator.userAgent, cpu: navigator.hardwareConcurrency, memGB: navigator.deviceMemory || null,
        画面: screen.width + 'x' + screen.height + '@' + (w.devicePixelRatio || 1), 窓: w.innerWidth + 'x' + w.innerHeight,
        回線: (navigator.connection && (navigator.connection.effectiveType + ' ' + navigator.connection.downlink + 'Mbps')) || null,
        LoAF: hasLoaf
      },
      見やすさ: a11y, 件数: counts(),
      押した遅い順: top(P.events, 'total', 40),
      止めた仕事_長い順: top(P.frames, 'ms', 30),
      丸ごと止まった: top(P.stalls, 'ms', 30),
      PitFlowの重い所: pit,
      PitFlowの重い所_1回ずつ: top(P.pitSlow, 'ms', 40),
      つながり_読み直し: P.link.slice(-60),
      通信: net(),
      メモリ: P.mem.filter(function (x, i, a) { return i % Math.max(1, Math.floor(a.length / 30)) === 0; })
    };
  }
  P.report = report;

  /* ---- 計測窓 ---- */
  var box = null;
  function paint() {
    if (!box) return;
    var worst = P.events.reduce(function (a, e) { return Math.max(a, e.total); }, 0);
    var slow = P.events.filter(function (e) { return e.total >= 500; }).length;
    var fr = P.frames.reduce(function (a, f) { return Math.max(a, f.ms); }, 0);
    var rs = P.link.filter(function (x) { return x.what === '_resync'; }).length;
    box.querySelector('.pf-s').textContent = '遅い操作 ' + slow + '回 ／ 最長 ' + (worst / 1000).toFixed(1) + '秒 ／ 止めた仕事 最長 ' + (fr / 1000).toFixed(1) + '秒 ／ 全件読み直し ' + rs + '回';
  }
  function mount() {
    if (box || !d.body) return;
    box = d.createElement('div'); box.id = 'pit-perf';
    box.setAttribute('style', 'position:fixed;right:10px;bottom:10px;z-index:2147483000;background:#111827;color:#f9fafb;border:2px solid #f59e0b;'
      + 'border-radius:10px;padding:8px 10px;font:12px/1.5 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.45);max-width:340px');
    box.innerHTML = '<div style="font-weight:800;color:#fbbf24">⏱ 測定モード（この端末だけ）</div>'
      + '<div class="pf-s" style="margin:3px 0 6px">測定中…</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '<button type="button" data-a="copy" style="cursor:pointer;border:0;border-radius:6px;padding:4px 10px;background:#f59e0b;color:#111;font-weight:800">結果をコピー</button>'
      + '<button type="button" data-a="save" style="cursor:pointer;border:1px solid #6b7280;border-radius:6px;padding:4px 10px;background:none;color:#f9fafb">保存</button>'
      + '<button type="button" data-a="clear" style="cursor:pointer;border:1px solid #6b7280;border-radius:6px;padding:4px 10px;background:none;color:#f9fafb">記録を消す</button>'
      + '<button type="button" data-a="off" style="cursor:pointer;border:1px solid #6b7280;border-radius:6px;padding:4px 10px;background:none;color:#f9fafb">終わる</button>'
      + '</div>';
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      e.stopPropagation();
      var a = b.getAttribute('data-a');
      if (a === 'copy') {
        var txt = JSON.stringify(report());
        var done = function () { b.textContent = 'コピーしました'; setTimeout(function () { b.textContent = '結果をコピー'; }, 2000); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); });
        else { fallbackCopy(txt); done(); }
      }
      if (a === 'save') {
        var blob = new Blob([JSON.stringify(report(), null, 1)], { type: 'application/json' });
        var aa = d.createElement('a'); aa.href = URL.createObjectURL(blob);
        aa.download = 'PitFlow測定_' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json';
        d.body.appendChild(aa); aa.click(); aa.remove();
      }
      if (a === 'clear') { P.events.length = 0; P.frames.length = 0; P.stalls.length = 0; P.pitSlow.length = 0; P.link.length = 0; P.pit = {}; T0 = Date.now(); P.startedAt = new Date().toISOString(); try { performance.clearResourceTimings(); } catch (e2) {} paint(); }
      if (a === 'off') { try { localStorage.removeItem(KEY); } catch (e3) {} box.remove(); box = null; }
    });
    d.body.appendChild(box);
    paint();
  }
  function fallbackCopy(t) {
    var ta = d.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    d.body.appendChild(ta); ta.select(); try { d.execCommand('copy'); } catch (e) {} ta.remove();
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', mount); else mount();
  setInterval(paint, 2000);
})(window, document);
