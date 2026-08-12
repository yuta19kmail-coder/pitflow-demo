/* =========================================================
   pit-icons.js  -  画面のアイコンを流し込む（PitFlow）
   ---------------------------------------------------------
   ・アイコンの絵そのものは js/coreflow-icons.js（全アプリ共通・_shared から配られたコピー）。
   ・画面の中では絵文字を使わず <i data-ic="名前"></i> と書く。
     このファイルが起動時と、あとから作られた所に、線画SVGを流し込む。
   ・大きさは data-ics="16" のように指定できる（省略＝16px）。
   ⚠ 絵文字に戻さないこと。絵文字は端末ごとに絵が違い、色も持っているので、
     テーマ（ダーク/ライト）を変えると浮いて見える。
   ========================================================= */
(function (w, d) {
  'use strict';

  var DEFAULT_SIZE = 16;

  /* 名前からSVGの文字列を作る（JS側でHTMLを組み立てる時に使う） */
  function ico(name, size) {
    return (w.IC ? w.IC(name, size || DEFAULT_SIZE) : '');
  }

  /* ---------------------------------------------------------
     絵文字 → アイコン名 の読み替え表
     ・保存済みデータ（フェーズの印・PIT枠の印・ダッシュボードの箱の印など）は
       いままで絵文字の文字そのものを持っている。**データは書き換えない**。
     ・描く時にこの表で線画アイコンに読み替える＝古い保存のままでも新しい見た目になる。
     ・表に無い文字は、そのまま出す（ゆうたが自分で入れた文字を消さないため）。
     --------------------------------------------------------- */
  var EMOJI_IC = {
    '🚗':'car','🚙':'van','🚐':'van','🛞':'tire','🏭':'factory','🅿':'parking','🅿️':'parking',
    '📅':'calendar','🗓':'calendar','🗓️':'calendar','📆':'calendar','🕒':'clock','🕐':'clock','🕗':'clock','🕘':'clock','⏰':'clock','⏱':'clock',
    '📞':'phone','☎':'phone','☎️':'phone','📱':'smartphone','💬':'comment','🗣':'comment','🗣️':'comment',
    '🔧':'wrench','🛠':'wrench','🛠️':'wrench','⚙':'settings','⚙️':'settings','🎛':'sliders','🎛️':'sliders','🧰':'briefcase',
    '✅':'check','✔':'check','☑':'check','✕':'close','✖':'close','❌':'close','⚠':'warn','⚠️':'warn','🚨':'warn','🚧':'cone',
    '✏':'pencil','✏️':'pencil','📝':'pencil','🗑':'trash','🗑️':'trash','🧽':'drop','💧':'drop',
    '🔍':'search','🔎':'search','🔦':'search','🌍':'globe','🌏':'globe','🎌':'flag','🚩':'flag','🏁':'flag',
    '📤':'upload','📥':'download','💾':'save','🔄':'refresh','🔁':'refresh','🔗':'link','📎':'paperclip',
    '📋':'clipboard','📇':'card','📄':'file','📃':'file','🧾':'receipt','📂':'folderOpen','🗂':'folder','🗂️':'folder','📁':'folder',
    '🤝':'external','📦':'box','🚫':'ban','🛑':'ban','🔒':'lock','🔓':'unlock',
    '👤':'user','🧑':'user','🚶':'user','👥':'users','🧑‍🔧':'user','👨‍🔧':'user',
    '🏠':'home','🌅':'sunrise','🌇':'sunrise','☀':'sun','☀️':'sun','🌙':'moon','🏖':'parasol','🏖️':'parasol',
    '📊':'chart','📈':'chart','🧮':'calculator','💴':'money','💰':'money','💵':'money','🛒':'cart',
    '📌':'pin','🗒':'sticky','🗒️':'sticky','🏷':'tag','🏷️':'tag','📜':'history','🕘＋':'history',
    '📣':'megaphone','📢':'megaphone','🔔':'bell','🖨':'printer','🖨️':'printer','🖥':'monitor','🖥️':'monitor',
    '❓':'help','📖':'book','📘':'book','💡':'bulb','🤖':'robot','✨':'sparkle','🧪':'flask','🎲':'dice',
    '🎨':'palette','💎':'gem','🧩':'puzzle','🔥':'fire','⭐':'star','🌟':'star','👍':'thumbUp',
    '📍':'location','📐':'ruler','📏':'ruler','🔤':'textT','🔢':'numbers','🏢':'building','🏪':'shop',
    '⏳':'hourglass','⌛':'hourglass'   /* v1.15.1 追加（内容テンプレの「預かり期間」で使う） */
  };
  /* 色つきの丸・四角（色そのものが意味を持つので、色は別に付ける） */
  var EMOJI_DOT = {
    '🔴':'#ef4444','🟥':'#ef4444','🟠':'#f97316','🟧':'#f97316','🟡':'#eab308','🟨':'#eab308',
    '🟢':'#22c55e','🟩':'#22c55e','🔵':'#3b82f6','🟦':'#3b82f6','🟣':'#a855f7','🟪':'#a855f7',
    '⚫':'#475569','⬛':'#475569','⚪':'#cbd5e1','⬜':'#cbd5e1','🟤':'#92400e','🟫':'#92400e'
  };

  /* 数字の絵文字（1️⃣2️⃣…）は、四角に数字の印にする */
  var EMOJI_NUM = { '0\uFE0F\u20E3':'0','1\uFE0F\u20E3':'1','2\uFE0F\u20E3':'2','3\uFE0F\u20E3':'3','4\uFE0F\u20E3':'4','5\uFE0F\u20E3':'5','6\uFE0F\u20E3':'6','7\uFE0F\u20E3':'7','8\uFE0F\u20E3':'8','9\uFE0F\u20E3':'9','\uD83D\uDD1F':'10' };

  /* 保存データに入っている絵文字（または最初からアイコン名）を、線画アイコンにして返す */
  function icoE(v, size) {
    if (!v) return '';
    var s = String(v);
    if (EMOJI_NUM[s]) return '<b class="ic-num">' + EMOJI_NUM[s] + '</b>';
    if (EMOJI_DOT[s]) return '<span style="color:' + EMOJI_DOT[s] + '">' + ico('dot', size || 12) + '</span>';
    var n = EMOJI_IC[s];
    if (n) return ico(n, size);
    if (w.IC && w.IC.has(s)) return ico(s, size);
    return s;   /* 知らない文字はそのまま出す（消さない） */
  }

  /* =====================================================================
     v1.15.1  icoText(文字列) … 「保存データの文字」を安全に描くための入口
     ---------------------------------------------------------------------
     🔴 なぜ要るか（2026-08-02 の不具合）
       設定に保存される文字（駐車場の置き場の名前・内容テンプレの見出し）に、
       アイコン化のときうっかり `<i data-ic=wrench ...></i>` という**HTMLの文字列そのもの**が
       入ってしまい、画面には esc() を通して出すので **タグが文字として表示**されていた。
       （esc() は入力をそのまま文字にする＝ゆうたが打った `<` を守るための正しい処理。悪いのは中身の方）

     🔴 このやり方の約束
       ① まず必ず esc（＝打ち込まれた文字は絶対にHTMLとして動かさない）
       ② そのあとで「アイコンのタグに見える所」と「絵文字」だけを線画SVGに差し替える
       ③ **保存データは書き換えない**（描く時だけ直す）＝古い保存のままで直る
       ④ 表に無い文字はそのまま出す（ゆうたが自分で入れた文字を消さない）

     ⚠ 属性の中（value="..." title="..."）や <option> の中には使わないこと。SVGは入らない。
     ===================================================================== */
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* esc 済みの「<i data-ic=名前 data-ics=数>…</i>」に見えるもの */
  var TAG_RE = /&lt;i\s+data-ic=(?:&quot;|&#39;)?([A-Za-z0-9_-]+)(?:&quot;|&#39;)?(?:\s+data-ics=(?:&quot;|&#39;)?(\d+)(?:&quot;|&#39;)?)?\s*\/?&gt;(?:\s*&lt;\s*\/\s*i\s*&gt;)?/g;
  /* 絵文字1つぶん（囲み数字 1️⃣ ・異体字セレクタ単体も拾う） */
  var EMO_RE = /[0-9#*]️⃣|[\uD83C-\uD83E][\uDC00-\uDFFF]️?⃣?|[←-⇿⌀-➿⬀-⯿]️?|️/g;

  function icoText(v, size) {
    if (v == null || v === '') return '';
    var s = escHtml(v);
    s = s.replace(TAG_RE, function (m, name, sz) {
      /* ⚠ 知らないアイコン名は**いじらず元のまま**。IC() は知らない名前だと
            「点線の四角（ic-miss）」を返すので、ここで has を見ないと文字が消えて原因が分からなくなる。 */
      if (!(w.IC && w.IC.has && w.IC.has(name))) return m;
      return ico(name, +(sz || size || DEFAULT_SIZE));
    });
    s = s.replace(EMO_RE, function (m) {
      if (m === '️') return '';   /* 異体字セレクタ単体は落とす */
      var out = icoE(m, size);
      return (out && out !== m) ? out : m;
    });
    return s;
  }

  /* <i data-ic="名前"> の中身を1個ぶん埋める */
  function fill(el) {
    if (!el || el.getAttribute('data-icd') === '1') return;
    el.setAttribute('data-icd', '1');
    el.innerHTML = ico(el.getAttribute('data-ic'), +(el.getAttribute('data-ics') || DEFAULT_SIZE));
  }

  /* まとめて埋める（root の中を全部） */
  function icoBoot(root) {
    var r = root || d;
    if (r.nodeType === 1 && r.hasAttribute && r.hasAttribute('data-ic')) fill(r);
    if (!r.querySelectorAll) return;
    var list = r.querySelectorAll('i[data-ic]:not([data-icd]),span[data-ic]:not([data-icd]),[data-ic]:not([data-icd])');
    for (var i = 0; i < list.length; i++) fill(list[i]);
  }

  /* あとから作られた所にも自動で流し込む。
     ⚠ 画面をまるごと描き直す作りなので、追加された所だけを見る（全体走査はしない）。
        まとめて1回にするため requestAnimationFrame で束ねる。 */
  var pending = [], timer = null;
  function flush() {
    timer = null;
    var list = pending; pending = [];
    for (var i = 0; i < list.length; i++) icoBoot(list[i]);
  }
  function watch() {
    if (!w.MutationObserver) return;
    new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var added = recs[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1) pending.push(added[j]);
        }
      }
      if (pending.length && !timer) timer = (w.requestAnimationFrame || setTimeout)(flush, 16);
    }).observe(d.documentElement, { childList: true, subtree: true });
  }

  w.ico = ico;
  w.pitIco = ico;
  w.icoE = icoE;
  w.icoText = icoText;   /* v1.15.1：保存データの文字を「esc してから」アイコン化する */
  w.icoBoot = icoBoot;
  w.PIT_EMOJI_IC = EMOJI_IC;

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', function () { icoBoot(); watch(); });
  else { icoBoot(); watch(); }
})(window, document);
