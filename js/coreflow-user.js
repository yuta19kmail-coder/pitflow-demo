/* ============================================================
   coreflow-user.js ── 全アプリ共通「ヘッダー右の 自分（写真＋フルネーム）」（2026-09-29・ゆうた指定）
   ------------------------------------------------------------
   ◎きっかけ
     🗣「ヘッダー右は表示名ではなくフルネームだよ　ヘッダー部分は共通部品にしちゃった方が早いのでは？？」
     🗣「写真がないときは頭文字にして」
     🗣「ポータルとテンプレには同期ランプは要らない
     　　だからあくまで個別の共通部品にして、並べた方が効率的なのでは？」
     ＝ ヘッダー右は **個別の共通部品を各アプリが並べる**。
        ・自分（写真＋フルネーム） … この部品
        ・同期ランプ               … coreflow-sync.js（要らないアプリは読まない）
        ・⏻ 電源                   … coreflow-power.js
        ＝ **並び・置き場・見た目の大きさはアプリ側**。「誰をどう出すか」だけがここ。

   ◎🔴 決まり（ここだけに書く。アプリ側で名前・写真を決めない）
     名前 ＝ **フルネーム**＝CoreFlow の名簿（portalMembers）の name
             → 無ければ Google の名前 → メールの@の前 → 「ユーザー」
             ⚠ 呼び名（CoreMembers の dispName）は **使わない**（2026-09-29 CarFlow v3.3.0 で使って直された）
     写真 ＝ CoreFlow の名簿の写真（photo → photoURL → customPhotoURL・https か data: だけ）
             → 🔴 **無ければ頭文字**。Google の写真には落とさない（ゆうた指定）
             → 写真が読めなかった時（リンク切れ）も頭文字に戻す
     頭文字 ＝ 名簿の ini があればそれ。無ければ名前の頭2文字（空白は詰める）。
              英字の名前は単語の頭文字2つ（例 Yuta Kobayashi → YK）

   ◎使い方（アプリ側）
     CFUser.paint({ av:'u-av', name:'u-name', member: 名簿の人, user: Googleのuser });
       av / name は id か要素。どちらか片方だけでもよい。何度呼んでもよい（上書き）。
     CFUser.fullName(member, user) / CFUser.photo(member) / CFUser.initials(name, member)
       … 名前だけ・写真だけが欲しい所で使う（ヘッダー以外で同じ決まりにしたい時）

   ◎⚠ 本体はここ（_shared）。アプリの js\coreflow-user.js は配られた写し。直したら sync-shared.ps1。
   ============================================================ */
(function () {
  'use strict';

  function _s(v) { return String(v == null ? '' : v).trim(); }

  function fullName(member, user) {
    var m = member || {}, u = user || {};
    var email = _s(m.email) || _s(u.email);
    return _s(m.name) || _s(u.displayName) || (email ? email.split('@')[0] : '') || 'ユーザー';
  }

  function _okUrl(v) { v = _s(v); return /^(https?:|data:image\/)/i.test(v) ? v : ''; }

  function photo(member) {
    var m = member || {};
    return _okUrl(m.photo) || _okUrl(m.photoURL) || _okUrl(m.customPhotoURL) || '';
  }

  function initials(name, member) {
    var ini = _s(member && member.ini);
    if (ini) return ini;
    var t = _s(name);
    if (!t) return '?';
    var words = t.match(/[A-Za-z]+/g);
    if (words && words.length >= 2 && /^[\sA-Za-z.\-']+$/.test(t)) return (words[0][0] + words[1][0]).toUpperCase();
    if (words && words.length === 1 && /^[A-Za-z]+$/.test(t)) return t.slice(0, 2).toUpperCase();
    return t.replace(/[\s　]/g, '').slice(0, 2);
  }

  function _el(x) { return (typeof x === 'string') ? document.getElementById(x) : (x || null); }

  function _paintAv(el, url, ini) {
    el.style.backgroundImage = '';
    el.style.color = '';
    el.textContent = '';
    el.setAttribute('data-cf-user', url ? 'photo' : 'ini');
    if (!url) { el.textContent = ini; return; }
    var img = document.createElement('img');
    img.alt = '';
    img.referrerPolicy = 'no-referrer';   // Google の写真はリファラー付きだと 403 になる（CarFlow v2.10.2 の教訓）
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block';
    img.onerror = function () { el.textContent = ini; el.setAttribute('data-cf-user', 'ini'); };
    img.src = url;
    el.appendChild(img);
  }

  function paint(o) {
    o = o || {};
    var nm = fullName(o.member, o.user);
    var av = _el(o.av), ne = _el(o.name);
    if (ne) { ne.textContent = nm; ne.title = nm; }
    if (av) { _paintAv(av, photo(o.member), initials(nm, o.member)); av.title = nm; }
    return nm;
  }

  window.CFUser = { paint: paint, fullName: fullName, photo: photo, initials: initials };
})();
