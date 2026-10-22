/* =========================================================
   coreflow-file.js ─ 🔐 CFFile＝ファイル置き場（Firebase Storage）の物を「ログインした人の権限で」取ってきて見せる  v1.1.0  2026-10-20（見張り auto）
   ---------------------------------------------------------
   🔴 全アプリ共通の本体はここ。アプリの js\coreflow-file.js は写し（sync-shared.ps1 が配る）。

   なぜ（セキュリティ棚卸し M-2・ゆうた「添付の件はそれで進めて」）：
     付箋・CoreBoard・CoreNote・MHS の添付、StockFlow の料金表、写真などは、置いた時に getDownloadURL の
     「鍵つきの住所」（…?alt=media&token=…）を書類に保存していた。この住所は**ログインしなくても・期限なしで**誰でも開ける＝
     LINE やメールに貼られると、その先はずっと見られる。
   どうするか：
     住所の鍵（token）を使わず、**ログインの合札（ID トークン）を付けて中身だけ取り**、この画面の中だけで有効な blob: で見せる
     （CarFlow の相場ビュー・マニュアル v3.16.5 と同じやり方）。読めるかどうかは storage.rules が決める。
     ⚠ 逃げ道：取れない時（置き場の許可＝CORS がまだ・古い物）は、保存してある鍵つきの住所でそのまま開く（今までと同じ）。
       ＝これを出した時点では何も壊れない。鍵つきの住所を効かなくするのは、全部がこの形で動くのを確かめてから（サーバーで1回）

   使い方：
     CFFile.pathOf(src)          → 置き場の道（companies/… など）。src は道でも鍵つきの住所でもよい（住所から道を読み取る）
     CFFile.url(src)             → Promise<blob: の住所>（同じ物は覚えておく）。取れなければ src が住所ならそれを返す
     CFFile.url(src, true)       → 枠（iframe）・別タブ・ダウンロードの印で開く用。HTML・SVG などは文字（text/plain）で渡す（SEC-03）。<img> には付けない
     CFFile.open(src, name)      → 新しいタブで開く（PDF など）。窓が開けなければ保存にする
     CFFile.fill(root)           → root の中の <img data-cf-src="…"> / <a data-cf-open="…"> を、取ってきた中身に差し替える
     CFFile.img(src)             → '<img data-cf-src="…">' の形を作るだけ（描いた後に fill を呼ぶ）
   ========================================================= */
(function (root) {
  'use strict';
  var VERSION = '1.3.2';
  var CACHE = {};          /* 道 → Promise<blob: の住所> */
  var MAX = 300;           /* 覚えておく数（多すぎたら古い物から捨てる） */
  var ORDER = [];

  function bucket() {
    try { var o = root.firebase && root.firebase.app && root.firebase.app().options; if (o && o.storageBucket) return o.storageBucket; } catch (e) {}
    return 'carflow-9d500.firebasestorage.app';
  }
  function isUrl(s) { return /^https?:\/\//i.test(String(s || '')); }
  /* 鍵つきの住所 → 道。https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<道を%で書いた物>?alt=media&token=… */
  function pathOf(src) {
    var s = String(src || '');
    if (!s || /^(data|blob):/i.test(s)) return '';   /* 画面の中だけの物（選んだばかりの絵など）は置き場の物ではない */
    if (!isUrl(s)) return s.replace(/^\/+/, '');
    var m = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?#]+)/.exec(s);
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch (e) { return ''; }
  }
  /* 🔐 v1.2.0 鍵の無い住所（…/o/<道>?alt=media）。上げた物の欄にはこれを入れる＝住所の形は今までと同じ（見せる所を書き換えずに済む）。
     ログインしていない人が開いても置き場に断られる。ログインした人の画面では見張りが中身に差し替える */
  function plainUrl(src) {
    var path = pathOf(src);
    if (!path) return String(src || '');
    return 'https://firebasestorage.googleapis.com/v0/b/' + bucket() + '/o/' + encodeURIComponent(path) + '?alt=media';
  }
  function user() {
    try { if (root.fb && root.fb.currentUser) return root.fb.currentUser; } catch (e) {}
    try { if (root.firebase && root.firebase.auth) return root.firebase.auth().currentUser; } catch (e) {}
    return null;
  }
  function blob(path) {
    var u = user();
    if (!u || typeof u.getIdToken !== 'function' || !path) return Promise.reject(Object.assign(new Error('no user or path'), { status: 401 }));
    var url = 'https://firebasestorage.googleapis.com/v0/b/' + bucket() + '/o/' + encodeURIComponent(path) + '?alt=media';
    return u.getIdToken().then(function (t) {
      return fetch(url, { headers: { Authorization: 'Firebase ' + t }, cache: 'no-store' });
    }).then(function (r) {
      if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
      return r.blob();
    });
  }
  function remember(path, p) {
    CACHE[path] = p; ORDER.push(path);
    if (ORDER.length > MAX) { var old = ORDER.shift(); var q = CACHE[old]; delete CACHE[old]; if (q) q.then(function (x) { try { if (/^blob:/.test(x)) URL.revokeObjectURL(x); } catch (e) {} }, function () {}); }
  }
  /* 🔐 2026-10-21 外部監査 SEC-03：取ってきた中身はこの画面と同じ生まれ（blob:）になる。
     別タブで開く・枠（iframe）に入れる時に限り、HTML・SVG・XML・JS のような「中で動く種類」は文字（text/plain）として渡す
     ＝画像・PDF・Excel・Word などの見え方は今まで通り。<img> はそもそも中で動かないので触らない */
  var ACTIVE = /^\s*(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|text\/(java|ecma)script|application\/(x-)?(java|ecma)script)\b/i;
  function url(src, inert) {
    var path = pathOf(src);
    if (!path) return Promise.resolve(String(src || ''));   /* 置き場の物でない（data:・blob:・よその住所）＝そのまま */
    var key = inert ? path + '#inert' : path;
    if (CACHE[key]) return CACHE[key];
    var p = blob(path).then(function (b) {
      if (inert && b && ACTIVE.test(String(b.type || ''))) b = new Blob([b], { type: 'text/plain;charset=utf-8' });
      return URL.createObjectURL(b);
    }, function (e) {
      delete CACHE[key];
      /* 逃げ道：保存してある鍵つきの住所（今までと同じ見え方）。道しか無ければ空 */
      if (isUrl(src) && /[?&]token=/.test(String(src))) return String(src);
      throw e;
    });
    remember(key, p);
    return p;
  }
  function open(src, name) {
    var w = null;
    try { w = root.open('', '_blank'); } catch (e) {}   /* 先に窓を開く（取ってくる間に開くとブラウザに止められる） */
    return url(src, true).then(function (u) {
      if (!u) throw new Error('empty');
      if (w && !w.closed) { w.location.href = u; return; }
      var a = document.createElement('a'); a.href = u; a.download = name || 'file'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    }).catch(function (e) {
      try { if (w && !w.closed) w.close(); } catch (x) {}
      var st = e && e.status;
      var msg = (st === 401 || st === 403) ? 'このファイルを開く権限がありません' : st === 404 ? 'ファイルが見つかりません（消された可能性があります）' : 'ファイルを取ってこられませんでした（通信）';
      if (typeof root.showToast === 'function') root.showToast(msg); else if (root.console) console.warn('[CFFile]', msg, e);
    });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function img(src, attrs) { return '<img data-cf-src="' + esc(src) + '" alt=""' + (attrs ? ' ' + attrs : '') + '>'; }
  /* 描いた後に呼ぶ：<img data-cf-src> と <a data-cf-open> を差し替える */
  function fill(rootEl) {
    var el = rootEl || document;
    if (!el.querySelectorAll) return;
    Array.prototype.forEach.call(el.querySelectorAll('img[data-cf-src]'), function (im) {
      var s = im.getAttribute('data-cf-src'); im.removeAttribute('data-cf-src');
      url(s).then(function (u) { if (u) im.src = u; }, function () { im.classList.add('cf-file-gone'); im.alt = '（見られません）'; });
    });
    Array.prototype.forEach.call(el.querySelectorAll('a[data-cf-open]'), function (a) {
      if (a.__cfFile) return; a.__cfFile = true;
      a.addEventListener('click', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        open(a.getAttribute('data-cf-open'), a.getAttribute('data-cf-name') || '');
      });
    });
  }
  /* 同じ道に上書きした時に、覚えている古い中身を捨てる */
  function forget(src) {
    var path = pathOf(src);
    if (!path) return;
    /* 🔐 v1.3.2 枠・別タブ用（#inert）に覚えた物も一緒に捨てる（上書きした後に古い中身が開かないように） */
    [path, path + '#inert'].forEach(function (key) {
      var p = CACHE[key];
      if (!p) return;
      delete CACHE[key]; ORDER = ORDER.filter(function (x) { return x !== key; });
      p.then(function (x) { try { if (/^blob:/.test(x)) URL.revokeObjectURL(x); } catch (e) {} }, function () {});
    });
  }
  /* ---------- 🛡 v1.1.0 見張り（auto）：画面に出てきた「鍵つきの住所」を、その場で差し替える ----------
     描く所が多いアプリ（CoreBoard・CoreNote・MHS・写真）を1か所ずつ書き換えないための仕掛け。
     ・<img src>・<iframe src>・SVG の <image href>・style の background-image ＝取ってきた中身（blob:）に差し替える
     ・<a href> ＝押すと CFFile が開く（download 付きは中身を取ってから保存）。鍵つきの住所はアドレス欄に出ない
     ⚠ 差し替える前に、ブラウザが鍵つきの住所で読み始めることはある（今はそれでも見える）。鍵を効かなくした後は、差し替えた中身だけが見える */
  var STORE = 'firebasestorage.googleapis.com/v0/b/';
  function isStore(s) { return typeof s === 'string' && s.indexOf(STORE) >= 0 && pathOf(s) !== ''; }
  /* 写真がたくさん並ぶ画面（CarFlow の一覧など）で一度に全部取りに行かない＝画面に見えそうになった物から（300px 手前） */
  var IO = null;
  function whenNear(el, fn) {
    if (typeof IntersectionObserver === 'undefined') return fn();
    if (!IO) IO = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting && e.target.__cfNear) { var f = e.target.__cfNear; e.target.__cfNear = null; IO.unobserve(e.target); f(); } });
    }, { rootMargin: '300px' });
    el.__cfNear = fn; IO.observe(el);
  }
  /* 透明な絵（1×1）。鍵の無い住所は、読み込みが始まる前にこれに替えておく＝「読めなかった（onerror）」が先に来て、
     頭文字や四角に置き換えられてしまうのを防ぐ（顔写真・商品写真）。元の住所は data-cf-orig に残す */
  var BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  function hasKey(s) { return /[?&]token=/.test(String(s || '')); }
  function swapAttr(el, attr) {
    var v = el.getAttribute(attr);
    if (!isStore(v) || el.__cfSwap === v) return;
    el.__cfSwap = v;
    var tag = (el.tagName || '').toLowerCase();
    /* 🔐 v1.3.1（2026-10-20）置き場の鍵を外した＝古い鍵つきの住所も、そのままでは断られる。どちらも先に透明な絵に替えて、取ってきた中身を待つ */
    if (!hasKey(v) || root.CFFILE_KEYS_REVOKED !== false) {
      el.setAttribute('data-cf-orig', v);
      el.__cfHold = BLANK;
      if (tag === 'iframe') el.setAttribute(attr, 'about:blank'); else el.setAttribute(attr, BLANK);
    }
    var hold = el.getAttribute(attr);
    var go = function () { url(v, tag === 'iframe').then(function (u) { if (u && u !== v && el.getAttribute(attr) === hold) { el.__cfSwap = u; el.setAttribute(attr, u); } }, function () {}); };
    el.__cfGo = go;
    /* SVG の中の絵は測れないことがある＝すぐ。ほかは見えそうになってから */
    if (tag === 'image') go(); else whenNear(el, go);
  }
  /* 写しを作る・印刷する前に呼ぶ：root の中の置き場の絵を、見える所かどうかに関係なく全部取ってきて差し替え終えるまで待つ */
  function ready(rootEl) {
    var el = rootEl || (root.document && root.document.body);
    if (!el || !el.querySelectorAll) return Promise.resolve();
    scan(el);
    var ws = [];
    Array.prototype.forEach.call(el.querySelectorAll('img,iframe,image'), function (n) {
      var tag = (n.tagName || '').toLowerCase(), attr = tag === 'image' ? 'href' : 'src';
      var orig = n.getAttribute('data-cf-orig') || n.getAttribute(attr);
      if (!isStore(orig)) return;
      if (n.__cfNear && IO) { n.__cfNear = null; try { IO.unobserve(n); } catch (e) {} }
      ws.push(url(orig, tag === 'iframe').then(function (u) { if (u) { n.__cfSwap = u; n.setAttribute(attr, u); } }, function () {}));
    });
    return Promise.all(ws).then(function () {
      /* 差し替えた絵の読み込みも待つ（html2canvas などが空の絵を写さないように） */
      return Promise.all(Array.prototype.map.call(el.querySelectorAll('img'), function (im) {
        return (im.complete) ? null : new Promise(function (r) { im.addEventListener('load', r, { once: true }); im.addEventListener('error', r, { once: true }); setTimeout(r, 4000); });
      }));
    });
  }
  function swapBg(el) {
    var st = el.getAttribute('style') || '';
    if (st.indexOf(STORE) < 0) return;
    var m = /url\((['"]?)(https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^'")]+)\1\)/.exec(st);
    if (!m || el.__cfBg === m[2]) return;
    var orig = m[2]; el.__cfBg = orig;
    whenNear(el, function () {
      url(orig).then(function (u) {
        if (!u || u === orig) return;
        var now = el.getAttribute('style') || '';
        if (now.indexOf(orig) >= 0) el.setAttribute('style', now.split(orig).join(u));
      }, function () {});
    });
  }
  function guardLink(a) {
    var h = a.getAttribute('href');
    if (!isStore(h) || a.__cfLink) return;
    a.__cfLink = true;
    a.addEventListener('click', function (ev) {
      var src = a.getAttribute('data-cf-orig') || h;
      ev.preventDefault(); ev.stopPropagation();
      if (a.hasAttribute('download')) {
        url(src).then(function (u) { var t = document.createElement('a'); t.href = u; t.download = a.getAttribute('download') || ''; document.body.appendChild(t); t.click(); t.remove(); });
      } else open(src, a.getAttribute('download') || '');
    }, true);
    a.setAttribute('data-cf-orig', h); a.setAttribute('href', '#');
  }
  function scan(el) {
    if (!el || !el.querySelectorAll) return;
    var list = [];
    if (el.matches && el.matches('img,iframe,image,a,[style]')) list.push(el);
    Array.prototype.push.apply(list, el.querySelectorAll('img[src*="' + STORE + '"],iframe[src*="' + STORE + '"],a[href*="' + STORE + '"],[style*="' + STORE + '"],image'));
    list.forEach(function (n) {
      var tag = (n.tagName || '').toLowerCase();
      if (tag === 'img' || tag === 'iframe') swapAttr(n, 'src');
      else if (tag === 'image') { swapAttr(n, 'href'); swapAttr(n, 'xlink:href'); }
      else if (tag === 'a') guardLink(n);
      if (n.getAttribute && n.hasAttribute('style')) swapBg(n);
    });
  }
  var _auto = false;
  function auto(doc) {
    var d = doc || root.document;
    if (_auto || !d || typeof MutationObserver === 'undefined') return;
    _auto = true;
    var run = function () {
      scan(d.body);
      new MutationObserver(function (ms) {
        ms.forEach(function (m) {
          if (m.type === 'attributes') scan(m.target);
          else Array.prototype.forEach.call(m.addedNodes || [], function (n) { if (n.nodeType === 1) scan(n); });
        });
      }).observe(d.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'href', 'style'] });
    };
    if (d.body) run(); else d.addEventListener('DOMContentLoaded', run);
  }
  root.CFFile = { VERSION: VERSION, pathOf: pathOf, plainUrl: plainUrl, url: url, open: open, fill: fill, img: img, forget: forget, auto: auto, ready: ready, _blob: blob };
  /* 読み込んだアプリでは自動で見張る（止めたい画面は先に window.CFFILE_NO_AUTO = true） */
  if (root.document && !root.CFFILE_NO_AUTO) auto(root.document);
})(typeof window !== 'undefined' ? window : this);
