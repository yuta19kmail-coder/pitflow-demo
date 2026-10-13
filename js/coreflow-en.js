/* ============================================================
   coreflow-en.js ── 全アプリ共通「英語表示」（さっと確認する手引き）v1.0.0
   ------------------------------------------------------------
   ◎きっかけ（2026-10-12・ゆうた確定）
     🗣「緊急的に一瞬英語にできるってイメージ（参考書の手引き的なイメージ）。あくまで日本語に慣れる。
     　　本人があれ？これ何だっけ？ってなった時にさっと切り替えて、さっと確認するだけ。日本語の勉強も兼ねる」
     ・CoreFlow のメンバー管理で「英語表示」にチェック＝ portalMembers の `en: true`（見やすさ `a11y` と同じ並び）
     ・🔴 チェックがある人も**ふだんは日本語**。
       　バージョンのバッジを押す → 英語⇔日本語（押すたびに切替。タブレット用）
       　**F2 を押している間だけ英語**（離すと日本語）
       　保存しない＝開き直すと日本語
     ・英語のときは英語だけ（併記しない）。バッジは `EN` に変わる（目印）
     ・FlowDesk・FlowGo には入れない
     ・訳さない＝入力されたデータ（お客様名・メモ・品名）／入力欄の中身／お客様に出す紙・PDF
       → 印刷の直前に日本語へ戻し、印刷が終わったら英語に戻す

   ◎作り
     ・英語にする時だけ、画面の文字を辞書（coreflow-en-dict.js ＝ window.CF_EN_DICT）で置き換える。
       置き換えた所は控えておき、日本語に戻す時に元へ戻す。英語の間に画面が書き換わったら、そこも置き換える。
     ・辞書は旗のある人だけ読み込む（旗の無い人には何も起きない・何も読み込まない）
     ・訳し方（tr）
       ① まるごと辞書にある → それ
       ② 数字を # にした形が辞書にある（「#台」→「# cars」）→ 数字を戻して使う
       ③ 区切り（空白・／・：（）「」・数字など）で切って、日本語のかけら**全部**が①②で訳せる時だけ、つないで使う
       　 1つでも訳せないかけらがある時は、**その文字は日本語のまま**（お客様名などを半端に訳さないため）
     ・辞書に無い日本語は CFEn.missing() に溜まる（辞書を育てる時に使う）
     ・<html> に `cf-en` が付く。訳したくない所は `data-cf-noen` を付ける（その中は全部触らない）

   ◎置き場所
     バッジ＝各アプリの index.html のバージョン表示に `data-cf-ver` を付ける（無ければ #topbar .ver）
     script ＝ coreflow-a11y.js の後（名簿は CFA11y.member で1回だけ読む）
       <script src="js/coreflow-en.js?v=…" data-dict="js/coreflow-en-dict.js?v=…"></script>

   ⚠ 直す時は `_shared\coreflow-en.js` を直して `sync-shared.ps1` を走らせること。
   ============================================================ */
(function (w, d) {
  'use strict';
  if (w.CFEn) return;
  var root = d.documentElement;
  var JP = /[぀-ヿ㐀-鿿ｦ-ﾟ々〆ヶ]/;
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, NOSCRIPT: 1, TEMPLATE: 1, CODE: 1, PRE: 1, IFRAME: 1 };
  var ATTRS = ['title', 'placeholder', 'aria-label'];
  /* 名前の所は訳さない（顔アイコンの文字・ログイン中の人の名前）。「社長」「チーフ」は呼び名＝名前 */
  var NOEN_SEL = '[data-cf-noen],.av,[class*="avatar"],[id*="avatar"],.tb-username,#u-name,#u-av,.cf-user';
  var MY_SRC = (d.currentScript && d.currentScript.src) || '';
  /* 辞書の場所＝ script タグの data-dict（sync-shared.ps1 が ?v= を辞書の中身から付け直す） */
  var DICT_SRC = (d.currentScript && d.currentScript.getAttribute('data-dict')) || '';

  var flag = false;          /* 名簿の旗 */
  var on = false;            /* いま英語か */
  var hold = false;          /* F2 で一時的に英語にしている */
  var printBack = false;
  var recs = [];             /* 置き換えた所 { n: ノード, a: 属性名|null, o: 元, t: 訳 } */
  var seen = typeof WeakMap === 'function' ? new WeakMap() : null;
  var miss = {};
  var obs = null, busy = false;
  var badge = null, badgeText = '';

  /* ---------- 訳す ---------- */
  function dict() { return w.CF_EN_DICT || {}; }
  var PUNCT = { '（': '(', '）': ')', '：': ': ', '！': '!', '？': '?', '、': ', ', '。': '. ', '／': ' / ', '・': ' · ', '「': '"', '」': '"', '『': '"', '』': '"', '【': '[', '】': ']', '　': ' ', '〜': '~', '～': '~', '，': ', ', '＋': '+', '＝': '=', '％': '%', '｜': '|' };
  var MON = [, 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WDAY = { '日': 'Sun', '月': 'Mon', '火': 'Tue', '水': 'Wed', '木': 'Thu', '金': 'Fri', '土': 'Sat' };
  var SPLIT = /([\s　／\/・:：、，,。()（）「」『』【】\[\]｜|→←↑↓⇒…~〜～+＋=＝!！?？%％#＃*＊<>＜＞"'“”‘’]+|[0-9０-９][0-9０-９,.:\/\-]*)/;

  function look(s) {
    var D = dict();
    if (Object.prototype.hasOwnProperty.call(D, s)) return D[s];
    /* ② 数字を # に */
    var nums = [];
    var k = s.replace(/[0-9][0-9,.]*/g, function (m) { nums.push(m); return '#'; });
    if (nums.length && Object.prototype.hasOwnProperty.call(D, k)) {
      var i = 0;
      return D[k].replace(/#(\d)?/g, function (m, p) { return p ? (nums[+p - 1] || '') : (nums[i++] || ''); });
    }
    return null;
  }
  function tr(raw) {
    if (!raw || !JP.test(raw)) return null;
    var s = raw.replace(/\s+/g, ' ').trim();
    var hit = look(s);
    if (hit != null) return hit;
    /* 日付・時刻（10月12日 → 10/12、10月 → Oct、9時30分 → 9:30）。数字の後の「月」「日」を曜日・期間と取り違えないよう先に */
    s = s.replace(/(\d{2,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g, '$1/$2/$3')
         .replace(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/g, '$1/$2')
         .replace(/(\d{2,4})\s*年\s*(\d{1,2})\s*月(?![0-9])/g, function (m, y, mo) { return MON[+mo] ? MON[+mo] + ' ' + y : m; })
         .replace(/(\d{1,2})月(?![0-9])/g, function (m, mo) { return MON[+mo] || m; })
         .replace(/(\d{1,2})時(\d{1,2})分/g, function (m, h, mi) { return h + ':' + (mi.length < 2 ? '0' + mi : mi); });
    /* 曜日のカッコ（日）→ (Sun) */
    s = s.replace(/[（(]([日月火水木金土])[）)]/g, function (m, c) { return '(' + WDAY[c] + ')'; });
    if (!JP.test(s)) return s;
    var parts = s.split(SPLIT), out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p) continue;
      if (i % 2 === 1 || !JP.test(p)) {                  /* 区切り・数字・英字 */
        out.push(p.replace(/[（）：！？、。／・「」『』【】　〜～，＋＝％｜]/g, function (c) { return PUNCT[c] || c; }));
        continue;
      }
      var t = look(p);
      if (t == null) { miss[p] = (miss[p] || 0) + 1; return null; }
      out.push(t);
    }
    return out.join('').replace(/(\d)([A-Za-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2').replace(/([A-Za-z])\(/g, '$1 (').replace(/ {2,}/g, ' ').trim();
  }
  function trKeep(v) {                                   /* 前後の空白はそのまま */
    var t = tr(v); if (t == null) return null;
    var m = /^(\s*)[\s\S]*?(\s*)$/.exec(v);
    return m[1] + t + m[2];
  }

  /* ---------- 置き換える・戻す ---------- */
  function skipEl(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (SKIP_TAGS[e.tagName] || e.isContentEditable || (e.matches && e.matches(NOEN_SEL))) return true;
    }
    return false;
  }
  function doText(n) {
    var v = n.nodeValue;
    if (!v || !JP.test(v)) return;
    if (n.parentNode && skipEl(n.parentNode)) { return; }
    var t = trKeep(v); if (t == null) return;
    var r = seen && seen.get(n);
    if (r && !r.a) { r.o = v; r.t = t; }
    else { r = { n: n, a: null, o: v, t: t }; recs.push(r); if (seen) seen.set(n, r); }
    n.nodeValue = t;
  }
  function doAttr(el, a) {
    var v = el.getAttribute(a);
    if (!v || !JP.test(v)) return;
    var t = trKeep(v); if (t == null) return;
    recs.push({ n: el, a: a, o: v, t: t });
    el.setAttribute(a, t);
  }
  var FIELD = { INPUT: 1, TEXTAREA: 1 };   /* 入力欄：中身は触らない・title / placeholder だけ訳す */
  function attrOk(el) {
    if (!el || el.nodeType !== 1 || el.isContentEditable || el.matches(NOEN_SEL)) return false;
    if (SKIP_TAGS[el.tagName] && !FIELD[el.tagName]) return false;
    return !(el.parentNode && el.parentNode.nodeType === 1 && skipEl(el.parentNode));
  }
  function doEl(el) {
    if (!attrOk(el)) return;
    for (var i = 0; i < ATTRS.length; i++) if (el.hasAttribute(ATTRS[i])) doAttr(el, ATTRS[i]);
    if (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type) && JP.test(el.value)) {
      var v = el.value, t = trKeep(v); if (t != null) { recs.push({ n: el, a: '@value', o: v, t: t }); el.value = t; }
    }
  }
  function walk(node) {
    if (!node) return;
    if (node.nodeType === 3) { doText(node); return; }
    if (node.nodeType !== 1 && node.nodeType !== 11) return;
    if (node.nodeType === 1) { doEl(node); if (skipEl(node)) return; }
    var list = [], c;
    var tw = d.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (n.nodeType === 1) {
          if (FIELD[n.tagName]) { list.push(n); return NodeFilter.FILTER_REJECT; }   /* 属性だけ・中身（textarea の文字）は見ない */
          return (SKIP_TAGS[n.tagName] || n.isContentEditable || n.matches(NOEN_SEL)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while ((c = tw.nextNode())) list.push(c);
    for (var i = 0; i < list.length; i++) { if (list[i].nodeType === 3) doText(list[i]); else doEl(list[i]); }
  }
  function applyAll() {
    busy = true;
    try { walk(d.body); if (d.title && JP.test(d.title)) { var t = tr(d.title); if (t != null) { recs.push({ n: d, a: '@title', o: d.title, t: t }); d.title = t; } } }
    finally { busy = false; }
    if (!obs && w.MutationObserver) {
      obs = new MutationObserver(function (ms) {
        if (busy || !on) return;
        busy = true;
        try {
          for (var i = 0; i < ms.length; i++) {
            var m = ms[i];
            if (m.type === 'characterData') { doText(m.target); continue; }
            if (m.type === 'attributes') { if (attrOk(m.target)) doAttr(m.target, m.attributeName); continue; }
            for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
          }
        } finally { obs.takeRecords(); busy = false; }
      });
    }
    if (obs) obs.observe(d.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function revertAll() {
    if (obs) obs.disconnect();
    busy = true;
    try {
      for (var i = recs.length - 1; i >= 0; i--) {
        var r = recs[i];
        if (r.a === null) { if (r.n.nodeValue === r.t) r.n.nodeValue = r.o; if (seen) seen.delete(r.n); }
        else if (r.a === '@value') { if (r.n.value === r.t) r.n.value = r.o; }
        else if (r.a === '@title') { if (d.title === r.t) d.title = r.o; }
        else if (r.n.getAttribute(r.a) === r.t) r.n.setAttribute(r.a, r.o);
      }
    } finally { busy = false; }
    recs = [];
  }

  /* ---------- 切り替え ---------- */
  function setOn(v) {
    v = !!v && flag;
    if (v === on) return;
    if (v && !w.CF_EN_DICT) { loadDict().then(function () { if (flag) setOn(true); }); return; }
    on = v;
    if (on) applyAll(); else revertAll();
    root.classList.toggle('cf-en', on);
    paintBadge();
  }
  var _dictP = null;
  function loadDict() {
    if (w.CF_EN_DICT) return Promise.resolve();
    if (_dictP) return _dictP;
    _dictP = new Promise(function (res) {
      var s = d.createElement('script');
      s.src = DICT_SRC || (MY_SRC ? MY_SRC.replace(/coreflow-en\.js(\?.*)?$/, '') : 'js/') + 'coreflow-en-dict.js';
      s.onload = function () { res(); };
      s.onerror = function () { _dictP = null; try { console.warn('[cf-en] 辞書を読めませんでした'); } catch (e) {} res(); };
      d.head.appendChild(s);
    });
    return _dictP;
  }

  /* ---------- バッジ ---------- */
  var CSS = ''
    + '.cf-en-badge{cursor:pointer!important;user-select:none}'
    + '.cf-en-badge:hover{filter:brightness(1.25)}'
    + 'html.cf-en .cf-en-badge{background:#1d4ed8!important;color:#fff!important;font-weight:700!important;letter-spacing:.06em}';
  function findBadge() {
    return d.querySelector('[data-cf-ver]') || d.querySelector('#topbar .ver');
  }
  function paintBadge() {
    if (!badge) return;
    badge.textContent = on ? 'EN' : badgeText;
  }
  function wireBadge() {
    var b = findBadge(); if (!b || b === badge) return;
    badge = b; badgeText = b.textContent;
    b.setAttribute('data-cf-noen', '');
    b.classList.add('cf-en-badge');
    b.title = 'English（F2 を押している間だけ英語）';
    b.setAttribute('role', 'button'); b.tabIndex = 0;
    b.addEventListener('click', function (e) { if (!flag) return; e.preventDefault(); e.stopPropagation(); hold = false; setOn(!on); });
    b.addEventListener('keydown', function (e) { if (flag && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); hold = false; setOn(!on); } });
  }
  function unwireBadge() {
    if (!badge) return;
    badge.classList.remove('cf-en-badge'); badge.removeAttribute('role'); badge.removeAttribute('tabindex'); badge.removeAttribute('title');
    badge.textContent = badgeText; badge = null;
  }

  /* ---------- キー（F2 を押している間だけ） ---------- */
  d.addEventListener('keydown', function (e) {
    if (!flag || e.key !== 'F2') return;
    e.preventDefault();
    if (e.repeat) return;
    if (!on) { hold = true; setOn(true); }
  }, true);
  d.addEventListener('keyup', function (e) {
    if (!flag || e.key !== 'F2') return;
    e.preventDefault();
    if (hold) { hold = false; setOn(false); }
  }, true);
  w.addEventListener('blur', function () { if (hold) { hold = false; setOn(false); } });

  /* ---------- 印刷は日本語で ---------- */
  w.addEventListener('beforeprint', function () { if (on) { printBack = true; setOn(false); } });
  w.addEventListener('afterprint', function () { if (printBack) { printBack = false; setOn(true); } });

  /* ---------- 旗（名簿の `en`） ---------- */
  function setFlag(v) {
    flag = !!v;
    if (flag) { wireBadge(); loadDict(); }
    else { setOn(false); unwireBadge(); }
  }
  function readMember(user) {
    if (w.CFA11y && typeof w.CFA11y.member === 'function') return w.CFA11y.member(user);
    return Promise.resolve(null);
  }
  function onUser(user) {
    if (!user) { setFlag(false); return; }
    readMember(user).then(function (m) { if (m === null) return; setFlag(!!(m && m.en)); });
  }
  function watchAuth() {
    var n = 0;
    (function tryHook() {
      try {
        if (w.firebase && w.firebase.apps && w.firebase.apps.length && w.firebase.auth) { w.firebase.auth().onAuthStateChanged(onUser); return; }
        if (w.fb && w.fb.auth && typeof w.fb.auth.onAuthStateChanged === 'function') { w.fb.auth.onAuthStateChanged(onUser); return; }
      } catch (e) {}
      if (++n < 120) setTimeout(tryHook, 500);
    })();
  }
  function boot() {
    var st = d.createElement('style'); st.id = 'cf-en-css'; st.textContent = CSS; d.head.appendChild(st);
    watchAuth();
  }

  w.CFEn = {
    on: function () { return on; },
    flag: function () { return flag; },
    toggle: function () { hold = false; setOn(!on); },
    tr: tr,
    /* 辞書に無かった日本語（多い順）。辞書を育てる時に使う */
    missing: function () { return Object.keys(miss).sort(function (a, b) { return miss[b] - miss[a]; }); },
    /* 試験・見本用：名簿を通さずに旗を立てる */
    _flag: setFlag
  };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
})(window, document);
