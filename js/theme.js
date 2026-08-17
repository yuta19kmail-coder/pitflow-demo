/* ========================================
   theme.js  -  PitFlow テーマ＆文字サイズ（CarFlow theme.js に準拠）
   ----------------------------------------
   ・4テーマ（dark / light / dark-liquid / light-liquid）＝data-theme
   ・文字サイズ3段（md / lg / xl）＝data-fontsize（body の zoom で拡大）
   ・localStorage 保存・起動時復元
   ・TOPバーのユーザー表示（アバター＋名前・今はサンプル/自分）
   ・同期ボタンは今はサンプル（本番ログイン後に有効化）
   ======================================== */
(function () {
  var THEME_KEY = 'pitflow_theme';
  var FONT_KEY = 'pitflow_fontsize';
  var DEFAULT_THEME = 'dark';
  var DEFAULT_FONT = 'md';
  var VALID_THEMES = ['dark', 'light', 'dark-liquid', 'light-liquid'];
  /* テーマの印（線画アイコンの名前）。絵文字はやめた＝色を持たないのでどのテーマでも浮かない。 */
  var THEME_ICON = { 'dark': 'moon', 'light': 'sun', 'dark-liquid': 'sparkle', 'light-liquid': 'gem' };
  var THEME_NAME = { 'dark': 'ダーク', 'light': 'ライト', 'dark-liquid': 'ダーク・リキッド', 'light-liquid': 'ライト・リキッド' };
  var FONT_ORDER = ['md', 'lg', 'xl'];
  var FONT_NAME = { md: '標準', lg: '大', xl: '特大' };

  // ---- トースト ----
  var _tt;
  /* 🔴 v1.110.0 第2引数＝エラー番号（PF-0412）。pitToast と同じ決めごと。 */
  function showToast(msg, code) {
    var t = document.getElementById('pf-toast');
    if (!t) { t = document.createElement('div'); t.id = 'pf-toast'; t.className = 'pf-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    if (code && window.CFErr) CFErr.toast(t, code);   /* 2行目の右端に error：PF-0412 */
    t.classList.add('show'); clearTimeout(_tt); _tt = setTimeout(function () { t.classList.remove('show'); }, 1700);
  }
  window.showToast = window.showToast || showToast;
  if (!window.pitToast) window.pitToast = showToast;

  // ---- テーマ ----
  function setTheme(theme) {
    var t = VALID_THEMES.indexOf(theme) >= 0 ? theme : DEFAULT_THEME;
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    refreshThemeUI();
    showToast(THEME_NAME[t] + ' に切替えました');
  }
  window.setTheme = setTheme;
  // 4テーマ循環（dark → light → dark-liquid → light-liquid）
  function cycleTheme() {
    var cur = document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
    var i = VALID_THEMES.indexOf(cur); if (i < 0) i = 0;
    setTheme(VALID_THEMES[(i + 1) % VALID_THEMES.length]);
  }
  window.cycleTheme = cycleTheme;
  // dark/light の反転（リキッドは維持）＝旧 toggleTheme 互換
  window.toggleTheme = function () {
    var cur = document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
    var isLight = cur === 'light' || cur === 'light-liquid';
    var isLiquid = cur.indexOf('-liquid') >= 0;
    setTheme((isLight ? 'dark' : 'light') + (isLiquid ? '-liquid' : ''));
  };

  function refreshThemeUI() {
    var cur = document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
    var b = document.getElementById('tb-theme-cycle');
    if (b) { b.innerHTML = (window.ico ? ico(THEME_ICON[cur] || 'moon', 17) : ''); b.title = 'テーマ切替（現在：'+ (THEME_NAME[cur] || '') + '）'; b.setAttribute('aria-label', 'テーマ切替。現在：'+ (THEME_NAME[cur] || '')); }
  }

  // ---- 文字サイズ ----
  function setFontSize(size) {
    var s = FONT_ORDER.indexOf(size) >= 0 ? size : 'md';
    document.documentElement.setAttribute('data-fontsize', s);
    try { localStorage.setItem(FONT_KEY, s); } catch (e) {}
    refreshFontUI();
    showToast('文字サイズ：' + FONT_NAME[s]);
  }
  window.setFontSize = setFontSize;
  function refreshFontUI() {
    var cur = document.documentElement.getAttribute('data-fontsize') || DEFAULT_FONT;
    document.querySelectorAll('#tb-fontsize-group .tb-fontsize-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.fontsize === cur); });
  }

  function applyStored() {
    var theme = DEFAULT_THEME, font = DEFAULT_FONT;
    try {
      var t = localStorage.getItem(THEME_KEY); if (VALID_THEMES.indexOf(t) >= 0) theme = t;
      var f = localStorage.getItem(FONT_KEY); if (FONT_ORDER.indexOf(f) >= 0) font = f;
    } catch (e) {}
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-fontsize', font);
  }
  applyStored();

  // ---- TOPバーのユーザー表示（アバター＋名前）----
  // 今は「自分」（付箋/個人BOXと共通の pitflow_bn_me）＝サンプル。本番ログイン後は本人に自動で紐づく。
  function currentUser() {
    /* 本番＝ログインした本人（CoreFlowの名簿の名前と写真）。写真はCoreMembersで登録したもの。 */
    var me = window.fb && window.fb.currentMember;
    if (me) {
      return {
        name: me.name || 'メンバー',
        initial: (me.ini || me.name || '？').trim().slice(0, 2) || '？',
        photo: me.photo || ''
      };
    }
    /* サンプル＝付箋や個人BOXと同じ「自分」 */
    var staff = (window.state && state.staff) || [];
    var id = null; try { id = localStorage.getItem('pitflow_bn_me'); } catch (e) {}
    var m = staff.find(function (s) { return s.id === id; }) || staff.find(function (s) { return s.front; }) || staff[0];
    var name = (window.pitCurrentStaffName && pitCurrentStaffName()) || (m && m.name) || 'ゲスト';
    return { name: name, initial: (name || '？').trim().slice(0, 2) || '？', photo: (m && m.photo) || '' };
  }
  window.pitRenderTopUser = function () {
    var u = currentUser();
    var av = document.getElementById('tb-avatar');
    if (av) {
      av.textContent = u.initial;                  /* まず頭文字。写真が読めたら差し替わる */
      if (u.photo) {
        /* ⚠ HTMLの文字列で組むと、写真のURLに引用符が入った時に壊れる。
              部品として作って差し込む（読めなかったら頭文字のまま残す）。 */
        var img = document.createElement('img');
        img.alt = '';
        img.onload = function () { av.textContent = ''; av.appendChild(img); };
        img.onerror = function () { av.textContent = u.initial; };
        img.src = u.photo;
      }
    }
    var nm = document.getElementById('tb-username'); if (nm) nm.textContent = u.name;
  };

  // ---- 同期（サンプル）----
  window.pitSyncSample = function () {
    showToast('同期はサンプルです（本番のGoogleログイン＋クラウド保存の接続後に有効になります）', 'PF-0040');
  };

  function initUI() { refreshThemeUI(); refreshFontUI(); if (window.pitRenderTopUser) pitRenderTopUser(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUI); else initUI();
})();
