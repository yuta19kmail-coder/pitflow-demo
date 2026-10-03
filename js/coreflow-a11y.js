/* ============================================================
   coreflow-a11y.js ── 全アプリ共通「見やすさ」（くっきり／大きさ／拡大鏡）v1.2.0
   ------------------------------------------------------------
   ◎きっかけ（2026-10-03・ゆうた）
     🗣「車検予定のタイトル横『いつ行く／決定／完了・再検』が社長・専務（60代）に読めない。
     　　専用の設定を設けて読みやすくしたい」
     原因＝11px（札は 8.5px）＋ダークの --text3 #5c6490 が背景と 3.3:1。
     決め打ちの font-size は PitFlow 約1,800／CarFlow 約5,800か所＝**1か所ずつ直さない**。
     見本（_preview\見やすさ見本_PitFlow車検予定.html）を社長・専務が見て OK（2026-10-03）。

   ◎決まりごと（ゆうた確定）
     ・CarFlow・PitFlow のヘッダーにあった **AAA（文字サイズ3つ）は無くした**
     ・**CoreFlow のメンバー管理で「見やすさ」にチェック（全アプリ統一で1個）**＝ portalMembers の `a11y: true`
       チェックがある人だけ、ヘッダーに **くっきり／大きさ／拡大鏡** の3つ。**無い人には何も出さない**
     ・くっきり・大きさ：押すたびに ON/OFF。**アカウントごとに保存**＝ userPrefs/{uid}.cfA11y
       （表示が崩れた時に、その場で OFF にして元の形と見比べられる）
     ・大きさ＝**1.2倍で固定**（元が 10px 未満の極小は 12px まで上げる）
     ・くっきり＝薄い字と普通の字の**差はほぼ無くしてよい**。決め打ちの文字色は背景に対して **7:1** まで寄せる
     ・拡大鏡＝自前。**1.6倍**。カーソルは窓の**中央やや下**。左クリックはそのまま押せる・**右クリックで閉じる**
       （拡大鏡の ON/OFF は覚えない＝開き直すと OFF）

   ◎作りの肝＝「CSS の中身をその場で書き換える」
     読み込んだ CSS を1回なめて、決め打ちの値（font-size の px・文字色）だけ書き換える。
     あとから画面に差し込まれた style="…" も見張って同じことをする。OFF で全部元に戻す。
     ⚠ 画面全体の zoom（前の AAA のやり方）は使わない。枠・余白まで広がって1画面に入る量が大きく減る。
     ⚠ くっきりで、白・黒の字と、背景色を同じルールで持っているもの（色付きのボタン・札）は触らない。
        （緑のボタンの白文字を「白地で読めない」と誤って濃くしないため。半透明のうすい地は触ってよい）

   ◎拡大鏡の作り
     画面の写しを見えない小窓（iframe）に作り、1.6倍にして四角い窓に映す。
     ・写しは画面が書き換わったら作り直す（0.3秒に1回まで。PitFlow の車検予定で1回 約25ms）
     ・窓は「押せない」作り＝左クリックは下の本物にそのまま届く
     ・窓の中の「カーソルの下」と本物の「カーソルの下」は同じ場所＝見たまま押せる
     ⚠ 写しなので、マウスを乗せた時の色変わり（ホバー）は窓の中には出ない

   ◎置き場所
     各アプリの index.html に **`<span id="cf-a11y-slot"></span>`** を1つ置く（ここに3つが入る）。
     印が無いアプリでは AAA（#tb-fontsize-group）の場所。どちらも無ければ出さない。
     🔴 スマホ幅（760px 未満）ではスイッチを出さない（ヘッダーが狭い）。保存した設定は効く。
     🔴 マウスの無い端末（タッチだけ）では拡大鏡を出さない。

   ◎アプリへの合図
     見やすさの人には <html> に `cf-a11y-on` が付く（MHS の検索窓を虫めがねボタンに畳むのに使う）。

   ⚠ 直す時は `_shared\coreflow-a11y.js` を直して `sync-shared.ps1` を走らせること。
      アプリ側の `js\coreflow-a11y.js` を直しても、次の配布で消えます。
   ============================================================ */
(function (w, d) {
  'use strict';
  if (w.CFA11y) return;
  var root = d.documentElement;

  var SCALE = 1.2, TINY_UNDER = 10, TINY_TO = 12;
  var MIN_RATIO = 7;
  var REF_BG = { light: [235, 238, 243], dark: [34, 37, 54] };
  var MAG_ZOOM = 1.6, LENS_W = 460, LENS_H = 300;
  var CACHE_KEY = 'cf_a11y_cache_v1';      /* この端末の控え（開いた瞬間のチラつきを防ぐだけ。正本は Firestore） */
  var CID_FALLBACK = 'kobayashi_motors';

  /* ---------- 控え（前回この端末で開いた人の状態） ---------- */
  var cache = null;
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) {}
  function writeCache(uid, enabled, p) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ uid: uid, on: !!enabled, kukkiri: !!p.kukkiri, ookisa: !!p.ookisa, viewer: p.viewer !== false })); } catch (e) {} }

  var prefs = { kukkiri: false, ookisa: false, viewer: true };
  /* 🆕 v1.2.0（2026-10-03）**見る画面**（FlowDesk・FlowGo・CoreFlow のダッシュボード）の「見やすい表示」。
     🗣 ゆうた「FlowGo、Flowデスクも、見やすさチェックが入ってる人には専用の＝情報へらす・文字大きく・文字はっきり」
     ・VIEWER（FlowDesk・FlowGo）＝スイッチは出さず、「見やすい表示」1つで くっきり＋大きさ＋情報を減らす をまとめて ON
       設定（FlowDesk の基本設定・FlowGo の設定）から本人が切れる。決めていなければ ON＝ userPrefs/{uid}.cfA11y.viewer
     ・SIMPLE（CoreFlow のダッシュボード）＝ヘッダーのスイッチはそのまま。「情報を減らす」だけ viewer に合わせる
     🔴 情報を減らす＝<html class="cf-simple">。中身は下の CSS（通知は件名と時刻・カードは数字2つ・行5つ・補足なし） */
  var VIEWER = !!w.CF_A11Y_VIEWER, SIMPLE = VIEWER || !!w.CF_A11Y_SIMPLE;
  var enabled = false, uid = '';
  var fsOn = false, ckOn = false;

  /* ---------- 見た目 ---------- */
  var CSS = ''
    + '.cf-a11y{display:inline-flex;align-items:stretch;border:1px solid var(--border2,var(--border,#333650));border-radius:8px;overflow:hidden;background:var(--bg3,#222536);flex:none;height:32px;vertical-align:middle;margin:0 4px}'
    + '.cf-a11y button{display:inline-flex;align-items:center;gap:5px;padding:0 10px;margin:0;border:0;border-right:1px solid var(--border2,var(--border,#333650));border-radius:0;background:none;color:var(--text2,var(--t2,#9fa8c7));font-weight:700;font-size:13px;line-height:1;font-family:inherit;cursor:pointer;white-space:nowrap;height:auto;min-width:0;box-shadow:none}'
    + '.cf-a11y button:last-child{border-right:0}'
    + '.cf-a11y button:hover{background:var(--bg4,rgba(127,127,127,.18));color:var(--text,var(--t1,#e8eaf6))}'
    + '.cf-a11y button[aria-pressed="true"]{background:var(--brand,var(--acc,var(--accent,#26a269)));color:#fff}'
    + '.cf-a11y .dot{width:8px;height:8px;border-radius:50%;border:1.5px solid currentColor;flex:none;box-sizing:border-box}'
    + '.cf-a11y button[aria-pressed="true"] .dot{background:#fff;border-color:#fff}'
    + '@media (max-width:759px){.cf-a11y{display:none!important}}'
    /* ④ 情報を減らす（見る画面だけ）。部品の作りは3つの画面で同じ＝ここ1か所で効く */
    + 'html.cf-simple .fd-it .fd-text{display:none}'
    + 'html.cf-simple .fd-it.cf-open .fd-text{display:block}'
    + 'html.cf-simple .cd-metric:nth-child(n+3){display:none}'
    + 'html.cf-simple .cd-list > :nth-child(n+6){display:none}'
    + 'html.cf-simple .cd-row-s,html.cf-simple .cd-updated,html.cf-simple .rc-h > small,html.cf-simple .sl-t1 small,'
    + 'html.cf-simple .sl-tick,html.cf-simple .rc-sc-m small,html.cf-simple .sa-h small{display:none}'
    + '@media (hover:none){.cf-a11y [data-k=mag]{display:none!important}}'
    /* ① くっきり：色の変数を濃くする（アプリの :root[data-theme=…] より必ず勝つように !important） */
    + ':root:root[data-cf-kukkiri="dark"]{--text:#ffffff!important;--text1:#ffffff!important;--text2:#eef0f8!important;--text3:#eef0f8!important;--t1:#ffffff!important;--t2:#eef0f8!important;--t3:#eef0f8!important;--border:#5a6088!important;--border2:#6c73a0!important}'
    + ':root:root[data-cf-kukkiri="light"]{--text:#05080c!important;--text1:#05080c!important;--text2:#111821!important;--text3:#111821!important;--t1:#05080c!important;--t2:#111821!important;--t3:#111821!important;--border:#8e99ab!important;--border2:#76839a!important}'
    /* ③ 拡大鏡 */
    + '#cf-mag{box-sizing:border-box;position:fixed;left:0;top:0;width:' + LENS_W + 'px;height:' + LENS_H + 'px;z-index:2147483646;pointer-events:none;'
    + 'border:3px solid var(--brand,var(--acc,var(--accent,#26a269)));border-radius:12px;overflow:hidden;background:var(--bg,#0f1117);'
    + 'box-shadow:0 10px 34px rgba(0,0,0,.55),0 0 0 1px rgba(0,0,0,.4);display:none}'
    + '#cf-mag iframe{position:absolute;left:0;top:0;border:0;transform-origin:0 0;pointer-events:none;background:transparent}'
    + '#cf-mag .cf-mag-tip{position:absolute;right:6px;top:5px;font-weight:700;font-size:11px;line-height:1;font-family:sans-serif;color:#fff;background:rgba(0,0,0,.6);padding:3px 6px;border-radius:5px}'
    + 'html.cf-mag-on #cf-mag.show{display:block}'
    + 'html.cf-mag-on, html.cf-mag-on *{cursor:url("data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">'
      + '<path d="M4 3 L4 40 L14 31 L21 46 L28 43 L21 28 L35 28 Z" fill="#fff" stroke="#000" stroke-width="2.6" stroke-linejoin="round"/></svg>'
      ) + '") 4 3, auto !important}';
  function injectCss() {
    if (d.getElementById('cf-a11y-css')) return;
    var st = d.createElement('style'); st.id = 'cf-a11y-css'; st.textContent = CSS;
    (d.head || root).appendChild(st);
  }

  /* =======================================================
     値の書き換え（大きさ・くっきり 共通）
     ======================================================= */
  function parseRgb(s) { var m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s || ''); if (!m) return null;
    var a = m[4] == null ? 1 : (/%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    return [+m[1], +m[2], +m[3], a]; }
  function lum(c) { var a = [c[0], c[1], c[2]].map(function (v) { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * a[0] + .7152 * a[1] + .0722 * a[2]; }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }

  /* いまの画面が明るいか暗いか。テーマの名前はアプリごとにバラバラ（CoreBoard は charcoal / navy …）なので、
     名前ではなく**実際の地の色**で決める */
  function themeKind() {
    try {
      var els = [d.body, root];
      for (var i = 0; i < els.length; i++) {
        if (!els[i]) continue;
        var c = parseRgb(getComputedStyle(els[i]).backgroundColor);
        if (c && c[3] > 0.5) return lum(c) > 0.4 ? 'light' : 'dark';
      }
    } catch (e) {}
    return /light/.test(root.getAttribute('data-theme') || '') ? 'light' : 'dark';
  }

  function bigger(px) { var v = px * SCALE; if (px < TINY_UNDER) v = Math.max(v, TINY_TO); return Math.round(v * 10) / 10; }
  function scalePx(val) { var m = /^\s*([\d.]+)px\s*$/.exec(val || ''); return m ? bigger(parseFloat(m[1])) + 'px' : null; }
  function scaleFont(val) {
    if (!val || !/[\d.]+px/.test(val)) return null;
    var v = val.replace(/(^|\s)([\d.]+)px/, function (a, sp, n) { return sp + bigger(parseFloat(n)) + 'px'; });
    return v === val ? null : v;
  }
  function rgb2hsl(c) { var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2;
    if (mx !== mn) { var dd = mx - mn; s = l > .5 ? dd / (2 - mx - mn) : dd / (mx + mn);
      h = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; h /= 6; }
    return [h, s, l]; }
  function hsl2rgb(h, s, l) { function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
    if (!s) return [l * 255, l * 255, l * 255].map(Math.round);
    var q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map(function (v) { return Math.round(v * 255); }); }
  var colorCache = {};
  function fixColor(val, kind) {
    var key = kind + val; if (key in colorCache) return colorCache[key];
    var out = null, c = parseRgb(val);
    if (c && c[3] >= 0.5) {
      var L = lum(c), bg = REF_BG[kind];
      if (!(L > 0.8 || L < 0.01) && ratio(c, bg) < MIN_RATIO) {
        var hsl = rgb2hsl(c), step = kind === 'light' ? -0.02 : 0.02, n = c;
        for (var i = 0; i < 50; i++) {
          hsl[2] = Math.max(0, Math.min(1, hsl[2] + step));
          n = hsl2rgb(hsl[0], hsl[1], hsl[2]);
          if (ratio(n, bg) >= MIN_RATIO) break;
        }
        out = c[3] < 1 ? 'rgba(' + n.join(',') + ',' + c[3] + ')' : 'rgb(' + n.join(',') + ')';
      }
    }
    colorCache[key] = out; return out;
  }
  function hasOwnBg(s) {
    var b = s.backgroundColor || '', bi = s.backgroundImage || '', bb = s.background || '';
    if (bi && bi !== 'none' && bi !== 'initial') return true;
    var v = b || bb; if (!v) return false;
    var c = parseRgb(v.trim()); if (c && c[3] < 0.35) return false;
    return !/^(transparent|none|initial|inherit|unset)$/.test(v.trim());
  }
  function processDecl(s, rec, kind) {
    function put(p, nv) { if (rec) rec.push({ s: s, p: p, o: s.getPropertyValue(p), pr: s.getPropertyPriority(p) }); s.setProperty(p, nv, s.getPropertyPriority(p)); }
    if (fsOn) {
      if (s.fontSize) { var a = scalePx(s.fontSize); if (a) put('font-size', a); }
      else if (s.font) { var b = scaleFont(s.font); if (b) put('font', b); }
    }
    if (ckOn && s.color && !hasOwnBg(s)) { var c = fixColor(s.color, kind); if (c) put('color', c); }
  }
  function walkRules(rules, rec, kind, opq) {
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.cssRules && r.cssRules.length) walkRules(r.cssRules, rec, kind, opq);
      if (!r.style) continue;
      processDecl(r.style, rec, kind);
      /* 🔴🔴 2026-10-03 見えないルール：`font: 800 24px var(--num)` の**後に** font-variant-numeric などを書いたルールは、
         Chrome が中身を返さない（font も font-size も空・cssText も空の箱だらけ）。FlowDesk のカードの CSS に 162か所。
         ⚠ ほっておくと「大きさ」で**その字だけ 1.2倍にならない**（売上の大きい数字など＝いちばん読みたい字）。
         → 印だけ付けて、あとで CSS の元の文字から直す（opaqueFix） */
      if (fsOn && opq && !r.style.fontSize && !r.style.font && r.style.length && hasFontBox(r.style)) opq.push(r);
    }
  }
  function hasFontBox(st) { for (var i = 0; i < st.length; i++) if (st[i] === 'font-size') return true; return false; }

  /* ---- 見えないルールを、CSS の元の文字から直す ---- */
  var srcCache = {};
  function srcText(sh) {
    var n = sh.ownerNode;
    if (n && n.tagName === 'STYLE') return Promise.resolve(n.textContent || '');
    if (!sh.href) return Promise.resolve('');
    if (!srcCache[sh.href]) srcCache[sh.href] = fetch(sh.href, { cache: 'force-cache' }).then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; });
    return srcCache[sh.href];
  }
  function normSel(x) { return String(x || '').replace(/\s+/g, '').replace(/'/g, '"'); }
  function srcMap(text) {
    var m = {}, re = /([^{}]+)\{([^{}]*)\}/g, x;
    text = String(text).replace(/\/\*[\s\S]*?\*\//g, '');
    while ((x = re.exec(text))) { var k = normSel(x[1]); if (k.charAt(0) === '@') continue; (m[k] = m[k] || []).push(x[2]); }
    return m;
  }
  function decls(body) {
    return body.split(';').map(function (t) { var i = t.indexOf(':'); return i < 0 ? null : [t.slice(0, i).trim().toLowerCase(), t.slice(i + 1).trim()]; }).filter(Boolean);
  }
  function opaqueFix(sh, list, rec) {
    if (!list.length) return;
    var g = gen;
    srcText(sh).then(function (text) {
      if (g !== gen || !fsOn || !text) return;
      var map = srcMap(text), used = {};
      list.forEach(function (r) {
        var k = normSel(r.selectorText), bodies = map[k]; if (!bodies) return;
        var i = used[k] || 0, ds = null;
        for (; i < bodies.length; i++) { var d0 = decls(bodies[i]); if (d0.some(function (d) { return d[0] === 'font'; })) { ds = d0; break; } }
        used[k] = i + 1; if (!ds) return;
        var fi = -1; ds.forEach(function (d, j) { if (d[0] === 'font') fi = j; });
        var raw = ds[fi][1], imp = /!important/i.test(raw) ? 'important' : '', val = raw.replace(/!important/i, '').trim();
        var nv = scaleFont(val); if (!nv) return;
        var after = ds.slice(fi + 1).filter(function (d) { return /^font-/.test(d[0]); });
        function put(v) {
          r.style.setProperty('font', v, imp);
          after.forEach(function (d) { r.style.setProperty(d[0], d[1].replace(/!important/i, '').trim(), /!important/i.test(d[1]) ? 'important' : ''); });
        }
        put(nv);
        if (rec) rec.push({ fn: function () { put(val); } });
      });
      if (mag.on) { mag.frameKey = null; schedule(); }
    });
  }
  function sheetRules(sh) { try { return sh.cssRules; } catch (e) { return null; } }
  function isOwn(node) { return node && (node.id === 'cf-a11y-css' || node.id === 'cf-power-css'); }   /* 自分と電源メニューは触らない */

  var rec = [], doneSheets = new WeakSet(), inlineDone = new WeakMap(), obs = null, curKind = 'dark', gen = 0;
  function processSheet(sh) {
    if (!sh || doneSheets.has(sh) || isOwn(sh.ownerNode)) return;
    var rs = sheetRules(sh); if (!rs) return;
    doneSheets.add(sh);
    var opq = []; walkRules(rs, rec, curKind, opq); opaqueFix(sh, opq, rec);
  }
  function processInline(el) {
    if (!el.style || !el.getAttribute || !el.getAttribute('style')) return;
    if (el.closest && el.closest('#cf-a11y, #cf-mag')) return;
    var now = el.getAttribute('style');
    if (inlineDone.get(el) === now) return;
    processDecl(el.style, rec, curKind);
    inlineDone.set(el, el.getAttribute('style'));
  }
  function processTree(node) {
    if (node.nodeType !== 1) return;
    processInline(node);
    var list = node.querySelectorAll('[style]');
    for (var i = 0; i < list.length; i++) processInline(list[i]);
  }
  function revertAll() {
    if (obs) { obs.disconnect(); obs = null; }
    for (var i = rec.length - 1; i >= 0; i--) { var t = rec[i]; try { if (t.fn) t.fn(); else t.s.setProperty(t.p, t.o, t.pr); } catch (e) {} }
    rec = []; doneSheets = new WeakSet(); inlineDone = new WeakMap(); gen++;
  }
  function applyAll() {
    revertAll();
    root.removeAttribute('data-cf-kukkiri');
    curKind = themeKind();                         /* ⚠ 色の変数を差し替える前に測る */
    if (ckOn) root.setAttribute('data-cf-kukkiri', curKind);
    if (!fsOn && !ckOn) return;
    for (var i = 0; i < d.styleSheets.length; i++) processSheet(d.styleSheets[i]);
    Array.prototype.forEach.call(d.querySelectorAll('link[rel="stylesheet"]'), function (n) {
      if (!n.sheet || !sheetRules(n.sheet)) n.addEventListener('load', function () { if (fsOn || ckOn) processSheet(n.sheet); }, { once: true });
    });
    if (d.body) processTree(d.body);
    obs = new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i];
        if (m.type === 'attributes') { processInline(m.target); continue; }
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n.nodeType !== 1) continue;
          if (n.tagName === 'STYLE') { processSheet(n.sheet); continue; }
          if (n.tagName === 'LINK') { n.addEventListener('load', function () { processSheet(this.sheet); }); continue; }
          processTree(n);
        }
      }
    });
    obs.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  }
  w.addEventListener('load', function () { if (fsOn || ckOn) for (var i = 0; i < d.styleSheets.length; i++) processSheet(d.styleSheets[i]); });
  /* テーマを切り替えたら、色の寄せ方（濃く／明るく）が逆になるのでやり直す */
  new MutationObserver(function () {
    if (ckOn) setTimeout(applyAll, 0);
    if (mag.on) { mag.frameKey = null; schedule(); }
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  /* =======================================================
     ③ 拡大鏡
     ======================================================= */
  var mag = { on: false, el: null, fr: null, x: -1, y: -1, dirty: true, timer: 0, obs: null, frameKey: null };
  function pathOf(el) {
    var p = [];
    while (el && el !== d.body) { var par = el.parentNode; if (!par || !par.children) return null; p.unshift(Array.prototype.indexOf.call(par.children, el)); el = par; }
    return el === d.body ? p : null;
  }
  function byPath(body, p) { var el = body; for (var i = 0; i < p.length; i++) { el = el && el.children[p[i]]; } return el; }
  function buildLens() {
    var el = d.createElement('div'); el.id = 'cf-mag';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<iframe tabindex="-1" title=""></iframe><span class="cf-mag-tip">右クリックで閉じる</span>';
    d.body.appendChild(el);
    mag.el = el; mag.fr = el.querySelector('iframe');
    var fd = mag.fr.contentDocument;
    fd.open(); fd.write('<!doctype html><html><head></head><body></body></html>'); fd.close();
  }
  function frameHead(fd) {
    var key = (fsOn ? 'F' : '') + (ckOn ? 'C' : '') + curKind;
    if (mag.frameKey === key) return;
    mag.frameKey = key;
    var nh = fd.importNode(d.head, true);
    Array.prototype.forEach.call(nh.querySelectorAll('script'), function (s) { s.remove(); });
    var b = fd.createElement('base'); b.href = location.href; nh.insertBefore(b, nh.firstChild);
    fd.head.replaceWith(nh);
    if (!fsOn && !ckOn) return;
    var kind = curKind;
    Array.prototype.forEach.call(fd.querySelectorAll('link[rel="stylesheet"], style'), function (n) {
      if (isOwn(n)) return;
      function go() { var rs = n.sheet && sheetRules(n.sheet); if (rs) { var o = []; walkRules(rs, null, kind, o); opaqueFix(n.sheet, o, null); schedule(); } }
      if (n.sheet && sheetRules(n.sheet)) { var o = []; walkRules(n.sheet.cssRules, null, kind, o); opaqueFix(n.sheet, o, null); } else n.addEventListener('load', go);
    });
  }
  function snapshot() {
    mag.dirty = false;
    var fd = mag.fr.contentDocument; if (!fd) return;
    mag.fr.style.width = w.innerWidth + 'px'; mag.fr.style.height = w.innerHeight + 'px';
    var fh = fd.documentElement;
    Array.prototype.slice.call(fh.attributes).forEach(function (a) { fh.removeAttribute(a.name); });
    Array.prototype.forEach.call(root.attributes, function (a) { fh.setAttribute(a.name, a.value); });
    fh.classList.remove('cf-mag-on');
    frameHead(fd);
    var nb = fd.importNode(d.body, true);
    Array.prototype.forEach.call(nb.querySelectorAll('script, #cf-mag, iframe, video, audio'), function (s) { s.remove(); });
    fd.body.replaceWith(nb);
    var oc = d.body.querySelectorAll('canvas');
    for (var i = 0; i < oc.length; i++) {
      var p = pathOf(oc[i]); if (!p) continue;
      var cc = byPath(nb, p); if (!cc || cc.tagName !== 'CANVAS') continue;
      try { cc.width = oc[i].width; cc.height = oc[i].height; cc.getContext('2d').drawImage(oc[i], 0, 0); } catch (e) {}
    }
    syncScroll();
  }
  function syncScroll() {
    var fd = mag.fr && mag.fr.contentDocument; if (!fd || !fd.body) return;
    try { mag.fr.contentWindow.scrollTo(w.scrollX, w.scrollY); } catch (e) {}
    var list = d.body.querySelectorAll('*');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (!el.scrollTop && !el.scrollLeft) continue;
      var p = pathOf(el); if (!p) continue;
      var c = byPath(fd.body, p); if (!c) continue;
      c.scrollTop = el.scrollTop; c.scrollLeft = el.scrollLeft;
    }
  }
  function schedule() {
    if (!mag.on) return;
    mag.dirty = true;
    if (mag.timer) return;
    mag.timer = setTimeout(function () { mag.timer = 0; if (mag.on && mag.dirty) { try { snapshot(); } catch (e) {} place(); } }, 300);
  }
  function place() {
    if (!mag.on || mag.x < 0) return;
    var W = w.innerWidth, H = w.innerHeight, x = mag.x, y = mag.y;
    var L = x - LENS_W * 0.5, T = y - LENS_H * 0.6;          /* カーソルは窓の「中央やや下」 */
    if (L < 6) L = 6; if (L + LENS_W > W - 6) L = W - 6 - LENS_W;
    if (T < 6) T = 6; if (T + LENS_H > H - 6) T = H - 6 - LENS_H;
    var ax = x - L, ay = y - T;
    mag.el.style.transform = 'translate(' + L + 'px,' + T + 'px)';
    mag.fr.style.transform = 'translate(' + (ax - x * MAG_ZOOM - 3) + 'px,' + (ay - y * MAG_ZOOM - 3) + 'px) scale(' + MAG_ZOOM + ')';
    mag.el.classList.add('show');
  }
  function onMove(e) { if (e.pointerType === 'touch') return; mag.x = e.clientX; mag.y = e.clientY; place(); }
  function onLeave(e) { if (!e.relatedTarget && mag.el) mag.el.classList.remove('show'); }
  function onCtx(e) { if (!mag.on) return; e.preventDefault(); e.stopImmediatePropagation(); setMag(false); }
  function onScroll() { if (mag.on) w.requestAnimationFrame(syncScroll); }
  function setMag(v) {
    v = !!v && enabled;
    if (v === mag.on) return;
    mag.on = v;
    var fn = v ? 'addEventListener' : 'removeEventListener';
    if (v) {
      if (!mag.el) buildLens();
      root.classList.add('cf-mag-on');
      mag.frameKey = null;
      try { snapshot(); } catch (e) {}
      mag.obs = new MutationObserver(function (ms) {
        for (var i = 0; i < ms.length; i++) { if (!(mag.el && mag.el.contains(ms[i].target))) { schedule(); return; } }
      });
      mag.obs.observe(d.body, { childList: true, subtree: true, attributes: true, characterData: true });
    } else {
      root.classList.remove('cf-mag-on');
      if (mag.el) mag.el.classList.remove('show');
      if (mag.obs) { mag.obs.disconnect(); mag.obs = null; }
    }
    w[fn]('pointermove', onMove, true);
    d[fn]('pointerout', onLeave, true);
    w[fn]('contextmenu', onCtx, true);
    w[fn]('scroll', onScroll, true);
    w[fn]('input', schedule, true);
    w[fn]('resize', schedule);
    if (v) place();
    paint();
  }

  /* =======================================================
     ヘッダーのスイッチ
     ======================================================= */
  var bar = null;
  function paint() {
    if (!bar) return;
    bar.querySelector('[data-k=kukkiri]').setAttribute('aria-pressed', String(!!prefs.kukkiri));
    bar.querySelector('[data-k=ookisa]').setAttribute('aria-pressed', String(!!prefs.ookisa));
    bar.querySelector('[data-k=mag]').setAttribute('aria-pressed', String(mag.on));
  }
  function removeOldAAA() { var g = d.getElementById('tb-fontsize-group'); if (g && g.parentNode) g.parentNode.removeChild(g); }
  function mount() {
    if (bar && bar.isConnected) return true;
    var slot = d.getElementById('cf-a11y-slot') || d.getElementById('tb-fontsize-group');
    if (!slot) return false;
    bar = d.createElement('div'); bar.className = 'cf-a11y'; bar.id = 'cf-a11y';
    bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', '見やすさ');
    bar.innerHTML =
        '<button type="button" data-k="kukkiri" title="薄い文字を濃くする（押すたびに ON／OFF）"><span class="dot"></span>くっきり</button>'
      + '<button type="button" data-k="ookisa" title="文字を1.2倍にする（押すたびに ON／OFF）"><span class="dot"></span>大きさ</button>'
      + '<button type="button" data-k="mag" title="拡大鏡（右クリックで閉じる）"><span class="dot"></span>拡大鏡</button>';
    slot.parentNode.replaceChild(bar, slot);
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      e.stopPropagation();
      var k = b.getAttribute('data-k');
      if (k === 'kukkiri' || k === 'ookisa') {
        prefs[k] = !prefs[k];
        ckOn = prefs.kukkiri; fsOn = prefs.ookisa; applyAll();
        savePrefs();
        if (mag.on) { mag.frameKey = null; schedule(); }
      }
      if (k === 'mag') setMag(!mag.on);
      paint();
    });
    paint();
    return true;
  }
  function unmount() {
    if (bar && bar.parentNode) { var s = d.createElement('span'); s.id = 'cf-a11y-slot'; bar.parentNode.replaceChild(s, bar); }
    bar = null;
  }

  /* 前の AAA（body の zoom）は使わない＝前に選んだ「大」「特大」が残っていても標準に戻す（全員） */
  function killOldZoom() { if (root.getAttribute('data-fontsize') && root.getAttribute('data-fontsize') !== 'md') root.setAttribute('data-fontsize', 'md'); }

  function setState(on, p) {
    enabled = !!on;
    if (enabled) root.classList.add('cf-a11y-on'); else root.classList.remove('cf-a11y-on');
    prefs.kukkiri = enabled && !!(p && p.kukkiri);
    prefs.ookisa = enabled && !!(p && p.ookisa);
    prefs.viewer = !(p && p.viewer === false);              /* 決めていなければ ON */
    var vw = enabled && prefs.viewer;
    var ck = VIEWER ? vw : prefs.kukkiri, fs = VIEWER ? vw : prefs.ookisa;
    root.classList.toggle('cf-simple', SIMPLE && vw);
    if (ck !== ckOn || fs !== fsOn) { ckOn = ck; fsOn = fs; applyAll(); }
    if (!enabled) { setMag(false); unmount(); }
    else if (!VIEWER && !mount()) { var n = 0, t = setInterval(function () { if (mount() || ++n > 60) clearInterval(t); }, 500); }
    paint();
    if (lastSig !== sig()) { lastSig = sig(); try { w.dispatchEvent(new CustomEvent('cf-a11y-change', { detail: w.CFA11y && w.CFA11y.state() })); } catch (e) {} }
  }
  var lastSig = '';
  function sig() { return [enabled, prefs.kukkiri, prefs.ookisa, prefs.viewer].join(); }
  /* 見る画面の「見やすい表示」を切り替える（FlowDesk・FlowGo の設定から） */
  function setViewer(v) {
    if (!enabled) return;
    setState(true, { kukkiri: prefs.kukkiri, ookisa: prefs.ookisa, viewer: !!v });
    savePrefs();
  }
  /* 🔴 通知を押すと本文が開く（情報を減らしている時だけ）。2回目は今までどおり（アプリで開く など） */
  d.addEventListener('click', function (e) {
    if (!root.classList.contains('cf-simple')) return;
    var it = e.target && e.target.closest && e.target.closest('.fd-it');
    if (!it || e.target.closest('button, a, input, select, textarea')) return;
    var tx = it.querySelector('.fd-text');
    if (!tx || it.classList.contains('cf-open')) return;
    it.classList.add('cf-open'); e.preventDefault(); e.stopPropagation();
  }, true);

  /* =======================================================
     Firestore：名簿の旗（portalMembers.a11y）と、本人の設定（userPrefs/{uid}.cfA11y）
     ⚠ アプリごとに Firebase の持ち方がバラバラなので、共通の firebase（compat）を直接使う
     ======================================================= */
  function cid() {
    try { var c = (w.fb && w.fb.currentCompanyId) || w.COMPANY_ID || w.companyId || ''; if (c) return String(c); } catch (e) {}
    return CID_FALLBACK;
  }
  function db() { try { return (w.fb && w.fb.db) || (w.firebase && w.firebase.apps && w.firebase.apps.length && w.firebase.firestore()); } catch (e) { return null; } }
  function normEmail(s) { return String(s || '').normalize('NFKC').toLowerCase().trim(); }

  function readMemberFlag(user) {
    var D = db(); if (!D) return Promise.resolve(null);
    var col = D.collection('companies').doc(cid()).collection('portalMembers');
    /* 名簿の書類の名前は uid とは限らない（招待から作った人）＝メールで引く。ダメなら uid */
    var em = user.email || '';
    var tries = [];
    if (em) tries.push(function () { return col.where('email', '==', em).limit(1).get().then(function (s) { return s.empty ? null : s.docs[0].data(); }); });
    if (em && normEmail(em) !== em) tries.push(function () { return col.where('email', '==', normEmail(em)).limit(1).get().then(function (s) { return s.empty ? null : s.docs[0].data(); }); });
    tries.push(function () { return col.doc(user.uid).get().then(function (s) { return s.exists ? s.data() : null; }); });
    var i = 0;
    function next() { if (i >= tries.length) return Promise.resolve(null);
      return tries[i++]().then(function (m) { return m || next(); }, function () { return next(); }); }
    return next().then(function (m) { return m ? !!m.a11y : null; });
  }
  function prefsDoc() { var D = db(); return D && uid ? D.collection('companies').doc(cid()).collection('userPrefs').doc(uid) : null; }
  function readPrefs() {
    var ref = prefsDoc(); if (!ref) return Promise.resolve(null);
    return ref.get().then(function (s) { var v = s.exists ? (s.data() || {}).cfA11y : null; return v || {}; }, function () { return null; });
  }
  var _saveT = 0;
  function savePrefs() {
    writeCache(uid, enabled, prefs);
    clearTimeout(_saveT);
    _saveT = setTimeout(function () {
      var ref = prefsDoc(); if (!ref) return;
      /* 🔴 merge 必須（同じ書類に memberId / memberEmail ＝ルールの橋渡しが入っている） */
      ref.set({ cfA11y: { kukkiri: !!prefs.kukkiri, ookisa: !!prefs.ookisa, viewer: prefs.viewer !== false, at: Date.now() } }, { merge: true })
        .catch(function (e) { try { console.warn('[cf-a11y] 設定を保存できませんでした', e); } catch (_) {} });
    }, 400);
  }

  function onUser(user) {
    if (!user) { uid = ''; if (stopPrefs) { try { stopPrefs(); } catch (e) {} stopPrefs = null; } setState(false); return; }
    uid = user.uid;
    readMemberFlag(user).then(function (flag) {
      if (flag === null) {                      /* 読めなかった（通信など）＝控えがこの人なら控えのまま */
        if (cache && cache.uid === uid) setState(cache.on, cache);
        return;
      }
      if (!flag) { setState(false); writeCache(uid, false, prefs); return; }
      return readPrefs().then(function (p) {
        if (p === null) p = (cache && cache.uid === uid) ? cache : {};
        setState(true, p); writeCache(uid, true, prefs);
        watchPrefs();
      });
    });
  }
  /* 別の窓・別の端末で変えたら、こちらにもすぐ効かせる（FlowDesk の設定の窓 → 本体の窓 など） */
  var stopPrefs = null;
  function watchPrefs() {
    if (stopPrefs) { try { stopPrefs(); } catch (e) {} stopPrefs = null; }
    var ref = prefsDoc(); if (!ref || !ref.onSnapshot) return;
    try {
      stopPrefs = ref.onSnapshot(function (s) {
        var v = s && s.exists ? (s.data() || {}).cfA11y : null;
        if (!v || !enabled) return;
        var nx = { kukkiri: !!v.kukkiri, ookisa: !!v.ookisa, viewer: v.viewer !== false };
        if (nx.kukkiri === prefs.kukkiri && nx.ookisa === prefs.ookisa && nx.viewer === prefs.viewer) return;
        setState(true, nx); writeCache(uid, true, prefs);
      }, function () {});
    } catch (e) {}
  }
  function watchAuth() {
    var n = 0;
    (function tryHook() {
      try {
        if (w.firebase && w.firebase.apps && w.firebase.apps.length && w.firebase.auth) {
          w.firebase.auth().onAuthStateChanged(function (u) { onUser(u); });
          return;
        }
        /* firebase の本体が見えない時は、アプリが持っている fb.auth から（FlowGo の見張り台など） */
        if (w.fb && w.fb.auth && typeof w.fb.auth.onAuthStateChanged === 'function' && w.fb.db) {
          w.fb.auth.onAuthStateChanged(function (u) { onUser(u); });
          return;
        }
      } catch (e) {}
      if (++n < 120) setTimeout(tryHook, 500);      /* Firebase の準備を最大1分待つ */
    })();
  }

  function boot() {
    injectCss();
    killOldZoom();
    removeOldAAA();
    /* 開いた瞬間：前回この端末で開いたのが見やすさの人なら、その設定を先に当てる（チラつき防止）。
       ログインが確かめられたら正本（Firestore）で決め直す */
    if (cache && cache.on) setState(true, cache);
    watchAuth();
  }

  w.CFA11y = {
    setMag: setMag,
    state: function () { return { enabled: enabled, kukkiri: prefs.kukkiri, ookisa: prefs.ookisa, viewer: prefs.viewer, simple: root.classList.contains('cf-simple'), mag: mag.on, uid: uid }; },
    setViewer: setViewer,
    /* 試験・見本用：Firestore を通さずに状態を決める */
    _set: function (on, p) { setState(on, p || {}); }
  };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
})(window, document);
